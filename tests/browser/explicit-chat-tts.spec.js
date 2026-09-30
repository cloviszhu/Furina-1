import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createApp } from '../../server/index.js';
import { WindowsCredentials } from '../../server/credentials.js';
import { PRICING } from '../../server/budget.js';

test('auto speak cancellation across waiting model, pending TTS, mode switch and reload never plays late audio', async ({ page }) => {
  test.setTimeout(120000);
  const directory = await mkdtemp(join(tmpdir(), 'exo-chat-tts-'));
  let modelWait = false, ttsWait = false, releaseModel, releaseTts, modelSignal, ttsSignal, modelCalls = 0, ttsCalls = 0;
  const voice = { id: 'qa-chat-tts', engine: 'gpt-sovits', name: 'Mock audio only', localService: true, emotions: ['neutral'], source: 'fixture', license: 'fixture' };
  const app = await createApp({ dev: true, dataDir: directory,
    credentials: new WindowsCredentials({ bridge: async () => { throw Error('No native credential access'); } }),
    windowsSpeechImpl: { voices: async () => [], synthesize: async () => { throw Error('No native audio'); } },
    localTtsImpl: { status: async () => ({ ready: true, voices: [voice], active: false, pending: 0 }), synthesize: async ({ signal }) => {
      ttsSignal = signal;
      ttsCalls++; if (ttsWait) await new Promise(r => { releaseTts = r; });
      return Buffer.from('mock-audio-decoder-fixture'); // AudioContext below is a test double.
    } }, fetchImpl: async (_url, { signal }) => {
      modelSignal = signal;
      modelCalls++; if (modelWait) await new Promise(r => { releaseModel = r; });
      return Response.json({ choices: [{ message: { content: '{"text":"completed mock text","emotion":"neutral"}' } }], usage: { prompt_tokens: 30, completion_tokens: 10 } });
    } });
  app.budget.now = () => Date.parse(PRICING.verifiedAt) + 1000;
  await new Promise(r => app.app.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${app.app.address().port}`;
  await page.route('**/character-assets/**', r => r.abort());
  await page.addInitScript(() => {
    window.__mockAudio = { starts: 0, stops: 0 };
    window.AudioContext = class {
      destination = {};
      async resume() {} async decodeAudioData() { return {}; }
      createAnalyser() { return { fftSize: 256, connect() {}, getByteTimeDomainData(bytes) { bytes.fill(128); } }; }
      createBufferSource() { return { connect() {}, start() { window.__mockAudio.starts++; sessionStorage.setItem('mock-audio-starts', String(Number(sessionStorage.getItem('mock-audio-starts') || 0) + 1)); }, stop() { window.__mockAudio.stops++; this.onended?.(); } }; }
    };
  });
  const setup = async () => {
    await expect(page.locator('#send')).toContainText('演示');
    await page.locator('#chat-settings').click(); await page.locator('#suggest-deepseek').click();
    await page.locator('#api-key').fill('fixture-tts-chat-only'); await page.locator('#voice-select').selectOption('neural:qa-chat-tts');
    await page.locator('#settings .close-button').click(); await page.locator('#enable-real-chat').click();
    await expect(page.locator('#auto-speak')).toBeChecked();
  };
  const starts = () => page.evaluate(() => Number(sessionStorage.getItem('mock-audio-starts') || 0));
  try {
    await page.goto(url); await setup();
    modelWait = true;
    for (const action of ['cancel', 'mode', 'reload']) {
      const previous = modelCalls;
      await page.locator('#chat-input').fill(`pending model ${action}`); await page.locator('#send').click();
      await expect.poll(() => modelCalls).toBe(previous + 1);
      if (action === 'cancel') await page.locator('#cancel-chat').click();
      else if (action === 'mode') await page.locator('#enable-real-chat').click();
      else await page.reload();
      // Release a deliberately cancellation-ignoring double only AFTER disconnect
      // reaches the server, so this measures late completion, not packet ordering.
      await expect.poll(() => modelSignal.aborted).toBe(true); releaseModel();
      await expect.poll(() => app.budget.status().records.at(-1).status).toBe('completed');
      await expect(page.locator('#send')).toBeEnabled(); await expect(page.locator('.message')).toHaveCount(0);
      expect(app.store.history()).toHaveLength(0); expect(ttsCalls).toBe(0); expect(await starts()).toBe(0);
      if (action === 'mode') { await expect(page.locator('#send')).toContainText('演示'); await page.locator('#enable-real-chat').click(); }
      if (action === 'reload') { await expect(page.locator('#send')).toContainText('演示'); expect(modelCalls).toBe(previous + 1); await setup(); }
    }
    modelWait = false; ttsWait = true;
    for (const action of ['cancel', 'mode', 'reload']) {
      const previous = ttsCalls, oldHistory = app.store.history(100).length;
      await page.locator('#chat-input').fill(`pending TTS ${action}`); await page.locator('#send').click();
      await expect.poll(() => ttsCalls).toBe(previous + 1);
      expect(app.store.history(100)).toHaveLength(oldHistory + 2); // Text completed BEFORE synthesis begins.
      if (action === 'cancel') await page.locator('#cancel-chat').click();
      else if (action === 'mode') await page.locator('#enable-real-chat').click();
      else await page.reload();
      await expect.poll(() => ttsSignal.aborted).toBe(true);
      releaseTts(); await expect(page.locator('#send')).toBeEnabled();
      await page.waitForTimeout(200); // Give intentionally late audio delivery a chance to reach the client.
      expect(await starts()).toBe(0); expect(app.store.history(100)).toHaveLength(oldHistory + 2);
      if (action === 'mode') { await expect(page.locator('#send')).toContainText('演示'); await page.locator('#enable-real-chat').click(); }
      if (action === 'reload') { await expect(page.locator('#send')).toContainText('演示'); expect(modelCalls).toBe(6); await setup(); }
    }
    ttsWait = false; await page.locator('#chat-input').fill('mock playback proof'); await page.locator('#send').click();
    await expect.poll(starts).toBe(1); await page.locator('#stop-speech').click();
    expect(await page.evaluate(() => window.__mockAudio.stops)).toBeGreaterThan(0);
    await expect(page.locator('#speech-state')).toContainText('已停止');
    const stableHistory = app.store.history(100).length; await page.locator('#enable-real-chat').click(); await page.reload();
    await expect(page.locator('#send')).toContainText('演示'); expect(await starts()).toBe(1);
    expect(app.store.history(100)).toHaveLength(stableHistory); expect(modelCalls).toBe(7); expect(ttsCalls).toBe(4);
  } finally {
    releaseModel?.(); releaseTts?.(); await app.close();
    expect(resolve(directory).startsWith(resolve(tmpdir()) + sep)).toBe(true); await rm(directory, { recursive: true, force: true });
  }
});
