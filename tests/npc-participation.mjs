import {createLivingWorldRegistry} from '../src/core/living-world-registry.js';
import {createLivingWorldState} from '../src/core/living-world-state.js';
import {createNpcScheduler} from '../src/core/npc-scheduler.js';
import {createNpcRequests} from '../src/core/npc-requests.js';
import {createItemRuntime,extendItemDefinitions} from '../src/core/shared-items.js';
let checks=0;const a=(v,m)=>{if(!v)throw Error(m);checks++};
const r=createLivingWorldRegistry({regions:['kael']});
const p={id:'supply',needKey:'hunger',tags:['worker'],selector:{definitionId:'field_herb'},quantity:2,minimumQuality:60,reward:4,ttlTicks:5,needDelta:-10,label:'fixture',relationPolicyId:'help'};
const data={needs:[{id:'hunger',min:0,max:10,initial:8,perTick:0,threshold:5}],roles:[{id:'worker',actionIds:[],needWeights:{hunger:1}}],profiles:[{id:'a',regionId:'kael',roleId:'worker',tags:['worker']}],relationPolicies:[{id:'help',min:-10,max:10,delta:2,cooldownTicks:10}],requestPolicies:[p]};
a(!r.validateRegistry({...data,requestPolicies:[{...p,reward:-1}]}).ok,'invalid reward');
a(r.registerDefinitions(data).ok,'register');
let failWrite=false;
const save={data:{},write:()=>!failWrite};
const defs=extendItemDefinitions({field_herb:{name:'fixture',value:1,kind:'material'}});
const get=()=>defs;
a(createLivingWorldState(save,r,get).initialize().ok,'state');
const items=createItemRuntime(save,get);items.createFor(items.player,'field_herb',2,60);
save.data.itemEconomy.wallets.find(w=>w.ownerId==='npc:a').balance=10;
const requests=createNpcRequests(r);
const scheduler=()=>createNpcScheduler({save,registry:r,getDefinitions:get,requests});
let sc=scheduler();
a(sc.advanceTo(0).ok,'open');a(save.data.livingWorld.requests.length===1,'one need one request');
const accept=sc.requestChoices('a')[0];a(accept.id==='living.request.accept','explicit accept');
const before=JSON.stringify(save.data);sc.requestChoices('a');a(JSON.stringify(save.data)===before,'read only');
a(sc.executeRequest('a',accept).ok,'accept');a(!sc.executeRequest('a',accept).ok,'stale accept');
const submit=sc.requestChoices('a')[0];a(submit.allocations.length===1,'qualified stock');
const accepted=JSON.stringify(save.data);failWrite=true;a(!sc.executeRequest('a',submit).ok&&JSON.stringify(save.data)===accepted,'atomic rollback');failWrite=false;
a(sc.executeRequest('a',submit).ok,'submit');
a(items.balance()===4&&items.balance('npc:a')===6&&items.count('field_herb')===0,'wallet and transfer');
a(save.data.npcStates.a.needs.hunger===0&&save.data.npcStates.a.relationships.player.affinity===2,'need and affinity');
sc=scheduler();a(sc.executeRequest('a',submit).replayed===true&&items.balance()===4,'reload replay');
save.data.npcStates.a.needs.hunger=8;a(sc.advanceTo(1).ok,'new episode');
const second=sc.requestChoices('a')[0];a(sc.executeRequest('a',second).ok,'accept second');
save.data.npcStates.a.needs.hunger=0;a(sc.advanceTo(2).ok&&save.data.livingWorld.requests.at(-1).state==='resolved','self resolved');
save.data.npcStates.a.needs.hunger=8;a(sc.advanceTo(3).ok,'new episode again');a(sc.advanceTo(8).ok&&save.data.livingWorld.requests.at(-1).state==='expired','expiry');
a(sc.advanceTo(9).ok&&sc.requestChoices('a').length===0,'no repeat expired same need');
console.log('PASS NPC request infrastructure: '+checks+' checks');

import {runNpcAction} from '../src/core/npc-dialogue.js';
let executions=0;
const oldChoice={id:'living.request.submit',itemId:'request:1',revision:1,quote:'a',allocations:[{recordId:'item:1'}]};
const run=(choice,current,reach=true)=>runNpcAction(choice,{reachable:()=>reach,choices:()=>[current],execute:()=>{executions++;return true}});
a(!run(oldChoice,{...oldChoice,revision:2}).ok,'stale revision');
a(!run(oldChoice,{...oldChoice,quote:'b'}).ok,'stale quote');
a(!run(oldChoice,{...oldChoice,allocations:[{recordId:'item:2'}]}).ok,'stale allocation');
a(!run(oldChoice,oldChoice,false).ok&&executions===0,'stale distance');
a(run(oldChoice,oldChoice).ok&&executions===1,'explicit current action');
console.log('PASS NPC request and choice infrastructure: '+checks+' checks');

