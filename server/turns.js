// Full-reply segmentation, not LLM streaming. No provider calls live here.
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const fail = (code, message, status = 409) => Object.assign(new Error(message), { code, status });
export function validTurnId(id) {
  if (typeof id !== 'string' || !UUID.test(id)) throw fail('INVALID_TURN_ID', 'turnId 必须是 UUID。', 400);
  return id.toLowerCase();
}
export function segmentsFor(turnId, text, emotion) {
  if (typeof text !== 'string' || !text.trim() || text.length > 1500) throw fail('TURN_OUTPUT_LIMIT', '回复超出分段输出上限。', 502);
  const parts = text.match(/[^。！？!?\n]+[。！？!?\n]*|[。！？!?\n]+/gu) || [text];
  const chunks = [];
  for (const part of parts) {
    // Preserve exact text and surrogate pairs; each local TTS request <= 300.
    let remaining = part;
    while (remaining.length > 300) {
      let end = 300;
      if (/^[\uDC00-\uDFFF]$/.test(remaining[end])) end--;
      chunks.push(remaining.slice(0, end)); remaining = remaining.slice(end);
    }
    if (remaining) chunks.push(remaining);
  }
  // Coalesce short sentences to bound the total number of TTS requests.
  const bounded = [];
  for (const chunk of chunks) {
    if (bounded.length > 1 && bounded.at(-1).length + chunk.length <= 300) bounded[bounded.length - 1] += chunk;
    else bounded.push(chunk);
  }
  if (bounded.length > 10) throw fail('TURN_OUTPUT_LIMIT', '回复分段过多。', 502);
  if (bounded.some(text => !text.trim())) throw fail('TURN_OUTPUT_LIMIT', '回复包含无法朗读的空白分段。', 502);
  return bounded.map((text, index) => ({ segmentId: `${turnId}:${index}`, index, text, emotion }));
}

export class Turns {
  constructor({ now = Date.now, ttlMs = 30 * 60 * 1000, limit = 128, maxSpeechJobs = 4 } = {}) {
    this.entries = new Map(); this.now = now; this.ttlMs = ttlMs; this.limit = limit;
    this.maxSpeechJobs = maxSpeechJobs; this.speechJobs = 0;
  }
  prune() {
    for (const [id, turn] of this.entries) if (!turn.busy && !turn.speechJobs.size && this.now() - turn.updatedAt >= this.ttlMs) this.entries.delete(id);
  }
  create(id) {
    id = validTurnId(id); this.prune();
    if (this.entries.has(id)) throw fail(this.entries.get(id).state === 'cancelled' ? 'TURN_CANCELLED' : 'TURN_EXISTS', '本轮已取消或已提交，请使用新的 turnId。');
    if (this.entries.size >= this.limit) throw fail('TURN_CAPACITY', '暂存轮次已满，请稍后重试。', 429);
    const turn = { id, state: 'thinking', controller: new AbortController(), busy: true, updatedAt: this.now(), segments: [], speechJobs: new Set() };
    this.entries.set(id, turn); return turn;
  }
  get(id) {
    id = validTurnId(id); this.prune();
    const turn = this.entries.get(id);
    if (!turn) throw fail('TURN_EXPIRED', '本轮不存在或已过期，请重新发送。');
    if (turn.controller.signal.aborted) throw fail('TURN_CANCELLED', '本轮已取消。');
    return turn;
  }
  cancel(id) {
    id = validTurnId(id); this.prune();
    let turn = this.entries.get(id);
    if (!turn) { turn = this.create(id); turn.busy = false; }
    turn.state = 'cancelled'; turn.updatedAt = this.now(); turn.controller.abort();
    return { turnId: id, generationState: 'cancelled', cancelled: true };
  }
  complete(turn, result) {
    this.get(turn.id);
    turn.segments = segmentsFor(turn.id, result.text, result.emotion);
    turn.state = 'completed'; turn.updatedAt = this.now();
    return { turnId: turn.id, generationState: 'completed', delivery: 'full-reply-segments', segments: turn.segments };
  }
  speech(input) {
    const turn = this.get(input.turnId);
    const segment = turn.segments.find(s => s.segmentId === input.segmentId);
    if (turn.state !== 'completed' || !segment || input.text !== segment.text || (input.emotion !== undefined && input.emotion !== segment.emotion)) throw fail('INVALID_SEGMENT', '音频请求与本轮分段不一致。', 400);
    return turn;
  }
  acquireSpeech(input) {
    const turn = this.speech(input);
    if (turn.speechJobs.has(input.segmentId)) throw fail('SEGMENT_BUSY', '本段语音仍在合成。');
    if (turn.speechJobs.size >= 2 || this.speechJobs >= this.maxSpeechJobs) throw fail('SPEECH_CAPACITY', '语音合成队列已满，请稍后重播。', 429);
    turn.speechJobs.add(input.segmentId); ++this.speechJobs;
    let released = false;
    return () => {
      if (released) return;
      released = true; turn.speechJobs.delete(input.segmentId); --this.speechJobs; turn.updatedAt = this.now();
    };
  }
  invalidate() { for (const turn of this.entries.values()) this.cancel(turn.id); }
  close() { for (const turn of this.entries.values()) turn.controller.abort(); this.entries.clear(); }
}
