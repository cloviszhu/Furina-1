// Actual local inference only. No chat, credential reads, registry edits or LLM.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { validateWav } from '../server/local-tts.js';
const base = 'http://127.0.0.1:3000', backend = 'http://127.0.0.1:9880';
const root = fileURLToPath(new URL('..', import.meta.url)), output = new URL('../artifacts/final-acceptance/', import.meta.url);
await mkdir(output, { recursive: true });
const getStatus = async () => (await (await fetch(base + '/api/status')).json());
const status = await getStatus(); assert.equal(status.localTts.ready, true);
const evidence = { time: new Date().toISOString(), initialBudget: status.budget, records: [], security: [], note: 'Real local PCM; machine checks do not establish listening quality, character similarity or LLM persona.' };
const voice = status.localTts.voices.find(v => v.id === 'ravdess-24-test'); assert.equal(voice.emotions.length, 6);
const synthesis = emotion => ({ backend: 'gpt-sovits', referenceId: voice.id, emotion, speed: 1, text: '今天辛苦了。让我们一起写好下一幕。' });
const post = (url, body, headers = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
for (const emotion of voice.emotions) {
  const start = performance.now(); const response = await post(base + '/api/speech', synthesis(emotion)); assert.equal(response.status, 200, await response.clone().text().then(s => s.slice(0,150)));
  const wav = Buffer.from(await response.arrayBuffer()); validateWav(wav);
  // Locate the actual PCM chunk, not a fixed header offset.
  let pcm, rate;
  for (let o = 12; o + 8 <= wav.length;) { const size = wav.readUInt32LE(o + 4), id = wav.toString('ascii', o, o + 4); if (id === 'fmt ') rate = wav.readUInt32LE(o + 12); if (id === 'data') pcm = wav.subarray(o + 8, o + 8 + size); o += size + 8 + size % 2; }
  let sum = 0, peak = 0, clipped = 0;
  for (let i = 0; i < pcm.length; i += 2) { const n = pcm.readInt16LE(i) / 32768; sum += n * n; peak = Math.max(peak, Math.abs(n)); if (Math.abs(n) > .999) clipped++; }
  const rms = Math.sqrt(sum / (pcm.length / 2)); assert(rms > .001);
  await writeFile(new URL(`${emotion}.wav`, output), wav);
  evidence.records.push({ emotion, bytes: wav.length, seconds: pcm.length / 2 / rate, rate, rms, peak, clippedFraction: clipped / (pcm.length / 2), latencySeconds: (performance.now() - start) / 1000, sha256: createHash('sha256').update(wav).digest('hex') });
}
const config = JSON.parse(await readFile(resolve(root, 'data/tts-config.json'), 'utf8')), ref = config.profiles[0].references.neutral;
const bounded = { text: '本地边界验收。', text_lang: 'zh', ref_audio_path: resolve(root, 'data/tts-references', ref.file), prompt_text: ref.text, prompt_lang: ref.language, text_split_method: 'cut5', batch_size: 1, parallel_infer: false, speed_factor: 1, seed: 42, media_type: 'wav', streaming_mode: false };
for (const [name, changes] of [['unregistered', { ref_audio_path: resolve(root, 'START.md') }], ['oversized-text', { text: 'x'.repeat(301) }], ['batch', { batch_size: 999 }], ['extra-resource', { sample_steps: 999 }], ['wrong-transcript', { prompt_text: 'unregistered' }]]) {
  const r = await post(backend + '/tts', { ...bounded, ...changes }); assert.equal(r.status, 400); evidence.security.push({ name, status: r.status });
}
for (const target of [base + '/api/status', backend + '/health']) for (const [name, headers] of [['Origin', { Origin: 'https://evil.example' }], ['cross-site', { 'Sec-Fetch-Site': 'cross-site' }]]) {
  const r = await fetch(target, { headers }); assert.equal(r.status, 403); evidence.security.push({ target, name, status: r.status });
}
// fetch normalizes Host; use a raw HTTP client so this is an actual hostile Host.
for (const target of [base + '/api/status', backend + '/health']) {
  const code = await new Promise((accept, reject) => { const r = http.get(target, { headers: { Host: 'evil.example' } }, res => { res.resume(); res.on('end', () => accept(res.statusCode)); }); r.on('error', reject); });
  assert.equal(code, 403); evidence.security.push({ target, name: 'Host', status: code });
}
const huge = await post(backend + '/tts', { text: 'x'.repeat(32001) }); assert.equal(huge.status, 413); evidence.security.push({ name: 'bounded-backend-body', status: huge.status });
const control = await fetch(backend + '/control?command=restart'); assert.equal(control.status, 403); evidence.security.push({ name: 'control-denied', status: control.status });
const invalid = await post(base + '/api/speech', { ...synthesis('neutral'), referenceId: '../../unregistered' }); assert.equal(invalid.status, 400);
// Real GPU serialized queue; later recovery proves validation failures did not poison it.
const first = post(base + '/api/speech', synthesis('neutral')), second = post(base + '/api/speech', synthesis('happy'));
let queued;
for (let i = 0; i < 50; i++) { queued = (await getStatus()).localTts; if (queued.active && queued.pending === 1) break; await new Promise(r => setTimeout(r, 50)); }
assert.equal(queued.active, true); assert.equal(queued.pending, 1);
for (const r of await Promise.all([first, second])) { assert.equal(r.status, 200); validateWav(Buffer.from(await r.arrayBuffer())); }
evidence.realQueue = { observed: { active: queued.active, pending: queued.pending }, recovered: true };
const final = await getStatus(); assert.equal(final.localTts.active, false); assert.equal(final.localTts.pending, 0); assert.equal(final.budget.usedCalls, 0); assert.equal(final.budget.reservedCny, 0);
evidence.final = { budget: final.budget, tts: { ready: final.localTts.ready, active: final.localTts.active, pending: final.localTts.pending } };
await writeFile(new URL('tts.json', output), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence));
