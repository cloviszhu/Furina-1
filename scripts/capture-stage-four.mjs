// Visual evidence remains local. Reference preview is an in-memory synthesized
// tone in an isolated data directory, never a user's or character's recording.
import { chromium } from '@playwright/test';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/index.js';
const output = new URL('../artifacts/stage-four/', import.meta.url); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const evidence = { date: new Date().toISOString(), errors: [], screenshots: [], referenceFixture: 'Generated 440Hz tone, not speech. Preview only in isolated temp data; no registration or model inference.' };
page.on('pageerror', error => evidence.errors.push(error.message));
const shot = async name => { await page.screenshot({ path: fileURLToPath(new URL(name, output)), fullPage: true }); evidence.screenshots.push(name); };
const temp = await mkdtemp(join(tmpdir(), 'exo-stage-four-visual-')); let app;
try {
  await page.goto('http://127.0.0.1:3000'); await page.waitForFunction(() => window.__exoStage?.mesh); await page.locator('#auto-speak').uncheck();
  evidence.status = await (await page.request.get('http://127.0.0.1:3000/api/status')).json();
  await shot('desktop-ready.png'); await page.locator('#open-settings').click(); await shot('settings-ready.png');
  await page.locator('.close-button').click(); await page.setViewportSize({ width: 390, height: 844 }); await shot('mobile-ready.png');
  evidence.mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  app = await createApp({ dataDir: temp }); await new Promise(r => app.app.listen(0, '127.0.0.1', r));
  await page.setViewportSize({ width: 1440, height: 1080 }); await page.goto(`http://127.0.0.1:${app.app.address().port}`); await page.waitForFunction(() => window.__exoStage?.mesh); await page.locator('#open-references').click();
  await shot('reference-entry.png');
  const count = 51200, wav = Buffer.alloc(44 + count * 2); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) wav.writeInt16LE(Math.round(Math.sin(i / 16000 * 440 * Math.PI * 2) * 4000), 44 + i * 2);
  await page.locator('#reference-file').setInputFiles({ name: 'synthetic-qa-tone.wav', mimeType: 'audio/wav', buffer: wav }); await page.locator('#reference-check').click(); await page.waitForFunction(() => document.getElementById('reference-state').textContent.includes('检查通过'));
  await page.waitForFunction(() => document.getElementById('reference-preview').duration > 0);
  evidence.report = await page.locator('#reference-state').textContent(); await page.locator('#reference-tools').scrollIntoViewIfNeeded(); await shot('reference-preview.png');
  await page.locator('#reference-id').fill('qa-tone-not-speech'); await page.locator('#reference-speaker').fill('synthetic-fixture'); await page.locator('#reference-label').fill('合成 QA 音调 · 非人声'); await page.locator('#reference-text').fill('合成测试展示；不是角色录音，不用于推理。');
  await page.locator('#reference-source').fill('本机生成的 440Hz 正弦测试音'); await page.locator('#reference-license').fill('仅用作入口 QA fixture；不登记到主运行数据');
  await page.locator('#reference-confirm').scrollIntoViewIfNeeded(); await shot('reference-confirmation.png');
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#reference-tools').scrollIntoViewIfNeeded(); await shot('reference-mobile.png');
  evidence.referenceMobileOverflow = await page.locator('#settings').evaluate(e => e.scrollWidth > e.clientWidth);
  await page.locator('#reference-discard').scrollIntoViewIfNeeded(); await page.locator('#reference-discard').click(); await shot('reference-discarded-mobile.png');
  await writeFile(new URL('visual-evidence.json', output), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify({ ...evidence, status: { localTts: evidence.status.localTts, models: evidence.status.models, usedCalls: evidence.status.budget.usedCalls } }));
} finally { await browser.close(); await app?.close(); await rm(temp, { recursive: true, force: true }); }
