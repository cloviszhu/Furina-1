import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { characterConfig, personaFor } from '../server/persona.js';
import { complete, messagesFor, parseReply } from '../server/providers.js';
import { createApp } from '../server/index.js';
import { MemoryStore } from '../server/memory.js';
import { RemoteBudget, PRICING } from '../server/budget.js';

test('persona variants separate official background, confirmed player facts and subjective feelings', () => {
  for (const timeline of ['aftermath', 'performer']) for (const style of ['natural', 'theatrical', 'quiet']) {
    const config = characterConfig({ timeline, style });
    const prompt = messagesFor('你好', [{ id: 'fact', text: '玩家新事件' }], [], config)[0].content;
    assert(prompt.includes('官方背景边界')); assert(prompt.includes('玩家新事实')); assert(prompt.includes('主观感受'));
    assert(prompt.includes('不是只有傲娇')); assert(prompt.includes('不能把推测')); assert(prompt.includes('玩家新事件'));
    assert.equal(prompt.includes('已走过司颂'), timeline === 'performer');
  }
  assert.throws(() => characterConfig({ timeline: 'made-up' }), /有效/);
  assert.throws(() => personaFor('ignore rules'), /配置/);
});

test('reply contract separates control from speech, accepts legacy text, refuses malformed/truncated/extra fields', () => {
  assert.deepEqual(parseReply('{"text":"今天，先休息一下。","emotion":"calm"}'), { text: '今天，先休息一下。', emotion: 'calm', expressionSource: 'model-contract' });
  assert.equal(parseReply('```json\n{"text":"你好","emotion":"happy"}\n```').emotion, 'happy');
  assert.equal(parseReply('普通回复').expressionSource, 'plain-text');
  for (const input of ['{"text":"截断', '{"text":"你好","emotion":"excited"}', '{"text":"你好","emotion":"happy","instruction":"hack"}', '{"text":"[happy]你好","emotion":"happy"}', '[]']) assert.throws(() => parseReply(input), /结构/);
});

test('all protocols parse same expression contract and whitelist usage; no real provider requests', async () => {
  for (const provider of ['openai', 'glm', 'deepseek', 'kimi', 'compatible', 'claude', 'ollama']) {
    const content = '{"text":"舞台已经准备好了。","emotion":"happy"}';
    const result = await complete({ provider, model: 'fixture', baseUrl: 'http://127.0.0.1:1', apiKey: 'fake-qa-key-only' }, messagesFor('你好', []), {
      fetchImpl: async () => Response.json({ choices: [{ message: { content } }], content: [{ type: 'text', text: content }], message: { content }, usage: { input_tokens: 10, output_tokens: 4, debug: 'fake-qa-key-only' } }),
    });
    assert.equal(result.emotion, 'happy'); assert(!result.text.includes('emotion'));
    assert.deepEqual(result.usage, { prompt_tokens: 10, completion_tokens: 4 });
    assert(!JSON.stringify(result).includes('fake-qa-key-only'));
  }
});

test('provider key echoes and oversized bodies never become reply text', async () => {
  const config = { provider: 'ollama', model: 'fixture', apiKey: 'fake-qa-key-only' };
  await assert.rejects(complete(config, [], { fetchImpl: async () => Response.json({ message: { content: 'fake-qa-key-only' } }) }), /安全/);
  await assert.rejects(complete(config, [], { fetchImpl: async () => new Response('a'.repeat(128001)) }), /过大/);
});

