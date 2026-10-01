import { TurnLifecycle } from './turn-lifecycle.js';

// Complete-reply sentence TTS, not an LLM token stream.
export function splitSpeech(text, limit = 100) {
  const chunks = []; let chunk = '', boundary = false;
  for (const char of String(text).trim()) {
    if (boundary && !/[。！？!?；;”’」』）)\s]/u.test(char)) { if (chunk.trim()) chunks.push(chunk.trim()); chunk = ''; boundary = false; }
    if (chunk.length + char.length > limit && chunk) { chunks.push(chunk); chunk = ''; boundary = false; }
    chunk += char;
    if (/[。！？!?；;\n]/u.test(char)) boundary = true;
  }
  if (chunk.trim()) chunks.push(chunk.trim());
  return chunks;
}
export class SpeechController {
  constructor({ onState = () => {}, onMouth = () => {}, onExpression = () => {}, onStop = () => {}, onCancel = () => {}, onLifecycle = () => {}, onSegment = () => {}, fetchAudio, audioContext } = {}) {
    Object.assign(this, { onState, onMouth, onExpression, onStop, onCancel, onSegment, fetchAudio, context: audioContext });
    this.voices = []; this.sequence = 0;
    this.lifecycle = new TurnLifecycle(onLifecycle);
    globalThis.speechSynthesis?.addEventListener('voiceschanged', () => this.onVoicesChanged?.());
  }
  async listVoices() {
    const generation = this.voiceListGeneration = (this.voiceListGeneration || 0) + 1;
    let windows = [];
    let localStatus;
    try { const response = await fetch('/api/voices'); if (!response.ok) throw new Error(); const result = await response.json(); localStatus = result.localTts; windows = result.voices.map(v => ({ ...v, value: `${v.engine === 'gpt-sovits' ? 'neural' : 'windows'}:${v.id}`, label: `${v.name} · ${v.engine === 'gpt-sovits' ? '本地 TTS' : 'Windows 临时备用'}` })); } catch { localStatus = { error: '项目声音服务无法连接；请运行 npm.cmd start 后刷新声音。' }; }
    const browser = (globalThis.speechSynthesis?.getVoices() || []).map((v, index) => ({
      value: `browser:${index}`, name: v.name, label: `${v.name} · ${v.localService ? '浏览器本机' : '网络声音（禁用）'}`,
      language: v.lang, localService: v.localService, engine: 'browser', voice: v,
    }));
    if (generation !== this.voiceListGeneration) return this.voices;
    this.localStatus = localStatus;
    this.voices = [...windows, ...browser]; return this.voices;
  }

