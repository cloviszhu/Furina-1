import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MemoryStore } from '../server/memory.js';
import { createApp } from '../server/index.js';
import { TestReports, safeReport } from '../server/test-reports.js';

test('legacy style partitions read chronologically within timeline without changing rows or memories', () => {
  const store = new MemoryStore(':memory:');
  try {
    const a = store.event('user', '周六海边柠檬蛋糕', { contextKey: 'aftermath:natural' });
    store.event('assistant', '约好了，还没有赴约。', { contextKey: 'aftermath:quiet' });
    store.event('user', '再聊一下蛋糕', { contextKey: 'aftermath' });
    const other = store.event('user', '克莉奥', { contextKey: 'performer:theatrical' });
    store.save('周六海边柠檬蛋糕', a.id);
    const before = store.db.prepare('SELECT * FROM events').all(); const memories = store.list();
    for (const key of ['aftermath', 'aftermath:natural', 'aftermath:quiet', 'aftermath:theatrical']) {
      assert.deepEqual(store.history(16, key).map(x => x.text), ['周六海边柠檬蛋糕', '约好了，还没有赴约。', '再聊一下蛋糕']);
      assert(store.sourceExists(a.id, key)); assert(!store.sourceExists(other.id, key));
    }
    assert.deepEqual(store.history(16, 'performer').map(x => x.text), ['克莉奥']);
    assert.deepEqual(store.db.prepare('SELECT * FROM events').all(), before); assert.deepEqual(store.list(), memories);
  } finally { store.close(); }
});

test('isolated HTTP style switch passes prior facts to provider and timeline switch does not', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'exo-style-')); const bodies = [];
  const context = await createApp({ dataDir: directory, fetchImpl: async (_url, options) => {
    bodies.push(JSON.parse(options.body).messages);
    return Response.json({ message: { content: '{"text":"fixture reply","emotion":"calm"}' } });
  } });
  await new Promise(r => context.app.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${context.app.address().port}`;
  const chat = (text, timeline, style) => fetch(url + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, character: { timeline, style }, config: { provider: 'ollama', model: 'fixture' } }) }).then(r => r.json());
  try {
    await chat('我们约好周六海边柠檬蛋糕，尚未赴约。', 'aftermath', 'natural');
    await chat('说短一点，约在哪里？', 'aftermath', 'quiet');
    assert(bodies[1].some(e => e.role === 'user' && e.content.includes('周六海边柠檬蛋糕')));
    assert(bodies[1].some(e => e.role === 'assistant' && e.content === 'fixture reply'));
    await chat('你好', 'performer', 'quiet'); assert.equal(bodies[2].length, 2);
    const history = await (await fetch(url + '/api/history?timeline=aftermath&style=theatrical')).json();
    assert.equal(history.length, 4); assert.equal(context.store.history().length, 6);
  } finally { await context.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('old report remains six rows; v2 reconstructs only allowlisted prompt/fixture/history fields', () => {
  const directory = mkdtempSync(join(tmpdir(), 'exo-report-compat-'));
  try {
    const reports = new TestReports(directory), id = randomUUID();
    const old = { version: 1, id, state: 'completed', model: 'deepseek-flash', rows: [{ scenario: 'introduction', status: 'completed', text: 'old reply' }] };
    writeFileSync(join(directory, `${id}.json`), JSON.stringify(old));
    assert.equal(reports.read(id).version, 1); assert.equal(reports.list()[0].total, 6);
    assert.equal(JSON.parse(readFileSync(join(directory, `${id}.json`), 'utf8')).rows[0].text, 'old reply');
    const poisoned = { ...old, version: 2, config: 'forbidden', rows: [{ ...old.rows[0], turn: 1,
      prompt: [{ role: 'user', content: 'fixture', headers: 'forbidden' }], history: [{ role: 'assistant', text: 'reply', config: 'forbidden' }],
      recalledFixture: [{ text: 'plan', source: 'mutual-agreement', headers: 'forbidden' }], error: 'forbidden' }] };
    assert(!JSON.stringify(safeReport(poisoned)).includes('forbidden'));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
