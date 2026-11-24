import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createStudioGeometry} from '../src/entities/character/studio-geometry.js';
import {createStudioModel} from '../src/entities/character/studio-model.js';
import {normalizeStudioCharacter,resolveNpcAppearance} from '../src/entities/character/appearance.js';
import {loadDefaultShirts} from '../src/entities/character/clothing/shirt-source.js';
import {loadDefaultPants} from '../src/entities/character/clothing/pants-source.js';
import {attentionRotations} from '../src/entities/character/attention-pose.js';
const T=new Function(readFileSync('src/vendor/three-gltf.part.js','utf8')+';return three_module_exports;')();
const source=JSON.parse(gunzipSync(readFileSync('assets/models/characters/studio-v1.json.gz')));
source.lod=JSON.parse(gunzipSync(readFileSync('assets/models/characters/studio-v1.lod.json.gz')));
const fetchLocal=async url=>new Response(readFileSync(url));
[source.defaultShirts,source.defaultPants]=await Promise.all([loadDefaultShirts(fetchLocal),loadDefaultPants(fetchLocal)]);
const baked=JSON.parse(gunzipSync(readFileSync('assets/models/clothing/runtime-bindings-v1.json.gz')));
source.garmentBakes=baked.bodies;source.garmentLayers=baked.layers;
const factory=createStudioGeometry(source);
for(const sex of ['male','female']){
 const start=performance.now(),actors=[];
 for(let i=0;i<6;i++){
  const profile=i===0?normalizeStudioCharacter({body:sex}):resolveNpcAppearance({id:'startup'+i,gender:sex,name:'npc'+i}).character;
  const actor=createStudioModel(T,factory,profile);actors.push(actor);
  const shirt=actor.clothing.equip('top.basic-shirt'),pants=actor.clothing.equip('pants.basic-trousers');
  assert(shirt.userData.garmentBinding.diagnostics.prebaked&&pants.userData.garmentBinding.diagnostics.prebaked,'startup ran the garment solver');
  assert.equal(actor.bodyVertexCount,source.garmentBakes[sex]['shirt-v1'].bodyVertices);
  if(i){
   assert.equal(shirt.geometry,actors[0].clothing.equip('top.basic-shirt').geometry,'face variation rebuilt shirt');
   assert.equal(pants.geometry,actors[0].clothing.equip('pants.basic-trousers').geometry,'face variation rebuilt pants');
  }
  const att=attentionRotations(actor.data.bones);
  for(const [name,r] of Object.entries(att))actor.B[name].quaternion.setFromRotationMatrix(new T.Matrix4().fromArray([r[0],r[1],r[2],0,r[3],r[4],r[5],0,r[6],r[7],r[8],0,0,0,0,1]));
  actor.group.updateMatrixWorld(true);
  for(const object of [shirt,pants]){
   const b=object.userData.garmentBinding,ref=b.ref.frame.elements,expected=new T.Vector3();
   object.userData.updateGarmentPose();
   for(let j=0;j<b.rest.length/3;j+=107){
    expected.fromArray(b.rest,j*3).divideScalar(ref[0]);expected.y-=ref[13]/ref[0];expected.applyMatrix4(actor.model.matrixWorld);
    assert(object.userData.deformGarmentVertex(j).distanceTo(expected)<.0002,'canonical reference does not match actor frame');
   }
  }
 }
 // Body (not facial feature) vertex ordering and geometry are stable below
 // the neck; coverage arrays can be shared regardless of face styling.
 const a=actors[0],p=a.mesh.geometry.attributes.position.array;
 for(const other of actors.slice(1)){
  const q=other.mesh.geometry.attributes.position.array;
  for(let i=0;i<a.bodyVertexCount;i++)if(p[i*3+1]<.28){
   assert.equal(p[i*3],q[i*3]);assert.equal(p[i*3+1],q[i*3+1]);assert.equal(p[i*3+2],q[i*3+2]);
  }
 }
 console.log('PASS '+sex+' six unique faces share prebaked shirt and pants; '+Math.round(performance.now()-start)+' ms');
 actors.forEach(a=>a.dispose());
}
const game=readFileSync('src/gameplay/gameplay.part.js','utf8');
const constructor=game.slice(game.indexOf('var Townsfolk = class'),game.indexOf('  ensureActor(n)'));
assert(!constructor.includes('const ch = makeCharacter('),'NPC construction still blocks boot');
assert(game.includes('this.ensureActor(pendingModel);this.nextModelAt=t+.08;'));
const editor=readFileSync('src/entities/character/studio.html','utf8');
assert(editor.includes('await loadStudioBody()')&&!editor.includes('await loadStudioSource()'));
console.log('PASS nonblocking resident startup and body-only editor loading');
