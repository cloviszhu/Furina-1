import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createApp } from '../../server/index.js';
import { PRICING } from '../../server/budget.js';

// Integrated HTTP + UI orchestration, deterministic fake audio, no real services.
// Run after the frontend branch is integrated. This is not acoustic quality QA.
test('one turn plays ordered segments once, cancels late work and recovers from TTS failure', async ({ page }) => {
  test.setTimeout(90000);
  const directory = await mkdtemp(join(tmpdir(), 'exo-coherent-e2e-'));
  const text = '第一句。' + '中'.repeat(300) + '最后一句。';
  let modelCalls = 0, audioCalls = 0, modelWait = false, audioWait = false, audioFail = false;
  let releaseModel, releaseAudio, modelSignal, audioSignal;
  const audioTexts = [];
  const voice = { id: 'coherent-fixture', engine: 'gpt-sovits', name: 'Fixture only', localService: true, emotions: ['neutral'], source: 'fixture', license: 'fixture' };
  const context = await createApp({ dev: true, dataDir: directory,
    credentials: { resolve: async config => config, status: async () => ({ saved: false }) },
    windowsSpeechImpl: { voices: async () => [], synthesize: async () => { throw Error('Native audio prohibited'); } },
    localTtsImpl: { status: async () => ({ ready: true, voices: [voice], active: false, pending: 0 }), synthesize: async ({ text, signal }) => {
      audioCalls++; audioTexts.push(text); audioSignal = signal;
      if (audioWait) await new Promise(r => { releaseAudio = r; }); // intentionally ignore abort
      if (audioFail) throw Error('fixture TTS failure');
      return Buffer.from(text); // decoder double below records segment identity
    } },
    fetchImpl: async (_url, options) => {
      modelCalls++; modelSignal = options.signal;
      expect(JSON.parse(options.body).stream).toBe(false);
      if (modelWait) await new Promise(r => { releaseModel = r; });
      return Response.json({ choices: [{ message: { content: JSON.stringify({ text, emotion: 'neutral' }) } }], usage: { prompt_tokens: 40, completion_tokens: 20 } });
    },
  });
  context.budget.now = () => Date.parse(PRICING.verifiedAt) + 1000;
  await new Promise(r => context.app.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${context.app.address().port}`;
  await page.route('**/character-assets/**', route => route.abort());
  await page.addInitScript(() => {
    window.__turnAudio = { starts: [], active: 0, maxActive: 0, current: null };
    window.AudioContext = class {
      destination = {};
      async resume() {}
      async decodeAudioData(data) { return { text: new TextDecoder().decode(data) }; }
      createAnalyser() { return { fftSize: 256, connect() {}, getByteTimeDomainData(bytes) { bytes.fill(128); } }; }
      createBufferSource() {
        let active = false;
        const source = { connect() {}, disconnect() {},
          start() { active = true; const state = window.__turnAudio; state.starts.push(this.buffer.text); state.active++; state.maxActive = Math.max(state.maxActive, state.active); state.current = this; },
          stop() { this.finish(); },
          finish() { if (!active) return; active = false; window.__turnAudio.active--; this.onended?.(); },
        };
        return source;
      }
    };
  });
  const send = async value => { await page.locator('#chat-input').fill(value); await page.locator('#send').click(); };
  const starts = () => page.evaluate(() => window.__turnAudio.starts.length);
  const phase = value => expect(page.locator('#speech-state')).toHaveAttribute('data-phase', value);
  try {
    await page.goto(url);
    await page.locator('#chat-settings').click(); await page.locator('#suggest-deepseek').click();
    await page.locator('#api-key').fill('fake-coherent-fixture-key');
    await page.locator('#voice-select').selectOption('neural:coherent-fixture');
    await page.locator('#settings .close-button').click(); await page.locator('#enable-real-chat').click();
    await send('顺序演出fixture');
    await expect.poll(starts).toBe(1); await phase('speaking');
    expect(await page.evaluate(() => window.__turnAudio.starts[0])).toBe('第一句。');
    for (let count = 2; count <= 3; count++) {
      await page.evaluate(() => window.__turnAudio.current.finish()); await expect.poll(starts).toBe(count);
    }
    await page.evaluate(() => window.__turnAudio.current.finish()); await phase('idle');
    expect((await page.evaluate(() => window.__turnAudio.starts)).join('')).toBe(text);
    expect(await page.evaluate(() => window.__turnAudio.maxActive)).toBe(1);
    expect(modelCalls).toBe(1); expect(audioCalls).toBe(3); expect(audioTexts.join('')).toBe(text);

    audioWait = true; const beforeAudio = audioCalls;
    await send('取消准备fixture'); await expect.poll(() => audioCalls).toBeGreaterThan(beforeAudio); await phase('preparing');
    await page.locator('#enable-real-chat').click(); await expect.poll(() => audioSignal.aborted).toBe(true);
    releaseAudio(); await phase('idle'); await expect(page.locator('#send')).toBeEnabled();
    expect(await starts()).toBe(3);

    audioWait = false; audioFail = true; await page.locator('#enable-real-chat').click();
    await send('失败恢复fixture'); await phase('error'); expect(await starts()).toBe(3);
    audioFail = false; await send('恢复fixture'); await expect.poll(starts).toBe(4);
    await page.locator('#stop-speech').click(); await phase('idle');
    const stableHistory = context.store.history(100).length;

    modelWait = true; const beforeModel = modelCalls;
    await send('取消生成fixture'); await expect.poll(() => modelCalls).toBe(beforeModel + 1); await phase('thinking');
    await page.locator('#cancel-chat').click(); await expect.poll(() => modelSignal.aborted).toBe(true);
    releaseModel(); await expect.poll(() => context.budget.status().records.at(-1).status).toBe('completed');
    await phase('idle'); expect(context.store.history(100)).toHaveLength(stableHistory); expect(await starts()).toBe(4);
  } finally {
    releaseModel?.(); releaseAudio?.(); await context.close();
    expect(resolve(directory).startsWith(resolve(tmpdir()) + sep)).toBe(true); await rm(directory, { recursive: true, force: true });
  }
});
