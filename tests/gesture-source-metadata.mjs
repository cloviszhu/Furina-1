// Read-only source inspection; no playback, credentials, application or author code.
import { readFile, writeFile } from 'node:fs/promises';
import { Parser } from 'three/addons/libs/mmdparser.module.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
const buffer=async path=>{const b=await readFile(path);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
const parser=new Parser();
const vmd=parser.parseVmd(await buffer('artifacts/una-greet/extracted/Walk_cutely_and_wave/Walk cutely and wave.vmd'),true);
const names=[...new Set(vmd.motions.map(x=>x.boneName))];
const coverage=[];
for(const model of ['【芙宁娜】.pmx','【芙宁娜_荒】.pmx']){
 const pmx=parser.parsePmx(await buffer(process.env.EXO_MOTION_ASSETS+'/'+model),true),bones=new Set(pmx.bones.map(b=>b.name));
 coverage.push({model,bones:pmx.bones.length,matched:names.filter(n=>bones.has(n)),missing:names.filter(n=>!bones.has(n))});
}
let fbx,fbxError;
try{fbx=new FBXLoader().parse(await buffer('artifacts/overte-nod/source.fbx'),'');}catch(error){fbxError=error.message;}
const sourceBones=[];fbx?.traverse(b=>{if(b.isBone)sourceBones.push(b.name);});
const graph=JSON.parse(await readFile('artifacts/una-greet/overte-graph.json','utf8'));
const nodes=[];const walk=x=>{if(x&&typeof x==='object'){if(x.data?.url?.endsWith('/emote_agree_headnod.fbx'))nodes.push({id:x.id,...x.data});for(const v of Object.values(x))walk(v);}};walk(graph);
const result={vmd:{metadata:vmd.metadata,boneNames:names,maxFrame:Math.max(...vmd.motions.map(x=>x.frameNum)),coverage},fbx:{error:fbxError,bones:sourceBones,clips:fbx?.animations.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.map(t=>t.name)})),nodes}};
await writeFile('artifacts/gesture-source-metadata.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({vmd:{metadata:result.vmd.metadata,boneNames:names.length,maxFrame:result.vmd.maxFrame,coverage:coverage.map(c=>({model:c.model,bones:c.bones,matched:c.matched.length,missing:c.missing.length}))},fbx:{error:fbxError,nodes}}));
