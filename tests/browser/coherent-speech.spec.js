import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './isolated-app.js';
import { PRICING } from '../../server/budget.js';

test('one complete mock reply plays ordered short sentences with synchronized captions, stop and recovery', async ({ page }) => {
  const directory = await mkdtemp(join(tmpdir(), 'exo-coherent-'));
  const requests = []; let failNext = false;
  const app = await createApp({ dataDir: directory,
    fetchImpl: async () => Response.json({ choices: [{ message: { content: '{"text":"第一句。第二句。","emotion":"happy"}' } }], usage: { prompt_tokens: 20, completion_tokens: 15 } }),
    localTtsImpl: { status: async () => ({ ready: true, voices: [{ id: 'mock', engine: 'gpt-sovits', name: 'Fixture', localService: true, emotions: ['neutral', 'happy'], source: 'fixture', license: 'fixture' }] }),
      synthesize: async options => { requests.push(options.text); if (failNext) { failNext = false; throw Error('fixture synthesis failure'); } return Buffer.from('decoder fixture'); } },
  });
  app.budget.now = () => Date.parse(PRICING.verifiedAt) + 1000;
  await new Promise(r => app.app.listen(0, '127.0.0.1', r));
  await page.route('**/character-assets/**', r => r.abort());
  await page.addInitScript(() => {
    window.sources = []; window.audioEvents = [];
    window.AudioContext = class {
      destination = {}; async resume() {} async decodeAudioData() { return {}; }
      createAnalyser() { return { fftSize: 256, connect() {}, disconnect() {}, getByteTimeDomainData(b) { b.fill(128); } }; }
      createBufferSource() { const source = { connect() {}, disconnect() {}, start() { audioEvents.push('start'); }, stop() { audioEvents.push('stop'); this.onended?.(); } }; sources.push(source); return source; }
    };
  });
  const send = async () => { await page.locator('#chat-input').fill('fixture'); await page.locator('#send').click(); };
  try {
    await page.goto(`http://127.0.0.1:${app.app.address().port}`);
    await page.locator('#chat-settings').click(); await page.locator('#suggest-deepseek').click();
    await page.locator('#api-key').fill('fixture-only'); await page.locator('#voice-select').selectOption('neural:mock');
    await page.locator('#settings .close-button').click(); await page.locator('#enable-real-chat').click();
    await send(); await expect(page.locator('#speech-subtitle')).toHaveText('第一句。');
    await expect(page.locator('#speech-state')).toHaveAttribute('data-phase', 'speaking');
    expect(await page.evaluate(() => sources.length)).toBe(1);
    await page.evaluate(() => sources[0].onended()); await expect(page.locator('#speech-subtitle')).toHaveText('第二句。');
    await page.evaluate(() => sources[1].onended()); await expect(page.locator('#speech-subtitle')).toBeEmpty();
    await expect(page.locator('#speech-state')).toHaveAttribute('data-phase', 'idle'); await expect(page.locator('#send')).toBeEnabled();
    expect(requests.slice(0, 2)).toEqual(['第一句。', '第二句。']);
    await send(); await expect(page.locator('#speech-subtitle')).toHaveText('第一句。');
    await page.locator('#stop-speech').click(); await expect(page.locator('#speech-subtitle')).toBeEmpty();
    await expect(page.locator('#speech-state')).toHaveAttribute('data-phase', 'idle'); await expect(page.locator('#send')).toBeEnabled();
    expect(await page.evaluate(() => sources.length)).toBe(3);
    failNext = true; await send(); await expect(page.locator('#speech-state')).toHaveAttribute('data-phase', 'error'); await expect(page.locator('#send')).toBeEnabled();
    await send(); await expect(page.locator('#speech-subtitle')).toHaveText('第一句。');
    await page.locator('#enable-real-chat').click(); await expect(page.locator('#speech-subtitle')).toBeEmpty();
    await page.reload(); await expect(page.locator('#send')).toContainText('演示');
    expect(await page.evaluate(() => sources.length)).toBe(0);
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
