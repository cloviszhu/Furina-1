// Stage-only deterministic visual sequence. No app server, TTS, user data or network.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
const assets=process.env.EXO_MOTION_ASSETS;
if(!assets) throw Error('EXO_MOTION_ASSETS must name existing read-only assets');
const root=resolve('.'), output=resolve('artifacts/motion-visual-review');
await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(`<style>body{margin:0;background:#132033}#stage{width:900px;height:900px}</style><div id="stage"></div><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script><script type="module">import {CharacterStage} from '/src/stage.js';window.reviewStage=new CharacterStage(document.querySelector('#stage'),()=>{});reviewStage.renderer.setAnimationLoop(null);</script>`);return;}
 const asset=url.pathname.startsWith('/model/'),base=asset?resolve(assets):root;
 const path=resolve(base,decodeURIComponent(url.pathname.slice(asset?7:1)));
 if(!path.startsWith(base+sep)||(!asset&&!/^\/(src|node_modules)\//.test(url.pathname))){res.writeHead(403).end();return;}
 res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(await readFile(path));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
const label=process.argv[2]||'before',results=[];
try{
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--enable-webgl','--use-angle=swiftshader','--mute-audio']});
 for(const model of ['【芙宁娜】.pmx','【芙宁娜_荒】.pmx']){
  const name=model.includes('_')?'ousia':'pneuma';
  const page=await browser.newPage({viewport:{width:900,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.reviewStage);
  await page.evaluate(async model=>reviewStage.load('/model/'+encodeURIComponent(model)),model);
  await page.waitForFunction(()=>window.reviewStage.mesh,{timeout:60000});await page.waitForLoadState('networkidle');
  const rig=await page.evaluate(()=>({bones:reviewStage.mesh.skeleton.bones.map(b=>({name:b.name,parent:b.parent?.name})),height:reviewStage.height}));
  await page.evaluate(enabled=>reviewStage.setIdleSourceEnabled(enabled),process.argv.includes('--source'));
  const controller=await page.evaluate(()=>({available:reviewStage.motionIdle?.available,tracks:reviewStage.motionIdle?.clip?.tracks.length}));
  for(const scene of ['idle','greet','nod','cancel','speaking','thinking','transition']){
   await page.evaluate(scene=>{const s=reviewStage,n=performance.now();s.start=n;s.lastTick=n-1000/60;s.action=null;s.smoothed.clear();s.setMode(['speaking','thinking'].includes(scene)?scene:'idle');s.mouth=0;window.reviewOrigin=n;window.reviewLast=0;window.reviewSamples=[];if(['greet','nod','cancel'].includes(scene))s.action={name:scene==='nod'?'nod':'greet',start:n};window.reviewRender=s.renderer.render.bind(s.renderer);s.renderer.render=()=>{};},scene);
   await page.evaluate(()=>{if(reviewStage.motionIdle){reviewStage.motionIdle.weight=0;reviewStage.motionIdle.mixer?.setTime(0);}});
   const times=scene==='idle'?[0,2,5,8,10,12,15,18,20,22,25,28,30,32,35,38,40,42,45,48,50,52,55,58,60]:scene==='transition'?[0,1,2,3,3.5,4,4.4,4.5,5,5.5,6,7,8,10,12,15]:[0,.2,.5,.8,1.1,1.4,1.8,2.2,2.8,3.6,4.5];
   for(const t of times){
    await page.evaluate(({t,scene})=>{const s=reviewStage;for(let f=reviewLast;f<=Math.round(t*60);f++){if(scene==='cancel'&&f===84)s.cancelAction();if(scene==='transition'&&f===180)s.action={name:'greet',start:reviewOrigin+3000};if(scene==='transition'&&f===264)s.cancelAction();if(scene==='speaking')s.mouth=.3+.18*Math.sin(f/60*12);s.tick(reviewOrigin+f*1000/60);if(f%6===0){const names=['センター','腰','頭','首','両目','上半身','上半身2','右腕','左腕','右ひじ','左ひじ','右手首','左手首','右ひざ','左ひざ','右足首','左足首','右足首D','左足首D'];reviewSamples.push({t:f/60,weight:s.motionIdle?.weight,action:s.action?.name,mouth:s.mesh.morphTargetInfluences[s.mesh.morphTargetDictionary['あ']],blink:s.mesh.morphTargetInfluences[s.mesh.morphTargetDictionary['まばたき']],bones:Object.fromEntries(names.filter(n=>s.bones[n]).map(n=>[n,{q:s.bones[n].quaternion.toArray(),p:s.bones[n].getWorldPosition(s.camera.position.clone()).toArray()}]))});}}reviewLast=Math.round(t*60)+1;},{t,scene});
    await page.evaluate(()=>reviewRender(reviewStage.scene,reviewStage.camera));
    await page.screenshot({path:`${output}/${label}-${name}-${scene}-${t}.png`});
    if((scene==='idle'||scene==='transition')&&t===5){
      await page.evaluate(()=>{const s=reviewStage;window.frontCamera=s.camera.position.clone();s.camera.position.set(s.height*1.5,s.height*.58,s.height*1.5);s.controls.update();reviewRender(s.scene,s.camera);});
      await page.screenshot({path:`${output}/${label}-${name}-${scene}-${t}-side.png`});
      await page.evaluate(()=>{reviewStage.camera.position.copy(frontCamera);reviewStage.controls.update();});
    }
   }
   results.push({label,model,scene,errors,rig,controller,samples:await page.evaluate(()=>{reviewStage.renderer.render=reviewRender;return reviewSamples;})});
  }
  await page.close();
 }
 await writeFile(`${output}/${label}-sequence.json`,JSON.stringify(results));
 console.log(JSON.stringify({output,label,scenes:results.length,errors:results.flatMap(r=>r.errors)}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
