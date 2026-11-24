#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {classifyCheck} from './infra-contract.mjs';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const groups = {
  build: [['tools/build-game.mjs','--check'], ['--check','game.js'],
    ['tools/optimize-characters.mjs','--check'], ['tools/bake-garments.mjs','--check'],
    ['tests/infra-contract.mjs'], ['tools/check-infra.mjs']],
  core: ['foundation', 'durable-items', 'region-lifecycle', 'wildlife-removal',
    'skill-engine', 'skill-library', 'skill-runner', 'skill-orbit',
    'startup-runtime', 'pwa-startup'].map(name => ['tests/' + name + '.mjs']),
  clothing: ['studio-model', 'character-assembly', 'schoolyard-ik', 'schoolyard-motion',
    'shirt-reference', 'shirt-runtime', 'pants-runtime', 'garment-alignment', 'dev-validation']
    .map(name => ['tests/' + name + '.mjs']),
  world: [['tests/player-physics.mjs'], ['tests/world-performance.mjs'], ['tests/world-playability.mjs','--no-browser']],
  browser: [
    ['tests/character-assets.mjs'], ['tests/character-webgl.mjs'],
    ['tests/character-runtime-browser.mjs'], ['tests/cold-start-browser.mjs'],
    ['tests/garment-render.mjs'], ['tests/dev-studio.mjs'], ['tests/kael-roads.mjs'],
    ['tests/world-playability.mjs'], ['tests/custom-skills-browser.mjs'],
    ['tests/mobile-regression.mjs','--current'], ['tests/pwa-offline.mjs']
  ]
};

const strict = process.argv.includes('--strict');
const args = process.argv.slice(2).filter(a=>a!=='--strict');
if (args.length === 1 && args[0] === '--list') {
  for (const [group, commands] of Object.entries(groups)) {
    console.log(group + ': ' + commands.map(command => command.join(' ')).join(', '));
  }
} else {
  const selected = args.length === 0 || (args.length === 1 && args[0] === 'all') ? Object.keys(groups) : [...new Set(args)];
  if (selected.some(name => !Object.hasOwn(groups, name))) {
    console.error('Usage: node tools/verify.mjs [all|--list|' + Object.keys(groups).join('|') + ']');
    process.exit(2);
  }
  const failures = [], partial = [];
  let passed = 0;
  let count = 0;
  for (const group of selected) {
    for (const command of groups[group]) {
      const label = command.join(' ');
      console.log('\n[' + group + '] ' + label);
      const result = spawnSync(process.execPath, command, {cwd, encoding:'utf8', maxBuffer:64*1024*1024});
      process.stdout.write(result.stdout??''); process.stderr.write(result.stderr??'');
      const outcome=classifyCheck(label,result.status,(result.stdout??'')+'\n'+(result.stderr??''));
      if(outcome.result==='PASS')passed++;
      if(outcome.result==='PARTIAL')partial.push(label+' — '+outcome.diagnostics.join(' | '));
      if(outcome.blocking || (strict && outcome.result==='PARTIAL')) failures.push(label+' ('+(result.error?.message??result.signal??outcome.result)+')');
      count++;
    }
  }
  console.log('\n'+passed+'/'+count+' PASS; '+partial.length+' PARTIAL; '+failures.length+' blocking');
  for(const line of partial)console.warn('PARTIAL '+line);
  if (failures.length) {
    console.error('Failed:\n' + failures.join('\n'));
    process.exitCode = 1;
  }
}
