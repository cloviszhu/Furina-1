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

test('real audio follows changed voice/expression/speed and next reply; failure has explicit fallback label', async ({ page }) => {
  test.setTimeout(90000);
  const status = await (await page.request.get('/api/status')).json();
  test.skip(!status.localTts?.ready, 'Local TTS unavailable; not an audio pass.');
  const voice = status.localTts.voices[0];
  await page.goto('/'); await expect(page.locator('#model-state')).toContainText('模型已就绪', { timeout: 30000 });
  await page.locator('#open-settings').click(); await page.locator('#voice-select').selectOption(`neural:${voice.id}`);
  const started = page.waitForRequest(r => r.url().endsWith('/api/speech') && r.method() === 'POST');
  await page.locator('#voice-test').click(); await started;
  await page.locator('#voice-emotion').selectOption('sad');
  await expect(page.locator('#speech-state')).toContainText('已停止');
  await expect.poll(() => page.evaluate(() => window.__exoStage.mouth)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__exoStage.expression)).toBe('sad');
  await page.locator('#voice-speed').fill('1.1'); await page.locator('#voice-speed').dispatchEvent('change');
  // Inject a delayed protocol fixture for the text turn only. Audio remains
  // actual GPT-SoVITS, and no external model or credential is involved.
  let deliver; const delayed = new Promise(r => { deliver = r; });
  await page.route('**/api/chat', async route => {
    await delayed; await route.fulfill({ json: {
      user: { id: 'qa-user', role: 'user', text: '仅协议替身测试', provider: 'offline' },
      assistant: { id: 'qa-assistant', role: 'assistant', text: '这一幕，先好好休息吧。', provider: 'offline' },
      provider: 'offline', emotion: 'calm', expressionSource: 'model-contract', recalled: [], budget: status.budget,
    } });
  });
  await page.locator('.close-button').click(); await page.locator('#chat-input').fill('仅协议替身测试'); await page.locator('#send').click();
  await page.locator('#open-settings').click(); await page.locator('#voice-emotion').selectOption('happy'); await page.locator('.close-button').click();
  const next = page.waitForRequest(r => r.url().endsWith('/api/speech') && r.method() === 'POST'); deliver();
  const sent = (await next).postDataJSON(); expect(sent.emotion).toBe('happy'); expect(sent.speed).toBe(1.1); expect(sent.referenceId).toBe(voice.id); expect(sent.text).not.toContain('emotion');
  await expect(page.locator('#speech-state')).toContainText('正在发声', { timeout: 45000 });
  await expect.poll(() => page.evaluate(() => window.__exoStage.expression)).toBe('happy');
  await expect.poll(() => page.evaluate(() => window.__exoStage.mesh.morphTargetInfluences[window.__exoStage.mesh.morphTargetDictionary['にこり']])).toBeGreaterThan(.2);
  await page.locator('#stop-speech').click(); await expect.poll(() => page.evaluate(() => window.__exoStage.mouth)).toBe(0);
  await page.locator('#open-settings').click(); await page.locator('#expression-mode').selectOption('reply'); await page.locator('.close-button').click();
  const automatic = page.waitForRequest(r => r.url().endsWith('/api/speech') && r.method() === 'POST');
  await page.locator('#chat-input').fill('表达字段测试'); await page.locator('#send').click();
  expect((await automatic).postDataJSON().emotion).toBe('calm');
  await expect(page.locator('#speech-state')).toContainText('正在发声', { timeout: 45000 }); await page.locator('#stop-speech').click();
  await page.route('**/api/speech', route => route.fulfill({ status: 502, json: { error: '本地 TTS 失败；没有自动切换系统声。' } }));
  await page.locator('#open-settings').click(); await page.locator('#voice-test').click(); await page.locator('.close-button').click();
  await expect(page.locator('#speech-state')).toContainText('没有自动切换系统声'); await expect(page.locator('#speech-state')).toContainText('显式选择系统备用声');
  await expect.poll(() => page.evaluate(() => window.__exoStage.mouth)).toBe(0);
  await page.unroute('**/api/speech');
  await page.locator('#open-settings').click();
  const windows = await page.locator('#voice-select option').evaluateAll(nodes => nodes.filter(n => n.value.startsWith('windows:')).map(n => n.value));
  if (windows.length) { await page.locator('#voice-select').selectOption(windows[0]); await expect(page.locator('#voice-details')).toContainText('系统临时备用'); await expect(page.locator('#voice-emotion')).toBeDisabled(); }
});
