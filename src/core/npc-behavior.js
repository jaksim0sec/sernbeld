// Utility evaluation is independent of rendering and does not modify saved state.
const copy=v=>JSON.parse(JSON.stringify(v));
const tick=v=>Number.isSafeInteger(v)&&v>=0;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const cmp=(a,b)=>a<b?-1:a>b?1:0;
export function projectNeeds(npc,registry,at){
 if(!npc||!tick(at)||!tick(npc.needUpdatedAt)||at<npc.needUpdatedAt)throw Error('invalid need tick');
 const needs={...npc.needs},elapsed=at-npc.needUpdatedAt;
 for(const [key,value] of Object.entries(needs)){
  const rule=registry.get('needs',key);
  if(!rule)continue;
  if(!finite(value)||value<rule.min||value>rule.max)throw Error('invalid need value');
  needs[key]=Math.max(rule.min,Math.min(rule.max,value+rule.perTick*elapsed));
 }
 return needs;
}
export function createNpcBehavior(registry,handlers){
 function evaluate({npcId,npc,at,items,context={}}){
  const p=registry.get('profiles',npcId),role=registry.get('roles',p?.roleId);
  if(!p||!role)return [];
  const needs=projectNeeds(npc,registry,at);
  return role.actionIds.map(actionId=>{
   const action=registry.get('actions',actionId),handler=handlers.get(action?.handlerId);
   if(!action||!handler)return {actionId,eligible:false,reason:'unsupported'};
   if((npc.actionBackoff?.[actionId]??0)>at)return {actionId,eligible:false,reason:'backoff'};
   let score=action.baseScore??0;
   for(const [key,w] of Object.entries(action.needWeights)){
    const rule=registry.get('needs',key),value=needs[key];
    if(!rule||!finite(value))return {actionId,eligible:false,reason:'missing_need'};
    score+=((value-rule.min)/(rule.max-rule.min))*w*(role.needWeights[key]??1)*(p.needWeights?.[key]??1);
   }
   let result;
   try{result=handler.plan({npcId,actorId:'npc:'+npcId,npc:copy({...npc,needs}),action,at,items,context:copy(context)})}
   catch{return {actionId,eligible:false,reason:'handler_error'}}
   if(!result?.ok)return {actionId,eligible:false,reason:result?.reason??'unavailable'};
   const cost=result.cost??0;
   if(!finite(cost)||cost<0||!finite(score-cost))return {actionId,eligible:false,reason:'invalid_cost'};
   return {actionId,eligible:true,score:score-cost,plan:result.plan??{}};
  }).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||(a.eligible&&b.eligible?b.score-a.score:0)||cmp(a.actionId,b.actionId));
 }
 return {evaluate,choose(input){return evaluate(input).find(c=>c.eligible)??null}};
}