import {createNpcParticipation} from '../src/core/npc-participation.js';
import {createWorldSociety} from '../src/core/world-society.js';
const gr=createLivingWorldRegistry({regions:['kael'],societyHandlers:['e','prop']});
const types=[{id:'shortage',regionIds:['kael'],evaluateHandlerId:'e',propagationHandlerId:'prop',minIntensity:0,maxIntensity:10,factKeys:['amount']}];
const actions=[{id:'chat',kind:'reply',label:'Chat',reply:'Okay'},{id:'ask',kind:'question',sourceSlot:'source',factKeys:['amount'],label:'Ask',reply:'Amount {amount}'},{id:'mediate',kind:'share',sourceSlot:'source',targetSlot:'target',factKeys:['amount'],label:'Share',reply:'Amount {amount}',relationPolicyId:'thanks'}];
const template={id:'group',topic:'supply',regionIds:['kael'],slots:[{id:'source',tags:['worker']},{id:'target',tags:['worker']}],turns:[{slotId:'source',text:'Need help',duration:10}],eventTypeId:'shortage',participationIds:actions.map(p=>p.id)};
const registrations={profiles:['a','b'].map(id=>({id,regionId:'kael',roleId:null,tags:['worker']})),eventTypes:types,relationPolicies:[{id:'thanks',min:-5,max:5,delta:2,cooldownTicks:10}],participationActions:actions,conversationTemplates:[template]};
a(!gr.validateRegistry({...registrations,conversationTemplates:[{...template,participationIds:['unknown']}]}).ok,'unknown participation reference');
a(!gr.validateRegistry({...registrations,participationActions:[...actions.slice(0,2),{...actions[2],sourceSlot:'missing'}]}).ok,'unknown source slot');
a(gr.registerDefinitions(registrations).ok,'group registration');
const gs={data:{},write:()=>true};
a(createLivingWorldState(gs,gr,get).initialize().ok,'group state');
gs.data.livingWorld.events.push({id:'event:1',typeId:'shortage',regionId:'kael',key:'one',state:'active',revision:1,openedAt:0,resolvedAt:null,intensity:3,affectedNpcIds:['a','b'],subjectRefs:[],facts:{amount:3}});
gs.data.npcStates.a.knowledge={'event:1':{eventId:'event:1',revision:1,observedTick:0,source:'a',confidence:1,state:'active',facts:{amount:3}}};
const society=createWorldSociety(gr,{prop:()=>.8}),rq=createNpcRequests(gr),part=createNpcParticipation(gr,society,rq),group={id:'conversation:1',anchorId:'a',regionId:'kael',npcIds:['a','b'],materialized:{templateId:'group',eventId:'event:1',revision:1,binding:{source:'a',target:'b'}}};
const gc=createNpcScheduler({save:gs,registry:gr,getDefinitions:get,participation:part});
const snap=JSON.stringify(gs.data),gcChoices=gc.participationChoices(group);
a(gcChoices.length===3&&JSON.stringify(gs.data)===snap,'group observation read only');
a(gc.executeParticipation(group,gcChoices[0]).ok&&JSON.stringify(gs.data)===snap,'chat no effect');
a(gc.executeParticipation(group,gcChoices[1]).text==='Amount 3'&&JSON.stringify(gs.data)===snap,'question only known fact');
gs.write=()=>false;a(!gc.executeParticipation(group,gcChoices[2]).ok&&JSON.stringify(gs.data)===snap,'share rollback');gs.write=()=>true;
a(gc.executeParticipation(group,gcChoices[2]).ok,'explicit mediation');
a(gs.data.npcStates.b.relationships.player.affinity===2&&gs.data.npcStates.a.relationships.player.affinity===undefined,'target-only relationship');
a(!gc.executeParticipation(group,gcChoices[2]).ok,'no repeated knowledge reward');
gs.data.livingWorld.events[0].revision=2;
a(gc.participationChoices(group).length===0,'stale group event');
save.data.npcStates.a.needs.hunger=0;sc.advanceTo(10);save.data.npcStates.a.needs.hunger=8;sc.advanceTo(11);
a(sc.executeRequest('a',sc.requestChoices('a')[0]).ok,'accept to abandon');
const abandon=sc.requestChoices('a').find(c=>c.id==='living.request.abandon');
a(sc.executeRequest('a',abandon).ok&&save.data.livingWorld.requests.at(-1).state==='abandoned','abandon explicit even without supply');
a(sc.advanceTo(12).ok&&sc.requestChoices('a').length===0,'no same episode reissue');
console.log('PASS participation + requests: '+checks+' checks');


