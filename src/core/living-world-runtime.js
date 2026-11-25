import {createLivingWorldRegistry} from './living-world-registry.js';
import {createLivingWorldState} from './living-world-state.js';
import {createNpcScheduler} from './npc-scheduler.js';
import {createItemRuntime} from './shared-items.js';
import {gameClockTick} from './npc-movement.js';
import {createWorldSociety} from './world-society.js';
import {createConversationBridge} from './npc-conversation.js';
import {createNpcRequests} from './npc-requests.js';
const copy=v=>JSON.parse(JSON.stringify(v));
const fail=reason=>({ok:false,reason});
const point=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
export function createLivingWorldRuntime({save,getDefinitions,regionId,residents,clock,places=[],content={},routeFor,validateRoute,conversationPair=()=>false,configureItems=()=>{},onCommit=()=>{},budget=32}){
 const known=new Map(residents.map(n=>[n.id,n]));
 if(known.size!==residents.length)return fail('duplicate_resident');
 const handlers={move:{plan({npcId,npc,action}){
  if(!point(npc.logicalPosition)||!action.placeId||typeof routeFor!=='function')return fail('unreachable');
  const r=routeFor({npcId,from:npc.logicalPosition,placeId:action.placeId,metersPerTick:action.metersPerTick??1.35});
  return r?.ok?{ok:true,plan:{route:r.route}}:fail(r?.reason??'unreachable');
 }},...(content.handlers??{})};
 const registry=createLivingWorldRegistry({handlers:Object.keys(handlers),regions:[regionId],places,societyHandlers:Object.keys(content.societyHandlers??{})});
 const defs=content.definitions??{},overrides=new Map((defs.profiles??[]).map(p=>[p.id,p]));
 if(overrides.size!==(defs.profiles??[]).length||[...overrides.keys()].some(id=>!known.has(id)))return fail('invalid_profile');
 const registered=registry.registerDefinitions({...defs,profiles:residents.map(n=>overrides.get(n.id)??{id:n.id,regionId,roleId:null,tags:n.role?[n.role]:[]})});
 if(!registered.ok)return registered;
 const society=createWorldSociety(registry,content.societyHandlers??{});
 const requests=createNpcRequests(registry);
 const managed=new Set(registry.list('profiles').filter(p=>registry.get('roles',p.roleId)?.actionIds.length).map(p=>p.id));
 const initialTick=gameClockTick(clock);if(initialTick===null)return fail('invalid_clock');
 const before=copy(save.data),staged={data:copy(save.data),write:()=>true};
 const initialState=createLivingWorldState(staged,registry,getDefinitions);
 const pre=initialState.status();if(!pre.ok)return pre;
 try{
  const items=createItemRuntime(staged,getDefinitions);items.initialize();
  for(const n of residents)if(n.role==='smith'||n.role==='vendor')items.seedMerchant('npc:'+n.id,n.role);
  const result=initialState.initialize({worldTick:initialTick});if(!result.ok)return result;
  for(const id of managed){const n=staged.data.npcStates[id],initial=known.get(id).position;
   if(!n.logicalPosition){if(!point(initial))return fail('missing_initial_position');n.logicalPosition=copy(initial)}
  }
  if(!society.valid(staged.data)||!requests.valid(staged.data))return fail('invalid_society');
  if(staged.data.livingWorld.worldTick>initialTick)return fail('clock_behind');
  if(!managed.size&&!society.enabled()&&!requests.enabled()&&!staged.data.livingWorld.scheduler.length)staged.data.livingWorld.worldTick=initialTick;
 }catch{return fail('invalid_save')}
 const root=save.data,install=value=>{for(const k of Object.keys(root))delete root[k];Object.assign(root,value);save.data=root};
 if(JSON.stringify(staged.data)!==JSON.stringify(before)){
  try{install(staged.data);if(typeof save.write!=='function'||save.write()===false)throw Error('save failed')}
  catch{install(before);return fail('save_failed')}
 }
 const scheduler=createNpcScheduler({save,registry,getDefinitions,handlers,validateRoute,society,requests,
  configureItems(items){configureItems(items);content.configureItems?.(items)},onCommit});
 let lastTarget=null,pending=0,lastResult={ok:true,processed:0,pending:0},held=null;
 const conversation=createConversationBridge({registry,scheduler,readState:()=>save.data,managed:id=>managed.has(id),knownEvents:id=>society.knownEvents(save.data,id),canPair:conversationPair,settled:()=>lastResult.ok&&!pending,playerHeld:id=>held?.id===id});
 function update(activeSpeaker=null){
  conversation.retry();
  if(held&&held.id!==activeSpeaker){
   const r=scheduler.resume(held.id,held.job);
   if(!r.ok&&r.reason!=='stale')return r;
   held=null;
  }
  if(!managed.size&&!society.enabled()&&!requests.enabled())return lastResult;
  const target=gameClockTick(clock);
  if(target===null)return fail('invalid_clock');
  if(lastTarget===target&&!pending)return lastResult;
  const r=scheduler.advanceTo(target,budget);lastResult=r;
  if(r.ok){lastTarget=target;pending=r.pending}
  return r;
 }
 function canTalk(id){
  if(!managed.has(id))return true;
  const a=save.data.npcStates?.[id]?.currentAction;
  return lastResult.ok&&!pending&&!!a&&a.interruptPolicy==='pauseable'&&(!a.paused||held?.id===id&&held.job===a.id||conversation.groupHeld(id)===a.id);
 }
 function beginTalk(id){
  if(!canTalk(id))return false;
  if(!managed.has(id)){conversation.leaveNpc(id);return true}
  const a=save.data.npcStates?.[id]?.currentAction;
  if(!a||held)return false;
  const claimed=conversation.claim(id);
  if(claimed===a.id){held={id,job:a.id};return true}
  const r=scheduler.pause(id,a.id);if(!r.ok)return false;
  held={id,job:a.id};return true;
 }
 for(const job of scheduler.snapshot()??[])if(job.status==='paused'){
  const r=scheduler.resume(job.npcId,job.id);if(!r.ok)return r;
 }
 return {ok:true,managed:id=>managed.has(id),update,canTalk,beginTalk,
  position:id=>managed.has(id)?scheduler.logicalPosition(id):null,
  conversationsEnabled:conversation.enabled,groupFor:conversation.groupFor,leaveGroup:conversation.leaveNpc,clearGroups:conversation.clear,
  updateConversations:args=>conversation.update({...args,regionId}),
  requestChoices:id=>lastResult.ok&&!pending?scheduler.requestChoices(id):[],
  executeRequest:(id,choice)=>lastResult.ok&&!pending&&canTalk(id)?scheduler.executeRequest(id,choice):fail('stale'),
  knownEvents:(id,options)=>society.knownEvents(save.data,id,options),
  shareKnowledge:command=>lastResult.ok&&!pending?scheduler.shareKnowledge(command):fail('stale'),
  snapshot:()=>({state:copy(save.data.livingWorld),managed:[...managed],lastResult:copy(lastResult),conversations:conversation.snapshot()})};
}
