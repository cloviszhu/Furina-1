import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryStore, validText } from './memory.js';
import { PROVIDERS, messagesFor, offlineReply, complete } from './providers.js';
import { RemoteBudget } from './budget.js';
import { RemoteTests, remoteTestManifest } from './remote-tests.js';
import { TestReports } from './test-reports.js';
import { WindowsSpeech } from './speech.js';
import { SPEECH_BACKENDS, validateSpeechOptions } from './tts-contract.js';
import { LocalTts, loadTtsConfig } from './local-tts.js';
import { CHARACTER_OPTIONS, characterConfig } from './persona.js';
import { ReferenceImports, MAX_REFERENCE_BYTES } from './reference-import.js';
import { WindowsCredentials } from './credentials.js';
import { Turns } from './turns.js';
import { InteractionMemoryStore, containsPrivateMaterial, domain } from './interaction-memory.js';
import { mutateInteractionSource, syncConfirmedLineage } from './interaction-memory-integration.js';

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

export async function createApp({ projectRoot = PROJECT, dataDir = join(PROJECT, 'data'), dev = false, fetchImpl = fetch, localTtsImpl, windowsSpeechImpl, credentials = new WindowsCredentials() } = {}) {
  const store = new MemoryStore(join(dataDir, 'exo.sqlite'));
  const interaction = new InteractionMemoryStore(null, { database: store.db, confirmedMemoryStore: store });
  const budget = new RemoteBudget(store.db);
  const testReports = new TestReports(join(dataDir, 'test-reports'));
  const remoteTests = new RemoteTests(budget, { fetchImpl, reports: testReports });
  const speech = windowsSpeechImpl || new WindowsSpeech(projectRoot, dataDir);
  let ttsConfig = null, ttsConfigError = null;
  try { ttsConfig = await loadTtsConfig(dataDir); } catch { ttsConfigError = '本地 TTS 登记无效，请检查参考来源、许可与文件。'; }
  const localTts = localTtsImpl || new LocalTts(ttsConfig, { fetchImpl });
  const referenceImports = new ReferenceImports(dataDir, localTts);
  const assetRoot = join(projectRoot, 'assets/characters/furina/source/mmd');
  const modelNames = ['【芙宁娜】.pmx', '【芙宁娜_荒】.pmx'];
  let chatBusy = false;
  const turns = new Turns();
  let vite;
  if (dev) { const { createServer } = await import('vite'); vite = await createServer({ root: projectRoot, server: { middlewareMode: true, hmr: false }, appType: 'spa' }); }
  const app = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    try {
      const resolveCredential = async (config, confirmed) => {
        if (config?.credentialSource === 'saved' && (req.headers['x-exo-credentials'] !== '1' || !['same-origin', 'none', undefined].includes(req.headers['sec-fetch-site']))) throw Object.assign(new Error('凭据请求来源被拒绝。'), { status: 403 });
        if (config?.credentialSource === 'saved' && !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '')) throw Object.assign(new Error('凭据请求只接受 JSON。'), { status: 415 });
        return await credentials.resolve(config, confirmed);
      };
      const host = req.headers.host || '';
      const expectedPort = app.address()?.port;
      if (![ `127.0.0.1:${expectedPort}`, `localhost:${expectedPort}`, `[::1]:${expectedPort}` ].includes(host)) return json(res, 403, { error: 'Host 被拒绝。' });
      // Protect reads as well as writes: no hostile website can inspect local data.
      if (req.headers.origin && req.headers.origin !== `http://${host}`) return json(res, 403, { error: '跨来源请求被拒绝。' });
      if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: '跨站请求被拒绝。' });
      const url = new URL(req.url, `http://${host}`);
      const pathname = decodeURIComponent(url.pathname);
      if (pathname.startsWith('/api/credentials')) {
        if (pathname !== '/api/credentials/deepseek' || url.search) return json(res, 400, { error: '固定凭据入口不接受目标或参数。' });
        // Sensitive reads and mutations require an explicit same-origin app request.
        if (req.headers.origin && req.headers.origin !== `http://${host}` || req.headers['x-exo-credentials'] !== '1' || !['same-origin', 'none', undefined].includes(req.headers['sec-fetch-site'])) return json(res, 403, { error: '凭据请求来源被拒绝。' });
        if (req.method === 'GET') return json(res, 200, await credentials.status());
        if (!['POST', 'DELETE'].includes(req.method)) return json(res, 405, { error: '方法不支持。' });
        if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '')) return json(res, 415, { error: '只接受 JSON 请求。' });
        const input = await body(req);
        const fields = req.method === 'POST' ? ['confirmed', 'apiKey'] : ['confirmed'];
        if (!input || typeof input !== 'object' || Array.isArray(input) || input.confirmed !== true || Object.keys(input).some(k => !fields.includes(k))) return json(res, 400, { error: '请本人明确确认固定 DeepSeek 凭据操作。' });
        return json(res, 200, req.method === 'POST' ? await credentials.save(input.apiKey) : await credentials.delete());
      }
      if (pathname === '/api/remote-tests' && req.method === 'GET') return json(res, 200, { scenarios: remoteTestManifest() });
      if (pathname === '/api/test-reports' && req.method === 'GET') return json(res, 200, { reports: testReports.list() });
      const report = pathname.match(/^\/api\/test-reports\/([a-f0-9-]{36})$/i);
      if (report && req.method === 'GET') return json(res, 200, testReports.read(report[1]));
      if (pathname === '/api/remote-tests' && req.method === 'POST') {
        const input = await body(req);
        if (req.aborted || res.destroyed) return;
        if (input.confirmed !== true) return json(res, 400, { error: '请明确点击启动收费测试。' });
        input.config = await resolveCredential(input.config, input.confirmed);
        if (req.aborted || res.destroyed) return;
        const run = remoteTests.start(input);
        res.once('close', () => {
          if (!res.writableFinished) { try { remoteTests.disconnectStart(run.id); } catch {} }
        });
        return json(res, 201, run);
      }
      const testStep = pathname.match(/^\/api\/remote-tests\/([a-z0-9-]{36})\/(step|cancel|activate)$/i);
      if (testStep && req.method === 'POST') {
        if (testStep[2] === 'cancel') return json(res, 200, remoteTests.cancel(testStep[1]));
        if (testStep[2] === 'activate') return json(res, 200, remoteTests.activate(testStep[1]));
        const input = await body(req), disconnect = new AbortController();
        // Validate run state before credential access; a stale step cannot read.
        const run = remoteTests.get(testStep[1]);
        if (!run.activated || !['starting', 'running'].includes(run.state) || run.busy || input.index !== run.next) return json(res, 409, { error: '测试已停止或步骤重复。' });
        input.config = await resolveCredential(input.config, true);
        if (req.aborted || res.destroyed) return;
        const onClose = () => { if (!res.writableEnded) disconnect.abort(); };
        res.on('close', onClose);
        try {
          const result = await remoteTests.step(testStep[1], input, disconnect.signal);
          if (!res.destroyed) return json(res, 200, result);
          return;
        } finally { res.off('close', onClose); }
      }
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
      if (pathname === '/api/interaction-memories' && req.method === 'GET') {
        const character = characterConfig({ timeline: url.searchParams.get('timeline') ?? undefined, style: url.searchParams.get('style') ?? undefined });
        return json(res, 200, interaction.list({ contextKey: character.contextKey,
          limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined,
          offset: url.searchParams.has('offset') ? Number(url.searchParams.get('offset')) : undefined }));
      }
      const interactionSource = /^\/api\/interaction-memories\/([a-f0-9-]{36})$/i.exec(pathname);
      if (interactionSource && ['PATCH', 'DELETE'].includes(req.method)) {
        const text = req.method === 'PATCH' ? validText((await body(req)).text, 1500) : undefined;
        const result = mutateInteractionSource(store, interaction, interactionSource[1], text);
        if (result.deleted || result.retained !== undefined) turns.invalidate();
        return json(res, 200, result);
      }
      if (pathname.startsWith('/api/memories/')) {
        const id = pathname.slice('/api/memories/'.length);
        if (req.method === 'PATCH') { const before = store.list(), sourceId = before.find(m => m.id === id)?.sourceId; const result = store.edit(id, (await body(req)).text, { beforeCommit: () => { if (sourceId) interaction.delete(interaction.sourceEventId(sourceId)); syncConfirmedLineage(store, interaction, before); } }); turns.invalidate(); return json(res, 200, result); }
        if (req.method === 'DELETE') { const before = store.list(), sourceId = before.find(m => m.id === id)?.sourceId; const result = store.delete(id, { beforeCommit: () => { if (sourceId) interaction.delete(interaction.sourceEventId(sourceId)); syncConfirmedLineage(store, interaction, before); } }); turns.invalidate(); return json(res, 200, result); }
      }
      const cancelTurn = /^\/api\/turns\/([^/]+)\/cancel$/.exec(pathname);
      if (cancelTurn && req.method === 'POST') return json(res, 200, turns.cancel(cancelTurn[1]));
      if (pathname === '/api/chat' && req.method === 'POST') {
        const input = await body(req), text = validText(input.text, 1500);
        if (input.remoteChat === true && (input.confirmed !== true || input.remoteTest === true || input.config?.provider !== 'deepseek')) return json(res, 403, { error: '真实聊天需要本人明确启用后逐次发送，仅授权官方 DeepSeek。' });
        const ownsChatLock = input.remoteChat === true || input.remoteTest === true;
        if (ownsChatLock && chatBusy) return json(res, 409, { error: '上一条聊天仍在处理，请等待或取消；没有启动重复调用。', budget: budget.status() });
        const turn = input.turnId === undefined ? null : turns.create(input.turnId);
        if (ownsChatLock) chatBusy = true;
        const disconnect = new AbortController();
        const onClose = () => { if (!res.writableEnded) { disconnect.abort(); if (turn) turns.cancel(turn.id); } };
        const onCancel = () => disconnect.abort();
        turn?.controller.signal.addEventListener('abort', onCancel, { once: true });
        const cancelled = () => {
          if (res.destroyed) return true;
          if (disconnect.signal.aborted) { json(res, 409, { turnId: turn?.id, generationState: 'cancelled', code: 'TURN_CANCELLED', error: '本轮已取消。', budget: budget.status() }); return true; }
          return false;
        };
        res.on('close', onClose);
        try {
          if (req.aborted || res.destroyed) return;
          const character = characterConfig(input.character);
          const memories = store.recall(text).filter(m => !containsPrivateMaterial(m.text) && !containsPrivateMaterial(m.sourceText || '') && ['reality', 'uncertain'].includes(domain(m.text)) && ['reality', 'uncertain'].includes(domain(m.sourceText || m.text)));
          const evidence = interaction.retrieve({ query: text.slice(0, 512), contextKey: character.contextKey, budget: { tokens: 2400, limit: 6, excerptChars: 300 } });
          const memoryGeneration = interaction.generation;
          const contextGeneration = store.contextGeneration;
          const messages = messagesFor(text, memories, store.history(16, character.contextKey).filter(e => !containsPrivateMaterial(e.text)), character, { interactionEvidence: evidence.items });
          let config = input.config || { provider: 'offline' };
          if (typeof config !== 'object' || Array.isArray(config) || ['provider', 'model', 'baseUrl', 'apiKey'].some(k => config[k] !== undefined && (typeof config[k] !== 'string' || config[k].length > (k === 'apiKey' ? 4096 : 500)))) throw Object.assign(new Error('模型配置字段无效或过长。'), { status: 400 });
          config = await resolveCredential(config, input.remoteTest === true || (input.remoteChat === true && input.confirmed === true));
          if (cancelled() || req.aborted) return;
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
            if (input.remoteChat === true && local) throw Object.assign(new Error('真实聊天仅授权官方 HTTPS DeepSeek 端点。'), { status: 403 });
            if (local) {
              if (!['http:', 'https:'].includes(endpoint.protocol)) throw Object.assign(new Error('本地模型需要 HTTP 端点。'), { status: 400 });
            } else {
              if (config.provider !== 'deepseek' || endpoint.origin !== 'https://api.deepseek.com' || !['', '/', '/v1', '/v1/'].includes(endpoint.pathname)) throw Object.assign(new Error('仅授权官方 DeepSeek 真实聊天或明确测试，其他远程服务禁用。'), { status: 403 });
              if (input.remoteTest !== true && !(input.remoteChat === true && input.confirmed === true)) throw Object.assign(new Error('请明确启用真实聊天后发送，或使用本人确认的单次测试。'), { status: 403 });
              if (typeof config.apiKey !== 'string' || !config.apiKey.trim() || /[\r\n]/.test(config.apiKey)) throw Object.assign(new Error('请由你本人在设置中输入密钥。'), { status: 400 });
              reservation = budget.reserve(config.model, messages, 128);
            }
            try {
              result = await complete(config, messages, { fetchImpl, signal: disconnect.signal }); provider = config.provider;
              if (reservation) budget.finish(reservation, result.usage, true);
            } catch (failure) {
              if (reservation) budget.finish(reservation, failure.usage || null, false);
              if (cancelled()) return;
              if (turn) throw Object.assign(new Error('模型未成功返回有效回复，请检查配置后手动重新发送。'), { status: 502, code: 'TURN_PROVIDER_FAILED' });
              if (input.remoteChat === true) return json(res, 502, { error: 'DeepSeek 未成功返回有效安全回复；没有写入演示回复，没有自动重试。已预留费用保留，请核对配置后手动发送。', budget: budget.status() });
              if (failure.code === 'UNSAFE_PROVIDER_REPLY') throw Object.assign(new Error('模型响应安全检查失败；本轮未保存或朗读。'), { status: 502 });
              if (failure.code === 'INVALID_EXPRESSION_CONTRACT') throw Object.assign(new Error('模型未提供有效的 JSON 表达契约；本轮未保存或朗读，没有自动重试。'), { status: 502 });
              error = '模型服务未成功回应，当前为本地演示回复；没有自动重试。';
            }
          }
          if (cancelled()) return;
          // Corrections/deletions clear history too. Discard completions and
          // fallbacks based on superseded context before persistence or delivery.
          if (contextGeneration !== store.contextGeneration || memoryGeneration !== interaction.generation) {
            if (turn) turns.cancel(turn.id);
            return json(res, 409, {
            ...(turn && { turnId: turn.id, generationState: 'cancelled' }),
            code: 'CONTEXT_CHANGED', error: '记忆已修改或删除，本次回复已取消。请重新发送。',
            });
          }
          const delivery = turn ? turns.complete(turn, result) : {};
          let user, assistant, memoryCapture;
          store.db.exec('BEGIN');
          try {
            user = store.event('user', text, { ...(turn && { turnId: turn.id }), provider, contextKey: character.contextKey, remoteTest: input.remoteTest === true });
            assistant = store.event('assistant', result.text, { turnId: user.turnId, provider, contextKey: character.contextKey, remoteTest: input.remoteTest === true,
              emotion: result.expressionSource === 'model-contract' ? result.emotion : null });
            memoryCapture = input.remoteTest === true ? { retained: false, reason: 'test-source' } : error ? { retained: false, reason: 'failed-generation' } : interaction.ingestUserTurn({ turnId: user.turnId, eventId: user.id, text, contextKey: character.contextKey, createdAt: user.createdAt });
            store.db.exec('COMMIT');
          } catch (failure) { store.db.exec('ROLLBACK'); throw failure; }
          return json(res, 200, { ...delivery, user, assistant, provider, error, character, emotion: result.emotion, expressionSource: result.expressionSource, memoryCapture, memoryEvidence: evidence, recalled: memories.map(m => ({ id: m.id, text: m.text })), usage: result.usage || null, budget: budget.status() });
        } catch (failure) {
          if (turn && turn.state !== 'cancelled') turn.state = 'error';
          if (cancelled()) return;
          if (turn && !res.headersSent) return json(res, failure.status || 400, { turnId: turn.id, generationState: 'error', code: failure.code || 'TURN_FAILED', error: failure.message.includes('SQL') ? '本地数据操作失败。' : failure.message, budget: budget.status() });
          throw failure;
        } finally { if (turn) { turn.busy = false; turn.updatedAt = turns.now(); turn.controller.signal.removeEventListener('abort', onCancel); } if (ownsChatLock) chatBusy = false; res.off('close', onClose); }
      }
      if (pathname === '/api/voices' && req.method === 'GET') {
        const neural = ttsConfigError ? { ready: false, error: ttsConfigError, voices: [] } : await localTts.status();
        let windows = [], error = null;
        try { windows = await speech.voices(); } catch { error = 'Windows 声音不可用；可选择浏览器声音。'; }
        return json(res, 200, { voices: [...(neural.ready ? neural.voices : []), ...windows], error, localTts: neural });
      }
      if (pathname === '/api/reference-profiles' && req.method === 'GET') return json(res, 200, { profiles: referenceImports.list(), error: ttsConfigError });
      const deleteReference = /^\/api\/reference-profiles\/([a-z0-9][a-z0-9_-]{0,39})$/.exec(pathname);
      if (deleteReference && req.method === 'DELETE') {
        if (ttsConfigError) throw Object.assign(new Error('现有参考登记无效，请先修复；不会覆盖登记。'), { status: 409 });
        return json(res, 200, await referenceImports.deletions.remove(deleteReference[1], await body(req)));
      }
      if (pathname === '/api/reference-deletions' && req.method === 'GET') return json(res, 200, { deletions: await referenceImports.deletions.list() });
      const restoreReference = /^\/api\/reference-deletions\/([a-f0-9-]{36})\/restore$/.exec(pathname);
      if (restoreReference && req.method === 'POST') {
        if (ttsConfigError) throw Object.assign(new Error('现有参考登记无效，请先修复；不会覆盖登记。'), { status: 409 });
        return json(res, 200, await referenceImports.deletions.restore(restoreReference[1], await body(req)));
      }
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
        if ((input.turnId === undefined) !== (input.segmentId === undefined)) throw Object.assign(new Error('turnId 与 segmentId 必须同时提供。'), { status: 400, code: 'INVALID_SEGMENT' });
        const turn = input.turnId === undefined ? null : turns.speech(input);
        if (input.expressionMode !== undefined && !['manual', 'reply'].includes(input.expressionMode)) throw Object.assign(new Error('表达模式无效。'), { status: 400, code: 'INVALID_SEGMENT' });
        if (input.emotion !== undefined && !['neutral', 'calm', 'happy', 'sad', 'angry', 'surprised'].includes(input.emotion)) throw Object.assign(new Error('表达情绪无效。'), { status: 400, code: 'INVALID_SEGMENT' });
        const manualExpression = input.referenceEmotion !== undefined;
        if (manualExpression && (input.expressionMode !== 'manual' || !['neutral', 'calm', 'happy', 'sad', 'angry', 'surprised'].includes(input.referenceEmotion))) throw Object.assign(new Error('手动参考表达无效。'), { status: 400, code: 'INVALID_REFERENCE_EMOTION' });
        const backend = input.backend || 'windows-sapi';
        if (backend === 'gpt-sovits' && referenceImports.committing) throw Object.assign(new Error('参考登记正在更新，请稍后试听。'), { status: 409 });
        if (!['windows-sapi', 'gpt-sovits'].includes(backend)) throw Object.assign(new Error('该声音后端不使用服务器合成接口。'), { status: 400 });
        validateSpeechOptions(input, backend);
        const releaseSpeech = turn ? turns.acquireSpeech(input) : () => {};
        const controller = new AbortController();
        const onTurnCancel = () => controller.abort();
        turn?.controller.signal.addEventListener('abort', onTurnCancel, { once: true });
        const cancelled = () => { if (!res.writableEnded) controller.abort(); };
        res.on('close', cancelled);
        let wav;
        const actualEmotion = manualExpression ? input.referenceEmotion : input.emotion || 'neutral';
        try {
          if (manualExpression) {
            const registered = localTts.voices ? localTts.voices() : (await localTts.status()).voices;
            if (backend !== 'gpt-sovits' || !registered?.find(v => v.id === input.referenceId)?.emotions?.includes(actualEmotion)) throw Object.assign(new Error('所选声线未登记该手动参考表达。'), { status: 400, code: 'UNSUPPORTED_REFERENCE_EMOTION' });
          }
          if (controller.signal.aborted) throw controller.signal.reason;
          wav = backend === 'gpt-sovits'
            ? await localTts.synthesize({ text: validText(input.text, 300), referenceId: input.referenceId, emotion: actualEmotion, speed: input.speed, signal: controller.signal })
            : await speech.synthesize(validText(input.text, 1000), input.voice, { signal: controller.signal });
        } catch (failure) {
          if (res.destroyed) return;
          if (controller.signal.aborted) return json(res, 409, { code: 'TURN_CANCELLED', turnId: turn?.id, error: '本轮语音已取消。' });
          if (failure.code === 'UNSUPPORTED_REFERENCE_EMOTION') return json(res, 400, { code: failure.code, turnId: turn?.id, segmentId: input.segmentId, error: failure.message });
          return json(res, 502, { code: 'TTS_FAILED', turnId: turn?.id, segmentId: input.segmentId, error: '语音合成失败，可重播或重新发送。' });
        } finally { releaseSpeech(); res.off('close', cancelled); turn?.controller.signal.removeEventListener('abort', onTurnCancel); }
        if (res.destroyed) return;
        if (controller.signal.aborted) return json(res, 409, { code: 'TURN_CANCELLED', turnId: turn?.id, error: '本轮语音已取消。' });
        res.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store', 'X-Exo-Emotion': backend === 'gpt-sovits' ? actualEmotion : 'neutral', 'X-Exo-Expression-Mode': manualExpression ? 'manual' : 'reply' }); res.end(wav); return;
      }
      if (pathname.startsWith('/api/')) return json(res, 404, { error: '接口不存在。' });
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: '方法不支持。' });
      if (pathname.startsWith('/character-assets/')) return await serveFile(res, assetRoot, pathname.slice(18));
      if (vite) return vite.middlewares(req, res, () => json(res, 404, { error: '页面不存在。' }));
      return await serveFile(res, join(projectRoot, 'dist'), pathname === '/' ? 'index.html' : pathname.slice(1));
    } catch (error) { if (!res.headersSent) json(res, error.status || 400, { ...(error.code && { code: error.code }), ...(req.url === '/api/chat' ? { budget: budget.status() } : {}), error: error.message.includes('SQL') ? '本地数据操作失败。' : error.message }); }
  });
  return { app, store, interaction, budget, async close() { turns.close(); remoteTests.close(); if (app.listening) await new Promise(r => app.close(r)); referenceImports.close(); await vite?.close(); interaction.close(); store.close(); } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const context = await createApp({ dev: process.argv.includes('--dev') });
  const port = Number(process.env.PORT || 3000);
  context.app.listen(port, '127.0.0.1', () => console.log(`Project Exo: http://127.0.0.1:${port} · default offline demo, no automatic API calls`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await context.close(); process.exit(0); });
}
