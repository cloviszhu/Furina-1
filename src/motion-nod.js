import {Matrix4,Quaternion,Vector3} from 'three';
import {ease} from './motion.js';

export function validNodSource(source){
  const vector=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
  return source?.duration===1.8&&Array.isArray(source.samples)&&source.samples.length===55&&
    ['Spine2','Neck','Head','LeftArm','RightArm'].every(n=>vector(source.reference?.[n]?.p,3)&&vector(source.reference?.[n]?.q,4)&&Math.abs(Math.hypot(...source.reference[n].q)-1)<.001)&&
    source.samples.every((s,i)=>Math.abs(s.time-i/30)<1e-6&&['Spine2','Neck','Head'].every(n=>vector(s.rotations?.[n],4)&&Math.abs(Math.hypot(...s.rotations[n])-1)<.001));
}
export async function loadNodSource(url){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),2000);
  try{
    const response=await fetch(url,{signal:controller.signal,credentials:'omit'});
    if(!response.ok)return null;
    const reader=response.body.getReader(),chunks=[];let length=0;
    while(true){const{value,done}=await reader.read();if(done)break;length+=value.length;if(length>32768){await reader.cancel();return null;}chunks.push(value);}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const source=JSON.parse(new TextDecoder().decode(bytes));return validNodSource(source)?source:null;
  }catch{return null;}finally{clearTimeout(timer);}
}

const controls={'上半身2':'Spine2','首':'Neck','頭':'Head'};
const depth=bone=>{let n=0;while(bone.parent){n++;bone=bone.parent;}return n;};
const position=bone=>bone.getWorldPosition(new Vector3());
function basis(left,right,neck,head){
  const y=head.clone().sub(neck).normalize(),x=left.clone().sub(right).normalize();
  const z=new Vector3().crossVectors(x,y).normalize();x.crossVectors(y,z).normalize();
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z));
}

// Reference-world retargeting, not a track-name substitution. Target reference
// pose and parent/grant hierarchy are computed from the loaded rig, never saved.
export class MotionNod {
  constructor(mesh,grantSolver,nodSource){
    this.available=false;this.samples=[];
    if(!validNodSource(nodSource))return;
    this.duration=nodSource.duration;
    const bones=mesh.skeleton.bones,byName=Object.fromEntries(bones.map(b=>[b.name,b]));
    if(!['上半身2','首','頭','左腕','右腕'].every(n=>byName[n]))return;
    mesh.updateMatrixWorld(true);
    const rest=new Map(bones.map(b=>[b,b.quaternion.clone()]));
    const worldRest=new Map(bones.map(b=>[b,b.getWorldQuaternion(new Quaternion())]));
    const ref=nodSource.reference,srcBasis=basis(...['LeftArm','RightArm','Neck','Head'].map(n=>new Vector3(...ref[n].p)));
    const targetBasis=basis(...['左腕','右腕','首','頭'].map(n=>position(byName[n])));
    const alignment=targetBasis.multiply(srcBasis.invert());
    const grants=new Map(grantSolver.grants.map(g=>[bones[g.index],g]));
    const ordered=[...bones].sort((a,b)=>depth(a)-depth(b));
    const reset=()=>{for(const [b,q] of rest)b.quaternion.copy(q);mesh.updateMatrixWorld(true);};
    try{
      for(const sample of nodSource.samples){
        reset();
        for(const bone of ordered){
          const source=controls[bone.name];
          if(source){
            const delta=new Quaternion(...sample.rotations[source]).normalize().multiply(new Quaternion(...ref[source].q).normalize().invert());
            delta.premultiply(alignment).multiply(alignment.clone().invert());
            const desired=delta.multiply(worldRest.get(bone));
            bone.quaternion.copy(bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(desired));
          }else if(grants.has(bone))grantSolver.updateOne(grants.get(bone));
          bone.updateMatrixWorld(true);
        }
        this.samples.push(Object.fromEntries(Object.keys(controls).map(n=>[n,rest.get(byName[n]).clone().invert().multiply(byName[n].quaternion).normalize()])));
      }
      this.available=true;
    }finally{reset();}
  }
  sample(elapsed){
    if(!this.available)return null;
    const time=Math.max(0,Math.min(this.duration,elapsed)),index=time*30,lo=Math.min(this.samples.length-1,Math.floor(index)),hi=Math.min(this.samples.length-1,lo+1);
    // Full source gesture with a short preparation and release, inside the
    // existing 2-second lifecycle. Root/legs/morphs remain owned by the stage.
    const weight=.75*ease(elapsed/.18)*(1-ease((elapsed-1.6)/.4));
    return Object.fromEntries(Object.keys(controls).map(n=>[n,new Quaternion().slerp(this.samples[lo][n].clone().slerp(this.samples[hi][n],index-lo),weight)]));
  }
}
