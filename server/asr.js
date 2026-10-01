import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ASR_LIMITS = Object.freeze({ maxSeconds: 30, maxBytes: 8 * 1024 * 1024, timeoutMs: 30000, threads: 2 });
const BACKEND = 'whisper.cpp-base-cpu';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status, code) => Object.assign(new Error(code), { status, code });
const json = (res, status, body) => { if (res.destroyed || res.writableEnded) return; res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };

export function validateAsrAudio(bytes, mime) {
  const type = mime?.split(';')[0].trim().toLowerCase();
  if (!bytes.length || bytes.length > ASR_LIMITS.maxBytes) throw fail(413, 'audio_size');
  const head = bytes.subarray(0, 12);
  const wav = head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WAVE';
  const webm = bytes.length >= 4 && bytes.readUInt32BE(0) === 0x1a45dfa3;
  const ogg = head.toString('ascii', 0, 4) === 'OggS';
  const mp4 = head.toString('ascii', 4, 8) === 'ftyp';
  if (['audio/wav', 'audio/x-wav'].includes(type) && wav) return 'wav';
  if (type === 'audio/webm' && webm) return 'matroska';
  if (type === 'audio/ogg' && ogg) return 'ogg';
  if (type === 'audio/mp4' && mp4) return 'mov';
  throw fail(415, 'audio_format');
}

// No shell, inherited stdin, audio output or raw engine errors escape this module.
export function runAsrProcess(command, args, { signal, spawnImpl = spawn } = {}) {
  return new Promise((resolveRun, reject) => {
    if (signal?.aborted) return reject(fail(499, 'cancelled'));
    let child;
    try { child = spawnImpl(command, args, { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] }); }
    catch { return reject(fail(503, 'runtime_unavailable')); }
    const abort = () => { try { child.kill('SIGKILL'); } catch {} };
    signal?.addEventListener('abort', abort, { once: true });
    child.once('error', () => { signal?.removeEventListener('abort', abort); reject(fail(503, 'runtime_unavailable')); });
    child.once('close', code => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) reject(fail(499, 'cancelled'));
      else if (code !== 0) reject(fail(422, 'audio_decode_or_asr_failed'));
      else resolveRun();
    });
    if (signal?.aborted) abort();
  });
}

export function pcmDuration(wav) {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw fail(422, 'audio_decode_or_asr_failed');
  let format = false, dataBytes = 0;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4), end = offset + 8 + size;
    if (end > wav.length) throw fail(422, 'audio_decode_or_asr_failed');
    const kind = wav.toString('ascii', offset, offset + 4);
    if (kind === 'fmt ') {
      if (size < 16 || wav.readUInt16LE(offset + 8) !== 1 || wav.readUInt16LE(offset + 10) !== 1 || wav.readUInt32LE(offset + 12) !== 16000 || wav.readUInt16LE(offset + 22) !== 16) throw fail(422, 'audio_decode_or_asr_failed');
      format = true;
    }
    if (kind === 'data') dataBytes += size;
    offset = end + (size & 1);
  }
  if (!format || !dataBytes) throw fail(422, 'empty_audio');
  const seconds = dataBytes / 32000;
  if (seconds > ASR_LIMITS.maxSeconds) throw fail(413, 'audio_too_long');
  return seconds;
}

