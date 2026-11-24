// Offline default garment binding. No surface search or graph smoothing in
// production browser startup. Output is deterministic and checked by CI.
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createStudioGeometry} from '../src/entities/character/studio-geometry.js';
import {createStudioModel} from '../src/entities/character/studio-model.js';
import {normalizeStudioCharacter} from '../src/entities/character/appearance.js';
import {loadDefaultShirts} from '../src/entities/character/clothing/shirt-source.js';
import {loadDefaultPants} from '../src/entities/character/clothing/pants-source.js';
const T=new Function(readFileSync('src/vendor/three-gltf.part.js','utf8')+';return three_module_exports;')();
const source=JSON.parse(gunzipSync(readFileSync('assets/models/characters/studio-v1.json.gz')));
source.lod=JSON.parse(gunzipSync(readFileSync('assets/models/characters/studio-v1.lod.json.gz')));
const fetchLocal=async url=>new Response(readFileSync(url));
[source.defaultShirts,source.defaultPants]=await Promise.all([loadDefaultShirts(fetchLocal),loadDefaultPants(fetchLocal)]);
const factory=createStudioGeometry(source),bodies={};
const enc=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength).toString('base64');
const masks=map=>Object.fromEntries([...map].map(([id,a])=>[id,enc(a)]));
for(const sex of ['male','female']){
 const actor=createStudioModel(T,factory,normalizeStudioCharacter({body:sex}));
 const record=(id,policy)=>{
  const b=actor.clothing.equip(id).userData.garmentBinding;
  return {version:1,policy,bodyVertices:actor.bodyVertexCount,vertices:b.rest.length/3,indices:b.geometry.index.count,slots:b.slots,bones:actor.bones.map(b=>b.name),rest:enc(b.rest),actual:enc(b.actual),skinWeight:enc(b.skinWeight),masks:masks(b.masks),firstMasks:masks(b.firstMasks),frame:b.ref.frame.elements,inverseBones:b.ref.inverseBones.map(m=>m.elements),diagnostics:b.diagnostics};
 };
 bodies[sex]={'shirt-v1':record('top.basic-shirt','shirt-v1'),'pants-v1':record('pants.basic-trousers','pants-v1')};
 actor.dispose();
}
const out=gzipSync(Buffer.from(JSON.stringify({version:1,bodies})),{level:9});
writeFileSync('assets/models/clothing/runtime-bindings-v1.json.gz',out);
console.log('Baked both body types: '+out.length+' bytes');
