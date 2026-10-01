import { test, expect } from '@playwright/test';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './isolated-app.js';

test('actual PMX gesture remains continuous, refuses interruption, returns to rest and deforms mesh', async ({ page }) => {
  const directory = await mkdtemp(join(tmpdir(), 'exo-motion-browser-'));
  const app = await createApp({ dataDir: directory, fetchImpl: async () => { throw Error('No external calls'); } });
  await new Promise(r => app.app.listen(0, '127.0.0.1', r));
  try {
    await page.goto(`http://127.0.0.1:${app.app.address().port}`);
    await page.waitForFunction(() => window.__exoStage?.mesh, { timeout: 30000 });
    const evidence = await page.evaluate(() => {
      const s = window.__exoStage; s.renderer.setAnimationLoop(null); s.smoothed.clear(); s.action = null;
      const origin = performance.now(); s.start = origin - 6000; s.lastTick = origin - 1000 / 60;
      s.tick(origin);
      const initial = s.bones['右ひじ'].quaternion.clone();
      const restWrist = s.bones['右手首'].getWorldPosition(s.camera.position.clone());
      const vector = s.camera.position.clone(), mesh = s.mesh;
      mesh.skeleton.update(); const restVertices = [];
      for (let i = 0; i < mesh.geometry.attributes.position.count; i += 300) { mesh.getVertexPosition(i, vector); restVertices.push(...vector.toArray()); }
      s.trigger('greet'); s.action.start = origin;
      let maxAngleStep = 0, maxWristStep = 0, maxWristTravel = 0, peakVertexDelta = 0;
      let previous = initial.clone(), previousWrist = restWrist.clone(), refused = false;
      const trajectory = [];
      for (let i = 1; i <= 240; i++) {
        if (i === 30) refused = s.trigger('nod') === false && s.action.name === 'greet';
        s.tick(origin + i * 1000 / 60);
        const q = s.bones['右ひじ'].quaternion, wrist = s.bones['右手首'].getWorldPosition(vector);
        maxAngleStep = Math.max(maxAngleStep, q.angleTo(previous)); maxWristStep = Math.max(maxWristStep, wrist.distanceTo(previousWrist));
        maxWristTravel = Math.max(maxWristTravel, wrist.distanceTo(restWrist));
        trajectory.push({ seconds: i / 60, elbow: q.toArray(), wrist: wrist.toArray() }); previous.copy(q); previousWrist.copy(wrist);
        if (i === 75) {
          mesh.skeleton.update(); let j = 0;
          for (let index = 0; index < mesh.geometry.attributes.position.count; index += 300) {
            mesh.getVertexPosition(index, vector);
            for (const value of vector.toArray()) peakVertexDelta = Math.max(peakVertexDelta, Math.abs(value - restVertices[j++]));
          }
        }
      }
      const returned = s.bones['右ひじ'].quaternion.clone();
      const initialPoseDifference = returned.angleTo(initial);
      // Automatic idle is now a moving clip. Compare against its target at
      // this same time/clip phase, not the obsolete fixed starting posture.
      s.smoothed.clear(); s.tick(origin + 4000);
      const returnAngle = returned.angleTo(s.bones['右ひじ'].quaternion);
      s.setExpression('happy'); s.tick(origin + 4017);
      for (let i = 1; i < 60; i++) s.tick(origin + 4017 + i * 1000 / 60);
      const index = mesh.morphTargetDictionary['にこり'], smileBefore = mesh.morphTargetInfluences[index];
      s.setExpression('neutral'); s.tick(origin + 5017); const smileAfter = mesh.morphTargetInfluences[index];
      return { maxAngleStep, maxWristStep, maxWristTravel, peakVertexDelta, returnAngle, initialPoseDifference, refused,
        finished: s.action === null, smileBefore, smileAfter, trajectory };
    });
    expect(evidence.refused).toBe(true); expect(evidence.finished).toBe(true);
    expect(evidence.maxAngleStep).toBeLessThan(.1); expect(evidence.maxWristStep).toBeLessThan(.35);
    expect(evidence.maxWristTravel).toBeGreaterThan(2); expect(evidence.peakVertexDelta).toBeGreaterThan(.5);
    expect(evidence.returnAngle).toBeLessThan(.03);
    expect(evidence.smileAfter).toBeGreaterThan(.1); expect(evidence.smileAfter).toBeLessThan(evidence.smileBefore);
    await mkdir('artifacts/motion-review', { recursive: true });
    await writeFile('artifacts/motion-review/continuity.json', JSON.stringify(evidence, null, 2));
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
