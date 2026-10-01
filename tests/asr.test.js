import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAsrHandler, runAsrProcess, pcmDuration, validateAsrAudio } from '../server/asr.js';

function wav(seconds = 1) {
  const bytes = Buffer.alloc(44 + Math.round(seconds * 32000));
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40); return bytes;
}
async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'exo-asr-test-'));
  const runtime = join(root, 'runtime'), temporary = join(root, 'temporary');
  await mkdir(join(runtime, 'asr/whisper-cpp/bin'), { recursive: true }); await mkdir(join(runtime, 'tools/ffmpeg'), { recursive: true }); await mkdir(temporary);
  for (const path of ['tools/ffmpeg/ffmpeg.exe', 'asr/whisper-cpp/ggml-base.bin', ...['whisper-cli.exe', 'ggml-base.dll', 'ggml-cpu.dll', 'ggml.dll', 'whisper.dll'].map(x => 'asr/whisper-cpp/bin/' + x)]) await writeFile(join(runtime, path), 'test');
  const calls = [];
  const runProcess = async (command, args, { signal }) => {
    calls.push({ command, args, signal });
    if (signal.aborted) throw Object.assign(new Error(), { status: 499, code: 'cancelled' });
    if (args.includes('-i')) await writeFile(args.at(-1), wav(options.seconds || 1));
    else await writeFile(args.at(-1) + '.json', JSON.stringify({ transcription: [{ text: '本地草稿' }] }));
  };
  const handler = createAsrHandler({ runtimeRoot: runtime, tempRoot: temporary, runProcess, ...options });
  const server = http.createServer(async (req, res) => { if (!await handler(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await handler.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const post = (id = randomUUID(), body = wav(), headers = {}) => fetch(`${base}/api/asr/transcriptions/${id}`, { method: 'POST', headers: { 'Content-Type': 'audio/wav', ...headers }, body });
  return { base, post, calls, temporary, handler };
}

test('status never spawns and missing runtime is explicit', async t => {
  const f = await fixture(t); assert.equal((await (await fetch(f.base + '/api/asr/status')).json()).available, true); assert.equal(f.calls.length, 0);
  const unavailable = createAsrHandler({ runtimeRoot: join(f.temporary, 'missing') });
  const result = await new Promise(resolve => unavailable({ url: '/api/asr/status', method: 'GET', headers: { host: 'localhost:7' }, socket: { localPort: 7 } }, { writeHead(status) { this.status = status; }, end(data) { resolve(JSON.parse(data)); } }));
  assert.equal(result.available, false); assert.equal(result.code, 'runtime_unavailable');
});
test('bounded binary transcription uses fixed CPU arguments and cleans files', async t => {
  const f = await fixture(t); const id = randomUUID(); const response = await f.post(id);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { captureId: id, text: '本地草稿', backend: 'whisper.cpp-base-cpu', seconds: 1 });
  assert.equal(f.calls.length, 2); assert.ok(f.calls[0].args.includes('file,pipe')); assert.ok(f.calls[1].args.includes('--no-gpu')); assert.equal(f.calls[1].args[f.calls[1].args.indexOf('--threads') + 1], '2');
  await new Promise(resolve => setTimeout(resolve, 30)); assert.deepEqual(await readdir(f.temporary), []);
});
test('rejects paths, URLs, method, MIME/magic, cross-origin and oversized bodies without engine calls', async t => {
  const f = await fixture(t);
  for (const [path, init, expected] of [
    ['/api/asr/status?path=C:/secret', {}, 400], ['/api/asr/status', { method: 'POST' }, 405],
    ['/api/asr/status', { headers: { Origin: 'https://evil.example' } }, 403],
    ['/api/asr/status', { headers: { 'Sec-Fetch-Site': 'same-site' } }, 403],
    ['/api/asr/transcriptions/../../x', { method: 'POST' }, 400],
  ]) { const res = await fetch(f.base + path, init); assert.equal(res.status, expected === 400 && path.includes('..') ? 404 : expected); }
  assert.equal((await f.post(randomUUID(), 'http://evil', { 'Content-Type': 'application/json' })).status, 415);
  assert.equal((await f.post(randomUUID(), 'RIFF invalid')).status, 415);
  assert.equal((await f.post(randomUUID(), Buffer.alloc(8 * 1024 * 1024 + 1))).status, 413);
  assert.equal(f.calls.length, 0);
});
test('duration cap rejects before Whisper and cleanup works', async t => {
  const f = await fixture(t, { seconds: 31 }); assert.equal((await f.post()).status, 413); assert.equal(f.calls.length, 1); assert.deepEqual(await readdir(f.temporary), []);
  assert.throws(() => pcmDuration(wav(31)), /audio_too_long/); assert.throws(() => validateAsrAudio(Buffer.alloc(0), 'audio/wav'), /audio_size/);
});
test('cancel before upload is remembered and active cancellation keeps singleton until worker closes', async t => {
  let release, entered; const started = new Promise(resolve => entered = resolve);
  const f = await fixture(t, { runProcess: (_cmd, _args, { signal }) => new Promise((resolve, reject) => { entered(signal); release = () => reject(Object.assign(new Error(), { status: 499, code: 'cancelled' })); }) });
  const id = randomUUID(); await fetch(`${f.base}/api/asr/transcriptions/${id}/cancel`, { method: 'POST' });
  assert.equal((await f.post(id)).status, 409);
  const runningId = randomUUID(), running = f.post(runningId); const signal = await started;
  assert.equal((await f.post()).status, 409);
  await fetch(`${f.base}/api/asr/transcriptions/${runningId}/cancel`, { method: 'POST' }); assert.equal(signal.aborted, true);
  assert.equal((await f.post()).status, 409); release(); assert.equal((await running).status, 499); assert.deepEqual(await readdir(f.temporary), []);
});
test('disconnect aborts processing and cleans its directory', async t => {
  let entered, released; const started = new Promise(resolve => entered = resolve), ended = new Promise(resolve => released = resolve);
  const f = await fixture(t, { runProcess: (_cmd, _args, { signal }) => new Promise((_, reject) => { entered(); signal.addEventListener('abort', () => { released(); reject(Object.assign(new Error(), { status: 499, code: 'cancelled' })); }); }) });
  const controller = new AbortController(); const pending = fetch(`${f.base}/api/asr/transcriptions/${randomUUID()}`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav(), signal: controller.signal }).catch(() => null);
  await started; controller.abort(); await pending; await ended;
  await new Promise(resolve => setTimeout(resolve, 30)); assert.deepEqual(await readdir(f.temporary), []);
});
test('timeout aborts engine and cleanup', async t => {
  const f = await fixture(t, { timeoutMs: 100, runProcess: (_cmd, _args, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error(), { status: 499, code: 'cancelled' })))) });
  assert.equal((await f.post()).status, 504); assert.deepEqual(await readdir(f.temporary), []);
});
test('process cancellation terminates a real owned child and waits for close', async () => {
  const controller = new AbortController(); const running = runAsrProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { signal: controller.signal });
  setTimeout(() => controller.abort(), 80); await assert.rejects(running, /cancelled/);
});

