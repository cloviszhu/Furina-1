import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../server/memory.js';
import { PRICING, LIMITS, RemoteBudget } from '../server/budget.js';

test('price reverification preserves existing failed/completed reserves and enforces exact 24h boundary', () => {
  const store = new MemoryStore(':memory:');
  const oldPricing = { ...PRICING, verifiedAt: '2026-09-30T10:15:00Z' };
  const messages = [{ role: 'user', content: 'synthetic price maintenance fixture' }];
  try {
    const oldBudget = new RemoteBudget(store.db, { pricing: oldPricing, now: () => Date.parse(oldPricing.verifiedAt) + 60000 });
    oldBudget.finish(oldBudget.reserve('deepseek-flash', messages), { prompt_tokens: 30, completion_tokens: 10 }, true);
    oldBudget.finish(oldBudget.reserve('deepseek-v4-pro', messages), null, false);
    const before = oldBudget.status();
    const verified = Date.parse(PRICING.verifiedAt);
    let now = verified;
    const renewed = new RemoteBudget(store.db, { now: () => now });
    const after = renewed.status();
    for (const key of ['records', 'limits', 'usedCalls', 'reservedCny', 'remainingCny']) assert.deepEqual(after[key], before[key], key);
    assert.equal(LIMITS.cny, 9); assert.equal(LIMITS.outputTokens, 128); assert.equal(LIMITS.inputBytes, 16000); assert.equal(LIMITS.safetyMultiplier, 10);
    for (const [offset, current] of [[-1, false], [0, true], [86400000 - 1, true], [86400000, false]]) {
      now = verified + offset;
      assert.equal(renewed.status().pricingCurrent, current);
      if (!current) assert.throws(() => renewed.reserve('deepseek-flash', messages), /24/);
    }
    assert.deepEqual(renewed.status().records, before.records);
  } finally { store.close(); }
});
