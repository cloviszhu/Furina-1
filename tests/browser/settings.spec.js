import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../server/index.js';
import { WindowsCredentials, credentialError } from '../../server/credentials.js';

test('isolated settings reload preserves ordinary options and context; user-only mocked credentials never leak or charge', async ({ page }) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'exo-settings-browser-'));
  let savedKey, calls = 0, saves = 0, unavailable = false;
  const credentials = new WindowsCredentials({ bridge: async (action, key) => {
    if (unavailable) throw credentialError('NATIVE_ERROR', 1312);
    if (action === 'status') return { ok: true, saved: !!savedKey };
    if (action === 'save') { if (savedKey) throw credentialError('EXISTS'); savedKey = key; saves++; return { ok: true }; }
    if (action === 'delete') { savedKey = undefined; return { ok: true }; }
    if (!savedKey) throw credentialError('NOT_FOUND'); return { ok: true, key: savedKey };
  } });
  const app = await createApp({ dataDir, credentials, localTtsImpl: { status: async () => ({ ready: true, voices: [
    { id: 'furina-community-reference-test', engine: 'gpt-sovits', name: 'Fixture Furina', localService: true, emotions: ['neutral', 'calm'], source: 'fixture', license: 'fixture' },
    { id: 'ravdess-24-test', engine: 'gpt-sovits', name: 'Fixture RAVDESS', localService: true, emotions: ['neutral', 'happy'], source: 'fixture', license: 'fixture' },
  ] }) }, fetchImpl: async () => { calls++; throw Error('no real network'); } });
  app.store.event('user', 'performer timeline fixture', { contextKey: 'performer' });
  app.store.event('user', 'aftermath timeline fixture', { contextKey: 'aftermath' });
  app.store.save('confirmed memory fixture');
  await new Promise(r => app.app.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${app.app.address().port}`;
  const bodies = []; page.on('response', async response => { if (response.url().includes('/api/credentials')) { try { bodies.push(await response.text()); } catch {} } });
  try {
    await page.goto(url); await page.locator('#open-settings').click();
    await expect(page.locator('#credential-status')).toHaveText('未保存');
    await page.locator('#provider').selectOption('deepseek'); await page.locator('#model-name').fill('deepseek-flash');
    await page.locator('#base-url').fill('https://api.deepseek.com/v1'); await page.locator('#api-key').fill('fake-browser-fixture-only');
    await page.locator('#voice-select').selectOption('neural:furina-community-reference-test'); await page.locator('#voice-emotion').selectOption('calm');
    await page.locator('#voice-speed').fill('1.2'); await page.locator('#expression-mode').selectOption('reply');
    await page.locator('#character-timeline').selectOption('performer'); await page.locator('#character-style').selectOption('quiet');
    await expect(page.locator('#messages')).toContainText('performer timeline fixture');
    await page.reload(); await page.locator('#open-settings').click();
    for (const [id, value] of Object.entries({ provider: 'deepseek', 'model-name': 'deepseek-flash', 'base-url': 'https://api.deepseek.com/v1', 'voice-select': 'neural:furina-community-reference-test', 'voice-emotion': 'calm', 'voice-speed': '1.2', 'expression-mode': 'reply', 'character-timeline': 'performer', 'character-style': 'quiet', 'api-key': '' })) await expect(page.locator('#' + id)).toHaveValue(value);
    await expect(page.locator('#messages')).toContainText('performer timeline fixture'); await expect(page.locator('#messages')).not.toContainText('aftermath timeline fixture');
    const stored = await page.evaluate(() => localStorage.getItem('project-exo.settings')); expect(stored).not.toContain('fake-browser-fixture-only'); expect(stored).not.toContain('apiKey'); expect(stored).not.toContain('fixture timeline');
    expect(calls).toBe(0); expect(saves).toBe(0); expect(app.budget.status().usedCalls).toBe(0); expect(app.store.list()).toHaveLength(1);
    await page.locator('#api-key').fill('fake-browser-fixture-only'); await page.locator('#save-credential').click();
    await expect(page.locator('#credential-status')).toHaveText('已保存'); await expect(page.locator('#api-key')).toHaveValue(''); await expect(page.locator('#api-key')).toBeDisabled(); expect(saves).toBe(1);
    await page.reload(); await page.locator('#open-settings').click(); await expect(page.locator('#credential-status')).toHaveText('已保存'); await expect(page.locator('#api-key')).toHaveValue(''); expect(calls).toBe(0);
    await page.locator('#credential-source').selectOption('saved'); await expect(page.locator('#api-key')).toBeDisabled();
    await page.locator('#credential-source').selectOption('input'); await page.locator('#api-key').fill('different-fake'); await page.locator('#save-credential').click(); await expect(page.locator('#credential-status')).toContainText('EXISTS'); expect(saves).toBe(1);
    page.once('dialog', dialog => dialog.accept()); await page.locator('#delete-credential').click(); await expect(page.locator('#credential-status')).toHaveText('未保存');
    unavailable = true; await page.locator('#api-key').fill('fake-browser-fixture-only'); await page.locator('#save-credential').click(); await expect(page.locator('#credential-status')).toContainText('1312');
    expect((await page.evaluate(() => localStorage.getItem('project-exo.settings')))).not.toContain('fake-browser-fixture-only');
    expect(bodies.join('')).not.toContain('fake-browser-fixture-only'); expect(bodies.join('')).not.toContain('different-fake'); expect(calls).toBe(0);
    await page.screenshot({ path: 'artifacts/settings-persistence/fixture-settings.png' });
  } finally { await app.close(); await rm(dataDir, { recursive: true, force: true }); }
});
