import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

test('adapter-only automatic memory cards expose sources, correction, confirmation, failure and safe text', async ({ page }, testInfo) => {
  const server = createServer(async (request, response) => {
    if (request.url === '/controls.js' || request.url === '/style.css') {
      response.setHeader('Content-Type', request.url.endsWith('.css') ? 'text/css' : 'text/javascript');
      response.end(await readFile(new URL(request.url === '/controls.js' ? '../../src/natural-memory-controls.js' : '../../src/style.css', import.meta.url))); return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(`<meta charset="UTF-8"><link rel="stylesheet" href="/style.css"><main style="display:block;padding:32px;max-width:760px"><section id="controls"></section></main><script type="module">
      import {NaturalMemoryControls,mountNaturalMemoryControls} from '/controls.js';
      window.operations=[];let rows=[{key:'fixture',text:'周末一起看了演出。',updatedLabel:'自动整理',evidence:[{label:'用户交谈',text:'<img src=x onerror=alert(1)> fixture source'}]}];
      window.controls=new NaturalMemoryControls({adapter:{list:async()=>rows,
        revise:async(key,text)=>{operations.push('revise');if(window.failRevision)throw Error('保存失败，请重试。');rows=[{...rows[0],text}];},
        remove:async()=>{operations.push('remove');await new Promise(r=>window.releaseDelete=r);rows=[];}}});
      mountNaturalMemoryControls(document.querySelector('#controls'),controls);await controls.load();
    </script>`);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await expect(page.locator('.memory-card')).toContainText('周末一起看了演出。');
    await page.getByText('查看来源', { exact: true }).click(); await expect(page.locator('details')).toContainText('<img src=x onerror=alert(1)> fixture source');
    await expect(page.locator('img')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('memory-controls.png') });
    await page.getByRole('button', { name: '纠正', exact: true }).click(); await page.getByLabel('纠正这条记忆').fill('其实是周日的演出。');
    expect(await page.evaluate(() => operations)).toEqual([]);
    await page.evaluate(() => { window.failRevision=true; }); await page.getByRole('button', { name: '保存纠正' }).click();
    await expect(page.getByRole('alert')).toContainText('保存失败'); await expect(page.getByLabel('纠正这条记忆')).toHaveValue('其实是周日的演出。');
    await page.evaluate(() => { window.failRevision=false; }); await page.getByRole('button', { name: '保存纠正' }).click();
    await expect(page.locator('.memory-card')).toContainText('其实是周日的演出。');
    await page.getByRole('button', { name: '删除', exact: true }).click(); await page.getByRole('button', { name: '取消', exact: true }).click();
    expect(await page.evaluate(() => operations)).toEqual(['revise', 'revise']);
    await page.getByRole('button', { name: '删除', exact: true }).click(); await page.getByRole('button', { name: '确认删除' }).click();
    await expect(page.getByRole('button', { name: '正在删除…' })).toBeDisabled(); await expect(page.locator('.memory-card')).toHaveCount(1);
    await page.evaluate(() => releaseDelete()); await expect(page.locator('.memory-card')).toHaveCount(0); await expect(page.locator('#controls')).toContainText('还没有自动整理的共同经历');
  } finally { await new Promise(r => server.close(r)); }
});
