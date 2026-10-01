import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createApp } from '../server/index.js';

async function fixture(body) {
  const directory = mkdtempSync(join(tmpdir(), 'exo-memory-integration-'));
  let context, base, release, began, wait = false, fail = false;
  const requests = [];
  const open = async () => {
    context = await createApp({ dataDir: directory, credentials: { resolve: async c => c }, fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      if (wait) { began(); await new Promise(r => { release = r; }); }
      if (fail) throw Error('fixture upstream');
      return Response.json({ message: { content: JSON.stringify({ text: '只是一份生成回复，不是用户事实。', emotion: 'neutral' }) } });
    } });
    await new Promise(r => context.app.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${context.app.address().port}`;
  };
  const request = async (path, method = 'GET', input) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, ...(input !== undefined && { body: JSON.stringify(input) }) });
    return { status: response.status, value: await response.json() };
  };
  const chat = (text, extra = {}) => request('/api/chat', 'POST', { turnId: randomUUID(), text, config: { provider: 'ollama', model: 'fixture' }, ...extra });
  await open();
  try { await body({ get context() { return context; }, requests, request, chat,
    async reopen() { await context.close(); await open(); },
    hold() { wait = true; return new Promise(r => { began = r; }); },
    release() { wait = false; release?.(); }, fail(value) { fail = value; },
  }); }
  finally { release?.(); await context.close(); assert(resolve(directory).startsWith(resolve(tmpdir()) + sep)); rmSync(directory, { recursive: true, force: true }); }
}

test('explicit test sends preserve history/provenance without automatic facts or altering manual confirmations', async () => fixture(async f => {
  const original = await f.chat('我喜欢桂花茶。');
  await f.request('/api/memories', 'POST', { text: '我喜欢桂花茶。', sourceId: original.value.user.id });
  const before = f.context.store.list();
  const probe = await f.chat('我住在杭州。', { remoteTest: true });
  assert.equal(probe.status, 200); assert.deepEqual(probe.value.memoryCapture, { retained: false, reason: 'test-source' });
  assert.equal(probe.value.user.remoteTest, true);
  assert.equal(f.context.store.db.prepare('SELECT remote_test FROM events WHERE id=?').get(probe.value.user.id).remote_test, 1);
  assert(f.context.store.history().some(e => e.id === probe.value.user.id));
  assert(!f.context.interaction.list({ contextKey: 'aftermath' }).items.some(e => e.eventId === probe.value.user.id));
  assert.deepEqual(f.context.store.list(), before);
  const chat = await f.chat('我住在苏州。'); assert.equal(chat.value.memoryCapture.retained, true);
  await f.reopen();
  assert(!f.context.interaction.retrieve({ query: '杭州', contextKey: 'aftermath' }).items.some(e => e.sourceId === probe.value.user.id));
  assert.deepEqual(f.context.store.list(), before);
}));

test('automatic user evidence survives history/restart and preserves roles, fiction and privacy', async () => fixture(async f => {
  const first = await f.chat('我喜欢茉莉花茶。'); assert.equal(first.status, 200); assert(first.value.memoryCapture.retained);
  assert.deepEqual(f.context.store.list(), []); // automatic capture needs no manual confirmation
  for (let i = 0; i < 9; i++) await f.chat(`普通闲聊${i}`);
  await f.reopen(); const recalled = await f.chat('还记得茉莉花茶吗？', { character: { timeline: 'aftermath', style: 'quiet' } });
  const evidence = recalled.value.memoryEvidence.items.find(e => e.sourceId === first.value.user.id);
  assert(evidence); assert.equal(evidence.sourceRole, 'user'); assert.equal(evidence.epistemic, 'user_reported');
  assert.equal(evidence.claims[0].type, 'preference'); assert(!f.context.store.history().some(e => e.id === first.value.user.id));
  assert(f.requests.at(-1).messages[0].content.includes('用户自述不是已核验事实'));
  const other = await f.chat('还记得茉莉花茶吗？', { character: { timeline: 'performer', style: 'natural' } });
  assert(!other.value.memoryEvidence.items.some(e => e.sourceId === first.value.user.id));
  const fiction = await f.chat('虚构故事：我住在银河城。'); assert(fiction.value.memoryCapture.retained);
  const privateTurn = await f.chat('我的密码是仅供测试的隐私值。'); assert.equal(privateTurn.value.memoryCapture.reason, 'private-material');
  const memory = await f.request('/api/interaction-memories?limit=100');
  assert(memory.value.items.some(e => e.domain === 'fiction'));
  assert(!memory.value.items.some(e => e.text.includes('隐私值') || e.text.includes('生成回复')));
  const query = await f.chat('你记得银河城吗？'); assert(!query.value.memoryEvidence.items.some(e => e.domain === 'fiction'));
  assert(!JSON.stringify(f.requests.at(-1)).includes('隐私值'));
  assert.equal((await f.request('/api/interaction-memories?limit=101')).status, 400);
  assert.equal(f.context.budget.status().usedCalls, 0);
}));

test('natural and confirmed correction/deletion synchronize lineage, invalidate late generation and remain idempotent', async () => fixture(async f => {
  const first = await f.chat('我住在杭州。');
  const confirmed = await f.request('/api/memories', 'POST', { text: '我住在杭州。', sourceId: first.value.user.id });
  assert.equal(confirmed.status, 201);
  const started = f.hold(); const pending = f.chat('还记得杭州吗？'); await started;
  const revised = await f.request(`/api/interaction-memories/${first.value.user.id}`, 'PATCH', { text: '我住在苏州。' });
  assert.equal(revised.status, 200); assert.equal(revised.value.revision, 2); assert.equal(f.context.store.list()[0].text, '我住在苏州。');
  f.release(); assert.equal((await pending).status, 409);
  assert.deepEqual(f.context.store.history(), []);
  const newReply = await f.chat('还记得苏州吗？'); assert(newReply.value.memoryEvidence.items.some(e => e.text === '我住在苏州。'));
  assert(!JSON.stringify(f.requests.at(-1)).includes('杭州'));
  const linked = f.context.store.list()[0];
  assert.equal((await f.request(`/api/memories/${linked.id}`, 'DELETE')).status, 200);
  assert(!f.context.interaction.list({ contextKey: 'aftermath' }).items.some(e => e.eventId === first.value.user.id));
  // A natural source revision retains the old event lineage while confirmed
  // memories receive new explicit sources; deleting the natural source removes it.
  const removed = await f.request(`/api/interaction-memories/${first.value.user.id}`, 'DELETE'); assert.equal(removed.value.deleted, false);
  const repeated = await f.request(`/api/interaction-memories/${first.value.user.id}`, 'DELETE'); assert.equal(repeated.value.deleted, false);
  await f.reopen(); await f.chat('还记得苏州吗？'); assert(!JSON.stringify(f.requests.at(-1)).includes('我住在苏州'));

  const automatic = await f.chat('我喜欢薄荷茶。');
  const manual = await f.request('/api/memories', 'POST', { text: '我喜欢薄荷茶。', sourceId: automatic.value.user.id });
  await f.request(`/api/memories/${manual.value[0].id}`, 'PATCH', { text: '我喜欢红茶。' });
  assert(!f.context.interaction.list({ contextKey: 'aftermath' }).items.some(e => e.eventId === automatic.value.user.id));
  await f.chat('薄荷茶是什么？'); assert(!JSON.stringify(f.requests.at(-1)).includes('我喜欢薄荷茶'));
}));

test('failed/secret-revised sources do not persist, and event + episode commit rolls back as one unit', async () => fixture(async f => {
  f.fail(true); const failed = await f.chat('我喜欢白茶。'); assert.equal(failed.status, 502);
  assert.deepEqual(f.context.store.history(), []); assert.deepEqual(f.context.interaction.list({ contextKey: 'aftermath' }).items, []);
  f.fail(false);
  const derive = f.context.interaction.derive;
  f.context.interaction.derive = () => { throw Error('fixture derivation failure'); };
  assert.equal((await f.chat('我喜欢绿茶。')).status, 400);
  assert.deepEqual(f.context.store.history(), []); assert.deepEqual(f.context.interaction.list({ contextKey: 'aftermath' }).items, []);
  f.context.interaction.derive = derive;
  const source = await f.chat('我喜欢乌龙茶。');
  const deleted = await f.request(`/api/interaction-memories/${source.value.user.id}`, 'PATCH', { text: 'password: fake-private-value' });
  assert.equal(deleted.value.retained, false); assert(deleted.value.deleted);
  assert.deepEqual(f.context.interaction.list({ contextKey: 'aftermath' }).items, []);
  assert.deepEqual(f.context.store.history(), []);
}));

test('integrated plan, fiction, negation and contradictions retain their evidence boundaries', async () => fixture(async f => {
  const plan = await f.chat('我计划明天去海边。');
  const fiction = await f.chat('虚构故事：我去过海边。');
  let recall = await f.chat('海边的计划呢？');
  let item = recall.value.memoryEvidence.items.find(e => e.sourceId === plan.value.user.id);
  assert(item); assert.equal(item.claims[0].type, 'plan'); assert.equal(item.claims[0].epistemic, 'user_reported');
  assert(!recall.value.memoryEvidence.items.some(e => e.sourceId === fiction.value.user.id));
  await f.chat('我取消了去海边的计划。');
  recall = await f.chat('海边计划还在吗？');
  item = recall.value.memoryEvidence.items.find(e => e.sourceId === plan.value.user.id);
  assert(item); assert.equal(item.claims[0].conflictStatus, 'cancelled'); assert.equal(item.claims[0].type, 'plan');
  const likes = await f.chat('我喜欢咖啡。'); await f.chat('我不喜欢咖啡。');
  recall = await f.chat('你记得咖啡吗？');
  item = recall.value.memoryEvidence.items.find(e => e.sourceId === likes.value.user.id);
  assert(item); assert.equal(item.claims[0].conflictStatus, 'unresolved');
  assert(f.requests.at(-1).messages[0].content.includes('unresolved 冲突须自然询问'));
  assert(f.context.interaction.list({ contextKey: 'aftermath' }).items.some(e => e.domain === 'fiction'));
}));

test('retrieval stops deriving capsules after its result limit is filled', async () => fixture(async f => {
  for (let i = 0; i < 20; i++) f.context.interaction.ingestUserTurn({ turnId: randomUUID(), eventId: randomUUID(), text: `我喜欢茶${i}。`, contextKey: 'aftermath', createdAt: '2026-01-01T00:00:00Z' });
  let derivations = 0; const claimsFor = f.context.interaction.claimsFor.bind(f.context.interaction);
  f.context.interaction.claimsFor = (...args) => { ++derivations; return claimsFor(...args); };
  const recall = f.context.interaction.retrieve({ query: '喜欢茶', contextKey: 'aftermath', budget: { tokens: 16000, limit: 1 } });
  assert.equal(recall.items.length, 1); assert.equal(derivations, 1); assert.equal(recall.hasMore, true);
}));

test('history cleanup preserves unrelated confirmation lineage and repeated corrections do not grow aliases', async () => fixture(async f => {
  const a = await f.chat('我住在南京。'); const b = await f.chat('我喜欢绿茶。');
  await f.request('/api/memories', 'POST', { text: '我住在南京。', sourceId: a.value.user.id });
  const bConfirmed = await f.request('/api/memories', 'POST', { text: '我喜欢绿茶。', sourceId: b.value.user.id });
  const bId = bConfirmed.value.find(m => m.sourceId === b.value.user.id).id;
  for (const place of ['苏州', '杭州', '扬州']) { const result = await f.request(`/api/interaction-memories/${a.value.user.id}`, 'PATCH', { text: `我住在${place}。` }); assert.equal(result.status, 200, JSON.stringify(result.value)); }
  assert.equal(f.context.store.list().length, 2);
  assert.equal(f.context.interaction.db.prepare('SELECT COUNT(*) AS n FROM im_source_aliases').get().n, 2);
  assert.equal((await f.request(`/api/memories/${bId}`, 'DELETE')).status, 200);
  assert(!f.context.interaction.list({ contextKey: 'aftermath' }).items.some(e => e.eventId === b.value.user.id));
  assert(f.context.interaction.list({ contextKey: 'aftermath' }).items.some(e => e.eventId === a.value.user.id));
}));
