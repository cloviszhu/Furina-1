import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/index.js';
import { WindowsCredentials } from '../server/credentials.js';

const fact = '我第一次舞台演出扮演邮差，散场时朋友送我一束向日葵。';
const query = '还记得我第一次舞台演出扮演谁、收到什么花吗？';
const changed = '我第一次舞台演出扮演园丁，散场时朋友送我一束白玫瑰。';
async function isolated() {
  const dir = mkdtempSync(join(tmpdir(), 'exo-persistence-chain-')), requests = [];
  let app, base;
  const start = async () => {
    app = await createApp({ dataDir: dir,
      credentials: new WindowsCredentials({ bridge: async () => { throw Error('credentials must not be touched'); } }),
      fetchImpl: async (_url, options) => {
        requests.push(JSON.parse(options.body));
        // Never embed correct facts in generated output or injected context.
        return Response.json({ message: { content: '{"text":"仅协议替身，不评价记忆回答。","emotion":"calm"}' } });
      } });
    await new Promise(r => app.app.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${app.app.address().port}`;
  };
  await start();
  const request = async (path, method = 'GET', body) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, ...(body && { body: JSON.stringify(body) }) });
    const value = await r.json(); return { status: r.status, value };
  };
  return { requests, request, get app() { return app; },
    chat: async (text, character = { timeline: 'aftermath', style: 'natural' }, mock = true) => {
      const r = await request('/api/chat', 'POST', { text, character, config: mock ? { provider: 'ollama', model: 'fixture' } : { provider: 'offline' } });
      assert.equal(r.status, 200); return r.value;
    },
    async reopen() { await app.close(); await start(); },
    async close() { await app.close(); rmSync(dir, { recursive: true, force: true }); },
  };
}
function evidence(body) {
  return JSON.parse(body.messages[0].content.split('对话依据：')[1]);
}
function historyHas(body, word) { return body.messages.slice(1, -1).some(m => m.content.includes(word)); }

test('confirmed SQLite memory alone reaches provider after server/DB reopen, correction and deletion remove stale facts', async () => {
  const t = await isolated();
  try {
    const first = await t.chat(fact);
    assert.deepEqual(evidence(t.requests[0]), []);
    assert.deepEqual((await t.request('/api/memories')).value, []); // no automatic save
    const saved = await t.request('/api/memories', 'POST', { text: fact, sourceId: first.user.id });
    assert.equal(saved.status, 201); const memory = saved.value[0];
    assert.equal(memory.sourceId, first.user.id); assert.equal(memory.sourceRole, 'user'); assert.equal(memory.sourceText, fact);
    // Evict the original source from ALL requested history, not just the provider fixture output.
    for (let i = 0; i < 9; i++) await t.chat(`无关占位消息${i}`, undefined, false);
    await t.reopen();
    assert(!t.app.store.history().some(e => e.text.includes('邮差')));
    const actualSQLite = t.app.store.db.prepare('SELECT text, source_id FROM memories WHERE id=?').get(memory.id);
    assert.equal(actualSQLite.text, fact); assert.equal(actualSQLite.source_id, first.user.id);
    let recallCalls = 0; const recall = t.app.store.recall.bind(t.app.store);
    t.app.store.recall = (...args) => { recallCalls++; return recall(...args); };
    const reply = await t.chat(query, { timeline: 'aftermath', style: 'quiet' });
    assert.equal(recallCalls, 1); assert.deepEqual(reply.recalled, [{ id: memory.id, text: fact }]);
    const body = t.requests.at(-1);
    assert.equal(body.messages.at(-1).content, query); assert(!query.includes('邮差')); assert(!query.includes('向日葵'));
    assert(!historyHas(body, '邮差')); assert(!historyHas(body, '向日葵'));
    assert.deepEqual(evidence(body), [{ text: actualSQLite.text, source: 'user-statement' }]);
    assert(!reply.assistant.text.includes('邮差')); // mock never supplies the answer

    const edited = await t.request('/api/memories/' + memory.id, 'PATCH', { text: changed });
    assert.equal(edited.status, 200); const revised = edited.value[0];
    assert.equal(revised.revision, 2); assert.notEqual(revised.sourceId, first.user.id); assert.equal(revised.sourceText, changed);
    assert.equal(t.app.store.sourceExists(first.user.id, 'aftermath'), false);
    assert.deepEqual(t.app.store.history(), []);
    await t.reopen(); await t.chat(query);
    assert.deepEqual(evidence(t.requests.at(-1)), [{ text: changed, source: 'user-statement' }]);
    assert(!JSON.stringify(t.requests.at(-1)).includes('邮差')); assert(!JSON.stringify(t.requests.at(-1)).includes('向日葵'));

    assert.equal((await t.request('/api/memories/' + memory.id, 'DELETE')).status, 200);
    await t.reopen(); const empty = await t.chat(query);
    assert.deepEqual(empty.recalled, []); assert.deepEqual(evidence(t.requests.at(-1)), []);
    for (const word of ['邮差', '向日葵', '园丁', '白玫瑰']) assert(!JSON.stringify(t.requests.at(-1)).includes(word));
    assert.deepEqual((await t.request('/api/memories')).value, []); assert.equal(t.app.budget.status().usedCalls, 0);
  } finally { await t.close(); }
});

test('same-source retry is idempotent, invalid/assistant/deleted source cannot create memories', async () => {
  const t = await isolated();
  try {
    const first = await t.chat(fact);
    for (const sourceId of ['missing', first.assistant.id]) {
      assert.equal((await t.request('/api/memories', 'POST', { text: fact, sourceId })).status, 400);
      assert.deepEqual((await t.request('/api/memories')).value, []);
    }
    const saves = await Promise.all(Array.from({ length: 3 }, () => t.request('/api/memories', 'POST', { text: fact, sourceId: first.user.id })));
    assert(saves.every(r => r.status === 201)); assert.equal((await t.request('/api/memories')).value.length, 1);
    assert(saves.every(r => r.value[0].id === saves[0].value[0].id));
    const memory = saves[0].value[0];
    await t.request('/api/memories/' + memory.id, 'DELETE');
    assert.equal((await t.request('/api/memories', 'POST', { text: fact, sourceId: first.user.id })).status, 400);
    assert.deepEqual((await t.request('/api/memories')).value, []);
  } finally { await t.close(); }
});

test('timeline separates conversation history and validates source IDs while styles share a timeline', async () => {
  const t = await isolated();
  try {
    const first = await t.chat(fact, { timeline: 'aftermath', style: 'natural' });
    await t.reopen();
    await t.chat('你现在如何看待表演？', { timeline: 'performer', style: 'quiet' });
    assert.equal(t.requests.at(-1).messages.length, 2); assert(!JSON.stringify(t.requests.at(-1)).includes('邮差'));
    assert.equal((await t.request(`/api/sources/${first.user.id}?timeline=performer`)).value.valid, false);
    assert.equal((await t.request(`/api/sources/${first.user.id}?timeline=aftermath&style=quiet`)).value.valid, true);
    await t.chat('接着说', { timeline: 'aftermath', style: 'theatrical' });
    assert(historyHas(t.requests.at(-1), '邮差'));
    // Confirmed memories are intentionally global today; only conversation
    // history/source selection is timeline-scoped. Do not claim recall isolation.
    await t.request('/api/memories', 'POST', { text: fact, sourceId: first.user.id });
    await t.chat(query, { timeline: 'performer', style: 'quiet' });
    assert(!historyHas(t.requests.at(-1), '邮差'));
    assert.deepEqual(evidence(t.requests.at(-1)), [{ text: fact, source: 'user-statement' }]);
    assert.equal(t.app.budget.status().usedCalls, 0);
  } finally { await t.close(); }
});
