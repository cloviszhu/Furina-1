import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './isolated-app.js';
import { PRICING } from '../../server/budget.js';

test('automatic episodes use eventId, correct/delete shared sources, clear private corrections, and manual audio is confirmed', async ({ page }, testInfo) => {
  const directory = await mkdtemp(join(tmpdir(), 'exo-memory-ui-'));
  const syntheses = [], paths = []; let revisionFails = false, unsupported = false;
  const app = await createApp({ dataDir: directory,
    fetchImpl: async () => Response.json({ choices: [{ message: { content: '{"text":"我记住你的口味了。下次一起聊聊。","emotion":"calm"}' } }], usage: { prompt_tokens: 30, completion_tokens: 20 } }),
    localTtsImpl: { status: async () => ({ ready: true, voices: [{ id: 'mock', engine: 'gpt-sovits', name: 'Fixture voice', localService: true, emotions: unsupported ? ['neutral', 'calm'] : ['neutral', 'happy', 'calm'], source: 'fixture', license: 'fixture' }] }),
      synthesize: async options => { syntheses.push(options.emotion); return Buffer.from('decoder fixture'); } },
  });
  app.budget.now = () => Date.parse(PRICING.verifiedAt) + 1000;
  await new Promise(r => app.app.listen(0, '127.0.0.1', r));
  await page.route('**/character-assets/**', r => r.abort());
  await page.route('**/api/interaction-memories/*', async route => {
    paths.push({ method: route.request().method(), path: new URL(route.request().url()).pathname });
    if (revisionFails && route.request().method() === 'PATCH') return route.fulfill({ status: 409, json: { error: '纠正暂时失败，请重试。' } });
    await route.continue();
  });
  await page.addInitScript(() => {
    window.sources = []; window.__actualExpressions = [];
    window.AudioContext = class {
      destination = {}; async resume() {} async decodeAudioData() { return {}; }
      createAnalyser() { return { fftSize: 256, connect() {}, disconnect() {}, getByteTimeDomainData(b) { b.fill(128); } }; }
      createBufferSource() { const s = { connect() {}, disconnect() {}, start() {}, stop() { this.onended?.(); } }; sources.push(s); return s; }
    };
  });
  const send = async text => { await page.locator('[data-tab=chat]').click(); await page.locator('#chat-input').fill(text); await page.locator('#send').click(); await expect(page.locator('#speech-state')).toHaveAttribute('data-phase', 'speaking'); };
  const card = page.locator('#natural-memory-list .memory-card');
  try {
    await page.goto(`http://127.0.0.1:${app.app.address().port}`);
    await page.locator('#chat-settings').click(); await page.locator('#suggest-deepseek').click(); await page.locator('#api-key').fill('fixture-only');
    await page.locator('#voice-select').selectOption('neural:mock'); await page.locator('#voice-emotion').selectOption('happy'); await page.locator('#expression-mode').selectOption('manual');
    await page.locator('#settings .close-button').click(); await page.locator('#enable-real-chat').click();
    await send('我喜欢茉莉花茶。'); await expect.poll(() => syntheses.length).toBeGreaterThan(0); expect(syntheses[0]).toBe('happy');
    await page.locator('[data-tab=memory]').click(); await expect(card).toHaveCount(1);
    const eventId = app.store.history().find(e => e.role === 'user').id;
    await expect(card).toHaveAttribute('data-memory-key', eventId);
    expect(await page.locator('#natural-memory-list').evaluate(n => n.scrollHeight <= n.clientHeight + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('automatic-memory-page.png') });
    const sibling = await page.context().newPage(); await sibling.goto(`http://127.0.0.1:${app.app.address().port}`);
    await expect(sibling.locator('#natural-memory-list .memory-card')).toContainText('我喜欢茉莉花茶。');
    app.store.save('我喜欢茉莉花茶。', eventId); // Isolated shared-source manual record.
    await card.getByRole('button', { name: '纠正', exact: true }).click(); await card.getByLabel('纠正这条记忆').fill('我现在喜欢桂花茶。');
    revisionFails = true; await card.getByRole('button', { name: '保存纠正' }).click();
    await expect(page.locator('#natural-memory-list [role=alert]')).toContainText('纠正暂时失败'); await expect(card.getByLabel('纠正这条记忆')).toHaveValue('我现在喜欢桂花茶。');
    revisionFails = false; await card.getByRole('button', { name: '保存纠正' }).click(); await expect(card).toContainText('我现在喜欢桂花茶。');
    await expect(page.locator('#speech-subtitle')).toBeEmpty(); await expect(page.locator('#speech-state')).toHaveAttribute('data-phase', 'idle');
    await expect(page.locator('#memory-list')).toContainText('我现在喜欢桂花茶。'); expect(paths.every(p => p.path.endsWith(eventId))).toBe(true);
    await expect(sibling.locator('#natural-memory-list .memory-card')).toContainText('我现在喜欢桂花茶。');
    await card.getByRole('button', { name: '删除', exact: true }).click(); await card.getByRole('button', { name: '取消', exact: true }).click(); await expect(card).toHaveCount(1);
    await card.getByRole('button', { name: '删除', exact: true }).click(); await card.getByRole('button', { name: '确认删除' }).click(); await expect(card).toHaveCount(0);
    expect(app.store.list()).toHaveLength(0); expect(app.store.history().some(e => e.id === eventId)).toBe(false);
    await expect(sibling.locator('#natural-memory-list .memory-card')).toHaveCount(0); await sibling.close();
    await send('我喜欢在周末看歌剧。'); await page.locator('[data-tab=memory]').click(); await expect(card).toHaveCount(1);
    await card.getByRole('button', { name: '纠正', exact: true }).click(); await card.getByLabel('纠正这条记忆').fill('api key: sk-private-correction-fixture-only'); await card.getByRole('button', { name: '保存纠正' }).click();
    await expect(card).toHaveCount(0); await expect(page.locator('#app-error')).toContainText('未保留');
    unsupported = true; const previous = syntheses.length;
    await page.locator('[data-tab=chat]').click(); await page.locator('#chat-input').fill('我今天去了海边。'); await page.locator('#send').click();
    await expect(page.locator('#speech-state')).toHaveAttribute('data-phase', 'error'); await expect(page.locator('#speech-state')).toContainText('未登记'); expect(syntheses.length).toBe(previous);
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
