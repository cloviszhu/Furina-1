import { test, expect } from '@playwright/test';

test('real mature TTS reference expressions, WAV mouth playback and cancel', async ({ page }) => {
  test.setTimeout(90000);
  const status = await (await page.request.get('/api/status')).json();
  test.skip(!status.localTts?.ready, 'Mature local TTS not running; this is not an audio pass.');
  const voice = status.localTts.voices[0];
  const failures = []; page.on('pageerror', error => failures.push(error.message));
  await page.goto('/');
  await expect(page.locator('#model-state')).toContainText('模型已就绪', { timeout: 30000 });
  await page.locator('#open-settings').click();
  await page.locator('#voice-select').selectOption(`neural:${voice.id}`);
  await expect(page.locator('#voice-details')).toContainText('角色相似度待验收');
  await expect(page.locator('#voice-emotion')).toBeEnabled();
  const emotion = voice.emotions.includes('happy') ? 'happy' : 'neutral';
  await page.locator('#voice-emotion').selectOption(emotion);
  const request = page.waitForRequest(req => req.url().endsWith('/api/speech') && req.method() === 'POST');
  await page.locator('#voice-test').click();
  const sent = (await request).postDataJSON(); expect(sent.emotion).toBe(emotion); expect(sent.text).not.toContain('[');
  await page.locator('.close-button').click();
  await expect(page.locator('#speech-state')).toContainText('正在发声', { timeout: 45000 });
  await expect.poll(() => page.evaluate(() => window.__exoStage.mouth)).toBeGreaterThan(.02);
  await page.locator('#stop-speech').click();
  await expect.poll(() => page.evaluate(() => window.__exoStage.mouth)).toBe(0);
  await expect(page.locator('#speech-state')).toContainText('已停止');
  // Cancel during generation, then immediately enqueue a replacement.
  await page.locator('#open-settings').click();
  await page.locator('#voice-test').click();
  await expect(page.locator('#speech-state')).toContainText('正在生成');
  await page.locator('.close-button').click(); await page.locator('#stop-speech').click();
  await expect(page.locator('#speech-state')).toContainText('已停止');
  await page.locator('#open-settings').click(); await page.locator('#voice-test').click(); await page.locator('.close-button').click();
  await expect(page.locator('#speech-state')).toContainText('语音结束', { timeout: 45000 });
  await expect.poll(() => page.evaluate(() => window.__exoStage.mouth)).toBe(0);
  expect(failures).toEqual([]);
});
