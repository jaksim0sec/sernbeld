import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {normalizeStudioCharacter} from '../src/entities/character/appearance.js';
import {createStudioGeometry} from '../src/entities/character/studio-geometry.js';
import {createStudioModel} from '../src/entities/character/studio-model.js';
import {getClothing} from '../src/entities/character/clothing/registry.js';
import {loadDefaultShirts} from '../src/entities/character/clothing/shirt-source.js';
import {loadDefaultPants} from '../src/entities/character/clothing/pants-source.js';
import {poseActor, poses} from './dev/poses.js';
import {edgeMetrics} from './infra-contract.mjs';

const args = process.argv.slice(2);
if (args[0] === '--module') {
  assert(args[1], 'Provide a local registration module');
  await import(pathToFileURL(args[1]).href);
  args.splice(0, 2);
}
assert(args.length > 0, 'Usage: node tools/check-garment.mjs [--module file.js] <id...>');
const entries = args.map(id => {
  const entry = getClothing(id);
  assert(entry, 'Unknown clothing: ' + id);
  return entry;
});
const readGzip = path => JSON.parse(gunzipSync(readFileSync(path)));
const fetchLocal = async url => new Response(readFileSync(url));
const T = new Function(readFileSync('src/vendor/three-gltf.part.js', 'utf8') + ';return three_module_exports;')();
const source = readGzip('assets/models/characters/studio-v1.json.gz');
source.lod = readGzip('assets/models/characters/studio-v1.lod.json.gz');
const bakes = readGzip('assets/models/clothing/runtime-bindings-v1.json.gz');
source.garmentBakes = bakes.bodies;
source.garmentLayers = bakes.layers;
[source.defaultShirts, source.defaultPants] = await Promise.all([loadDefaultShirts(fetchLocal), loadDefaultPants(fetchLocal)]);
const factory = createStudioGeometry(source);
for (const body of ['male','female']) {
  const actor = createStudioModel(T, factory, normalizeStudioCharacter({body}));
  try {
    for (const {id,slot,validation} of entries) {
      const reference=new Map();
      const prior = actor.clothing.getEquipped(slot);
      const object = actor.clothing.equip(id);
      assert.equal(actor.clothing.getEquipped(slot), id);
      for (const level of [0,1,2]) {
        actor.setLOD(level);
        assert.equal(actor.mesh.geometry.index.count, actor.lodLevels[level] * 3);
        for (const pose of Object.keys(poses)) {
          poseActor(T, actor, pose);
          let meshes = 0;
          object.traverse(mesh => {
            if (!mesh.isMesh) return;
            meshes++;
            const pos = mesh.geometry.getAttribute('position');
            assert(pos?.count >= 3 && pos.array.every(Number.isFinite), 'Invalid garment positions');
            if (mesh.geometry.index) {
              assert(mesh.geometry.index.array.every(i => i < pos.count), 'Garment index out of range');
            }
            const binding = mesh.userData.garmentBinding;
            if (binding) {
              const levels = [...binding.partLods.values()].find(list => list.includes(mesh.geometry));
              assert(levels, 'Garment geometry is outside the registered LOD levels');
              assert.equal(mesh.geometry, levels[Math.min(levels.length - 1, level)], 'Wrong garment LOD');
              mesh.userData.updateGarmentPose();
              const used=new Set(mesh.geometry.index?.array??Array.from({length:pos.count},(_,i)=>i));
              const points=new Float64Array(pos.count*3);
              for(const i of used) {const p=mesh.userData.deformGarmentVertex(i);assert(p.toArray().every(Number.isFinite),'Invalid posed vertex');p.toArray(points,i*3);}
              if(validation?.minBones){const active=new Set();for(const i of used)for(let k=0;k<binding.slots;k++){const j=i*binding.slots+k;if(binding.skinWeight[j]>.01)active.add(binding.actual[j]);}assert(active.size>=validation.minBones,'Insufficient deformation bone coverage');}
              if(mesh.geometry.index){const key=mesh.uuid+':'+level;if(pose==='attention')reference.set(key,points);else{const baseline=reference.get(key);assert(baseline,'Missing reference pose');const metrics=edgeMetrics(baseline,points,mesh.geometry.index.array);console.log('POSE METRICS',body,id,level,pose,JSON.stringify(metrics));if(validation?.maxP95!==undefined)assert(metrics.p95<=validation.maxP95,'Excessive garment edge strain');if(validation?.maxExtension!==undefined)assert(metrics.maxExtension<=validation.maxExtension,'Excessive garment edge extension');}}
            }
          });
          assert(meshes > 0, 'No garment meshes');
        }
      }
      const thirdVisible = object.visible;
      actor.setFirst(true);
      assert.equal(actor.mesh.material.uniforms.uFirst.value, 1);
      assert.equal(actor.clothing.getEquipped(slot), id);
      actor.setFirst(false);
      assert.equal(actor.mesh.material.uniforms.uFirst.value, 0);
      assert.equal(object.visible, thirdVisible, 'Garment visibility was not restored');
      assert(actor.clothing.unequip(slot));
      assert(!object.parent);
      if (prior) actor.clothing.equip(prior);
      console.log('PASS', body, id, 'structural smoke: 5 poses × 3 LODs, mode transition and detach');
    }
  } finally {
    actor.dispose();
  }
}
