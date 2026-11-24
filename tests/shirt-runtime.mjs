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
for(const sex of ['male','female']){
 const profile=normalizeStudioCharacter({body:sex}),plain=createStudioModel(T,factory,profile);
 const position=plain.mesh.geometry.attributes.position.array.slice(),index=plain.mesh.geometry.index.array.slice();plain.dispose();
 source.defaultShirts=shirts;
 const actor=createStudioModel(T,factory,profile),npc=createStudioModel(T,factory,profile);
 assert.equal(actor.clothing.getEquipped('top'),'top.basic-shirt');assert.equal(npc.clothing.getEquipped('top'),'top.basic-shirt');
 assert.deepEqual(actor.mesh.geometry.attributes.position.array,position);assert.deepEqual(actor.mesh.geometry.index.array,index);
 const shirt=actor.clothing.equip('top.basic-shirt'),other=npc.clothing.equip('top.basic-shirt');
 assert.equal(shirt.geometry,other.geometry);assert.equal(shirt.geometry.attributes.position.count,shirts[sex].meta.vertices);
 assert.equal(shirt.geometry.index.count,shirts[sex].meta.triangles*3);
 // Verify actual skinned positions rather than checking finite uniforms.
 assert(shirt.isSkinnedMesh&&shirt.skeleton===actor.skeleton);
 assert(shirt.bindMatrix.equals(actor.mesh.bindMatrix));
 assert.equal(actor.mesh.material.uniforms.uClothCover.value,1);
 const coverage=actor.mesh.geometry.attributes.aClothCover.array;
 assert(coverage.some(v=>v===255)&&coverage.some(v=>v===0),'coverage must be selective');
 const att=attentionRotations(actor.data.bones);
 for(const [name,r] of Object.entries(att))actor.B[name].quaternion.setFromRotationMatrix(new T.Matrix4().fromArray([r[0],r[1],r[2],0,r[3],r[4],r[5],0,r[6],r[7],r[8],0,0,0,0,1]));
 actor.group.updateMatrixWorld(true);
 const g=shirt.geometry,rest=shirt.userData.referenceRest;
 const posed=i=>shirt.applyBoneTransform(i,new T.Vector3().fromBufferAttribute(g.attributes.position,i)).applyMatrix4(shirt.matrixWorld);
 let maxError=0;
 for(let i=0;i<g.attributes.position.count;i+=7)maxError=Math.max(maxError,posed(i).distanceTo(new T.Vector3().fromArray(rest,i*3)));
 assert(maxError<.0002,'attention pose reconstruction error '+maxError);
 const sleeve=Array.from({length:g.attributes.position.count},(_,i)=>i).filter(i=>shirts[sex].influence[i*4+3]===1&&shirts[sex].influence[i*4+2]===0&&shirts[sex].influence[i*4+1]>245);
 assert(sleeve.length>100,'missing right cuff');
 const fore=actor.bones.findIndex(b=>b.name==='forearm_right'),bound=sleeve.filter(i=>Array.from(g.attributes.skinIndex.array.subarray(i*4,i*4+4)).some((id,j)=>id===fore&&g.attributes.skinWeight.array[i*4+j]>.7));
 assert(bound.length>20,'right cuff lacks actual forearm influence');
 const samples=bound.filter((_,i)=>i%11===0),before=samples.map(posed);
 // Arbitrary real game shoulder and forearm rotations, including twist.
 actor.pose({upper_arm_right:[55,30],forearm_right:[90,0],ribcage:[15,10]});actor.group.updateMatrixWorld(true);shirt.userData.updateClothingPose();
 const after=samples.map(posed);
 assert(after.every(p=>p.toArray().every(Number.isFinite)));
 assert(after.some((p,i)=>p.distanceTo(before[i])>.10),'cuff is not following game bones');
 // Moving and rotating the whole NPC must move the cloth and body together.
 actor.group.position.set(30,4,-20);actor.group.rotation.y=.8;actor.group.scale.setScalar(.8);actor.group.updateMatrixWorld(true);
 const moved=samples.map(posed);
 assert(moved.every((p,i)=>p.distanceTo(after[i].clone().multiplyScalar(.8).applyAxisAngle(new T.Vector3(0,1,0),.8).add(actor.group.position))<.001),'clothing world transform mismatch');
 assert(shirt.userData.clothingDiagnostics.maxFit<=.0120001);
 console.log('SHIRT '+sex+' '+JSON.stringify({...shirt.userData.clothingDiagnostics,attentionError:maxError,cuffSamples:samples.length}));
 actor.setFirst(true);assert(shirt.visible);assert.equal(shirt.material.uniforms.uFirst.value,1);
 actor.setFirst(false);assert.equal(shirt.material.uniforms.uFirst.value,0);
 assert(actor.clothing.unequip('top'));assert.equal(actor.mesh.material.uniforms.uClothCover.value,0);
 actor.dispose();assert.equal(other.geometry.attributes.position.count,shirts[sex].meta.vertices);npc.dispose();
 delete source.defaultShirts;
 console.log('PASS default shirt, shared geometry, unchanged body, attention transform and pose: '+sex);
}
