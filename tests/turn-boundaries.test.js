import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Turns } from '../server/turns.js';
import { createApp } from '../server/index.js';
import { PRICING } from '../server/budget.js';

test('cancel UUID floods stay bounded; exact TTL prunes settled entries but preserves active work', () => {
  let now = 0; const turns = new Turns({ now: () => now, ttlMs: 100 });
  const active = turns.create(randomUUID());
  const ids = Array.from({ length: 127 }, () => randomUUID());
  ids.forEach(id => turns.cancel(id)); assert.equal(turns.entries.size, 128);
  for (const bad of ['', '../escape', 'x'.repeat(100000), null, {}, 123]) assert.throws(() => turns.cancel(bad), { code: 'INVALID_TURN_ID' });
  assert.equal(turns.entries.size, 128);
  assert.throws(() => turns.cancel(randomUUID()), { code: 'TURN_CAPACITY', status: 429 });
  assert(turns.cancel(ids[0]).cancelled); assert.equal(turns.entries.size, 128);
  now = 99; turns.prune(); assert.equal(turns.entries.size, 128);
  now = 100; turns.prune(); assert.equal(turns.entries.size, 1);
  assert.equal(turns.get(active.id), active);
  active.busy = false; turns.prune(); assert.equal(turns.entries.size, 0);
});

test('speech slots reject duplicate/overflow, survive TTL and cancellation, and release idempotently', () => {
  let now = 0; const turns = new Turns({ now: () => now, ttlMs: 10 });
  const make = () => {
    const t = turns.create(randomUUID());
    turns.complete(t, { text: '首句。' + '中'.repeat(300) + '末句。', emotion: 'neutral' }); t.busy = false;
    return t.segments.map(s => ({ turnId: t.id, ...s }));
  };
  const a = make(), b = make(), c = make();
  const releaseA = turns.acquireSpeech(a[0]);
  assert.throws(() => turns.acquireSpeech(a[0]), { code: 'SEGMENT_BUSY' });
  const releaseA2 = turns.acquireSpeech(a[1]);
  assert.throws(() => turns.acquireSpeech(a[2]), { code: 'SPEECH_CAPACITY' });
  const releaseB = turns.acquireSpeech(b[0]), releaseB2 = turns.acquireSpeech(b[1]);
  assert.throws(() => turns.acquireSpeech(c[0]), { code: 'SPEECH_CAPACITY' });
  now = 11; turns.prune(); assert.equal(turns.entries.size, 2);
  turns.cancel(a[0].turnId); assert.equal(turns.speechJobs, 4);
  releaseA(); releaseA(); releaseA2(); assert.equal(turns.speechJobs, 2);
  releaseB(); releaseB2(); assert.equal(turns.speechJobs, 0);
  now = 21; turns.prune(); assert.equal(turns.entries.size, 0);
});

