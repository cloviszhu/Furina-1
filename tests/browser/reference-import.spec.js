import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../../server/index.js';

function tone(amplitude = 4000) {
  const count = 51200, wav = Buffer.alloc(44 + count * 2); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) wav.writeInt16LE(Math.round(Math.sin(i / 16000 * 440 * 2 * Math.PI) * amplitude), 44 + i * 2); return wav;
}
test('user reference checks, preview consent, same-speaker emotion, switch and restart persistence', async ({ page }) => {
  const directory = await mkdtemp(join(tmpdir(), 'exo-import-browser-'));
  // Protocol fixture only. No models, character recordings or provider keys.
  const options = { dataDir: directory, fetchImpl: async url => url.endsWith('/openapi.json') ? Response.json({ paths: { '/tts': { post: {} } } }) : new Response(tone(), { headers: { 'Content-Type': 'audio/wav' } }) };
  let app = await createApp(options); await new Promise(r => app.app.listen(0, '127.0.0.1', r));
  const address = () => `http://127.0.0.1:${app.app.address().port}`;
  const upload = async amplitude => { await page.locator('#reference-file').setInputFiles({ name: '../../fixture.wav', mimeType: 'audio/wav', buffer: tone(amplitude) }); await page.locator('#reference-check').click(); };
  try {
    await page.goto(address()); await page.locator('#open-references').click();
    await upload(0); await expect(page.locator('#reference-state')).toContainText('静音'); await expect(page.locator('#reference-confirmation')).toBeHidden();
    await upload(4000); await expect(page.locator('#reference-state')).toContainText('尚未登记'); await expect(page.locator('#reference-preview')).toHaveAttribute('src', /\/api\/reference-imports\//);
    const previewUrl = await page.locator('#reference-preview').getAttribute('src'); expect((await page.request.get(address() + previewUrl)).status()).toBe(200);
    await page.locator('#reference-preview').evaluate(audio => audio.play()); await expect.poll(() => page.locator('#reference-preview').evaluate(audio => audio.paused)).toBe(false);
    await page.locator('#voice-select').dispatchEvent('change'); await expect.poll(() => page.locator('#reference-preview').evaluate(audio => audio.paused)).toBe(true);
    await page.locator('#reference-id').fill('qa-user'); await page.locator('#reference-speaker').fill('qa-speaker'); await page.locator('#reference-label').fill('合成 QA fixture · 非人声');
    await page.locator('#reference-source').fill('Test-generated sine'); await page.locator('#reference-license').fill('Test fixture only'); await page.locator('#reference-text').fill('合成测试，不是真实录音。');
    await page.locator('#reference-confirm').click(); await expect(page.locator('#reference-state')).toContainText('确认录音使用权');
    for (const id of ['reference-rights', 'reference-same-speaker', 'reference-listened']) await page.locator('#' + id).check();
    await page.locator('#reference-confirm').click(); await expect(page.locator('#reference-state')).toContainText('已登记 qa-user'); await expect(page.locator('#voice-select')).toHaveValue('neural:qa-user');
    expect((await page.request.get(address() + previewUrl)).status()).toBe(404);
    await upload(4000); await page.locator('#reference-profile').selectOption('qa-user'); await expect(page.locator('#reference-speaker')).toHaveValue('qa-speaker'); await expect(page.locator('#reference-speaker')).toHaveAttribute('readonly', '');
    await page.locator('#reference-emotion').selectOption('happy'); for (const id of ['reference-rights', 'reference-same-speaker', 'reference-listened']) await page.locator('#' + id).check();
    await page.locator('#reference-confirm').click(); await expect(page.locator('#reference-state')).toContainText('qa-user / happy'); await expect(page.locator('#voice-emotion')).toHaveValue('happy');
    await app.close(); app = await createApp(options); await new Promise(r => app.app.listen(0, '127.0.0.1', r)); await page.goto(address()); await page.locator('#open-settings').click();
    await expect(page.locator('#voice-select')).toContainText('合成 QA fixture'); await page.locator('#voice-select').selectOption('neural:qa-user'); await expect(page.locator('#voice-emotion option')).toHaveCount(2);
    await expect(page.locator('#voice-details')).toContainText('用户登记');
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
