import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createApp } from '../../server/index.js';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function isolated(options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'exo-browser-'));
  let context = await createApp({ dataDir: directory, ...options });
  const start = async () => { await new Promise(r => context.app.listen(0, '127.0.0.1', r)); return `http://127.0.0.1:${context.app.address().port}`; };
  const url = await start();
  return { url, context, async restart() { await context.close(); context = await createApp({ dataDir: directory, ...options }); return await start(); }, async close() { await context.close(); if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw Error('unsafe cleanup'); await rm(directory, { recursive: true, force: true }); } };
}
async function ready(page, url) {
  await page.goto(url); await expect(page.locator('#model-state')).toContainText('模型已就绪', { timeout: 30000 });
}

test('real browser memory source, conflict, correction, process restart and deletion journey', async ({ page }) => {
  const app = await isolated();
  try {
    await ready(page, app.url); await page.locator('#auto-speak').uncheck();
    await page.locator('#chat-input').fill('我们在枫丹吃了蛋糕。'); await page.locator('#send').click();
    await expect(page.locator('.message.assistant')).toHaveCount(1);
    await page.locator('.message.user button').click();
    await expect(page.locator('#memory-source')).toContainText('用户消息');
    await page.locator('#memory-form button[type=submit]').click();
    await expect(page.locator('.memory-card')).toHaveCount(1);
    await page.locator('[data-tab=chat]').click();
    await page.locator('#chat-input').fill('还记得我们在蒙德吃蛋糕吗？'); await page.locator('#send').click();
    await expect(page.locator('.message.assistant').last()).toContainText('不能确认');
    await expect(page.locator('.message.assistant').last()).not.toContainText('当然');
    await page.locator('.message.user button').last().click();
    await page.locator('.memory-card').getByRole('button', { name: '修改', exact: true }).click();
    await page.locator('.memory-card textarea').fill('我们在枫丹吃了布丁。');
    await page.locator('.memory-card').getByRole('button', { name: '保存修改', exact: true }).click();
    await expect(page.locator('.memory-card')).toContainText('第 2 版');
    await expect(page.locator('#memory-text')).toHaveValue('');
    await expect(page.locator('#memory-source')).toContainText('手动记录');
    const restarted = await app.restart(); await ready(page, restarted);
    await page.locator('#auto-speak').uncheck(); await page.locator('[data-tab=memory]').click();
    await expect(page.locator('.memory-card')).toContainText('布丁');
    await page.locator('.memory-card summary').click();
    await expect(page.locator('.memory-card details')).toContainText('布丁');
    await page.locator('[data-tab=chat]').click();
    await page.locator('#chat-input').fill('还记得我们吃布丁吗？'); await page.locator('#send').click();
    await expect(page.locator('.message.assistant').last()).toContainText('布丁');
    await expect(page.locator('.message.assistant').last()).not.toContainText('蛋糕');
    await page.locator('[data-tab=memory]').click(); page.once('dialog', d => d.accept());
    await page.locator('.memory-card').getByRole('button', { name: '删除', exact: true }).click();
    await expect(page.locator('.memory-card')).toHaveCount(0);
    await page.locator('#memory-manual').click(); await page.locator('#memory-text').fill('新的手动记录：我们讨论了歌剧。');
    await page.locator('#memory-form button[type=submit]').click();
    await expect(page.locator('.memory-card')).toContainText('歌剧');
    const rows = await (await page.request.get(restarted + '/api/history')).json(); expect(rows).toEqual([]);
  } finally { await app.close(); }
});

for (const mutation of ['修改', '删除']) test(`browser ${mutation} during delayed local provider suppresses old reply and speech`, async ({ page }) => {
  const entered = deferred(), release = deferred();
  const fixtureVoice = { id: 'qa-only', name: '协议替身 · 非真实音频', engine: 'gpt-sovits', localService: true, emotions: ['neutral'], source: 'injected fixture', license: 'test only' };
  const app = await isolated({ localTtsImpl: { status: async () => ({ ready: true, voices: [fixtureVoice] }), synthesize: async () => { throw Error('old speech must not dispatch'); } },
    fetchImpl: async () => { entered.resolve(); await release.promise; return Response.json({ message: { content: '{"text":"旧蛋糕回流","emotion":"neutral"}' } }); } });
  let speechRequests = 0; page.on('request', r => { if (r.url().endsWith('/api/speech')) speechRequests++; });
  try {
    app.context.store.save('我们在枫丹吃蛋糕。'); await ready(page, app.url);
    await page.locator('#open-settings').click(); await page.locator('#provider').selectOption('ollama'); await page.locator('#model-name').fill('fixture'); await page.locator('.close-button').click();
    await page.locator('#chat-input').fill('还记得蛋糕吗？'); await page.locator('#send').click(); await entered.promise;
    await page.locator('[data-tab=memory]').click();
    if (mutation === '删除') { page.once('dialog', d => d.accept()); await page.locator('.memory-card').getByRole('button', { name: '删除', exact: true }).click(); await expect(page.locator('.memory-card')).toHaveCount(0); }
    else { await page.locator('.memory-card').getByRole('button', { name: '修改', exact: true }).click(); await page.locator('.memory-card textarea').fill('我们吃布丁。'); await page.locator('.memory-card').getByRole('button', { name: '保存修改', exact: true }).click(); await expect(page.locator('.memory-card')).toContainText('布丁'); }
    release.resolve(); await page.locator('[data-tab=chat]').click(); await expect(page.locator('#send')).toBeEnabled();
    await expect(page.locator('.message')).toHaveCount(0); expect(speechRequests).toBe(0);
    expect(app.context.store.history()).toEqual([]); await expect(page.locator('#speech-state')).toContainText('已停止');
  } finally { release.resolve(); await app.close(); }
});