// Registered graph uses the existing authoritative participation transaction.
import {createTopicSession} from '../src/core/npc-dialogue.js';
import {graphGroupTopic} from '../src/core/npc-topic.js';
const graph={id:'group.graph',version:1,source:'event',topicId:'supply',priority:1,
 eligibility:{regionIds:['kael'],conditions:[]},slots:[{id:'source',kind:'npc',tags:['worker']},{id:'target',kind:'npc',tags:['worker']},{id:'player',kind:'player'}],
 eventBinding:{typeId:'shortage',factRefs:[{alias:'amount',slotId:'source',factKey:'amount'}]},ambientPath:[{slotId:'source',text:'Amount {amount}',duration:10}],
 participationIds:['mediate'],entryNode:'ask',nodes:[
 {id:'ask',type:'choice',choices:[{id:'share',label:'Share',conditions:[],nextNode:'effect'},{id:'back',label:'Back',conditions:[],nextNode:'hub'}]},
 {id:'effect',type:'effect',action:{handlerId:'living.group.share',argsRefs:{npc:{kind:'slot',id:'source'}}},outcomes:{ok:'ok',fail:'fail',stale:'fail'}},
 {id:'ok',type:'speak',speakerSlot:'target',pages:['Thank you'],next:'hub'},{id:'fail',type:'speak',speakerSlot:'target',pages:['Not now'],next:'hub'},{id:'hub',type:'end',mode:'topicHub'}]};
const rg=createLivingWorldRegistry({regions:['kael'],societyHandlers:['e','prop'],dialogueHandlers:['living.group.share']});
const gd={...registrations,conversationTemplates:[graph]};
a(!rg.validateRegistry({...gd,conversationTemplates:[{...graph,participationIds:['missing']}]}).ok,'unknown graph participation rejected');
a(rg.registerDefinitions(gd).ok,'graph participation registered');
const saved={data:JSON.parse(snap),write:()=>true};
const rs=createWorldSociety(rg,{prop:()=>.8}),rp=createNpcParticipation(rg,rs,createNpcRequests(rg)),rc=createNpcScheduler({save:saved,registry:rg,getDefinitions:get,participation:rp});
const joined={...group,materialized:{...group.materialized,templateId:graph.id,graph:true,facts:{amount:3}}};
const ctx={npcId:'a',regionId:'kael',tags:['worker']};
const resolve=()=>{const t=graphGroupTopic(rg,joined,id=>rs.knownEvents(saved.data,id),ctx);return {topics:t?[t]:[],services:rc.participationChoices(joined)}};
const S=createTopicSession({id:'a'},'Amount 3',{readContext:()=>ctx,resolve,executeEffect:(id,args)=>{
 const choices=rc.participationChoices(joined).filter(c=>c.id===id&&c.sourceNpcId===args.npc);
 return choices.length===1?rc.executeParticipation(joined,choices[0]):{ok:false,reason:'stale'};
}});
const choose=id=>{const i=S.choices.findIndex(c=>c.id===id);return i>=0&&S.select(i,S.revision,S.choices[i].token)};
a(choose(graph.id)&&JSON.stringify(saved.data)===snap,'graph entry read only');
saved.write=()=>false;
a(choose('share')&&S.text==='Not now'&&JSON.stringify(saved.data)===snap,'graph share transaction rollback');
saved.write=()=>true;
a(choose(graph.id)&&choose('share')&&S.text==='Thank you'&&S.currentSpeakerId==='b'&&S.status==='active','real graph effect and followup');
a(saved.data.npcStates.b.relationships.player.affinity===2&&rs.knownEvents(saved.data,'b').some(e=>e.facts.amount===3),'real knowledge and relation changed');
a(!rc.participationChoices(joined).length,'no duplicate share');
console.log('PASS graph participation with authoritative scheduler and save');
