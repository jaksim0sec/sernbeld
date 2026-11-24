import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createStudioGeometry} from '../src/entities/character/studio-geometry.js';
import {createStudioModel} from '../src/entities/character/studio-model.js';
import {normalizeStudioCharacter} from '../src/entities/character/appearance.js';
import {attentionRotations} from '../src/entities/character/attention-pose.js';
import {loadDefaultShirts} from '../src/entities/character/clothing/shirt-source.js';
// Test with the exact constructor surface passed by boot(), not the full Three export.
const allThree=new Function(readFileSync('src/vendor/three-gltf.part.js','utf8')+';return three_module_exports;')();
const gameSource=readFileSync('src/gameplay/gameplay.part.js','utf8');
const declared=gameSource.match(/const characterTypes=\{([^}]+)\};/);
assert(declared,'Game character constructor declaration missing');
const T=Object.fromEntries(declared[1].split(',').map(raw=>{
 const name=raw.trim();
 assert(Object.hasOwn(allThree,name),'Missing game Three export: '+name);
 return [name,allThree[name]];
}));
const source=JSON.parse(gunzipSync(readFileSync('assets/models/characters/studio-v1.json.gz')));
source.lod=JSON.parse(gunzipSync(readFileSync('assets/models/characters/studio-v1.lod.json.gz')));
const factory=createStudioGeometry(source);
import {loadDefaultPants} from '../src/entities/character/clothing/pants-source.js';
import {getClothing,getClothingAsset} from '../src/entities/character/clothing/registry.js';
const fetchLocal=async url=>new Response(readFileSync(url));
const shirts=await loadDefaultShirts(fetchLocal),pants=await loadDefaultPants(fetchLocal);
assert.equal(getClothing('pants.basic-trousers').slot,'pants');
assert.equal(getClothingAsset('pants.basic-trousers').status,'runtime');
for(const sex of ['male','female']){
 const profile=normalizeStudioCharacter({body:sex}),plain=createStudioModel(T,factory,profile);
 const body=plain.mesh.geometry.attributes.position.array.slice(),index=plain.mesh.geometry.index.array.slice();plain.dispose();
 source.defaultShirts=shirts;source.defaultPants=pants;
 const actor=createStudioModel(T,factory,profile),npc=createStudioModel(T,factory,profile);
 assert.deepEqual(actor.clothing.snapshot(),{'collar':'collar.basic','top':'top.basic-shirt','pants':'pants.basic-trousers'});
 assert.deepEqual(npc.clothing.snapshot(),actor.clothing.snapshot());
 assert.deepEqual(actor.mesh.geometry.attributes.position.array,body);assert.deepEqual(actor.mesh.geometry.index.array,index);
 const trousers=actor.clothing.equip('pants.basic-trousers'),other=npc.clothing.equip('pants.basic-trousers');
 assert.equal(trousers.geometry,other.geometry);
 const asset=pants[sex],raw=JSON.parse(gunzipSync(readFileSync('assets/models/clothing/pants-v1/pants_'+sex+'.json.gz')));
 assert.deepEqual(asset.position,Float32Array.from(raw.v));assert.deepEqual(asset.index,Uint16Array.from(raw.f));
 assert.equal(trousers.geometry.attributes.position.count,5471);assert.equal(trousers.geometry.index.count,32256);
 const binding=trousers.userData.garmentBinding,{rest,actual,slots,skinWeight}=binding;
 const mask=binding.masks.get('main');assert(mask.some(v=>v===255)&&mask.some(v=>v===0));
 assert(binding.diagnostics.maxFit<=.0120001);
 assert(trousers.material.fragmentShader.includes('pocketRelief')&&trousers.material.fragmentShader.includes('stitchMask')&&trousers.material.fragmentShader.includes('yarn'));
 assert.equal(trousers.material.uniforms.uPantsTop.value,asset.meta.top);
 const sign=Math.sign(actor.data.bones.find(b=>b.id==='thigh_left').pivot[0]-actor.data.bones.find(b=>b.id==='thigh_right').pivot[0])||1;
 const cuff=(i,side)=>asset.position[i*3+1]<=asset.meta.hem+.014&&(asset.position[i*3]*sign>=0?'left':'right')===side;
 for(let i=0;i<asset.position.length/3;i++){
  const w=skinWeight.subarray(i*slots,(i+1)*slots);assert(Math.abs(w.reduce((a,b)=>a+b,0)-1)<1e-6);
  for(const side of ['left','right'])if(cuff(i,side)){
   assert.equal(actor.bones[actual[i*slots]].name,'shin_'+side);assert(w[0]>.99999);
  }
 }
 const att=attentionRotations(actor.data.bones);
 for(const [name,r] of Object.entries(att))actor.B[name].quaternion.setFromRotationMatrix(new T.Matrix4().fromArray([r[0],r[1],r[2],0,r[3],r[4],r[5],0,r[6],r[7],r[8],0,0,0,0,1]));
 function points(){actor.group.updateMatrixWorld(true);trousers.userData.updateGarmentPose();return Array.from({length:rest.length/3},(_,i)=>trousers.userData.deformGarmentVertex(i));}
 const neutral=points();let error=0;
 for(let i=0;i<neutral.length;i++)error=Math.max(error,neutral[i].distanceTo(new T.Vector3().fromArray(rest,i*3)));
 assert(error<.0002,'Pants reference reconstruction '+error);
 const edges=[],seen=new Set();
 for(let i=0;i<asset.index.length;i+=3)for(let k=0;k<3;k++){
  let a=asset.index[i+k],b=asset.index[i+(k+1)%3];if(a>b)[a,b]=[b,a];const key=a*65536+b;if(seen.has(key))continue;seen.add(key);
  const l=neutral[a].distanceTo(neutral[b]);if(l>.001)edges.push([a,b,l]);
 }
 const cuffs=['left','right'].map(side=>edges.filter(([a,b])=>cuff(a,side)&&cuff(b,side)));
 assert(cuffs.every(e=>e.length>100));
 const poses=[
  {thigh_left:[30,4],shin_left:[45],thigh_right:[-25,4],shin_right:[12],waist:[-8,0]},
  {thigh_left:[64,3],shin_left:[68],thigh_right:[-7,3],shin_right:[24]},
  {thigh_left:[55,4],shin_left:[85],thigh_right:[55,4],shin_right:[85],waist:[-10,0]},
  {thigh_left:[15,22],shin_left:[25],thigh_right:[-10,22],shin_right:[15]}
 ];
 for(const pose of poses){
  actor.pose(pose);const pointsNow=points();
  for(const list of cuffs)for(const [a,b,l] of list)assert(Math.abs(pointsNow[a].distanceTo(pointsNow[b])/l-1)<.001,'Pants cuff stretched');
  const ratios=edges.map(([a,b,l])=>pointsNow[a].distanceTo(pointsNow[b])/l).sort((a,b)=>a-b);
  const maxExtension=edges.reduce((m,[a,b,l])=>Math.max(m,pointsNow[a].distanceTo(pointsNow[b])-l),0);
  assert(pointsNow.every(p=>p.toArray().every(Number.isFinite)));
  assert(ratios[Math.floor(ratios.length*.95)]<2.2&&maxExtension<.05,'Pants pose strain '+JSON.stringify({pose,p95:ratios[Math.floor(ratios.length*.95)],maxExtension}));
  console.log('PANTS STRAIN '+sex+' '+JSON.stringify({p95:ratios[Math.floor(ratios.length*.95)],maxExtension}));
 }
 actor.setFirst(true);assert(!trousers.visible);actor.setFirst(false);assert(trousers.visible);
 const npcMask=npc.mesh.geometry.attributes.aClothCover.array.slice(),coverage=actor.mesh.geometry.attributes.aClothCover.array;
 assert.deepEqual(coverage,npcMask);
 assert(actor.clothing.unequip('pants'));assert(actor.clothing.getEquipped('top')&&actor.clothing.getEquipped('collar'));
 assert(coverage.some((v,i)=>v!==npcMask[i]));assert.deepEqual(npc.mesh.geometry.attributes.aClothCover.array,npcMask);
 assert.equal(actor.clothing.equip('pants.basic-trousers').geometry,other.geometry);assert.deepEqual(coverage,npcMask);
 actor.dispose();npc.dispose();delete source.defaultShirts;delete source.defaultPants;
 console.log('PASS exact pants asset, default equipment, shared binding, gait, jump, crouch, cuffs and independent coverage '+sex);
}
