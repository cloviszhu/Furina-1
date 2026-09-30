import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rename, unlink, realpath, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { loadTtsConfig, validateWav } from './local-tts.js';
import { ReferenceDeletions } from './reference-deletions.js';

export const MAX_REFERENCE_BYTES = 4 * 1024 * 1024;
const fault = (message, status = 400) => Object.assign(new Error(message), { status });
const EMOTIONS = ['neutral', 'calm', 'happy', 'sad', 'angry', 'surprised'];
const LANGUAGES = ['zh', 'en', 'ja', 'ko', 'yue'];
const field = (value, label, max) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw fault(`${label}不能为空且最多 ${max} 字。`);
  return value.trim();
};
const idField = (value, label) => {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(value)) throw fault(`${label}需要 1–40 位小写字母、数字、下划线或短横线。`);
  return value;
};

export function inspectReference(input) {
  if (!Buffer.isBuffer(input) || input.length > MAX_REFERENCE_BYTES) throw fault('参考录音最多 4 MiB。', 413);
  try { validateWav(input, { minSeconds: 3, maxSeconds: 10 }); }
  catch { throw fault('请选择 3–10 秒、8–96 kHz、单声道或双声道的 PCM16 WAV。其他格式请先在本机音频工具导出；不要只改扩展名。'); }
  let rate, channels, samples;
  for (let offset = 12; offset < input.length;) {
    if (offset + 8 > input.length) throw fault('WAV 尾部不完整。');
    const size = input.readUInt32LE(offset + 4), start = offset + 8, id = input.toString('ascii', offset, offset + 4);
    if (id === 'fmt ') { channels = input.readUInt16LE(start + 2); rate = input.readUInt32LE(start + 4); }
    if (id === 'data') samples = input.subarray(start, start + size);
    offset = start + size + size % 2;
    if (offset > input.length) throw fault('WAV 填充块不完整。');
  }
  const frames = samples.length / (channels * 2), mono = new Float32Array(frames);
  let energy = 0, peak = 0, clipped = 0, silent = 0;
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel++) {
      const sample = samples.readInt16LE((frame * channels + channel) * 2) / 32768;
      peak = Math.max(peak, Math.abs(sample)); if (Math.abs(sample) >= .999) clipped++;
      sum += sample;
    }
    mono[frame] = sum / channels; energy += mono[frame] ** 2;
    if (Math.abs(mono[frame]) < .0032) silent++;
  }
  const rms = Math.sqrt(energy / frames), silenceRatio = silent / frames, clippedRatio = clipped / (frames * channels);
  if (rms < .0032 || silenceRatio > .95) throw fault('录音接近静音或双声道相互抵消，请选择清楚的人声录音。');
  if (clipped) throw fault(`检测到 ${clipped} 个满幅削波采样，请降低录音增益后重新录制。`);
  // Only attenuate high peaks: never boost low-level noise to sound acceptable.
  const count = Math.round(frames / rate * 32000), converted = new Float32Array(count);
  let convertedPeak = 0;
  for (let i = 0; i < count; i++) {
    const position = i * rate / 32000, left = Math.min(frames - 1, Math.floor(position));
    let value;
    if (rate > 32000) {
      // Windowed-sinc low-pass avoids folding high frequencies into speech.
      const cutoff = .45 * 32000 / rate;
      let sum = 0, weightSum = 0;
      for (let k = left - 16; k <= left + 16; k++) {
        if (k < 0 || k >= frames) continue;
        const distance = position - k;
        if (Math.abs(distance) > 16) continue;
        const sinc = Math.abs(distance) < 1e-8 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * distance) / (Math.PI * distance);
        const weight = sinc * (.5 + .5 * Math.cos(Math.PI * distance / 16));
        sum += mono[k] * weight; weightSum += weight;
      }
      value = sum / weightSum;
    } else value = mono[left] + (mono[Math.min(frames - 1, left + 1)] - mono[left]) * (position - left);
    converted[i] = value; convertedPeak = Math.max(convertedPeak, Math.abs(value));
  }
  const gain = Math.max(peak, convertedPeak) > .9 ? .9 / Math.max(peak, convertedPeak) : 1;
  const wav = Buffer.alloc(44 + count * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(32000, 24); wav.writeUInt32LE(64000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) {
    wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(converted[i] * gain * 32768))), 44 + i * 2);
  }
  return { wav, report: { bytes: input.length, seconds: frames / rate, inputRate: rate, inputChannels: channels, outputRate: 32000, outputChannels: 1,
    peak, rmsDb: Math.round(20 * Math.log10(rms) * 10) / 10, silenceRatio, clippedRatio, gain,
    warnings: [rms < .02 ? '音量偏低，未放大噪声；建议重新录制。' : '', silenceRatio > .65 ? '静音比例偏高，请核对人声和转写。' : '', '机器未验证噪声、听感、声纹身份或角色相似度。'].filter(Boolean) } };
}

