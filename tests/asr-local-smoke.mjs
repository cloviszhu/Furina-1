// Explicit offline smoke entry: no downloads, microphone, credentials, or app service changes.
import http from 'node:http';
import { readFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAsrHandler } from '../server/asr.js';
const [runtimeRoot, sample] = process.argv.slice(2);
if (!runtimeRoot || !sample) throw Error('Usage: node tests/asr-local-smoke.mjs <existing-runtime-root> <approved-existing-wav>');
const temporary = await mkdtemp(join(tmpdir(), 'exo-asr-real-test-'));
const handler = createAsrHandler({ runtimeRoot: resolve(runtimeRoot), tempRoot: temporary });
const server = http.createServer(async (req, res) => { if (!await handler(req, res)) { res.writeHead(404); res.end(); } });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const base = `http://127.0.0.1:${server.address().port}`;
  const status = await (await fetch(base + '/api/asr/status')).json();
  if (!status.available) throw Error('Existing runtime unavailable');
  const started = performance.now(), captureId = randomUUID();
  const response = await fetch(`${base}/api/asr/transcriptions/${captureId}`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: await readFile(sample) });
  const result = await response.json();
  await new Promise(resolve => setTimeout(resolve, 50));
  const evidence = { at: new Date().toISOString(), httpStatus: response.status, backend: result.backend, textCharacters: result.text?.length || 0, seconds: result.seconds, wallMs: Math.round(performance.now() - started), captureIdMatches: result.captureId === captureId, temporaryFiles: (await readdir(temporary)).length, offline: status.offline };
  console.log(JSON.stringify(evidence));
  if (response.status !== 200 || !evidence.textCharacters || !evidence.captureIdMatches || evidence.temporaryFiles !== 0) throw Error(result.code || 'Smoke failed');
} finally { await handler.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(temporary, { recursive: true, force: true }); }
