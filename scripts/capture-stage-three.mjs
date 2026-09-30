// Local-only visual evidence. Uses the existing app/Edge, never model keys.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../artifacts/stage-three/', import.meta.url);
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const evidence = { date: new Date().toISOString(), renderer: 'actual PMX / Edge with SwiftShader', models: [], errors: [], screenshots: [] };
page.on('pageerror', e => evidence.errors.push(e.message));
const shot = async name => { await page.screenshot({ path: fileURLToPath(new URL(name, root)), fullPage: true }); evidence.screenshots.push(name); };
try {
  await page.goto('http://127.0.0.1:3000'); await page.waitForFunction(() => window.__exoStage?.mesh);
  await page.locator('#auto-speak').uncheck();
  for (const [index, name] of ['pneuma', 'ousia'].entries()) {
    const options = await page.locator('#model-select option').evaluateAll(nodes => nodes.map(n => n.value));
    await page.locator('#model-select').selectOption(options[index]);
    await page.waitForFunction(index => window.__exoStage?.mesh?.skeleton.bones.length === (index === 0 ? 425 : 387), index);
    await page.waitForTimeout(700);
    evidence.models.push(await page.evaluate(() => ({ name: document.getElementById('model-select').selectedOptions[0].textContent, bones: window.__exoStage.mesh.skeleton.bones.length, vertices: window.__exoStage.mesh.geometry.attributes.position.count, morphs: Object.keys(window.__exoStage.mesh.morphTargetDictionary).length, state: document.getElementById('model-state').textContent })));
    await shot(`${name}-idle.png`);
    await page.locator('#greet').click(); await page.waitForTimeout(700); await shot(`${name}-greet.png`);
    await page.waitForTimeout(2200);
  }
  await page.locator('#open-settings').click();
  await page.locator('#voice-select').selectOption('neural:ravdess-24-test');
  await shot('settings.png');
  for (const emotion of ['happy', 'sad', 'angry', 'surprised', 'calm']) {
    await page.locator('#voice-emotion').selectOption(emotion); await page.locator('.close-button').click();
    await page.waitForTimeout(400); await shot(`expression-${emotion}.png`);
    if (['happy', 'sad', 'angry'].includes(emotion)) {
      await page.evaluate(() => { const s = window.__exoStage; s.camera.position.set(0, s.height * .81, s.height * .8); s.controls.target.set(0, s.height * .77, 0); s.controls.update(); });
      await page.waitForTimeout(300); await page.locator('#viewport').screenshot({ path: fileURLToPath(new URL(`portrait-${emotion}.png`, root)) });
      evidence.screenshots.push(`portrait-${emotion}.png`); await page.locator('#reset-camera').click();
    }
    await page.locator('#open-settings').click();
  }
  await page.locator('.close-button').click();
  await page.setViewportSize({ width: 390, height: 844 }); await shot('mobile.png');
  evidence.mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await writeFile(new URL('visual-evidence.json', root), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally { await browser.close(); }
