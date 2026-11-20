import assert from 'node:assert/strict';
import { validateSkill, compileSkill } from '../src/core/skill-engine.js';

const basic = () => ({discipline:'physical',baseAction:'thrust',repeat:1,speed:1,power:1,manaInjection:0,energyDistribution:'even'});
const actor = (patch={}) => ({stamina:30,mana:20,maxMana:30,physicalControl:0,magicControl:0,...patch});
const test = (name,fn)=>{fn();console.log('PASS:',name)};

test('base_thrust_cost_is_8',()=>{
  const r=validateSkill(basic(),actor());
  assert.deepEqual(r,{ok:true,errors:[],cost:{stamina:8,mana:0}});
});
test('two_thrusts_have_two_timed_steps',()=>{
  const c=compileSkill({...basic(),repeat:2},actor({physicalControl:1}));
  assert.equal(c.steps.length,2);
  assert(c.steps[0].at>0 && c.steps[1].at>c.steps[0].at);
  assert.deepEqual(c.steps.map(s=>s.action),['thrust','thrust']);
  assert.equal(c.cost.stamina,16);
  assert(c.duration>c.steps[1].at);
});
test('higher_speed_shortens_duration_and_raises_cost',()=>{
  const slow=compileSkill({...basic(),speed:0.75},actor({physicalControl:1}));
  const fast=compileSkill({...basic(),speed:1.25},actor({physicalControl:1}));
  assert(fast.duration<slow.duration);
  assert(fast.steps[0].at<slow.steps[0].at);
  assert(fast.cost.stamina>slow.cost.stamina);
});
test('insufficient_stamina_is_rejected_without_mutation',()=>{
  const a=actor({stamina:7});const before=structuredClone(a);
  const result=validateSkill(basic(),a);
  assert.equal(result.ok,false);
  assert(result.errors.some(e=>e.includes('stamina')));
  assert.deepEqual(a,before);
  assert.throws(()=>compileSkill(basic(),a),/stamina/);
  assert.deepEqual(a,before);
});
test('untrained_three_hit_combo_is_rejected',()=>{
  assert.equal(validateSkill({...basic(),repeat:3},actor({stamina:100,physicalControl:1})).ok,false);
  assert.equal(validateSkill({...basic(),repeat:3},actor({stamina:100,physicalControl:2})).ok,true);
});
test('unknown_block_is_rejected',()=>{
  assert.equal(validateSkill({...basic(),extra:'teleport'},actor()).ok,false);
  assert.equal(validateSkill({...basic(),baseAction:'explode'},actor()).ok,false);
  assert.equal(validateSkill({...basic(),speed:Infinity},actor()).ok,false);
  assert.equal(validateSkill({...basic(),repeat:1.5},actor()).ok,false);
  assert.equal(validateSkill({...basic(),discipline:'magic'},actor()).ok,false);
});
test('skill_json_roundtrip_preserves_config',()=>{
  const c={...basic(),repeat:3,speed:1.25,power:0.75,manaInjection:5,energyDistribution:'last'};
  const serialized=JSON.parse(JSON.stringify(c));
  const p=compileSkill(serialized,actor({stamina:100,physicalControl:2}));
  assert.equal(p.steps.length,3);
  assert.deepEqual(p.steps.map(s=>s.mana),[0,0,5]);
  assert.equal(p.cost.mana,5);
  assert.deepEqual(serialized,c);
});
test('mana_distribution_conserves_total',()=>{
  const plan=compileSkill({...basic(),repeat:3,manaInjection:7},actor({stamina:100,physicalControl:2}));
  assert.equal(plan.cost.mana,7);
  assert.equal(plan.steps.reduce((n,s)=>n+s.mana,0),7);
});
test('no_cast_when_current_mana_is_insufficient',()=>{
  const c={...basic(),manaInjection:10};
  const a=actor({mana:9});
  const result=validateSkill(c,a);
  assert.equal(result.ok,false);
  assert(result.errors.some(e=>e.includes('mana')));
  assert.equal(a.mana,9);
});
