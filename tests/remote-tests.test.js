import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../server/memory.js';
import { RemoteBudget, PRICING } from '../server/budget.js';
import { RemoteTests, REMOTE_SCENARIOS } from '../server/remote-tests.js';
import { BoundedTestRunner } from '../src/remote-tests.js';
function start(tests, input) { const run = tests.start({ ...input, id: randomUUID() }); tests.activate(run.id); return run; }
const config = { provider: 'deepseek', model: 'deepseek-flash', apiKey: 'fake-qa-key-only' };
const fixture = () => Response.json({ choices: [{ message: { content: '{"text":"安全的本地fixture","emotion":"calm"}' } }], usage: { prompt_tokens: 15, completion_tokens: 8 } });
function setup(fetchImpl = async () => fixture()) {
  const store = new MemoryStore(':memory:');
  const budget = new RemoteBudget(store.db, { now: () => Date.parse(PRICING.verifiedAt) + 1000 });
  return { store, budget, tests: new RemoteTests(budget, { fetchImpl }) };
}
test('six serial fixed fixtures share existing ledger without touching formal history/memories or storing key', async () => {
  let calls = 0; const bodies = [];
  const { store, budget, tests } = setup(async (_url, options) => { calls++; bodies.push(JSON.parse(options.body)); return fixture(); });
  try {
    const old = budget.reserve(config.model, []); budget.finish(old, null, false);
    const original = budget.status().reservedCny;
    store.save('用户的真实正式记忆'); const memories = store.list();
    const run = start(tests, { confirmed: true, config });
    assert.equal(calls, 0); assert.equal(run.scenarios.length, 6);
    for (let index = 0; index < 6; index++) {
      const result = await tests.step(run.id, { index, config });
      assert.equal(result.status, 'completed'); assert(result.structured);
      assert.equal(result.state, index === 5 ? 'completed' : 'running');
      assert(!JSON.stringify(result).includes(config.apiKey));
    }
    assert.equal(calls, 6); assert.equal(budget.status().usedCalls, 7); assert(budget.status().reservedCny > original);
    assert.deepEqual(store.history(), []); assert.deepEqual(store.list(), memories);
    assert(!JSON.stringify(tests.run).includes(config.apiKey));
    assert(!JSON.stringify(budget.status()).includes(config.apiKey));
    assert(bodies.every(b => !JSON.stringify(b).includes('用户的真实正式记忆')));
    await assert.rejects(tests.step(run.id, { index: 6, config }), /停止|重复/); assert.equal(calls, 6);
  } finally { store.close(); }
});
test('incomplete/unconfirmed config and budget exhaustion dispatch nothing; two failures stop without retries', async () => {
  let calls = 0; const { store, budget, tests } = setup(async () => { calls++; throw Error('fixture failure fake-qa-key-only'); });
  try {
    for (const input of [{ config }, { confirmed: true, config: { ...config, apiKey: '' } }, { confirmed: true, config: { ...config, model: '' } }, { confirmed: true, config: { ...config, baseUrl: 'https://evil.example' } }]) assert.throws(() => start(tests, input));
    assert.equal(budget.status().usedCalls, 0); assert.equal(calls, 0);
    const run = start(tests, { confirmed: true, config });
    const a = await tests.step(run.id, { index: 0, config }); const b = await tests.step(run.id, { index: 1, config });
    assert.equal(a.state, 'running'); assert.equal(b.state, 'stopped'); assert.equal(calls, 2);
    assert(!JSON.stringify(b).includes(config.apiKey)); assert(budget.status().reservedCny > 0);
    await assert.rejects(tests.step(run.id, { index: 2, config })); assert.equal(calls, 2);
    for (let i = 0; i < 2000; i++) { try { budget.reserve(config.model, []); } catch { break; } }
    const run2 = start(tests, { confirmed: true, config });
    await assert.rejects(tests.step(run2.id, { index: 0, config }), /预算/); assert.equal(calls, 2);
  } finally { store.close(); }
});
test('concurrent/duplicate steps refused; cancellation aborts dispatch and retains reserve', async () => {
  let calls = 0; const { store, budget, tests } = setup((_url, { signal }) => new Promise((_resolve, reject) => {
    calls++; signal.addEventListener('abort', () => reject(Error('aborted')), { once: true });
  }));
  try {
    const run = start(tests, { confirmed: true, config });
    const pending = tests.step(run.id, { index: 0, config });
    await assert.rejects(tests.step(run.id, { index: 0, config }), /重复/);
    tests.cancel(run.id); const result = await pending;
    assert.equal(result.state, 'cancelled'); assert.equal(result.status, 'failed'); assert.equal(calls, 1);
    assert.equal(budget.status().records[0].status, 'failed'); assert(budget.status().reservedCny > 0);
    await assert.rejects(tests.step(run.id, { index: 1, config }));
  } finally { store.close(); }
});
test('UI runner issues exactly six serial requests; cancelled late response cannot update report or continue', async () => {
  let calls = 0, active = 0, maxActive = 0;
  const run = new BoundedTestRunner({ request: async (path, options) => {
    if (path === '/api/remote-tests') return { id: JSON.parse(options.body).id, scenarios: REMOTE_SCENARIOS, budget: {} };
    if (path.endsWith('/activate')) return {};
    calls++; active++; maxActive = Math.max(active, maxActive); await Promise.resolve(); active--;
    return { state: calls === 6 ? 'completed' : 'running', status: 'completed', budget: {}, text: 'fixture' };
  } });
  await run.start(config, {}); assert.equal(calls, 6); assert.equal(maxActive, 1); assert.equal(run.state, 'completed');
  let resolve, steps = 0;
  const stopped = new BoundedTestRunner({ request: async (path, options) => {
    if (path === '/api/remote-tests') return { id: JSON.parse(options.body).id, scenarios: REMOTE_SCENARIOS, budget: {} };
    if (path.endsWith('/cancel') || path.endsWith('/activate')) return {};
    steps++; return new Promise(r => { resolve = r; });
  } });
  const pending = stopped.start(config, {}); await new Promise(r => setImmediate(r)); stopped.stop();
  resolve({ state: 'running', status: 'completed', text: 'late fixture', budget: {} }); await pending;
  assert.equal(steps, 1); assert.equal(stopped.state, 'cancelled'); assert(!JSON.stringify(stopped.rows).includes('late fixture'));
  assert(!JSON.stringify(stopped.rows).includes(config.apiKey));
});
