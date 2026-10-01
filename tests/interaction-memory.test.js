import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { InteractionMemoryStore } from '../server/interaction-memory.js';
import { MemoryStore } from '../server/memory.js';

const BASE = '2026-01-01T12:00:00.000Z';
const NOW = '2026-09-30T12:00:00.000Z';
function fixture(t, options) {
  const dir = mkdtempSync(join(tmpdir(), 'exo-interaction-fixture-'));
  const file = join(dir, 'fixture.sqlite');
  let store = new InteractionMemoryStore(file, options);
  t.after(() => {
    store.close();
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert.ok(dir.startsWith(join(tmpdir(), 'exo-interaction-fixture-')));
    rmSync(dir, { recursive: true, force: true });
  });
  let counter = 0;
  return {
    file, get store() { return store; },
    reopen() { store.close(); store = new InteractionMemoryStore(file, options); },
    add(text, extra = {}) {
      counter++;
      return store.ingestUserTurn({ turnId: `turn-${counter}`, eventId: `event-${counter}`, text, contextKey: 'aftermath:natural', createdAt: BASE, ...extra });
    },
    recall(query, extra = {}) { return store.retrieve({ query, contextKey: 'aftermath', now: NOW, budget: 16000, ...extra }); },
  };
}
const onlyClaim = result => result.items.find(i => i.type === 'episode')?.claims[0];

test('repeated clauses deduplicate and distinct claims are capped per episode', t => {
  const f = fixture(t);
  const repeated = f.add('我喜欢红茶。'.repeat(200));
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM im_claims WHERE episode_id=?').get(repeated.episodeId).n, 1);
  const many = f.add(Array.from({ length: 80 }, (_, i) => `我喜欢红茶${i}。`).join(''));
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM im_claims WHERE episode_id=?').get(many.episodeId).n, 12);
  assert.equal(f.store.list({ contextKey: 'aftermath' }).items.find(e => e.id === many.episodeId).text.split('。').length, 81);
});

test('oversized capsules consume derivation budget and conflict lookups return bounded indexed peers', t => {
  const f = fixture(t);
  for (let i = 0; i < 300; i++) f.add(Array.from({ length: 12 }, (_, j) => `我喜欢红茶${i}_${j}。`).join(''));
  const originalPrepare = f.store.db.prepare.bind(f.store.db);
  let queries = 0, rows = 0, maxRows = 0;
  f.store.db.prepare = sql => {
    const statement = originalPrepare(sql);
    if (!sql.includes('WITH peers AS MATERIALIZED')) return statement;
    return { all(...args) { ++queries; const result = statement.all(...args); rows += result.length; maxRows = Math.max(maxRows, result.length); return result; } };
  };
  const result = f.recall('喜欢红茶', { budget: { tokens: 2400, candidates: 300 } });
  assert.equal(result.items.length, 0); assert.equal(result.derivations, 24); assert.equal(result.hasMore, true);
  assert.equal(queries, 24 * 12); assert(maxRows <= 129); assert(rows <= 24 * 12 * 129);
  const incomplete = f.recall('喜欢红茶', { budget: { tokens: 16000, limit: 1 } });
  assert(incomplete.items[0].claims.every(c => c.conflictStatus === 'unknown' && c.conflictAssessment === 'bounded-incomplete'));
  assert.equal(incomplete.derivations, 1);
});

test('successful conversation automatically persists across restart, with provenance and idempotent source', t => {
  const f = fixture(t);
  const result = f.add('我去过玻璃花园。');
  assert.equal(result.retained, true);
  const duplicate = f.store.ingestUserTurn({ turnId: 'turn-1', eventId: 'event-1', text: '我去过玻璃花园。', contextKey: 'aftermath:natural', createdAt: BASE });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.generation, result.generation);
  assert.throws(() => f.store.ingestUserTurn({ turnId: 'turn-1', eventId: 'event-1', text: '别的原话', contextKey: 'aftermath' }), /use revise/);
  f.reopen();
  const item = f.recall('你还记得玻璃花园吗？').items[0];
  assert.equal(item.sourceId, 'event-1'); assert.equal(item.turnId, 'turn-1');
  assert.equal(item.createdAt, BASE); assert.equal(item.sourceRole, 'user');
  assert.equal(item.text, '我去过玻璃花园。');
  assert.equal(item.claims[0].type, 'user_reported');
  assert.equal(item.claims[0].subject, 'user');
  assert.equal(item.claims[0].epistemic, 'user_reported');
  assert.equal(item.claims[0].extractConfidence, 'explicit-grammar');
});

