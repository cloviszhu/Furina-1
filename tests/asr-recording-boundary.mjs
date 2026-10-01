// Explicit opt-in synthetic browser audio probe. No microphone or Whisper call.
import http from 'node:http';
import { mkdtemp, readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { createAsrHandler, runAsrProcess } from '../server/asr.js';

const runtimeRoot = resolve(process.argv[2]);
const maxMs = Number(process.argv[3] || 30000);
if (!runtimeRoot || ![29000, 30000].includes(maxMs)) throw Error('Use authorized runtime root and 29000|30000 ms.');
const temporary = await mkdtemp(join(tmpdir(), 'exo-asr-media-boundary-'));
const jobs = join(temporary, 'jobs'); await mkdir(jobs);
let decodedSeconds = null, whisperCalls = 0;
const handler = createAsrHandler({ runtimeRoot, tempRoot: jobs, runProcess: async (command, args, options) => {
  if (args.includes('-i')) {
    await runAsrProcess(command, args, options);
    const pcm = await readFile(args.at(-1)); let bytes = 0;
    for (let at = 12; at + 8 <= pcm.length;) { const size = pcm.readUInt32LE(at + 4); if (pcm.toString('ascii', at, at + 4) === 'data') bytes += size; at += 8 + size + (size & 1); }
    decodedSeconds = bytes / 32000;
  } else {
    ++whisperCalls; // Recognizer substitute, never execute the model.
    await writeFile(args.at(-1) + '.json', JSON.stringify({ transcription: [{ text: '合成音频边界草稿' }] }));
  }
} });
const moduleText = await readFile(new URL('../src/recording.js', import.meta.url), 'utf8');
const html = `<!doctype html><meta charset="utf-8"><input id="draft"><button id="start">Record synthetic</button><button id="stop">Stop</button><button id="cancel">Cancel</button><p id="status"></p><script type="module">
import {mountRecording} from '/recording.js';
const context = new AudioContext(), oscillator=context.createOscillator(), gain=context.createGain(), output=context.createMediaStreamDestination();
gain.gain.value=0.01; oscillator.frequency.value=440; oscillator.connect(gain).connect(output); oscillator.start();
window.micCalls=0; window.stopMs=null; window.started=null; window.requests=[];
const fetchImpl=async(path, init)=>{ if(path.includes('/transcriptions/')&&!path.endsWith('/cancel')) window.stopMs=performance.now()-window.started;window.requests.push(path);return fetch(path,init); };
window.capture=mountRecording({ input:document.querySelector('#draft'),start:document.querySelector('#start'),stop:document.querySelector('#stop'),cancel:document.querySelector('#cancel'),status:document.querySelector('#status'),maxMs:${maxMs},fetchImpl,
getUserMedia:async()=>{await context.resume();window.started=performance.now();return output.stream;}, stopPlayback:()=>{},canStart:()=>true });
window.finish=async()=>{window.capture.dispose();oscillator.stop();await context.close();};
</script>`;
const server = http.createServer(async (req, res) => {
  if (await handler(req, res)) return;
  res.writeHead(200, { 'Content-Type': req.url === '/recording.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8' }); res.end(req.url === '/recording.js' ? moduleText : html);
});
let browser;
try {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--mute-audio'] });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForFunction(() => window.capture);
  // Replace actual device access with an AudioContext oscillator stream above.
  await page.evaluate(() => { Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => { ++window.micCalls; throw Error('Real microphone forbidden'); } } }); });
  await page.locator('#start').click();
  await page.waitForFunction(() => ['draft', 'error'].includes(document.querySelector('#status').dataset.state), null, { timeout: 38000 });
  const ui = await page.evaluate(() => ({ phase:document.querySelector('#status').dataset.state,message:document.querySelector('#status').textContent,stopMs:window.stopMs,micCalls:window.micCalls,chatCalls:window.requests.filter(p=>p==='/api/chat').length }));
  await page.evaluate(() => window.finish());
  console.log(JSON.stringify({ maxMs, decodedSeconds, recognizerSubstituteCalls:whisperCalls, temporaryFiles:(await readdir(jobs)).length,...ui }));
} finally {
  await browser?.close(); await handler.dispose(); server.closeAllConnections(); await new Promise(r => server.close(r)); await rm(temporary, { recursive:true,force:true });
}
