// Single-browser stage-only dual-PMX before/after review. No app/TTS/microphone.
import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const assets=process.env.EXO_MOTION_ASSETS;if(!assets)throw Error('EXO_MOTION_ASSETS required');
const root=resolve('.'),output=resolve('artifacts/nod-visual-review');await mkdir(output,{recursive:true});
const baseline=execFileSync('git',['show',`${process.env.EXO_MOTION_BASELINE||'f8ca400'}:src/stage.js`]);
let serveSource=true;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/character-assets/animations/overte-headnod.json'){if(!serveSource){res.writeHead(404).end();return;}res.setHeader('Content-Type','application/json');res.end(await readFile('artifacts/overte-nod/overte-headnod.json'));return;}
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(`<style>body{margin:0;background:#132033}#stage{width:900px;height:900px}</style><div id="stage"></div><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script><script type="module">import {CharacterStage} from '/src/${url.searchParams.has('before')?'baseline-stage':'stage'}.js';window.reviewStage=new CharacterStage(document.querySelector('#stage'),()=>{});reviewStage.renderer.setAnimationLoop(null);</script>`);return;}
 if(url.pathname==='/src/baseline-stage.js'){res.setHeader('Content-Type','text/javascript');res.end(baseline);return;}
 const asset=url.pathname.startsWith('/model/'),base=asset?resolve(assets):root,path=resolve(base,decodeURIComponent(url.pathname.slice(asset?7:1)));
 if(!path.startsWith(base+sep)||(!asset&&!/^\/(src|node_modules)\//.test(url.pathname))){res.writeHead(403).end();return;}
 res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(await readFile(path));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const results=[];
try{
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--enable-webgl','--use-angle=swiftshader','--mute-audio']});
 for(const version of process.argv.includes('--missing-only')?[]:['before','after'])for(const model of ['【芙宁娜】.pmx','【芙宁娜_荒】.pmx']){
  const name=model.includes('_')?'ousia':'pneuma',errors=[],page=await browser.newPage({viewport:{width:900,height:900}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/${version==='before'?'?before':''}`);await page.waitForFunction(()=>window.reviewStage);
  await page.evaluate(async model=>reviewStage.load('/model/'+encodeURIComponent(model)),model);await page.waitForFunction(()=>reviewStage.mesh,{timeout:60000});await page.waitForLoadState('networkidle');
  if(version==='after')await page.evaluate(()=>reviewStage.setNodSourceEnabled(true));
  for(const scene of ['nod','cancel']){
   await page.evaluate(()=>{const s=reviewStage,n=performance.now();s.action=null;s.smoothed.clear();s.setMode('idle');s.setExpression('happy');s.mouth=.5;s.start=n-6000;s.lastTick=n-1000/60;window.render=s.renderer.render.bind(s.renderer);s.renderer.render=()=>{};for(let i=0;i<120;i++)s.tick(n+i*1000/60);window.clock=n+2000;s.trigger('nod');s.action.start=clock;window.lastFrame=0;window.samples=[];window.previous=null;window.maxStep=0;window.refused=!s.trigger('nod')&&!s.trigger('greet');});
   for(const t of [0,.2,.4,.6,.8,1,1.2,1.4,1.6,1.8,2,2.2,2.6,3.2,4]){
    await page.evaluate(({t,scene})=>{const s=reviewStage;for(let f=lastFrame;f<=Math.round(t*60);f++){if(scene==='cancel'&&f===45)s.cancelAction();s.tick(clock+f*1000/60);const head=s.bones['頭'].getWorldQuaternion(s.offset.clone());if(previous)maxStep=Math.max(maxStep,head.angleTo(previous));previous=head;if(f%3===0){const names=['頭','首','上半身2','右足首','左足首','右足首D','左足首D'];samples.push({t:f/60,action:s.action?.name,mouth:s.mesh.morphTargetInfluences[s.mesh.morphTargetDictionary['あ']],smile:s.mesh.morphTargetInfluences[s.mesh.morphTargetDictionary['にこり']],bones:Object.fromEntries(names.filter(n=>s.bones[n]).map(n=>[n,{q:s.bones[n].getWorldQuaternion(s.offset.clone()).toArray(),p:s.bones[n].getWorldPosition(s.camera.position.clone()).toArray()}]))});}}lastFrame=Math.round(t*60)+1;render(s.scene,s.camera);},{t,scene});
    await page.screenshot({path:`${output}/${version}-${name}-${scene}-${t}.png`});
    if(t===.8){await page.evaluate(()=>{const s=reviewStage;window.front=s.camera.position.clone();s.camera.position.set(s.height*1.5,s.height*.58,s.height*1.5);s.controls.update();render(s.scene,s.camera);});await page.screenshot({path:`${output}/${version}-${name}-${scene}-${t}-side.png`});await page.evaluate(()=>{reviewStage.camera.position.copy(front);reviewStage.controls.update();});}
   }
   const evidence=await page.evaluate(()=>{reviewStage.renderer.render=render;return{available:reviewStage.motionNod?.available,maxStep,refused,finished:reviewStage.action===null,samples};});results.push({version,model,scene,errors,...evidence});
  }
  const cancellations=await page.evaluate(()=>{
   const s=reviewStage,render=s.renderer.render.bind(s.renderer);s.renderer.render=()=>{};const results=[];
   for(const cancelAt of [.2,.6,1,1.4,1.8]){
    const clock=performance.now();s.action=null;s.smoothed.clear();s.lastTick=clock-1000/60;s.start=clock-6000;s.tick(clock);s.trigger('nod');s.action.start=clock;
    for(let f=1;f<=Math.round(cancelAt*60);f++)s.tick(clock+f*1000/60);
    s.cancelAction();let previous=s.bones['頭'].getWorldQuaternion(s.offset.clone()),max=0,restartRefused=false;
    for(let f=1;f<=240;f++){if(f===12){s.trigger('nod');s.action.start=clock+(cancelAt+.2)*1000;restartRefused=!s.trigger('greet');}s.tick(clock+(cancelAt+f/60)*1000);const head=s.bones['頭'].getWorldQuaternion(s.offset.clone());max=Math.max(max,head.angleTo(previous));previous=head;}
    results.push({cancelAt,max,restartRefused,finished:s.action===null});
   }s.renderer.render=render;return results;
  });
  results.push({version,model,scene:'restarts',errors,cancellations});await page.close();
 }
 serveSource=false;
 const page=await browser.newPage(),missingErrors=[];page.on('pageerror',e=>missingErrors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.reviewStage);await page.evaluate(()=>reviewStage.load('/model/'+encodeURIComponent('【芙宁娜】.pmx')));
 const fallback=await page.evaluate(()=>({ready:Boolean(reviewStage.mesh),available:reviewStage.motionNod.available,triggered:reviewStage.trigger('nod'),cancelled:reviewStage.cancelAction()}));assert(fallback.ready&&!fallback.available&&fallback.triggered&&fallback.cancelled);assert.deepEqual(missingErrors,[]);await page.close();await writeFile(output+'/missing-source.json',JSON.stringify(fallback));
 if(results.length)await writeFile(output+'/evidence.json',JSON.stringify(results,null,2));
 for(const r of results){assert.deepEqual(r.errors,[]);if(r.scene==='restarts'){for(const c of r.cancellations){assert(c.finished&&c.restartRefused);assert(c.max<.1);}}else{assert(r.finished&&r.refused);if(r.version==='after')assert(r.available);assert(r.maxStep<.1);for(const n of ['左足首','右足首','左足首D','右足首D'])for(const s of r.samples)assert(Math.hypot(...s.bones[n].p.map((v,i)=>v-r.samples[0].bones[n].p[i]))<1e-8);assert(Math.abs(r.samples.at(-1).mouth-.3)<.001);assert(Math.abs(r.samples.at(-1).smile-.28)<.002);}}
 console.log(JSON.stringify({output,rows:results.length,errors:results.flatMap(r=>r.errors),fallback,maxHeadStep:Math.max(0,...results.flatMap(r=>r.maxStep??r.cancellations.map(c=>c.max)))}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