  beginTurn() { this.stop(); this.onState('正在想回应…'); return this.lifecycle.begin(); }
  reset() {
    if (this.frame != null) globalThis.cancelAnimationFrame?.(this.frame);
    this.frame = null; this.onMouth(0); this.onExpression('neutral'); this.onSegment(null);
  }
  stop({ preservePreview = false } = {}) {
    ++this.sequence; this.cancelRemote(this.lifecycle.current); this.lifecycle.cancel();
    this.cancelPlayback?.(); this.cancelPlayback = null;
    try { this.source?.stop(); } catch {}
    this.source = null; globalThis.speechSynthesis?.cancel(); this.reset();
    this.onState('已停止 · 这一轮的旧音频不会播放'); this.onStop(preservePreview);
  }
  cancelRemote(turn) { if (turn?.remoteId && !turn.cancelSent) { turn.cancelSent = true; this.onCancel(turn.remoteId); } }
  async prepare(segment, voice, turn, options) {
    if (!this.lifecycle.owns(turn)) return null;
    this.context ||= new AudioContext(); await this.context.resume();
    if (!this.lifecycle.owns(turn)) return null;
    const body = voice.engine === 'gpt-sovits'
      ? { backend: 'gpt-sovits', text: segment.text, referenceId: voice.id, ...(segment.segmentId && !voice.emotions?.includes(segment.emotion) ? {} : { emotion: segment.segmentId ? segment.emotion : options.emotion }), speed: options.speed }
      : { text: segment.text, voice: voice.id };
    if (turn.remoteId && segment.segmentId) Object.assign(body, { turnId: turn.remoteId, segmentId: segment.segmentId });
    if (voice.engine === 'gpt-sovits' && segment.segmentId && options.expressionMode === 'manual') Object.assign(body, { emotion: segment.emotion, expressionMode: 'manual', referenceEmotion: options.emotion });
    const response = await (this.fetchAudio || fetch)('/api/speech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: turn.signal });
    if (!this.lifecycle.owns(turn)) return null;
    if (!response.ok) throw new Error((await response.json()).error || '语音生成失败');
    const data = await response.arrayBuffer();
    if (!this.lifecycle.owns(turn)) return null;
    const audio = await this.context.decodeAudioData(data);
    const actualEmotion = response.headers?.get('X-Exo-Emotion');
    if (turn.remoteId && segment.segmentId && !['neutral', 'calm', 'happy', 'sad', 'angry', 'surprised'].includes(actualEmotion)) throw new Error('声音服务未确认实际表达；已停止播放。');
    if (options.expressionMode === 'manual' && voice.engine === 'gpt-sovits' && segment.segmentId && (actualEmotion !== options.emotion || response.headers?.get('X-Exo-Expression-Mode') !== 'manual')) throw new Error('声音服务未采用所选手动表达；已停止播放。');
    return this.lifecycle.owns(turn) ? { audio, actualEmotion: actualEmotion || options.emotion } : null;
  }
  speak(text, value, options = {}) { return this.speakSegments(splitSpeech(text).map((text, index) => ({ id: index, text })), value, options); }
  async speakSegments(segments, value, { emotion = 'neutral', speed = 1, expressionMode = 'reply', turn } = {}) {
    if (!turn) { this.stop(); turn = this.lifecycle.begin('preparing'); }
    if (!this.lifecycle.owns(turn)) return { cancelled: true };
    const voice = this.voices.find(v => v.value === value), options = { emotion, speed, expressionMode };
    try {
      if (!voice || !voice.localService) throw new Error('没有可用本地声音；请刷新或选择声音。');
      if (voice.engine === 'gpt-sovits' && !voice.emotions?.includes(emotion)) throw new Error('当前声线未登记所选表达。');
      if (segments.some(s => !s.text?.trim() || s.text.length > (voice.engine === 'gpt-sovits' ? 300 : 1000))) throw new Error('语音分句内容无效或超出长度限制。');
      const buffered = voice.engine === 'windows-sapi' || voice.engine === 'gpt-sovits';
      // One-sentence lookahead; wrap prefetch failures immediately.
      const prepare = segment => this.prepare(segment, voice, turn, options).then(audio => ({ audio }), error => ({ error }));
      let pending = buffered && segments.length ? prepare(segments[0]) : null;
      for (let index = 0; index < segments.length; index++) {
        if (!this.lifecycle.owns(turn)) return { cancelled: true };
        const requested = segments[index].segmentId ? segments[index].emotion : emotion;
        const effective = voice.engine === 'gpt-sovits' && voice.emotions?.includes(requested) ? requested : 'neutral';
        const segment = { ...segments[index], index, turnId: turn.remoteId || turn.id, emotion: effective };
        this.lifecycle.set(turn, 'preparing', segment); this.onState(`正在准备声音 · 第 ${index + 1}/${segments.length} 句`);
        const prepared = buffered ? await pending : {};
        if (!this.lifecycle.owns(turn)) return { cancelled: true };
        if (prepared.error) throw prepared.error;
        if (buffered && prepared.audio) segment.emotion = prepared.audio.actualEmotion;
        pending = buffered && index + 1 < segments.length ? prepare(segments[index + 1]) : null;
        await this.play(segment, prepared.audio?.audio, voice, turn);
      }
      if (!this.lifecycle.owns(turn)) return { cancelled: true };
      this.reset(); this.lifecycle.set(turn, 'idle'); this.onState('播放结束 · 本地分句语音'); return { completed: true };
    } catch (error) {
      if (!this.lifecycle.owns(turn)) return { cancelled: true };
      this.reset(); this.lifecycle.set(turn, 'error'); this.cancelRemote(turn); turn.controller.abort();
      this.onState(`${error.message || '发声失败'} · 可以重新发送或选择声音后重试`); return { error };
    }
  }
  play(segment, audio, voice, turn) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = error => {
        if (done) return; done = true; turn.signal.removeEventListener('abort', cancelled); this.cancelPlayback = null;
        if (this.lifecycle.owns(turn)) { this.source = null; this.reset(); }
        error ? reject(error) : resolve();
      };
      const cancelled = () => { try { this.source?.stop(); } catch {} finish(); };
      this.cancelPlayback = cancelled; turn.signal.addEventListener('abort', cancelled, { once: true });
      const start = () => {
        if (!this.lifecycle.owns(turn)) return finish();
        this.lifecycle.set(turn, 'speaking', segment); this.onSegment(segment);
        this.onExpression(voice.engine === 'gpt-sovits' ? segment.emotion : 'neutral');
        this.onState(`正在发声 · 第 ${segment.index + 1} 句 · ${voice.engine === 'gpt-sovits' ? '本地 TTS / 音频驱动口型' : '本地系统备用'}`);
      };
      try {
        if (audio) {
          const source = this.context.createBufferSource(); source.buffer = audio;
          const analyser = this.context.createAnalyser(); analyser.fftSize = 256;
          source.connect(analyser); analyser.connect(this.context.destination); this.source = source;
          source.onended = () => { source.disconnect?.(); analyser.disconnect?.(); finish(); };
          const bytes = new Uint8Array(analyser.fftSize);
          const animate = () => {
            if (!this.lifecycle.owns(turn) || done) return;
            analyser.getByteTimeDomainData(bytes);
            const rms = Math.sqrt(bytes.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / bytes.length);
            this.onMouth(Math.min(1, rms * 6)); this.frame = requestAnimationFrame(animate);
          };
          source.start(); start(); animate();
        } else {
          const utterance = new SpeechSynthesisUtterance(segment.text);
          utterance.voice = voice.voice; utterance.lang = voice.voice.lang; utterance.rate = .95;
          utterance.onstart = () => {
            start(); const startedAt = performance.now();
            const animate = () => { if (!this.lifecycle.owns(turn) || done) return; this.onMouth(.3 + Math.sin((performance.now() - startedAt) * .025) * .22); this.frame = requestAnimationFrame(animate); }; animate();
          };
          utterance.onend = () => finish(); utterance.onerror = () => finish(new Error('浏览器本机发声失败；请尝试 Windows 本地声音。'));
          globalThis.speechSynthesis.speak(utterance);
        }
      } catch (error) { finish(error); }
    });
  }
}
