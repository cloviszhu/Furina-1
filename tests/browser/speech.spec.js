import { test, expect } from '@playwright/test';

test('real local Windows speech WAV drives mouth, can cancel and resets', async ({ page }) => {
  const response = await page.request.get('/api/voices');
  const voices = (await response.json()).voices;
  const voice = voices.find(v => v.language === '804');
  test.skip(!voice, 'No usable Windows SAPI host in this execution context; not a speech pass.');
  await page.goto('/');
  await expect(page.locator('#model-state')).toContainText('模型已就绪', { timeout: 30000 });
  await page.locator('#open-settings').click();
  await expect(page.locator('#voice-select')).toContainText(voice.name);
  await page.locator('#voice-select').selectOption(`windows:${voice.id}`);
  await page.locator('#voice-test').click();
  await page.locator('.close-button').click();
  await expect(page.locator('#speech-state')).toContainText('正在发声', { timeout: 15000 });
  await expect.poll(() => page.evaluate(() => window.__exoStage.mouth)).toBeGreaterThan(.02);
  await page.locator('#stop-speech').click();
  await expect.poll(() => page.evaluate(() => window.__exoStage.mouth)).toBe(0);
  await expect(page.locator('#speech-state')).toContainText('已停止');
  await page.locator('#open-settings').click(); await page.locator('#voice-test').click(); await page.locator('.close-button').click();
  await expect(page.locator('#speech-state')).toContainText('语音结束', { timeout: 15000 });
  await expect.poll(() => page.evaluate(() => window.__exoStage.mouth)).toBe(0);
});
