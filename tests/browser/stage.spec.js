import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../server/index.js';
test('actual PMX stage, memory interaction, empty credentials and mobile layout', async ({ page }) => {
  // Memory corrections invalidate chat context. Never run that journey on data/.
  const dataDir = await mkdtemp(join(tmpdir(), 'exo-stage-browser-'));
  const app = await createApp({ dataDir });
  await new Promise(r => app.app.listen(0, '127.0.0.1', r));
  try {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${app.app.address().port}`);
  await expect(page.locator('#model-state')).toContainText('模型已就绪', { timeout: 30000 });
  const initial = await page.evaluate(() => ({ bones: window.__exoStage.mesh.skeleton.bones.length,
    dictionary: Object.keys(window.__exoStage.mesh.morphTargetDictionary), vertices: window.__exoStage.mesh.geometry.attributes.position.count }));
  expect(initial.vertices).toBeGreaterThan(29000); expect(initial.bones).toBeGreaterThan(380); expect(initial.dictionary).toContain('あ');
  await page.locator('#auto-speak').uncheck();
  await page.locator('#greet').click(); await page.waitForTimeout(500);
  const greeting = await page.evaluate(() => window.__exoStage.bones['右腕'].quaternion.toArray());
  const greetingVertices = await page.evaluate(() => {
    const mesh=window.__exoStage.mesh; mesh.updateMatrixWorld(true); mesh.skeleton.update();
    const vector=mesh.skeleton.bones[0].position.clone(); const samples=[];
    for(let index=0;index<mesh.geometry.attributes.position.count;index+=300){mesh.getVertexPosition(index,vector);samples.push(...vector.toArray());}
    return samples;
  });
  await page.waitForTimeout(2600);
  const idle = await page.evaluate(() => window.__exoStage.bones['右腕'].quaternion.toArray());
  expect(greeting).not.toEqual(idle);
  const idleVertices = await page.evaluate(() => {
    const mesh=window.__exoStage.mesh; mesh.updateMatrixWorld(true); mesh.skeleton.update();
    const vector=mesh.skeleton.bones[0].position.clone(); const samples=[];
    for(let index=0;index<mesh.geometry.attributes.position.count;index+=300){mesh.getVertexPosition(index,vector);samples.push(...vector.toArray());}
    return samples;
  });
  expect(Math.max(...idleVertices.map((value,index)=>Math.abs(value-greetingVertices[index])))).toBeGreaterThan(.2);
  await page.locator('#nod').click();
  await expect.poll(() => page.evaluate(() => window.__exoStage.action?.name)).toBe('nod');
  await page.locator('#open-settings').click();
  await expect(page.locator('#model-name')).toHaveValue(''); await expect(page.locator('#api-key')).toHaveValue('');
  await page.locator('#provider').selectOption('claude'); await expect(page.locator('#model-name')).toHaveValue('');
  await page.locator('.close-button').click();
  await page.locator('[data-tab="memory"]').click();
  const unique = `浏览器验收 ${Date.now()}：我们一起讨论了布丁。`;
  await page.locator('#memory-text').fill(unique); await page.locator('#memory-form button[type="submit"]').click();
  await expect(page.locator('.memory-card').filter({ hasText: unique })).toHaveCount(1);
  await page.locator('[data-tab="chat"]').click(); await page.locator('#chat-input').fill('还记得我们一起做的事吗？'); await page.locator('#send').click();
  await expect(page.locator('.message.assistant').last()).toContainText(unique);
  await page.screenshot({ path: 'artifacts/stage-desktop.png' });
  await page.locator('[data-tab="memory"]').click();
  page.on('dialog', dialog => dialog.accept());
  await page.locator('.memory-card').filter({ hasText: unique }).getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.locator('.memory-card').filter({ hasText: unique })).toHaveCount(0);
  await page.locator('[data-tab="chat"]').click();
  await page.locator('#model-select').selectOption({ label: '【芙宁娜_荒】' });
  await expect.poll(() => page.evaluate(() => window.__exoStage.mesh.skeleton.bones.length)).toBe(387);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/stage-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  } finally { await app.close(); await rm(dataDir, { recursive: true, force: true }); }
});
