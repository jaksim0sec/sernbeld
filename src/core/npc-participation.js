// Explicit participation uses the same authoritative request, event and relation state.
const fail=reason=>({ok:false,reason});
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const sameChoice=(a,b)=>a&&b&&a.id===b.id&&a.itemId===b.itemId&&a.revision===b.revision&&a.quote===b.quote&&JSON.stringify(a.allocations)===JSON.stringify(b.allocations);
export function applyNpcRelation(data,registry,npcId,policyId){
 if(policyId===undefined)return {ok:true};
 const p=registry.get('relationPolicies',policyId),player=data.npcStates?.[npcId]?.relationships?.player,at=data.livingWorld.worldTick;
 if(!p||!player||typeof player!=='object'||Array.isArray(player))return fail('invalid_relation');
 const old=player.affinity??0,times=player.affinityTicks??{},last=times[p.id];
 if(!Number.isFinite(old)||!times||typeof times!=='object'||Array.isArray(times)||last!==undefined&&(!safe(last)||last>at))return fail('invalid_relation');
 if(last===undefined||at-last>=p.cooldownTicks){
  player.affinity=Math.max(p.min,Math.min(p.max,old+p.delta));
  player.affinityTicks={...times,[p.id]:at};
 }
 return {ok:true};
}
export function createNpcParticipation(registry,society,requests){
 function valid(data,group){
  const m=group?.materialized,t=registry.get('conversationTemplates',m?.templateId);
  if(!t||!Array.isArray(group.npcIds)||!t.regionIds.includes(group.regionId)||!group.npcIds.includes(group.anchorId)||group.npcIds.length!==t.slots.length||new Set(group.npcIds).size!==group.npcIds.length||!m.binding)return false;
  const ids=t.slots.map(s=>m.binding[s.id]);
  if(new Set(ids).size!==ids.length||ids.some(id=>!group.npcIds.includes(id)||!data.npcStates?.[id]||registry.get('profiles',id)?.regionId!==group.regionId))return false;
  if(t.eventTypeId){
   const e=data.livingWorld.events.find(e=>e.id===m.eventId);
   if(!e||e.typeId!==t.eventTypeId||e.regionId!==group.regionId||e.state!=='active'||e.revision!==m.revision)return false;
  }else if(m.eventId!==null)return false;
  return true;
 }
 function choices(data,items,group){
  if(!valid(data,group))return [];
  const m=group.materialized,t=registry.get('conversationTemplates',m.templateId),out=[];
  const event=m.eventId&&data.livingWorld.events.find(e=>e.id===m.eventId);
  const known=id=>event?society.knownEvents(data,id).find(e=>e.id===event.id&&e.revision===event.revision&&e.state==='active')?.facts??{}:{};
  for(const id of t.participationIds??[]){
   const p=registry.get('participationActions',id);if(!p)continue;
   const source=m.binding[p.sourceSlot],target=m.binding[p.targetSlot];
   const prefix=[group.id,m.templateId,m.eventId,m.revision,p.id,source??null,target??null];
   if(p.kind==='request'){
    for(const req of requests.choices(data,items,target)){
     if(p.requestPolicyId&&req.policyId!==p.requestPolicyId)continue;
     out.push({...req,id:'living.group.request',label:p.label+' · '+req.label,targetNpcId:target,actionId:p.id,requestChoice:req,quote:JSON.stringify([...prefix,req.id,req.itemId,req.revision,req.quote])});
    }
    continue;
   }
   let facts={};
   if(p.kind==='question'||p.kind==='share'){
    const k=known(source);
    if(!event||p.factKeys.some(key=>!Object.hasOwn(k,key)||k[key]!==event.facts[key]))continue;
    facts=Object.fromEntries(p.factKeys.map(key=>[key,k[key]]));
    if(p.kind==='share'&&p.factKeys.every(key=>Object.hasOwn(known(target),key)))continue;
   }
   const reply=p.reply.replace(/\{([a-z][a-z0-9_.:-]*)\}/g,(_,key)=>String(facts[key]));
   out.push({id:'living.group.'+p.kind,itemId:p.id,revision:m.revision,quote:JSON.stringify([...prefix,facts]),label:p.label,actionId:p.id,sourceNpcId:source??null,targetNpcId:target??null,reply});
  }
  return out;
 }
 function execute(data,items,group,choice){
  const current=choices(data,items,group).find(c=>sameChoice(c,choice));
  if(!current)return fail('stale');
  const p=registry.get('participationActions',current.actionId);
  if(p.kind==='request')return requests.execute(data,items,current.targetNpcId,current.requestChoice);
  if(p.kind==='reply'||p.kind==='question')return {ok:true,text:current.reply};
  const w=data.livingWorld;
  if(!safe(w.nextSerial)||!safe(w.nextSerial+1))return fail('serial_overflow');
  const result=society.shareDraft(data,{operationId:'participation:'+w.nextSerial,eventId:group.materialized.eventId,revision:group.materialized.revision,fromId:current.sourceNpcId,toId:current.targetNpcId,keys:p.factKeys});
  if(!result.ok)return result;
  w.nextSerial++;
  const relation=applyNpcRelation(data,registry,current.targetNpcId,p.relationPolicyId);
  return relation.ok?{ok:true,text:current.reply,result}:relation;
 }
 return {valid,choices,execute};
}