test('provider settings have no implicit calls or credential storage; character histories stay separate', async ({ page }) => {
  const app = await isolated(); let chats = 0;
  page.on('request', r => { if (r.url().endsWith('/api/chat')) chats++; });
  try {
    await ready(page, app.url); await page.locator('#auto-speak').uncheck(); await page.locator('#open-settings').click();
    for (const provider of ['openai', 'glm', 'deepseek', 'claude', 'kimi', 'compatible', 'ollama']) {
      await page.locator('#provider').selectOption(provider); await expect(page.locator('#model-name')).toHaveValue(''); await expect(page.locator('#api-key')).toHaveValue('');
    }
    expect(chats).toBe(0);
    await page.locator('#provider').selectOption('deepseek'); await page.locator('#remote-test').click();
    expect(chats).toBe(0); // Empty input/credential cannot dispatch.
    if (!(await page.locator('#settings').evaluate(e => e.open))) await page.locator('#open-settings').click();
    await page.locator('#api-key').fill('fake-browser-fixture-only');
    const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, cookies: document.cookie }));
    expect(JSON.stringify(storage)).not.toContain('fake-browser-fixture-only');
    await page.reload(); await expect(page.locator('#model-state')).toContainText('模型已就绪');
    await page.locator('#open-settings').click(); await expect(page.locator('#api-key')).toHaveValue(''); await page.locator('.close-button').click();
    await page.locator('#auto-speak').uncheck(); await page.locator('#chat-input').fill('默认日常'); await page.locator('#send').click(); await expect(page.locator('.message')).toHaveCount(2);
    await page.locator('#open-settings').click(); await page.locator('#character-timeline').selectOption('performer'); await page.locator('#character-style').selectOption('quiet'); await page.locator('.close-button').click();
    await expect(page.locator('.message')).toHaveCount(0);
    await page.locator('#chat-input').fill('新的舞台'); await page.locator('#send').click(); await expect(page.locator('.message.assistant')).toContainText('我在听');
    await page.locator('#open-settings').click(); await page.locator('#character-timeline').selectOption('aftermath'); await page.locator('#character-style').selectOption('natural'); await page.locator('.close-button').click();
    await expect(page.locator('.message.user')).toContainText('默认日常'); await expect(page.locator('.message.user')).not.toContainText('新的舞台');
  } finally { await app.close(); }
});

test('missing PMX and voices show repair paths, while service loss keeps draft and explains restart', async ({ page }) => {
  const app = await isolated();
  await page.addInitScript(() => { speechSynthesis.getVoices = () => []; });
  await page.route('**/character-assets/**', r => r.abort());
  await page.route('**/api/voices', r => r.fulfill({ json: { voices: [], localTts: { ready: false, error: '本地 GPT-SoVITS 未运行；请运行 scripts/run-local-tts.py，再刷新声音。' } } }));
  try {
    await page.goto(app.url); await expect(page.locator('#model-state')).toContainText('README');
    await page.locator('#open-settings').click(); await expect(page.locator('#voice-select')).toContainText('未发现本机声音');
    await expect(page.locator('#voice-details')).toContainText('run-local-tts.py'); await page.locator('.close-button').click();
    await page.locator('#auto-speak').uncheck(); await page.locator('#chat-input').fill('缺资产仍能聊天'); await page.locator('#send').click(); await expect(page.locator('.message.assistant')).toHaveCount(1);
    await page.route('**/api/chat', r => r.abort()); await page.locator('#chat-input').fill('保留这份草稿'); await page.locator('#send').click();
    await expect(page.locator('#app-error')).toContainText('npm.cmd start'); await expect(page.locator('#chat-input')).toHaveValue('保留这份草稿'); await expect(page.locator('#send')).toBeEnabled();
  } finally { await app.close(); }
});

