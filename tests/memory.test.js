import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore } from '../server/memory.js';

test('confirmed experience persists across restart, correction, deletion', () => {
  const directory = mkdtempSync(join(tmpdir(), 'exo-memory-'));
  const file = join(directory, 'memory.sqlite');
  let store = new MemoryStore(file);
  try {
    const user = store.event('user', '我们一起吃了蛋糕。');
    store.event('assistant', '我记得蛋糕。', { turnId: user.turnId });
    store.save('我们一起吃了蛋糕。', user.id);
    store.close(); store = new MemoryStore(file);
    assert.equal(store.recall('蛋糕')[0].text, '我们一起吃了蛋糕。');
    assert.equal(store.recall('你还记得我们去年去蒙德旅行吗？').length, 0);
    const id = store.list()[0].id;
    store.edit(id, '我们一起吃了布丁。');
    assert.equal(store.recall('蛋糕').length, 0);
    assert.equal(store.recall('布丁')[0].revision, 2);
    assert.equal(store.history().length, 0);
    assert.equal(store.list()[0].sourceText, '我们一起吃了布丁。');
    store.delete(id);
    assert.equal(store.list().length, 0);
    assert.equal(store.recall('布丁').length, 0);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('correction does not orphan other memories sharing conversation sources', () => {
  const store = new MemoryStore(':memory:');
  try {
    const event = store.event('user', '蛋糕和歌剧');
    store.save('我们吃了蛋糕。', event.id);
    store.save('我们讨论了歌剧。', event.id);
    const cake = store.list().find(m => m.text.includes('蛋糕'));
    store.edit(cake.id, '我们吃了布丁。');
    assert.equal(store.list().length, 2);
    assert(store.list().some(m => m.text.includes('歌剧') && m.sourceText.includes('歌剧')));
    store.delete(cake.id);
    assert.equal(store.list().length, 1);
    assert(store.list()[0].text.includes('歌剧'));
  } finally { store.close(); }
});

test('generated assistant claims cannot become source evidence', () => {
  const store = new MemoryStore(':memory:');
  try { const event = store.event('assistant', '虚构的过去'); assert.throws(() => store.save('虚构的过去', event.id), /来源/); }
  finally { store.close(); }
});
