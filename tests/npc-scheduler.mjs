import {createLivingWorldRegistry} from '../src/core/living-world-registry.js';
import {createLivingWorldState} from '../src/core/living-world-state.js';
import {createItemRuntime,extendItemDefinitions} from '../src/core/shared-items.js';
import {createNpcScheduler} from '../src/core/npc-scheduler.js';
import {createNpcBehavior} from '../src/core/npc-behavior.js';
let checks=0;const a=(v,m)=>{if(!v)throw Error(m);checks++};
const defs=extendItemDefinitions({food:{kind:'material',rarity:'common',name:'food',value:2}});
const registry=createLivingWorldRegistry({handlers:['eat','rest'],regions:['kael']});
a(registry.registerDefinitions({needs:[{id:'hunger',min:0,max:100,initial:70,perTick:2,threshold:60}],actions:[
 {id:'eat',handlerId:'eat',duration:2,interruptPolicy:'pauseable',needWeights:{hunger:2}},
 {id:'rest',handlerId:'rest',duration:1,interruptPolicy:'interruptible',needWeights:{hunger:0},baseScore:0.1}],
 roles:[{id:'worker',actionIds:['eat','rest'],needWeights:{hunger:1}}],
 profiles:[{id:'a',regionId:'kael',roleId:'worker',tags:[]},{id:'b',regionId:'kael',roleId:'worker',tags:[]}]}).ok,'register');
const configureItems=items=>items.registerConsumptionPolicy('test:meal',{input:{definitionId:'food',quantity:1},effect:{needId:'hunger',delta:-40,min:0,max:100},validate:()=>true});
const handlers={eat:{plan({actorId,items}){const p=items.planSupply({actorId,selector:{definitionId:'food'},quantity:1});return p.ok?{ok:true,plan:{reserve:true,command:{kind:'consume',payload:{policyId:'test:meal',allocations:p.allocations}}}}:p}},
 rest:{plan(){return {ok:true,plan:{needEffects:{hunger:-1}}}}}};
function make(data){
 const save={data,write(){return true}};
 if(!data.livingWorld){
  a(createLivingWorldState(save,registry,()=>defs).initialize().ok,'init');
  createItemRuntime(save,()=>defs).createFor('npc:a','food',2,70);
 }
 const scheduler=createNpcScheduler({save,registry,getDefinitions:()=>defs,handlers,configureItems});
 return {save,scheduler,items:createItemRuntime(save,()=>defs)};
}
const first=make({v:1});
const initial=JSON.parse(JSON.stringify(first.save.data));
const ai=createNpcBehavior(registry,new Map(Object.entries(handlers)));
a(ai.choose({npcId:'a',npc:first.save.data.npcStates.a,at:0,items:first.items}).actionId==='eat','need-weighted choice');
a(ai.choose({npcId:'b',npc:first.save.data.npcStates.b,at:0,items:first.items}).actionId==='rest','fallback on missing stock');
a(first.scheduler.advanceTo(0).ok,'start actions');
a(first.save.data.npcStates.a.currentAction.actionId==='eat'&&first.items.snapshot().reservations.length===1,'reserved running action');
const running=JSON.stringify(first.save.data);
first.save.write=()=>{first.save.data.extra=true;return false};
a(first.scheduler.advanceTo(2).reason==='save_failed'&&JSON.stringify(first.save.data)===running,'whole slice rollback');
first.save.write=()=>true;
a(first.scheduler.advanceTo(2).ok&&first.items.count('food','npc:a')===1&&first.save.data.npcStates.a.needs.hunger===34,'consumption completes once with need updates');
const reloaded=make(JSON.parse(running));
a(reloaded.scheduler.advanceTo(2).ok&&JSON.stringify(reloaded.save.data)===JSON.stringify(first.save.data),'reload same completion');
const cancelled=make(JSON.parse(running)),job=cancelled.save.data.npcStates.a.currentAction.id;
a(cancelled.scheduler.cancel('a',job).ok&&cancelled.items.snapshot().reservations.length===0,'cancel releases');
a(cancelled.scheduler.cancel('a',job).reason==='stale','cancel idempotence via stale');
a(cancelled.scheduler.advanceTo(2).ok&&cancelled.items.count('food','npc:a')===2,'cancelled completion not applied');
const one=make(JSON.parse(JSON.stringify(initial))),split=make(JSON.parse(JSON.stringify(initial)));
a(one.scheduler.advanceTo(20,1000).ok,'whole advance');
let result,iterations=0;do{result=split.scheduler.advanceTo(20,1);a(result.ok,'bounded advance');if(++iterations>100)throw Error('nontermination')}while(result.pending);
a(JSON.stringify(one.save.data)===JSON.stringify(split.save.data),'budget-independent world');
const frame=make(JSON.parse(JSON.stringify(initial)));
for(let t=0;t<=20;t++)if(!frame.scheduler.advanceTo(t,100).ok)throw Error('frame advance');
a(JSON.stringify(one.save.data)===JSON.stringify(frame.save.data),'frame-independent world');
a(one.scheduler.advanceTo(19).reason==='invalid_tick','time cannot go backwards');
console.log('PASS NPC scheduler/behavior: '+checks+' checks');

const paused=make(JSON.parse(running)),pausedId=paused.save.data.npcStates.a.currentAction.id;
a(paused.scheduler.pause('a',pausedId).ok&&paused.items.snapshot().reservations.length===0,'pause releases reservation');
a(paused.scheduler.advanceTo(10).ok&&paused.items.count('food','npc:a')===2&&paused.save.data.npcStates.a.currentAction.paused,'paused NPC does not complete while others advance');
const restoredPause=make(JSON.parse(JSON.stringify(paused.save.data)));
const resumed=restoredPause.scheduler.resume('a',pausedId);
a(resumed.ok&&resumed.resumed&&resumed.dueTick===12&&restoredPause.items.snapshot().reservations.length===1,'resume after reload reacquires reservation');
a(restoredPause.scheduler.advanceTo(11).ok&&restoredPause.items.count('food','npc:a')===2,'no early completion');
a(restoredPause.scheduler.advanceTo(12).ok&&restoredPause.items.count('food','npc:a')===1,'resume completes once');
const lost=make(JSON.parse(running));a(lost.scheduler.pause('a',pausedId).ok,'pause for competing consumer');
lost.items.registerTransferPolicy('test:give',()=>true);
const supply=lost.items.planSupply({actorId:'npc:a',selector:{definitionId:'food'},quantity:2});
a(lost.items.commitOperation({operationId:'test:take',actorId:'npc:a',kind:'transfer',payload:{recipientId:'npc:b',allocations:supply.allocations,policyId:'test:give'}}).ok,'another actor uses released stock');
const unavailable=lost.scheduler.resume('a',pausedId);
a(unavailable.ok&&!unavailable.resumed&&!lost.save.data.npcStates.a.currentAction,'resume unavailable goes to decision');
const failedPause=make(JSON.parse(running));failedPause.save.write=()=>false;
a(failedPause.scheduler.pause('a',pausedId).reason==='save_failed'&&JSON.stringify(failedPause.save.data)===running,'pause rollback');
console.log('PASS NPC pause/resume: 9 checks');
