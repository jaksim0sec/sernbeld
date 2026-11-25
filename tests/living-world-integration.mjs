import {createLivingWorldRegistry} from '../src/core/living-world-registry.js';
import {createLivingWorldState} from '../src/core/living-world-state.js';
import {createNpcScheduler} from '../src/core/npc-scheduler.js';
import {createNpcRequests} from '../src/core/npc-requests.js';
import {createItemRuntime,extendItemDefinitions} from '../src/core/shared-items.js';

let checks=0;
const a=(ok,msg)=>{if(!ok)throw Error(msg);checks++};
const copy=v=>JSON.parse(JSON.stringify(v));
const defs=extendItemDefinitions({food:{kind:'material',name:'fixture',value:2}});
const registry=createLivingWorldRegistry({regions:['kael'],handlers:['rest']});
a(registry.registerDefinitions({
 needs:[{id:'hunger',min:0,max:100,initial:0,perTick:10,threshold:30}],
 actions:[{id:'rest',handlerId:'rest',duration:2,interruptPolicy:'pauseable',needWeights:{hunger:1}}],
 roles:[{id:'worker',actionIds:['rest'],needWeights:{hunger:1}}],
 profiles:[{id:'a',regionId:'kael',roleId:'worker',tags:['worker']}],
 requestPolicies:[{id:'food',needKey:'hunger',tags:['worker'],selector:{definitionId:'food'},quantity:1,minimumQuality:60,reward:2,ttlTicks:4,needDelta:-100,label:'fixture'}]
}).ok,'register');
const initial={data:{v:1,money:0},write:()=>true};
a(createLivingWorldState(initial,registry,()=>defs).initialize().ok,'initialize');
initial.data.itemEconomy.wallets.find(w=>w.ownerId==='npc:a').balance=20;
createItemRuntime(initial,()=>defs).createFor('player:local','food',1,70);
function make(data){
 const save={data:copy(data),write:()=>true};
 const requests=createNpcRequests(registry);
 const scheduler=createNpcScheduler({save,registry,getDefinitions:()=>defs,requests,handlers:{rest:{plan({npc}){return npc.needs.hunger>=60?{ok:true,plan:{needEffects:{hunger:-100}}}:{ok:false,reason:'not_needed'}}}}});
 return {save,scheduler,items:createItemRuntime(save,()=>defs)};
}
const whole=make(initial.data),frame=make(initial.data),split=make(initial.data);
a(whole.scheduler.advanceTo(24,1000).ok,'single catchup');
for(let t=0;t<=24;t++)a(frame.scheduler.advanceTo(t,100).ok,'frame '+t);
let result,steps=0;
do{result=split.scheduler.advanceTo(24,1);a(result.ok&&result.processed<=1,'bounded slice');if(++steps>100)throw Error('nontermination')}while(result.pending);
a(JSON.stringify(whole.save.data)===JSON.stringify(frame.save.data),'frame independent requests and jobs');
a(JSON.stringify(whole.save.data)===JSON.stringify(split.save.data),'budget independent requests and jobs');
a(whole.save.data.livingWorld.requests.some(r=>r.createdAt===3),'threshold observed at logical tick not frame end');
const player=make(initial.data);
a(player.scheduler.advanceTo(3,100).ok,'first episode');
const accept=player.scheduler.requestChoices('a')[0];a(accept&&player.scheduler.executeRequest('a',accept).ok,'accept actual request');
const submit=player.scheduler.requestChoices('a').find(c=>c.id==='living.request.submit');a(!!submit,'qualified actual lot');
const before=copy(player.save.data);player.save.write=()=>false;
a(!player.scheduler.executeRequest('a',submit).ok&&JSON.stringify(player.save.data)===JSON.stringify(before),'outer transaction rollback');
const reload=make(before);
a(reload.scheduler.executeRequest('a',submit).ok&&reload.items.balance()===2,'player resolves after reload');
a(reload.scheduler.executeRequest('a',submit).replayed&&reload.items.balance()===2,'reward once');
const self=make(before);
a(self.scheduler.advanceTo(10,100).ok,'unobserved NPC continues');
a(!self.scheduler.executeRequest('a',submit).ok&&self.items.balance()===0,'stale player loses race to NPC or expiry');
console.log('PASS living world integration: '+checks+' checks (request, scheduler, ledger, rollback, reload and clock partition)');

