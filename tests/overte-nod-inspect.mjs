// Offline diagnostic of the installed Three loader on the single official FBX.
// Never runs Overte/Hanami application code. Empty partial finger channels are
// skipped for inspection only; stock-loader failure remains recorded separately.
import { readFile, writeFile } from 'node:fs/promises';
import { AnimationMixer, Quaternion, Vector3 } from 'three';
const loaderURL=import.meta.resolve('three/addons/loaders/FBXLoader.js');
let code=await readFile(new URL(loaderURL),'utf8');
code=code.replace(/from '([^']+)'/g,(_,specifier)=>`from '${specifier==='three'?import.meta.resolve('three'):new URL(specifier,loaderURL).href}'`);
code=code.replace("if ( ! values || ! times ) return new QuaternionKeyframeTrack( modelName + '.quaternion', [], [] );","if ( ! values || ! times || times.length === 0 ) return undefined;");
const {FBXLoader,BinaryParser}=await import('data:text/javascript;base64,'+Buffer.from(code+'\nexport {BinaryParser};').toString('base64'));
const bytes=await readFile('artifacts/overte-nod/source.fbx');
const tree=new BinaryParser().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const layers=Object.values(tree.Objects.AnimationLayer).map(layer=>({id:layer.id,name:layer.attrName,connections:tree.Connections.connections.filter(c=>c[0]===layer.id||c[1]===layer.id).length}));
const fbx=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
fbx.updateMatrixWorld(true);
const bones=[];fbx.traverse(b=>{if(b.isBone)bones.push({name:b.name,parent:b.parent.name,p:b.getWorldPosition(new Vector3()).toArray(),q:b.getWorldQuaternion(new Quaternion()).toArray()});});
const clips=fbx.animations.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.map(t=>({name:t.name,keys:t.times.length}))}));
const mixer=new AnimationMixer(fbx),clip=fbx.animations[0],action=mixer.clipAction(clip).play();
const samples=[];for(let f=1;f<=55;f++){mixer.setTime(f/30);fbx.updateMatrixWorld(true);samples.push({frame:f,bones:Object.fromEntries(['Hips','Spine','Spine1','Spine2','Neck','Head'].map(n=>{const b=fbx.getObjectByName(n);return[n,b?{q:b.getWorldQuaternion(new Quaternion()).toArray(),p:b.getWorldPosition(new Vector3()).toArray()}:null];}))});}
await writeFile('artifacts/overte-nod/inspect.json',JSON.stringify({bones,clips,samples,layers},null,2));
console.log(JSON.stringify({bones:bones.length,layers,clips:clips.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.length})),selected:clips[0].tracks.filter(t=>/Neck|Head|Spine/.test(t.name))}));