test('cancelled, failed, assistant, test and secret sources never write any derived data', t => {
  const f = fixture(t);
  for (const extra of [{ status: 'cancelled' }, { status: 'failed' }, { status: 'pending' }, { role: 'assistant' }, { kind: 'test' }]) assert.equal(f.add('我完成了任务', extra).retained, false);
  const sensitive = [
    `sk-${'fixture'.repeat(4)}`, '密码 hunter-fixture', 'API key: fixture-only',
    'access_token=fixture-only', 'Bearer fixture-only-token', '不要保存我住在秘密村',
    '这是秘密：我喜欢隐私茶', 'password fixture-only', '密钥是 fixture-only',
    '测试数据：我去过玻璃花园', 'ｐａｓｓｗｏｒｄ：fixture-only',
    String.raw`\u5bc6\u7801=fixture-only`,
    'test: 我去过玻璃花园', '这是一个测试：我喜欢茶', 'token=fixture-only',
  ];
  for (const text of sensitive) assert.equal(f.add(text).retained, false);
  for (const table of ['im_episodes', 'im_claims', 'im_terms']) assert.equal(f.store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0);
  f.reopen(); assert.equal(f.recall('刚才聊哪').items.length, 0);
});

test('unrecognized and uncertain utterances are attributed searchable episodes without invented claims', t => {
  const f = fixture(t);
  for (const text of ['也许我去过星河展馆', '听说我去过星河展馆', '我去过星河展馆吗', '我叫你去星河展馆', '我今天在星河展馆门口看见一只蓝色的鸟', '我去过星河展馆，才怪']) f.add(text);
  const result = f.recall('星河展馆', { budget: { tokens: 16000, limit: 20 } });
  assert.equal(result.items.length, 6);
  assert.ok(result.items.every(i => i.claims.length === 0 && i.sourceRole === 'user'));
  assert.ok(result.items.some(i => i.domain === 'uncertain'));
});

test('fiction and hypothetical retain provenance but stay out of default reality retrieval', t => {
  const f = fixture(t);
  f.add('在小说里，我去过风车山。');
  f.add('假如我去过风车山，你会怎么说？');
  f.add('fiction: 我去过风车山');
  f.add('hypothetical: 我去过风车山');
  assert.equal(f.recall('风车山').items.length, 0);
  const result = f.recall('风车山', { includeFiction: true });
  assert.equal(result.items.length, 4);
  assert.ok(result.items.every(i => i.claims.length === 0));
});

test('past dates never upgrade plans, relationship plans remain user reported, and completion is explicit', t => {
  const f = fixture(t);
  f.add('我计划明天去海边');
  f.add('我们约好下周去剧院');
  f.add('我昨天完成了灯塔模型');
  assert.equal(onlyClaim(f.recall('海边')).type, 'plan');
  const relationship = onlyClaim(f.recall('剧院'));
  assert.equal(relationship.type, 'plan'); assert.equal(relationship.subject, 'user_reported_relationship');
  assert.equal(onlyClaim(f.recall('灯塔模型')).type, 'completed');
  assert.ok(!JSON.stringify(f.recall('剧院')).includes('character_experience'));
});

test('explicit cancellation and negation preserve evidence; changed plan is not a completed event', t => {
  const f = fixture(t);
  f.add('我计划明天去海边');
  f.add('我不再计划去海边，我计划下周去剧院', { createdAt: '2026-01-02T12:00:00Z' });
  const oldPlan = f.recall('海边').items.find(i => i.sourceId === 'event-1').claims[0];
  assert.equal(oldPlan.type, 'plan'); assert.equal(oldPlan.conflictStatus, 'cancelled');
  assert.ok(oldPlan.conflictSourceIds.length > 0);
  assert.equal(onlyClaim(f.recall('剧院')).type, 'negation'); // capsule also carries the cancelled prior intention
  assert.ok(f.recall('剧院').items[0].claims.some(c => c.type === 'plan' && c.value.includes('剧院')));
  f.add('我没有去过雪山');
  assert.equal(onlyClaim(f.recall('雪山')).polarity, -1);
});

test('contradictions are unresolved without overwriting, and positive multi-value preferences coexist', t => {
  const f = fixture(t);
  f.add('我住在青石镇'); f.add('我住在白桦镇');
  assert.equal(onlyClaim(f.recall('青石镇')).conflictStatus, 'unresolved');
  f.add('我喜欢红茶'); f.add('我喜欢咖啡');
  assert.equal(onlyClaim(f.recall('红茶')).conflictStatus, 'none');
  f.add('我不喜欢红茶');
  assert.equal(onlyClaim(f.recall('红茶')).conflictStatus, 'unresolved');
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM im_episodes').get().n, 5);
});

