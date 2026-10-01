const MAX_BYTES = 8 * 1024 * 1024;
const MIMES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];
const MESSAGES = {
  runtime_unavailable: '本地转写运行时不可用，请继续文字输入。', busy: '本地转写正在处理另一段录音，请稍后重试。',
  audio_size: '录音为空或超过大小上限，请缩短后重试。', audio_too_long: '录音超过 30 秒，请缩短后重试。',
  audio_format: '浏览器音频格式不受支持，请继续文字输入。', timeout: '本地转写超时，请缩短录音后重试。',
  cancelled: '录音已取消。', empty_or_large_draft: '未识别到可用草稿，请重试或直接输入文字。',
};

export class RecordingController {
  constructor({ getUserMedia = options => navigator.mediaDevices.getUserMedia(options), Recorder = globalThis.MediaRecorder,
    fetchImpl = (...args) => fetch(...args), onState = () => {}, stopPlayback = () => {}, getDraft = () => '', applyDraft = () => {},
    canStart = () => true, uuid = () => crypto.randomUUID(), maxMs = 30000 } = {}) {
    Object.assign(this, { getUserMedia, Recorder, fetchImpl, onState, stopPlayback, getDraft, applyDraft, canStart, uuid, maxMs });
    this.state = 'idle'; this.generation = 0; this.revision = 0; this.disposed = false;
  }
  set(state, message) { this.state = state; this.onState({ state, message }); }
  edited() { ++this.revision; }
  get active() { return ['requesting', 'recording', 'transcribing'].includes(this.state); }
  closeTracks() { this.stream?.getTracks().forEach(track => track.stop()); this.stream = null; }
  clearTimers() { clearTimeout(this.timer); clearTimeout(this.flushTimer); }
  cancel() {
    const id = this.captureId;
    ++this.generation; this.clearTimers(); this.closeTracks();
    const recorder = this.recorder; this.recorder = null;
    if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch {} }
    this.abortController?.abort(); this.abortController = null; this.captureId = null;
    if (id) void this.fetchImpl(`/api/asr/transcriptions/${id}/cancel`, { method: 'POST', keepalive: true }).catch(() => {});
    this.set('idle', '录音已取消；草稿保留。');
  }
  dispose() { this.cancel(); this.disposed = true; }
  error(message) {
    this.cancel(); this.set('error', message);
  }
  async start() {
    if (this.disposed || this.active) return;
    if (!this.canStart()) { this.set('error', '请等待当前回复或测试结束，再开始录音。'); return; }
    const generation = ++this.generation;
    this.captureId = this.uuid(); this.startRevision = this.revision; this.startValue = this.getDraft();
    this.set('requesting', '准备本地录音…'); this.stopPlayback();
    const owns = () => generation === this.generation && !this.disposed;
    try {
      if (!this.Recorder) throw new Error(MESSAGES.audio_format);
      const mimeType = MIMES.find(mime => this.Recorder.isTypeSupported(mime));
      if (!mimeType) throw new Error(MESSAGES.audio_format);
      this.abortController = new AbortController();
      const statusResponse = await this.fetchImpl('/api/asr/status', { signal: this.abortController.signal });
      if (!owns()) return;
      if (!statusResponse.ok) throw new Error(MESSAGES.runtime_unavailable);
      const status = await statusResponse.json();
      if (!owns()) return;
      if (!status.available || status.busy) throw new Error(status.busy ? MESSAGES.busy : MESSAGES.runtime_unavailable);
      const stream = await this.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (!owns()) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      const recorder = new this.Recorder(stream, { mimeType, audioBitsPerSecond: 64000 });
      this.recorder = recorder;
      const chunks = []; let bytes = 0;
      recorder.ondataavailable = event => {
        if (!owns() || !event.data.size) return;
        bytes += event.data.size;
        if (bytes > MAX_BYTES) { this.error(MESSAGES.audio_size); return; }
        chunks.push(event.data);
      };
      recorder.onerror = () => { if (owns()) this.error('录音设备发生错误，请检查设备或继续文字输入。'); };
      recorder.onstop = () => {
        if (!owns()) return;
        this.closeTracks(); this.clearTimers(); this.recorder = null;
        void this.transcribe(new Blob(chunks, { type: recorder.mimeType || mimeType }), generation);
      };
      recorder.start(250); this.set('recording', '录音中 · 最长 30 秒；停止后只生成草稿。');
      this.timer = setTimeout(() => { if (owns()) this.stop(); }, this.maxMs);
    } catch (error) {
      if (!owns()) return;
      this.error(error.name === 'NotAllowedError' ? '麦克风授权被拒绝，请继续文字输入或调整浏览器授权。'
        : error.name === 'NotFoundError' ? '未发现可用麦克风，请继续文字输入。'
        : error.name === 'NotReadableError' ? '麦克风暂不可用或被占用，请继续文字输入。'
        : error.message || '录音不可用，请继续文字输入。');
    }
  }
  stop() {
    if (this.state === 'requesting') { this.cancel(); return; }
    if (this.state !== 'recording') return;
    clearTimeout(this.timer);
    this.set('transcribing', '本地转写中…可取消；不会自动发送。');
    // Browser recorder failure must not leave an eternal transcribing state.
    this.flushTimer = setTimeout(() => this.error('录音封装超时，请重试或继续文字输入。'), 5000);
    try { this.recorder.stop(); } catch { this.error('停止录音失败，请重试。'); return; }
    this.closeTracks();
  }
  async transcribe(blob, generation) {
    const owns = () => generation === this.generation && !this.disposed;
    if (!blob.size || blob.size > MAX_BYTES) { if (owns()) this.error(MESSAGES.audio_size); return; }
    this.set('transcribing', '本地转写中…可取消；不会自动发送。');
    const id = this.captureId;
    this.abortController = new AbortController();
    this.timer = setTimeout(() => { if (owns()) this.error(MESSAGES.timeout); }, 35000);
    try {
      const response = await this.fetchImpl(`/api/asr/transcriptions/${id}`, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type }, signal: this.abortController.signal });
      if (!owns()) return;
      const result = await response.json();
      if (!owns()) return;
      if (!response.ok) throw new Error(MESSAGES[result.code] || '本地转写失败，请重试或继续文字输入。');
      if (result.captureId !== id || typeof result.text !== 'string' || !result.text.trim() || result.text.length > 1500) throw new Error('转写结果无效，请继续文字输入。');
      if (this.revision !== this.startRevision || this.getDraft() !== this.startValue) this.set('draft', '草稿已修改，转写结果未覆盖。请检查当前文字后显式发送。');
      else { this.applyDraft(result.text); this.set('draft', '本地转写草稿 · 请校对、编辑后点击发送；不会自动发送。'); }
      this.captureId = null; this.abortController = null; this.clearTimers();
    } catch (error) { if (owns()) this.error(error.message || '本地转写失败，请继续文字输入。'); }
  }
}

