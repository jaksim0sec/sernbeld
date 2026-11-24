// Offline default garment binding. No surface search or graph smoothing in
// production browser startup. Output is deterministic and checked by CI.
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createStudioGeometry} from '../src/entities/character/studio-geometry.js';
import {createStudioModel} from '../src/entities/character/studio-model.js';
import {normalizeStudioCharacter} from '../src/entities/character/appearance.js';
import {loadDefaultShirts} from '../src/entities/character/clothing/shirt-source.js';
import {loadDefaultPants} from '../src/entities/character/clothing/pants-source.js';
import {listClothing} from '../src/entities/character/clothing/registry.js';
import {bakeGarmentLayer} from '../src/entities/character/clothing/garment-binding.js';
import {simplify} from './optimize-characters.mjs';
const T=new Function(readFileSync('src/vendor/three-gltf.part.js','utf8')+';return three_module_exports;')();
const source=JSON.parse(gunzipSync(readFileSync('assets/models/characters/studio-v1.json.gz')));
source.lod=JSON.parse(gunzipSync(readFileSync('assets/models/characters/studio-v1.lod.json.gz')));
const fetchLocal=async url=>new Response(readFileSync(url));
[source.defaultShirts,source.defaultPants]=await Promise.all([loadDefaultShirts(fetchLocal),loadDefaultPants(fetchLocal)]);
const factory=createStudioGeometry(source),bodies={},layers={};
const entries=listClothing().filter(entry=>entry.bakeId);
if(new Set(entries.map(entry=>entry.bakeId)).size!==entries.length)throw Error('Duplicate garment bake ID');
const enc=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength).toString('base64');
const masks=map=>Object.fromEntries([...map].map(([id,a])=>[id,enc(a)]));
for(const sex of ['male','female']){
 const actor=createStudioModel(T,factory,normalizeStudioCharacter({body:sex}));
 const bindings=new Map();
 const record=({id,bakeId})=>{
  const b=actor.clothing.equip(id).userData.garmentBinding;
  if(!b)throw Error('Garment '+id+' must use the garment binder to be baked');
  bindings.set(bakeId,b);
  return {version:1,revision:b.revision,policy:bakeId,bodyVertices:actor.bodyVertexCount,vertices:b.rest.length/3,indices:b.geometry.index.count,slots:b.slots,bones:actor.bones.map(b=>b.name),rest:enc(b.rest),actual:enc(b.actual),skinWeight:enc(b.skinWeight),masks:masks(b.masks),firstMasks:masks(b.firstMasks),frame:b.ref.frame.elements,inverseBones:b.ref.inverseBones.map(m=>m.elements),diagnostics:b.diagnostics};
 };
 bodies[sex]=Object.fromEntries(entries.map(entry=>[entry.bakeId,record(entry)]));
 const shirt=bindings.get('shirt-v1'),pants=bindings.get('pants-v1');
 const asset=source.defaultShirts[sex];
 const cover=bakeGarmentLayer(pants,shirt,{centerZ:.035,accept:(a,b,c)=>[a,b,c].every(i=>i<asset.meta.shirtVertices&&asset.influence[i*4]<48&&asset.influence[i*4+3]===0)});
 const hidden=cover.reduce((n,v)=>n+(v?1:0),0);
 console.log('Layer coverage '+sex+' '+hidden+'/'+cover.length);
 if(hidden===0||hidden>cover.length*.4)throw Error('Implausible garment layer coverage '+sex+' '+hidden);
 layers[sex]={'pants-v1|shirt-v1':enc(cover)};
 // Preserve authored panel borders and all inner/outer mask boundaries.
 // Reduce only the far index lists; the near mesh is never changed.
 for(const [id,b] of bindings){
  const record=bodies[sex][id];record.lod={};
  const n=b.rest.length/3,groups=new Int32Array(n);
  for(let i=0;i<n;i++)groups[i]=b.actual[i*b.slots]*2+(id==='pants-v1'&&cover[i]?1:0);
  for(const [part,g] of b.parts){
   const index=g.index.array;
   if(index.length<900)continue;
   const lock=new Uint8Array(n);
   if(id==='pants-v1'){
    for(let i=0;i<index.length;i+=3){
     const a=index[i],c=index[i+1],d=index[i+2];
     if(cover[a]!==cover[c]||cover[a]!==cover[d])lock[a]=lock[c]=lock[d]=1;
    }
   }
   // Geometry positions and normals remain the approved data. The source
   // simplifier locks geometric borders and prevents non-manifold collapses.
   const lists=simplify(b.rest,index,[.40,.18],{groups,lock:i=>Boolean(lock[i]),protectJoints:true});
   if(lists[0].length<index.length&&lists[1].length<lists[0].length)record.lod[part]=lists.map(a=>({data:enc(a),count:a.length}));
   console.log('Garment LOD '+sex+' '+part+' '+[index.length,...lists.map(a=>a.length)].map(a=>a/3).join('/'));
  }
 }
 actor.dispose();
}
const target='assets/models/clothing/runtime-bindings-v1.json.gz';
const json=Buffer.from(JSON.stringify({version:2,bodies,layers}));
if(process.argv.includes('--check')){
 const existing=gunzipSync(readFileSync(target));
 if(!existing.equals(json))throw Error(target+' is stale. Run node tools/bake-garments.mjs');
 console.log('Verified baked bindings on both body types');
}else{
 const out=gzipSync(json,{level:9});
 writeFileSync(target,out);
 console.log('Baked both body types: '+out.length+' bytes');
}
