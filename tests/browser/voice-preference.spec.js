import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createApp } from './isolated-app.js';

test('voice preference survives delayed boot, failure, missing/recovery, user change and confirmed removal/restoration', async ({ page }) => {
  test.setTimeout(120000);
  const directory = await mkdtemp(join(tmpdir(), 'exo-voice-pref-'));
  const one = { id: 'pref-one', engine: 'gpt-sovits', name: 'Fixture One', localService: true, emotions: ['neutral', 'calm'], source: 'fixture', license: 'fixture' };
  const two = { ...one, id: 'pref-two', name: 'Fixture Two', emotions: ['neutral'] };
  let mode = 'full', hold = true, release, pending = 0, tombstones = [], metadataFails = false, calls = 0, syntheses = 0;
  const requests = [];
  const app = await createApp({ dataDir: directory, localTtsImpl: { status: async () => ({ ready: true, voices: [two, one] }), synthesize: async () => { syntheses++; throw Error('No audio'); } }, fetchImpl: async () => { calls++; throw Error('No provider'); } });
  await new Promise(r => app.app.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${app.app.address().port}`;
  await page.route('**/character-assets/**', r => r.abort());
  await page.addInitScript(() => { if (!localStorage.getItem('project-exo.settings')) localStorage.setItem('project-exo.settings', JSON.stringify({ version: 2, settings: { provider: 'offline', voice: 'neural:pref-one', emotion: 'calm', speed: 1.2 } })); });
  await page.route('**/api/voices', async route => {
    const snapshot = mode;
    if (hold) { hold = false; pending++; await new Promise(r => { release = r; }); }
    await route.fulfill(snapshot === 'failure' ? { status: 503, body: '{}' } : { json: { voices: snapshot === 'missing' ? [two] : [two,one], localTts: { ready: true } } });
  });
  await page.route('**/api/reference-deletions', route => route.fulfill(metadataFails ? { status: 503, body: '{}' } : { json: { deletions: tombstones } }));
  page.on('request', request => { if (request.url().startsWith(url+'/api/')) requests.push({ path: new URL(request.url()).pathname, method: request.method() }); });
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('project-exo.settings')).settings);
  const refresh = async () => { await page.locator('#refresh-voices').click(); };
  try {
    await page.goto(url); await expect.poll(() => pending).toBe(1);
    expect((await saved()).voice).toBe('neural:pref-one'); release();
    await expect(page.locator('#voice-select')).toHaveValue('neural:pref-one');
    await expect(page.locator('#voice-emotion')).toHaveValue('calm');
    await page.locator('#open-settings').click();
    await expect(page.locator('#settings-state')).toContainText('已自动保存');
    await expect(page.locator('#settings')).toContainText('localhost 与 127.0.0.1 不共享偏好');
    mode = 'missing'; await refresh(); await expect(page.locator('#voice-select')).toHaveValue('neural:pref-two');
    await expect(page.locator('#voice-preference')).toContainText('临时使用');
    // The native select already shows Two: confirm that SAME effective value
    // by a real button click, without selectOption/dispatching a change event.
    await expect(page.locator('#confirm-voice-preference')).toBeVisible();
    await page.evaluate(() => { window.__voiceChanges = 0; document.getElementById('voice-select').addEventListener('change', () => window.__voiceChanges++); });
    await page.locator('#confirm-voice-preference').click();
    await expect(page.locator('#voice-select')).toHaveValue('neural:pref-two'); expect((await saved()).voice).toBe('neural:pref-two');
    expect(await page.evaluate(() => window.__voiceChanges)).toBe(0); await expect(page.locator('#confirm-voice-preference')).toBeHidden();
    mode = 'full'; await refresh(); await expect(page.locator('#voice-select')).toHaveValue('neural:pref-two');
    await page.reload(); await page.locator('#open-settings').click(); await expect(page.locator('#voice-select')).toHaveValue('neural:pref-two');
    await expect(page.locator('#confirm-voice-preference')).toBeHidden();
    await page.locator('#voice-select').selectOption('neural:pref-one'); await page.locator('#voice-emotion').selectOption('calm');
    mode = 'missing'; await refresh(); await expect(page.locator('#voice-select')).toHaveValue('neural:pref-two');
    await page.locator('#model-name').fill('fixture-model'); expect((await saved()).voice).toBe('neural:pref-one'); expect((await saved()).emotion).toBe('calm');
    await page.reload(); await page.locator('#open-settings').click(); await expect(page.locator('#voice-select')).toHaveValue('neural:pref-two'); expect((await saved()).voice).toBe('neural:pref-one');
    mode = 'failure'; await refresh(); await expect(page.locator('#voice-select')).toHaveValue(''); expect((await saved()).voice).toBe('neural:pref-one');
    await expect(page.locator('#confirm-voice-preference')).toBeHidden();
    mode = 'full'; await refresh(); await expect(page.locator('#voice-select')).toHaveValue('neural:pref-one'); await expect(page.locator('#voice-emotion')).toHaveValue('calm');
    hold = true; const previous = pending; await refresh(); await expect.poll(() => pending).toBe(previous+1);
    await page.locator('#voice-select').selectOption('neural:pref-two'); release();
    await expect(page.locator('#voice-select')).toHaveValue('neural:pref-two'); expect((await saved()).voice).toBe('neural:pref-two');
    await page.locator('#voice-select').selectOption('neural:pref-one');
    mode = 'missing'; hold = true; await refresh(); await expect.poll(() => pending).toBe(previous+2);
    mode = 'full'; await refresh(); await expect(page.locator('#voice-select')).toHaveValue('neural:pref-one');
    release(); await page.waitForTimeout(150); await expect(page.locator('#voice-select')).toHaveValue('neural:pref-one');
    // Confirmed cross-page notification still cancels a removed preference when
    // the metadata read is temporarily unavailable; it is not a missing-list guess.
    metadataFails = true;
    await page.evaluate(() => { const channel = new BroadcastChannel('exo-reference-mutations'); channel.postMessage({ type: 'references-mutated', operation: 'profile', profileId: 'pref-one' }); channel.close(); });
    await expect(page.locator('#voice-preference')).toContainText('明确删除'); expect((await saved()).voice).toBe('neural:pref-two');
    metadataFails = false; await refresh(); await page.locator('#voice-select').selectOption('neural:pref-one');
    // A late old notification must not override current authoritative restored state.
    await page.evaluate(() => { const channel = new BroadcastChannel('exo-reference-mutations'); channel.postMessage({ type: 'references-mutated', operation: 'profile', profileId: 'pref-one' }); channel.close(); });
    await page.waitForTimeout(200); await expect(page.locator('#voice-select')).toHaveValue('neural:pref-one');
    metadataFails = true; mode = 'missing'; await refresh(); await expect(page.locator('#voice-select')).toHaveValue('neural:pref-two'); expect((await saved()).voice).toBe('neural:pref-one');
    metadataFails = false; mode = 'full'; tombstones = [{ profileId: 'pref-one', emotion: null, canRestore: true }];
    await refresh(); await expect(page.locator('#voice-preference')).toContainText('明确删除'); await expect(page.locator('#voice-select')).toHaveValue('neural:pref-two'); expect((await saved()).voice).toBe('neural:pref-two');
    await page.reload(); await page.locator('#open-settings').click(); await expect(page.locator('#voice-select')).toHaveValue('neural:pref-two');
    tombstones = []; await refresh(); await expect(page.locator('#voice-select')).toHaveValue('neural:pref-two'); // Restore does not undo subsequent preference.
    await page.locator('#voice-select').selectOption('neural:pref-one'); await page.locator('#voice-emotion').selectOption('calm');
    expect((await saved()).voice).toBe('neural:pref-one'); // Explicit reselect after restore is honored.
    tombstones = [{ profileId: 'pref-one', emotion: 'calm', canRestore: true }]; await refresh();
    await expect(page.locator('#voice-emotion')).toHaveValue('neutral'); expect((await saved()).emotion).toBe('neutral');
    tombstones = []; await refresh(); await expect(page.locator('#voice-emotion')).toHaveValue('neutral');
    expect(calls).toBe(0); expect(syntheses).toBe(0); expect(app.budget.status().usedCalls).toBe(0); expect(app.store.history()).toHaveLength(0);
    expect(requests.every(r=>r.method==='GET')).toBe(true); await expect(page.locator('#send')).toContainText('演示'); await expect(page.locator('#credential-source')).toHaveValue('input');
    await page.screenshot({ path: 'artifacts/voice-preference/fixture-preference.png' });
  } finally { release?.(); await app.close(); expect(resolve(directory).startsWith(resolve(tmpdir())+sep)).toBe(true); await rm(directory,{recursive:true,force:true}); }
});
