// Read-only PMX/UI inspection. Screenshots stay in ignored private artifacts/.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const destination = new URL('../artifacts/final-acceptance/', import.meta.url);
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const result = { time: new Date().toISOString(), errors: [], failedAssets: [], models: [], screenshots: [], overflow: [] };
page.on('pageerror', e => result.errors.push(e.message));
page.on('response', r => { if (r.url().includes('/character-assets/') && !r.ok()) result.failedAssets.push(r.url()); });
const shot = async name => { await page.screenshot({ path: fileURLToPath(new URL(name, destination)), fullPage: true }); result.screenshots.push(name); };
try {
  await page.goto('http://127.0.0.1:3000');
  await page.waitForFunction(() => window.__exoStage?.mesh);
  await page.locator('#auto-speak').uncheck();
  const status = await (await page.request.get('http://127.0.0.1:3000/api/status')).json();
  for (let i = 0; i < status.models.length; i++) {
    const model = status.models[i];
    await page.locator('#model-select').selectOption(model.url);
    await page.waitForFunction(name => document.getElementById('model-select').selectedOptions[0].textContent === name.replace('.pmx', '') && document.getElementById('model-state').textContent.includes('模型已就绪'), model.name);
    await page.waitForTimeout(800);
    const metrics = await page.evaluate(() => {
      const s = window.__exoStage, mesh = s.mesh;
      return { bones: mesh.skeleton.bones.length, vertices: mesh.geometry.attributes.position.count, height: s.height,
        materials: mesh.material.length, morphs: Object.keys(mesh.morphTargetDictionary), triangles: mesh.geometry.index.count / 3 };
    });
    assert(metrics.bones > 380 && metrics.vertices > 29000 && metrics.height > 10);
    result.models.push({ name: model.name, ...metrics });
    await shot(`model-${i + 1}-desktop-idle.png`);
    await page.locator('#greet').click(); await page.waitForTimeout(650); await shot(`model-${i + 1}-greet.png`);
    await page.waitForTimeout(2600); await page.locator('#nod').click(); await page.waitForTimeout(350); await shot(`model-${i + 1}-nod.png`);
    await page.waitForTimeout(2700);
    for (const emotion of ['happy', 'sad', 'angry', 'calm', 'surprised']) {
      await page.evaluate(e => window.__exoStage.setExpression(e), emotion);
      await page.waitForTimeout(180); await shot(`model-${i + 1}-${emotion}.png`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(`model-${i + 1}-mobile.png`);
    result.overflow.push(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.evaluate(() => window.__exoStage.setExpression('neutral'));
    const face = async emotion => {
      await page.evaluate(e => { const s = window.__exoStage; s.controls.target.set(0, s.height * .79, 0); s.camera.position.set(0, s.height * .79, s.height * .65); s.setExpression(e); s.controls.update(); }, emotion);
      await page.waitForTimeout(250); await shot(`model-${i + 1}-face-${emotion}.png`);
      return await page.evaluate(() => {
        const mesh = window.__exoStage.mesh;
        return Object.fromEntries(Object.entries(mesh.morphTargetDictionary).filter(([, index]) => mesh.morphTargetInfluences[index] > .01).map(([name, index]) => [name, mesh.morphTargetInfluences[index]]));
      });
    };
    result.models[i].expressions = {};
    for (const emotion of ['neutral', 'happy', 'sad', 'angry', 'surprised', 'calm']) result.models[i].expressions[emotion] = await face(emotion);
    await page.evaluate(() => { window.__exoStage.resetCamera(); window.__exoStage.setExpression('neutral'); });
  }
  await page.locator('#open-settings').click();
  result.credentialsEmpty = (await page.locator('#api-key').inputValue()) === '' && (await page.locator('#model-name').inputValue()) === '';
  result.notes = { voice: await page.locator('#voice-details').textContent(), provider: await page.locator('#provider-note').textContent() };
  await shot('settings-desktop.png'); await page.setViewportSize({ width: 390, height: 844 }); await shot('settings-mobile.png');
  result.overflow.push(await page.locator('#settings').evaluate(e => e.scrollWidth > e.clientWidth));
  assert.deepEqual(result.errors, []); assert.deepEqual(result.failedAssets, []); assert(!result.overflow.some(Boolean)); assert(result.credentialsEmpty);
  await writeFile(new URL('visual.json', destination), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, models: result.models.map(({ morphs, ...m }) => ({ ...m, morphCount: morphs.length })) }));
} finally { await browser.close(); }
