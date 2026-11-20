import assert from 'node:assert/strict';
import {compileSkill} from '../src/core/skill-engine.js';
import {createSkillRunner} from '../src/core/skill-runner.js';
const config={discipline:'physical',baseAction:'thrust',repeat:2,speed:1,power:1,manaInjection:5,energyDistribution:'last'};
const actor={stamina:100,mana:50,maxMana:50,physicalControl:2,magicControl:0};
const test=(name,fn)=>{fn(); console.log('PASS:',name)};
function fixture(){const energy={stamina:100,mana:50},contacts=[],completed=[];let attempts=0;
 const runner=createSkillRunner({spend(cost){attempts++;if(energy.stamina<cost.stamina||energy.mana<cost.mana)return false;energy.stamina-=cost.stamina;energy.mana-=cost.mana;return true;},onStep:(step,index)=>contacts.push({action:step.action,index}),onComplete:()=>completed.push(true)});
 return {runner,energy,contacts,completed,get attempts(){return attempts}};
}
test('two_contacts_at_distinct_timestamps_even_when_frame_skips',()=>{
 const plan=compileSkill(config,actor),f=fixture();assert.equal(f.runner.start(plan).ok,true);
 assert.equal(f.runner.advance(0.1),0);
 assert.equal(f.runner.advance(0.25),1);
 assert.equal(f.runner.advance(0.5),1);
 assert.deepEqual(f.contacts.map(c=>c.index),[0,1]);
 assert.equal(f.runner.advance(2),0);assert.equal(f.completed.length,1);assert.equal(f.runner.isActive(),false);
});
test('resources_are_spent_once_per_started_cast_not_per_hit',()=>{
 const plan=compileSkill(config,actor),f=fixture();
 assert.equal(f.runner.start(plan).ok,true);assert.equal(f.runner.start(plan).ok,false);
 assert.equal(f.attempts,1);
 f.runner.advance(30);f.runner.advance(30);
 assert.equal(f.energy.stamina,84);assert.equal(f.energy.mana,45);assert.equal(f.attempts,1);
});
test('insufficient_energy_rejects_without_running_any_steps',()=>{
 const plan=compileSkill(config,actor),f=fixture();f.energy.mana=4;
 assert.equal(f.runner.start(plan).ok,false);
 f.runner.advance(30);
 assert.equal(f.energy.stamina,100);assert.equal(f.energy.mana,4);assert.equal(f.contacts.length,0);
});
test('cancel_stops_remaining_steps_and_does_not_spend_again',()=>{
 const plan=compileSkill(config,actor),f=fixture();
 f.runner.start(plan);f.runner.advance(0.35);assert.equal(f.contacts.length,1);
 assert.equal(f.runner.cancel(),true);assert.equal(f.runner.cancel(),false);
 assert.equal(f.runner.advance(15),0);assert.equal(f.completed.length,0);
 assert.equal(f.attempts,1);assert.equal(f.energy.mana,45);
});
test('frame_time_nonnegative_and_finite',()=>{
 const f=fixture();f.runner.start(compileSkill(config,actor));
 assert.throws(()=>f.runner.advance(-1),RangeError);
 assert.throws(()=>f.runner.advance(Infinity),RangeError);
 assert.equal(f.contacts.length,0);
});
test('corrupt_compiled_plan_rejected_without_spend',()=>{
 const f=fixture();
 assert.throws(()=>f.runner.start({duration:0.5,steps:[{at:0.7,action:'thrust'}],cost:{stamina:4,mana:0}}),/Invalid/);
 assert.equal(f.attempts,0);
});
