import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/index.js';
import { MemoryStore } from '../server/memory.js';
import { offlineReply, messagesFor } from '../server/providers.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

for (const mutation of ['PATCH', 'DELETE']) {
  for (const fails of [false, true]) {
    test(`delayed mock provider ${fails ? 'failure' : 'success'} is discarded after ${mutation}`, async () => {
      const directory = mkdtempSync(join(tmpdir(), 'exo-context-'));
      const entered = deferred(), release = deferred();
      let providerCalls = 0;
      const providerMessages = [];
      const context = await createApp({ dataDir: directory, fetchImpl: async (_url, options) => {
        ++providerCalls;
        providerMessages.push(JSON.parse(options.body).messages);
        if (providerCalls === 2) entered.resolve();
        await release.promise;
        if (fails) throw new Error('mock failure');
        return { ok: true, json: async () => ({ message: { content: '{"text":"旧蛋糕回复","emotion":"calm"}' } }) };
      } });
      await new Promise(r => context.app.listen(0, '127.0.0.1', r));
      const base = `http://127.0.0.1:${context.app.address().port}`;
      const request = (path, method = 'GET', data) => fetch(base + path, {
        method, headers: { 'Content-Type': 'application/json' }, ...(data && { body: JSON.stringify(data) }),
      });
      try {
        const source = context.store.event('user', '我们在枫丹吃了蛋糕，还看了歌剧');
        context.store.event('assistant', '旧蛋糕历史', { turnId: source.turnId });
        context.store.save('我们在枫丹吃了蛋糕', source.id);
        context.store.save('我们看了歌剧', source.id);
        const target = context.store.list().find(m => m.text.includes('蛋糕'));
        // Cancel both recalled-memory and history-only requests, not just a
        // reply that directly recalled the modified memory.
        const pending = ['还记得我们吃蛋糕吗', '你好'].map(text => request('/api/chat', 'POST', {
          text, config: { provider: 'ollama', model: 'mock-only' },
        }));
        await entered.promise;
        assert(providerMessages.every(messages => messages.some(m => m.content.includes('旧蛋糕历史'))));
        assert.equal((await request(`/api/memories/${target.id}`, mutation, mutation === 'PATCH' ? { text: '我们在枫丹吃了布丁' } : undefined)).status, 200);
        assert.deepEqual(context.store.history(), []);
        release.resolve();
        for (const response of await Promise.all(pending)) {
          assert.equal(response.status, 409);
          const result = await response.json();
          assert.equal(result.code, 'CONTEXT_CHANGED');
          assert.equal(result.assistant, undefined);
          assert.equal(result.recalled, undefined);
          assert(!JSON.stringify(result).includes('蛋糕'));
        }
        assert.deepEqual(await (await request('/api/history')).json(), []);
        assert.equal(providerCalls, 2);
        const survivors = context.store.list();
        assert.equal(survivors.length, mutation === 'PATCH' ? 2 : 1);
        assert(survivors.some(m => m.text === '我们看了歌剧' && m.sourceText === m.text));
        assert(survivors.every(m => !m.sourceText.includes('蛋糕')));
        // A fresh turn still works and uses only the current context.
        const fresh = await (await request('/api/chat', 'POST', { text: '还记得我们的共同经历吗' })).json();
        assert.equal(fresh.provider, 'offline');
        assert(!JSON.stringify(fresh).includes('蛋糕'));
      } finally {
        release.resolve();
        await context.close();
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
}

test('only successful corrections/deletions invalidate context; shared sources survive', () => {
  const store = new MemoryStore(':memory:');
  try {
    const source = store.event('user', '蛋糕和歌剧');
    store.save('蛋糕', source.id); store.save('歌剧', source.id);
    const cake = store.list().find(m => m.text === '蛋糕');
    const generation = store.contextGeneration;
    assert.throws(() => store.edit('missing', '新内容'));
    assert.throws(() => store.delete('missing'));
    assert.throws(() => store.edit(cake.id, ''));
    assert.equal(store.contextGeneration, generation);
    store.delete(cake.id);
    assert.equal(store.contextGeneration, generation + 1);
    assert.equal(store.list()[0].text, '歌剧');
    assert.equal(store.list()[0].sourceText, '歌剧');
    assert.deepEqual(store.history(), []);
  } finally { store.close(); }
});

for (const [saved, query, conflict] of [
  ['我们在枫丹吃了蛋糕', '还记得我们在蒙德吃蛋糕吗', '蒙德'],
  ['2026年9月28日我们吃了蛋糕', '还记得2026年9月29日我们吃蛋糕吗', '29日'],
  ['我们周一吃了蛋糕', '还记得我们周二吃蛋糕吗', '周二'],
]) {
  test(`similar recall does not affirm conflicting premise: ${conflict}`, () => {
    const store = new MemoryStore(':memory:');
    try {
      store.save(saved);
      const recalled = store.recall(query);
      assert.equal(recalled.length, 1);
      assert.equal(recalled[0].match, 'related');
      const reply = offlineReply(query, recalled);
      assert(reply.includes(saved));
      assert(reply.includes('可能相关'));
      assert(reply.includes('不能确认'));
      assert(!reply.includes('当然'));
      assert(!reply.includes(conflict));
      const prompt = messagesFor(query, recalled)[0].content;
      assert(prompt.includes('地点、日期'));
      assert(prompt.includes('无法确认'));
    } finally { store.close(); }
  });
}
