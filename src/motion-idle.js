import { AnimationClip, AnimationMixer, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three';
import { idleSource } from './motion-idle-data.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const mapping = {
  '腰':'pelvis', '上半身':'spine_01', '上半身3':'spine_02', '上半身2':'spine_03',
  '左肩':'clavicle_l', '右肩':'clavicle_r', '左腕':'upperarm_l', '右腕':'upperarm_r',
  '左ひじ':'lowerarm_l', '右ひじ':'lowerarm_r', '左手首':'hand_l', '右手首':'hand_r',
  '左足':'thigh_l', '右足':'thigh_r', '左ひざ':'calf_l', '右ひざ':'calf_r', '左足首':'foot_l', '右足首':'foot_r',
};
const smooth = x => { const t=Math.max(0,Math.min(1,x)); return t*t*(3-2*t); };
const worldPosition = b => new Vector3().setFromMatrixPosition(b.matrixWorld);
const depth = b => { let d=0; while(b.parent){d++;b=b.parent;} return d; };

// Geometric two-link solve with a forward knee pole and fixed ankle orientation.
// Unlike iterative CCD, this reaches the fixed sole at blended hip heights too.
export function plantLeg({ upper, knee, ankle, target, orientation, lengths, pole, referenceDirections, referenceRotations }) {
  const hip=worldPosition(upper), direction=target.clone().sub(hip), distance=direction.length();
  const [a,b]=lengths;
  if(distance<1e-8 || distance>a+b+1e-6) return false;
  direction.normalize();
  const along=(a*a-b*b+distance*distance)/(2*distance);
  const bend=Math.sqrt(Math.max(0,a*a-along*along));
  const side=pole.clone().addScaledVector(direction,-pole.dot(direction)).normalize();
  const joint=hip.clone().addScaledVector(direction,along).addScaledVector(side,bend);
  const aim=(bone,child,point,index)=>{
    const origin=worldPosition(bone),from=referenceDirections?.[index] || worldPosition(child).sub(origin).normalize(),to=point.clone().sub(origin).normalize();
    const world=new Quaternion().setFromUnitVectors(from,to).multiply(referenceRotations?.[index] || bone.getWorldQuaternion(new Quaternion()));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(world));
    bone.updateMatrixWorld(true);
  };
  aim(upper,knee,joint,0);aim(knee,ankle,target,1);
  ankle.quaternion.copy(ankle.parent.getWorldQuaternion(new Quaternion()).invert().multiply(orientation));
  ankle.updateMatrixWorld(true);
  return true;
}

