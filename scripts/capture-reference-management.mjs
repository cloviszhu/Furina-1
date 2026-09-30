// Private project-owned UI only; excludes PMX pixels and credential controls.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto('http://127.0.0.1:3000'); await page.locator('#open-references').click();
  await page.waitForFunction(() => document.getElementById('reference-manage-profile').options.length > 0);
  const section = page.locator('section[aria-label="管理已导入声线"]');
  await section.screenshot({ path: 'artifacts/final-acceptance/reference-management-private.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await section.screenshot({ path: 'artifacts/final-acceptance/reference-management-mobile.png' });
  const overflow = await page.locator('#settings').evaluate(e => e.scrollWidth > e.clientWidth);
  const profiles = await (await page.request.get('http://127.0.0.1:3000/api/reference-profiles')).json();
  const deletions = await (await page.request.get('http://127.0.0.1:3000/api/reference-deletions')).json();
  if (overflow || errors.length || profiles.error || deletions.error) throw Error('Reference management visual verification failed');
  const evidence = { time: new Date().toISOString(), errors, mobileOverflow: overflow, managedProfiles: profiles.profiles.filter(p => p.managed).length, recoveryRecords: deletions.deletions.length, screenshotScope: 'Project-owned reference-management section only; no model, source audio, credentials or messages. No registry writes.' };
  await writeFile('artifacts/final-acceptance/reference-management-visual.json', JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence));
} finally { await browser.close(); }
