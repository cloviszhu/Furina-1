import test from 'node:test';
import assert from 'node:assert/strict';
import {Bone,BufferGeometry,Quaternion,Skeleton,SkinnedMesh,Vector3} from 'three';
import {MotionNod,loadNodSource,validNodSource} from '../src/motion-nod.js';
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
  globalThis.fetch=async(_url,options)=>{credentials=options.credentials;return new Response(JSON.stringify(nodSource));};assert(validNodSource(await loadNodSource('/local')));assert.equal(credentials,'omit');
  for(const response of [new Response('',{status:404}),new Response('{'),new Response(' '.repeat(32769)),new Response(JSON.stringify({...nodSource,duration:Infinity}))]){globalThis.fetch=async()=>response;assert.equal(await loadNodSource('/local'),null);}
 }finally{globalThis.fetch=original;}
});