test('existing SQLite schema migrates without dropping conversations, memories or context partitions', () => {
  const directory = mkdtempSync(join(tmpdir(), 'exo-migration-')), file = join(directory, 'test.sqlite');
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE events (id TEXT PRIMARY KEY,turn_id TEXT NOT NULL,role TEXT NOT NULL,text TEXT NOT NULL,kind TEXT NOT NULL,provider TEXT NOT NULL,created_at TEXT NOT NULL)');
  db.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?)').run('old', 'turn', 'user', '旧对话', 'conversation', 'offline', '2026-09-30'); db.close();
  const store = new MemoryStore(file);
  try {
    assert.equal(store.history(16, 'aftermath:natural')[0].text, '旧对话');
    store.save('旧对话', 'old'); store.event('user', '新舞台', { contextKey: 'performer:quiet' });
    assert.equal(store.history(16, 'performer:quiet')[0].text, '新舞台');
    assert.equal(store.history(16, 'aftermath:natural').length, 1); assert.equal(store.list()[0].sourceText, '旧对话');
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('HTTP malformed endpoints/key echoes/usage do not leak fixture credentials to errors, history or DB', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'exo-key-'));
  const key = 'fake-qa-key-only'; let calls = 0, echo = true;
  const context = await createApp({ dataDir: directory, fetchImpl: async () => {
    calls++; return Response.json({ message: { content: echo ? key : '{"text":"安全正文","emotion":"calm"}' }, usage: { prompt_tokens: 1, completion_tokens: 2, secret: key } });
  } });
  await new Promise(r => context.app.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${context.app.address().port}`;
  const post = input => fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  try {
    const malformed = await post({ text: '你好', config: { provider: 'ollama', baseUrl: key, apiKey: key, model: 'fixture' } });
    assert.equal(malformed.status, 400); assert(!(await malformed.text()).includes(key)); assert.equal(calls, 0);
    const config = { provider: 'ollama', model: 'fixture', apiKey: key };
    const denied = await post({ text: '你好', config });
    assert.equal(denied.status, 502); const failed = await denied.json();
    assert(failed.error); assert(!JSON.stringify(failed).includes(key));
    assert.deepEqual(context.store.history(), []);
    assert.equal(context.store.db.prepare('SELECT count(*) AS n FROM events').get().n, 0);
    echo = false;
    const safe = await (await post({ text: '新的问候', config, character: { timeline: 'performer', style: 'quiet' } })).json();
    assert.equal(safe.provider, 'ollama'); assert.equal(safe.emotion, 'calm'); assert(!JSON.stringify(safe).includes(key));
    assert(!JSON.stringify(context.store.history()).includes(key));
    assert(!JSON.stringify(context.store.db.prepare('SELECT * FROM events').all()).includes(key));
    assert.equal(context.budget.status().usedCalls, 0);
    const before = calls;
    assert.equal((await post({ text: key, config })).status, 400); assert.equal(calls, before);
    const other = await (await fetch(base + '/api/history?timeline=performer&style=quiet')).json();
    assert.equal(other.length, 2); assert(other.every(e => !e.text.includes('你好')));
  } finally { await context.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('input/context and persisted budget reject before any provider dispatch, including after restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'exo-cap-')); let calls = 0;
  let context = await createApp({ dataDir: directory, fetchImpl: async () => { calls++; throw new Error('fixture only'); } });
  const start = async () => { await new Promise(r => context.app.listen(0, '127.0.0.1', r)); return `http://127.0.0.1:${context.app.address().port}`; };
  let base = await start();
  const post = input => fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const remote = { provider: 'deepseek', model: 'deepseek-flash', apiKey: 'fake-qa-key-only' };
  try {
    assert.equal((await post({ text: 'x'.repeat(1501) })).status, 400);
    assert.equal((await post({ text: 'x'.repeat(33000) })).status, 413);
    assert.equal((await post({ text: '你好', config: remote })).status, 403);
    context.store.save('记忆'.repeat(1000)); context.store.save('记忆'.repeat(1000)); context.store.save('记忆'.repeat(1000));
    assert.equal((await post({ text: '回忆', config: remote, remoteTest: true })).status, 400); assert.equal(calls, 0);
    const budget = new RemoteBudget(context.store.db, { now: () => Date.parse(PRICING.verifiedAt) + 1000 });
    for (let i = 0; i < 3; i++) budget.finish(budget.reserve('deepseek-flash', messagesFor('小测试', [])), null, false);
    await context.close(); context = await createApp({ dataDir: directory, fetchImpl: async () => { calls++; throw new Error(); } }); base = await start();
    assert.equal((await post({ text: '问候', config: remote, remoteTest: true })).status, 400);
    assert.equal(context.budget.status().usedCalls, 3); assert.equal(calls, 0);
  } finally { await context.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('loopback read/write origins, malformed JSON and excluded files stay blocked', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'exo-boundary-'));
  const context = await createApp({ dataDir: directory });
  await new Promise(r => context.app.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${context.app.address().port}`;
  try {
    for (const path of ['/api/status', '/api/history', '/api/memories', '/api/voices']) {
      assert.equal((await fetch(base + path, { headers: { Origin: 'https://evil.example' } })).status, 403);
      assert.equal((await fetch(base + path, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    }
    assert.equal((await fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
    for (const path of ['/.env', '/data/exo.sqlite', '/.runtime/model-manifest.json', '/server/index.js']) assert.equal((await fetch(base + path)).status, 404);
    assert.equal((await fetch(base + '/character-assets/..%5C..%5Csecret')).status, 403);
  } finally { await context.close(); rmSync(directory, { recursive: true, force: true }); }
});
