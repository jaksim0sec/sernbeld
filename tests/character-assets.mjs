import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {
  CHARACTER_MODELS, CHARACTER_SKINS, DEFAULT_CHARACTER_SKIN,
  getCharacterSkin, loadRegisteredCharacter
} from '../src/entities/character/registry.js';
import {calculateFemalePose,validateFemaleBaseData} from '../src/entities/character/female-base.js';
import {STANDARD_SKIN_ID,STANDARD_SKIN,createStandardSkinMaterials} from '../src/render/materials/standard-skin.js';

const source=JSON.parse(await readFile('assets/models/characters/female-base-v1.mesh.json','utf8'));
validateFemaleBaseData(source);
assert.equal(CHARACTER_MODELS['female-base-v1'].vertexCount,34812);
assert.equal(CHARACTER_MODELS['female-base-v1'].triangleCount,69556);
assert.equal(source.parts.reduce((sum,p)=>sum+p.count,0)/3,69556);
assert.equal(CHARACTER_MODELS['female-base-v1'].skinId,STANDARD_SKIN_ID);
assert.equal(DEFAULT_CHARACTER_SKIN,STANDARD_SKIN_ID);
assert.deepEqual(getCharacterSkin(),STANDARD_SKIN);
assert.equal(CHARACTER_SKINS[STANDARD_SKIN_ID],STANDARD_SKIN);
assert.deepEqual(STANDARD_SKIN.bright,[0.988,0.847,0.769]);
assert.deepEqual(STANDARD_SKIN.shadow,[0.914,0.675,0.596]);
assert.deepEqual(STANDARD_SKIN.outline,[0.69,0.44,0.39]);
const matrices=calculateFemalePose(source.bones,{head:[15,0]});
assert.equal(matrices.size,47);
assert(Math.abs(matrices.get('head').rotation[0]-1)>0.0001,'Head pose is inert');
const fetchImpl=async url=>({
  ok:true,status:200,
  json:async()=>source
});
const model=await loadRegisteredCharacter(THREE,{fetchImpl,pose:{head:[15,0]}});
assert.equal(model.group.children.length,34);
assert.equal(model.bones.length,47);
assert.equal(model.hands.length,2);
let faces=0;
for(let i=0;i<model.group.children.length;i+=2){
  const front=model.group.children[i],outline=model.group.children[i+1];
  assert(front.geometry===outline.geometry,'Hull must share the original surface topology');
  assert.equal(front.material.side,THREE.DoubleSide);
  assert.equal(outline.material.side,THREE.BackSide);
  assert.equal(outline.material.depthWrite,false);
  assert.equal(front.geometry.getAttribute('aPosition').count,34812);
  assert.equal(front.geometry.getAttribute('aNormal').count,34812);
  assert.equal(front.geometry.getAttribute('aJoints').count,34812);
  assert.equal(front.geometry.getAttribute('aWeights').count,34812);
  assert(front.material.vertexShader.includes('uSkin[16]'));
  assert(front.material.fragmentShader.includes('smoothstep'));
  faces+=front.geometry.index.count/3;
}
assert.equal(faces,69556);
const before=model.group.children[0].material.uniforms.uSkin.value[8].elements.slice();
model.setPose({head:[30,0]});
const after=model.group.children[0].material.uniforms.uSkin.value[8].elements;
assert.notDeepEqual(before,after,'Material pose matrix is not refreshed');
model.dispose();
const standalone=createStandardSkinMaterials(THREE);
assert.equal(standalone.solid.uniforms.uOutline.value,0);
assert.equal(standalone.outline.uniforms.uOutline.value,0.00085);
standalone.dispose();
console.log('PASS: female model registry, 34812 vertices, 69556 triangles, 47 bones, 17 parts, source shader colors and live pose matrices');
