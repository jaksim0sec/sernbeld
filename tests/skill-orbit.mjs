import assert from 'node:assert/strict';
import {MAX_SKILL_ACTIONS, distributeEvenly, rebalanceShare, moveAction, moveSlot, orbitSlots, makeOrbitGradient} from '../src/ui/skill-orbit-model.js';
import {compileSkill, validateSkill} from '../src/core/skill-engine.js';
import {createSkillLibrary} from '../src/core/skill-library.js';

const test = (name,fn) => { fn(); console.log('PASS:', name); };
test('empty slots remain available up to existing capacity', () => {
  assert.equal(MAX_SKILL_ACTIONS,3);
  assert.deepEqual(orbitSlots([{id:'thrust',slot:0}]).map(x => x.empty),[false,true,true]);
});
test('adding actions evenly distributes a relative 100 percent pool', () => {
  assert.deepEqual(distributeEvenly([{id:'a'},{id:'b'},{id:'c'}]).map(x=>x.share),[34,33,33]);
});
test('focused mana redistribution proportionally decreases every other action', () => {
  const result = rebalanceShare([{id:'a',share:40},{id:'b',share:36},{id:'c',share:24}],0,70);
  assert.deepEqual(result.map(x=>x.share),[70,18,12]);
  assert.equal(result.reduce((sum,x)=>sum+x.share,0),100);
  assert.deepEqual(rebalanceShare([{id:'a',share:100}],0,30).map(x=>x.share),[100]);
});
test('a specific empty slot receives its own action',()=>{
  assert.deepEqual(orbitSlots([{id:'a',slot:0},{id:'b',slot:2}]).map(x=>x.empty),[false,true,false]);
});
test('long press shifts only intermediate occupied slots',()=>{
  const result=moveSlot([{id:'a',slot:0},{id:'b',slot:1}],0,2);
  assert.deepEqual(result.map(a=>[a.id,a.slot]),[['b',0],['a',2]]);
  assert.deepEqual(moveSlot(result,2,0).map(a=>[a.id,a.slot]),[['a',0],['b',1]]);
});
test('moving one action inserts it and shifts other actions in order', () => {
  const a=[{id:'a'},{id:'b'},{id:'c'}];
  assert.deepEqual(moveAction(a,0,2).map(x=>x.id),['b','c','a']);
  assert.deepEqual(a.map(x=>x.id),['a','b','c']);
});
test('orbital mana gradient is continuous and favors concentrated actions', () => {
  const gradient=makeOrbitGradient([{id:'a',share:80,slot:0},{id:'b',share:10,slot:1},{id:'c',share:10,slot:2}],3);
  assert(gradient.startsWith('conic-gradient('));
  assert(!gradient.includes('transparent'));
  assert.equal(gradient.match(/rgba\(/g).length,73);
  const numbers=[...gradient.matchAll(/rgba\(\d+,\d+,\d+,([\d.]+)\)/g)].map(x=>Number(x[1]));
  assert.equal(numbers[0],numbers.at(-1));
  assert(numbers[0]>numbers[24]);
});
const actor={stamina:100,mana:30,maxMana:30,physicalControl:2,magicControl:0};
const item=(share,repeat=1)=>({action:'thrust',share,repeat,speed:1,power:1});
test('composite compiler executes ordered actions and conserves total skill mana',()=>{
  const config={discipline:'physical',manaInjection:11,actions:[item(60,2),item(40)]};
  const plan=compileSkill(config,actor);
  assert.equal(plan.steps.length,3);
  assert(plan.steps.every((s,i)=>!i||s.at>plan.steps[i-1].at));
  assert.deepEqual(plan.steps.map(x=>x.mana),[4,3,4]);
  assert.equal(plan.cost.mana,11);
  assert.equal(plan.cost.stamina,24);
  assert.equal(config.actions[0].share,60);
});
test('composite rejects malformed shares, unknown actions and overflowing action capacity',()=>{
  const base={discipline:'physical',manaInjection:0,actions:[item(50),item(50)]};
  assert.equal(validateSkill(base,actor).ok,true);
  for(const patch of [
    {...base,actions:[item(60),item(60)]},
    {...base,actions:[{...item(100),action:'explode'}]},
    {...base,actions:[item(25),item(25),item(25),item(25)]},
    {...base,actions:[{...item(100),share:NaN}]}
  ]) assert.equal(validateSkill(patch,actor).ok,false);
});
test('v2 skill persists without changing legacy v1 saves or unsupported future versions',()=>{
  const snapshot={v:1,customSkills:[{id:'old',name:'구 찌르기',discipline:'physical',version:1,config:{discipline:'physical',baseAction:'thrust',repeat:1,speed:1,power:1,manaInjection:0,energyDistribution:'even'}},{id:'future',version:50,name:'미래',discipline:'special',config:{other:1}}]};
  const save={data:snapshot,write(){}};
  const library=createSkillLibrary(save);
  const config={discipline:'physical',manaInjection:5,actions:[item(50),item(50)]};
  library.put({id:'combo',name:'연속 찌르기',version:2,discipline:'physical',config});
  assert.equal(library.get('old').version,1);
  assert.equal(library.get('future').version,50);
  assert.deepEqual(library.get('combo').config,config);
  assert.throws(()=>library.put({id:'future',name:'무단수정',version:2,discipline:'physical',config}),/Invalid/);
});
test('legacy v1 thrust compiler remains byte-shape compatible',()=>{
  const config={discipline:'physical',baseAction:'thrust',repeat:3,speed:1.25,power:.75,manaInjection:7,energyDistribution:'last'};
  const p=compileSkill(config,actor);
  assert.deepEqual(p.steps.map(({mana})=>mana),[0,0,7]);
  assert.deepEqual(p.steps.map(({action})=>action),['thrust','thrust','thrust']);
  assert.equal(p.cost.mana,7);
  assert.equal(p.cost.stamina,Math.ceil(8*3*.75*1.25**2));
  assert.equal(validateSkill({...config,action:'unknown'},actor).ok,false);
});
test('slot identities are unique in saved v2 compositions',()=>{
  const a={...item(50),slot:1},b={...item(50),slot:1};
  assert.equal(validateSkill({discipline:'physical',manaInjection:0,actions:[a,b]},actor).ok,false);
});
