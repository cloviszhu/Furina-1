import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

function run(script, mode, input, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const args = input ? [String(input.voice), input.inputFile, input.output] : [];
    const child = spawn('cscript.exe', ['//NoLogo', script, mode, ...args], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let failed = false;
    const timeout = setTimeout(() => { failed = true; child.kill(); reject(new Error('系统语音生成超时。')); }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', data => { stdout += data; if (stdout.length > 100000) child.kill(); });
    // Never log stdin (speech text), and do not reflect child error bodies.
    child.stderr.resume();
    child.on('error', () => { clearTimeout(timeout); reject(new Error('Windows 系统语音不可用。')); });
    child.on('close', code => { clearTimeout(timeout); if (failed) return; code === 0 ? resolve(stdout) : reject(new Error('系统语音生成失败；可尝试浏览器语音。')); });
    child.stdin.on('error', () => {});
    child.stdin.end();
  });
}

export class WindowsSpeech {
  constructor(projectRoot, dataDir) { this.script = join(projectRoot, 'scripts/windows-speech.vbs'); this.directory = join(dataDir, 'speech'); }
  async voices() { return JSON.parse(await run(this.script, 'list')); }
  async synthesize(text, voice) {
    if (process.platform !== 'win32') throw new Error('Windows 系统语音仅支持 Windows。');
    if (typeof text !== 'string' || !text.trim() || text.length > 1000 || !Number.isInteger(voice)) throw new Error('语音参数无效。');
    await mkdir(this.directory, { recursive: true });
    const output = join(this.directory, `${randomUUID()}.wav`);
    const inputFile = join(this.directory, `${randomUUID()}.txt`);
    try {
      await writeFile(inputFile, Buffer.from(`\uFEFF${text}`, 'utf16le'));
      await run(this.script, 'speak', { voice, output, inputFile });
      const wav = await readFile(output);
      if (wav.length < 100 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('系统未生成有效语音。');
      return wav;
    } finally { await unlink(output).catch(() => {}); await unlink(inputFile).catch(() => {}); }
  }
}
