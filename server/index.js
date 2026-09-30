import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryStore, validText } from './memory.js';
import { PROVIDERS, messagesFor, offlineReply, complete } from './providers.js';
import { RemoteBudget } from './budget.js';
import { WindowsSpeech } from './speech.js';
import { SPEECH_BACKENDS, validateSpeechOptions } from './tts-contract.js';

const PROJECT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.bmp': 'image/bmp', '.pmx': 'application/octet-stream', '.svg': 'image/svg+xml' };
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('只接受 JSON 请求。'), { status: 415 });
  const chunks = []; let length = 0;
  for await (const chunk of req) { length += chunk.length; if (length > 32000) throw Object.assign(new Error('请求过大。'), { status: 413 }); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks)); } catch { throw Object.assign(new Error('JSON 格式无效。'), { status: 400 }); }
}

async function serveFile(res, root, relative) {
  if (relative.includes('\0') || relative.includes('\\')) throw Object.assign(new Error('路径无效。'), { status: 403 });
  const file = resolve(root, relative);
  if (!file.startsWith(resolve(root) + sep)) throw Object.assign(new Error('禁止越界路径。'), { status: 403 });
  let canonical;
  try { canonical = await realpath(file); } catch { throw Object.assign(new Error('资源不存在。'), { status: 404 }); }
  if (!canonical.startsWith(resolve(root) + sep)) throw Object.assign(new Error('禁止越界资源。'), { status: 403 });
  const info = await stat(canonical);
  if (!info.isFile()) throw Object.assign(new Error('资源不存在。'), { status: 404 });
  res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-cache' });
  createReadStream(canonical).pipe(res);
}