export class ReferenceImports {
  constructor(dataDir, tts, { now = Date.now } = {}) { this.dataDir = dataDir; this.tts = tts; this.now = now; this.pending = new Map(); this.committing = false; this.deletions = new ReferenceDeletions(this); }
  prune() { for (const [id, entry] of this.pending) if (entry.expiresAt <= this.now()) this.pending.delete(id); }
  prepare(wav) {
    this.prune();
    if (this.pending.size >= 3) throw fault('已有三个待确认录音，请先确认、放弃或等待十分钟过期。', 429);
    const entry = { ...inspectReference(wav), expiresAt: this.now() + 600000 }, token = randomUUID();
    this.pending.set(token, entry);
    return { token, expiresAt: entry.expiresAt, report: entry.report, previewUrl: `/api/reference-imports/${token}/audio` };
  }
  get(token) { this.prune(); const entry = this.pending.get(token); if (!entry) throw fault('预览已过期或已确认，请重新选取录音。', 404); return entry; }
  discard(token) { this.pending.delete(token); }
  list() {
    return (this.tts.config?.profiles || []).map(p => ({ id: p.id, label: p.label, speakerId: p.speakerId || null, managed: p.managed === true, emotions: Object.keys(p.references) }));
  }
  async confirm(token, input) {
    if (this.committing || this.tts.active || this.tts.queue?.length) throw fault('TTS 或登记正在处理，请停止播放并等待生成队列释放后再确认。', 409);
    const entry = this.get(token);
    if (input.usageAllowed !== true || input.previewConfirmed !== true || input.sameSpeakerConfirmed !== true) throw fault('请先试听，并确认录音使用权和同说话人归属。');
    const profileId = idField(input.profileId, '声线 ID'), speakerId = idField(input.speakerId, '说话人 ID');
    const label = field(input.label, '声线名称', 100), source = field(input.source, '来源', 500), license = field(input.license, '使用许可', 500);
    const text = field(input.text, '准确转写', 1000);
    if (!EMOTIONS.includes(input.emotion) || !LANGUAGES.includes(input.language)) throw fault('请选择支持的语言与表达。');
    const config = this.tts.config ? structuredClone(this.tts.config) : { endpoint: 'http://127.0.0.1:9880', profiles: [] };
    let profile = config.profiles.find(p => p.id === profileId);
    if (profile && (!profile.managed || !profile.speakerId || profile.speakerId !== speakerId)) throw fault('不能向未登记说话人的测试声线或其他说话人的声线追加录音。请新建声线 ID。');
    if (!profile && (config.profiles.length >= 12 || input.emotion !== 'neutral')) throw fault('新声线须从 neutral 录音开始；最多十二份声线。');
    if (!profile) { profile = { id: profileId, label, speakerId, managed: true, source, license, usageAllowed: true, references: {} }; config.profiles.push(profile); }
    const file = `import-${randomUUID()}.wav`, root = join(this.dataDir, 'tts-references');
    profile.references[input.emotion] = { file, text, language: input.language, source, license, speakerId, importedAt: new Date(this.now()).toISOString() };
    // Keep all per-reference rights; do not relabel an existing profile silently.
    for (const p of config.profiles) for (const r of Object.values(p.references)) delete r.path;
    this.committing = true;
    let target, temp;
    try {
      await mkdir(root, { recursive: true });
      const canonicalData = await realpath(this.dataDir), canonicalRoot = await realpath(root);
      if (!canonicalRoot.startsWith(canonicalData + sep)) throw fault('参考目录越界，已拒绝写入。', 403);
      target = join(canonicalRoot, file);
      await writeFile(target, entry.wav, { flag: 'wx' });
      const destination = join(this.dataDir, 'tts-config.json');
      try { const canonical = await realpath(destination); if (canonical !== resolve(destination) || !(await stat(canonical)).isFile()) throw fault('参考配置路径无效。'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      temp = join(this.dataDir, `tts-config-${randomUUID()}.tmp`);
      await writeFile(temp, JSON.stringify(config, null, 2), { flag: 'wx' });
      const validated = await loadTtsConfig(this.dataDir, temp);
      await rename(temp, destination); temp = null;
      this.tts.config = validated;
      this.pending.delete(token);
      return { profileId, emotion: input.emotion, profiles: this.list() };
    } catch (error) { if (temp) await unlink(temp).catch(() => {}); if (target) await unlink(target).catch(() => {}); throw error; }
    finally { this.committing = false; }
  }
  close() { this.pending.clear(); }
}
