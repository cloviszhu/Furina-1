import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir, writeFile, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectReference, ReferenceImports, MAX_REFERENCE_BYTES } from '../server/reference-import.js';
import { LocalTts, loadTtsConfig, validateWav } from '../server/local-tts.js';
import { createApp } from '../server/index.js';

// Synthesized sine tones only; never read user recordings or network audio.
export function fixtureWav({ seconds = 3.2, rate = 16000, channels = 1, amplitude = 4000 } = {}) {
  const count = Math.round(seconds * rate), wav = Buffer.alloc(44 + count * channels * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * channels * 2, 28); wav.writeUInt16LE(channels * 2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(count * channels * 2, 40);
  for (let i = 0; i < count; i++) for (let c = 0; c < channels; c++) wav.writeInt16LE(Math.round(Math.sin(i / rate * 440 * Math.PI * 2) * amplitude), 44 + (i * channels + c) * 2);
  return wav;
}
const metadata = (extra = {}) => ({ profileId: 'fixture-user', speakerId: 'fixture-speaker', label: 'Synthetic fixture only',
  source: 'Generated tone / no person', license: 'Test fixture only', text: '合成测试，不是真实录音。', language: 'zh', emotion: 'neutral', usageAllowed: true, previewConfirmed: true, sameSpeakerConfirmed: true, ...extra });

test('reference format/duration/size/silence/clipping checks precede safe PCM normalization', () => {
  const { wav, report } = inspectReference(fixtureWav({ rate: 48000, channels: 2 }));
  validateWav(wav, { minSeconds: 3, maxSeconds: 10 });
  assert.equal(wav.readUInt16LE(22), 1); assert.equal(wav.readUInt32LE(24), 32000); assert.equal(report.inputChannels, 2);
  assert.equal(report.clippedRatio, 0); assert.equal(report.gain, 1);
  for (const seconds of [2.9, 10.1]) assert.throws(() => inspectReference(fixtureWav({ seconds })), /3–10/);
  assert.throws(() => inspectReference(fixtureWav({ amplitude: 0 })), /静音/);
  assert.throws(() => inspectReference(fixtureWav({ amplitude: 32767 })), /削波/);
  assert.throws(() => inspectReference(Buffer.alloc(MAX_REFERENCE_BYTES + 1)), error => error.status === 413);
  const float = fixtureWav(); float.writeUInt16LE(3, 20); assert.throws(() => inspectReference(float), /PCM16/);
  const suffix = Buffer.concat([fixtureWav(), Buffer.from('x')]); suffix.writeUInt32LE(suffix.length - 8, 4); assert.throws(() => inspectReference(suffix), /尾部/);
});

test('staging is bounded and expires without persisting audio', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'exo-ref-stage-')); let now = 100;
  try {
    const imports = new ReferenceImports(directory, new LocalTts(null), { now: () => now });
    const first = imports.prepare(fixtureWav()); imports.prepare(fixtureWav()); imports.prepare(fixtureWav());
    assert.equal((await readdir(directory)).length, 0); assert.throws(() => imports.prepare(fixtureWav()), error => error.status === 429);
    now += 600001; assert.throws(() => imports.get(first.token), error => error.status === 404);
    const next = imports.prepare(fixtureWav()); imports.discard(next.token); assert.throws(() => imports.get(next.token));
    assert.throws(() => imports.get('../secret'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('confirmation requires rights/preview/speaker, safe IDs, neutral first and same speaker; reload persists', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'exo-ref-confirm-'));
  try {
    const tts = new LocalTts(null), imports = new ReferenceImports(directory, tts);
    const staged = imports.prepare(fixtureWav());
    for (const input of [{ usageAllowed: false }, { previewConfirmed: false }, { sameSpeakerConfirmed: false }, { profileId: '../secret' }, { speakerId: 'C:/secret' }, { emotion: 'happy' }, { language: 'xx' }]) {
      await assert.rejects(imports.confirm(staged.token, metadata(input))); assert.equal(tts.config, null);
    }
    await imports.confirm(staged.token, metadata()); assert.throws(() => imports.get(staged.token));
    const config = await loadTtsConfig(directory); assert.equal(config.profiles[0].speakerId, 'fixture-speaker');
    assert.match(config.profiles[0].references.neutral.file, /^import-[a-f0-9-]+\.wav$/);
    const next = imports.prepare(fixtureWav());
    await assert.rejects(imports.confirm(next.token, metadata({ speakerId: 'other-speaker', emotion: 'happy' })), /其他说话人/);
    await imports.confirm(next.token, metadata({ emotion: 'happy' }));
    assert.deepEqual(imports.list()[0].emotions, ['neutral', 'happy']);
    assert.equal((await loadTtsConfig(directory)).profiles[0].references.happy.speakerId, 'fixture-speaker');
    assert(!JSON.stringify(JSON.parse(await readFile(join(directory, 'tts-config.json'), 'utf8'))).includes('"path"'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('registry edits reject GPU busy and concurrent confirmation; unmanaged test profile cannot be overwritten', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'exo-ref-busy-'));
  try {
    const tts = new LocalTts(null), imports = new ReferenceImports(directory, tts), staged = imports.prepare(fixtureWav());
    tts.active = true; await assert.rejects(imports.confirm(staged.token, metadata()), error => error.status === 409); tts.active = false;
    const first = imports.confirm(staged.token, metadata()); await assert.rejects(imports.confirm(staged.token, metadata()), error => error.status === 409); await first;
    tts.config.profiles[0].managed = false;
    const next = imports.prepare(fixtureWav()); await assert.rejects(imports.confirm(next.token, metadata()), /测试声线/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('invalid existing registry is not replaced and no orphan import is kept after validation failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'exo-ref-atomic-'));
  try {
    const tts = new LocalTts({ endpoint: 'http://127.0.0.1:9880', profiles: [] }), imports = new ReferenceImports(directory, tts);
    await writeFile(join(directory, 'tts-config.json'), 'original');
    tts.config.profiles.push({ id: 'broken', references: {} });
    await assert.rejects(imports.confirm(imports.prepare(fixtureWav()).token, metadata()));
    assert.equal(await readFile(join(directory, 'tts-config.json'), 'utf8'), 'original');
    assert.deepEqual(await readdir(join(directory, 'tts-references')), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('HTTP binary upload previews locally, rejects cross-origin/path requests and confirms without TTS startup', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'exo-ref-http-'));
  const context = await createApp({ dataDir: directory, fetchImpl: async () => { throw Error('no TTS running'); } });
  await new Promise(r => context.app.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${context.app.address().port}`;
  const upload = (headers = {}) => fetch(url + '/api/reference-imports', { method: 'POST', headers: { 'Content-Type': 'audio/wav', ...headers }, body: fixtureWav() });
  try {
    assert.equal((await upload({ Origin: 'https://hostile.example' })).status, 403);
    assert.equal((await upload({ 'Content-Type': 'application/json' })).status, 415);
    const response = await upload(); assert.equal(response.status, 201); const staged = await response.json();
    const preview = await fetch(url + staged.previewUrl); assert.equal(preview.status, 200); validateWav(Buffer.from(await preview.arrayBuffer()));
    const malicious = await fetch(url + '/api/reference-imports/' + staged.token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metadata({ profileId: '../../secret' })) }); assert.equal(malicious.status, 400);
    const confirmed = await fetch(url + '/api/reference-imports/' + staged.token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metadata()) }); assert.equal(confirmed.status, 201);
    assert.equal((await fetch(url + staged.previewUrl)).status, 404);
    assert.equal((await (await fetch(url + '/api/reference-profiles')).json()).profiles[0].id, 'fixture-user');
    assert.equal((await (await fetch(url + '/api/status')).json()).localTts.ready, false);
    assert.equal((await (await fetch(url + '/api/health')).json()).service, 'project-exo');
  } finally { await context.close(); await rm(directory, { recursive: true, force: true }); }
});

test('source-by-id checks old events outside history limit and enforces character context', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'exo-source-id-')), context = await createApp({ dataDir: directory });
  await new Promise(r => context.app.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${context.app.address().port}`;
  try {
    const first = context.store.event('user', '最早消息');
    for (let i = 0; i < 10; i++) { const user = context.store.event('user', `later ${i}`); context.store.event('assistant', `reply ${i}`, { turnId: user.turnId }); }
    assert(!context.store.history().some(e => e.id === first.id));
    assert.equal((await (await fetch(url + `/api/sources/${first.id}?timeline=aftermath&style=natural`)).json()).valid, true);
    assert.equal((await (await fetch(url + `/api/sources/${first.id}?timeline=performer&style=quiet`)).json()).valid, false);
    context.store.save('最早消息', first.id); assert.equal(context.store.list()[0].sourceId, first.id);
  } finally { await context.close(); await rm(directory, { recursive: true, force: true }); }
});

test('reference directory junction cannot escape local data for registry reads or import writes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'exo-ref-junction-'));
  const data = join(directory, 'data'), outside = join(directory, 'outside-fixture');
  try {
    await mkdir(data); await mkdir(outside); await writeFile(join(outside, 'fixture.wav'), fixtureWav());
    await symlink(outside, join(data, 'tts-references'), process.platform === 'win32' ? 'junction' : 'dir');
    await writeFile(join(outside, 'registry-fixture.json'), 'invalid-json-fixture');
    await assert.rejects(loadTtsConfig(data, join(data, 'tts-references/registry-fixture.json')), /配置不能使用越界或重定向/);
    await writeFile(join(data, 'tts-config.json'), JSON.stringify({ endpoint: 'http://127.0.0.1:9880', profiles: [{ id: 'fixture', label: 'fixture', source: 'synthetic', license: 'test', usageAllowed: true, references: { neutral: { file: 'fixture.wav', text: 'test', language: 'en' } } }] }));
    await assert.rejects(loadTtsConfig(data), /越过本机数据目录/);
    const imports = new ReferenceImports(data, new LocalTts(null));
    await assert.rejects(imports.confirm(imports.prepare(fixtureWav()).token, metadata()), /越界/);
    assert.deepEqual((await readdir(outside)).sort(), ['fixture.wav', 'registry-fixture.json']);
    // Remove the junction itself using unlink before recursive fixture cleanup.
    await rm(join(data, 'tts-references'), { recursive: false, force: true });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
