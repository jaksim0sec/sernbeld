import {readFile, writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';

const [input, output, ...extra] = process.argv.slice(2);
if (!input || !output?.endsWith('.mjs') || extra.length) {
  throw new Error('Usage: node tools/extract-garment.mjs <source.glb[.gz]> <geometry.mjs>');
}
const raw = await readFile(input);
const bytes = input.endsWith('.gz') ? gunzipSync(raw) : raw;
if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 ||
    bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length ||
    bytes.readUInt32LE(16) !== 0x4e4f534a) {
  throw new Error('Expected a binary glTF 2 file');
}
const header = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
if (header.images?.length || header.skins?.length || header.buffers?.some(buffer => buffer.uri)) {
  throw new Error('Export static GLB geometry without images, skinning or external buffers');
}
if (header.meshes?.some(mesh => mesh.primitives.some(part => part.targets?.length || (part.mode !== undefined && part.mode !== 4)))) {
  throw new Error('Export static triangles without morph targets in the source GLB');
}

const vendor = await readFile(new URL('../src/vendor/three-gltf.part.js', import.meta.url), 'utf8');
const GLTFLoader = new Function(vendor + '\nreturn GLTFLoader;')();
const {scene} = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
scene.updateMatrixWorld(true);
const lines = [];
const encode = (type, values) => type + '.from([' + Array.from(values).join(',') + '])';
scene.traverse(node => {
  if (!node.isMesh) return;
  const geometry = node.geometry.clone();
  try {
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    geometry.applyMatrix4(node.matrixWorld);
    const read = (name, required = true) => {
      const attribute = geometry.getAttribute(name);
      if (!attribute && !required) return null;
      if (!attribute) throw new Error('Missing ' + name + ' on ' + node.name);
      const components = ['getX','getY','getZ','getW'].slice(0,attribute.itemSize);
      const values = new Float32Array(attribute.count * attribute.itemSize);
      for (let i = 0; i < attribute.count; i++) {
        for (let k = 0; k < components.length; k++) values[i * attribute.itemSize + k] = attribute[components[k]](i);
      }
      if (!values.every(Number.isFinite)) throw new Error('Non-finite ' + name + ' on ' + node.name);
      return values;
    };
    const position = read('position'), normal = read('normal'), uv = read('uv', false);
    const count = position.length / 3;
    const index = geometry.index ? Uint32Array.from(geometry.index.array) : Uint32Array.from({length:count}, (_, i) => i);
    if (!index.length || index.length % 3 || index.some(i => i >= count)) throw new Error('Invalid triangle index on ' + node.name);
    if (node.matrixWorld.determinant() < 0) {
      for (let i = 0; i < index.length; i += 3) [index[i+1],index[i+2]] = [index[i+2],index[i+1]];
    }
    lines.push([
      'name:' + JSON.stringify(node.name),
      'material:' + JSON.stringify(node.material.name),
      'position:' + encode('Float32Array', position),
      'normal:' + encode('Float32Array', normal),
      'index:' + encode(count > 65536 ? 'Uint32Array' : 'Uint16Array', index),
      ...(uv ? ['uv:' + encode('Float32Array', uv)] : [])
    ].join(',\n    '));
  } finally {
    geometry.dispose();
  }
});
if (!lines.length) throw new Error('Source GLB has no mesh');
const moduleSource = '// Meshes in GLB world coordinates. Keep the authored GLB as source.\nexport default [\n  {\n    ' +
  lines.join('\n  },\n  {\n    ') + '\n  }\n];\n';
await writeFile(output, moduleSource, {flag:'wx'});
console.log('Extracted', lines.length, 'garment mesh part(s) to', output);
