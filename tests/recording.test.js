import test from 'node:test';
import assert from 'node:assert/strict';
import { RecordingController } from '../src/recording.js';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
function fixture(t, options = {}) {
  let stopped = 0, mic = 0, playback = 0, draft = '', uploads = 0;
  const response = (body, ok = true) => ({ ok, json: async () => body });
  class Recorder {
    static isTypeSupported() { return true; }
    constructor(_stream, { mimeType }) { this.mimeType = mimeType; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['recorded']) }); this.onstop(); }
  }
  const track = { stop: () => stopped++ }, stream = { getTracks: () => [track] };
  const calls = [];
  const controller = new RecordingController({ Recorder, getUserMedia: async () => { mic++; return stream; }, uuid: () => 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    fetchImpl: async (url, init) => { calls.push(url); if (url.endsWith('status')) return response({ available: true }); if (url.endsWith('/cancel')) return response({}); uploads++; return response({ captureId: controller.captureId, text: '识别草稿' }); },
    stopPlayback: () => playback++, getDraft: () => draft, applyDraft: text => { draft = text; }, ...options });
  t.after(() => controller.dispose());
  return { controller, stream, calls, response, get stopped() { return stopped; }, get mic() { return mic; }, get uploads() { return uploads; }, get playback() { return playback; }, get draft() { return draft; }, edit(text) { draft = text; controller.edited(); } };
}
test('no mic until start; stop closes tracks and gives draft without chat calls', async t => {
  const f = fixture(t); assert.equal(f.mic, 0); await f.controller.start(); assert.equal(f.playback, 1); assert.equal(f.controller.state, 'recording');
  f.controller.stop(); assert.equal(f.stopped, 1); await tick(); assert.equal(f.controller.state, 'draft'); assert.equal(f.draft, '识别草稿'); assert.equal(f.uploads, 1); assert.ok(f.calls.every(url => url.startsWith('/api/asr/')));
});
test('permission late after cancel/dispose closes returned tracks without recording', async t => {
  const pending = deferred(); const f = fixture(t, { getUserMedia: () => pending.promise });
  const starting = f.controller.start(); await tick(); f.controller.dispose(); pending.resolve(f.stream); await starting; assert.equal(f.stopped, 1); assert.equal(f.uploads, 0); assert.equal(f.controller.state, 'idle');
});
test('editing during recording or transcription prevents overwrite even after revert', async t => {
  const result = deferred(); const f = fixture(t, { fetchImpl: async url => url.endsWith('status') ? f.response({ available: true }) : result.promise });
  await f.controller.start(); f.controller.stop(); f.edit('我改过'); f.edit(''); result.resolve(f.response({ captureId: f.controller.captureId, text: '迟到草稿' })); await tick(); assert.equal(f.draft, ''); assert.equal(f.controller.state, 'draft');
});
test('late transcription after cancel cannot replace draft', async t => {
  const result = deferred(); const f = fixture(t, { fetchImpl: async url => url.endsWith('status') ? f.response({ available: true }) : url.endsWith('cancel') ? f.response({}) : result.promise });
  await f.controller.start(); const id = f.controller.captureId; f.controller.stop(); f.controller.cancel(); f.edit('保留'); result.resolve(f.response({ captureId: id, text: '迟到' })); await tick(); assert.equal(f.draft, '保留'); assert.equal(f.controller.state, 'idle');
});
test('missing runtime, unsupported format, permission rejection and no device recover without upload', async t => {
  for (const name of ['NotAllowedError', 'NotFoundError', 'NotReadableError']) {
    const f = fixture(t, { getUserMedia: async () => { throw Object.assign(new Error(), { name }); } }); await f.controller.start(); assert.equal(f.controller.state, 'error'); assert.equal(f.uploads, 0);
  }
  const unavailable = fixture(t, { fetchImpl: async () => ({ ok: true, json: async () => ({ available: false }) }) }); await unavailable.controller.start(); assert.equal(unavailable.mic, 0); assert.equal(unavailable.controller.state, 'error');
  const unsupported = fixture(t, { Recorder: class { static isTypeSupported() { return false; } } }); await unsupported.controller.start(); assert.equal(unsupported.mic, 0); assert.equal(unsupported.controller.state, 'error');
});
test('30s timer stops tracks automatically; recording size cap rejects', async t => {
  const f = fixture(t, { maxMs: 10 }); await f.controller.start(); await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(f.stopped, 1); assert.equal(f.controller.state, 'draft');
  const big = fixture(t); await big.controller.start(); big.controller.recorder.ondataavailable({ data: new Blob([new Uint8Array(8 * 1024 * 1024 + 1)]) }); assert.equal(big.controller.state, 'error'); assert.equal(big.stopped, 1); assert.equal(big.uploads, 0);
});