async function fixture(run) {
  const directory = mkdtempSync(join(tmpdir(), 'exo-turn-boundaries-'));
  const options = { dataDir: directory, credentials: { resolve: async c => c } };
  const context = await createApp({ ...options, ...run.options });
  await new Promise(r => context.app.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${context.app.address().port}`;
  const post = (path, input, signal) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, ...(input !== undefined && { body: JSON.stringify(input) }), signal });
  try { await run.body(context, post); }
  finally { await context.close(); assert(resolve(directory).startsWith(resolve(tmpdir()) + sep)); rmSync(directory, { recursive: true, force: true }); }
}

test('HTTP concurrent same UUID generates once; registry flood leaves legacy chat and speech compatible', async () => {
  let started, release, calls = 0;
  await fixture({ options: {
    fetchImpl: async () => { calls++; started(); await new Promise(r => { release = r; }); return { ok: true, json: async () => ({ message: { content: 'fixture reply' } }) }; },
    windowsSpeechImpl: { synthesize: async () => Buffer.from('legacy-wav') },
  }, body: async (context, post) => {
    const id = randomUUID(); const began = new Promise(r => { started = r; });
    const input = { turnId: id, text: 'fixture', config: { provider: 'ollama', model: 'fixture' } };
    const pending = post('/api/chat', input); await began;
    const duplicates = await Promise.all(Array.from({ length: 12 }, () => post('/api/chat', input)));
    assert(duplicates.every(r => r.status === 409)); assert.equal(calls, 1);
    release(); assert.equal((await pending).status, 200);
    const flood = await Promise.all(Array.from({ length: 140 }, () => post(`/api/turns/${randomUUID()}/cancel`)));
    assert.equal(flood.filter(r => r.status === 200).length, 127);
    assert.equal(flood.filter(r => r.status === 429).length, 13);
    const before = context.store.history().length;
    assert.equal((await post('/api/chat', { turnId: randomUUID(), text: 'over cap' })).status, 429);
    assert.equal(context.store.history().length, before);
    const legacy = await (await post('/api/chat', { text: 'old offline' })).json();
    assert.equal(legacy.provider, 'offline'); assert(!('segments' in legacy)); assert.equal(legacy.user.turnId, legacy.assistant.turnId);
    assert.equal((await post('/api/speech', { text: 'old speech', voice: 0 })).status, 200);
    assert.equal(context.budget.status().usedCalls, 0);
  } });
});

test('explicit UUID cancellation/disconnect retain reserve and lock until late provider settlement', async () => {
  let began, release, calls = 0, signal;
  await fixture({ options: { fetchImpl: async (_url, request) => {
    signal = request.signal; calls++;
    assert.equal(JSON.parse(request.body).max_tokens, 128);
    began(); await new Promise(r => { release = r; }); // no real network; deliberately ignore abort
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ text: 'fixture only', emotion: 'calm' }) } }], usage: { prompt_tokens: 20, completion_tokens: 10 } }) };
  } }, body: async (context, post) => {
    context.budget.now = () => Date.parse(PRICING.verifiedAt) + 1000;
    const input = id => ({ turnId: id, text: 'fixture', remoteChat: true, confirmed: true, config: { provider: 'deepseek', model: 'deepseek-flash', apiKey: 'fake-fixture-key' } });
    for (const disconnect of [false, true]) {
      const id = randomUUID(), controller = new AbortController();
      const started = new Promise(r => { began = r; });
      const pending = post('/api/chat', input(id), controller.signal).catch(() => null); await started;
      const reserve = context.budget.status().reservedCny;
      if (disconnect) { controller.abort(); await pending; for (let i = 0; i < 30 && !signal.aborted; i++) await new Promise(r => setTimeout(r, 5)); }
      else await post(`/api/turns/${id}/cancel`);
      assert(signal.aborted);
      assert.equal((await post('/api/chat', input(randomUUID()))).status, 409);
      assert.equal(context.budget.status().reservedCny, reserve);
      release(); const response = await pending; if (response) assert.equal(response.status, 409);
      for (let i = 0; i < 30 && context.budget.status().records.at(-1).status === 'reserved'; i++) await new Promise(r => setTimeout(r, 5));
      assert.equal(context.budget.status().reservedCny, reserve); assert.equal(context.store.history().length, 0);
    }
    assert.equal(calls, 2); assert.equal(context.budget.status().usedCalls, 2); assert.deepEqual(context.store.list(), []);
  } });
});

test('manual expression is explicit, bounded and cannot change segment text', async () => {
  const emotions = [];
  await fixture({ options: { localTtsImpl: { voices: () => [{ id: 'fixture', emotions: ['neutral', 'happy'] }], synthesize: async input => { emotions.push(input.emotion); return Buffer.from('fixture wav'); } } }, body: async (_context, post) => {
    const result = await (await post('/api/chat', { turnId: randomUUID(), text: 'offline expression' })).json();
    const input = { backend: 'gpt-sovits', turnId: result.turnId, ...result.segments[0], referenceId: 'fixture', emotion: 'happy' };
    assert.equal((await post('/api/speech', input)).status, 400);
    const manual = { ...input, emotion: result.segments[0].emotion, expressionMode: 'manual', referenceEmotion: 'happy' };
    const audio = await post('/api/speech', manual); assert.equal(audio.status, 200); assert.equal(audio.headers.get('X-Exo-Emotion'), 'happy');
    assert.deepEqual(emotions, ['happy']);
    assert.equal((await post('/api/speech', { ...manual, text: 'wrong text' })).status, 400);
    assert.equal((await post('/api/speech', { ...manual, emotion: 'fake' })).status, 400);
    const unsupported = await post('/api/speech', { ...manual, referenceEmotion: 'angry' }); assert.equal(unsupported.status, 400); assert.equal((await unsupported.json()).code, 'UNSUPPORTED_REFERENCE_EMOTION');
    assert.equal((await post('/api/speech', { ...input, expressionMode: 'fake', emotion: 'neutral' })).status, 400);
    assert.equal(emotions.length, 1);
  } });
});