test('revise/delete atomically invalidate source, claims, index and live capsules across restart', t => {
  const f = fixture(t);
  f.add('我住在青石镇'); f.add('我住在白桦镇');
  const generation = f.store.generation;
  f.store.revise('event-1', '我喜欢风铃', { updatedAt: '2026-02-01T12:00:00Z' });
  assert.ok(f.store.generation > generation);
  assert.equal(f.recall('青石镇').items.length, 0);
  assert.equal(onlyClaim(f.recall('白桦镇')).conflictStatus, 'none');
  const revised = f.recall('风铃').items[0];
  assert.equal(revised.revision, 2); assert.equal(revised.createdAt, BASE);
  assert.equal(revised.updatedAt, '2026-02-01T12:00:00.000Z');
  assert.equal(f.store.delete('event-1').deleted, true);
  assert.equal(f.store.delete('event-1').deleted, false);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM im_claims WHERE episode_id=?').get(revised.id).n, 0);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM im_terms WHERE episode_id=?').get(revised.id).n, 0);
  f.reopen(); assert.equal(f.recall('风铃').items.length, 0);
  assert.deepEqual(f.store.db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.throws(() => f.store.revise('event-404', '我喜欢风铃'), /Unknown source/);
});

test('secret-bearing correction deletes original source instead of storing any replacement', t => {
  const f = fixture(t); f.add('我住在青石镇');
  assert.equal(f.store.revise('event-1', '密码是 fixture-only').retained, false);
  assert.equal(f.recall('青石镇').items.length, 0);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM im_terms').get().n, 0);
});

test('context aliases share style but isolate timeline and temporal query excludes future evidence', t => {
  const f = fixture(t);
  f.add('我喜欢玫瑰舞台', { contextKey: 'performer:quiet' });
  f.add('我喜欢白鸽舞台', { contextKey: 'aftermath:quiet' });
  f.add('我住在未来村', { createdAt: '2026-10-01T12:00:00Z' });
  assert.ok(f.recall('玫瑰舞台').items.every(i => i.sourceId !== 'event-1'));
  assert.equal(f.recall('玫瑰舞台', { contextKey: 'performer:theatrical' }).items.length, 1);
  assert.equal(f.recall('白鸽舞台').items.length, 1);
  assert.equal(f.recall('未来村').items.length, 0);
  assert.equal(f.recall('未来村', { now: '2026-10-02T12:00:00Z' }).items.length, 1);
});

test('thousands of episodes beyond history are indexed and natural lexical questions find early evidence', t => {
  const f = fixture(t);
  f.add('上个月，我在银杏天文台看到了一颗很亮的流星。');
  for (let i = 0; i < 2000; i++) f.add(`今天讨论了日常便签编号 ${i} 和午饭。`, { createdAt: '2026-03-01T12:00:00Z' });
  const result = f.recall('你还记得银杏天文台的流星吗？');
  assert.ok(result.items.some(i => i.sourceId === 'event-1' && i.text.includes('流星')));
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM im_episodes').get().n, 2001);
  assert.ok(f.recall('刚才聊哪').items.every(i => i.createdAt === '2026-03-01T12:00:00.000Z'));
  f.reopen(); assert.ok(f.recall('银杏天文台').items.some(i => i.sourceId === 'event-1'));
});

test('finite memory budget, result/candidate bounds and input validation', t => {
  const f = fixture(t);
  for (let i = 0; i < 30; i++) f.add(`风铃的不同描述 ${i} ${'很长原话'.repeat(400)}`);
  const result = f.recall('风铃', { budget: { tokens: 1800, limit: 2, candidates: 4, excerptChars: 80 } });
  assert.ok(result.items.length > 0 && result.items.length <= 2);
  assert.ok(result.items.every(i => i.truncated));
  assert.ok(result.tokenUpperBound <= 1800);
  assert.equal(result.tokenUpperBound, Buffer.byteLength(JSON.stringify(result.items), 'utf8'));
  assert.equal(result.hasMore, true);
  assert.equal(f.recall('风铃', { budget: 0 }).items.length, 0);
  assert.throws(() => f.recall('a'.repeat(513)), /Invalid query/);
  assert.throws(() => f.add('a'.repeat(6001)), /Invalid text/);
  assert.throws(() => f.recall('风铃', { budget: { tokens: -1 } }), /Invalid memory bound/);
  assert.throws(() => f.recall('风铃', { budget: { candidates: 1001 } }), /Invalid memory bound/);
});

test('capacity refusal preserves prior sources and still allows correction/deletion', t => {
  const f = fixture(t, { maxEpisodes: 2 });
  f.add('我喜欢风铃'); f.add('我喜欢红茶');
  assert.deepEqual(f.add('我喜欢咖啡'), { retained: false, reason: 'capacity' });
  f.store.revise('event-1', '我喜欢音乐', { updatedAt: '2026-02-01T12:00:00Z' });
  assert.ok(f.recall('音乐').items.length);
  f.store.delete('event-2'); assert.equal(f.add('我喜欢咖啡').retained, true);
});

