// Windows ordinary-user lifecycle. No execution-policy changes or elevation.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { open, mkdir, readFile, writeFile, unlink, realpath, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const exec = promisify(execFile);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const rootId = createHash('sha256').update(root.toLowerCase()).digest('hex');
const logDir = join(root, '.runtime/services');
const psQuote = value => `'${String(value).replaceAll("'", "''")}'`;
const ps = async command => (await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 10000, maxBuffer: 32000 })).stdout.trim();
const receiptFile = name => join(logDir, `${name}.receipt.json`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const services = [
  { name: 'app', port: 3000, script: join(root, 'server/index.js'), executable: process.execPath, identity: 'project-exo', health: '/api/health' },
  { name: 'tts', port: 9880, script: join(root, 'scripts/run-local-tts.py'), executable: join(root, '.runtime/tts-venv/Scripts/python.exe'), identity: 'project-exo-tts', health: '/health' },
];

export function ownsProcess(service, info, projectRoot = root) {
  if (!info?.ExecutablePath || !info.CommandLine) return false;
  const expected = resolve(service.script).toLowerCase();
  // All managed launches use an absolute, quoted entrypoint. Relative legacy
  // processes cannot prove their working directory, and must be migrated once.
  const argumentsList = [...info.CommandLine.matchAll(/"([^"\r\n]+)"|([^\s"]+)/g)].map(m => m[1] || m[2]);
  const scriptOwned = argumentsList[1]?.toLowerCase() === expected;
  const exe = resolve(info.ExecutablePath).toLowerCase();
  const executableOwned = service.name === 'app' ? exe === process.execPath.toLowerCase()
    : exe.startsWith(resolve(projectRoot, '.runtime').toLowerCase() + sep) && basename(exe) === 'python.exe';
  return scriptOwned && executableOwned;
}

async function processInfo(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) throw Error('Invalid PID.');
  const output = await ps(`$ErrorActionPreference='Stop'; Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' | Select-Object ProcessId,ExecutablePath,CommandLine,@{Name='CreatedAt';Expression={$_.CreationDate.ToUniversalTime().ToString('o')}} | ConvertTo-Json -Compress`);
  return output ? JSON.parse(output) : null;
}
async function receipt(name) {
  try { const file = receiptFile(name); if ((await stat(file)).size > 4096) throw Error('Invalid service receipt.'); return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function inspect(service) {
  const output = (await exec('netstat.exe', ['-ano', '-p', 'TCP'], { windowsHide: true, timeout: 5000 })).stdout;
  const pids = new Set(output.split(/\r?\n/).map(line => line.trim().split(/\s+/)).filter(p => p.length === 5 && p[1].endsWith(`:${service.port}`) && p[3] === 'LISTENING').map(p => Number(p[4])));
  if (pids.size > 1) throw Error(`Port ${service.port} has multiple listeners. No process was changed.`);
  const saved = pids.size ? null : await receipt(service.name);
  const pid = pids.size ? [...pids][0] : saved?.pid;
  if (!pid) return null;
  const info = await processInfo(pid);
  if (saved && (!info || info.CreatedAt !== saved.createdAt)) return null;
  if (!ownsProcess(service, info)) throw Error(`Port ${service.port} / PID ${pid} cannot be verified as this project's service. No process was changed. Close an old relative-path launch yourself, then retry.`);
  return { ...info, listening: pids.size > 0 };
}
async function healthy(service, info) {
  if (!info?.listening) return false;
  try {
    const response = await fetch(`http://127.0.0.1:${service.port}${service.health}`, { redirect: 'error', signal: AbortSignal.timeout(2000) });
    if (!response.ok) return false;
    const health = await response.json();
    return health.service === service.identity && health.pid === info.ProcessId && health.rootId === rootId && health.ready === true;
  } catch { return false; }
}
async function lock() {
  await mkdir(logDir, { recursive: true });
  if (!(await realpath(logDir)).toLowerCase().startsWith((await realpath(root)).toLowerCase() + sep)) throw Error('Lifecycle directory escapes project.');
  const file = join(logDir, 'command.lock');
  const current = await processInfo(process.pid);
  for (let attempt = 0; attempt < 2; attempt++) {
    try { const handle = await open(file, 'wx'); await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: current.CreatedAt })); await handle.close(); return () => unlink(file); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const previous = JSON.parse(await readFile(file, 'utf8')), owner = await processInfo(previous.pid);
      if (owner?.CreatedAt === previous.createdAt) throw Error('Another lifecycle command is running. Retry when it finishes.');
      await unlink(file); // A stale receipt only; never stop its PID.
    }
  }
  throw Error('Could not acquire lifecycle lock.');
}

