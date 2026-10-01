import test from 'node:test';
import assert from 'node:assert/strict';
import {Bone,BufferGeometry,Quaternion,Skeleton,SkinnedMesh,Vector3} from 'three';
import {MotionNod,loadNodSource,validNodSource,NOD_SOURCE_PATH} from '../src/motion-nod.js';
// Original synthetic channels; no downloaded source motion or PMX data in tests.
const nodSource={duration:1.8,reference:Object.fromEntries(Object.entries({Spine2:[0,10,0],Neck:[0,15,0],Head:[0,16,0],LeftArm:[4,14,0],RightArm:[-4,14,0]}).map(([n,p])=>[n,{p,q:[0,0,0,1]}])),samples:Array.from({length:55},(_,i)=>({time:i/30,rotations:Object.fromEntries(Object.entries({Spine2:.03,Neck:.06,Head:.25}).map(([n,gain])=>[n,new Quaternion().setFromAxisAngle(new Vector3(1,0,0),gain*Math.sin(i/54*Math.PI*3)).toArray()]))}))};
function rig(yaw=.5){
 const mesh=new SkinnedMesh(new BufferGeometry()),names={'上半身2':'Spine2','首':'Neck','頭':'Head','左腕':'LeftArm','右腕':'RightArm'},bones={};
 for(const [n,source] of Object.entries(names)){const b=new Bone();b.name=n;b.position.set(...nodSource.reference[source].p);bones[n]=b;}
 for(const n of ['首','左腕','右腕']){bones[n].position.sub(bones['上半身2'].position);bones['上半身2'].add(bones[n]);}
 bones['頭'].position.sub(new Vector3(...nodSource.reference.Neck.p));bones['首'].add(bones['頭']);mesh.add(bones['上半身2']);mesh.bind(new Skeleton(Object.values(bones)));
 mesh.rotation.y=yaw;mesh.updateMatrixWorld(true);return{mesh,bones};
}
test('nod adaptation restores target bones and has a finite reference-pose conversion',()=>{
 const{mesh,bones}=rig(),initial=Object.values(bones).map(b=>b.quaternion.clone()),controller=new MotionNod(mesh,{grants:[],updateOne(){}},nodSource);
 assert(controller.available);Object.values(bones).forEach((b,i)=>assert(b.quaternion.angleTo(initial[i])<1e-8));
 for(let i=0;i<=120;i++)for(const q of Object.values(controller.sample(i/60)))assert(q.toArray().every(Number.isFinite)&&Math.abs(q.length()-1)<1e-8);
 assert(controller.sample(.8)['頭'].angleTo(new Quaternion())>.01);
});
test('nod preparation and release end at rest without touching root, arms or morphs',()=>{
 const{mesh}=rig(),controller=new MotionNod(mesh,{grants:[],updateOne(){}},nodSource);
 for(const t of [0,2,3])for(const q of Object.values(controller.sample(t)))assert(q.angleTo(new Quaternion())<1e-8);
 assert.deepEqual(Object.keys(controller.sample(.5)),['上半身2','首','頭']);
});
test('rotating the target rig preserves its local nod through reference-frame conversion',()=>{
 const a=new MotionNod(rig(0).mesh,{grants:[],updateOne(){}},nodSource),b=new MotionNod(rig(.9).mesh,{grants:[],updateOne(){}},nodSource);
 for(const t of [.2,.5,.9,1.3,1.7])for(const n of ['上半身2','首','頭'])assert(a.sample(t)[n].angleTo(b.sample(t)[n])<1e-6);
});
test('missing neck chain preserves the existing procedural nod fallback',()=>{
 const mesh=new SkinnedMesh(new BufferGeometry()),b=new Bone();mesh.add(b);mesh.bind(new Skeleton([b]));const c=new MotionNod(mesh,{grants:[],updateOne(){}},nodSource);assert.equal(c.available,false);assert.equal(c.sample(1),null);
});
test('optional local source rejects missing, malformed and oversized data without credentials',async()=>{
 const original=globalThis.fetch;let credentials;
 try{
  globalThis.fetch=async(url,options)=>{assert.equal(url,NOD_SOURCE_PATH);assert.equal(options.redirect,'error');credentials=options.credentials;return new Response(JSON.stringify(nodSource));};assert(validNodSource(await loadNodSource()));assert.equal(credentials,'omit');
  for(const response of [new Response('',{status:404}),new Response('{'),new Response(' '.repeat(32769)),new Response(JSON.stringify({...nodSource,duration:Infinity}))]){globalThis.fetch=async()=>response;assert.equal(await loadNodSource(),null);}
 }finally{globalThis.fetch=original;}
});

test('only the fixed local resource path can cause a fetch',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>{calls++;throw Error('Must not fetch');};
 for(const url of ['https://example.com/nod.json','//example.com/nod.json','/other','/character-assets/animations/../nod.json',NOD_SOURCE_PATH+'?source=other'])assert.equal(await loadNodSource(url),null);
 assert.equal(calls,0);
 }finally{globalThis.fetch=original;}
});

test('degenerate source and target reference axes fall back without changing bones',()=>{
 const invalid=structuredClone(nodSource);invalid.samples[0]=null;assert.equal(validNodSource(invalid),false);
 for(const positions of [[0,0,0],[0,1e308,0]]){
  const source=structuredClone(nodSource);source.reference.Head.p=positions;source.reference.Neck.p=positions;
  assert.equal(validNodSource(source),false);
 }
 const source=structuredClone(nodSource);source.reference.LeftArm.p=[0,20,0];source.reference.RightArm.p=[0,10,0];assert.equal(validNodSource(source),false);
 const{mesh,bones}=rig();bones['頭'].position.set(0,0,0);mesh.updateMatrixWorld(true);const before=Object.values(bones).map(b=>b.quaternion.toArray());
 const c=new MotionNod(mesh,{grants:[],updateOne(){}},nodSource);assert.equal(c.available,false);assert.equal(c.sample(1),null);assert.deepEqual(Object.values(bones).map(b=>b.quaternion.toArray()),before);
});

test('an unresponsive optional source aborts after the two-second deadline',async t=>{
 const original=globalThis.fetch;let signal;
 t.mock.timers.enable({apis:['setTimeout']});
 try{globalThis.fetch=(_url,options)=>new Promise((_,reject)=>{signal=options.signal;signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});});
 const pending=loadNodSource();t.mock.timers.tick(1999);assert.equal(signal.aborted,false);t.mock.timers.tick(1);assert.equal(await pending,null);assert.equal(signal.aborted,true);
 }finally{globalThis.fetch=original;t.mock.timers.reset();}
});
