import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReferenceImports } from '../server/reference-import.js';
import { LocalTts, loadTtsConfig } from '../server/local-tts.js';
import { createApp } from '../server/index.js';

// Disposable synthetic audio only; no user assets or provider calls.
function tone() {
  const n = 51200, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i * 440 * Math.PI * 2 / 16000) * 4000), 44 + i * 2);
  return b;
}
const meta = (id, emotion = 'neutral') => ({ profileId: id, speakerId: `speaker-${id}`, label: `Fixture ${id}`, source: 'Synthetic fixture', license: 'Test only', text: 'Synthetic tone', language: 'en', emotion, usageAllowed: true, previewConfirmed: true, sameSpeakerConfirmed: true });
async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'exo-delete-'));
  try {
    let requests = 0;
    const tts = new LocalTts(null, { fetchImpl: async () => { requests++; throw Error('Must not call TTS'); } });
    const imports = new ReferenceImports(dir, tts);
    const original = join(dir, 'original-recording.wav'); await writeFile(original, tone());
    for (const [id, emotion] of [['one', 'neutral'], ['one', 'happy'], ['two', 'neutral']]) await imports.confirm(imports.prepare(tone()).token, meta(id, emotion));
    await run({ dir, tts, imports, original, requests: () => requests });
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test('expression deletion is recoverable, preserves original/other speaker, and rejects synthesis after reload', async () => fixture(async ({ dir, tts, imports, original, requests }) => {
  const before = await readFile(original), other = structuredClone(tts.config.profiles[1]), happy = tts.config.profiles[0].references.happy.file;
  const result = await imports.deletions.remove('one', { confirmed: true, emotion: 'happy' });
  assert.deepEqual(imports.list()[0].emotions, ['neutral']); assert.deepEqual(tts.config.profiles[1], other);
  assert.deepEqual(await readFile(original), before); assert(!(await readdir(join(dir, 'tts-references'))).includes(happy));
  assert.equal((await imports.deletions.list())[0].canRestore, true);
  const restarted = new LocalTts(await loadTtsConfig(dir));
  await assert.rejects(restarted.synthesize({ text: 'test', referenceId: 'one', emotion: 'happy' })); assert.equal(requests(), 0);
  const recovery = new ReferenceImports(dir, restarted);
  await recovery.deletions.restore(result.deletionId, { confirmed: true });
  assert.deepEqual(recovery.list()[0].emotions, ['neutral', 'happy']); assert.deepEqual(await recovery.deletions.list(), []);
  assert.equal((await loadTtsConfig(dir)).profiles[0].references.happy.file, happy);
  assert.deepEqual(await readFile(original), before);
}));

test('whole-profile deletion and restore survive restart without touching other profile', async () => fixture(async ({ dir, tts, imports, original }) => {
  const before = await readFile(original), expected = structuredClone(tts.config.profiles[0]), other = structuredClone(tts.config.profiles[1]);
  const result = await imports.deletions.remove('one', { confirmed: true });
  assert.deepEqual(tts.config.profiles, [other]);
  const restarted = new LocalTts(await loadTtsConfig(dir));
  await assert.rejects(restarted.synthesize({ text: 'test', referenceId: 'one' }));
  const recovery = new ReferenceImports(dir, restarted);
  assert.equal((await recovery.deletions.list())[0].canRestore, true);
  await recovery.deletions.restore(result.deletionId, { confirmed: true });
  assert.deepEqual(restarted.config.profiles.find(p => p.id === 'one'), expected);
  assert.deepEqual(restarted.config.profiles.find(p => p.id === 'two'), other);
  assert.deepEqual(await readFile(original), before);
}));

test('explicit confirmation, builtin protection, busy/queued and concurrent edits reject without changes', async () => fixture(async ({ dir, tts, imports }) => {
  const before = await readFile(join(dir, 'tts-config.json'));
  for (const input of [{}, { confirmed: false }, { confirmed: true, emotion: 'neutral' }, { confirmed: true, path: '../original-recording.wav' }]) await assert.rejects(imports.deletions.remove('one', input));
  tts.active = true; await assert.rejects(imports.deletions.remove('one', { confirmed: true }), e => e.status === 409); tts.active = false;
  tts.queue.push({}); await assert.rejects(imports.deletions.remove('one', { confirmed: true }), e => e.status === 409); tts.queue.pop();
  tts.quarantined = true; await assert.rejects(imports.deletions.remove('one', { confirmed: true }), e => e.status === 409); tts.quarantined = false;
  tts.config.profiles[1].managed = false;
  await assert.rejects(imports.deletions.remove('two', { confirmed: true }), e => e.status === 403); tts.config.profiles[1].managed = true;
  assert.deepEqual(await readFile(join(dir, 'tts-config.json')), before);
  const first = imports.deletions.remove('one', { confirmed: true, emotion: 'happy' });
  await assert.rejects(imports.deletions.remove('two', { confirmed: true }), e => e.status === 409);
  const staged = imports.prepare(tone()); await assert.rejects(imports.confirm(staged.token, meta('three')), e => e.status === 409);
  const result = await first;
  tts.active = true; await assert.rejects(imports.deletions.restore(result.deletionId, { confirmed: true }), e => e.status === 409); tts.active = false;
}));

test('stale registry removal rolls back archive/copies; restore rejects tamper and conflicts', async () => fixture(async ({ dir, tts, imports }) => {
  const destination = join(dir, 'tts-config.json'), original = await readFile(destination), names = await readdir(join(dir, 'tts-references'));
  const edited = JSON.parse(original); edited.profiles[0].label = 'External edit'; await writeFile(destination, JSON.stringify(edited));
  await assert.rejects(imports.deletions.remove('one', { confirmed: true }), e => e.status === 409);
  assert.deepEqual(await readdir(join(dir, 'tts-references')), names); assert.deepEqual(await readdir(join(dir, 'tts-reference-trash')), []);
  await writeFile(destination, original);
  const result = await imports.deletions.remove('one', { confirmed: true, emotion: 'happy' });
  const archive = join(dir, 'tts-reference-trash', result.deletionId), manifest = JSON.parse(await readFile(join(archive, 'manifest.json'))), audioPath = join(archive, manifest.files[0].file), bytes = await readFile(audioPath);
  await writeFile(audioPath, 'corrupted'); await assert.rejects(imports.deletions.restore(result.deletionId, { confirmed: true }), e => e.status === 409);
  assert(!tts.config.profiles[0].references.happy); await writeFile(audioPath, bytes);
  await imports.confirm(imports.prepare(tone()).token, meta('one', 'happy'));
  const before = await readFile(destination); assert.equal((await imports.deletions.list())[0].canRestore, false);
  await assert.rejects(imports.deletions.restore(result.deletionId, { confirmed: true }), e => e.status === 409);
  assert.deepEqual(await readFile(destination), before);
}));

test('actual LocalTts queue blocks deletion until both registered requests finish', async () => fixture(async ({ dir, tts, imports }) => {
  const pending = [], called = [], audio = tone();
  tts.fetch = async (url, options) => {
    called.push(JSON.parse(options.body).ref_audio_path);
    await new Promise(resolve => pending.push(resolve));
    return new Response(audio, { headers: { 'Content-Type': 'audio/wav' } });
  };
  const first = tts.synthesize({ text: 'first', referenceId: 'one' });
  const second = tts.synthesize({ text: 'second', referenceId: 'two' });
  assert.equal(tts.active, true); assert.equal(tts.queue.length, 1);
  const before = await readFile(join(dir, 'tts-config.json'));
  await assert.rejects(imports.deletions.remove('one', { confirmed: true }), e => e.status === 409);
  await assert.rejects(imports.deletions.remove('two', { confirmed: true }), e => e.status === 409);
  assert.deepEqual(await readFile(join(dir, 'tts-config.json')), before);
  pending.shift()(); await first; await new Promise(resolve => setImmediate(resolve));
  assert.equal(tts.active, true); pending.shift()(); await second; await new Promise(resolve => setImmediate(resolve));
  assert.equal(tts.active, false); assert.equal(called.length, 2);
  await imports.deletions.remove('one', { confirmed: true }); assert.deepEqual(imports.list().map(p => p.id), ['two']);
}));

test('archive junction and managed-file path escape are rejected, outside original remains intact', async () => fixture(async ({ dir, imports, tts, original }) => {
  const before = await readFile(original);
  tts.config.profiles[0].references.happy.file = '../original-recording.wav';
  await assert.rejects(imports.deletions.remove('one', { confirmed: true }), e => e.status === 403);
  const outside = join(dir, 'outside'); await mkdir(outside); await writeFile(join(outside, 'sentinel'), 'original');
  const trash = join(dir, 'tts-reference-trash'); await symlink(outside, trash, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(imports.deletions.list(), e => e.status === 403);
  assert.deepEqual(await readFile(original), before); assert.deepEqual(await readdir(outside), ['sentinel']);
  await rm(trash, { recursive: false, force: true });
}));

test('deletion API retains Origin protections and refuses deleted voice without invoking backend', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'exo-delete-http-')); let requests = 0;
  const imports = new ReferenceImports(dir, new LocalTts(null)); await imports.confirm(imports.prepare(tone()).token, meta('one'));
  const context = await createApp({ dataDir: dir, fetchImpl: async () => { requests++; throw Error('no backend'); } });
  await new Promise(r => context.app.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${context.app.address().port}`;
  const deletion = (body, headers = {}) => fetch(url + '/api/reference-profiles/one', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  try {
    assert.equal((await deletion({ confirmed: true }, { Origin: 'https://hostile.example' })).status, 403);
    assert.equal((await deletion({ confirmed: false })).status, 400);
    const result = await deletion({ confirmed: true }); assert.equal(result.status, 200); const removed = await result.json();
    assert.equal((await (await fetch(url + '/api/reference-profiles')).json()).profiles.length, 0);
    const before = requests;
    const speech = await fetch(url + '/api/speech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backend: 'gpt-sovits', text: 'test', referenceId: 'one', emotion: 'neutral' }) });
    assert.notEqual(speech.status, 200); assert.equal(requests, before);
    assert.equal((await fetch(url + `/api/reference-deletions/${removed.deletionId}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed: true }) })).status, 200);
  } finally { await context.close(); await rm(dir, { recursive: true, force: true }); }
});
