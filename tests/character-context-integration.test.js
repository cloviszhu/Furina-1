import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { messagesFor } from '../server/providers.js';
import { addCharacterContext, CANON_BUDGET } from '../server/character-context-adapter.js';
import { createApp } from '../server/index.js';
import { LIMITS, PRICING } from '../server/budget.js';

const canonRows = messages => messages[0].content.split('\n').filter(line => line.startsWith('{"kind":')).map(line => JSON.parse(line));
const inputBytes = messages => Buffer.byteLength(JSON.stringify(messages), 'utf8');

test('provider timeline pairs exclude future events and preserve current persona', () => {
  for (const query of ['神之眼', 'Clio', '重返舞台']) {
    const before = messagesFor(query, [], [], { timeline: 'aftermath', style: 'natural' });
    const after = messagesFor(query, [], [], { timeline: 'performer', style: 'natural' });
    assert.deepEqual(canonRows(before), []);
    assert(canonRows(after).length > 0);
    assert(before[0].content.includes('没有神之眼，尚未经历克莉奥的演出'));
    assert(after[0].content.includes('经历克莉奥的演出并获得神之眼'));
    assert(after[0].content.includes('尚未独立核对游戏原始资料'));
  }
});

test('reported learning differs from eyewitness and has qualified source status', () => {
  const reported = canonRows(messagesFor('芙卡洛斯的私密对话', [], []));
  assert.equal(reported[0].knowledgeMode, 'reported');
  assert.equal(reported[0].knowledgeSourceStatus, 'secondary_game_dialogue_transcription');
  assert(reported[0].text.includes('不代表她亲眼参与'));
  const witnessed = canonRows(messagesFor('卡雷斯的决斗', [], []));
  assert.equal(witnessed[0].knowledgeMode, 'eyewitness');
  assert.equal(witnessed[0].sourceStatus, 'reference-transcript-checked');
});

test('only relevant current query injects canon, never excluded source notes or prior dessert topic', () => {
  for (const query of ['', '娜', 'a', '你好', '今天有点累']) {
    const messages = messagesFor(query, [], [{ role: 'user', text: '马卡龙' }]);
    assert.deepEqual(canonRows(messages), []);
    assert(!messages[0].content.includes('角色背景参考数据'));
  }
  const messages = messagesFor('出租公寓', [], []);
  assert(canonRows(messages).some(r => r.text.includes('搬进出租公寓')));
  for (const excluded of ['检索索引返回', 'verificationTodo', 'teaser-stage-choice', '舞台上的选择与命运', 'HoYoWiki', 'https://']) assert(!messages[0].content.includes(excluded));
});

test('independent canon projection preserves user evidence without promoting it to canon', () => {
  const evidence = [{ sourceId: 'synthetic-user-source', sourceRole: 'user', text: '我喜欢通心粉。', epistemic: 'user_reported' }];
  const history = [{ role: 'user', text: '我昨天吃了通心粉' }, { role: 'assistant', text: '模拟回复', emotion: 'happy' }];
  const messages = messagesFor('通心粉', [{ text: '我住在出租公寓' }], history, undefined, { interactionEvidence: evidence });
  assert(messages[0].content.includes(JSON.stringify(evidence)));
  assert.equal(messages[0].content.split('synthetic-user-source').length - 1, 1);
  assert.deepEqual(messages.slice(1), [...history.map(e => ({ role: e.role, content: e.role === 'user' ? e.text : JSON.stringify({ text: e.text, emotion: e.emotion }) })), { role: 'user', content: '通心粉' }]);
  const canon = canonRows(messages); assert.equal(canon.length, 1);
  assert(canon[0].text.includes('不能据此说它是她最爱的食物'));
  assert(!canon[0].text.includes('我喜欢'));
});

test('serialized request budget preserves existing bytes and drops canon whole at capacity', () => {
  const empty = [{ role: 'system', content: '' }, { role: 'user', content: '通心粉' }];
  const overhead = inputBytes(empty);
  for (const room of [0, 20, 500, 1000, 1800]) {
    const base = [{ ...empty[0], content: 'x'.repeat(LIMITS.inputBytes - overhead - room) }, empty[1]];
    const next = addCharacterContext(base, { query: '通心粉' });
    assert(inputBytes(next) <= LIMITS.inputBytes);
    assert(next[0].content.endsWith(base[0].content));
    assert.equal(base[0].content.length, LIMITS.inputBytes - overhead - room);
    assert.deepEqual(next.slice(1), base.slice(1));
    if (room < 500) assert.strictEqual(next, base);
  }
  assert.equal(CANON_BUDGET.maxBytes, 1024); assert.equal(CANON_BUDGET.maxRecords, 2);
});

test('isolated HTTP messages keep user facts separate, paired timeline and remote budget count full request', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'exo-canon-adapter-'));
  const requests = [];
  const app = await createApp({ dataDir: directory, credentials: { resolve: async c => c }, fetchImpl: async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return Response.json({ message: { content: '{"text":"隔离回复","emotion":"neutral"}' }, choices: [{ message: { content: '{"text":"隔离回复","emotion":"neutral"}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
  } });
  app.budget.now = () => Date.parse(PRICING.verifiedAt) + 1000;
  t.after(async () => { await app.close(); assert(resolve(directory).startsWith(resolve(tmpdir()) + sep)); rmSync(directory, { recursive: true, force: true }); });
  await new Promise(r => app.app.listen(0, '127.0.0.1', r));
  const chat = async (text, timeline = 'aftermath', extra = {}) => {
    const response = await fetch(`http://127.0.0.1:${app.app.address().port}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ turnId: randomUUID(), text, character: { timeline, style: 'natural', perspective: 'author' }, config: { provider: 'ollama', model: 'fixture' }, ...extra }) });
    const value = await response.json(); assert.equal(response.status, 200, JSON.stringify(value)); return value;
  };
  await chat('我喜欢通心粉。');
  const recalled = await chat('通心粉怎么吃？');
  const capsule = recalled.memoryEvidence.items.find(e => e.text === '我喜欢通心粉。'); assert(capsule);
  assert(requests.at(-1).messages[0].content.includes(JSON.stringify(capsule)));
  assert(canonRows(requests.at(-1).messages).every(r => !r.text.includes('我喜欢')));
  await chat('神之眼'); assert.deepEqual(canonRows(requests.at(-1).messages), []);
  await chat('神之眼', 'performer'); assert(canonRows(requests.at(-1).messages).some(r => r.text.includes('不清楚获得机制')));
  await chat('私密对话', 'aftermath'); assert.equal(canonRows(requests.at(-1).messages)[0].knowledgeMode, 'reported');
  await chat('你好'); assert.deepEqual(canonRows(requests.at(-1).messages), []);
  await chat('通心粉', 'aftermath', { remoteChat: true, confirmed: true, config: { provider: 'deepseek', model: 'deepseek-flash', apiKey: 'fixture-only-not-a-real-key' } });
  const last = requests.at(-1); const usage = app.budget.status().records[0];
  assert.equal(usage.input_bound, inputBytes(last.messages) + 1024);
  assert.equal(usage.output_limit, 128); assert.equal(last.stream, false);
  assert.equal(app.budget.status().usedCalls, 1); // Fake provider/isolated ledger only.
  assert.equal(requests.length, 7);
});
