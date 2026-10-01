// Source-only Apache-2.0 derivative. Run overte-nod-inspect.mjs first.
import {readFile,writeFile} from 'node:fs/promises';
const source=JSON.parse(await readFile('artifacts/overte-nod/inspect.json','utf8'));
const names=['Spine2','Neck','Head','LeftArm','RightArm'];
const reference=Object.fromEntries(source.bones.filter(b=>names.includes(b.name)).map(b=>[b.name,{q:b.q,p:b.p}]));
const samples=source.samples.map(s=>({time:(s.frame-1)/30,rotations:Object.fromEntries(['Spine2','Neck','Head'].map(n=>[n,s.bones[n].q]))}));
const data=JSON.stringify({duration:54/30,reference,samples},(_,v)=>typeof v==='number'?Math.round(v*1e7)/1e7:v);
await writeFile('artifacts/overte-nod/overte-headnod.json',data+'\n');
console.log(JSON.stringify({samples:samples.length,bytes:data.length}));