export function createAsrHandler({
  runtimeRoot = resolve(fileURLToPath(new URL('..', import.meta.url)), '.runtime'),
  ffmpegPath = join(runtimeRoot, 'tools/ffmpeg/ffmpeg.exe'),
  whisperPath = join(runtimeRoot, 'asr/whisper-cpp/bin/whisper-cli.exe'),
  modelPath = join(runtimeRoot, 'asr/whisper-cpp/ggml-base.bin'),
  tempRoot = tmpdir(), runProcess = runAsrProcess, timeoutMs = ASR_LIMITS.timeoutMs,
} = {}) {
  let active = null;
  const cancelled = new Map();
  const prune = () => { const now = Date.now(); for (const [id, time] of cancelled) if (time <= now) cancelled.delete(id); };
  const remember = id => { prune(); cancelled.delete(id); cancelled.set(id, Date.now() + 60000); while (cancelled.size > 128) cancelled.delete(cancelled.keys().next().value); };
  const available = async () => {
    try { await Promise.all([ffmpegPath, whisperPath, modelPath, ...['ggml-base.dll', 'ggml-cpu.dll', 'ggml.dll', 'whisper.dll'].map(name => join(resolve(whisperPath, '..'), name))].map(path => access(path))); return true; } catch { return false; }
  };
  const handler = async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return false; }
    if (!url.pathname.startsWith('/api/asr')) return false;
    try {
      const host = req.headers.host;
      const port = req.socket.localPort;
      if (![ `127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}` ].includes(host) || req.headers.origin && req.headers.origin !== `http://${host}` || ![undefined, 'same-origin', 'none'].includes(req.headers['sec-fetch-site'])) throw fail(403, 'request_origin');
      if (url.search || url.hash) throw fail(400, 'request_parameters');
      if (url.pathname === '/api/asr/status') {
        if (req.method !== 'GET') throw fail(405, 'method');
        const ready = await available();
        json(res, 200, { available: ready, backend: BACKEND, offline: true, busy: Boolean(active), limits: ASR_LIMITS, ...(!ready && { code: 'runtime_unavailable' }) }); return true;
      }
      const route = url.pathname.match(/^\/api\/asr\/transcriptions\/([^/]+)(\/cancel)?$/);
      if (!route || !UUID.test(route[1])) throw fail(400, 'capture_id');
      if (req.method !== 'POST') throw fail(405, 'method');
      const id = route[1].toLowerCase();
      prune();
      if (route[2]) {
        if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] || 0) !== 0) throw fail(400, 'cancel_body');
        remember(id);
        if (active?.id === id) active.controller.abort();
        json(res, 200, { captureId: id, cancelled: true }); return true;
      }
      if (cancelled.has(id)) throw fail(409, 'cancelled');
      if (active) throw fail(409, 'busy');
      const length = req.headers['content-length'];
      if (length && (!/^\d+$/.test(length) || Number(length) > ASR_LIMITS.maxBytes)) throw fail(413, 'audio_size');
      if (!/^audio\/(?:wav|x-wav|webm|ogg|mp4)(?:\s*;\s*codecs=[a-z0-9.," -]+)?$/i.test(req.headers['content-type'] || '')) throw fail(415, 'audio_format');
      let complete;
      const job = { id, controller: new AbortController(), done: new Promise(resolve => { complete = resolve; }) };
      active = job;
      let dir, resultBody, timedOut = false;
      const abort = () => job.controller.abort();
      job.controller.signal.addEventListener('abort', () => { if (!req.complete) req.destroy(); }, { once: true });
      const disconnect = () => { if (!res.writableFinished) abort(); };
      req.once('aborted', abort); res.once('close', disconnect);
      // Also bound slow/chunked uploads; destroy only our request after reporting timeout.
      const timer = setTimeout(() => { timedOut = true; abort(); if (!req.complete) req.destroy(); }, timeoutMs);
      try {
        if (!await available()) throw fail(503, 'runtime_unavailable');
        const chunks = []; let total = 0;
        for await (const chunk of req) {
          if (job.controller.signal.aborted) throw fail(499, 'cancelled');
          total += chunk.length;
          if (total > ASR_LIMITS.maxBytes) throw fail(413, 'audio_size');
          chunks.push(chunk);
        }
        if (job.controller.signal.aborted) throw fail(499, 'cancelled');
        const bytes = Buffer.concat(chunks);
        const format = validateAsrAudio(bytes, req.headers['content-type']);
        dir = await mkdtemp(join(tempRoot, 'exo-asr-'));
        const input = join(dir, 'input'), pcm = join(dir, 'pcm.wav'), output = join(dir, 'draft');
        await writeFile(input, bytes, { flag: 'wx' });
        await runProcess(ffmpegPath, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file,pipe', '-f', format, '-threads', '2', '-i', input, '-map', '0:a:0', '-vn', '-t', '31', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 'wav', pcm], { signal: job.controller.signal });
        const seconds = pcmDuration(await readFile(pcm));
        await runProcess(whisperPath, ['--no-gpu', '--threads', '2', '--language', 'zh', '--model', modelPath, '--file', pcm, '--output-json', '--output-file', output], { signal: job.controller.signal });
        if (job.controller.signal.aborted) throw fail(499, 'cancelled');
        let result;
        try { result = JSON.parse(await readFile(output + '.json', 'utf8')); } catch { throw fail(422, 'asr_output'); }
        const text = result.transcription?.map(segment => segment.text).join('').trim();
        if (typeof text !== 'string' || !text || text.length > 1500) throw fail(422, 'empty_or_large_draft');
        resultBody = { captureId: id, text, backend: BACKEND, seconds };
      } catch (error) {
        throw timedOut ? fail(504, 'timeout') : error;
      } finally {
        clearTimeout(timer); req.removeListener('aborted', abort); res.removeListener('close', disconnect);
        try { if (dir) await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } finally { if (active === job) active = null; complete(); }
      }
      if (job.controller.signal.aborted) throw fail(timedOut ? 504 : 499, timedOut ? 'timeout' : 'cancelled');
      json(res, 200, resultBody);
    } catch (error) { json(res, error.status || 500, { code: error.code || 'asr_failed' }); }
    return true;
  };
  handler.dispose = async () => { const job = active; job?.controller.abort(); await job?.done; };
  return handler;
}
