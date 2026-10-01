import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createApp } from './isolated-app.js';

// Explicit local source opt-in; licensed JSON and user PMX remain untracked.
test('local nod resource uses real app route, UI cancellation and dual rigs without conversation writes', async ({ page }) => {
  test.skip(!process.env.EXO_NOD_SOURCE, 'Requires authorized local nod JSON and PMX fixture setup');
  const source = await readFile('assets/characters/furina/source/mmd/animations/overte-headnod.json');
  expect(createHash('sha256').update(source).digest('hex')).toBe('a8a12d5a11179c101e1c2a09eed8d3c42943133cedd369f96817b89b9b9bc959');
  const directory = await mkdtemp(join(tmpdir(), 'exo-nod-ui-'));
  const app = await createApp({ projectRoot: resolve('.'), dataDir: directory,
    localTtsImpl: { status: async () => ({ available: false, voices: [] }), voices: () => [] },
    fetchImpl: async () => { throw Error('External calls disabled'); } });
  await new Promise(r => app.app.listen(0, '127.0.0.1', r));
  try {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${app.app.address().port}`);
    await page.waitForFunction(() => window.__exoStage?.mesh && window.__exoStage.motionNod.available);
    for (const model of [0, 1]) {
      await page.locator('#model-select').selectOption({ index: model });
      await page.waitForFunction(count => window.__exoStage?.mesh?.skeleton.bones.length === count && window.__exoStage.motionNod.available, [425, 387][model]);
      await page.evaluate(() => window.__exoStage.renderer.setAnimationLoop(null));
      await page.locator('#nod').click();
      expect(await page.evaluate(() => {
        const s = window.__exoStage, now = performance.now(); s.action.start = now;
        for (let i = 0; i <= 36; i++) s.tick(now + i * 1000 / 60);
        return s.action?.name === 'nod' && !s.trigger('greet');
      })).toBe(true);
      await page.locator('#stop-speech').click();
      expect(await page.evaluate(() => window.__exoStage.action === null)).toBe(true);
    }
    // A corrupt local response must keep the actual model ready and old nod usable.
    await page.route('**/character-assets/animations/overte-headnod.json', r => r.fulfill({ body: '{', contentType: 'application/json' }));
    await page.reload();
    await page.waitForFunction(() => window.__exoStage?.mesh);
    expect(await page.evaluate(() => window.__exoStage.motionNod.available)).toBe(false);
    await page.locator('#nod').click();
    expect(await page.evaluate(() => window.__exoStage.action?.name)).toBe('nod');
    await page.locator('#stop-speech').click();
    expect(await page.evaluate(() => window.__exoStage.action === null)).toBe(true);
    expect(errors).toEqual([]); expect(app.budget.status().usedCalls).toBe(0);
    for (const table of ['events', 'memories', 'im_episodes']) expect(app.store.db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n).toBe(0);
  } finally {
    app.app.closeAllConnections(); await app.close(); await rm(directory, { recursive: true, force: true });
  }
});
