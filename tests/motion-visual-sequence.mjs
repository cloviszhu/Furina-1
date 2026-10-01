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
  for(const scene of ['idle','greet','nod','cancel','speaking','thinking']){
   await page.evaluate(scene=>{const s=reviewStage,n=performance.now();s.start=n;s.lastTick=n-1000/60;s.action=null;s.smoothed.clear();s.setMode(['speaking','thinking'].includes(scene)?scene:'idle');s.mouth=0;window.reviewOrigin=n;window.reviewLast=0;window.reviewSamples=[];if(['greet','nod','cancel'].includes(scene))s.action={name:scene==='nod'?'nod':'greet',start:n};window.reviewRender=s.renderer.render.bind(s.renderer);s.renderer.render=()=>{};},scene);
   const times=scene==='idle'?[0,2,5,8,10,12,15,18,20,22,25,28,30,32,35,38,40,42,45,48,50,52,55,58,60]:[0,.2,.5,.8,1.1,1.4,1.8,2.2,2.8,3.6,4.5];
   for(const t of times){
    await page.evaluate(({t,scene})=>{const s=reviewStage;for(let f=reviewLast;f<=Math.round(t*60);f++){if(scene==='cancel'&&f===84)s.cancelAction();if(scene==='speaking')s.mouth=.3+.18*Math.sin(f/60*12);s.tick(reviewOrigin+f*1000/60);if(f%6===0){const names=['頭','首','両目','上半身','上半身2','右腕','左腕','右ひじ','左ひじ','右手首','左手首','右足首','左足首'];reviewSamples.push({t:f/60,bones:Object.fromEntries(names.filter(n=>s.bones[n]).map(n=>[n,{q:s.bones[n].quaternion.toArray(),p:s.bones[n].getWorldPosition(s.camera.position.clone()).toArray()}]))});}}reviewLast=Math.round(t*60)+1;},{t,scene});
    await page.evaluate(()=>reviewRender(reviewStage.scene,reviewStage.camera));
    await page.screenshot({path:`${output}/${label}-${name}-${scene}-${t}.png`});
   }
   results.push({label,model,scene,errors,rig,samples:await page.evaluate(()=>{reviewStage.renderer.render=reviewRender;return reviewSamples;})});
  }
  await page.close();
 }
 await writeFile(`${output}/${label}-sequence.json`,JSON.stringify(results));
 console.log(JSON.stringify({output,label,scenes:results.length,errors:results.flatMap(r=>r.errors)}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