test('memory mutation in another tab clears rendered context and source, and resets mouth', async ({ page, context }) => {
  const app = await isolated(); const other = await context.newPage();
  try {
    const source = app.context.store.event('user', '我们一起吃蛋糕。');
    app.context.store.event('assistant', '相关蛋糕记录', { turnId: source.turnId }); app.context.store.save('我们一起吃蛋糕。', source.id);
    await ready(page, app.url); await ready(other, app.url);
    await other.locator('.message.user button').click(); await expect(other.locator('#memory-source')).toContainText('用户消息');
    await other.evaluate(() => { window.__exoStage.mouth = .5; });
    await page.locator('[data-tab=memory]').click(); page.once('dialog', d => d.accept());
    await page.locator('.memory-card').getByRole('button', { name: '删除', exact: true }).click();
    await expect(other.locator('.memory-card')).toHaveCount(0);
    await expect(other.locator('.message')).toHaveCount(0);
    await expect(other.locator('#memory-text')).toHaveValue(''); await expect(other.locator('#memory-source')).toContainText('手动记录');
    await expect(other.locator('#provider-note')).toContainText('另一页面');
    await expect.poll(() => other.evaluate(() => window.__exoStage.mouth)).toBe(0);
    await expect(other.locator('#speech-state')).toContainText('已停止');
  } finally { await other.close(); await app.close(); }
});

test('early visible message remains a valid memory source after ten conversation turns', async ({ page }) => {
  const app = await isolated();
  try {
    await ready(page, app.url); await page.locator('#auto-speak').uncheck();
    for (let i = 0; i < 10; i++) {
      await page.locator('#chat-input').fill(i === 0 ? '第一轮值得保留的来源' : `后续轮次 ${i}`); await page.locator('#send').click();
      await expect(page.locator('.message.assistant')).toHaveCount(i + 1);
    }
    const history = await (await page.request.get(app.url + '/api/history')).json(); expect(history).toHaveLength(16); expect(history.some(e => e.text.includes('第一轮'))).toBe(false);
    await page.locator('.message.user button').first().click();
    await page.locator('#memory-text').fill('我确认的第一轮记录');
    await page.route('**/api/sources/**', route => route.abort());
    await page.locator('#memory-form button[type=submit]').click();
    await expect(page.locator('#app-error')).not.toBeEmpty();
    await expect(page.locator('#memory-text')).toHaveValue('我确认的第一轮记录');
    await expect(page.locator('.memory-card')).toHaveCount(0);
    await page.unroute('**/api/sources/**');
    await page.locator('#memory-form button[type=submit]').click();
    await expect(page.locator('.memory-card')).toContainText('我确认的第一轮记录'); await page.locator('.memory-card summary').click(); await expect(page.locator('.memory-card details')).toContainText('第一轮值得保留的来源');
  } finally { await app.close(); }
});

for (const fenced of [false, true]) test(`unicode-escaped ${fenced ? 'fenced' : 'plain'} JSON fake key leaves no browser reply, SQLite events or speech`, async ({ page }) => {
  const fakeKey = 'fake-qa-key-only'; let speeches = [];
  const encoded = '{"text":"fake-qa-key-\\u006fnly","emotion":"neutral"}';
  const content = fenced ? '```json\n' + encoded + '\n```' : encoded;
  const app = await isolated({
    fetchImpl: async () => Response.json({ message: { content }, usage: { prompt_tokens: 1, completion_tokens: 1, secret: fakeKey } }),
    localTtsImpl: { status: async () => ({ ready: true, voices: [{ id: 'fixture', name: 'Synthetic QA only', engine: 'gpt-sovits', localService: true, emotions: ['neutral'] }] }), synthesize: async input => { speeches.push(input.text); throw Error('fixture no audio'); } },
  });
  try {
    await ready(page, app.url); await page.locator('#open-settings').click(); await page.locator('#provider').selectOption('ollama'); await page.locator('#model-name').fill('fixture'); await page.locator('#api-key').fill(fakeKey); await page.locator('.close-button').click();
    await page.locator('#chat-input').fill('安全测试'); await page.locator('#send').click(); await expect(page.locator('#app-error')).toContainText('安全检查失败');
    await expect(page.locator('.message')).toHaveCount(0);
    await expect(page.locator('#chat-input')).toHaveValue('安全测试');
    expect(JSON.stringify(app.context.store.history(100))).not.toContain(fakeKey);
    expect(JSON.stringify(app.context.store.db.prepare('SELECT text FROM events').all())).not.toContain(fakeKey);
    expect(app.context.store.history(100)).toEqual([]);
    expect(app.context.store.db.prepare('SELECT count(*) AS n FROM events').get().n).toBe(0);
    expect(speeches).toEqual([]);
  } finally { await app.close(); }
});
