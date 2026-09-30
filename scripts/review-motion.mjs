// Isolated, offline PMX visual review. Never attach to the user's browser.
import { chromium } from '@playwright/test';
import { createApp } from '../server/index.js';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const label = process.argv[2] || 'after';
const baseline = process.argv.includes('--baseline');
const directory = await mkdtemp(join(tmpdir(), 'exo-motion-'));
const output = `artifacts/motion-review/${label}`;
await mkdir(output, { recursive: true });
if (baseline) await writeFile('artifacts/motion-review/baseline-stage.js', execFileSync('git', ['show', '95e16c8:src/stage.js']));
const app = await createApp({ dataDir: directory, dev: baseline, fetchImpl: async () => { throw new Error('No network in motion review'); } });
await new Promise(r => app.app.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  args: ['--enable-webgl', '--use-angle=swiftshader', '--mute-audio'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
try {
  await page.goto(`http://127.0.0.1:${app.app.address().port}`);
  await page.waitForFunction(() => window.__exoStage?.mesh, { timeout: 60000 });
  if (baseline) await page.evaluate(async () => {
    window.__exoStage.renderer.setAnimationLoop(null);
    const { CharacterStage } = await import('/artifacts/motion-review/baseline-stage.js');
    const element = document.getElementById('viewport');
    element.querySelector('canvas').remove();
    const stage = new CharacterStage(element, () => {});
    await stage.load(document.getElementById('model-select').value);
  });
  await page.evaluate(() => window.__exoStage.renderer.setAnimationLoop(null));
  const rig = await page.evaluate(() => {
    const s = window.__exoStage;
    return { bones: s.mesh.skeleton.bones.map(b => ({ name: b.name, parent: b.parent?.name, position: b.position.toArray() })),
      morphs: Object.keys(s.mesh.morphTargetDictionary), grants: s.mesh.geometry.userData.MMD.grants };
  });
  await writeFile(`${output}/rig.json`, JSON.stringify(rig, null, 2));
  const samples = [], trajectory = [];
  for (const action of ['idle', 'greet', 'nod', 'listening', 'speaking']) {
    await page.evaluate(action => {
      const s = window.__exoStage;
      s.action = null; s.smoothed?.clear(); s.lastVoiceAt = -Infinity; s.mouth = 0; s.setMode?.(action === 'listening' || action === 'speaking' ? action : 'idle');
      if (action === 'greet' || action === 'nod') s.trigger(action);
    }, action);
    for (let frame = 0; frame <= 240; frame++) {
      const elapsed = frame / 60;
      const sample = await page.evaluate(({ action, elapsed, frame }) => {
        const s = window.__exoStage, now = performance.now();
        s.start = now - (6 + elapsed) * 1000; s.lastTick = now - 1000 / 60;
        s.motionMode = action === 'listening' || action === 'speaking' ? action : 'idle'; s.modeStartedAt = now - elapsed * 1000;
        if (s.action) s.action.start = now - elapsed * 1000;
        s.mouth = action === 'speaking' ? .25 + .2 * Math.sin(elapsed * 12) : 0;
        // The baseline tick reads performance.now internally; give both versions
        // the same deterministic clock, rather than measuring scheduling jitter.
        const readNow = performance.now.bind(performance); performance.now = () => now;
        try { s.tick(now); } finally { performance.now = readNow; }
        const positions = Object.fromEntries(['右腕', '右ひじ', '右手首', '頭'].map(name => [name, s.bones[name].getWorldPosition(s.camera.position.clone()).toArray()]));
        const bonePose = Object.fromEntries(meshBones(s).map(b => [b.name, b.quaternion.toArray()]));
        function meshBones(stage) { return stage.mesh.skeleton.bones.filter(b => /^(頭|首|上半身2?|両目|[左右](肩|腕|ひじ|手首))$/.test(b.name)); }
        if (![0, 30, 60, 90, 120, 180, 240].includes(frame)) return { trajectory: { action, elapsed, positions, bones: bonePose } };
        const mesh = s.mesh; mesh.skeleton.update(); const vector = mesh.skeleton.bones[0].position.clone();
        const vertices = [];
        for (let i = 0; i < mesh.geometry.attributes.position.count; i += 300) { mesh.getVertexPosition(i, vector); vertices.push(...vector.toArray()); }
        return { action, elapsed, bones: bonePose, vertices, trajectory: { action, elapsed, positions, bones: bonePose } };
      }, { action, elapsed, frame });
      if (sample) {
        trajectory.push(sample.trajectory); delete sample.trajectory;
        if (!sample.vertices) continue;
        samples.push(sample);
        if ([0, 60, 120, 240].includes(frame)) await page.locator('#viewport').screenshot({ path: `${output}/${action}-${elapsed}.png` });
      }
    }
  }
  await writeFile(`${output}/samples.json`, JSON.stringify(samples));
  await writeFile(`${output}/trajectory.json`, JSON.stringify(trajectory));
  console.log(JSON.stringify({ output, frames: samples.length, bones: rig.bones.length }));
} finally {
  await browser.close(); await app.close();
  await rm(directory, { recursive: true, force: true });
}