export async function createApp({ projectRoot = PROJECT, dataDir = join(PROJECT, 'data'), dev = false, fetchImpl = fetch } = {}) {
  const store = new MemoryStore(join(dataDir, 'exo.sqlite'));
  const budget = new RemoteBudget(store.db);
  const speech = new WindowsSpeech(projectRoot, dataDir);
  const assetRoot = join(projectRoot, 'assets/characters/furina/source/mmd');
  const modelNames = ['【芙宁娜】.pmx', '【芙宁娜_荒】.pmx'];
  let vite;
  if (dev) { const { createServer } = await import('vite'); vite = await createServer({ root: projectRoot, server: { middlewareMode: true, hmr: false }, appType: 'spa' }); }
  const app = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    try {
      const host = req.headers.host || '';
      const expectedPort = app.address()?.port;
      if (![ `127.0.0.1:${expectedPort}`, `localhost:${expectedPort}`, `[::1]:${expectedPort}` ].includes(host)) return json(res, 403, { error: 'Host 被拒绝。' });
      // Protect reads as well as writes: no hostile website can inspect local data.
      if (req.headers.origin && req.headers.origin !== `http://${host}`) return json(res, 403, { error: '跨来源请求被拒绝。' });
      if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: '跨站请求被拒绝。' });
      const url = new URL(req.url, `http://${host}`);
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === '/api/status' && req.method === 'GET') return json(res, 200, { mode: 'offline', providers: PROVIDERS, speechBackends: SPEECH_BACKENDS,
        models: modelNames.map(name => ({ name, available: existsSync(join(assetRoot, name)), url: `/character-assets/${encodeURIComponent(name)}` })), budget: budget.status() });
      if (pathname === '/api/history' && req.method === 'GET') return json(res, 200, store.history());
      if (pathname === '/api/memories') {
        if (req.method === 'GET') return json(res, 200, store.list());
        if (req.method === 'POST') { const input = await body(req); return json(res, 201, store.save(input.text, input.sourceId)); }
      }
      if (pathname.startsWith('/api/memories/')) {
        const id = pathname.slice('/api/memories/'.length);
        if (req.method === 'PATCH') return json(res, 200, store.edit(id, (await body(req)).text));
        if (req.method === 'DELETE') return json(res, 200, store.delete(id));
      }
      if (pathname === '/api/chat' && req.method === 'POST') {
        const input = await body(req), text = validText(input.text, 1500);
        const memories = store.recall(text);
        const messages = messagesFor(text, memories, store.history());
        const config = input.config || { provider: 'offline' };
        let result = { text: offlineReply(text, memories) }, provider = 'offline', error = null;
        let reservation;
        if (config.provider && config.provider !== 'offline') {
          const definition = PROVIDERS.find(p => p.id === config.provider);
          if (!definition) throw Object.assign(new Error('未知模型提供商。'), { status: 400 });
          const endpoint = new URL(config.baseUrl || definition.baseUrl);
          if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw Object.assign(new Error('端点格式被拒绝。'), { status: 400 });
          const local = LOOPBACK.has(endpoint.hostname);
          if (local) {
            if (!['http:', 'https:'].includes(endpoint.protocol)) throw Object.assign(new Error('本地模型需要 HTTP 端点。'), { status: 400 });
          } else {
            if (config.provider !== 'deepseek' || endpoint.origin !== 'https://api.deepseek.com' || !['', '/', '/v1', '/v1/'].includes(endpoint.pathname)) throw Object.assign(new Error('本轮只授权 DeepSeek 短测试，其他远程服务禁用。'), { status: 403 });
            if (input.remoteTest !== true) throw Object.assign(new Error('远程模型只能通过明确的一次测试入口调用。'), { status: 403 });
            if (typeof config.apiKey !== 'string' || !config.apiKey.trim() || /[\r\n]/.test(config.apiKey)) throw Object.assign(new Error('请由你本人在设置中输入密钥。'), { status: 400 });
            reservation = budget.reserve(config.model, messages, 128);
          }
          try {
            result = await complete(config, messages, { fetchImpl }); provider = config.provider;
            if (reservation) budget.finish(reservation, result.usage, true);
          } catch {
            if (reservation) budget.finish(reservation, null, false);
            error = '模型服务未成功回应，当前为本地演示回复；没有自动重试。';
          }
        }
        const user = store.event('user', text, { provider });
        const assistant = store.event('assistant', result.text, { turnId: user.turnId, provider });
        return json(res, 200, { user, assistant, provider, error, recalled: memories.map(m => ({ id: m.id, text: m.text })), usage: result.usage || null, budget: budget.status() });
      }
      if (pathname === '/api/voices' && req.method === 'GET') {
        try { return json(res, 200, { voices: await speech.voices(), error: null }); }
        catch { return json(res, 200, { voices: [], error: 'Windows 声音不可用；可选择浏览器声音。' }); }
      }
      if (pathname === '/api/speech' && req.method === 'POST') {
        const input = await body(req);
        validateSpeechOptions(input);
        const wav = await speech.synthesize(validText(input.text, 1000), input.voice);
        res.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' }); res.end(wav); return;
      }
      if (pathname.startsWith('/api/')) return json(res, 404, { error: '接口不存在。' });
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: '方法不支持。' });
      if (pathname.startsWith('/character-assets/')) return await serveFile(res, assetRoot, pathname.slice(18));
      if (vite) return vite.middlewares(req, res, () => json(res, 404, { error: '页面不存在。' }));
      return await serveFile(res, join(projectRoot, 'dist'), pathname === '/' ? 'index.html' : pathname.slice(1));
    } catch (error) { if (!res.headersSent) json(res, error.status || 400, { error: error.message.includes('SQL') ? '本地数据操作失败。' : error.message }); }
  });
  return { app, store, budget, async close() { if (app.listening) await new Promise(r => app.close(r)); await vite?.close(); store.close(); } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const context = await createApp({ dev: process.argv.includes('--dev') });
  const port = Number(process.env.PORT || 3000);
  context.app.listen(port, '127.0.0.1', () => console.log(`Project Exo: http://127.0.0.1:${port} · default offline demo, no automatic API calls`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await context.close(); process.exit(0); });
}
