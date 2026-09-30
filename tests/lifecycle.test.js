import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { ownsProcess } from '../scripts/exo-local.mjs';

test('lifecycle ownership requires exact absolute entrypoint and expected executable, never a PID or process name alone', () => {
  const root = resolve('.'), script = join(root, 'server/index.js'), service = { name: 'app', script };
  assert(ownsProcess(service, { ExecutablePath: process.execPath, CommandLine: `"${process.execPath}" "${script}"` }));
  for (const info of [
    { ExecutablePath: process.execPath, CommandLine: 'node server/index.js' },
    { ExecutablePath: process.execPath, CommandLine: `node "${script}.unrelated"` },
    { ExecutablePath: process.execPath, CommandLine: `node unrelated.js "${script}"` },
    { ExecutablePath: process.execPath, CommandLine: 'node -e "require(\'http\').createServer()"' },
    { ExecutablePath: 'C:\\unrelated\\node.exe', CommandLine: `node "${script}"` },
    { ProcessId: 123, Name: 'node.exe' },
  ]) assert.equal(ownsProcess(service, info), false);
  const tts = { name: 'tts', script: join(root, 'scripts/run-local-tts.py') };
  assert(ownsProcess(tts, { ExecutablePath: join(root, '.runtime/python/python.exe'), CommandLine: `python "${tts.script}"` }));
  assert.equal(ownsProcess(tts, { ExecutablePath: 'C:\\unrelated\\python.exe', CommandLine: `python "${tts.script}"` }), false);
});
