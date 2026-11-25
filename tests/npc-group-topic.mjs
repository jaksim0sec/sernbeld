import {createLivingWorldRegistry} from '../src/core/living-world-registry.js';
import {createNpcConversations,createConversationBridge} from '../src/core/npc-conversation.js';
import {createTopicSession} from '../src/core/npc-dialogue.js';
import {graphGroupTopic} from '../src/core/npc-topic.js';
import {createNpcParticipation} from '../src/core/npc-participation.js';
let checks=0;const a=(v,m)=>{if(!v)throw Error(m);checks++};
const eventType={id:'shortage',regionIds:['kael'],evaluateHandlerId:'e',propagationHandlerId:'p',minIntensity:0,maxIntensity:10,factKeys:['amount','destination']};
const graph={id:'group.supply',version:1,source:'event',topicId:'supply',label:'Supply',priority:1,eligibility:{regionIds:['kael'],conditions:[]},
 slots:[{id:'source',kind:'npc',tags:['worker']},{id:'target',kind:'npc',tags:['worker']},{id:'player',kind:'player'}],
 eventBinding:{typeId:'shortage',factRefs:[{alias:'amount',slotId:'source',factKey:'amount'},{alias:'destination',slotId:'target',factKey:'destination'}]},
 ambientPath:[{slotId:'source',text:'Need {amount}',duration:5},{slotId:'target',text:'At {destination}',duration:10}],
 entryNode:'intro',nodes:[{id:'intro',type:'speak',speakerSlot:'source',pages:['Need {amount}'],next:'ask'},
 {id:'ask',type:'choice',choices:[{id:'where',label:'Where?',conditions:[{op:'knowsFact',alias:'destination'}],nextNode:'where'},{id:'help',label:'Help',conditions:[{op:'actionAvailable',id:'living.group.share'}],nextNode:'help'},{id:'back',label:'Back',conditions:[],nextNode:'hub'}]},
 {id:'where',type:'speak',speakerSlot:'target',pages:['At {destination}'],next:'ask'},
 {id:'help',type:'effect',action:{handlerId:'living.group.share',argsRefs:{npc:{kind:'slot',id:'source'}}},outcomes:{ok:'ok',fail:'hub',stale:'hub'}},
 {id:'ok',type:'speak',speakerSlot:'source',pages:['Thanks'],next:'hub'},{id:'hub',type:'end',mode:'topicHub'}]};
const r=createLivingWorldRegistry({regions:['kael'],societyHandlers:['e','p'],dialogueHandlers:['living.group.share'],dialogueActions:['living.group.share']});
a(r.registerDefinitions({eventTypes:[eventType],profiles:['a','b'].map(id=>({id,regionId:'kael',roleId:null,tags:['worker']})),conversationTemplates:[graph]}).ok,'group graph register');
let rev=1,active=true,know=true,amount=2;
const knownEvents=id=>!active?[]:id==='a'?[{id:'event:1',typeId:'shortage',revision:rev,state:'active',facts:{amount}}]:id==='b'&&know?[{id:'event:1',typeId:'shortage',revision:rev,state:'active',facts:{destination:'dock'}}]:[];
const args={active:true,regionId:'kael',player:{x:-12,y:0,z:0},npcs:[{id:'a',x:0,y:0,z:0,tags:['worker'],stationary:true},{id:'b',x:1,y:0,z:0,tags:['worker'],stationary:true}]};
const core=createNpcConversations({registry:r,knownEvents,canPair:()=>true});
a(core.update({...args,now:0})[0].text==='···'&&core.snapshot().stats.materializations===0,'lazy graph ambient');
a(core.update({...args,player:{x:0,y:0,z:0},now:6})[0].text==='At dock','second ambient turn');
const g=core.participationFor('a');
a(g.cursor===1&&g.offset===1&&g.currentTurn.npcId==='b'&&g.currentTurn.text==='At dock','current speaker and offset on join');
const context={npcId:'a',regionId:'kael',tags:['worker'],actionIds:['living.group.share']};
const resolve=x=>{const t=graphGroupTopic(r,g,knownEvents,x);return {topics:t?[t]:[],services:[]}};
const data={npcStates:{a:{},b:{}},livingWorld:{events:[{id:'event:1',typeId:'shortage',regionId:'kael',revision:1,state:'active'}]}};
const part=createNpcParticipation(r,{knownEvents:(_data,id)=>knownEvents(id)},{});
a(part.valid(data,g),'group participation validates graph binding');
a(resolve(context).topics[0].facts.destination==='dock','facts bound to distinct speakers');
let effects=0;
const session=createTopicSession({id:'a'},g.currentTurn.text,{readContext:()=>context,resolve,executeEffect:()=>{effects++;return {ok:true}}});
const select=id=>{const i=session.choices.findIndex(c=>c.id===id);return i>=0&&session.select(i,session.revision,session.choices[i].token)};
a(select(graph.id)&&session.currentSpeakerId==='a','join topic from hub');
a(select('where')&&session.text==='At dock'&&session.currentSpeakerId==='b','conditioned second speaker');
a(select('help')&&effects===1&&session.text==='Thanks'&&session.status==='active','explicit action result stays in same session');
a(select(graph.id),'reopen topic');
const stale=session.choices.findIndex(c=>c.id==='help'),token=session.choices[stale].token,revision=session.revision;
rev=2;
a(session.select(stale,revision,token)&&effects===1&&session.status==='active'&&!resolve(context).topics.length,'stale revision blocks effect');
a(!part.valid(data,g)&&core.update({...args,player:{x:0,y:0,z:0},now:7}).length===0,'stale group released');
rev=1;know=false;
a(!resolve(context).topics.length&&!part.valid(data,g),'missing speaker knowledge blocked');
know=true;amount=3;
a(!resolve(context).topics.length,'fact change without revision blocked');
amount=2;active=false;
a(!resolve(context).topics.length,'resolved event blocked');
active=true;
const actual={npcStates:{a:{currentAction:{id:'a1',interruptPolicy:'pauseable'}},b:{currentAction:{id:'b1',interruptPolicy:'pauseable'}}},livingWorld:{scheduler:[]}};
const scheduler={pause(id){actual.npcStates[id].currentAction.paused=true;return {ok:true}},resume(id){actual.npcStates[id].currentAction.paused=false;return {ok:true}}};
const bridge=createConversationBridge({registry:r,scheduler,readState:()=>actual,managed:()=>true,knownEvents,canPair:()=>true,settled:()=>true});
bridge.update({...args,player:{x:0,y:0,z:0},now:0});
const joined=bridge.join('a');
a(joined?.currentTurn.npcId==='a'&&actual.npcStates.a.currentAction.paused&&actual.npcStates.b.currentAction.paused,'joined graph holds both');
bridge.update({...args,now:1,suppressed:true});a(bridge.joinedFor('a')!==null,'dialogue suppression preserves hold');
bridge.leaveJoined();a(!actual.npcStates.a.currentAction.paused&&!actual.npcStates.b.currentAction.paused,'close resumes both');
console.log('PASS NPC event graph and group integration: '+checks+' checks');
