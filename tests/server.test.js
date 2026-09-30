import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { createApp } from '../server/index.js';

test('HTTP workflow persists, rejects cross-origin writes and never calls remote implicitly', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'exo-server-'));
  let remoteCalls = 0;
  let context = await createApp({ dataDir: directory, fetchImpl: async () => { remoteCalls++; throw new Error('must not call'); } });
  const start = async () => { await new Promise(r => context.app.listen(0, '127.0.0.1', r)); return `http://127.0.0.1:${context.app.address().port}`; };
  let url = await start();
  const post = async (path, data, headers = {}) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) });
  try {
    assert.equal((await post('/api/chat', { text: '你好' }, { Origin: 'https://evil.example' })).status, 403);
    const badHostStatus = await new Promise((resolve, reject) => {
      const request = http.get(url + '/api/status', { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); });
      request.on('error', reject);
    });
    assert.equal(badHostStatus, 403);
    assert.equal((await post('/api/chat', { text: 'x'.repeat(1501) })).status, 400);
    const saved = await (await post('/api/memories', { text: '我们约定一起吃布丁。' })).json();
    const reply = await (await post('/api/chat', { text: '你还记得我们的约定吗？' })).json();
    assert.equal(reply.provider, 'offline'); assert(reply.assistant.text.includes('布丁')); assert.equal(reply.recalled.length, 1);
    assert.equal((await post('/api/chat', { text: '你好', config: { provider: 'deepseek', model: 'deepseek-flash', apiKey: '' }, remoteTest: true })).status, 400);
    assert.equal((await post('/api/chat', { text: '你好', config: { provider: 'deepseek', model: 'deepseek-flash', apiKey: 'fixture' } })).status, 403);
    assert.equal(remoteCalls, 0);
    assert.equal((await fetch(url + '/character-assets/%2e%2e%2f%2e%2e%2fREADME.md')).status, 403);
    await context.close(); context = await createApp({ dataDir: directory }); url = await start();
    const recalled = await (await fetch(url + '/api/memories')).json(); assert.equal(recalled[0].id, saved[0].id);
    const edited = await fetch(url + '/api/memories/' + saved[0].id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '我们约定一起看歌剧。' }) }); assert.equal(edited.status, 200);
    assert.equal((await (await fetch(url + '/api/history')).json()).length, 0);
    const removed = await fetch(url + '/api/memories/' + saved[0].id, { method: 'DELETE' }); assert.equal(removed.status, 200);
    assert.equal((await (await fetch(url + '/api/memories')).json()).length, 0);
    assert.equal((await fetch(url + '/.env')).status, 404);
  } finally { await context.close(); rmSync(directory, { recursive: true, force: true }); }
});
