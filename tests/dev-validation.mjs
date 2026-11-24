import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {triangleGlb} from './glb-fixture.mjs';

const run = (...args) => spawnSync(process.execPath, args, {encoding:'utf8'});
const listing = run('tools/verify.mjs', '--list');
assert.equal(listing.status, 0, listing.stderr);
assert.match(listing.stdout, /build.*build-game/m);
assert.match(listing.stdout, /world.*world-playability\.mjs --no-browser/m);
assert.match(listing.stdout, /browser.*dev-studio\.mjs/m);
assert.equal(run('tools/verify.mjs', 'typo').status, 2);

const garments = run('tools/check-garment.mjs', '--module', 'tools/dev/sample-garments.js',
  'hat.preview-cap', 'hat.preview-crown', 'top.preview-long-sleeves', 'top.preview-short-sleeves');
assert.equal(garments.status, 0, garments.stderr);
assert.match(garments.stdout, /male hat\.preview-cap/);
assert.match(garments.stdout, /female hat\.preview-crown/);
assert.match(garments.stdout, /male top\.preview-long-sleeves/);
assert.match(garments.stdout, /female top\.preview-short-sleeves/);
assert.match(garments.stdout, /POSE METRICS female top\.preview-long-sleeves 0 bend/);
assert.notEqual(run('tools/check-garment.mjs', 'absent-garment').status, 0);
const temp = mkdtempSync(join(tmpdir(), 'sernbeld-garment-'));
try {
  const input = join(temp, 'source.glb'), output = join(temp, 'geometry.mjs');
  writeFileSync(input, triangleGlb(1, 2));
  const result = run('tools/extract-garment.mjs', input, output);
  assert.equal(result.status, 0, result.stderr);
  const {default: parts} = await import(pathToFileURL(output).href);
  assert.equal(parts.length, 1);
  assert.deepEqual([...parts[0].position], [0,0,0,1,0,0,0,2,0]);
  assert.deepEqual([...parts[0].index], [0,1,2]);
  assert.equal(parts[0].normal.length, 9);
  assert.notEqual(run('tools/extract-garment.mjs', input, output).status, 0, 'Existing source must not be overwritten');
  writeFileSync(input, triangleGlb(1, 2, {scale:[-1,1,1], translation:[3,0,0]}));
  const mirror = join(temp, 'mirrored.mjs');
  const mirrored = run('tools/extract-garment.mjs', input, mirror);
  assert.equal(mirrored.status, 0, mirrored.stderr);
  const {default: [part]} = await import(pathToFileURL(mirror).href);
  assert.deepEqual([...part.position], [3,0,0,2,0,0,3,2,0]);
  assert.deepEqual([...part.index], [0,2,1]);
  assert.deepEqual([...part.normal], [0,0,1,0,0,1,0,0,1]);
} finally {
  rmSync(temp, {recursive:true, force:true});
}
console.log('PASS named validation groups rigid and deformable reference-derived fixtures on both runtime bodies, and GLB extraction');
