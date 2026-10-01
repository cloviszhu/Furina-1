import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import pack from '../server/data/furina-canon-4.2.v2.json' with { type: 'json' };
import { createApp } from '../server/index.js';
import { messagesFor } from '../server/providers.js';
import { resolveCharacterContext } from '../server/character-context.js';
import { addCharacterContext } from '../server/character-context-adapter.js';

const rows = messages => messages[0].content.split('\n').filter(line => line.startsWith('{"kind":')).map(line => JSON.parse(line));

test('trial queries retain courtroom claim and learned timing in actual provider HTTP requests', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'exo-trial-adapter-')); const requests = [];
  const app = await createApp({ dataDir: directory, credentials: { resolve: async c => c }, fetchImpl: async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return Response.json({ message: { content: '{"text":"隔离回复","emotion":"neutral"}' } });
  } });
  t.after(async () => { await app.close(); assert(resolve(directory).startsWith(resolve(tmpdir()) + sep)); rmSync(directory, { recursive: true, force: true }); });
  await new Promise(r => app.app.listen(0, '127.0.0.1', r));
  for (const timeline of ['aftermath', 'performer']) {
    for (const [query, fragment] of [['审判舞台', '房间墙壁退去'], ['接受审判', '接受审判'],
      ['审判水测试', '此为当庭说法'], ['测试水浓度', '事前未获知'], ['审判双重判决', '不因此预知执行机制']]) {
      const response = await fetch(`http://127.0.0.1:${app.app.address().port}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ turnId: randomUUID(), text: query, character: { timeline, style: 'natural' }, config: { provider: 'ollama', model: 'fixture' } }) });
      assert.equal(response.status, 200, JSON.stringify(await response.json()));
      const messages = requests.at(-1).messages, selected = rows(messages);
      assert(selected.length > 0 && selected.length <= 2);
      assert(selected.some(r => r.text.includes(fragment)), query);
      assert(selected.every(r => r.sourceStatus === 'secondary_game_dialogue_transcription'));
      assert(messages[0].content.includes('未独立核对游戏原始资料'));
      assert(Buffer.byteLength(JSON.stringify(messages)) <= 16000);
      assert(!messages[0].content.includes('verificationTodo'));
      if (query === '测试水浓度') assert(selected.some(r => r.knowledgeMode === 'reported'));
      const base = [{ role: 'system', content: '' }, { role: 'user', content: 'x'.repeat(15930) }];
      assert.deepEqual(addCharacterContext(base, { query, timeline }), base); // Canon cannot evict existing user bytes.
    }
  }
  assert.equal(requests.length, 10); assert.equal(app.budget.status().usedCalls, 0);
});

test('expanded provider selection retains claimed foreknowledge qualification and reported hindsight', () => {
  const defense = rows(messagesFor('公开辩解', [], []));
  assert.equal(defense.length, 1); assert.equal(defense[0].kind, 'characterinterpretation');
  assert(defense[0].text.includes('维持姿态的说法')); assert(defense[0].text.includes('不是计划真实性的证明'));
  const plan = rows(messagesFor('救援计划', [], []));
  assert.equal(plan[0].knowledgeMode, 'reported'); assert(plan[0].text.includes('绝非亲眼见证'));
  assert.equal(plan[0].sourceStatus, 'secondary_game_dialogue_transcription');
});

test('expanded pack stays within adapter projection and excludes pending scenes and unrelated desserts', () => {
  for (const query of ['海露港', '林尼审判', '公子判决', '首次茶会', '第二次茶会', '秘密调查', '白淞回访', '终曲选择']) {
    const projected = resolveCharacterContext({ query, timeline: 'performer', maxRecords: 2, maxBytes: 1024 });
    assert(Buffer.byteLength(projected.modelPrompt) <= 1024);
    const messages = messagesFor(query, [], [], { timeline: 'performer', style: 'natural' });
    assert(rows(messages).length > 0); assert(rows(messages).length <= 2);
    assert(!rows(messages).some(r => r.text.includes('马卡龙')));
  }
  for (const record of pack.records.filter(r => !r.enabled)) {
    const messages = messagesFor(record.text, [], [], { timeline: 'performer', style: 'natural' });
    assert(!messages[0].content.includes(record.text));
    for (const excluded of ['verificationTodo', '路由/正文', 'source catalog']) assert(!messages[0].content.includes(excluded));
  }
});

test('actual app messages pair main-story hindsight and SQ timeline without promoting user assertions', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'exo-story-adapter-')); const requests = [];
  const app = await createApp({ dataDir: directory, credentials: { resolve: async c => c }, fetchImpl: async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return Response.json({ message: { content: '{"text":"隔离回复","emotion":"neutral"}' } });
  } });
  t.after(async () => { await app.close(); assert(resolve(directory).startsWith(resolve(tmpdir()) + sep)); rmSync(directory, { recursive: true, force: true }); });
  await new Promise(r => app.app.listen(0, '127.0.0.1', r));
  const chat = async (text, timeline = 'aftermath') => {
    const response = await fetch(`http://127.0.0.1:${app.app.address().port}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ turnId: randomUUID(), text, character: { timeline, style: 'natural' }, config: { provider: 'ollama', model: 'fixture' } }) });
    const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body)); return body;
  };
  await chat('我早就知道公子判决的真正安排。');
  const reply = await chat('公开辩解'); assert(reply.memoryEvidence.items.length <= 6);
  assert(rows(requests.at(-1).messages)[0].text.includes('不是计划真实性的证明'));
  await chat('救援计划'); assert.equal(rows(requests.at(-1).messages)[0].knowledgeMode, 'reported');
  await chat('白淞回访'); assert.deepEqual(rows(requests.at(-1).messages), []);
  await chat('白淞回访', 'performer'); assert(rows(requests.at(-1).messages).some(r => r.text.includes('娜维娅')));
  await chat('今天有点累'); assert.deepEqual(rows(requests.at(-1).messages), []);
  assert.equal(app.budget.status().usedCalls, 0); assert.equal(requests.length, 6);
});
