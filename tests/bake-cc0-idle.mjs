// Offline extraction of Quaternius CC0 source motion, never target PMX data.
import { readFile, writeFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationMixer, LoopOnce, Quaternion, Vector3 } from 'three';
const file=process.argv[2];
if(!file)throw Error('Pass the locally verified UAL1_Standard.glb');
const bytes=await readFile(file);
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const names=['pelvis','spine_01','spine_02','spine_03','neck_01','Head','clavicle_l','clavicle_r','upperarm_l','upperarm_r','lowerarm_l','lowerarm_r','hand_l','hand_r','thigh_l','thigh_r','calf_l','calf_r','foot_l','foot_r'];
const mixer=new AnimationMixer(gltf.scene),q=new Quaternion(),v=new Vector3();
const play=name=>{mixer.stopAllAction();const a=mixer.clipAction(gltf.animations.find(c=>c.name===name));a.setLoop(LoopOnce,1);a.clampWhenFinished=true;a.play();mixer.setTime(0);gltf.scene.updateMatrixWorld(true);};
play('A_TPose');
const reference=Object.fromEntries(names.map(n=>[n,{q:gltf.scene.getObjectByName(n).getWorldQuaternion(q).toArray(),p:gltf.scene.getObjectByName(n).getWorldPosition(v).toArray()}]));
for(const side of ['l','r'])reference['hand_'+side].axis=gltf.scene.getObjectByName('middle_01_'+side).getWorldPosition(new Vector3()).sub(new Vector3(...reference['hand_'+side].p)).normalize().toArray();
play('Idle_Loop');
const duration=gltf.animations.find(c=>c.name==='Idle_Loop').duration,samples=[];
for(let i=0;i<=Math.round(duration*30);i++){
 const time=i/30;mixer.setTime(time);gltf.scene.updateMatrixWorld(true);
 samples.push({time,hip:gltf.scene.getObjectByName('pelvis').getWorldPosition(v).toArray(),rotations:Object.fromEntries(names.map(n=>[n,gltf.scene.getObjectByName(n).getWorldQuaternion(q).toArray()]))});
}
const round=x=>typeof x==='number'?Math.round(x*1e7)/1e7:x;
const data=JSON.stringify({duration,reference,samples},(_,x)=>round(x));
await writeFile('src/motion-idle-data.js',`// Quaternius Universal Animation Library Standard: Idle_Loop + A_TPose reference.\n// CC0 1.0; see docs/motion-idle-license.md. Source rig only, no user PMX data.\nexport const idleSource = ${data};\n`);
console.log(JSON.stringify({samples:samples.length,sourceBones:names.length,bytes:data.length}));