async function main() {
  if (process.platform !== 'win32') throw Error('This launcher supports Windows. See README for manual commands.');
  const action = process.argv[2] || 'status', chosen = process.argv.includes('--app-only') ? [services[0]] : services;
  if (!['start', 'stop', 'status'].includes(action)) throw Error('Usage: node scripts/exo-local.mjs start|stop|status [--app-only]');
  const release = await lock();
  try {
    // Preflight every service before changing any process.
    const observed = new Map(); for (const service of chosen) observed.set(service.name, await inspect(service));
    if (action === 'stop') {
      const app = observed.get('app');
      if (app?.listening) {
        if (!await healthy(services[0], app)) throw Error('App health identity unavailable. No process was stopped.');
        const status = await (await fetch('http://127.0.0.1:3000/api/status', { signal: AbortSignal.timeout(3000), redirect: 'error' })).json();
        if (status.localTts.active || status.localTts.pending > 0) throw Error('TTS is generating. Stop playback, wait for the queue to drain, then retry.');
      }
      for (const service of chosen) {
        const original = observed.get(service.name);
        if (!original) { console.log(`${service.name}: already stopped`); continue; }
        const current = await inspect(service);
        if (current?.ProcessId !== original.ProcessId || current.CreatedAt !== original.CreatedAt) throw Error('Process changed after verification. No further process was stopped.');
        // Native command checks identity again immediately before termination.
        await ps(`$ErrorActionPreference='Stop'; $p=Get-CimInstance Win32_Process -Filter 'ProcessId=${current.ProcessId}'; if (!$p -or $p.CreationDate.ToUniversalTime().ToString('o') -ne ${psQuote(current.CreatedAt)} -or $p.CommandLine -ne ${psQuote(current.CommandLine)} -or $p.ExecutablePath -ne ${psQuote(current.ExecutablePath)}) { throw 'Process identity changed' }; $target=Get-Process -Id ${current.ProcessId}; Stop-Process -InputObject $target -ErrorAction Stop; if (!$target.WaitForExit(8000)) { throw 'Verified process did not exit in time' }`);
        await unlink(receiptFile(service.name)).catch(error => { if (error.code !== 'ENOENT') throw error; });
        console.log(`${service.name}: stopped verified PID ${current.ProcessId}`);
      }
      return;
    }
    if (action === 'start') {
      for (const path of ['node_modules/vite/package.json', 'dist/index.html']) if (!existsSync(join(root, path))) throw Error(`Missing ${path}. Run npm.cmd ci / npm.cmd run build yourself. No downloads were started.`);
      if (chosen.length > 1) for (const path of ['.runtime/tts-venv/Scripts/python.exe', '.runtime/GPT-SoVITS/api_v2.py', '.runtime/GPT-SoVITS/GPT_SoVITS/pretrained_models/s1v3.ckpt', '.runtime/GPT-SoVITS/GPT_SoVITS/pretrained_models/v2Pro/s2Gv2ProPlus.pth']) {
        if (!existsSync(join(root, path))) throw Error(`TTS resource missing: ${path}. See docs/local-tts.md, or add --app-only for demo. No downloads were started.`);
      }
      for (const service of chosen) {
        const existing = observed.get(service.name);
        if (existing) { console.log(`${service.name}: reused verified PID ${existing.ProcessId}${existing.listening ? '' : ' (loading)'}`); continue; }
        const out = await open(join(logDir, `${service.name}.out.log`), 'w'), err = await open(join(logDir, `${service.name}.err.log`), 'w');
        const child = spawn(service.executable, [service.script], { cwd: root, detached: true, windowsHide: true, stdio: ['ignore', out.fd, err.fd] });
        await new Promise((accept, reject) => { child.once('spawn', accept); child.once('error', reject); });
        child.unref(); await out.close(); await err.close();
        const launched = await processInfo(child.pid);
        if (!ownsProcess(service, launched)) throw Error(`${service.name} exited or identity unavailable after launch. Inspect .runtime/services logs.`);
        await writeFile(receiptFile(service.name), JSON.stringify({ pid: child.pid, createdAt: launched.CreatedAt }));
        console.log(`${service.name}: launched PID ${child.pid}; logs .runtime/services/${service.name}.*.log`);
      }
      await sleep(1000);
    }
    let allReady = true;
    for (const service of chosen) {
      const info = await inspect(service), ready = await healthy(service, info); allReady &&= ready;
      console.log(`${service.name}: ${info ? `PID ${info.ProcessId}, ${info.listening ? 'listening' : 'loading'}, ready=${ready}` : 'stopped'}`);
    }
    console.log('Open http://127.0.0.1:3000. TTS cold start takes time: rerun local:status or refresh voices. No API calls were made.');
    if (action === 'status' && !allReady) process.exitCode = 1;
  } finally { await release(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(error.message); process.exitCode = 1;
});
