import {createItemRuntime} from './shared-items.js';
import {createNpcBehavior,projectNeeds} from './npc-behavior.js';
const copy=v=>JSON.parse(JSON.stringify(v));
const tick=v=>Number.isSafeInteger(v)&&v>=0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const order=(a,b)=>(a.status==='paused'?1:0)-(b.status==='paused'?1:0)||(a.dueTick??0)-(b.dueTick??0)||cmp(a.id,b.id);
const fail=reason=>({ok:false,reason});
const sum=(a,b)=>{const n=a+b;if(!tick(n))throw Error('tick overflow');return n};
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const kinds=['consume','produce','purchase','transfer','gather','offerUpdate'];
// All economic mutations run against an isolated copy through the existing shared-item runtime.
// A slice persists exactly once; a failed outer write discards jobs, needs, locks and receipts together.
export function createNpcScheduler({save,registry,getDefinitions,handlers={},configureItems=()=>{},onCommit=()=>{},retryTicks=5}){
 if(!tick(retryTicks)||retryTicks<1)throw Error('invalid retryTicks');
 const map=new Map(Object.entries(handlers));
 const behavior=createNpcBehavior(registry,map);
 let busy=false;
 function valid(data){
  const w=data?.livingWorld;
  if(!object(w)||w.version!==1||!tick(w.worldTick)||!tick(w.nextSerial)||w.nextSerial<1||!tick(w.seed)||!Array.isArray(w.scheduler))return false;
  const actors=new Set(),jobIds=new Set();
  for(const j of w.scheduler){
   if(!object(j)||typeof j.id!=='string'||!registry.get('profiles',j.npcId)||!Object.hasOwn(data.npcStates??{},j.npcId)||(j.status!=='paused'&&(!tick(j.dueTick)||j.dueTick<w.worldTick))||actors.has(j.npcId)||jobIds.has(j.id)||!['decision','running','paused'].includes(j.status))return false;
   if(j.status==='running'||j.status==='paused'){
    const a=data.npcStates[j.npcId].currentAction;
    if(!a||a.id!==j.id||a.actionId!==j.actionId||!tick(j.startTick)||!object(j.plan))return false;
    if(j.status==='running'&&(j.startTick>j.dueTick||a.paused===true))return false;
    if(j.status==='paused'&&(!tick(j.remainingTicks)||j.remainingTicks<1||!tick(j.pausedAt)||j.pausedAt>w.worldTick||a.paused!==true||j.dueTick!==null))return false;
   }
   actors.add(j.npcId);jobIds.add(j.id);
  }
  return true;
 }
 function transact(work){
  if(busy)return fail('busy');
  if(!valid(save.data))return fail('invalid_scheduler');
  busy=true;
  const root=save.data,before=copy(root),draft=copy(root),notifications=[];
  const install=value=>{for(const k of Object.keys(root))delete root[k];Object.assign(root,value);save.data=root};
  try{
   const items=createItemRuntime({data:draft,write:()=>true},getDefinitions,{emit:(type,detail)=>notifications.push({type,detail})});
   configureItems(items);items.initialize();
   const result=work(draft,items);
   if(!result.ok)return result;
   if(!valid(draft))return fail('invalid_scheduler');
   if(JSON.stringify(draft)===JSON.stringify(before))return result;
   try{install(draft);if(typeof save.write!=='function'||save.write()===false)throw Error('save failed')}
   catch{install(before);return fail('save_failed')}
   try{onCommit(copy(notifications))}catch(error){console.error('[NPC scheduler notification]',error)}
   return result;
  }catch{return fail('invalid_scheduler')}finally{busy=false}
 }
 function allocate(w){if(!tick(w.nextSerial)||w.nextSerial>=Number.MAX_SAFE_INTEGER)throw Error('serial overflow');return 'npcjob:'+w.nextSerial++}
 function updateNeeds(n,at){n.needs=projectNeeds(n,registry,at);n.needUpdatedAt=at}
 function decision(w,npcId,dueTick){w.scheduler.push({id:allocate(w),npcId,dueTick,status:'decision'})}
 function seedActors(d){
  const w=d.livingWorld,active=new Set(w.scheduler.map(j=>j.npcId));
  for(const p of registry.list('profiles').sort((a,b)=>cmp(a.id,b.id))){
   if(!registry.get('roles',p.roleId)?.actionIds.length||active.has(p.id))continue;
   const n=d.npcStates?.[p.id];if(!n||n.currentAction)throw Error('NPC state not initialized');
   decision(w,p.id,w.worldTick);
  }
 }
 const readItems=items=>({planSupply:q=>items.planSupply(q),holdingsFor:a=>items.holdingsFor(a),balance:a=>items.balance(a),merchantOffers:a=>items.merchantOffers(a)});
 function cleanPlan(raw){
  if(!object(raw))return null;
  let p;try{p=JSON.parse(JSON.stringify(raw,(_k,v)=>{if(typeof v==='function'||typeof v==='undefined'||typeof v==='bigint'||typeof v==='number'&&!Number.isFinite(v))throw Error('invalid plan');return v}))}catch{return null}
  if(p.command&&(!kinds.includes(p.command.kind)||!object(p.command.payload)))return null;
  if(p.needEffects!==undefined&&(!object(p.needEffects)||Object.values(p.needEffects).some(v=>typeof v!=='number'||!Number.isFinite(v))))return null;
  if(p.command&&p.needEffects&&Object.keys(p.needEffects).length)return null; // economic effects belong to the shared operation
  if(p.reserve!==undefined&&typeof p.reserve!=='boolean')return null;
  if(p.reserve&&(!p.command||!Array.isArray(p.command.payload.allocations)||!['consume','produce','purchase','transfer'].includes(p.command.kind)))return null;
  return p;
 }
 function backoff(n,actionId,at){if(actionId)(n.actionBackoff??={})[actionId]=sum(at,retryTicks)}
 function start(d,items,j,n){
  const w=d.livingWorld,at=j.dueTick;
  const candidates=behavior.evaluate({npcId:j.npcId,npc:n,at,items:readItems(items),context:{worldTick:at}});
  for(const c of candidates){
   if(!c.eligible)continue;
   const action=registry.get('actions',c.actionId),plan=cleanPlan(c.plan);
   if(!plan){backoff(n,c.actionId,at);continue}
   const due=sum(at,action.duration),id=allocate(w);
   if(plan.command){
    const cmd={operationId:id,actorId:'npc:'+j.npcId,kind:plan.command.kind,payload:{...plan.command.payload,tick:at}};
    if(!items.canExecute(cmd).ok){backoff(n,c.actionId,at);continue}
    if(plan.reserve){
     const reservation=items.reserve({operationId:id,actorId:cmd.actorId,allocations:cmd.payload.allocations,expiresAt:due,policyId:cmd.payload.policyId,tick:at});
     if(!reservation.ok){backoff(n,c.actionId,at);continue}
    }
   }
   const job={id,npcId:j.npcId,status:'running',actionId:c.actionId,startTick:at,dueTick:due,plan};
   w.scheduler.push(job);n.currentAction={id,actionId:c.actionId,kind:action.handlerId,startTick:at,dueTick:due,interruptPolicy:action.interruptPolicy};
   return;
  }
  decision(w,j.npcId,sum(at,retryTicks));
 }
 function complete(d,items,j,n){
  const w=d.livingWorld,at=j.dueTick,action=registry.get('actions',j.actionId),handler=map.get(action?.handlerId);
  let result=handler?{ok:true}:fail('unsupported');
  if(result.ok&&typeof handler.canComplete==='function'){
   try{if(handler.canComplete({npcId:j.npcId,npc:copy(n),plan:copy(j.plan),at,items:readItems(items)})!==true)result=fail('unavailable')}catch{result=fail('handler_error')}
  }
  if(result.ok&&j.plan.command){
   const {kind,payload}=j.plan.command;
   result=items.commitOperation({operationId:j.id,actorId:'npc:'+j.npcId,kind,payload:{...payload,tick:at,...(j.plan.reserve?{reservationId:j.id}:{})}});
  }
  if(result.ok&&!j.plan.command){
   for(const [key,delta] of Object.entries(j.plan.needEffects??{})){
    const rule=registry.get('needs',key);
    if(!rule||!Object.hasOwn(n.needs,key)){result=fail('invalid_need_effect');break}
   }
   if(result.ok)for(const [key,delta] of Object.entries(j.plan.needEffects??{})){
    const rule=registry.get('needs',key);n.needs[key]=clamp(n.needs[key]+delta,rule.min,rule.max);
   }
  }
  if(j.plan.reserve&&!result.ok&&!items.release(j.id).ok)throw Error('release failed');
  delete n.currentAction;
  n.lastActionResult={id:j.id,actionId:j.actionId,tick:at,ok:!!result.ok,...(!result.ok?{reason:result.reason??'failed'}:{})};
  if(!result.ok)backoff(n,j.actionId,at);
  decision(w,j.npcId,sum(at,1));
 }
 function advanceTo(target,budget=32){
  if(!tick(target)||!tick(budget)||budget<1||target<(save.data?.livingWorld?.worldTick??0))return fail('invalid_tick');
  return transact((d,items)=>{
   const w=d.livingWorld;seedActors(d);let processed=0;
   while(processed<budget){
    w.scheduler.sort(order);const j=w.scheduler[0];
    if(!j||j.status==='paused'||j.dueTick>target)break;
    w.scheduler.shift();w.worldTick=j.dueTick;
    const n=d.npcStates[j.npcId];updateNeeds(n,j.dueTick);
    if(j.status==='decision')start(d,items,j,n);else complete(d,items,j,n);
    processed++;
   }
   w.scheduler.sort(order);
   const pending=w.scheduler.filter(j=>j.status!=='paused'&&j.dueTick<=target).length;
   if(!pending)w.worldTick=target;
   const settledThrough=pending?Math.max(0,Math.min(w.worldTick,w.scheduler[0].dueTick-1)):target;
   return {ok:true,processed,pending,settledThrough,worldTick:w.worldTick};
  });
 }
 function cancel(npcId,actionInstanceId){
  return transact((d,items)=>{
   const w=d.livingWorld,n=d.npcStates?.[npcId],j=w.scheduler.find(j=>j.npcId===npcId&&j.id===actionInstanceId&&['running','paused'].includes(j.status));
   if(!n||!j)return fail('stale');
   if(n.currentAction?.interruptPolicy==='atomic')return fail('not_interruptible');
   if(j.plan.reserve&&j.status!=='paused'&&!items.release(j.id).ok)return fail('release_failed');
   w.scheduler=w.scheduler.filter(x=>x.id!==j.id);
   updateNeeds(n,w.worldTick);delete n.currentAction;
   n.lastActionResult={id:j.id,actionId:j.actionId,tick:w.worldTick,ok:false,reason:'cancelled'};
   backoff(n,j.actionId,w.worldTick);decision(w,npcId,sum(w.worldTick,1));
   return {ok:true};
  });
 }
 // Pause releases reservations instead of holding scarce stock indefinitely.
 // Resume replans the exact action and reacquires resources; failure schedules a fresh decision.
 function pause(npcId,actionInstanceId){
  return transact((d,items)=>{
   const w=d.livingWorld,n=d.npcStates?.[npcId],j=w.scheduler.find(x=>x.npcId===npcId&&x.id===actionInstanceId&&x.status==='running');
   if(!n||!j)return fail('stale');
   if(n.currentAction?.interruptPolicy!=='pauseable')return fail('not_interruptible');
   if(j.dueTick<=w.worldTick)return fail('due');
   if(j.plan.reserve&&!items.release(j.id).ok)return fail('release_failed');
   updateNeeds(n,w.worldTick);
   j.remainingTicks=j.dueTick-w.worldTick;j.pausedAt=w.worldTick;j.dueTick=null;j.status='paused';
   n.currentAction={...n.currentAction,dueTick:null,paused:true};
   return {ok:true,remainingTicks:j.remainingTicks};
  });
 }
 function resume(npcId,actionInstanceId){
  return transact((d,items)=>{
   const w=d.livingWorld,n=d.npcStates?.[npcId],j=w.scheduler.find(x=>x.npcId===npcId&&x.id===actionInstanceId&&x.status==='paused');
   if(!n||!j)return fail('stale');
   const at=w.worldTick;updateNeeds(n,at);
   const candidate=behavior.evaluate({npcId,npc:n,at,items:readItems(items),context:{worldTick:at,resuming:true}}).find(c=>c.actionId===j.actionId&&c.eligible);
   const plan=candidate&&cleanPlan(candidate.plan),due=sum(at,j.remainingTicks);
   let reason=plan?null:'unavailable';
   if(plan?.command){
    const cmd={operationId:j.id,actorId:'npc:'+npcId,kind:plan.command.kind,payload:{...plan.command.payload,tick:at}};
    const validation=items.canExecute(cmd);
    if(!validation.ok)reason=validation.reason;
    else if(plan.reserve){
     const r=items.reserve({operationId:j.id,actorId:cmd.actorId,allocations:cmd.payload.allocations,expiresAt:due,policyId:cmd.payload.policyId,tick:at});
     if(!r.ok)reason=r.reason;
    }
   }
   if(reason){
    w.scheduler=w.scheduler.filter(x=>x.id!==j.id);delete n.currentAction;
    n.lastActionResult={id:j.id,actionId:j.actionId,tick:at,ok:false,reason};
    backoff(n,j.actionId,at);decision(w,npcId,sum(at,1));
    return {ok:true,resumed:false,reason};
   }
   j.plan=plan;j.dueTick=due;j.status='running';delete j.remainingTicks;delete j.pausedAt;
   n.currentAction={...n.currentAction,dueTick:due,paused:false};
   return {ok:true,resumed:true,dueTick:due};
  });
 }
 return {advanceTo,cancel,pause,resume,snapshot:()=>valid(save.data)?copy(save.data.livingWorld.scheduler):null};
}
