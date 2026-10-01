import test from 'node:test';
import assert from 'node:assert/strict';
import { Bone, BufferGeometry, Quaternion, Skeleton, SkinnedMesh, Vector3 } from 'three';
import { MotionIdle, plantLeg } from '../src/motion-idle.js';
import { idleSource } from '../src/motion-idle-data.js';

// Synthetic CC0 source-sized rig: contains no user PMX or copied model data.
function rig() {
  const map={'腰':'pelvis','上半身':'spine_01','上半身3':'spine_02','上半身2':'spine_03','左肩':'clavicle_l','右肩':'clavicle_r','左腕':'upperarm_l','右腕':'upperarm_r','左ひじ':'lowerarm_l','右ひじ':'lowerarm_r','左手首':'hand_l','右手首':'hand_r','左足':'thigh_l','右足':'thigh_r','左ひざ':'calf_l','右ひざ':'calf_r','左足首':'foot_l','右足首':'foot_r'};
  const parents={'腰':'センター','上半身':'腰','上半身3':'上半身','上半身2':'上半身3'};
  for(const side of ['左','右'])Object.assign(parents,{[side+'肩']:'上半身2',[side+'腕']:side+'肩',[side+'ひじ']:side+'腕',[side+'手首']:side+'ひじ',[side+'足']:'腰',[side+'ひざ']:side+'足',[side+'足首']:side+'ひざ'});
  const mesh=new SkinnedMesh(new BufferGeometry()),bones={'センター':new Bone()};bones['センター'].name='センター';mesh.add(bones['センター']);
  for(const name of Object.keys(map)){bones[name]=new Bone();bones[name].name=name;}
  for(const [name,source] of Object.entries(map)){
    const parent=parents[name],position=new Vector3(...idleSource.reference[source].p),parentSource=map[parent];
    if(parentSource)position.sub(new Vector3(...idleSource.reference[parentSource].p));
    bones[name].position.copy(position);bones[parent].add(bones[name]);
  }
  mesh.updateMatrixWorld(true);mesh.bind(new Skeleton(Object.values(bones)));
  const controller=new MotionIdle(mesh,{grants:[],updateOne(){}});
  return {mesh,bones,controller};
}
const context={enabled:true,time:5,mode:'idle',variant:'auto'};

test('unavailable target rig leaves existing bones unchanged and has no mixer',()=>{
  const mesh=new SkinnedMesh(new BufferGeometry()),bone=new Bone();bone.name='unrelated';bone.position.set(1,2,3);mesh.add(bone);mesh.bind(new Skeleton([bone]));
  const controller=new MotionIdle(mesh,{grants:[],updateOne(){}});
  assert.equal(controller.available,false);assert.equal(controller.update(1/60,context),0);
  assert.deepEqual(bone.position.toArray(),[1,2,3]);assert.equal(controller.mixer,undefined);controller.dispose();
});

test('private mixer preserves constant tracks when stage resets its real bones',()=>{
  const {controller,bones}=rig();assert(controller.available);
  controller.update(1/60,context);
  const expected=new Map([...controller.targets].map(([n,q])=>[n,q.clone()])),center=controller.centerOffset.clone();
  assert([...expected.values()].some(q=>q.angleTo(new Quaternion())>.1));
  for(const b of Object.values(bones))b.quaternion.identity();
  controller.update(0,context);
  for(const [name,q]of expected)assert(q.angleTo(controller.targets.get(name))<1e-6,name);
  assert(controller.centerOffset.distanceTo(center)<1e-10);
  controller.dispose();
});

test('sourced loop closes every control rotation and root position without morph tracks',()=>{
  const {controller}=rig();
  for(const track of controller.clip.tracks){
    assert(!track.name.includes('morph'));
    if(track.ValueTypeName==='quaternion'){
      const first=new Quaternion().fromArray(track.values,0).normalize(),last=new Quaternion().fromArray(track.values,track.values.length-4).normalize();
      assert(first.angleTo(last)<1e-6,track.name);
    }else assert(new Vector3().fromArray(track.values,0).distanceTo(new Vector3().fromArray(track.values,track.values.length-3))<1e-7);
  }
  controller.dispose();
});

test('turn states and gestures fade sourced idle out, and explicit poses retain ownership',()=>{
  const {controller}=rig();
  for(let i=0;i<120;i++)controller.update(1/60,context);
  assert(controller.weight>.99);
  for(const change of [{action:{name:'greet'}},{mode:'speaking'},{mode:'thinking'},{variant:'glance'},{enabled:false}]){
    controller.weight=1;
    for(let i=0;i<120;i++)controller.update(1/60,{...context,...change});
    assert(controller.weight<.001,JSON.stringify(change));
  }
  controller.dispose();
});

test('two-link planted leg reaches blended hip poses without knee overextension or sole roll',()=>{
  const {controller}=rig();
  for(const progress of [0,.2,.5,.8,1]){
    controller.reset();controller.center.position.add(new Vector3(.03,-.05,-.02).multiplyScalar(progress));
    assert(controller.plant());
    for(const leg of controller.legs){
      assert(leg.ankle.getWorldPosition(new Vector3()).distanceTo(leg.target)<1e-7);
      assert(leg.ankle.getWorldQuaternion(new Quaternion()).angleTo(leg.orientation)<1e-6);
      const upper=leg.upper.getWorldPosition(new Vector3()),knee=leg.knee.getWorldPosition(new Vector3()),ankle=leg.ankle.getWorldPosition(new Vector3());
      assert(Math.abs(upper.distanceTo(knee)-leg.lengths[0])<1e-7);
      assert(Math.abs(knee.distanceTo(ankle)-leg.lengths[1])<1e-7);
    }
  }
  const leg=controller.legs[0];assert.equal(plantLeg({...leg,target:new Vector3(0,10,0)}),false);
  controller.dispose();
});
