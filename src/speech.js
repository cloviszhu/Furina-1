export class SpeechController {
  constructor({ onState, onMouth }) {
    this.onState = onState; this.onMouth = onMouth; this.sequence = 0; this.voices = [];
    globalThis.speechSynthesis?.addEventListener('voiceschanged', () => this.onVoicesChanged?.());
  }
  async listVoices() {
    let windows = [];
    try { const response = await fetch('/api/voices'); const result = await response.json(); this.localStatus = result.localTts; windows = result.voices.map(v => ({ ...v, value: `${v.engine === 'gpt-sovits' ? 'neural' : 'windows'}:${v.id}`, label: `${v.name} · ${v.engine === 'gpt-sovits' ? '本地 TTS' : 'Windows 临时备用'}` })); } catch { /* Browser fallback remains available. */ }
    const browser = (globalThis.speechSynthesis?.getVoices() || []).map((v, index) => ({
      value: `browser:${index}`, name: v.name, label: `${v.name} · ${v.localService ? '浏览器本机' : '网络声音（禁用）'}`,
      language: v.lang, localService: v.localService, engine: 'browser', voice: v,
    }));
    this.voices = [...windows, ...browser]; return this.voices;
  }
  stop() {
    ++this.sequence;
    this.abort?.abort(); this.abort = null;
    try { this.source?.stop(); } catch { /* Already ended. */ }
    this.source = null;
    globalThis.speechSynthesis?.cancel();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = null; this.onMouth(0); this.onState('已停止 · 生成中的旧音频不会播放');
  }
  async speak(text, value, { emotion = 'neutral', speed = 1 } = {}) {
    this.stop(); const sequence = this.sequence;
    const voice = this.voices.find(v => v.value === value);
    if (!voice || !voice.localService) { this.onState('没有可用本机声音，请在设置中刷新或选择。'); return; }
    const neural = voice.engine === 'gpt-sovits';
    if (neural && text.length > 300) { this.onState('本地 TTS 每次最多 300 字，请缩短朗读内容。'); return; }
    if (neural && !voice.emotions.includes(emotion)) { this.onState('这份声音尚未登记所选表达。'); return; }
    this.onState(neural ? '本地 TTS 正在生成…' : '正在准备系统备用语音…');
    try {
      if (voice.engine === 'windows-sapi' || neural) {
        const controller = new AbortController(); this.abort = controller;
        this.context ||= new AudioContext();
        await this.context.resume();
        if (sequence !== this.sequence || controller.signal.aborted) return;
        const response = await fetch('/api/speech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(neural ? { backend: 'gpt-sovits', text, referenceId: voice.id, emotion, speed } : { text: text.slice(0, 1000), voice: voice.id }), signal: controller.signal });
        if (!response.ok) throw new Error((await response.json()).error);
        const audio = await this.context.decodeAudioData(await response.arrayBuffer());
        if (sequence !== this.sequence) return;
        const source = this.context.createBufferSource(); source.buffer = audio;
        const analyser = this.context.createAnalyser(); analyser.fftSize = 256;
        source.connect(analyser); analyser.connect(this.context.destination);
        this.source = source;
        source.onended = () => { if (sequence !== this.sequence) return; cancelAnimationFrame(this.frame); this.onMouth(0); this.onState(neural ? '语音结束 · 本地测试声线 / 角色相似度待验收' : '语音结束 · 本机系统备用声'); this.source = null; };
        const bytes = new Uint8Array(analyser.fftSize);
        const animate = () => {
          if (sequence !== this.sequence) return;
          analyser.getByteTimeDomainData(bytes);
          const rms = Math.sqrt(bytes.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / bytes.length);
          this.onMouth(Math.min(1, rms * 6)); this.frame = requestAnimationFrame(animate);
        };
        this.onState(neural ? `正在发声 · 本地 TTS / ${emotion} / 音频振幅口型` : '正在发声 · 本机系统备用声 / 音频振幅口型');
        source.start(); animate();
      } else {
        const utterance = new SpeechSynthesisUtterance(text.slice(0, 1000));
        utterance.voice = voice.voice; utterance.lang = voice.voice.lang; utterance.rate = .95;
        utterance.onstart = () => {
          if (sequence !== this.sequence) return;
          this.onState('正在发声 · 浏览器本机声音 / 近似口型');
          const start = performance.now();
          const animate = () => { if (sequence !== this.sequence) return; this.onMouth(.3 + Math.sin((performance.now() - start) * .025) * .22); this.frame = requestAnimationFrame(animate); };
          animate();
        };
        utterance.onend = () => { if (sequence !== this.sequence) return; cancelAnimationFrame(this.frame); this.onMouth(0); this.onState('语音结束 · 浏览器系统声'); };
        utterance.onerror = () => { if (sequence !== this.sequence) return; cancelAnimationFrame(this.frame); this.onMouth(0); this.onState('浏览器语音失败，请尝试 Windows 本机声音。'); };
        globalThis.speechSynthesis.speak(utterance);
      }
    } catch (error) {
      if (sequence !== this.sequence) return;
      this.onMouth(0); this.onState(error.name === 'AbortError' ? '语音已取消' : `${error.message || '语音失败'} · 请在设置中切换声音`);
    }
  }
}
