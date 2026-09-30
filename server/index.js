import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryStore, validText } from './memory.js';
import { PROVIDERS, messagesFor, offlineReply, complete } from './providers.js';
import { RemoteBudget } from './budget.js';
import { WindowsSpeech } from './speech.js';
import { SPEECH_BACKENDS, validateSpeechOptions } from './tts-contract.js';
import { LocalTts, loadTtsConfig } from './local-tts.js';
import { CHARACTER_OPTIONS, characterConfig } from './persona.js';
import { ReferenceImports, MAX_REFERENCE_BYTES } from './reference-import.js';

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

export async function createApp({ projectRoot = PROJECT, dataDir = join(PROJECT, 'data'), dev = false, fetchImpl = fetch, localTtsImpl } = {}) {
  const store = new MemoryStore(join(dataDir, 'exo.sqlite'));
  const budget = new RemoteBudget(store.db);
  const speech = new WindowsSpeech(projectRoot, dataDir);
  let ttsConfig = null, ttsConfigError = null;
  try { ttsConfig = await loadTtsConfig(dataDir); } catch { ttsConfigError = '本地 TTS 登记无效，请检查参考来源、许可与文件。'; }
  const localTts = localTtsImpl || new LocalTts(ttsConfig, { fetchImpl });
  const referenceImports = new ReferenceImports(dataDir, localTts);
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
      if (pathname === '/api/health' && req.method === 'GET') return json(res, 200, { service: 'project-exo', pid: process.pid, rootId: createHash('sha256').update(resolve(projectRoot).toLowerCase()).digest('hex'), ready: true });
      if (pathname === '/api/status' && req.method === 'GET') return json(res, 200, { service: 'project-exo', pid: process.pid, mode: 'offline', providers: PROVIDERS, characterOptions: CHARACTER_OPTIONS, speechBackends: SPEECH_BACKENDS, localTts: ttsConfigError ? { ready: false, error: ttsConfigError, voices: [] } : await localTts.status(),
        models: modelNames.map(name => ({ name, available: existsSync(join(assetRoot, name)), url: `/character-assets/${encodeURIComponent(name)}` })), budget: budget.status() });
      if (pathname === '/api/history' && req.method === 'GET') {
        const character = characterConfig({ timeline: url.searchParams.get('timeline') ?? undefined, style: url.searchParams.get('style') ?? undefined });
        return json(res, 200, store.history(16, character.contextKey));
      }
      if (pathname.startsWith('/api/sources/') && req.method === 'GET') {
        const id = pathname.slice('/api/sources/'.length);
        if (!/^[a-z0-9-]{1,80}$/i.test(id)) return json(res, 400, { error: '来源 ID 无效。' });
        const character = characterConfig({ timeline: url.searchParams.get('timeline') ?? undefined, style: url.searchParams.get('style') ?? undefined });
        return json(res, 200, { valid: store.sourceExists(id, character.contextKey) });
      }
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
        const character = characterConfig(input.character);
        const memories = store.recall(text);
        const contextGeneration = store.contextGeneration;
        const messages = messagesFor(text, memories, store.history(16, character.contextKey), character);
        const config = input.config || { provider: 'offline' };
        if (typeof config !== 'object' || Array.isArray(config) || ['provider', 'model', 'baseUrl', 'apiKey'].some(k => config[k] !== undefined && (typeof config[k] !== 'string' || config[k].length > (k === 'apiKey' ? 4096 : 500)))) throw Object.assign(new Error('模型配置字段无效或过长。'), { status: 400 });
        if (config.apiKey && text.includes(config.apiKey)) throw Object.assign(new Error('聊天正文不能包含当前密钥。'), { status: 400 });
        let result = { text: offlineReply(text, memories, character), emotion: 'neutral', expressionSource: 'limited-rule' }, provider = 'offline', error = null;
        let reservation;
        if (config.provider && config.provider !== 'offline') {
          const definition = PROVIDERS.find(p => p.id === config.provider);
          if (!definition) throw Object.assign(new Error('未知模型提供商。'), { status: 400 });
          let endpoint;
          try { endpoint = new URL(config.baseUrl || definition.baseUrl); } catch { throw Object.assign(new Error('模型端点无效，请填写 HTTP 基地址。'), { status: 400 }); }
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
          } catch (failure) {
            if (reservation) budget.finish(reservation, null, false);
            if (failure.code === 'UNSAFE_PROVIDER_REPLY') throw Object.assign(new Error('模型响应安全检查失败；本轮未保存或朗读。'), { status: 502 });
            error = '模型服务未成功回应，当前为本地演示回复；没有自动重试。';
          }
        }
        // Corrections/deletions clear history too. Discard completions and
        // fallbacks based on superseded context before persistence or delivery.
        if (contextGeneration !== store.contextGeneration) return json(res, 409, {
          code: 'CONTEXT_CHANGED', error: '记忆已修改或删除，本次回复已取消。请重新发送。',
        });
        const user = store.event('user', text, { provider, contextKey: character.contextKey });
        const assistant = store.event('assistant', result.text, { turnId: user.turnId, provider, contextKey: character.contextKey });
        return json(res, 200, { user, assistant, provider, error, character, emotion: result.emotion, expressionSource: result.expressionSource, recalled: memories.map(m => ({ id: m.id, text: m.text })), usage: result.usage || null, budget: budget.status() });
      }
      if (pathname === '/api/voices' && req.method === 'GET') {
        const neural = ttsConfigError ? { ready: false, error: ttsConfigError, voices: [] } : await localTts.status();
        let windows = [], error = null;
        try { windows = await speech.voices(); } catch { error = 'Windows 声音不可用；可选择浏览器声音。'; }
        return json(res, 200, { voices: [...(neural.ready ? neural.voices : []), ...windows], error, localTts: neural });
      }
      if (pathname === '/api/reference-profiles' && req.method === 'GET') return json(res, 200, { profiles: referenceImports.list(), error: ttsConfigError });
      if (pathname === '/api/reference-imports' && req.method === 'POST') {
        if (ttsConfigError) throw Object.assign(new Error('现有参考登记无效，请先修复 data/tts-config.json；不会覆盖损坏的登记。'), { status: 409 });
        if (!req.headers['content-type']?.startsWith('audio/wav')) throw Object.assign(new Error('只接受 PCM16 WAV 音频。'), { status: 415 });
        if (Number(req.headers['content-length']) > MAX_REFERENCE_BYTES) throw Object.assign(new Error('参考录音最多 4 MiB。'), { status: 413 });
        const chunks = []; let length = 0;
        for await (const chunk of req) { length += chunk.length; if (length > MAX_REFERENCE_BYTES) throw Object.assign(new Error('参考录音最多 4 MiB。'), { status: 413 }); chunks.push(chunk); }
        return json(res, 201, referenceImports.prepare(Buffer.concat(chunks)));
      }
      const referenceRoute = /^\/api\/reference-imports\/([a-f0-9-]{36})(\/audio)?$/.exec(pathname);
      if (referenceRoute) {
        const [, token, audio] = referenceRoute;
        if (audio && req.method === 'GET') { const entry = referenceImports.get(token); res.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' }); res.end(entry.wav); return; }
        if (!audio && req.method === 'DELETE') { referenceImports.discard(token); return json(res, 200, { discarded: true }); }
        if (!audio && req.method === 'POST') return json(res, 201, await referenceImports.confirm(token, await body(req)));
      }
      if (pathname === '/api/speech' && req.method === 'POST') {
        const input = await body(req);
        const backend = input.backend || 'windows-sapi';
        if (backend === 'gpt-sovits' && referenceImports.committing) throw Object.assign(new Error('参考登记正在更新，请稍后试听。'), { status: 409 });
        if (!['windows-sapi', 'gpt-sovits'].includes(backend)) throw Object.assign(new Error('该声音后端不使用服务器合成接口。'), { status: 400 });
        validateSpeechOptions(input, backend);
        const controller = new AbortController();
        const cancelled = () => { if (!res.writableEnded) controller.abort(); };
        res.on('close', cancelled);
        let wav;
        try {
          wav = backend === 'gpt-sovits'
            ? await localTts.synthesize({ text: validText(input.text, 300), referenceId: input.referenceId, emotion: input.emotion, speed: input.speed, signal: controller.signal })
            : await speech.synthesize(validText(input.text, 1000), input.voice);
        } finally { res.off('close', cancelled); }
        if (res.destroyed || controller.signal.aborted) return;
        res.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' }); res.end(wav); return;
      }
      if (pathname.startsWith('/api/')) return json(res, 404, { error: '接口不存在。' });
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: '方法不支持。' });
      if (pathname.startsWith('/character-assets/')) return await serveFile(res, assetRoot, pathname.slice(18));
      if (vite) return vite.middlewares(req, res, () => json(res, 404, { error: '页面不存在。' }));
      return await serveFile(res, join(projectRoot, 'dist'), pathname === '/' ? 'index.html' : pathname.slice(1));
    } catch (error) { if (!res.headersSent) json(res, error.status || 400, { error: error.message.includes('SQL') ? '本地数据操作失败。' : error.message }); }
  });
  return { app, store, budget, async close() { if (app.listening) await new Promise(r => app.close(r)); referenceImports.close(); await vite?.close(); store.close(); } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const context = await createApp({ dev: process.argv.includes('--dev') });
  const port = Number(process.env.PORT || 3000);
  context.app.listen(port, '127.0.0.1', () => console.log(`Project Exo: http://127.0.0.1:${port} · default offline demo, no automatic API calls`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await context.close(); process.exit(0); });
}
