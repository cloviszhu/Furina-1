import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from './isolated-app.js';

async function fixture(page) {
  const directory = await mkdtemp(join(tmpdir(), 'exo-record-browser-'));
  const context = await createApp({ projectRoot: resolve('.'), dataDir: directory,
    localTtsImpl: { status: async () => ({ available: false, voices: [] }), voices: () => [] },
    fetchImpl: async () => { throw Error('External network disabled'); } });
  await new Promise(resolve => context.app.listen(0, '127.0.0.1', resolve));
  await page.route('**/character-assets/**', route => route.abort());
  await page.addInitScript(() => {
    window.fakeAudio = { permissions: 0, stopped: 0, delayPermission: false, reject: null };
    const stream = () => ({ getTracks: () => [{ stop: () => window.fakeAudio.stopped++ }] });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      window.fakeAudio.permissions++;
      if (window.fakeAudio.reject) throw Object.assign(new Error(), { name: window.fakeAudio.reject });
      if (window.fakeAudio.delayPermission) return await new Promise(resolve => window.fakeAudio.release = () => resolve(stream()));
      return stream();
    } } });
    window.MediaRecorder = class {
      static isTypeSupported() { return true; }
      constructor(_stream, options) { this.mimeType = options.mimeType; this.state = 'inactive'; }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; setTimeout(() => { this.ondataavailable({ data: new Blob(['fake-audio']) }); this.onstop(); }, 0); }
    };
  });
  const counts = { uploads: 0, chat: 0, cancels: 0 }, pending = [];
  let hold = false;
  await page.route('**/api/asr/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/status')) return route.fulfill({ json: { available: true, offline: true } });
    if (path.endsWith('/cancel')) { counts.cancels++; return route.fulfill({ json: { cancelled: true } }); }
    counts.uploads++;
    if (hold) await new Promise(resolve => pending.push(resolve));
    try { await route.fulfill({ json: { captureId: path.split('/').at(-1), text: '这是本地录音草稿' } }); } catch { /* Cancelled browser fetch */ }
  });
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/chat') counts.chat++; });
  const base = `http://127.0.0.1:${context.app.address().port}`;
  await page.goto(base); await expect(page.locator('#send')).toContainText('演示'); await page.locator('#auto-speak').uncheck();
  return { counts, context, hold() { hold = true; }, release() { for (const resolve of pending.splice(0)) resolve(); },
    async close() { for (const resolve of pending.splice(0)) resolve(); context.app.closeAllConnections(); await context.close(); await rm(directory, { recursive: true, force: true }); } };
}
test('recording only on click, draft requires explicit send and formal history starts only after send', async ({ page }) => {
  const f = await fixture(page);
  try {
    expect(await page.evaluate(() => fakeAudio.permissions)).toBe(0);
    await page.locator('#record-start').click(); await expect(page.locator('#record-state')).toHaveAttribute('data-state', 'recording');
    await page.locator('#chat-input').press('Enter'); expect(f.counts.chat).toBe(0);
    await page.locator('#record-stop').click(); await expect(page.locator('#record-state')).toHaveAttribute('data-state', 'draft');
    expect(await page.evaluate(() => fakeAudio.stopped)).toBe(1); await expect(page.locator('#chat-input')).toHaveValue('这是本地录音草稿');
    expect(f.counts.chat).toBe(0); expect(f.context.store.history()).toHaveLength(0);
    await page.locator('#chat-input').fill('用户校对后的文字'); await page.locator('#send').click();
    await expect(page.locator('.message.user')).toContainText('用户校对后的文字'); expect(f.counts.chat).toBe(1);
  } finally { await f.close(); }
});
test('edited draft survives delayed transcription; cancel/mode/reload stop tracks without chat', async ({ page }) => {
  const f = await fixture(page);
  try {
    f.hold(); await page.locator('#record-start').click(); await expect(page.locator('#record-stop')).toBeEnabled(); await page.locator('#record-stop').click();
    await expect.poll(() => f.counts.uploads).toBe(1); await page.locator('#chat-input').fill('保留我的编辑'); f.release();
    await expect(page.locator('#record-state')).toContainText('未覆盖'); await expect(page.locator('#chat-input')).toHaveValue('保留我的编辑');
    await page.locator('#record-start').click(); await expect(page.locator('#record-state')).toHaveAttribute('data-state', 'recording'); await page.locator('#record-cancel').click();
    await expect(page.locator('#record-state')).toHaveAttribute('data-state', 'idle'); expect(await page.evaluate(() => fakeAudio.stopped)).toBe(2);
    await page.locator('#record-start').click(); await expect(page.locator('#record-state')).toHaveAttribute('data-state', 'recording'); await page.locator('#enable-real-chat').click();
    await expect(page.locator('#record-state')).toHaveAttribute('data-state', 'idle'); expect(await page.evaluate(() => fakeAudio.stopped)).toBe(3);
    await page.locator('#settings .close-button').click();
    await page.locator('#record-start').click(); await expect(page.locator('#record-state')).toHaveAttribute('data-state', 'recording');
    await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); }); expect(await page.evaluate(() => fakeAudio.stopped)).toBe(4);
    await page.reload(); expect(await page.evaluate(() => fakeAudio.permissions)).toBe(0); expect(f.counts.chat).toBe(0);
  } finally { await f.close(); }
});
test('late permission and denied/missing microphone recover using fake streams', async ({ page }) => {
  const f = await fixture(page);
  try {
    await page.evaluate(() => fakeAudio.delayPermission = true); await page.locator('#record-start').click(); await expect.poll(() => page.evaluate(() => fakeAudio.permissions)).toBe(1);
    await page.locator('#record-cancel').click(); await page.evaluate(() => fakeAudio.release()); await expect.poll(() => page.evaluate(() => fakeAudio.stopped)).toBe(1);
    await page.evaluate(() => { fakeAudio.delayPermission = false; fakeAudio.reject = 'NotAllowedError'; });
    await page.locator('#record-start').click(); await expect(page.locator('#record-state')).toContainText('授权被拒绝');
    await page.evaluate(() => fakeAudio.reject = 'NotFoundError'); await page.locator('#record-start').click(); await expect(page.locator('#record-state')).toContainText('未发现');
    await page.evaluate(() => fakeAudio.reject = null); await page.locator('#record-start').click(); await expect(page.locator('#record-state')).toHaveAttribute('data-state', 'recording');
    await page.locator('#record-cancel').click(); expect(f.counts.chat).toBe(0); expect(f.counts.uploads).toBe(0);
  } finally { await f.close(); }
});
