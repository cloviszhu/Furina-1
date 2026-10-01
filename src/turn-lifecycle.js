// A turn owns all model, preparation and playback work. Audio amplitude never
// determines its phase. Transport adapters may attach their own server IDs.
export class TurnLifecycle {
  constructor(onChange = () => {}) { this.onChange = onChange; this.generation = 0; this.phase = 'idle'; }
  begin(phase = 'thinking') {
    this.cancel();
    const turn = { id: ++this.generation, controller: new AbortController() };
    turn.signal = turn.controller.signal;
    this.current = turn;
    this.set(turn, phase);
    return turn;
  }
  owns(turn) { return this.current === turn && !turn.signal.aborted; }
  set(turn, phase, segment = null) {
    if (!this.owns(turn)) return false;
    if (!['thinking', 'preparing', 'speaking', 'idle', 'error'].includes(phase)) throw new Error('Invalid turn phase');
    this.phase = phase; this.segment = segment;
    this.onChange({ phase, turnId: turn.id, segment });
    return true;
  }
  cancel() {
    this.current?.controller.abort(); this.current = null;
    this.phase = 'idle'; this.segment = null;
    this.onChange({ phase: 'idle', turnId: null, segment: null });
  }
}

export function completedSegments(result, turnId) {
  const segments = result?.segments;
  const emotions = ['neutral', 'calm', 'happy', 'sad', 'angry', 'surprised'];
  if (result?.turnId !== turnId || result.generationState !== 'completed' || result.delivery !== 'full-reply-segments'
    || !Array.isArray(segments) || !segments.length || segments.length > 10 || result.assistant?.text?.length > 1500
    || segments.some((s, index) => s.index !== index || s.segmentId !== `${turnId}:${index}` || typeof s.text !== 'string' || !s.text.trim() || s.text.length > 300 || !emotions.includes(s.emotion))
    || segments.map(s => s.text).join('') !== result.assistant?.text) throw new Error('回复分句合同无效；已停止这一轮，不自动重试。');
  return segments;
}