export class MotionIdle {
  constructor(mesh, grantSolver) {
    this.mesh=mesh; this.weight=0;
    const bones=mesh.skeleton.bones;this.bones=Object.fromEntries(bones.map(b=>[b.name,b]));
    this.rest=new Map(bones.map(b=>[b,{q:b.quaternion.clone(),p:b.position.clone()}]));
    mesh.updateMatrixWorld(true);
    this.worldRest=new Map(bones.map(b=>[b,b.getWorldQuaternion(new Quaternion())]));
    this.center=this.bones['センター'];
    this.legs=['左','右'].map(side=>{
      const upper=this.bones[side+'足'],knee=this.bones[side+'ひざ'],ankle=this.bones[side+'足首'];
      if(!upper||!knee||!ankle)return null;
      return {upper,knee,ankle,target:worldPosition(ankle),orientation:this.worldRest.get(ankle).clone(),
        lengths:[worldPosition(upper).distanceTo(worldPosition(knee)),worldPosition(knee).distanceTo(worldPosition(ankle))],pole:new Vector3(0,0,1),
        referenceDirections:[worldPosition(knee).sub(worldPosition(upper)).normalize(),worldPosition(ankle).sub(worldPosition(knee)).normalize()],
        referenceRotations:[this.worldRest.get(upper).clone(),this.worldRest.get(knee).clone()]};
    }).filter(Boolean);
    this.available=Boolean(this.center&&this.legs.length===2&&Object.keys(mapping).every(n=>this.bones[n]));
    this.targets=new Map();
    if(!this.available)return;
    const ref=idleSource.reference;
    const sourceLength=new Vector3(...ref.thigh_l.p).distanceTo(new Vector3(...ref.calf_l.p))+new Vector3(...ref.calf_l.p).distanceTo(new Vector3(...ref.foot_l.p));
    const scale=this.legs[0].lengths.reduce((a,b)=>a+b,0)/sourceLength;
    const ordered=[...bones].sort((a,b)=>depth(a)-depth(b));
    // PMX is an A-pose rig, not a horizontal T-pose rig. World quaternion
    // deltas alone double the resting arm drop. Align anatomical segment axes.
    const axes=new Map();
    for(const side of ['左','右'])for(const [name,next] of [['腕','ひじ'],['ひじ','手首'],['手首','中指１']]){
      const bone=this.bones[side+name],child=this.bones[side+next],source=mapping[side+name];
      if(!child)continue;
      const targetAxis=worldPosition(child).sub(worldPosition(bone)).normalize();
      const sourceAxis=name==='手首'?new Vector3(...ref[source].axis):new Vector3(...ref[mapping[side+next]].p).sub(new Vector3(...ref[source].p)).normalize();
      axes.set(bone,new Quaternion().setFromUnitVectors(targetAxis,sourceAxis));
    }
    const grants=new Map(grantSolver.grants.map(g=>[bones[g.index],g]));
    const values=new Map(Object.keys(mapping).map(n=>[n,[]])),positions=[],times=[];
    for(const sample of idleSource.samples){
      this.reset();
      // Close the author loop in a short overlap, preserving quaternion continuity.
      const seam=smooth((sample.time-(idleSource.duration-.2))/.2),first=idleSource.samples[0];
      const hip=new Vector3(...sample.hip).lerp(new Vector3(...first.hip),seam).sub(new Vector3(...ref.pelvis.p)).multiplyScalar(scale);
      this.center.position.add(hip);mesh.updateMatrixWorld(true);
      for(const bone of ordered){
        const source=mapping[bone.name];
        if(source){
          const sourceWorld=new Quaternion(...sample.rotations[source]).normalize().slerp(new Quaternion(...first.rotations[source]).normalize(),seam);
          const world=sourceWorld.multiply(new Quaternion(...ref[source].q).normalize().invert());
          if(axes.has(bone))world.multiply(axes.get(bone));
          world.multiply(this.worldRest.get(bone));
          bone.quaternion.copy(bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(world));
        }else if(grants.has(bone)) grantSolver.updateOne(grants.get(bone));
        bone.updateMatrixWorld(true);
      }
      this.plant();
      times.push(sample.time);positions.push(...this.center.position.toArray());
      for(const [name,array] of values)array.push(...this.bones[name].quaternion.toArray());
    }
    this.reset();
    const tracks=[...values].map(([name,array])=>new QuaternionKeyframeTrack(`.bones[${name}].quaternion`,times,array));
    tracks.push(new VectorKeyframeTrack('.bones[センター].position',times,positions));
    this.clip=new AnimationClip('Quaternius-CC0-idle',idleSource.duration,tracks);
    // Mixer bindings cache constant values. The stage resets its real bones on
    // every tick, so sample on a private rig instead of losing unchanged tracks.
    this.proxy=clone(mesh);this.proxyBones=Object.fromEntries(this.proxy.skeleton.bones.map(b=>[b.name,b]));
    this.mixer=new AnimationMixer(this.proxy);this.action=this.mixer.clipAction(this.clip).play();
    this.reset();
  }
  reset() { for(const [b,r] of this.rest){b.quaternion.copy(r.q);b.position.copy(r.p);}this.mesh.updateMatrixWorld(true); }
  plant() {
    this.mesh.updateMatrixWorld(true);
    // On release, torso smoothing can lag behind the root's blend. Keep the
    // ankle targets reachable rather than overextending a knee to bridge it.
    const excess=Math.max(0,...this.legs.map(leg=>worldPosition(leg.upper).distanceTo(leg.target)-leg.lengths[0]-leg.lengths[1]));
    if(excess>0){this.center.position.y-=excess*1.1+1e-6;this.mesh.updateMatrixWorld(true);}
    return this.legs.map(leg=>plantLeg(leg)).every(Boolean);
  }
  update(dt, {enabled, time, mode, action, variant, expression='neutral'}) {
    if(!this.available)return 0;
    const quiet=expression==='sad'?.45:expression==='calm'?.75:1;
    const desired=enabled&&variant==='auto'&&mode==='idle'&&!action?quiet:0;
    this.weight+=(desired-this.weight)*(1-Math.exp(-dt*4));
    // One slow resting breath. Small tempo drift avoids a metronomic loop.
    this.mixer.update(dt*(.48+.025*Math.sin(time*.17)));
    for(const name of Object.keys(mapping))this.targets.set(name,this.proxyBones[name].quaternion.clone().normalize());
    this.centerOffset=this.proxyBones['センター'].position.clone().sub(this.rest.get(this.center).p);
    this.reset();return this.weight*.65;
  }
  mask(name) { return /腕$/.test(name)?.6:/ひじ$/.test(name)?.5:/手首$/.test(name)?.35:1; }
  dispose() { this.mixer?.stopAllAction();this.mixer?.uncacheRoot(this.proxy); }
}
