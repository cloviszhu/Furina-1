import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { createApp } from '../server/index.js';
import { runAsrProcess } from '../server/asr.js';
import { RecordingController } from '../src/recording.js';

function wav() {
  const bytes = Buffer.alloc(32044);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(32000, 40); return bytes;
}
async function fixture(t, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'exo-asr-integration-'));
  const runtime = join(root, 'runtime'), temporary = join(root, 'temporary');
  await mkdir(join(runtime, 'tools/ffmpeg'), { recursive: true });
  await mkdir(join(runtime, 'asr/whisper-cpp/bin'), { recursive: true });
  await mkdir(temporary);
  for (const file of ['tools/ffmpeg/ffmpeg.exe', 'asr/whisper-cpp/ggml-base.bin', ...['whisper-cli.exe', 'ggml-base.dll', 'ggml-cpu.dll', 'ggml.dll', 'whisper.dll'].map(n => 'asr/whisper-cpp/bin/' + n)]) await writeFile(join(runtime, file), 'fixture-not-executable');
  let modelCalls = 0; const workers = [];
  const app = await createApp({ dataDir: join(root, 'data'), credentials: { resolve: async () => { throw Error('Credential access forbidden'); } },
    fetchImpl: async () => { ++modelCalls; throw Error('External services forbidden'); },
    asrOptions: { runtimeRoot: runtime, tempRoot: temporary, runProcess: async (command, args, { signal }) => {
      workers.push({ command, args });
      assert.equal(signal.aborted, false);
      if (args.includes('-i')) await writeFile(args.at(-1), wav());
      else await writeFile(args.at(-1) + '.json', JSON.stringify({ transcription: [{ text: '我住在杭州。' }] }));
    }, ...overrides },
  });
  const originalClose = app.close.bind(app); let closed = false;
  app.close = async () => { if (closed) return; closed = true; await originalClose(); };
  await new Promise(r => app.app.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.app.address().port}`;
  const request = (path, options = {}) => fetch(base + path, options);
  const post = (id = randomUUID()) => request(`/api/asr/transcriptions/${id}`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav() });
  t.after(async () => { await app.close(); assert(resolve(root).startsWith(resolve(tmpdir()) + sep)); await rm(root, { recursive: true, force: true }); });
  const counts = () => ({ events: app.store.db.prepare('SELECT COUNT(*) AS n FROM events').get().n,
    memories: app.store.list().length, episodes: app.interaction.list({ contextKey: 'aftermath' }).items.length, usage: app.budget.status().usedCalls, modelCalls });
  return { app, base, request, post, temporary, workers, counts };
}

test('full app ASR inherits source gates and rejects unsafe forms before processing', async t => {
  const f = await fixture(t);
  for (const headers of [{ Host: 'evil.example' }, { Origin: 'https://evil.example' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' }]) {
    // Raw HTTP preserves an intentionally invalid Host; fetch normalizes it.
    const raw = (path, method = 'GET') => new Promise((resolveResponse, reject) => {
      const request = http.request(f.base + path, { method, headers: { ...headers, ...(method === 'POST' && { 'Content-Type': 'audio/wav' }) } }, response => { response.resume(); response.on('end', () => resolveResponse(response.statusCode)); });
      request.on('error', reject); request.end(method === 'POST' ? wav() : undefined);
    });
    assert.equal(await raw('/api/asr/status'), 403);
    assert.equal(await raw(`/api/asr/transcriptions/${randomUUID()}`, 'POST'), 403);
  }
  assert.equal((await f.request('/api/asr/status?path=secret')).status, 400);
  assert.equal((await f.request('/api/asr/status', { method: 'POST' })).status, 405);
  assert.equal((await f.request(`/api/asr/transcriptions/${randomUUID()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"url":"https://example.invalid"}' })).status, 415);
  const status = await (await f.request('/api/asr/status')).json(); assert.equal(status.available, true); assert.equal(status.offline, true);
  assert.equal(f.workers.length, 0); assert.deepEqual(f.counts(), { events: 0, memories: 0, episodes: 0, usage: 0, modelCalls: 0 });
});

