import { test, expect } from '@playwright/test';
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../../server/index.js';
import { ReferenceImports } from '../../server/reference-import.js';
import { LocalTts } from '../../server/local-tts.js';

function tone(amplitude = 4000) {
  const count = 51200, wav = Buffer.alloc(44 + count * 2); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) wav.writeInt16LE(Math.round(Math.sin(i / 16000 * 440 * 2 * Math.PI) * amplitude), 44 + i * 2); return wav;
}

test('explicit webpage deletion/restore, current selection fallback, cross-tab sync and restart preserve original/other speaker', async ({ page, context }) => {
  const directory = await mkdtemp(join(tmpdir(), 'exo-delete-browser-'));
  const seed = new ReferenceImports(directory, new LocalTts(null));
  const metadata = (id, emotion = 'neutral') => ({ profileId: id, speakerId: `speaker-${id}`, label: `Fixture ${id}`, source: 'Generated tone', license: 'Test only', text: 'Synthetic fixture', language: 'en', emotion, usageAllowed: true, previewConfirmed: true, sameSpeakerConfirmed: true });
  for (const [id, emotion] of [['one', 'neutral'], ['one', 'happy'], ['two', 'neutral'], ['builtin', 'neutral']]) await seed.confirm(seed.prepare(tone()).token, metadata(id, emotion));
  const config = JSON.parse(await readFile(join(directory, 'tts-config.json'))); config.profiles.find(p => p.id === 'builtin').managed = false;
  await writeFile(join(directory, 'tts-config.json'), JSON.stringify(config));
  const original = join(directory, 'original-recording.wav'); await writeFile(original, tone());
  const options = { dataDir: directory, fetchImpl: async url => url.endsWith('/openapi.json') ? Response.json({ paths: { '/tts': { post: {} } } }) : new Response(tone(), { headers: { 'Content-Type': 'audio/wav' } }) };
  let app = await createApp(options); await new Promise(r => app.app.listen(0, '127.0.0.1', r));
  const address = () => `http://127.0.0.1:${app.app.address().port}`;
  const other = await context.newPage();
  try {
    for (const tab of [page, other]) { await tab.goto(address()); await tab.locator('#open-references').click(); await tab.locator('#voice-select').selectOption('neural:one'); await tab.locator('#voice-emotion').selectOption('happy'); }
    await expect(page.locator('#reference-manage-profile option')).toHaveCount(2);
    await page.locator('#reference-manage-profile').selectOption('one'); await page.locator('#reference-manage-emotion').selectOption('happy');
    page.once('dialog', d => d.dismiss()); await page.locator('#reference-delete-expression').click();
    await expect(page.locator('#voice-emotion')).toHaveValue('happy');
    expect((await (await page.request.get(address() + '/api/reference-profiles')).json()).profiles.find(p => p.id === 'one').emotions).toContain('happy');
    page.once('dialog', d => d.accept()); await page.locator('#reference-delete-expression').click();
    await expect(page.locator('#reference-management-state')).toContainText('已删除并解绑');
    for (const tab of [page, other]) { await expect(tab.locator('#voice-select')).toHaveValue('neural:one'); await expect(tab.locator('#voice-emotion')).toHaveValue('neutral'); }
    await expect(other.locator('#reference-management-state')).toContainText('另一标签页');
    const speech = await page.request.post(address() + '/api/speech', { data: { backend: 'gpt-sovits', text: 'test', referenceId: 'one', emotion: 'happy' } }); expect(speech.status()).toBe(400);
    page.once('dialog', d => d.accept()); await page.locator('#reference-delete-profile').click();
    await expect(page.locator('#reference-management-state')).toContainText('已删除并解绑');
    for (const tab of [page, other]) await expect(tab.locator('#voice-select')).not.toHaveValue('neural:one');
    const after = (await (await page.request.get(address() + '/api/reference-profiles')).json()).profiles;
    expect(after.map(p => p.id).sort()).toEqual(['builtin', 'two']);
    const protectedResponse = await page.request.delete(address() + '/api/reference-profiles/builtin', { data: { confirmed: true } }); expect(protectedResponse.status()).toBe(403);
    expect(await readFile(original)).toEqual(tone());
    const registry = JSON.parse(await readFile(join(directory, 'tts-config.json')));
    expect(registry.profiles.find(p => p.id === 'two')).toEqual(config.profiles.find(p => p.id === 'two'));
    await other.close(); await app.close(); app = await createApp(options); await new Promise(r => app.app.listen(0, '127.0.0.1', r));
    await page.goto(address()); await page.locator('#open-references').click();
    await expect(page.locator('#voice-select')).not.toContainText('Fixture one'); await expect(page.locator('#reference-deleted option')).toHaveCount(2);
    // Restore whole profile first, then its earlier expression; no overwrite.
    const records = (await (await page.request.get(address() + '/api/reference-deletions')).json()).deletions;
    await page.locator('#reference-deleted').selectOption(records.find(d => !d.emotion).id);
    page.once('dialog', d => d.accept()); await page.locator('#reference-restore').click(); await expect(page.locator('#reference-management-state')).toContainText('已恢复');
    await page.locator('#reference-deleted').selectOption(records.find(d => d.emotion === 'happy').id);
    page.once('dialog', d => d.accept()); await page.locator('#reference-restore').click(); await expect(page.locator('#reference-deleted option')).toHaveText(['暂无删除记录']);
    await expect(page.locator('#reference-delete-profile')).toBeEnabled();
    await page.locator('#voice-select').selectOption('neural:one'); await expect(page.locator('#voice-emotion option')).toHaveCount(2);
    expect(await readFile(original)).toEqual(tone()); expect(await readdir(join(directory, 'tts-reference-trash'))).toEqual([]);
  } finally { await other.close(); await app.close(); await rm(directory, { recursive: true, force: true }); }
});
test('user reference checks, preview consent, same-speaker emotion, cross-tab switch, discard and restart persistence', async ({ page, context }) => {
  const directory = await mkdtemp(join(tmpdir(), 'exo-import-browser-'));
  // Protocol fixture only. No models, character recordings or provider keys.
  const options = { dataDir: directory, fetchImpl: async url => url.endsWith('/openapi.json') ? Response.json({ paths: { '/tts': { post: {} } } }) : new Response(tone(), { headers: { 'Content-Type': 'audio/wav' } }) };
  let app = await createApp(options); await new Promise(r => app.app.listen(0, '127.0.0.1', r));
  const address = () => `http://127.0.0.1:${app.app.address().port}`;
  const other = await context.newPage();
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
    await other.goto(address()); await other.locator('#open-settings').click();
    await expect(other.locator('#voice-emotion option')).toHaveCount(1);
    await upload(4000); await page.locator('#reference-profile').selectOption('qa-user'); await expect(page.locator('#reference-speaker')).toHaveValue('qa-speaker'); await expect(page.locator('#reference-speaker')).toHaveAttribute('readonly', '');
    await page.locator('#reference-emotion').selectOption('happy'); for (const id of ['reference-rights', 'reference-same-speaker', 'reference-listened']) await page.locator('#' + id).check();
    await page.locator('#reference-confirm').click(); await expect(page.locator('#reference-state')).toContainText('qa-user / happy'); await expect(page.locator('#voice-emotion')).toHaveValue('happy');
    await expect(other.locator('#voice-emotion option')).toHaveCount(2);
    await expect(other.locator('#speech-state')).toContainText('已停止');
    await upload(4000);
    await expect(page.locator('#reference-preview')).toHaveAttribute('src', /^\/api\/reference-imports\//);
    const discardUrl = await page.locator('#reference-preview').getAttribute('src');
    expect((await page.request.get(address() + discardUrl)).status()).toBe(200);
    await page.locator('#reference-discard').click();
    await expect(page.locator('#reference-confirmation')).toBeHidden();
    expect((await page.request.get(address() + discardUrl)).status()).toBe(404);
    expect((await (await page.request.get(address() + '/api/reference-profiles')).json()).profiles).toHaveLength(1);
    await other.close();
    await app.close(); app = await createApp(options); await new Promise(r => app.app.listen(0, '127.0.0.1', r)); await page.goto(address()); await page.locator('#open-settings').click();
    await expect(page.locator('#voice-select')).toContainText('合成 QA fixture'); await page.locator('#voice-select').selectOption('neural:qa-user'); await expect(page.locator('#voice-emotion option')).toHaveCount(2);
    await expect(page.locator('#voice-details')).toContainText('用户登记');
  } finally { await other.close(); await app.close(); await rm(directory, { recursive: true, force: true }); }
});
