// Checks only the already-running local API. Writes private artifacts, no LLM.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { validateWav } from '../server/local-tts.js';
const base = 'http://127.0.0.1:3000', root = new URL('../artifacts/stage-three/', import.meta.url);
await mkdir(root, { recursive: true });
const status = async () => (await (await fetch(base + '/api/status')).json());
assert.equal((await status()).localTts.ready, true);
const records = [], began = performance.now();
const generate = async emotion => {
  const startedMs = performance.now() - began;
  const response = await fetch(base + '/api/speech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backend: 'gpt-sovits', text: '你终于来了。下一幕，就由我们一起写吧。', referenceId: 'ravdess-24-test', emotion, speed: 1 }) });
  assert.equal(response.status, 200);
  const audio = Buffer.from(await response.arrayBuffer()); validateWav(audio);
  await writeFile(new URL(`restart-${emotion}.wav`, root), audio);
  records.push({ emotion, startedMs, completedMs: performance.now() - began, bytes: audio.length });
};
const first = generate('neutral'), second = generate('happy');
let queued;
for (let i = 0; i < 20; i++) { queued = (await status()).localTts; if (queued.active && queued.pending === 1) break; await new Promise(r => setTimeout(r, 50)); }
assert.equal(queued.active, true); assert.equal(queued.pending, 1);
await Promise.all([first, second]);
const finished = await status();
assert.equal(finished.localTts.active, false); assert.equal(finished.localTts.pending, 0); assert.equal(finished.budget.usedCalls, 0);
const evidence = { time: new Date().toISOString(), queued, records, finished: { ttsReady: finished.localTts.ready, budgetCalls: finished.budget.usedCalls, reservedCny: finished.budget.reservedCny }, note: '真实 WAV/串行队列恢复；未人工试听，非芙宁娜声线验收。' };
await writeFile(new URL('service-recovery.json', root), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence));
