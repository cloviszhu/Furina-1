import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './isolated-app.js';

test('confirmed browser source survives DB reopen and reaches mock request; cancelled deletion, edit and delete preserve boundaries', async ({ page, context }) => {
  test.setTimeout(90000); // Two cold Vite starts and a fresh browser session.
  const dataDir = await mkdtemp(join(tmpdir(), 'exo-persistence-browser-')), bodies = [];
  const fact = '我第一次舞台演出扮演邮差，散场时朋友送我一束向日葵。';
  const query = '还记得我第一次舞台演出扮演谁、收到什么花吗？';
  let app, url;
  const start = async () => {
    app = await createApp({ dataDir, dev: true, fetchImpl: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return Response.json({ choices: [{ message: { content: '{"text":"协议替身，不评价记忆质量。","emotion":"calm"}' } }] });
    } });
    await new Promise(r => app.app.listen(0, '127.0.0.1', r)); url = `http://127.0.0.1:${app.app.address().port}`;
  };
  const setup = async p => {
    await p.route('**/character-assets/**', r => r.abort());
    await p.goto(url); await expect(p.locator('#provider option')).toHaveCount(8);
    await expect(p.locator('#settings-state')).toContainText('普通配置已自动保存');
    await p.locator('#auto-speak').uncheck();
  };
  const mock = async p => {
    await p.locator('#open-settings').click(); await p.locator('#provider').selectOption('deepseek');
    await p.locator('#model-name').fill('deepseek-flash'); await p.locator('#api-key').fill('fixture-only'); await p.locator('.close-button').click(); await p.locator('#enable-real-chat').click();
  };
  const ask = async p => {
    const n = bodies.length;
    await p.locator('[data-tab=chat]').click(); await p.locator('#chat-input').fill(query); await p.locator('#send').click();
    await expect.poll(() => bodies.length).toBe(n + 1); await expect(p.locator('#send')).toBeEnabled();
    return bodies.at(-1);
  };
  const evidence = b => JSON.parse(b.messages[0].content.split('对话依据：')[1]);
  let reopened;
  await start();
  try {
    await setup(page);
    await page.locator('#chat-input').fill(fact); await page.locator('#send').click();
    await expect(page.locator('.message.user')).toHaveCount(1);
    const sourceId = await page.locator('.message.user').getAttribute('data-event-id');
    await page.locator('.message.user button').click(); expect(app.store.list()).toEqual([]);
    await page.locator('#memory-manual').click(); await page.locator('#memory-text').fill('');
    await page.locator('[data-tab=chat]').click(); expect(app.store.list()).toEqual([]); // abandon draft
    await page.locator('.message.user button').click(); await page.locator('#memory-save').click();
    await expect(page.locator('#memory-list .memory-card')).toHaveCount(1);
    expect(app.store.list()[0]).toMatchObject({ sourceId, sourceRole: 'user', text: fact, sourceText: fact });
    const id = app.store.list()[0].id;
    for (let i = 0; i < 9; i++) {
      const r = await page.request.post(url + '/api/chat', { data: { text: `占位日常${i}`, config: { provider: 'offline' } } }); expect(r.ok()).toBe(true);
    }
    await page.close(); await app.close(); await start(); reopened = await context.newPage();
    await setup(reopened); await mock(reopened);
    let body = await ask(reopened);
    expect(body.messages.slice(1, -1).every(m => !m.content.includes('邮差') && !m.content.includes('向日葵'))).toBe(true);
    expect(evidence(body)).toEqual([{ text: fact, source: 'user-statement' }]);
    expect(app.store.list()[0].id).toBe(id);
    await reopened.locator('[data-tab=memory]').click(); reopened.once('dialog', d => d.dismiss());
    await reopened.locator('#memory-list .memory-card').getByRole('button', { name: '删除', exact: true }).click();
    expect(app.store.list()).toHaveLength(1); // cancelled confirmation leaves SQLite intact
    await reopened.locator('#memory-list .memory-card').getByRole('button', { name: '修改', exact: true }).click();
    const changed = '我第一次舞台演出扮演园丁，散场时朋友送我一束白玫瑰。';
    await reopened.locator('.memory-card textarea').fill(changed);
    await reopened.locator('#memory-list .memory-card').getByRole('button', { name: '保存修改', exact: true }).click();
    await expect(reopened.locator('#memory-list .memory-card')).toContainText('第 2 版');
    body = await ask(reopened); expect(evidence(body)).toEqual([{ text: changed, source: 'user-statement' }]);
    expect(JSON.stringify(body)).not.toContain('邮差'); expect(JSON.stringify(body)).not.toContain('向日葵');
    await reopened.locator('[data-tab=memory]').click(); reopened.once('dialog', d => d.accept());
    await reopened.locator('#memory-list .memory-card').getByRole('button', { name: '删除', exact: true }).click();
    await expect(reopened.locator('#memory-list .memory-card')).toHaveCount(0);
    body = await ask(reopened); expect(evidence(body)).toEqual([]);
    for (const word of ['邮差', '向日葵', '园丁', '白玫瑰']) expect(JSON.stringify(body)).not.toContain(word);
    expect(app.budget.status().usedCalls).toBe(3);
  } finally { await reopened?.close(); await app.close(); await rm(dataDir, { recursive: true, force: true }); }
});