test('append-only migration leaves existing SQLite tables, usage and schema version unchanged', t => {
  const f = fixture(t);
  f.store.db.exec("CREATE TABLE old_fixture(id TEXT PRIMARY KEY,text TEXT); INSERT INTO old_fixture VALUES ('x','fixture-only'); PRAGMA user_version=23;");
  f.add('我喜欢风铃'); f.reopen();
  assert.equal(f.store.db.prepare('SELECT text FROM old_fixture').get().text, 'fixture-only');
  assert.equal(f.store.db.prepare('PRAGMA user_version').get().user_version, 23);
  f.store.db.prepare("UPDATE im_meta SET value=99 WHERE key='schema_version'").run();
  assert.throws(() => new InteractionMemoryStore(f.file), /Unsupported interaction memory schema/);
});

test('existing explicitly confirmed memory remains high priority, globally shared, unmodified and live on edit/delete', t => {
  const f = fixture(t);
  const confirmed = new MemoryStore(f.file);
  const source = confirmed.event('user', '用户明确确认的风铃回忆', { contextKey: 'performer' });
  confirmed.save('确认的风铃回忆', source.id);
  const store = new InteractionMemoryStore(f.file, { confirmedMemoryStore: confirmed });
  store.ingestUserTurn({ turnId: 'auto-1', eventId: 'auto-1', text: '我喜欢风铃', contextKey: 'aftermath', createdAt: BASE });
  const retrieve = () => store.retrieve({ query: '风铃', contextKey: 'aftermath', now: '2100-01-01T12:00:00Z', budget: 16000 });
  assert.equal(retrieve().items[0].type, 'confirmed');
  assert.equal(confirmed.list().length, 1);
  const id = confirmed.list()[0].id;
  confirmed.edit(id, '确认的雨伞回忆');
  assert.ok(retrieve().items.every(i => i.type !== 'confirmed'));
  confirmed.delete(id); assert.equal(confirmed.list().length, 0);
  assert.equal(retrieve().items[0].type, 'episode');
  store.close(); confirmed.close();
});

test('explicit cancellation in a single episode does not become a completion', t => {
  const f = fixture(t);
  f.add('我计划明天去海边，我取消了去海边的计划');
  assert.equal(f.recall('海边').items[0].claims[0].conflictStatus, 'cancelled');
  assert.ok(f.recall('海边').items[0].claims.every(c => c.type !== 'completed'));
});

test('future corrections and contradictions do not enter a past-time retrieval', t => {
  const f = fixture(t);
  f.add('我住在青石镇');
  f.add('我住在白桦镇', { createdAt: '2026-08-01T12:00:00Z' });
  assert.equal(onlyClaim(f.recall('青石镇', { now: '2026-02-01T12:00:00Z' })).conflictStatus, 'none');
  f.store.revise('event-1', '我住在紫藤镇', { updatedAt: '2026-08-02T12:00:00Z' });
  assert.equal(f.recall('紫藤镇', { now: '2026-02-01T12:00:00Z' }).items.length, 0);
  assert.ok(f.recall('紫藤镇').items.length);
});

test('migration from actual existing MemoryStore preserves confirmed sources and usage rows', t => {
  const f = fixture(t);
  const oldFile = join(dirname(f.file), 'old-memory-fixture.sqlite');
  const old = new MemoryStore(oldFile);
  const source = old.event('user', '明确确认风铃', { contextKey: 'aftermath' });
  old.save('确认风铃', source.id);
  old.db.prepare('INSERT INTO remote_usage (id,model,reserved_cny,input_bound,output_limit,status,created_at) VALUES (?,?,?,?,?,?,?)').run('fixture-usage', 'offline-fixture', 0, 10, 10, 'completed', BASE);
  old.db.exec('PRAGMA user_version=12');
  const before = old.list();
  const interaction = new InteractionMemoryStore(oldFile, { confirmedMemoryStore: old });
  try {
    assert.deepEqual(old.list(), before);
    assert.equal(old.db.prepare('SELECT status FROM remote_usage WHERE id=?').get('fixture-usage').status, 'completed');
    assert.equal(old.db.prepare('PRAGMA user_version').get().user_version, 12);
    assert.equal(interaction.retrieve({ query: '风铃', contextKey: 'aftermath', now: '2100-01-01T12:00:00Z' }).items[0].type, 'confirmed');
    assert.deepEqual(interaction.db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { interaction.close(); old.close(); }
});