export function mountRecording({ input, start, stop, cancel, status, stopPlayback, canStart, ...dependencies }) {
  const controller = new RecordingController({ ...dependencies, stopPlayback, canStart, getDraft: () => input.value,
    applyDraft: text => { input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); },
    onState: ({ state, message }) => {
      status.dataset.state = state; status.textContent = message;
      start.disabled = ['requesting', 'recording', 'transcribing'].includes(state);
      stop.disabled = !['requesting', 'recording'].includes(state);
      cancel.disabled = !['requesting', 'recording', 'transcribing'].includes(state);
    },
  });
  const edit = () => controller.edited(), begin = () => void controller.start(), end = () => controller.stop(), abort = () => controller.cancel();
  input.addEventListener('input', edit); start.addEventListener('click', begin); stop.addEventListener('click', end); cancel.addEventListener('click', abort);
  globalThis.addEventListener('pagehide', abort); globalThis.addEventListener('beforeunload', abort);
  const dispose = controller.dispose.bind(controller);
  controller.dispose = () => { dispose(); input.removeEventListener('input', edit); start.removeEventListener('click', begin); stop.removeEventListener('click', end); cancel.removeEventListener('click', abort); globalThis.removeEventListener('pagehide', abort); globalThis.removeEventListener('beforeunload', abort); };
  controller.set('idle', '按下录音开始 · 最长 30 秒 · 本地识别后校对再发送。');
  return controller;
}
