import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../server/index.js';
import { WindowsCredentials } from '../../server/credentials.js';

test('second-turn missing JSON stops visibly without neutral success, retry or formal writes', async ({ page }) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'exo-contract-browser-')); let calls = 0;
  const app = await createApp({ dataDir, credentials: new WindowsCredentials({ bridge: async () => ({ ok: true, saved: false }) }),
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body); calls++;
      expect(body.response_format).toEqual({ type: 'json_object' });
      if (calls === 2) expect(JSON.parse(body.messages.find(m => m.role === 'assistant').content)).toEqual({ text: '模拟第一回合', emotion: 'happy' });
      return Response.json({ choices: [{ message: { content: calls === 1 ? '{"text":"模拟第一回合","emotion":"happy"}' : '模拟丢失结构' } }], usage: { prompt_tokens: 20, completion_tokens: 8 } });
    } });
  await new Promise(r => app.app.listen(0, '127.0.0.1', r));
  try {
    await page.goto(`http://127.0.0.1:${app.app.address().port}`);
    await page.locator('#open-settings').click();
    await page.locator('#provider').selectOption('deepseek'); await page.locator('#model-name').fill('deepseek-flash');
    await page.locator('#api-key').fill('fake-contract-fixture'); await page.locator('#batch-start').click();
    await expect(page.locator('#batch-state')).toContainText('已停止');
    const failed = page.locator('#batch-results li').nth(1);
    await expect(failed).toContainText('失败'); await expect(failed).toContainText('JSON 表达契约');
    await expect(failed).toContainText('没有重试'); await expect(failed).not.toContainText('emotion=neutral');
    expect(calls).toBe(2); expect(app.store.history()).toEqual([]); expect(app.store.list()).toEqual([]);
    await page.locator('#batch-report-refresh').click(); await expect(page.locator('#batch-report-list option')).toHaveCount(1);
    await page.locator('#batch-report-read').click(); await expect(page.locator('#batch-report-output')).toHaveValue(/INVALID_EXPRESSION_CONTRACT/);
    const saved = JSON.parse(await page.locator('#batch-report-output').inputValue());
    expect(saved.rows[1]).toMatchObject({ status: 'failed', structured: false, emotion: null, text: '' });
    expect(saved.rows[0].structured).toBe(true); expect(calls).toBe(2);
  } finally { await app.close(); await rm(dataDir, { recursive: true, force: true }); }
});

test('single explicit click runs eighteen multi-turn fixture calls; report isolated from formal chat and safe cancellation', async ({ page }) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'exo-batch-browser-'));
  let calls = 0, block = false;
  const app = await createApp({ dataDir, credentials: new WindowsCredentials({ bridge: async () => ({ ok: true, saved: false }) }), fetchImpl: async (_url, { signal }) => {
    calls++;
    if (block) await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Error('fixture abort')), { once: true }));
    return Response.json({ choices: [{ message: { content: '{"text":"本地模拟回答，非真实 API 验收","emotion":"calm"}' } }], usage: { prompt_tokens: 30, completion_tokens: 12 } });
  } });
  await new Promise(r => app.app.listen(0, '127.0.0.1', r));
  try {
    await page.goto(`http://127.0.0.1:${app.app.address().port}`);
    await page.locator('#open-settings').click();
    await expect(page.locator('#batch-results li')).toHaveCount(18);
    await page.locator('#batch-start').click();
    await expect(page.locator('#batch-state')).toContainText('未产生调用'); expect(calls).toBe(0);
    await page.locator('#provider').selectOption('deepseek');
    await page.locator('#model-name').fill('deepseek-flash');
    // Fake key in this fresh isolated browser. Never read any user's password field.
    await page.locator('#api-key').fill('fake-qa-key-only');
    await page.locator('#batch-start').click();
    await expect(page.locator('#batch-state')).toContainText('六组三轮测试结束');
    expect(calls).toBe(18); await expect(page.locator('#batch-results li')).toHaveCount(18);
    await expect(page.locator('#batch-results')).toContainText('30/12');
    await expect(page.locator('#batch-results')).not.toContainText('fake-qa-key-only');
    expect(app.store.history()).toEqual([]); expect(app.store.list()).toEqual([]);
    await page.locator('#batch-report-refresh').click();
    await expect(page.locator('#batch-report-list option')).toHaveCount(1);
    await page.locator('#batch-report-read').click();
    await expect(page.locator('#batch-report-output')).toHaveValue(/"state": "completed"/);
    const saved = JSON.parse(await page.locator('#batch-report-output').inputValue());
    expect(saved.rows).toHaveLength(18); expect(saved.rows[0].structured).toBe(true);
    expect(JSON.stringify(saved)).not.toContain('fake-qa-key-only');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#batch-report-export').click();
    const download = await downloadPromise; expect(download.suggestedFilename()).toBe(`exo-test-${saved.id}.json`);
    await expect(page.locator('#mode-status')).toContainText('演示');
    await page.screenshot({ path: 'artifacts/motion-review/batch-fixture-report.png' });
    block = true; await page.locator('#batch-start').click();
    await expect.poll(() => calls).toBe(19); await page.locator('#batch-cancel').click();
    await expect(page.locator('#batch-state')).toContainText('已取消');
    await expect.poll(() => app.budget.status().records.at(-1).status).toBe('failed');
    expect(calls).toBe(19); expect(app.store.history()).toEqual([]);
    await page.locator('#batch-start').click();
    await expect.poll(() => calls).toBe(20);
    // Abandon a live request, rather than only reloading an already cancelled run.
    await page.reload();
    await expect.poll(() => app.budget.status().records.at(-1).status).toBe('failed');
    // Reload begins no new run; no credentials survive and no follow-up dispatch.
    await expect(page.locator('#batch-state')).toContainText('尚未启动');
    expect(calls).toBe(20);
  } finally { await app.close(); await rm(dataDir, { recursive: true, force: true }); }
});
