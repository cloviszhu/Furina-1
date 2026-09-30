import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Turns, segmentsFor } from '../server/turns.js';
import { createApp } from '../server/index.js';

test('segments preserve text, first sentence, Unicode and conservative request bounds', () => {
  const id = randomUUID();
  for (const text of ['第一句。第二句！第三句？', 'a'.repeat(299) + '😀' + 'b'.repeat(400), '句。'.repeat(750)]) {
    const segments = segmentsFor(id, text, 'calm');
    assert.equal(segments.map(s => s.text).join(''), text);
    assert(segments.length <= 10);
    segments.forEach((s, index) => { assert.equal(s.index, index); assert.equal(s.segmentId, `${id}:${index}`); assert(s.text.length <= 300); assert(!/^[\uDC00-\uDFFF]/.test(s.text)); });
  }
  assert.equal(segmentsFor(id, '第一句。第二句！', 'calm')[0].text, '第一句。');
  assert.throws(() => segmentsFor(id, 'x'.repeat(1501), 'calm'), { code: 'TURN_OUTPUT_LIMIT' });
});

test('bounded registry keeps cancellation tombstones, rejects mismatches and expires', () => {
  let now = 0; const turns = new Turns({ now: () => now, ttlMs: 10, limit: 2 });
  const cancelled = randomUUID(); turns.cancel(cancelled);
  assert.throws(() => turns.create(cancelled), { code: 'TURN_CANCELLED' });
  const turn = turns.create(randomUUID()); turns.complete(turn, { text: '一。二。', emotion: 'calm' }); turn.busy = false;
  assert.equal(turns.speech({ turnId: turn.id, segmentId: `${turn.id}:0`, text: '一。', emotion: 'calm' }), turn);
  assert.throws(() => turns.speech({ turnId: turn.id, segmentId: `${turn.id}:0`, text: '冒充' }), { code: 'INVALID_SEGMENT' });
  assert.throws(() => turns.create(randomUUID()), { code: 'TURN_CAPACITY' });
  now = 11; assert.throws(() => turns.get(turn.id), { code: 'TURN_EXPIRED' });
  assert.throws(() => turns.cancel('../bad'), { code: 'INVALID_TURN_ID' });
});

test('HTTP lifecycle ignores late generation/audio, errors honestly and recovers without history pollution', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'exo-turn-segments-'));
  let calls = 0, behavior = 'ok', began, release, speechBegan, releaseSpeech;
  let speechSignal;
  const context = await createApp({ dataDir: directory,
    credentials: { resolve: async c => c },
    fetchImpl: async (_url, options) => {
      calls++; assert.equal(JSON.parse(options.body).stream, false);
      if (behavior === 'wait') { began(); await new Promise(r => { release = r; }); } // deliberately ignore abort
      if (behavior === 'fail') throw Error('private fixture diagnostic');
      return { ok: true, json: async () => ({ message: { content: JSON.stringify({ text: '第一句。第二句。第三句。', emotion: 'calm' }) } }) };
    },
    windowsSpeechImpl: { synthesize: async (_text, _voice, { signal }) => {
      speechSignal = signal;
      if (behavior === 'speech-wait') { speechBegan(); await new Promise(r => { releaseSpeech = r; }); }
      if (behavior === 'speech-fail') throw Error('private fixture diagnostic');
      return Buffer.from('fixture-wav');
    } },
  });
  await new Promise(r => context.app.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${context.app.address().port}`;
  const post = (path, input) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, ...(input !== undefined && { body: JSON.stringify(input) }) });
  const input = turnId => ({ turnId, text: '只是一份隔离测试', config: { provider: 'ollama', model: 'fixture' } });
  try {
    const firstId = randomUUID(); const first = await (await post('/api/chat', input(firstId))).json();
    assert.equal(first.turnId, firstId); assert.equal(first.user.turnId, firstId); assert.equal(first.generationState, 'completed');
    assert.equal(first.segments.map(s => s.text).join(''), first.assistant.text); assert.equal(calls, 1);
    const { emotion, ...segment } = first.segments[0];
    const speechInput = { turnId: firstId, ...segment, voice: 0 };
    assert.equal((await post('/api/speech', { ...speechInput, text: 'wrong' })).status, 400);
    assert.equal((await post('/api/speech', speechInput)).status, 200);
    behavior = 'speech-fail'; const failedAudio = await post('/api/speech', speechInput);
    assert.equal(failedAudio.status, 502); assert.equal((await failedAudio.json()).code, 'TTS_FAILED');
    assert.equal(context.store.history().length, 2);
    behavior = 'speech-wait'; const startedSpeech = new Promise(r => { speechBegan = r; });
    const audio = post('/api/speech', speechInput); await startedSpeech;
    assert.equal((await post(`/api/turns/${firstId}/cancel`)).status, 200); assert(speechSignal.aborted);
    releaseSpeech(); const lateAudio = await audio; assert.equal(lateAudio.status, 409); assert.equal((await lateAudio.json()).code, 'TURN_CANCELLED');
    assert.equal(context.store.history().length, 2);
    assert.equal((await post('/api/speech', speechInput)).status, 409);

    const cancelledId = randomUUID(); behavior = 'wait'; const started = new Promise(r => { began = r; });
    const generation = post('/api/chat', input(cancelledId)); await started;
    await post(`/api/turns/${cancelledId}/cancel`); release(); const late = await generation;
    assert.equal(late.status, 409); assert.equal((await late.json()).code, 'TURN_CANCELLED'); assert.equal(context.store.history().length, 2);
    assert.equal((await post('/api/chat', input(cancelledId))).status, 409);
    const early = randomUUID(); await post(`/api/turns/${early}/cancel`);
    assert.equal((await post('/api/chat', input(early))).status, 409);
    behavior = 'fail'; const failed = await post('/api/chat', input(randomUUID()));
    assert.equal(failed.status, 502); const failure = await failed.json(); assert.equal(failure.code, 'TURN_PROVIDER_FAILED'); assert(!JSON.stringify(failure).includes('private fixture'));
    assert.equal(context.store.history().length, 2); assert.deepEqual(context.store.list(), []);
    behavior = 'ok'; assert.equal((await post('/api/chat', input(randomUUID()))).status, 200); assert.equal(context.store.history().length, 4);
    const unauthorized = await post('/api/chat', { ...input(randomUUID()), remoteChat: true, config: { provider: 'deepseek', model: 'deepseek-flash' } });
    assert.equal(unauthorized.status, 403); assert.equal(context.budget.status().usedCalls, 0);
  } finally {
    release?.(); releaseSpeech?.(); await context.close();
    assert(resolve(directory).startsWith(resolve(tmpdir()) + sep)); rmSync(directory, { recursive: true, force: true });
  }
});
