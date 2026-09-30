import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { complete, messagesFor } from '../server/providers.js';
import { MemoryStore } from '../server/memory.js';
import { RemoteBudget, PRICING } from '../server/budget.js';
import { RemoteTests } from '../server/remote-tests.js';
import { safeReport } from '../server/test-reports.js';
import { createApp } from '../server/index.js';
import { WindowsCredentials } from '../server/credentials.js';

const config = { provider: 'deepseek', model: 'deepseek-flash', apiKey: 'fake-contract-fixture' };
const response = content => Response.json({ choices: [{ message: { content } }], usage: { prompt_tokens: 30, completion_tokens: 8, debug: config.apiKey } });

test('legacy assistant history has unknown emotion, new real expression survives SQLite reopen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'exo-contract-history-')), file = join(dir, 'test.sqlite');
  let store = new MemoryStore(file);
  try {
    store.event('user', '约好周六'); store.event('assistant', '尚未确认');
    store.event('assistant', '真高兴', { provider: 'deepseek', emotion: 'happy' });
    const before = store.db.prepare('SELECT id, text FROM events').all();
    store.close(); store = new MemoryStore(file);
    assert.deepEqual(store.db.prepare('SELECT id, text FROM events').all(), before);
    const history = messagesFor('后来呢？', [], store.history());
    assert.deepEqual(history.filter(m => m.role === 'assistant').map(m => JSON.parse(m.content)), [
      { text: '尚未确认', emotion: null }, { text: '真高兴', emotion: 'happy' },
    ]);
    assert.match(history[0].content, /null 表示旧历史/);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('DeepSeek missing/plain/truncated/invalid contract fails once, safely retaining numeric usage', async () => {
  for (const content of ['', '纯文本回复', '{"text":"截断', '{"text":"正文","emotion":null}', '{"text":"正文","emotion":"happy","extra":1}']) {
    let calls = 0;
    await assert.rejects(complete(config, messagesFor('你好', []), { fetchImpl: async () => { calls++; return response(content); } }), e => {
      assert.equal(e.code, 'INVALID_EXPRESSION_CONTRACT');
      assert.deepEqual(e.usage, { prompt_tokens: 30, completion_tokens: 8 });
      assert(!JSON.stringify(e).includes(config.apiKey)); return true;
    });
    assert.equal(calls, 1);
  }
});

test('turn two protocol failure stops batch, no neutral result, safe saved diagnosis and untouched formal memory', async () => {
  const store = new MemoryStore(':memory:'); let calls = 0;
  const budget = new RemoteBudget(store.db, { now: () => Date.parse(PRICING.verifiedAt) + 1000 });
  const tests = new RemoteTests(budget, { fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body); calls++;
    if (calls === 2) assert.deepEqual(JSON.parse(body.messages.find(m => m.role === 'assistant').content), { text: '第一轮', emotion: 'happy' });
    return response(calls === 1 ? '{"text":"第一轮","emotion":"happy"}' : '后续丢失契约');
  } });
  try {
    store.save('原有记忆'); const memories = store.list();
    const run = tests.start({ id: randomUUID(), confirmed: true, config }); tests.activate(run.id);
    await tests.step(run.id, { index: 0, config });
    const failed = await tests.step(run.id, { index: 1, config });
    assert.equal(failed.state, 'stopped'); assert.equal(failed.status, 'failed');
    assert.equal(failed.emotion, null); assert.equal(failed.structured, false); assert.equal(failed.text, '');
    assert.match(failed.error, /JSON 表达契约.*没有重试/);
    assert.equal(failed.usage.completion_tokens, 8);
    const saved = safeReport(tests.run); assert.equal(saved.rows[1].errorCode, 'INVALID_EXPRESSION_CONTRACT');
    assert.equal(saved.rows[1].usage.prompt_tokens, 30); assert(!JSON.stringify(saved).includes(config.apiKey));
    await assert.rejects(tests.step(run.id, { index: 2, config })); assert.equal(calls, 2);
    assert.equal(budget.status().records[1].status, 'failed'); assert(budget.status().reservedCny > 0);
    assert.deepEqual(store.list(), memories); assert.deepEqual(store.history(), []);
  } finally { store.close(); }
});

test('HTTP contract failure is visible and never stored as an offline fallback', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'exo-contract-http-')); let calls = 0;
  const app = await createApp({ dataDir: dir,
    credentials: new WindowsCredentials({ bridge: async () => ({ ok: true, saved: false }) }),
    fetchImpl: async () => { calls++; return response('无结构'); } });
  await new Promise(r => app.app.listen(0, '127.0.0.1', r));
  try {
    const result = await fetch(`http://127.0.0.1:${app.app.address().port}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '你好', config: { ...config, baseUrl: 'http://127.0.0.1:1' } }) });
    assert.equal(result.status, 502); const error = await result.json();
    assert.match(error.error, /JSON 表达契约.*未保存或朗读.*没有自动重试/);
    assert.equal(error.assistant, undefined); assert.equal(error.emotion, undefined);
    assert.equal(calls, 1); assert.deepEqual(app.store.history(), []);
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('all persona styles instruct unknown-versus-denied boundary and permit explicit stories', () => {
  for (const timeline of ['aftermath', 'performer']) for (const style of ['natural', 'quiet', 'theatrical']) {
    const prompt = messagesFor('编个雪山故事', [], [], { timeline, style })[0].content;
    for (const rule of ['未确认发生不等于确认未发生', '缺少回忆也不证明事情从未发生', '不是独立事实证据', '可以自然进入故事并继续创作', '不必每轮以问题结尾', '不擅自断定通常不是体力问题']) assert(prompt.includes(rule));
  }
});
