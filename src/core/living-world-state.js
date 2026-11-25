import {createNpcStateStore} from './npc-dialogue.js';
import {createItemRuntime} from './shared-items.js';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const tick=v=>Number.isSafeInteger(v)&&v>=0;
const copy=v=>JSON.parse(JSON.stringify(v));
const fail=reason=>({ok:false,reason});
const fresh=(worldTick,seed)=>({version:1,worldTick,nextSerial:1,seed,scheduler:[],events:[],requests:[],operationReceipts:[],regionSignals:{}});
function inspect(data){
 if(!object(data))return fail('invalid_save');
 if(data.npcStates!==undefined&&(!object(data.npcStates)||Object.values(data.npcStates).some(n=>!object(n))))return fail('invalid_npc_states');
 const w=data.livingWorld;
 if(w===undefined)return {ok:true};
 if(!object(w))return fail('invalid_living_world');
 if(w.version!==1)return fail('unsupported_version');
 if(!tick(w.worldTick)||!tick(w.seed)||!tick(w.nextSerial)||w.nextSerial<1||!['scheduler','events','requests','operationReceipts'].every(k=>Array.isArray(w[k]))||!object(w.regionSignals))return fail('invalid_living_world');
 return {ok:true};
}
// NPC fields share the existing Save-backed state store. No separate inventory/clock.
export function createLivingWorldState(save,registry,getDefinitions){
 function initialize({worldTick=0,seed=0}={}){
  if(!tick(worldTick)||!tick(seed))return fail('invalid');
  const check=inspect(save.data);if(!check.ok)return check;
  let draft;
  try{
   draft=copy(save.data);draft.livingWorld??=fresh(worldTick,seed);
   const holder={data:draft},npc=createNpcStateStore(holder),items=createItemRuntime(holder,getDefinitions);
   items.initialize();
   for(const p of registry.list('profiles')){
    const prior=draft.npcStates?.[p.id];
    // Preserve existing dialogue and location values; do not silently replace corrupt needs.
    if(prior?.needs!==undefined&&!object(prior.needs))return fail('invalid_needs');
    npc.ensure(p.id,prior?.region??p.regionId);
    const n=draft.npcStates[p.id];
    n.needs??={};
    const role=registry.get('roles',p.roleId);
    const keys=new Set([...Object.keys(role?.needWeights??{}),...Object.keys(p.needWeights??{}),...(role?.actionIds??[]).flatMap(a=>Object.keys(registry.get('actions',a)?.needWeights??{}))]);
    for(const key of keys){
     const rule=registry.get('needs',key);
     if(!rule)return fail('missing_need_rule');
     if(!Object.hasOwn(n.needs,key))n.needs[key]=rule.initial;
     else if(!Number.isFinite(n.needs[key])||n.needs[key]<rule.min||n.needs[key]>rule.max)return fail('invalid_needs');
    }
    if(n.needUpdatedAt===undefined)n.needUpdatedAt=draft.livingWorld.worldTick;
    if(!tick(n.needUpdatedAt)||n.needUpdatedAt>draft.livingWorld.worldTick)return fail('invalid_need_tick');
    items.registerActor('npc:'+p.id,'npc',0);
   }
  }catch{return fail('invalid_save')}
  const original=save.data,before=copy(original);
  if(JSON.stringify(draft)===JSON.stringify(original))return {ok:true,changed:false};
  // Install the staged JSON in the original root, so legacy callers keep their root identity.
  const install=value=>{for(const k of Object.keys(original))delete original[k];Object.assign(original,value);save.data=original};
  try{install(draft);if(typeof save.write!=='function'||save.write()===false)throw Error('save failed')}
  catch{install(before);return fail('save_failed')}
  return {ok:true,changed:true};
 }
 function getNpc(id){
  if(!inspect(save.data).ok)return null;
  return createNpcStateStore(save).get(id);
 }
 function projectState(id){
  const n=getNpc(id),p=registry.get('profiles',id);
  if(!n||!p)return null;
  const needs=Object.entries(n.needs??{}).flatMap(([key,value])=>{const r=registry.get('needs',key);return r&&value>=r.threshold?[key]:[]});
  const action=n.currentAction;
  const economy=save.data.itemEconomy;
  const actor='npc:'+id;
  const wallet=economy?.wallets?.find(w=>w.ownerId===actor);
  const stock=economy?.holdings?.filter(h=>h.ownerId===actor&&['inventory','storage'].includes(h.location.kind))??[];
  return {
   body:{state:needs.length?'needs_attention':'normal',tags:needs},
   economy:{state:wallet?'registered':'unavailable',tags:wallet?[...(wallet.balance===0?['no_silver']:[]),...(stock.length===0?['no_stock']:[])]:[]},
   business:{state:action?.kind??n.activity??'idle',tags:[]},
   social:{state:action?.kind==='social'?'social':'independent',tags:[]}
  };
 }
 return {initialize,getNpc,projectState,status:()=>inspect(save.data),snapshot:()=>inspect(save.data).ok&&save.data.livingWorld?copy(save.data.livingWorld):null};
}
