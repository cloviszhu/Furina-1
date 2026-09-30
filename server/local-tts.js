import { readFile, realpath, stat } from 'node:fs/promises';
import { join, resolve, sep, isAbsolute } from 'node:path';

const MAX_AUDIO = 16 * 1024 * 1024;
const EMOTIONS = new Set(['neutral', 'happy', 'sad', 'angry', 'calm', 'surprised']);
const abortError = () => Object.assign(new Error('语音已取消。'), { name: 'AbortError' });
const fault = (message, status = 400) => Object.assign(new Error(message), { status });

export function localEndpoint(value) {
  let url;
  try { url = new URL(value); } catch { throw fault('TTS 地址无效。'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw fault('TTS 只允许数字 loopback HTTP 根地址。');
  }
  return url.origin;
}

export function validateWav(wav, { minSeconds = 0, maxSeconds = 60 } = {}) {
  if (!Buffer.isBuffer(wav) || wav.length < 44 || wav.length > MAX_AUDIO || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE' || wav.readUInt32LE(4) + 8 !== wav.length) throw fault('TTS 返回无效或超限 WAV。', 502);
  let format, data;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const id = wav.toString('ascii', offset, offset + 4), size = wav.readUInt32LE(offset + 4), start = offset + 8;
    if (start + size > wav.length) throw fault('TTS WAV 内容不完整。', 502);
    if (id === 'fmt ' && size >= 16) {
      if (format) throw fault('TTS WAV 格式块重复。', 502);
      format = { code: wav.readUInt16LE(start), channels: wav.readUInt16LE(start + 2), rate: wav.readUInt32LE(start + 4), byteRate: wav.readUInt32LE(start + 8), align: wav.readUInt16LE(start + 12), bits: wav.readUInt16LE(start + 14) };
    }
    if (id === 'data') { if (data !== undefined) throw fault('TTS WAV 音频块重复。', 502); data = size; }
    offset = start + size + (size % 2);
  }
  if (!format || !data || format.code !== 1 || format.bits !== 16 || ![1, 2].includes(format.channels) || format.rate < 8000 || format.rate > 96000 || format.align !== format.channels * 2 || format.byteRate !== format.rate * format.align || data % format.align || data / format.align / format.rate > maxSeconds || data / format.align / format.rate < minSeconds) throw fault('TTS 需要时长范围内的 PCM16 WAV。', 502);
  return wav;
}

async function readAudio(response) {
  if (!response.ok || !response.headers.get('content-type')?.startsWith('audio/')) throw fault('本地 TTS 未成功返回音频。', 502);
  if (Number(response.headers.get('content-length')) > MAX_AUDIO) throw fault('TTS 音频过大。', 502);
  const chunks = []; let size = 0;
  if (!response.body) throw fault('TTS 响应为空。', 502);
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_AUDIO) throw fault('TTS 音频过大。', 502);
    chunks.push(chunk);
  }
  return validateWav(Buffer.concat(chunks));
}

