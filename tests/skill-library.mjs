import assert from 'node:assert/strict';
import {createSkillLibrary} from '../src/core/skill-library.js';
import {createGameEvents} from '../src/core/game-events.js';
const config={discipline:'physical',baseAction:'thrust',repeat:1,speed:1,power:1,manaInjection:0,energyDistribution:'even'};
const test=(name,fn)=>{fn();console.log('PASS:',name)};
function fixture(data={v:1,inv:{flower:4}}){const saved=[];const save={data,write(){saved.push(JSON.stringify(this.data));}};const events=createGameEvents();const seen=[];events.on('skill.saved',e=>seen.push(e));events.on('skill.removed',e=>seen.push(e));return {store:createSkillLibrary(save,events),save,saved,seen};}

test('legacy_save_stays_readable_without_skill_fields',()=>{
 const {store,save}=fixture();
 assert.deepEqual(store.list(),[]);
 assert.equal(store.get('starter'),null);
 assert.equal(save.data.customSkills,undefined);
 assert.equal(save.data.inv.flower,4);
});
test('save_roundtrip_and_event_after_commit',()=>{
 const f=fixture();const entry={id:'starter',name:'첫 찌르기',discipline:'physical',version:1,config};
 const result=f.store.put(entry);
 assert.deepEqual(result,entry);
 assert.equal(f.saved.length,1);
 assert.equal(f.seen.length,1);
 assert.equal(f.seen[0].id,'starter');
 assert.deepEqual(JSON.parse(f.saved[0]).customSkills,[entry]);
 const reopened=fixture(JSON.parse(f.saved[0])).store;
 assert.deepEqual(reopened.get('starter'),entry);
});
test('updating_skill_does_not_duplicate_or_mutate_caller',()=>{
 const {store,save}=fixture();const entry={id:'a',name:'찌르기',discipline:'physical',version:1,config:{...config}};
 store.put(entry);
 entry.config.repeat=99;
 assert.equal(store.get('a').config.repeat,1);
 store.put({...entry,config:{...config,repeat:2}});
 assert.equal(store.list().length,1);
 assert.equal(store.get('a').config.repeat,2);
 const copy=store.get('a');copy.config.repeat=42;
 assert.equal(store.get('a').config.repeat,2);
 assert.equal(save.data.inv.flower,4);
});
test('invalid_skill_rejected_without_partial_write',()=>{
 const f=fixture();
 assert.throws(()=>f.store.put({id:'bad',name:'치트',discipline:'physical',version:1,config:{...config,power:Infinity}}),/Invalid/);
 assert.throws(()=>f.store.put({id:'bad',name:'치트',discipline:'physical',version:1,config:{...config,other:1}}),/Invalid/);
 assert.equal(f.saved.length,0);assert.deepEqual(f.store.list(),[]);
});
test('future_version_is_preserved_but_not_overwritten',()=>{
 const future={id:'future',version:50,name:'미래 스킬',discipline:'special',config:{new:'grammar'}};
 const f=fixture({v:1,customSkills:[future],inv:{}});
 assert.deepEqual(f.store.get('future'),future);
 assert.throws(()=>f.store.put({...future,version:1}),/Invalid/);
 assert.deepEqual(f.store.get('future'),future);
});
test('remove_missing_does_not_save',()=>{
 const f=fixture();assert.equal(f.store.remove('none'),false);assert.equal(f.saved.length,0);
 f.store.put({id:'a',name:'찌르기',discipline:'physical',version:1,config});
 assert.equal(f.store.remove('a'),true);
 assert.deepEqual(f.store.list(),[]);assert.equal(f.seen.at(-1).id,'a');assert.equal(f.saved.length,2);
});
