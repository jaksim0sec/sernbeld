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
const shirts=await loadDefaultShirts(async url=>new Response(readFileSync(url)));
import {registerClothing} from '../src/entities/character/clothing/registry.js';
import {poseGrip} from '../src/entities/character/avatar-motion.js';
// Verify a second independent garment contributes coverage without replacing
// or mutating another actor's coverage attribute.
registerClothing({id:'test.vest',slot:'vest',name:'test',build(T,actor){
 const bodyCoverage=new Uint8Array(actor.mesh.geometry.attributes.position.count);bodyCoverage[0]=255;
 return {object:new T.Group(),bodyCoverage,dispose(){}};
}});
const edgeList=(index,rest,accept=()=>true)=>{
 const seen=new Set(),out=[];
 for(let i=0;i<index.length;i+=3)for(let k=0;k<3;k++){
  let a=index[i+k],b=index[i+(k+1)%3];if(a>b)[a,b]=[b,a];
  const key=a*65536+b;if(seen.has(key)||!accept(a,b))continue;seen.add(key);
  const l=Math.hypot(rest[a*3]-rest[b*3],rest[a*3+1]-rest[b*3+1],rest[a*3+2]-rest[b*3+2]);if(l>.001)out.push([a,b,l]);
 }
 return out;
};
function strain(edges,points){
 const ratios=edges.map(([a,b,l])=>points[a].distanceTo(points[b])/l).sort((a,b)=>a-b);
 const maxExtension=edges.reduce((m,[a,b,l])=>Math.max(m,points[a].distanceTo(points[b])-l),0);
 return {count:ratios.length,p95:ratios[Math.floor((ratios.length-1)*.95)],p99:ratios[Math.floor((ratios.length-1)*.99)],max:ratios.at(-1),maxExtension};
}
for(const sex of ['male','female']){
 const profile=normalizeStudioCharacter({body:sex}),plain=createStudioModel(T,factory,profile);
 const position=plain.mesh.geometry.attributes.position.array.slice(),index=plain.mesh.geometry.index.array.slice();plain.dispose();
 source.defaultShirts=shirts;
 const actor=createStudioModel(T,factory,profile),npc=createStudioModel(T,factory,profile);
 assert.equal(actor.clothing.getEquipped('top'),'top.basic-shirt');assert.equal(npc.clothing.getEquipped('top'),'top.basic-shirt');
 assert.equal(actor.clothing.getEquipped('collar'),'collar.basic');assert.equal(npc.clothing.getEquipped('collar'),'collar.basic');
 assert.deepEqual(actor.mesh.geometry.attributes.position.array,position);assert.deepEqual(actor.mesh.geometry.index.array,index);
 const shirt=actor.clothing.equip('top.basic-shirt'),other=npc.clothing.equip('top.basic-shirt'),collar=actor.clothing.equip('collar.basic'),otherCollar=npc.clothing.equip('collar.basic');
 assert.equal(shirt.geometry,other.geometry);assert.equal(collar.geometry,otherCollar.geometry);assert.equal(shirt.geometry.attributes.position,collar.geometry.attributes.position);
 assert.equal(shirt.geometry.index.count+collar.geometry.index.count,shirts[sex].meta.triangles*3,'lost or duplicated garment faces');
 assert.equal(actor.mesh.material.uniforms.uClothCover.value,1);
 const coverage=actor.mesh.geometry.attributes.aClothCover.array,npcCoverage=npc.mesh.geometry.attributes.aClothCover.array;
 assert(coverage.some(v=>v===255)&&coverage.some(v=>v===0),'coverage must be selective');
 assert.notEqual(coverage,npcCoverage,'actor coverage must not be shared');
 const originalCoverage=coverage.slice();
 actor.clothing.equip('test.vest');assert.equal(coverage[0],255);assert.deepEqual(npcCoverage,originalCoverage);
 actor.clothing.unequip('vest');assert.deepEqual(coverage,originalCoverage);
 const att=attentionRotations(actor.data.bones);
 for(const [name,r] of Object.entries(att))actor.B[name].quaternion.setFromRotationMatrix(new T.Matrix4().fromArray([r[0],r[1],r[2],0,r[3],r[4],r[5],0,r[6],r[7],r[8],0,0,0,0,1]));
 const bind=shirt.userData.garmentBinding,g=shirt.geometry,rest=bind.rest,n=rest.length/3,asset=shirts[sex];
 assert.equal(bind,collar.userData.garmentBinding,'collar/top must share reference transforms');
 function points(){actor.group.updateMatrixWorld(true);shirt.userData.updateClothingPose();collar.userData.updateClothingPose();return Array.from({length:n},(_,i)=>shirt.userData.deformGarmentVertex(i));}
 const base=points();
 let maxError=0;
 for(let i=0;i<n;i++)maxError=Math.max(maxError,base[i].distanceTo(new T.Vector3().fromArray(rest,i*3)));
 assert(maxError<.0002,'attention pose reconstruction error '+maxError);
 const cuff=(i,side)=>asset.influence[i*4+3]===1&&asset.influence[i*4+2]===side&&asset.influence[i*4+1]>248;
 const cuffs=[0,1].map(side=>edgeList(g.index.array,rest,(a,b)=>cuff(a,side)&&cuff(b,side)));
 const shoulder= i=>asset.influence[i*4+3]<2&&asset.influence[i*4]>0&&asset.influence[i*4+1]<30;
 const shoulderEdges=edgeList(g.index.array,rest,(a,b)=>shoulder(a)||shoulder(b));
 const allEdges=edgeList(asset.index,rest);
 for(let i=0;i<n;i++){
  const k=i*bind.slots,w=bind.skinWeight.subarray(k,k+bind.slots);assert(Math.abs(w.reduce((a,b)=>a+b,0)-1)<1e-6);
  if(cuff(i,0)||cuff(i,1)){
   const side=cuff(i,0)?'right':'left';
   assert.equal(actor.bones[bind.actual[k]].name,'forearm_'+side);assert(w[0]>.99999,'cuff not rigid');
  }
 }
 const poses=[
  {upper_arm_right:[55,30],forearm_right:[90,0],ribcage:[15,10]},
  {upper_arm_left:[65,55],forearm_left:[110,0],waist:[-12,15]},
  {upper_arm_right:[-25,45],upper_arm_left:[45,20],forearm_right:[65,0],forearm_left:[100,0]},
  {upper_arm_right:[75,75],upper_arm_left:[75,75],forearm_right:[120,0],forearm_left:[120,0]}
 ];
 let finalPoints;
 for(const angles of poses){
  actor.pose(angles);const p=points();finalPoints=p;
  for(const list of cuffs){const m=strain(list,p);assert(m.count>50&&m.max<1.001,'cuff stretched '+JSON.stringify(m));}
  const armpit=strain(shoulderEdges,p),whole=strain(allEdges,p);
  assert(armpit.p95<2.2&&armpit.p99<3.5&&armpit.maxExtension<.055,'shoulder strain '+JSON.stringify(armpit));
  assert(whole.p99<3.5,'garment strain '+JSON.stringify(whole));
  console.log('STRAIN '+sex+' '+JSON.stringify({armpit,whole}));
 }
 // Test the actual game wrist IK, including forearm twist.
 actor.pose({});actor.group.updateMatrixWorld(true);
 poseGrip(T,actor,'right',new T.Vector3(-.22,1.28,.38),new T.Vector3(.1,.8,.6).normalize(),new T.Vector3(1,0,0),new T.Vector3(-1,-.7,-.2));
 finalPoints=points();for(const list of cuffs)assert(strain(list,finalPoints).max<1.001,'IK cuff stretch');
 assert(finalPoints.some((p,i)=>cuff(i,0)&&p.distanceTo(base[i])>.10),'cuff is not following the actual game bones');
 actor.group.position.set(30,4,-20);actor.group.rotation.y=.8;actor.group.scale.setScalar(.8);
 const moved=points();
 for(let i=0;i<n;i+=19)assert(moved[i].distanceTo(finalPoints[i].clone().multiplyScalar(.8).applyAxisAngle(new T.Vector3(0,1,0),.8).add(actor.group.position))<.001,'garment world transform mismatch');
 actor.setFirst(true);assert(shirt.visible&&!collar.visible);assert.equal(shirt.material.uniforms.uFirst.value,1);
 actor.setFirst(false);assert(collar.visible);assert.equal(shirt.material.uniforms.uFirst.value,0);
 assert(actor.clothing.unequip('collar'));assert(actor.clothing.getEquipped('top'));assert.equal(actor.mesh.material.uniforms.uClothCover.value,1);
 const replacement=actor.clothing.equip('collar.basic');assert.equal(replacement.geometry,otherCollar.geometry);
 assert(actor.clothing.unequip('top'));assert.equal(actor.mesh.material.uniforms.uClothCover.value,0);assert.equal(actor.clothing.getEquipped('collar'),'collar.basic');
 assert.deepEqual(npcCoverage,originalCoverage);
 actor.dispose();assert.equal(other.geometry.attributes.position.count,asset.meta.vertices);npc.dispose();
 delete source.defaultShirts;
 console.log('PASS garment assembly, isolated layered coverage, rigid cuff, shoulder strain and actual IK '+sex);
}
