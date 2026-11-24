import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
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
const baked=JSON.parse(gunzipSync(readFileSync('assets/models/clothing/runtime-bindings-v1.json.gz')));
source.garmentBakes=baked.bodies;source.garmentLayers=baked.layers;
const factory=createStudioGeometry(source);
const decode=(s,Type)=>{const b=Buffer.from(s,'base64');return new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const triKey=(a,b,c)=>[a,b,c].sort((x,y)=>x-y).join(':');
for(const sex of ['male','female']){
 const data=source.bodies[sex],positions=decode(data.p,Int16Array),fit=decode(data.face.fitted,Float32Array);
 const p=new Float32Array(Math.max(positions.length,data.face.start*3+fit.length));p.set(positions);p.set(fit,data.face.start*3);
 const idx=decode(data.f,data.indexType==='Uint32Array'?Uint32Array:Uint16Array);
 const rim=new Set(data.face.rimOriginal),lo=Math.min(data.bones.find(b=>b.id==='neck').pivot[1],data.bones.find(b=>b.id==='head').pivot[1])-38,hi=Math.max(data.bones.find(b=>b.id==='neck').pivot[1],data.bones.find(b=>b.id==='head').pivot[1])+30;
 let protectedTriangles=0;
 for(const [partIndex,part] of data.parts.entries()){
  const exact=new Set();
  for(let i=part.start;i<part.start+part.count;i+=3){
   const a=idx[i],b=idx[i+1],c=idx[i+2];
   if([a,b,c].some(v=>rim.has(v)||(p[v*3+1]>=lo&&p[v*3+1]<=hi)))exact.add(triKey(a,b,c));
  }
  protectedTriangles+=exact.size;
  for(const level of source.lod.bodies[sex].levels){
   const arr=decode(level[partIndex],Uint32Array),actual=new Set();
   for(let i=0;i<arr.length;i+=3)actual.add(triKey(arr[i],arr[i+1],arr[i+2]));
   for(const tri of exact)assert(actual.has(tri),'LOD removed protected neck triangle '+sex+' '+tri);
  }
 }
 assert(protectedTriangles>0);
 const actor=createStudioModel(T,factory,normalizeStudioCharacter({body:sex})),pants=actor.clothing.equip('pants.basic-trousers'),shirt=actor.clothing.equip('top.basic-shirt');
 const attr=pants.geometry.attributes.aLayerCover;
 assert(attr.array.some(x=>x===255)&&attr.array.some(x=>x===0),'No useful waistband layer');
 assert.equal(pants.material.uniforms.uLayerCover.value,1);
 const cover=actor.mesh.geometry.attributes.aClothCover.array,shirtMask=shirt.userData.garmentBinding.masks.get('top');
 const g=actor.mesh.geometry,neckY=data.bones.find(b=>b.id==='neck').pivot[1]/1428;
 for(let i=0;i<actor.bodyVertexCount;i++)if(g.attributes.position.getY(i)>=neckY+.03)assert(!shirtMask[i]&&!cover[i],'Exposed neck/head masked');
 actor.clothing.unequip('top');assert.equal(pants.material.uniforms.uLayerCover.value,0);
 actor.clothing.equip('top.basic-shirt');assert.equal(pants.material.uniforms.uLayerCover.value,1);
 for(let level=0;level<3;level++){actor.setLOD(level);for(const i of g.index.array)assert(i<g.attributes.position.count);}
 actor.group.position.set(40,3,-30);actor.group.rotation.y=.7;actor.group.scale.setScalar(.8);
 actor.pose({head:[25,20],neck:[20,0],waist:[-15,20],thigh_left:[30,4],shin_left:[45]});actor.group.updateMatrixWorld(true);
 for(const obj of [pants,actor.clothing.equip('top.basic-shirt'),actor.clothing.equip('collar.basic')]){
  obj.userData.updateGarmentPose();
  for(let i=0;i<obj.geometry.attributes.position.count;i+=97)assert(obj.userData.deformGarmentVertex(i).toArray().every(Number.isFinite));
 }
 console.log('PASS '+sex+' preserved neck triangles '+protectedTriangles+', waistband layer vertices '+attr.array.filter(x=>x===255).length);
 actor.dispose();
}
