import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechController, splitSpeech } from '../src/speech.js';
import { TurnLifecycle, completedSegments } from '../src/turn-lifecycle.js';

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function fixture(fetchAudio = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })) {
  const events = [], sources = [];
  const context = { resume: async () => {}, decodeAudioData: async () => ({}), destination: {},
    createAnalyser: () => ({ fftSize: 256, connect() {}, disconnect() {}, getByteTimeDomainData(b) { b.fill(128); } }),
    createBufferSource: () => { const source = { connect() {}, disconnect() {}, start() { events.push('audio'); }, stop() { events.push('stop'); this.onended?.(); } }; sources.push(source); return source; },
  };
  const speech = new SpeechController({ audioContext: context, fetchAudio,
    onLifecycle: e => events.push(e.phase), onSegment: s => events.push(s ? s.text : 'clear'), onExpression: e => events.push(e), onMouth: e => events.push(`mouth:${e}`),
  });
  speech.voices = [{ value: 'neural:mock', id: 'mock', engine: 'gpt-sovits', localService: true, emotions: ['neutral', 'happy'] }];
  return { speech, events, sources };
}
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

test('sentence bounds preserve every non-whitespace character, including surrogate pairs', () => {
  const text = '你好！下一幕。' + '🎭'.repeat(155);
  const chunks = splitSpeech(text); assert(chunks.length > 2);
  assert.equal(chunks.join(''), text); assert(chunks.every(s => s.length <= 100));
  assert(chunks.every(s => !/[\uD800-\uDBFF]$/.test(s)));
  assert.deepEqual(splitSpeech('她说：“你好！”然后继续。'), ['她说：“你好！”', '然后继续。']);
});
test('turn ownership rejects all late transitions after stop or replacement', () => {
  const lifecycle = new TurnLifecycle(); const old = lifecycle.begin(); lifecycle.cancel();
  assert(old.signal.aborted); assert.equal(lifecycle.set(old, 'speaking'), false);
  const fresh = lifecycle.begin(); assert.equal(lifecycle.set(old, 'error'), false); assert(lifecycle.owns(fresh));
});
test('shared completion contract rejects wrong identity, order or changed text', () => {
  const turnId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const good = { turnId, generationState: 'completed', delivery: 'full-reply-segments', assistant: { text: '一。二。' }, segments: [{ segmentId: `${turnId}:0`, index: 0, text: '一。', emotion: 'calm' }, { segmentId: `${turnId}:1`, index: 1, text: '二。', emotion: 'calm' }] };
  assert.equal(completedSegments(good, turnId).length, 2);
  assert.throws(() => completedSegments(good, 'other'));
  assert.throws(() => completedSegments({ ...good, segments: [...good.segments].reverse() }, turnId));
  assert.throws(() => completedSegments({ ...good, assistant: { text: 'changed' } }, turnId));
});
test('shared TTS carries identity and registered segment emotion, cancellation notifies once', async () => {
  const requests = [], cancelled = [];
  const { speech, sources } = fixture(async (_path, options) => { requests.push(JSON.parse(options.body)); return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) }; });
  speech.onCancel = id => cancelled.push(id);
  const turn = speech.beginTurn(); turn.remoteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const promise = speech.speakSegments([{ segmentId: `${turn.remoteId}:0`, index: 0, text: '一。', emotion: 'happy' }], 'neural:mock', { emotion: 'neutral', turn }); await flush();
  assert.equal(requests[0].turnId, turn.remoteId); assert.equal(requests[0].segmentId, `${turn.remoteId}:0`); assert.equal(requests[0].emotion, 'happy');
  speech.stop(); speech.stop(); await promise; assert.deepEqual(cancelled, [turn.remoteId]); assert.equal(sources.length, 1);
});
test('silent audio still owns speaking; subtitle and expression begin after audio and queue is ordered', async () => {
  const { speech, events, sources } = fixture();
  const promise = speech.speak('第一句。第二句。', 'neural:mock', { emotion: 'happy' }); await flush();
  assert.equal(speech.lifecycle.phase, 'speaking'); assert.equal(sources.length, 1);
  assert(events.indexOf('audio') < events.indexOf('第一句。')); assert(events.indexOf('audio') < events.indexOf('happy'));
  sources[0].onended(); await flush(); assert.equal(sources.length, 2);
  assert(events.indexOf('第一句。') < events.indexOf('第二句。'));
  sources[1].onended(); assert.deepEqual(await promise, { completed: true }); assert.equal(speech.lifecycle.phase, 'idle');
});
test('stop immediately clears playback, drops prepared next sentence and allows another turn', async () => {
  const { speech, events, sources } = fixture(); const promise = speech.speak('一。二。', 'neural:mock'); await flush();
  speech.stop(); assert.equal(speech.lifecycle.phase, 'idle'); assert(events.includes('stop')); await promise;
  assert.equal(sources.length, 1); assert(!events.includes('二。'));
  const fresh = speech.speak('三。', 'neural:mock'); await flush(); sources[1].onended(); assert((await fresh).completed);
});
test('cancellation-ignoring late synthesis never plays or changes the new phase', async () => {
  let release; const { speech, sources } = fixture(() => new Promise(r => { release = r; }));
  const promise = speech.speak('迟到。', 'neural:mock'); await flush(); speech.stop();
  release({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }); await promise;
  assert.equal(sources.length, 0); assert.equal(speech.lifecycle.phase, 'idle');
});
test('prefetch failure waits for current sentence, enters recoverable error and stops further audio', async () => {
  let calls = 0; const { speech, sources } = fixture(async () => { if (++calls === 2) throw Error('fixture failure'); return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) }; });
  const promise = speech.speak('一。二。三。', 'neural:mock'); await flush(); assert.equal(speech.lifecycle.phase, 'speaking');
  sources[0].onended(); assert((await promise).error); assert.equal(speech.lifecycle.phase, 'error'); assert.equal(sources.length, 1);
  const fresh = speech.speak('恢复。', 'neural:mock'); await flush(); sources[1].onended(); assert((await fresh).completed);
});
