// Local service evidence. A temporary unrelated loopback server must survive
// both start and stop refusal. Uses no keys and only this project's processes.
import { execFile, fork } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const exec = promisify(execFile), launcher = fileURLToPath(new URL('./exo-local.mjs', import.meta.url));
const evidence = { date: new Date().toISOString(), ordinaryUser: true, noExecutionPolicyChanges: true, commands: [] };
async function command(action, extra = [], expected = 0) {
  let result;
  try { result = { code: 0, ...await exec(process.execPath, [launcher, action, ...extra], { windowsHide: true, timeout: 30000 }) }; }
  catch (error) { result = { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
  evidence.commands.push({ action, extra, ...result }); assert.equal(result.code, expected, JSON.stringify(result)); return result;
}
const health = async port => (await fetch(`http://127.0.0.1:${port}${port === 3000 ? '/api/health' : '/health'}`, { signal: AbortSignal.timeout(2500) })).json();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let foreign;
try {
  const initial = { app: await health(3000), tts: await health(9880) }; evidence.initial = initial;
  await command('start'); assert.equal((await health(3000)).pid, initial.app.pid); assert.equal((await health(9880)).pid, initial.tts.pid);
  await command('stop', ['--app-only']);
  const code = "const s=require('http').createServer((q,r)=>r.end('unrelated-fixture'));s.listen(3000,'127.0.0.1',()=>process.send('ready'));process.on('message',m=>{if(m==='close')s.close(()=>process.exit(0))});";
  // eval node has no project entrypoint, so must be treated as unrelated.
  foreign = fork('-e', [code], { execArgv: [], windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  await new Promise((accept, reject) => { const timer = setTimeout(() => reject(Error('foreign fixture failed to listen')), 6000); foreign.once('message', () => { clearTimeout(timer); accept(); }); foreign.once('error', reject); });
  evidence.foreignPid = foreign.pid;
  await command('start', [], 1); await command('stop', [], 1);
  assert.equal(await (await fetch('http://127.0.0.1:3000')).text(), 'unrelated-fixture'); assert.equal((await health(9880)).pid, initial.tts.pid);
  evidence.foreignSurvived = true;
  await new Promise(r => { foreign.once('exit', r); foreign.send('close'); }); foreign = null;
  await command('stop'); await command('start');
  // Immediately repeat: cold GPU initialization must reuse the pending PID.
  const repeated = await command('start'); assert(!repeated.stdout.includes('launched PID'));
  for (let i = 0; i < 30; i++) { try { if ((await health(3000)).ready && (await health(9880)).ready) break; } catch {} await sleep(1000); }
  await command('status'); evidence.final = { app: await health(3000), tts: await health(9880) };
  const status = await (await fetch('http://127.0.0.1:3000/api/status')).json(); assert.equal(status.budget.usedCalls, 0); assert.equal(status.localTts.ready, true); evidence.zeroPaidCalls = true;
  assert.notEqual(evidence.final.app.pid, initial.app.pid); assert.notEqual(evidence.final.tts.pid, initial.tts.pid);
  evidence.cleanRestart = true;
  const destination = new URL('../artifacts/stage-four/', import.meta.url); await mkdir(destination, { recursive: true }); await writeFile(new URL('service-lifecycle.json', destination), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  if (foreign?.connected) await new Promise(r => { foreign.once('exit', r); foreign.send('close'); });
}
