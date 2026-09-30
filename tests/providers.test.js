import test from 'node:test';
import assert from 'node:assert/strict';
import { complete, messagesFor, offlineReply, PROVIDERS } from '../server/providers.js';
import { MemoryStore } from '../server/memory.js';
import { RemoteBudget, PRICING } from '../server/budget.js';

const messages = messagesFor('你好', []);
test('decoded structured/fenced reply refuses unicode-escaped fake credentials and returns only allowlisted usage', async () => {
  const fakeKey = 'fake-qa-key-only';
  const escaped = [...fakeKey].map(c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
  for (const protocol of ['openai', 'claude', 'ollama']) for (const fenced of [false, true]) {
    const json = `{"text":"${escaped}","emotion":"neutral"}`;
    const content = fenced ? `\`\`\`json\n${json}\n\`\`\`` : json;
    const result = protocol === 'claude' ? { content: [{ type: 'text', text: content }] } : protocol === 'ollama' ? { message: { content } } : { choices: [{ message: { content } }] };
    await assert.rejects(complete({ provider: protocol, model: 'fixture', apiKey: fakeKey }, messages, { fetchImpl: async () => Response.json(result) }), /安全检查/);
  }
  const result = await complete({ provider: 'openai', model: 'fixture', apiKey: fakeKey }, messages, {
    fetchImpl: async () => Response.json({ choices: [{ message: { content: '{"text":"safe","emotion":"neutral"}' } }], credential: fakeKey, usage: { prompt_tokens: 3, completion_tokens: 2, secret: fakeKey } }),
  });
  assert.deepEqual(Object.keys(result).sort(), ['emotion', 'expressionSource', 'text', 'usage']);
  assert.deepEqual(result.usage, { prompt_tokens: 3, completion_tokens: 2 }); assert(!JSON.stringify(result).includes(fakeKey));
});
test('OpenAI-compatible provider request/response contract, local stub only', async () => {
  for (const provider of ['openai', 'glm', 'deepseek', 'kimi', 'compatible']) {
    let call;
    const result = await complete({ provider, model: 'test-model', apiKey: 'test-fixture-not-a-secret', baseUrl: 'http://127.0.0.1:1111/v1' }, messages, {
      fetchImpl: async (url, options) => { call = { url, options, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ choices: [{ message: { content: '{"text":"测试回复","emotion":"happy"}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) }; },
    });
    assert.equal(result.text, '测试回复'); assert.equal(call.url, 'http://127.0.0.1:1111/v1/chat/completions');
    assert.equal(call.body.max_tokens, 128); assert.equal(call.body.model, 'test-model'); assert.equal(call.options.redirect, 'error');
    if (provider === 'deepseek') { assert.equal(call.body.thinking.type, 'disabled'); assert.deepEqual(call.body.response_format, { type: 'json_object' }); }
    else assert.equal(call.body.response_format, undefined);
  }
});
test('Anthropic dedicated protocol separates system and user; no real network', async () => {
  let call;
  const result = await complete({ provider: 'claude', model: 'test-claude', apiKey: 'fixture', baseUrl: 'http://127.0.0.1:1111/v1' }, messages, {
    fetchImpl: async (url, options) => { call = { url, options, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ content: [{ type: 'text', text: '第一段' }, { type: 'tool_use' }, { type: 'text', text: '第二段' }] }) }; },
  });
  assert.equal(call.url, 'http://127.0.0.1:1111/v1/messages'); assert.equal(call.options.headers['anthropic-version'], '2023-06-01');
  assert(call.body.system.includes('芙宁娜')); assert.equal(call.body.messages[0].role, 'user'); assert.equal(result.text, '第一段\n第二段');
});
test('Ollama protocol and invalid/failing provider responses', async () => {
  const result = await complete({ provider: 'ollama', model: 'fixture' }, messages, {
    fetchImpl: async (_url, options) => { assert.equal(JSON.parse(options.body).options.num_predict, 128); return { ok: true, json: async () => ({ message: { content: '本地回复' }, prompt_eval_count: 5, eval_count: 2 }) }; },
  });
  assert.equal(result.usage.completion_tokens, 2);
  await assert.rejects(complete({ provider: 'openai', model: '' }, messages), /模型名/);
  await assert.rejects(complete({ provider: 'openai', model: 'fixture' }, messages, { fetchImpl: async () => ({ ok: false, status: 401 }) }), /HTTP 401/);
  await assert.rejects(complete({ provider: 'openai', model: 'fixture' }, messages, { fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [] }) }) }), /JSON 表达契约/);
});
test('offline mode admits missing memories and has no implicit model configuration', () => {
  assert.match(offlineReply('你记得我们去年旅行吗？', []), /没有找到记录/);
  assert(PROVIDERS.every(p => p.model === undefined));
});
test('budget reserves before dispatch, retains failed calls and stops on cap/expiry', () => {
  const store = new MemoryStore(':memory:');
  const now = Date.parse(PRICING.verifiedAt) + 60000;
  const budget = new RemoteBudget(store.db, { now: () => now });
  try {
    const id = budget.reserve('deepseek-flash', messages);
    budget.finish(id, null, false);
    assert.equal(budget.status().usedCalls, 1); assert(budget.status().reservedCny > 0);
    budget.reserve('deepseek-flash', messages); budget.reserve('deepseek-flash', messages);
    budget.reserve('deepseek-flash', messages); // Fourth call is permitted; no fixed count cap.
    assert.equal(budget.status().usedCalls, 4);
    for (let i = 0; i < 2000; i++) {
      try { budget.reserve('deepseek-flash', messages); } catch { break; }
    }
    assert.throws(() => budget.reserve('deepseek-flash', messages), /预算/);
    assert.throws(() => budget.reserve('unverified-model', messages), /价格/);
    assert.throws(() => budget.reserve('deepseek-flash', messages, 1000), /token/);
    const expired = new RemoteBudget(store.db, { now: () => now + 86400000 });
    assert.throws(() => expired.reserve('deepseek-flash', messages), /价格/);
  } finally { store.close(); }
});

test('provider timeout/abort does not trigger hidden retries', async () => {
  let calls = 0;
  await assert.rejects(complete({ provider: 'ollama', model: 'fixture' }, messages, {
    timeoutMs: 10,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      calls++;
      options.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
      // Keep test event loop alive while AbortSignal's timer is unref'ed.
      setTimeout(() => reject(new Error('test guard')), 50);
    }),
  }), /timeout/);
  assert.equal(calls, 1);
});
