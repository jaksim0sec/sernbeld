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
 assert.equal(typeof allThree[name],'function','Missing game constructor: '+name);
 return [name,allThree[name]];
}));
const source=JSON.parse(gunzipSync(readFileSync('assets/models/characters/studio-v1.json.gz')));
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
 // At the editor attention pose the garment reference matrices must be identity.
 const att=attentionRotations(actor.data.bones);
 for(const [name,r] of Object.entries(att))actor.B[name].quaternion.setFromRotationMatrix(new T.Matrix4().fromArray([r[0],r[1],r[2],0,r[3],r[4],r[5],0,r[6],r[7],r[8],0,0,0,0,1]));
 actor.group.updateMatrixWorld(true);shirt.userData.updateClothingPose();
 for(const q of shirt.material.uniforms.uReal.value)assert(Math.hypot(q.x,q.y,q.z)<1e-5&&Math.abs(Math.abs(q.w)-1)<1e-5,'non-identity reference rotation');
 for(const d of shirt.material.uniforms.uDual.value)assert(Math.hypot(d.x,d.y,d.z,d.w)<1e-5,'non-identity reference translation');
 actor.pose({upper_arm_right:[55,30],forearm_right:[90,0],ribcage:[15,10]});actor.group.updateMatrixWorld(true);shirt.userData.updateClothingPose();
 for(const q of [...shirt.material.uniforms.uReal.value,...shirt.material.uniforms.uDual.value])assert(q.toArray().every(Number.isFinite));
 actor.setFirst(true);assert(shirt.visible);assert.equal(shirt.material.uniforms.uFirst.value,1);
 actor.setFirst(false);assert.equal(shirt.material.uniforms.uFirst.value,0);
 actor.dispose();assert.equal(other.geometry.attributes.position.count,shirts[sex].meta.vertices);npc.dispose();
 delete source.defaultShirts;
 console.log('PASS default shirt, shared geometry, unchanged body, attention transform and pose: '+sex);
}