test('recording controller through actual app HTTP yields editable draft only and clears audio before delivery', async t => {
  const f = await fixture(t);
  const source = f.app.store.event('user', '旧的隔离用户来源'); f.app.store.save('旧的隔离用户记忆', source.id);
  const before = f.counts(); const paths = []; let draft = '', mic = 0, stopped = 0, settle;
  const done = new Promise(r => { settle = r; });
  class Recorder {
    static isTypeSupported() { return true; }
    constructor() { this.mimeType = 'audio/wav'; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob([wav()], { type: 'audio/wav' }) }); this.onstop(); }
  }
  const controller = new RecordingController({ Recorder, getUserMedia: async () => { ++mic; return { getTracks: () => [{ stop() { ++stopped; } }] }; },
    fetchImpl: (path, options) => { paths.push(path); return f.request(path, options); },
    getDraft: () => draft, applyDraft: text => { draft = text; }, onState: state => { if (['draft', 'error'].includes(state.state)) settle(state); },
  });
  t.after(() => controller.dispose());
  assert.equal(mic, 0); assert.equal(paths.length, 0);
  await controller.start(); assert.equal(controller.state, 'recording'); controller.stop();
  assert.equal((await done).state, 'draft'); assert.equal(draft, '我住在杭州。'); assert.equal(stopped, 1);
  assert(paths.every(p => p.startsWith('/api/asr/'))); assert.equal(f.workers.length, 2);
  assert.deepEqual(await readdir(f.temporary), []); assert.deepEqual(f.counts(), before);
});

test('full app pre-cancel prevents processing and live cancellation drains before reuse', async t => {
  let entered, release; const began = new Promise(r => { entered = r; });
  const f = await fixture(t, { runProcess: (_command, _args, { signal }) => new Promise((_, reject) => {
    entered(signal); release = () => reject(Object.assign(Error('cancelled'), { status: 499, code: 'cancelled' }));
  }) });
  const early = randomUUID(); await f.request(`/api/asr/transcriptions/${early}/cancel`, { method: 'POST' }); assert.equal((await f.post(early)).status, 409);
  const id = randomUUID(), pending = f.post(id), signal = await began;
  assert.equal((await f.post()).status, 409);
  assert.equal((await f.request(`/api/asr/transcriptions/${id}/cancel`, { method: 'POST' })).status, 200); assert.equal(signal.aborted, true);
  assert.equal((await f.post()).status, 409); release(); assert.equal((await pending).status, 499);
  assert.deepEqual(await readdir(f.temporary), []); assert.equal((await (await f.request('/api/asr/status')).json()).busy, false);
  assert.deepEqual(f.counts(), { events: 0, memories: 0, episodes: 0, usage: 0, modelCalls: 0 });
});

test('128 pre-cancels cannot block active process cancellation or evict old IDs', async t => {
  let entered, closed = false, spawned = 0, now = 1000;
  const began = new Promise(r => { entered = r; });
  const f = await fixture(t, { now: () => now, runProcess: async (_command, args, { signal }) => {
    if (closed) {
      if (args.includes('-i')) await writeFile(args.at(-1), wav());
      else await writeFile(args.at(-1) + '.json', JSON.stringify({ transcription: [{ text: '恢复草稿' }] }));
      return;
    }
    ++spawned; const running = runAsrProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { signal }); entered();
    try { await running; } finally { closed = true; }
  } });
  const activeId = randomUUID(), pending = f.post(activeId); await began;
  let first;
  for (let i = 0; i < 128; i++) {
    const id = randomUUID(); first ??= id;
    assert.equal((await f.request(`/api/asr/transcriptions/${id}/cancel`, { method: 'POST' })).status, 200);
  }
  now = 2000;
  assert.equal((await f.request(`/api/asr/transcriptions/${activeId}/cancel`, { method: 'POST' })).status, 200);
  assert.equal((await pending).status, 499); assert.equal(closed, true); assert.equal(spawned, 1);
  assert.deepEqual(await readdir(f.temporary), []);
  assert.equal((await f.post(activeId)).status, 409); assert.equal((await f.post(first)).status, 409);
  assert.equal((await f.post()).status, 429); // Bounded extra active-cancel slot.
  assert.equal((await f.request(`/api/asr/transcriptions/${randomUUID()}/cancel`, { method: 'POST' })).status, 429);
  now = 61000; // The original 128 expire; active cancellation still retained.
  assert.equal((await f.post(activeId)).status, 409); assert.equal((await f.post()).status, 200);
  assert.deepEqual(f.counts(), { events: 0, memories: 0, episodes: 0, usage: 0, modelCalls: 0 });
});

test('app close aborts owned ASR child and waits for cleanup rather than a live request deadlock', async t => {
  let entered, closed = false; const began = new Promise(r => { entered = r; });
  const f = await fixture(t, { runProcess: async (_command, _args, { signal }) => {
    const running = runAsrProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { signal }); entered();
    try { await running; } finally { closed = true; }
  } });
  const pending = f.post(); await began; assert.equal(f.counts().events, 0);
  const closing = f.app.close(); assert.equal((await pending).status, 499); await closing;
  assert.equal(closed, true); assert.deepEqual(await readdir(f.temporary), []); assert.equal(f.app.app.listening, false);
});
