// Ordinary-user outage/recovery of verified project services, no data mutation.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateWav } from '../server/local-tts.js';
const exec = promisify(execFile), launcher = fileURLToPath(new URL('./exo-local.mjs', import.meta.url));
const destination = new URL('../artifacts/final-acceptance/', import.meta.url);
const evidence = { time: new Date().toISOString(), commands: [] };
const command = async args => { const r = await exec(process.execPath, [launcher, ...args], { windowsHide: true, timeout: 30000 }); evidence.commands.push({ args, ...r }); };
const status = async () => (await (await fetch('http://127.0.0.1:3000/api/status')).json());
const request = () => fetch('http://127.0.0.1:3000/api/speech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backend: 'gpt-sovits', text: '本地服务已经恢复。', referenceId: 'ravdess-24-test', emotion: 'neutral', speed: 1 }) });
try {
  for (let i = 0; i < 40; i++) { if ((await status()).localTts.ready) break; await new Promise(r => setTimeout(r, 1000)); }
  assert.equal((await status()).localTts.active, false);
  await command(['stop']); await command(['start', '--app-only']);
  assert.equal((await status()).localTts.ready, false);
  const responses = await Promise.all([request(), request()]);
  evidence.outage = [];
  for (const r of responses) { assert.equal(r.status, 502); evidence.outage.push({ status: r.status, error: await r.json() }); }
  // Offline status intentionally omits queue counters. ready=false can only be
  // returned after the owned active slot has drained (active returns busy-ready).
  const drained = await status(); assert.equal(drained.localTts.ready, false); evidence.queueDrainedAfterRealConnectionFailure = true;
  await command(['start']);
  for (let i = 0; i < 40; i++) { if ((await status()).localTts.ready) break; await new Promise(r => setTimeout(r, 1000)); }
  assert.equal((await status()).localTts.ready, true);
  const recovered = await request(); assert.equal(recovered.status, 200); const wav = Buffer.from(await recovered.arrayBuffer()); validateWav(wav);
  await mkdir(destination, { recursive: true }); await writeFile(new URL('recovery.wav', destination), wav);
  const final = await status(); assert.equal(final.budget.usedCalls, 0); assert.equal(final.budget.reservedCny, 0);
  evidence.recovered = { bytes: wav.length, appPid: final.pid, tts: await (await fetch('http://127.0.0.1:9880/health')).json(), budget: final.budget };
  await writeFile(new URL('service-loss.json', destination), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence));
} finally { await command(['start']); }
