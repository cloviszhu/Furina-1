import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalTts, localEndpoint, validateWav, loadTtsConfig } from '../server/local-tts.js';
import { createApp } from '../server/index.js';

function wav(seconds = .1) {
  const samples = Math.floor(seconds * 16000), audio = Buffer.alloc(44 + samples * 2);
  audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(16000, 24); audio.writeUInt32LE(32000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
  audio.write('data', 36); audio.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) audio.writeInt16LE(Math.round(Math.sin(index / 16000 * 440 * Math.PI * 2) * 2000), 44 + index * 2);
  return audio;
}
const configuration = () => ({ endpoint: 'http://127.0.0.1:9880', profiles: [{ id: 'test', label: 'Licensed test', source: 'fixture', license: 'test only', usageAllowed: true, references: { neutral: { file: 'test.wav', path: 'C:/approved/test.wav', language: 'zh', text: '测试参考。' }, happy: { file: 'happy.wav', path: 'C:/approved/happy.wav', language: 'zh', text: '你好呀。' } } }] });
const response = () => new Response(wav(), { headers: { 'Content-Type': 'audio/wav' } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('TTS confines endpoint and checks complete bounded PCM instead of RIFF prefix only', () => {
  for (const url of ['https://127.0.0.1:9880', 'http://localhost:9880', 'http://example.com', 'http://user:pass@127.0.0.1', 'http://127.0.0.1/tts', 'http://127.0.0.1/?key=x']) assert.throws(() => localEndpoint(url));
  assert.equal(localEndpoint('http://127.0.0.1:9880'), 'http://127.0.0.1:9880');
  assert.equal(validateWav(wav()).length, wav().length);
  assert.throws(() => validateWav(wav().subarray(0, 44)));
  const wrong = wav(); wrong.writeUInt16LE(3, 20); assert.throws(() => validateWav(wrong));
  const duplicate = Buffer.concat([wav(), wav().subarray(36)]); duplicate.writeUInt32LE(duplicate.length - 8, 4); assert.throws(() => validateWav(duplicate), /重复/);
  assert.throws(() => validateWav(wav(.1), { minSeconds: 3, maxSeconds: 10 }));
});

test('registry requires source/license and refuses arbitrary reference paths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'exo-tts-'));
  try {
    await mkdir(join(directory, 'tts-references'));
    await writeFile(join(directory, 'tts-references/test.wav'), wav(3.2));
    await writeFile(join(directory, 'tts-references/happy.wav'), wav(3.2));
    const config = configuration();
    const save = () => writeFile(join(directory, 'tts-config.json'), JSON.stringify(config));
    await save(); const loaded = await loadTtsConfig(directory);
    assert.equal(loaded.profiles[0].references.neutral.path, join(directory, 'tts-references/test.wav'));
    config.profiles[0].usageAllowed = false; await save(); await assert.rejects(loadTtsConfig(directory));
    config.profiles[0].usageAllowed = true; config.profiles[0].references.neutral.file = '../tts-config.json';
    await save(); await assert.rejects(loadTtsConfig(directory), /越过/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('expression maps to registered reference without adding labels to speech; invalid inputs never dispatch', async () => {
  const requests = [];
  const tts = new LocalTts(configuration(), { fetchImpl: async (url, options) => { requests.push({ url, ...options, body: JSON.parse(options.body) }); return response(); } });
  const audio = await tts.synthesize({ text: '终于见面了。', referenceId: 'test', emotion: 'happy', speed: 1.1 });
  assert.equal(audio.length, wav().length); assert.equal(requests[0].body.text, '终于见面了。');
  assert.equal(requests[0].body.ref_audio_path, 'C:/approved/happy.wav'); assert.equal(requests[0].body.speed_factor, 1.1);
  assert.equal(requests[0].body.batch_size, 1); assert.equal(requests[0].body.streaming_mode, false); assert.equal(requests[0].redirect, 'error');
  for (const input of [{ referenceId: 'C:/secret.wav' }, { emotion: 'sad' }, { text: '[excited] hello' }, { text: '<emotion>开心</emotion>' }, { text: 'a'.repeat(301) }, { speed: 5 }]) {
    await assert.rejects(tts.synthesize({ text: '你好。', referenceId: 'test', ...input }));
  }
  assert.equal(requests.length, 1);
});

test('cancel rejects delivery immediately but holds GPU slot; queued cancellations never dispatch', async () => {
  const gate = deferred(); let calls = 0;
  const tts = new LocalTts(configuration(), { fetchImpl: async () => { calls++; if (calls === 1) await gate.promise; return response(); } });
  const active = new AbortController(), pending = new AbortController();
  const first = tts.synthesize({ text: '第一句。', referenceId: 'test', signal: active.signal });
  const firstRejected = assert.rejects(first, { name: 'AbortError' });
  const cancelled = tts.synthesize({ text: '不会被朗读。', referenceId: 'test', signal: pending.signal });
  const pendingRejected = assert.rejects(cancelled, { name: 'AbortError' });
  const next = tts.synthesize({ text: '下一句。', referenceId: 'test' });
  active.abort(); pending.abort(); await Promise.all([firstRejected, pendingRejected]);
  assert.equal(calls, 1); assert.equal(tts.active, true);
  assert.equal((await tts.status()).ready, true); assert.equal(calls, 1);
  gate.resolve(); await next; assert.equal(calls, 2); assert.equal(tts.active, false);
});

test('queue cap, backend error, invalid audio and timeout quarantine never overlap or retry', async () => {
  const gate = deferred(); let calls = 0;
  const tts = new LocalTts(configuration(), { maxPending: 1, fetchImpl: async () => { calls++; await gate.promise; return new Response('not audio'); } });
  const first = assert.rejects(tts.synthesize({ text: '一。', referenceId: 'test' }));
  const second = assert.rejects(tts.synthesize({ text: '二。', referenceId: 'test' }));
  await assert.rejects(tts.synthesize({ text: '三。', referenceId: 'test' }), error => error.status === 429);
  gate.resolve(); await Promise.all([first, second]); assert.equal(calls, 2);
  const timeout = new LocalTts(configuration(), { timeoutMs: 10, fetchImpl: async (_, options) => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true })) });
  await assert.rejects(timeout.synthesize({ text: '超时。', referenceId: 'test' }), /隔离/);
  await assert.rejects(timeout.synthesize({ text: '不再派发。', referenceId: 'test' }), error => error.status === 503);
});

test('HTTP integration accepts separate expression fields, aborts abandoned speech, refuses unsupported backends', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'exo-tts-http-'));
  const started = deferred(), cancelled = deferred(); let sent;
  const backend = {
    status: async () => ({ ready: true, voices: [{ id: 'test', engine: 'gpt-sovits', localService: true, emotions: ['neutral', 'happy'] }] }),
    synthesize: async input => {
      sent = input;
      if (input.text !== '取消。') return wav();
      started.resolve();
      return new Promise((_, reject) => input.signal.addEventListener('abort', () => { cancelled.resolve(); reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })); }, { once: true }));
    },
  };
  const context = await createApp({ dataDir: directory, localTtsImpl: backend });
  await new Promise(r => context.app.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${context.app.address().port}`;
  const post = (input, signal) => fetch(url + '/api/speech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal });
  try {
    assert.equal((await (await fetch(url + '/api/status')).json()).localTts.ready, true);
    const audio = await post({ backend: 'gpt-sovits', text: '你好。', referenceId: 'test', emotion: 'happy', speed: 1.2 });
    assert.equal(audio.status, 200); assert.equal((await audio.arrayBuffer()).byteLength, wav().length);
    assert.equal(sent.emotion, 'happy'); assert.equal(sent.text, '你好。'); assert.equal(sent.referenceId, 'test');
    assert.equal((await post({ backend: 'gpt-sovits', text: '你好。', stream: true })).status, 400);
    assert.equal((await post({ backend: 'browser', text: '你好。' })).status, 400);
    const controller = new AbortController();
    const request = post({ backend: 'gpt-sovits', text: '取消。', referenceId: 'test' }, controller.signal);
    const rejected = assert.rejects(request, { name: 'AbortError' });
    await started.promise; controller.abort(); await rejected;
    await Promise.race([cancelled.promise, new Promise((_, reject) => setTimeout(() => reject(new Error('disconnect did not cancel backend delivery')), 1000))]);
  } finally { await context.close(); await rm(directory, { recursive: true, force: true }); }
});

test('health probe uses loopback and disables unavailable backend instead of hiding fallback', async () => {
  let calls = 0;
  const tts = new LocalTts(configuration(), { fetchImpl: async (url, options) => { calls++; assert(url.endsWith('/openapi.json')); assert.equal(options.redirect, 'error'); return Response.json({ paths: { '/tts': { post: {} } } }); } });
  assert.equal((await tts.status()).ready, true); assert.equal(calls, 1);
  assert.equal((await new LocalTts(null).status()).ready, false);
  assert.equal((await new LocalTts(configuration(), { fetchImpl: async () => { throw new Error('offline'); } }).status()).ready, false);
});
