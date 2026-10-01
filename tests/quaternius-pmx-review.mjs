// Isolated source-animation compatibility experiment, never production behavior.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
const assets=process.env.EXO_MOTION_ASSETS,root=resolve('.'),output=resolve(process.argv.includes('--ik')?'artifacts/quaternius-ik':process.argv.includes('--corrected')?'artifacts/quaternius-corrected':'artifacts/quaternius-review');
if(!assets)throw Error('EXO_MOTION_ASSETS must name existing read-only assets');
await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(`<style>body{margin:0;background:#132033}#stage{width:900px;height:900px}</style><div id="stage"></div><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script><script type="module">import {CharacterStage} from '/src/stage.js';window.reviewStage=new CharacterStage(document.querySelector('#stage'),()=>{});reviewStage.renderer.setAnimationLoop(null);</script>`);return;}
 const asset=url.pathname.startsWith('/model/'),base=asset?resolve(assets):root;
 const path=resolve(base,decodeURIComponent(url.pathname.slice(asset?7:1)));
 if(!path.startsWith(base+sep)||(!asset&&!/^\/(src|node_modules|artifacts\/quaternius-standard)\//.test(url.pathname))){res.writeHead(403).end();return;}
 res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(await readFile(path));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;const evidence=[];
try{
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--enable-webgl','--use-angle=swiftshader','--mute-audio']});
 for(const model of ['【芙宁娜】.pmx','【芙宁娜_荒】.pmx']){
  const name=model.includes('_')?'ousia':'pneuma',page=await browser.newPage({viewport:{width:900,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/${process.argv.includes('--corrected')?(process.argv.includes('--ik')?'?corrected&ik':'?corrected'):''}`);await page.waitForFunction(()=>window.reviewStage);
  await page.evaluate(async model=>reviewStage.load('/model/'+encodeURIComponent(model)),model);await page.waitForFunction(()=>reviewStage.mesh,{timeout:60000});await page.waitForLoadState('networkidle');
  // Same camera, model and timestamps as the candidate, using the main stage.
  for(const clip of ['Idle_Loop','Idle_Talking_Loop']){
   await page.evaluate(clip=>{const s=reviewStage,n=performance.now();s.start=n;s.lastTick=n-1000/60;s.action=null;s.smoothed.clear();s.setMode(clip.includes('Talking')?'speaking':'idle');s.mouth=0;window.baseOrigin=n;window.baseLast=0;window.baseRender=s.renderer.render.bind(s.renderer);s.renderer.render=()=>{};},clip);
   for(const t of [0,.6,1.2,2.4]){
    const pose=await page.evaluate(t=>{const s=reviewStage;for(let f=baseLast;f<=Math.round(t*60);f++){s.mouth=s.mode==='speaking'?.3+.18*Math.sin(f/60*12):0;s.tick(baseOrigin+f*1000/60);}baseLast=Math.round(t*60)+1;baseRender(s.scene,s.camera);return Object.fromEntries(['頭','右手首','左手首','右足首','左足首'].map(n=>[n,s.bones[n].getWorldPosition(s.camera.position.clone()).toArray()]));},t);
    evidence.push({version:'main',model,clip,t,pose,errors});await page.screenshot({path:`${output}/before-${name}-${clip}-${t}.png`});
   }
   await page.evaluate(()=>reviewStage.renderer.render=baseRender);
  }
  const info=await page.evaluate(async()=>{
   const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
   const {retargetClip}=await import('three/addons/utils/SkeletonUtils.js');
   const THREE=await import('three');
   const gltf=await new GLTFLoader().loadAsync('/artifacts/quaternius-standard/Universal%20Animation%20Library%5BStandard%5D/Unreal-Godot/UAL1_Standard.glb');
   let source;gltf.scene.traverse(o=>{if(o.isSkinnedMesh)source=o;});
   const s=reviewStage;
   // Official retargetClip, world-space bind conversion. No renaming of raw tracks.
   const names={'腰':'pelvis','上半身':'spine_01','上半身3':'spine_02','上半身2':'spine_03','首':'neck_01','頭':'Head','左肩':'clavicle_l','右肩':'clavicle_r','左腕':'upperarm_l','右腕':'upperarm_r','左ひじ':'lowerarm_l','右ひじ':'lowerarm_r','左手首':'hand_l','右手首':'hand_r','左足':'thigh_l','右足':'thigh_r','左ひざ':'calf_l','右ひざ':'calf_r','左足首':'foot_l','右足首':'foot_r'};
   window.candidateClips=Object.fromEntries(['Idle_Loop','Idle_Talking_Loop'].map(name=>{
    const original=gltf.animations.find(a=>a.name===name);const clip=retargetClip(s.mesh,source,original,{names,hip:'pelvis',fps:30,preservePosition:true,preserveHipPosition:true});
    // Ignore source translation, because PMX uses different units and IK controls.
    clip.tracks=clip.tracks.filter(t=>!t.name.endsWith('.position'));return[name,clip];
   }));
   window.candidateMixer=new THREE.AnimationMixer(s.mesh);s.mesh.pose();
   if(location.search.includes('corrected')){
    const sourceMixer=new THREE.AnimationMixer(gltf.scene);sourceMixer.clipAction(gltf.animations.find(a=>a.name==='A_TPose')).play();sourceMixer.update(0);gltf.scene.updateMatrixWorld(true);
    const sourceRef=new Map(source.skeleton.bones.map(b=>[b.name,b.getWorldQuaternion(new THREE.Quaternion())]));
    s.mesh.pose();s.mesh.updateMatrixWorld(true);const targetRef=new Map(s.mesh.skeleton.bones.map(b=>[b.name,b.getWorldQuaternion(new THREE.Quaternion())]));
    const mapped=s.mesh.skeleton.bones.filter(b=>names[b.name]).sort((a,b)=>{const depth=x=>{let d=0;while(x.parent){d++;x=x.parent;}return d;};return depth(a)-depth(b);});
    window.selectCandidate=name=>{sourceMixer.stopAllAction();source.skeleton.pose();sourceMixer.clipAction(gltf.animations.find(a=>a.name===name)).play();};
    const {CCDIKSolver}=await import('three/addons/animation/CCDIKSolver.js');
    const ik=location.search.includes('ik')?new CCDIKSolver(s.mesh,s.mesh.geometry.userData.MMD.iks):null;
    window.renderCandidate=t=>{
     sourceMixer.setTime(t);gltf.scene.updateMatrixWorld(true);s.mesh.pose();s.mesh.updateMatrixWorld(true);
     for(const b of mapped){const from=source.skeleton.bones.find(x=>x.name===names[b.name]);const q=from.getWorldQuaternion(new THREE.Quaternion()).multiply(sourceRef.get(from.name).clone().invert()).multiply(targetRef.get(b.name));b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));b.updateMatrixWorld(true);}
     ik?.update();s.grantSolver.update();s.mesh.updateMatrixWorld(true);
    };
   }
   return {sourceBones:source.skeleton.bones.map(b=>b.name),mappedBones:Object.keys(names).filter(n=>s.bones[n]),clips:Object.entries(candidateClips).map(([name,clip])=>({name,duration:clip.duration,tracks:clip.tracks.length}))};
  });
  for(const clip of ['Idle_Loop','Idle_Talking_Loop']){
   await page.evaluate(clip=>{candidateMixer.stopAllAction();reviewStage.mesh.pose();candidateMixer.clipAction(candidateClips[clip]).play();window.candidateLast=0;window.candidateSpeaking=clip.includes('Talking');window.selectCandidate?.(clip);},clip);
   for(const t of [0,.6,1.2,2.4]){
    const pose=await page.evaluate(t=>{if(window.renderCandidate)renderCandidate(t);else{candidateMixer.update(t-candidateLast);reviewStage.grantSolver.update();}candidateLast=t;const mouth=candidateSpeaking?.3+.18*Math.sin(t*12):0;reviewStage.morph(['あ'],mouth*.6);reviewStage.morph(['い'],mouth*.1);reviewStage.morph(['う'],mouth*.08);reviewStage.mesh.updateMatrixWorld(true);reviewStage.renderer.render(reviewStage.scene,reviewStage.camera);return Object.fromEntries(['頭','右手首','左手首','右足首','左足首'].map(n=>[n,reviewStage.bones[n].getWorldPosition(reviewStage.camera.position.clone()).toArray()]));},t);
    evidence.push({version:'candidate',model,clip,t,pose,info,errors});await page.screenshot({path:`${output}/${name}-${clip}-${t}.png`});
   }
  }
  await page.close();
 }
 await writeFile(`${output}/evidence.json`,JSON.stringify(evidence,null,2));console.log(JSON.stringify({output,frames:evidence.length,errors:evidence.flatMap(e=>e.errors)}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
