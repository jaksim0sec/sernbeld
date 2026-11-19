#!/usr/bin/env node
// Reassemble the original, single-scope ES module without rewriting its contents.
// These .part.js files are ordered fragments, NOT independently importable ESM modules.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sources = [
  'src/vendor/three-gltf.part.js',
  'src/world/region.part.js',
  'src/world/terrain-patch.part.js',
  'src/world/terrain-runtime.part.js',
  'src/render/world-render.part.js',
  'src/gameplay/gameplay.part.js'
];
const parts = await Promise.all(sources.map(p => readFile(path.join(root,p))));
const output = Buffer.concat(parts);
const target = path.join(root, 'game.js');
if (process.argv.includes('--check')) {
  const original = await readFile(target);
  if (!original.equals(output)) {
    console.error('game.js differs from its structured source parts. Run node tools/build-game.mjs');
    process.exitCode = 1;
  } else console.log('PASS: game.js is byte-for-byte identical to source concatenation');
} else {
  await writeFile(target, output);
  console.log('Generated game.js (' + output.length + ' bytes)');
}