for (const phase of ['decoder', 'recognizer']) test(`HTTP cancellation kills owned child during ${phase} and cleans before response`, async t => {
  let entered, closed = false; const started = new Promise(resolve => entered = resolve);
  const f = await fixture(t, { runProcess: async (_command, args, { signal }) => {
    if (phase === 'recognizer' && args.includes('-i')) { await writeFile(args.at(-1), wav()); return; }
    const processClosed = runAsrProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { signal });
    entered();
    try { await processClosed; } finally { closed = true; }
  } });
  const id = randomUUID(), running = f.post(id); await started;
  await fetch(`${f.base}/api/asr/transcriptions/${id}/cancel`, { method: 'POST' });
  assert.equal((await running).status, 499); assert.equal(closed, true); assert.deepEqual(await readdir(f.temporary), []);
});
test('pre-cancel TTL expires only at its explicit 60 second boundary', async t => {
  let now = 1000; const f = await fixture(t, { now: () => now }); const id = randomUUID();
  assert.equal((await fetch(`${f.base}/api/asr/transcriptions/${id}/cancel`, { method: 'POST' })).status, 200);
  now += 59999; assert.equal((await f.post(id)).status, 409);
  ++now; assert.equal((await f.post(id)).status, 200);
});

test('cancel ID capacity refuses new entries without dropping earlier cancellation', async t => {
  const f = await fixture(t), first = randomUUID();
  await fetch(`${f.base}/api/asr/transcriptions/${first}/cancel`, { method: 'POST' });
  let last;
  for (let i = 0; i < 127; i++) { last = randomUUID(); assert.equal((await fetch(`${f.base}/api/asr/transcriptions/${last}/cancel`, { method: 'POST' })).status, 200); }
  assert.equal((await fetch(`${f.base}/api/asr/transcriptions/${randomUUID()}/cancel`, { method: 'POST' })).status, 429);
  assert.equal((await fetch(`${f.base}/api/asr/transcriptions/${first}/cancel`, { method: 'POST' })).status, 200);
  assert.equal((await f.post(last)).status, 409); assert.equal((await f.post(first)).status, 409);
});