export async function loadTtsConfig(dataDir) {
  const filename = join(dataDir, 'tts-config.json');
  let content;
  try { if ((await stat(filename)).size > 32000) throw fault('TTS 配置过大。'); content = await readFile(filename, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const config = JSON.parse(content);
  config.endpoint = localEndpoint(config.endpoint);
  if (!Array.isArray(config.profiles) || config.profiles.length > 12) throw fault('TTS 声音登记无效。');
  const root = await realpath(join(dataDir, 'tts-references'));
  const ids = new Set();
  for (const profile of config.profiles) {
    if (!/^[a-z0-9_-]{1,40}$/.test(profile.id) || ids.has(profile.id) || typeof profile.label !== 'string' || profile.label.length > 100 || profile.usageAllowed !== true || !profile.source?.trim() || !profile.license?.trim()) throw fault('参考录音必须有唯一 ID、来源和允许使用的许可登记。');
    ids.add(profile.id);
    if (!profile.references || !profile.references.neutral || Object.keys(profile.references).length > 6) throw fault('参考录音需要 neutral 表达。');
    for (const [emotion, reference] of Object.entries(profile.references)) {
      if (!EMOTIONS.has(emotion) || !reference || typeof reference.file !== 'string' || isAbsolute(reference.file) || !['zh', 'en', 'ja', 'ko', 'yue'].includes(reference.language) || typeof reference.text !== 'string' || !reference.text.trim() || reference.text.length > 1000) throw fault('表达参考配置无效。');
      const file = await realpath(resolve(root, reference.file));
      if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) throw fault('参考录音不能越过本地登记目录。');
      // A registered reference must itself be bounded PCM, not an arbitrary file.
      if ((await stat(file)).size > MAX_AUDIO) throw fault('参考录音过大。');
      validateWav(await readFile(file), { minSeconds: 3, maxSeconds: 10 });
      reference.path = file;
    }
  }
  return config;
}

export class LocalTts {
  constructor(config, { fetchImpl = fetch, timeoutMs = 120000, maxPending = 3 } = {}) {
    this.config = config ? { ...config, endpoint: localEndpoint(config.endpoint) } : null; this.fetch = fetchImpl; this.timeoutMs = timeoutMs; this.maxPending = maxPending;
    this.queue = []; this.active = false; this.quarantined = false;
  }
  voices() {
    return (this.config?.profiles || []).map(profile => ({ id: profile.id, name: profile.label, engine: 'gpt-sovits', localService: true, language: 'zh', emotions: Object.keys(profile.references), source: profile.source, license: profile.license }));
  }
  async status() {
    if (!this.config) return { ready: false, error: '成熟 TTS 未登记；请按 docs/local-tts.md 登记许可参考并重启项目。系统声音仍是临时备用。', voices: [] };
    if (this.quarantined) return { ready: false, error: 'TTS 超时后已隔离；请重启本地 TTS 和项目服务。', voices: [] };
    // The upstream async route performs synchronous model work, so its health
    // probe can be blocked while synthesizing. An owned active slot is busy.
    if (this.active) return { ready: true, error: null, voices: this.voices(), active: true, pending: this.queue.length, cancel: '停止播放与投递；上游计算完成后释放队列', stream: false };
    try {
      const response = await this.fetch(`${this.config.endpoint}/openapi.json`, { redirect: 'error', signal: AbortSignal.timeout(1500) });
      if (!response.ok) throw new Error();
      const schema = await response.json();
      if (!schema.paths?.['/tts']?.post) throw new Error();
      return { ready: this.voices().length > 0, error: this.voices().length ? null : '尚无许可明确的参考录音。', voices: this.voices(), active: this.active, pending: this.queue.length, cancel: '停止播放与投递；上游计算完成后释放队列', stream: false };
    } catch { return { ready: false, error: '本地 GPT-SoVITS 未运行或不可达；请运行 .runtime/tts-venv/Scripts/python.exe scripts/run-local-tts.py，再刷新声音。', voices: [] }; }
  }
  synthesize({ text, referenceId, emotion = 'neutral', speed = 1, signal }) {
    if (!this.config || this.quarantined) return Promise.reject(fault('本地 TTS 未配置或已隔离。', 503));
    const profile = this.config.profiles.find(p => p.id === referenceId);
    const reference = profile?.references[emotion];
    if (!reference || !EMOTIONS.has(emotion)) return Promise.reject(fault('未登记声音或表达，未调用 TTS。'));
    if (typeof text !== 'string' || !text.trim() || text.length > 300 || /\[[a-z\u4e00-\u9fff][a-z\u4e00-\u9fff\s_-]{0,40}\]|<\/?[a-z][^>]{0,80}>/i.test(text)) return Promise.reject(fault('朗读文本必须是 300 字以内的正文，表达请用独立字段。'));
    if (!Number.isFinite(speed) || speed < .7 || speed > 1.3) return Promise.reject(fault('语速必须在 0.7–1.3 之间。'));
    if (signal?.aborted) return Promise.reject(abortError());
    if (this.queue.length >= this.maxPending) return Promise.reject(fault('语音队列已满，请稍后再试。', 429));
    return new Promise((resolve, reject) => {
      const job = { text, reference, speed, resolve, reject, cancelled: false };
      job.abort = () => {
        job.cancelled = true; reject(abortError());
        const index = this.queue.indexOf(job);
        if (index >= 0) { this.queue.splice(index, 1); job.cleanup(); }
      };
      job.cleanup = () => signal?.removeEventListener('abort', job.abort);
      signal?.addEventListener('abort', job.abort, { once: true });
      this.queue.push(job); void this.pump();
    });
  }
  async pump() {
    if (this.active) return;
    this.active = true;
    while (this.queue.length) {
      const job = this.queue.shift();
      if (this.quarantined) { job.cleanup(); job.reject(fault('TTS 已隔离，请重启。', 503)); continue; }
      const controller = new AbortController();
      const timeout = setTimeout(() => { this.quarantined = true; controller.abort(); }, this.timeoutMs);
      try {
        const response = await this.fetch(`${this.config.endpoint}/tts`, {
          method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ text: job.text, text_lang: 'zh', ref_audio_path: job.reference.path, prompt_text: job.reference.text, prompt_lang: job.reference.language, text_split_method: 'cut5', batch_size: 1, parallel_infer: false, speed_factor: job.speed, seed: 42, media_type: 'wav', streaming_mode: false }),
        });
        const audio = await readAudio(response);
        if (!job.cancelled) job.resolve(audio);
      } catch { if (!job.cancelled) job.reject(fault(this.quarantined ? 'TTS 生成超时；已隔离队列，请重启。' : '本地 TTS 失败；没有自动切换系统声。', 502)); }
      finally { clearTimeout(timeout); job.cleanup(); }
    }
    this.active = false;
  }
}
