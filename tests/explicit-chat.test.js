import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createApp } from '../server/index.js';
import { WindowsCredentials } from '../server/credentials.js';
import { PRICING } from '../server/budget.js';
import { messagesFor } from '../server/providers.js';

test('explicit real chat authorization, credential boundary, errors, budget, sources and disconnects with isolated mocks', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'exo-explicit-chat-'));
  let reads = 0, calls = 0, behavior = 'ok', started, unblock;
  const credentials = new WindowsCredentials({ bridge: async action => {
    if (action === 'status') return { ok: true, saved: true };
    assert.equal(action, 'read'); reads++; return { ok: true, key: 'fixture-explicit-only' };
  } });
  const context = await createApp({ dataDir: directory, credentials, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions'); calls++;
    const body = JSON.parse(options.body); assert.equal(body.max_tokens, 128);
    if (behavior === 'fail') throw Error('fixture-explicit-only must never surface');
    if (behavior === 'wait') { started?.(); await new Promise((r, reject) => { unblock = r; options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }); }); }
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ text: 'fixture real answer', emotion: 'calm' }) } }], usage: { prompt_tokens: 50, completion_tokens: 20 } }) };
  } });
  context.budget.now = () => Date.parse(PRICING.verifiedAt) + 1000;
  await new Promise(r => context.app.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${context.app.address().port}`;
  const config = { provider: 'deepseek', model: 'deepseek-flash', credentialSource: 'saved' };
  const input = { text: 'explicit fixture memory source', config, remoteChat: true, confirmed: true };
  const post = (value, signal) => fetch(url + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Exo-Credentials': '1' }, body: JSON.stringify(value), signal });
  try {
    assert.equal((await post({ ...input, confirmed: false })).status, 403);
    assert.equal((await post({ ...input, remoteChat: false })).status, 403);
    assert.equal((await post({ ...input, config: { ...config, baseUrl: 'http://127.0.0.1:9999' } })).status, 403);
    assert.equal((await post({ ...input, config: { ...config, provider: 'openai' } })).status, 403);
    assert.equal(reads, 0); assert.equal(calls, 0);
    const reply = await (await post(input)).json();
    assert.equal(reply.provider, 'deepseek'); assert.equal(reply.assistant.text, 'fixture real answer');
    const memory = context.store.save(reply.user.text, reply.user.id)[0]; assert.equal(memory.sourceText, input.text);
    assert.equal(context.budget.status().usedCalls, 1);
    behavior = 'fail'; const failed = await post(input); assert.equal(failed.status, 502);
    const diagnostic = await failed.json(); assert(!JSON.stringify(diagnostic).includes('fixture-explicit-only')); assert.equal(diagnostic.budget.usedCalls, 2);
    assert.equal(context.store.history().length, 2); assert.equal(calls, 2);
    behavior = 'wait'; const controller = new AbortController();
    const began = new Promise(r => { started = r; }); const pending = post(input, controller.signal).catch(() => null); await began;
    const oldReads = reads; assert.equal((await post(input)).status, 409); assert.equal(reads, oldReads); assert.equal(calls, 3);
    controller.abort(); await pending;
    for (let i = 0; i < 40 && context.budget.status().records.at(-1).status === 'reserved'; i++) await new Promise(r => setTimeout(r, 10));
    assert.equal(context.budget.status().records.at(-1).status, 'failed'); assert.equal(context.store.history().length, 2);
    assert(context.budget.status().reservedCny > diagnostic.budget.reservedCny);
    behavior = 'ok';
    const callsBefore = calls; context.budget.limits = { ...context.budget.limits, cny: context.budget.status().reservedCny };
    assert.equal((await post(input)).status, 400); assert.equal(calls, callsBefore);
    assert(messagesFor('x', [])[0].content.includes('反复失约'));
  } finally {
    unblock?.(); await context.close();
    assert(resolve(directory).startsWith(resolve(tmpdir()) + sep)); rmSync(directory, { recursive: true, force: true });
  }
});