import {createLivingWorldRuntime} from '../src/core/living-world-runtime.js';
const residents=[{id:'a',role:'worker',position:{x:0,y:0,z:0}},{id:'b',role:'worker',position:{x:1,y:0,z:0}}];
const content={definitions:{
 needs:[{id:'hunger',min:0,max:100,initial:80,perTick:0,threshold:60}],
 actions:[{id:'eat',handlerId:'eat',duration:3,interruptPolicy:'pauseable',needWeights:{hunger:2}}],
 roles:[{id:'worker',actionIds:['eat'],needWeights:{hunger:1}}],
 profiles:[{id:'a',regionId:'kael',roleId:'worker',tags:['worker','source']},{id:'b',regionId:'kael',roleId:null,tags:['worker','target']}],
 eventTypes:[{id:'shortage',regionIds:['kael'],evaluateHandlerId:'shortage',propagationHandlerId:'share',minIntensity:0,maxIntensity:100,factKeys:['amount']}],
 relationPolicies:[{id:'help',min:-10,max:10,delta:2,cooldownTicks:1}],
 requestPolicies:[{id:'food',needKey:'hunger',tags:['source'],selector:{definitionId:'food'},quantity:1,minimumQuality:60,reward:2,ttlTicks:20,needDelta:-100,label:'fixture',relationPolicyId:'help'}],
 participationActions:[{id:'share',kind:'share',sourceSlot:'source',targetSlot:'target',factKeys:['amount'],label:'Share',reply:'Amount {amount}',relationPolicyId:'help'}],
 conversationTemplates:[{id:'talk',topic:'supply',regionIds:['kael'],slots:[{id:'source',tags:['source']},{id:'target',tags:['target']}],eventTypeId:'shortage',factRefs:[{key:'amount',slotId:'source',factKey:'amount'}],turns:[{slotId:'source',text:'Amount {amount}',duration:20}],participationIds:['share']}]
},handlers:{eat:{plan({actorId,npc,items}){if(npc.needs.hunger<60)return {ok:false,reason:'not_needed'};const p=items.planSupply({actorId,selector:{definitionId:'food'},quantity:1});return p.ok?{ok:true,plan:{reserve:true,command:{kind:'consume',payload:{policyId:'fixture:meal',allocations:p.allocations}}}}:p}}},
 configureItems(items){items.registerConsumptionPolicy('fixture:meal',{input:{definitionId:'food',quantity:1},effect:{needId:'hunger',delta:-100,min:0,max:100},validate:()=>true})},
 societyHandlers:{shortage:({data})=>data.npcStates.a.needs.hunger>=60?[{key:'food',intensity:80,affectedNpcIds:['a'],subjectRefs:['food'],facts:{amount:1},observations:{a:['amount']}}]:[],share:()=>1}};
function world(data={v:1,money:0},tick=0){
 const save={data:copy(data),write:()=>true},clock={day:1,hour:(tick+.01)/60};
 const rt=createLivingWorldRuntime({save,getDefinitions:()=>defs,regionId:'kael',clock,residents,content,conversationPair:()=>true,participationReach:()=>true});
 a(rt.ok,'registered runtime');
 return {save,rt,clock,items:createItemRuntime(save,()=>defs),advance(t,speaker=null){clock.hour=(t+.01)/60;return rt.update(speaker)},observe(now,x,active=true){return rt.updateConversations({active,player:{x,y:0,z:0},now,npcs:residents.map(n=>({id:n.id,...n.position,stationary:true}))})}};
}
const w=world();w.save.data.itemEconomy.wallets.find(v=>v.ownerId==='npc:a').balance=10;
w.items.createFor('npc:a','food',1,70);w.items.createFor('player:local','food',1,80);
const initialWorld=copy(w.save.data);
a(w.advance(0).ok&&w.save.data.npcStates.a.currentAction.actionId==='eat','need chooses actual consumption');
a(w.rt.knownEvents('a').length===1&&!w.rt.knownEvents('b').length,'actual event and private knowledge');
a(w.observe(0,12)[0]?.text==='···','mid distance placeholder');
a(w.observe(1,0)[0]?.text==='Amount 1','near materializes known fact');
a(w.rt.beginTalk('a'),'player joins real managed group');
const share=w.rt.participationChoices('a')[0];
a(share&&w.rt.executeParticipation('a',share).ok&&w.rt.knownEvents('b').length===1,'explicit group information transfer');
a(w.save.data.npcStates.b.relationships.player.affinity===2,'target relation');
a(w.rt.executeRequest('a',w.rt.requestChoices('a')[0]).ok,'player accepts actual need');
const delivery=w.rt.requestChoices('a').find(c=>c.id==='living.request.submit');
a(delivery&&w.rt.executeRequest('a',delivery).ok&&w.items.balance()===2,'actual supply and reward');
a(w.advance(5).ok&&w.save.data.livingWorld.events[0].state==='resolved','supply resolves actual event');
a(w.observe(6,0,false).length===0&&!w.rt.groupFor('a'),'region inactive clears group');
const restored=world(w.save.data,5);
a(restored.items.balance()===2&&restored.save.data.npcStates.b.relationships.player.affinity===2,'reload ledger and social state');
const autonomous=world(initialWorld);
a(autonomous.advance(0).ok,'unobserved action starts');
const acceptance=autonomous.rt.requestChoices('a')[0];a(autonomous.rt.executeRequest('a',acceptance).ok,'accept while NPC solves');
const late=autonomous.rt.requestChoices('a').find(c=>c.id==='living.request.submit');
a(autonomous.advance(3).ok&&autonomous.save.data.livingWorld.events[0].state==='resolved','NPC consumes own supply and resolves');
a(!autonomous.rt.executeRequest('a',late).ok&&autonomous.items.balance()===0,'stale competing submission cannot pay');
console.log('PASS full living-world integration: '+checks+' cumulative checks (actual event, supply, group, relationship, autonomous race and reload)');

// Production regression, not fixture injection.
import './kael-living-content.mjs';
