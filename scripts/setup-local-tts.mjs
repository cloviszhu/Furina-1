// Reproducible user-space setup. No global Python, admin, or policy changes.
import { mkdir, readFile, access, rename, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const runtime = join(root, '.runtime');
const uv = join(runtime, 'tools/uv/uv.exe');
const python = join(runtime, 'tts-venv/Scripts/python.exe');
const repo = join(runtime, 'GPT-SoVITS');
const revision = '48b1a0169a28582a8984402f82cf438d3bfa6aca';
const environment = { ...process.env, UV_PYTHON_INSTALL_DIR: join(runtime, 'python'), UV_CACHE_DIR: join(runtime, 'uv-cache'), RUST_LOG: 'warn' };
const exists = path => access(path).then(() => true, () => false);
async function run(binary, args, capture = false) {
  return new Promise((success, failure) => {
    const child = spawn(binary, args, { cwd: root, env: environment, windowsHide: true, stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
    let output = ''; if (capture) child.stdout.on('data', chunk => { output += chunk; });
    child.on('error', failure);
    child.on('close', code => code === 0 ? success(output.trim()) : failure(new Error(`${binary} failed (${code})`)));
  });
}
async function download(url, path, max = 24 * 1024 * 1024) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Official download failed (${response.status})`);
  const file = await open(path + '.part', 'w'); let bytes = 0;
  try { for await (const chunk of response.body) { bytes += chunk.length; if (bytes > max) throw new Error('Official tool download exceeded bound'); await file.write(chunk); } }
  finally { await file.close(); }
  await rename(path + '.part', path);
}

if (process.platform !== 'win32') throw new Error('This setup is for Windows; the Node adapter tests are portable.');
if (!process.argv.includes('--verify')) {
  await mkdir(join(runtime, 'tools'), { recursive: true });
  if (!await exists(uv)) {
    const archive = join(runtime, 'tools/uv.zip'), sum = archive + '.sha256';
    const base = 'https://github.com/astral-sh/uv/releases/download/0.12.21/uv-x86_64-pc-windows-msvc.zip';
    await download(base, archive); await download(base + '.sha256', sum, 1024);
    const expected = (await readFile(sum, 'utf8')).trim().split(/\s+/)[0];
    if (createHash('sha256').update(await readFile(archive)).digest('hex') !== expected) throw new Error('uv checksum mismatch');
    const quote = value => `'${value.replaceAll("'", "''")}'`;
    const command = `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(join(runtime, 'tools/uv'))}`;
    // Inline built-in archive extraction; no execution policy or registry change.
    await run('powershell.exe', ['-NoProfile', '-Command', command]);
  }
  await run(uv, ['python', 'install', '3.11.16', '--no-bin']);
  if (!await exists(python)) await run(uv, ['venv', '--python', '3.11.16', join(runtime, 'tts-venv')]);
  if (!await exists(repo)) {
    await run('git.exe', ['clone', '--no-checkout', '--depth', '1', 'https://github.com/RVC-Boss/GPT-SoVITS.git', repo]);
    await run('git.exe', ['-C', repo, 'fetch', '--depth', '1', 'origin', revision]);
    await run('git.exe', ['-C', repo, 'checkout', '--detach', revision]);
  }
  if (await run('git.exe', ['-C', repo, 'rev-parse', 'HEAD'], true) !== revision) throw new Error('Existing runtime source differs; inspect it before changing.');
  await run(uv, ['pip', 'install', '--python', python, 'torch==2.7.1', 'torchaudio==2.7.1', '--index-url', 'https://download.pytorch.org/whl/cu126']);
  await run(uv, ['pip', 'install', '--python', python, '-r', 'scripts/tts-inference-lock.txt', '--index-url', 'https://pypi.org/simple']);
  await run(python, ['scripts/prepare-tts-nltk.py']);
  if (!process.argv.includes('--skip-models')) await run(python, ['scripts/download-tts-models.py']);
}
if (await run('git.exe', ['-C', repo, 'rev-parse', 'HEAD'], true) !== revision) throw new Error('Source revision differs.');
await run(uv, ['pip', 'check', '--python', python]);
await run(python, ['-c', 'import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name() if torch.cuda.is_available() else "CUDA unavailable")']);
