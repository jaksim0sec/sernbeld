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
    for (const {id,slot} of entries) {
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
              for (const i of [0, Math.floor(pos.count / 2), pos.count - 1]) {
                assert(mesh.userData.deformGarmentVertex(i).toArray().every(Number.isFinite), 'Invalid posed vertex');
              }
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
