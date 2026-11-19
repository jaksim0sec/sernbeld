#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const game=await readFile(new URL('../src/gameplay/gameplay.part.js',import.meta.url),'utf8');
const region=await readFile(new URL('../src/world/region.part.js',import.meta.url),'utf8');
for (const term of ['var Wildlife =','var SPECIES =','new Wildlife(','fluff_sheep','mane_dog','wildlife.update(','this.wildlife.list'])
  assert(!game.includes(term),'Legacy wildlife remains: '+term);
assert(!region.includes('habitats:'),'Legacy wildlife spawns remain');
assert(game.includes('WorldRegions.mount(region.id, regionEntries);'),'Region system must remain');
assert(game.includes("kind: 'resident'"),'Resident registration must remain');
const start=game.indexOf('var OBSOLETE_ANIMAL_TEMPLATES =');
const end=game.indexOf('var RISK =',start);
assert(start>=0&&end>start,'Missing saved quest cleanup');
const cleanup=new Function(game.slice(start,end)+'; return discardLegacyAnimalTasks;')();
const data={
  requests:[{tpl:'hunt_dogs',hunt:'mane_dog'},{tpl:'wool_bundle',item:'wool'},{tpl:'herb_monastery',item:'field_herb'}],
  board:{day:3,list:[{tpl:'hide_smith',item:'dog_hide'},{tpl:'crystal_survey',item:'clear_crystal'}]},
  inv:{wool:4,dog_hide:3,field_herb:2},
  regionEntities:{sernbeld:{'wildlife:sernbeld:old':{hp:10},'resident:sernbeld:0':{lineI:3}}},
  uniqueItems:[{id:'unique:1',itemId:'apprentice_sword',state:{name:'kept'}}]
};
assert.equal(cleanup(data),true);
assert.deepEqual(data.requests.map(x=>x.tpl),['herb_monastery']);
assert.deepEqual(data.board.list.map(x=>x.tpl),['crystal_survey']);
assert.equal(data.regionEntities.sernbeld['wildlife:sernbeld:old'],undefined);
assert.deepEqual(data.regionEntities.sernbeld['resident:sernbeld:0'],{lineI:3});
assert.deepEqual(data.inv,{wool:4,dog_hide:3,field_herb:2});
assert.equal(data.uniqueItems[0].state.name,'kept');
assert.equal(cleanup(data),false,'Repeated migration should be safe');
console.log('PASS: legacy wildlife removed; active quests migrated; inventory and regions preserved');
