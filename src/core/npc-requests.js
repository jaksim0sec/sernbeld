import {projectNeeds} from './npc-behavior.js';
import {applyNpcRelation} from './npc-participation.js';
const fail=reason=>({ok:false,reason});
const active=r=>r.state==='open'||r.state==='accepted';
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const cmp=(a,b)=>a<b?-1:a>b?1:0;
export function createNpcRequests(registry){
 const policies=()=>registry.list('requestPolicies').sort((a,b)=>cmp(a.id,b.id));
 const policy=r=>registry.get('requestPolicies',r.policyId);
 function needed(data,npcId,p,at){
  const npc=data.npcStates?.[npcId],profile=registry.get('profiles',npcId),rule=registry.get('needs',p.needKey);
  return !!npc&&!!profile&&!!rule&&p.tags.every(t=>profile.tags.includes(t))&&Object.hasOwn(npc.needs??{},p.needKey)&&projectNeeds(npc,registry,at)[p.needKey]>=rule.threshold;
 }
 function valid(data){
  const w=data.livingWorld;
  if(!Array.isArray(w?.requests))return false;
  const ids=new Set(),keys=new Set();
  for(const r of w.requests){
   const p=r&&policy(r),key=r?.npcId+':'+p?.needKey;
   if(!p||!registry.get('profiles',r.npcId)||typeof r.id!=='string'||ids.has(r.id)||!safe(r.createdAt)||!safe(r.expiresAt)||r.expiresAt<=r.createdAt||!safe(r.revision)||r.revision<1||!['open','accepted','fulfilled','resolved','expired','abandoned'].includes(r.state)||typeof r.episodeClosed!=='boolean'||(!r.episodeClosed&&keys.has(key)))return false;
   ids.add(r.id);if(!r.episodeClosed)keys.add(key);
  }
  return true;
 }
 function sync(data,items,at){
  if(!valid(data))return fail('invalid_requests');
  const w=data.livingWorld;
  for(const r of w.requests){
   if(r.episodeClosed)continue;
   if(!needed(data,r.npcId,policy(r),at)){
    if(active(r)){r.state='resolved';r.revision++}
    r.episodeClosed=true;
   }else if(active(r)&&at>=r.expiresAt){r.state='expired';r.revision++}
  }
  for(const profile of registry.list('profiles').sort((a,b)=>cmp(a.id,b.id)))for(const p of policies()){
   if(!needed(data,profile.id,p,at)||items.balance('npc:'+profile.id)<p.reward||w.requests.some(r=>r.npcId===profile.id&&!r.episodeClosed&&policy(r).needKey===p.needKey))continue;
   if(!safe(w.nextSerial+1)||!safe(at+p.ttlTicks))return fail('serial_overflow');
   w.requests.push({id:'request:'+w.nextSerial++,npcId:profile.id,policyId:p.id,createdAt:at,expiresAt:at+p.ttlTicks,revision:1,state:'open',episodeClosed:false});
  }
  return {ok:true};
 }
 function choices(data,items,npcId){
  const at=data.livingWorld.worldTick;
  if(!valid(data))return [];
  return data.livingWorld.requests.filter(r=>r.npcId===npcId&&active(r)&&r.expiresAt>at&&needed(data,npcId,policy(r),at)).flatMap(r=>{
   const p=policy(r);
   const base={itemId:r.id,policyId:p.id,revision:r.revision,label:p.label,quote:JSON.stringify([p.selector.definitionId,p.quantity,p.minimumQuality,p.reward]),definitionId:p.selector.definitionId,quantity:p.quantity,minimumQuality:p.minimumQuality,reward:p.reward};
   const funded=items.balance('npc:'+npcId)>=p.reward;
   if(r.state==='open')return funded?[{...base,id:'living.request.accept'}]:[];
   const plan=items.planSupply({actorId:items.player,selector:{definitionId:p.selector.definitionId,minimumQuality:p.minimumQuality},quantity:p.quantity});
   return [...(funded&&plan.ok?[{...base,id:'living.request.submit',allocations:plan.allocations}]:[]),{...base,id:'living.request.abandon'}];
  });
 }
 function execute(data,items,npcId,choice){
  if(!choice||!valid(data))return fail('invalid_requests');
  const w=data.livingWorld,at=w.worldTick,r=w.requests.find(r=>r.id===choice.itemId&&r.npcId===npcId);
  if(r?.state==='fulfilled'&&choice.id==='living.request.submit'&&choice.revision===r.revision-1)return {ok:true,replayed:true};
  const c=choices(data,items,npcId).find(c=>c.id===choice.id&&c.itemId===choice.itemId&&c.revision===choice.revision&&c.quote===choice.quote);
  if(!c||!r)return fail('stale');
  if(c.id==='living.request.accept'){r.state='accepted';r.revision++;return {ok:true}}
  if(c.id==='living.request.abandon'){r.state='abandoned';r.revision++;return {ok:true}}
  if(JSON.stringify(c.allocations)!==JSON.stringify(choice.allocations))return fail('stale');
  const p=policy(r),n=data.npcStates[npcId],rule=registry.get('needs',p.needKey);
  const policyId='living:request';
  const registered=items.registerRequestPolicy(policyId,q=>q.kind==='requestComplete'&&q.actorId===items.player&&q.operationId===r.id&&q.payload.recipientId==='npc:'+npcId&&q.payload.reward===p.reward&&JSON.stringify(q.payload.allocations)===JSON.stringify(c.allocations));
  if(!registered.ok)return registered;
  const result=items.commitOperation({operationId:r.id,actorId:items.player,kind:'requestComplete',payload:{recipientId:'npc:'+npcId,allocations:c.allocations,policyId,reward:p.reward,tick:at}});
  if(!result.ok)return result;
  n.needs=projectNeeds(n,registry,at);n.needUpdatedAt=at;
  n.needs[p.needKey]=Math.max(rule.min,Math.min(rule.max,n.needs[p.needKey]+p.needDelta));
  r.state='fulfilled';r.revision++;r.episodeClosed=n.needs[p.needKey]<rule.threshold;
  const relation=applyNpcRelation(data,registry,npcId,p.relationPolicyId);
  return relation.ok?{ok:true,result}:relation;
 }
 return {enabled:()=>policies().length>0,valid,sync,choices,execute};
}
