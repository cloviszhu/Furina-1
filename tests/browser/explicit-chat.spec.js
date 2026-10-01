import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createApp } from '../../server/index.js';
import { WindowsCredentials } from '../../server/credentials.js';
import { PRICING } from '../../server/budget.js';

test('main chat explicitly enabled, reusable configuration, cancel, reload and memory source; no real services', async ({ page }) => {
  test.setTimeout(90000);
  await page.route('**/character-assets/**', route => route.abort());
  const directory = await mkdtemp(join(tmpdir(), 'exo-chat-browser-'));
  let calls = 0, reads = 0, hold = false, failed = false;
  const context = await createApp({ dev: true, windowsSpeechImpl: { voices: async () => [], synthesize: async () => { throw Error('Windows audio disabled in browser fixtures'); } }, dataDir: directory, credentials: new WindowsCredentials({ bridge: async action => {
    if (action === 'status') return { ok: true, saved: true };
    expect(action).toBe('read'); reads++; return { ok: true, key: 'fixture-only-chat-key' };
  } }), fetchImpl: async (url, options) => {
    calls++; expect(url).toBe('https://api.deepseek.com/chat/completions'); expect(JSON.parse(options.body).model).toBe('deepseek-v4-pro');
    if (failed) throw Error('fixture upstream failure');
    if (hold) await new Promise((r, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"text":"mock real reply","emotion":"calm"}' } }], usage: { prompt_tokens: 60, completion_tokens: 15 } }) };
  } });
  context.budget.now = () => Date.parse(PRICING.verifiedAt) + 1000;
  await new Promise(r => context.app.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${context.app.address().port}`;
  try {
    await page.goto(url); await expect(page.locator('#send')).toContainText('演示'); await page.locator('#auto-speak').uncheck();
    await page.locator('#chat-settings').click(); await page.locator('#suggest-deepseek').click();
    await page.locator('#model-name').fill('deepseek-v4-pro'); await page.locator('#credential-source').selectOption('saved');
    await page.locator('#settings .close-button').click();
    await page.locator('#enable-real-chat').click(); await expect(page.locator('#send')).toContainText('收费');
    expect(calls).toBe(0); expect(reads).toBe(0);
    await page.locator('[data-prompt]').first().click(); expect(calls).toBe(0); expect(reads).toBe(0);
    await page.locator('#chat-input').fill('browser real source'); await page.locator('#send').dblclick();
    await expect(page.locator('.message.assistant')).toHaveCount(1); expect(calls).toBe(1);
    await page.locator('.message.user button').click();
    await page.locator('[data-tab=chat]').click(); await page.locator('#enable-real-chat').click(); await page.locator('#enable-real-chat').click();
    await page.locator('[data-tab=memory]').click(); await expect(page.locator('#memory-source')).toContainText('用户消息'); await page.locator('#memory-save').click();
    // Automatic cards can exist before the manual-save request settles.
    await expect(page.locator('#memory-list .memory-card')).toHaveCount(1); expect(context.store.list()[0].sourceText).toBe('browser real source');
    await page.locator('[data-tab=chat]').click();
    failed = true; await page.locator('#chat-input').fill('failure source'); await page.locator('#send').dblclick();
    await expect(page.locator('#app-error')).toContainText('没有自动重试'); await expect(page.locator('.message.assistant')).toHaveCount(1); expect(calls).toBe(2);
    failed = false; hold = true; await page.locator('#send').click(); await expect.poll(() => calls).toBe(3);
    await page.locator('#cancel-chat').click(); await expect(page.locator('#send')).toBeEnabled(); await expect(page.locator('#app-error')).toContainText('预留不退');
    await expect.poll(() => context.budget.status().records.at(-1).status).toBe('failed');
    await page.locator('#send').click(); await expect.poll(() => calls).toBe(4); await page.locator('#enable-real-chat').click();
    await expect(page.locator('#send')).toContainText('演示'); await expect.poll(() => context.budget.status().records.at(-1).status).toBe('failed');
    hold = false; await page.reload(); await expect(page.locator('#send')).toContainText('演示');
    expect(calls).toBe(4); expect(reads).toBe(4);
    await page.locator('#chat-settings').click(); await expect(page.locator('#credential-source')).toHaveValue('saved'); await expect(page.locator('#model-name')).toHaveValue('deepseek-v4-pro');
    const storage = await page.evaluate(() => localStorage.getItem('project-exo.settings')); expect(storage).not.toContain('fixture-only-chat-key'); expect(storage).not.toContain('remoteChat');
    await page.locator('#settings .close-button').click(); await page.locator('#enable-real-chat').click(); await page.locator('#chat-input').fill('review-ready screenshot');
    await page.screenshot({ path: 'artifacts/explicit-chat-mode/mock-real-chat.png' });
    hold = true; await page.locator('#send').click(); await expect.poll(() => calls).toBe(5);
    await page.reload(); await expect(page.locator('#send')).toContainText('演示'); await expect.poll(() => context.budget.status().records.at(-1).status).toBe('failed');
    expect(calls).toBe(5); expect(context.store.history()).toHaveLength(2);
  } finally { await context.close(); expect(resolve(directory).startsWith(resolve(tmpdir()) + sep)).toBe(true); await rm(directory, { recursive: true, force: true }); }
});
