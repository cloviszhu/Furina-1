import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

export const CREDENTIAL_TARGET = 'ProjectExo/Furina-1/DeepSeek/APIKey/v1';
export const MAX_CREDENTIAL_BYTES = 2560;
const codes = new Set(['UNAVAILABLE', 'NATIVE_ERROR', 'NOT_FOUND', 'EXISTS', 'FOREIGN', 'INVALID_KEY', 'BUSY']);
export function credentialError(code = 'UNAVAILABLE', nativeCode) {
  const safe = codes.has(code) ? code : 'UNAVAILABLE';
  const numericCode = Number.isInteger(nativeCode) && nativeCode >= 0 ? nativeCode : undefined;
  return Object.assign(new Error(`Windows 凭据操作未完成（${safe}${numericCode !== undefined ? `/${numericCode}` : ''}）；不会回退明文。`), { status: safe === 'EXISTS' || safe === 'FOREIGN' ? 409 : 400, code: safe, nativeCode: numericCode });
}
export function validateKey(key) {
  if (typeof key !== 'string' || !key.length || !/^[\x21-\x7e]+$/.test(key) || Buffer.byteLength(key, 'utf8') > MAX_CREDENTIAL_BYTES) throw credentialError('INVALID_KEY');
  return key;
}
export function assertOfficialDeepSeek(config) {
  let url;
  try { url = new URL(config?.baseUrl || 'https://api.deepseek.com'); } catch { throw credentialError('INVALID_KEY'); }
  if (config?.provider !== 'deepseek' || url.origin !== 'https://api.deepseek.com' || url.username || url.password || url.search || url.hash || !['/', '/v1', '/v1/'].includes(url.pathname)) throw Object.assign(new Error('已保存密钥仅可用于官方 HTTPS DeepSeek API；未读取凭据。'), { status: 403 });
}

// Static, checked-in bridge source only in argv. Secret JSON travels through a
// private stdin pipe; stdout is consumed internally and never logged/returned.
export async function nativeBridge(action, key, { spawnImpl = spawn, platform = process.platform } = {}) {
  if (platform !== 'win32') throw credentialError();
  const script = await readFile(new URL('../scripts/windows-credentials.ps1', import.meta.url), 'utf8');
  return await new Promise((resolve, reject) => {
    const child = spawnImpl('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', size = 0, settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { child.kill(); finish(credentialError()); }, 15000);
    child.on('error', () => finish(credentialError()));
    child.stdin.on('error', () => finish(credentialError()));
    child.stdout.on('data', chunk => { size += chunk.length; if (size > 16000) { child.kill(); finish(credentialError()); } else output += chunk.toString('utf8'); });
    child.stderr.resume(); // Never expose native exceptions, stderr or stdin.
    child.on('close', code => {
      if (code !== 0) return finish(credentialError());
      try { const result = JSON.parse(output); if (result.ok !== true) return finish(credentialError(result.code, result.nativeCode)); finish(null, result); }
      catch { finish(credentialError()); }
    });
    child.stdin.end(JSON.stringify({ action, ...(key !== undefined && { key }) }));
  });
}

export class WindowsCredentials {
  constructor({ bridge = nativeBridge } = {}) { this.bridge = bridge; }
  async status() {
    try { const result = await this.bridge('status'); return { available: true, saved: result.saved === true }; }
    catch { return { available: false, saved: false }; }
  }
  async save(key) { await this.call('save', validateKey(key)); return { saved: true }; }
  async delete() { await this.call('delete'); return { saved: false }; }
  async call(action, key) {
    try { return await this.bridge(action, key); }
    catch (error) { throw credentialError(error.code, error.nativeCode); }
  }
  async resolve(config, confirmed) {
    if (config && (Object.hasOwn(config, 'target') || Object.hasOwn(config, 'credentialTarget'))) throw credentialError('INVALID_KEY');
    if (config?.credentialSource === undefined || config.credentialSource === 'input') return config;
    if (config.credentialSource !== 'saved') throw credentialError('INVALID_KEY');
    assertOfficialDeepSeek(config); // BEFORE every possible CredRead, including loopback.
    if (confirmed !== true || config.apiKey) throw Object.assign(new Error('读取已保存密钥需要明确的收费测试操作，且不能混用页面密钥。'), { status: 403 });
    const result = await this.call('read');
    return { ...config, apiKey: validateKey(result.key) };
  }
}
