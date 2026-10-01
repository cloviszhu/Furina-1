// Offline stage-only review: no application server, credentials, TTS or user data.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const assets = process.env.EXO_MOTION_ASSETS;
if (!assets) throw Error('Set EXO_MOTION_ASSETS to the existing read-only mmd directory');
const root = resolve('.'), output = resolve(process.env.EXO_MOTION_OUTPUT || 'artifacts/stage-softening');
await mkdir(output, { recursive: true });
const baseline = execFileSync('git', ['show', `${process.env.EXO_MOTION_BASELINE || '8358e4f'}:src/stage.js`]);
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end(`<style>body{margin:0;background:#132033}#stage{width:900px;height:900px}</style><div id="stage"></div><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script><script type="module">import {CharacterStage} from '/src/${url.searchParams.has('before') ? 'baseline-stage' : 'stage'}.js'; window.reviewStage=new CharacterStage(document.querySelector('#stage'),state=>window.reviewState=state); reviewStage.renderer.setAnimationLoop(null);</script>`);
      return;
    }
    if (url.pathname === '/src/baseline-stage.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(baseline); return; }
    const asset = url.pathname.startsWith('/model/');
    const base = asset ? resolve(assets) : root;
    const path = resolve(base, decodeURIComponent(url.pathname.slice(asset ? 7 : 1)));
    if (!path.startsWith(base + sep) || (!asset && !/^\/(src|node_modules)\//.test(url.pathname))) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args: ['--enable-webgl', '--use-angle=swiftshader', '--mute-audio'] });
const results = [];
try {
  for (const version of ['before', 'after']) for (const model of ['【芙宁娜】.pmx', '【芙宁娜_荒】.pmx']) {
    const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/${version === 'before' ? '?before' : ''}`);
    await page.waitForFunction(() => window.reviewStage);
    await page.evaluate(async model => { await reviewStage.load('/model/' + encodeURIComponent(model)); }, model);
    await page.waitForFunction(() => window.reviewStage.mesh, { timeout: 30000 });
    // MMDLoader resolves the mesh before all texture requests finish.
    await page.waitForLoadState('networkidle');
    const evidence = await page.evaluate(() => {
      const s = reviewStage, origin = performance.now();
      const render = s.renderer.render.bind(s.renderer); s.renderer.render = () => {};
      s.start = origin; s.lastTick = origin - 1000/60;
      const names = ['上半身', '上半身2', '首', '頭', '両目', '右腕', '左腕', '右ひじ', '左ひじ', '右手首', '左手首', '右足首', '左足首'];
      const capture = () => Object.fromEntries(names.filter(n => s.bones[n]).map(n => [n, { q: s.bones[n].quaternion.toArray(), p: s.bones[n].getWorldPosition(s.camera.position.clone()).toArray() }]));
      const idle = [], actions = []; let previous, maxStep = 0;
      for (let i=0; i<=60*180; i++) {
        s.tick(origin+i*1000/60);
        if (i%60===0) idle.push({t:i/60, bones:capture()});
        const q = s.bones['頭'].quaternion;
        if (previous) maxStep = Math.max(maxStep, q.angleTo(previous));
        previous = q.clone();
      }
      s.action = null; let refused = false, maxWristStep = 0, lastWrist;
      for (let run=0; run<2; run++) {
        s.trigger('greet'); s.action.start = origin+(180+run*5)*1000;
        for (let i=0; i<=300; i++) {
          if (i===30) refused ||= !s.trigger('nod') && s.action.name==='greet';
          s.tick(origin+(180+run*5+i/60)*1000);
          const p=s.bones['右手首'].getWorldPosition(s.camera.position.clone());
          if(lastWrist) maxWristStep=Math.max(maxWristStep,p.distanceTo(lastWrist)); lastWrist=p.clone();
          if(i%60===0) actions.push({run,t:i/60,bones:capture()});
        }
      }
      const finished = s.action===null;
      s.trigger('nod'); s.action.start=origin+190000;
      let nodStep=0, lastHead=s.bones['頭'].quaternion.clone();
      for(let i=1;i<=150;i++) {s.tick(origin+190000+i*1000/60); const q=s.bones['頭'].quaternion;nodStep=Math.max(nodStep,q.angleTo(lastHead));lastHead.copy(q);}
      const nodFinished=s.action===null;
      // Existing interruption contract: clearing the action must settle to rest.
      s.trigger('greet'); s.action.start=origin+193000;
      for(let i=1;i<=60;i++) s.tick(origin+193000+i*1000/60);
      s.action=null;
      const cancelStart=s.bones['右ひじ'].quaternion.clone(); let cancelStep=0, previousCancel=cancelStart.clone();
      for(let i=1;i<=120;i++) { s.tick(origin+194000+i*1000/60);const q=s.bones['右ひじ'].quaternion;cancelStep=Math.max(cancelStep,q.angleTo(previousCancel));previousCancel.copy(q); }
      const cancelled=capture();
      s.setMode('listening'); s.tick(origin+196017); s.setMode('speaking'); s.mouth=.5;
      for(let i=1;i<=60;i++) s.tick(origin+196017+i*1000/60);
      const mouth=s.mesh.morphTargetInfluences[s.mesh.morphTargetDictionary['あ']];
      s.setExpression('happy'); for(let i=1;i<=60;i++) s.tick(origin+197017+i*1000/60);
      const smile=s.mesh.morphTargetInfluences[s.mesh.morphTargetDictionary['にこり']];
      s.setExpression('neutral'); s.mouth=0; s.setMode('idle');
      for(let i=1;i<=120;i++) s.tick(origin+198017+i*1000/60);
      s.renderer.render = render; s.renderer.render(s.scene,s.camera);
      return { boneCount:s.mesh.skeleton.bones.length, names:names.filter(n=>s.bones[n]), rig:s.mesh.skeleton.bones.filter(b=>/足|腰|上半身|肩|腕|ひじ/.test(b.name)).map(b=>({name:b.name,parent:b.parent?.name})), idle, actions, maxStep,maxWristStep,cancelStep,nodStep,nodFinished,refused,finished,cancelled,mouth,smile,restored:s.action===null&&s.motionMode==='idle' };
    });
    await page.screenshot({ path: `${output}/${version}-${model.includes('_')?'ousia':'pneuma'}-idle.png` });
    await page.evaluate(() => { const s=reviewStage;s.camera.position.set(s.height*1.5,s.height*.58,s.height*1.5);s.controls.update();s.renderer.render(s.scene,s.camera); });
    await page.screenshot({ path: `${output}/${version}-${model.includes('_')?'ousia':'pneuma'}-idle-side.png` });
    await page.evaluate(() => reviewStage.resetCamera());
    const release = await page.evaluate(() => {
      const s=reviewStage, origin=performance.now();
      const render=s.renderer.render.bind(s.renderer);s.renderer.render=()=>{};
      const results=[];
      for(const cancelAt of [.2,.8,1.4,2.3,3.1]) for(const restart of [false,true]) {
        s.smoothed.clear();s.action=null;s.mouth=0;s.lastVoiceAt=-Infinity;s.setMode('idle');s.setExpression('neutral');
        s.start=origin-6000;s.lastTick=origin-1000/60;s.tick(origin);
        s.action={name:'greet',start:origin};
        for(let i=1;i<=Math.round(cancelAt*60);i++)s.tick(origin+i*1000/60);
        if(s.cancelAction)s.cancelAction();else s.action=null;
        let previous=s.bones['右ひじ'].quaternion.clone(),wrist=s.bones['右手首'].getWorldPosition(s.camera.position.clone());
        let maxAngle=0,maxWrist=0,repeatedRefused=true;
        for(let i=1;i<=300;i++) {
          if(restart&&i===12) {s.trigger('greet');s.action.start=origin+(cancelAt+i/60)*1000;repeatedRefused=!s.trigger('nod');}
          s.tick(origin+(cancelAt+i/60)*1000);
          const q=s.bones['右ひじ'].quaternion,p=s.bones['右手首'].getWorldPosition(s.camera.position.clone());
          maxAngle=Math.max(maxAngle,q.angleTo(previous));maxWrist=Math.max(maxWrist,p.distanceTo(wrist));previous.copy(q);wrist.copy(p);
        }
        const returned=s.bones['右ひじ'].quaternion.clone();s.smoothed.clear();s.tick(origin+(cancelAt+5)*1000);
        results.push({cancelAt,restart,maxAngle,maxWrist,repeatedRefused,finished:s.action===null,returnError:returned.angleTo(s.bones['右ひじ'].quaternion)});
      }
      // A speech stop changes mode/voice targets but must obey the same bound.
      s.smoothed.clear();s.action=null;s.start=origin-6000;s.lastTick=origin-1000/60;s.setMode('speaking');s.mouth=.5;
      for(let i=0;i<60;i++)s.tick(origin+i*1000/60);
      s.setMode('idle');s.mouth=0;s.lastVoiceAt=-Infinity;
      let previous=s.bones['右ひじ'].quaternion.clone(),stopStep=0;
      for(let i=60;i<180;i++){s.tick(origin+i*1000/60);const q=s.bones['右ひじ'].quaternion;stopStep=Math.max(stopStep,q.angleTo(previous));previous.copy(q);}
      s.renderer.render=render;
      return {scenarios:results,stopStep,stopped:s.motionMode==='idle'};
    });
    // Render a raised-arm cancellation sequence rather than only its final rest.
    await page.evaluate(() => {const s=reviewStage,now=performance.now();s.start=now-6000;s.lastTick=now-1000/60;s.action=null;s.smoothed.clear();s.tick(now);s.action={name:'greet',start:now};for(let i=1;i<=84;i++)s.tick(now+i*1000/60);s.action=null;window.releaseClock=now+1400;});
    let lastFrame=0;
    for(const frame of [0,6,18,42,90]) {
      await page.evaluate(({from,to})=>{for(let i=from+1;i<=to;i++)reviewStage.tick(releaseClock+i*1000/60);}, {from:lastFrame,to:frame});
      await page.screenshot({path:`${output}/${version}-${model.includes('_')?'ousia':'pneuma'}-cancel-${frame}.png`});lastFrame=frame;
    }
    await page.evaluate(() => { const s=reviewStage; const now=performance.now();s.start=now-6000;s.lastTick=now-1000/60;s.smoothed.clear();s.action={name:'greet',start:now-1400};for(let i=0;i<60;i++)s.tick(now+i*1000/60); });
    await page.screenshot({ path: `${output}/${version}-${model.includes('_')?'ousia':'pneuma'}-greet.png` });
    if (version === 'after') for (const variant of ['settled', 'glance', 'attentive']) {
      await page.evaluate(variant => { const s=reviewStage; s.setIdleVariant(variant);s.action=null;s.setMode('idle');const origin=performance.now();for(let i=0;i<150;i++)s.tick(origin+i*1000/60); },variant);
      await page.screenshot({path:output+'/'+version+'-'+(model.includes('_')?'ousia':'pneuma')+'-'+variant+'.png'});
    }
    const switched=await page.evaluate(async model=>{const s=reviewStage;s.trigger('greet');await s.load('/model/'+encodeURIComponent(model));return s.action===null&&s.smoothed.size===0;},model.includes('_')?'【芙宁娜】.pmx':'【芙宁娜_荒】.pmx');
    results.push({version,model,errors,switched,release,...evidence});
    await page.close();
  }
  await writeFile(`${output}/evidence.json`,JSON.stringify(results,null,2));
  for (const r of results) {
    assert.deepEqual(r.errors, []); assert(r.refused && r.finished && r.restored && r.nodFinished && r.switched); assert(r.nodStep<.02);
    assert(r.maxStep < .01); assert(r.maxWristStep < .35); assert(r.cancelStep < .4);
    assert(Math.abs(r.mouth-.3)<.001); assert(Math.abs(r.smile-.28)<.002);
    for (const sample of r.idle) for (const bone of Object.values(sample.bones)) assert([...bone.q,...bone.p].every(Number.isFinite));
    for (const name of ['右足首','左足首']) assert(r.idle.every(x=>x.bones[name].p.every((v,i)=>Math.abs(v-r.idle[0].bones[name].p[i])<1e-8)));
    if (r.version==='after') for(const name of ['右ひじ','左ひじ','右手首','左手首']) {
      const q=r.idle[0].bones[name].q;
      assert(Math.max(...r.idle.map(x=>Math.hypot(...x.bones[name].q.map((v,i)=>v-q[i]))))>.01);
    }
    assert(r.release.stopped);
    for(const x of r.release.scenarios){assert(x.finished&&x.repeatedRefused);assert(x.returnError<.004);if(r.version==='after'){assert(x.maxAngle<=.075001);assert(x.maxWrist<.35);}}
  }
  console.log(JSON.stringify(results.map(({version,model,boneCount,names,maxStep,maxWristStep,refused,finished,mouth,smile,restored,errors})=>({version,model,boneCount,names,maxStep,maxWristStep,refused,finished,mouth,smile,restored,errors})),null,2));
} finally { await browser.close(); await new Promise(r=>server.close(r)); }
