// Data-only registration for the living-world core. No production content is implicit.
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[a-z][a-z0-9_]*(?:[.:/-][a-z0-9_]+)*$/.test(v)&&!['constructor','prototype','__proto__'].includes(v);
const number=v=>typeof v==='number'&&Number.isFinite(v);
const tick=v=>Number.isSafeInteger(v)&&v>=0;
const ids=v=>Array.isArray(v)&&v.every(id)&&new Set(v).size===v.length;
const copy=v=>JSON.parse(JSON.stringify(v));
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v)}return v};
const types=['needs','actions','roles','profiles','eventTypes','regionSignalTypes','conversationTemplates','requestPolicies','relationPolicies','participationActions'];
export function createLivingWorldRegistry({handlers=[],regions=[],places=[],societyHandlers=[]}={}){
 const knownSocietyHandlers=new Set(societyHandlers);
 const knownHandlers=new Set(handlers),knownRegions=new Set(regions),knownPlaces=new Set(places);
 let tables=Object.fromEntries(types.map(t=>[t,new Map()]));
 function inspect(data){
  const errors=[],next=Object.fromEntries(types.map(t=>[t,new Map(tables[t])]));
  const fail=(type,key,message)=>errors.push({type,id:key,message});
  if(!object(data))return {ok:false,errors:[{message:'invalid batch'}]};
  for(const [type,list] of Object.entries(data)){
   if(!types.includes(type)||!Array.isArray(list)){fail(type,null,'unknown type or invalid list');continue}
   for(const row of list){
    if(!object(row)||!id(row.id)){fail(type,row?.id,'invalid id');continue}
    if(next[type].has(row.id)){fail(type,row.id,'duplicate id');continue}
    try{
     const serial=JSON.stringify(row,(_k,v)=>{if(typeof v==='function'||typeof v==='undefined'||typeof v==='symbol'||typeof v==='bigint'||typeof v==='number'&&!Number.isFinite(v))throw Error('not JSON');return v});
     next[type].set(row.id,freeze(JSON.parse(serial)));
    }catch{fail(type,row.id,'invalid JSON data')}
   }
  }
  const ref=(type,key,target,value)=>{if(!id(value)||!next[target].has(value))fail(type,key,'missing '+target+' reference: '+value)};
  const weightMap=(type,row,field)=>{const map=row[field];if(!object(map)){fail(type,row.id,'invalid '+field);return}
   for(const [key,value] of Object.entries(map)){ref(type,row.id,'needs',key);if(!number(value)||value<0)fail(type,row.id,'invalid weight '+key)}};
  for(const n of next.needs.values()){
   if(!number(n.min)||!number(n.max)||n.min>=n.max||!number(n.initial)||n.initial<n.min||n.initial>n.max||!number(n.perTick)||!number(n.threshold)||n.threshold<n.min||n.threshold>n.max)fail('needs',n.id,'invalid need bounds/rate');
  }
  for(const a of next.actions.values()){
   if(!id(a.handlerId)||!knownHandlers.has(a.handlerId)||!tick(a.duration)||a.duration<1||!['interruptible','atomic','pauseable'].includes(a.interruptPolicy))fail('actions',a.id,'invalid action handler/duration/interruption');
   weightMap('actions',a,'needWeights');
   if(a.placeId!==undefined&&!knownPlaces.has(a.placeId))fail('actions',a.id,'unknown place');
  }
  for(const r of next.roles.values()){
   if(!ids(r.actionIds))fail('roles',r.id,'invalid action list');else for(const a of r.actionIds)ref('roles',r.id,'actions',a);
   weightMap('roles',r,'needWeights');
  }
  for(const p of next.profiles.values()){
   if(!/^[a-z][a-z0-9_-]*$/.test(p.id)||!knownRegions.has(p.regionId)||!ids(p.tags))fail('profiles',p.id,'invalid NPC identity/region/tags');
   if(p.roleId!==null)ref('profiles',p.id,'roles',p.roleId);
   if(p.placeId!==undefined&&!knownPlaces.has(p.placeId))fail('profiles',p.id,'unknown place');
   if(p.needWeights!==undefined)weightMap('profiles',p,'needWeights');
  }
  for(const e of next.eventTypes.values()){
   if(!knownSocietyHandlers.has(e.evaluateHandlerId)||!knownSocietyHandlers.has(e.propagationHandlerId)||!ids(e.regionIds)||!e.regionIds.length||e.regionIds.some(r=>!knownRegions.has(r))||!number(e.minIntensity)||!number(e.maxIntensity)||e.minIntensity>=e.maxIntensity||!ids(e.factKeys))fail('eventTypes',e.id,'invalid event policy');
  }
  for(const s of next.regionSignalTypes.values()){
   if(!knownSocietyHandlers.has(s.handlerId)||!ids(s.regionIds)||!s.regionIds.length||s.regionIds.some(r=>!knownRegions.has(r))||!number(s.min)||!number(s.max)||s.min>=s.max)fail('regionSignalTypes',s.id,'invalid signal policy');
  }
  for(const p of next.relationPolicies.values()){
   if(!number(p.min)||!number(p.max)||p.min>0||p.max<0||p.min>=p.max||!number(p.delta)||!tick(p.cooldownTicks))fail('relationPolicies',p.id,'invalid bounds/delta/cooldown');
  }
  for(const p of next.requestPolicies.values()){
   ref('requestPolicies',p.id,'needs',p.needKey);
   if(p.relationPolicyId!==undefined)ref('requestPolicies',p.id,'relationPolicies',p.relationPolicyId);
   if(!ids(p.tags)||!object(p.selector)||!id(p.selector.definitionId)||!tick(p.quantity)||p.quantity<1||!tick(p.minimumQuality)||p.minimumQuality>100||!tick(p.reward)||!tick(p.ttlTicks)||p.ttlTicks<1||!number(p.needDelta)||p.needDelta>=0||typeof p.label!=='string'||!p.label.trim())fail('requestPolicies',p.id,'invalid request policy');
  }
  for(const p of next.participationActions.values()){
   const bad=m=>fail('participationActions',p.id,m);
   if(!['reply','question','share','request'].includes(p.kind)||typeof p.label!=='string'||!p.label.trim()||p.label.length>200){bad('invalid action');continue}
   if(p.kind!=='request'&&(typeof p.reply!=='string'||!p.reply.trim()||p.reply.length>500)){bad('invalid reply');continue}
   if(['question','share'].includes(p.kind)&&(!id(p.sourceSlot)||!ids(p.factKeys)||!p.factKeys.length))bad('invalid fact source');
   if(['share','request'].includes(p.kind)&&!id(p.targetSlot))bad('invalid target slot');
   if(p.kind==='share'&&p.sourceSlot===p.targetSlot)bad('same source and target');
   if(p.relationPolicyId!==undefined){if(p.kind!=='share')bad('relation requires meaningful information transfer');ref('participationActions',p.id,'relationPolicies',p.relationPolicyId)}
   if(p.requestPolicyId!==undefined){if(p.kind!=='request')bad('invalid request reference');ref('participationActions',p.id,'requestPolicies',p.requestPolicyId)}
   if(p.kind!=='request'){
    const keys=[...p.reply.matchAll(/\{([a-z][a-z0-9_.:-]*)\}/g)].map(m=>m[1]);
    if(keys.some(k=>!['question','share'].includes(p.kind)||!p.factKeys?.includes(k))||/[{}]/.test(p.reply.replace(/\{([a-z][a-z0-9_.:-]*)\}/g,'')))bad('invalid reply placeholder');
   }
  }
  for(const t of next.conversationTemplates.values()){
   const bad=m=>fail('conversationTemplates',t.id,m);
   if(!id(t.topic)||!ids(t.regionIds)||!t.regionIds.length||t.regionIds.some(r=>!knownRegions.has(r))||!Array.isArray(t.slots)||t.slots.length<2||t.slots.length>4||!Array.isArray(t.turns)||!t.turns.length||t.turns.length>32){bad('invalid template scope or size');continue}
   const slotIds=t.slots.map(s=>s?.id);
   if(!ids(slotIds)||t.slots.some(s=>!object(s)||!ids(s.tags)))bad('invalid role slots');
   const refs=t.factRefs??[];
   if(!Array.isArray(refs)||!ids(refs.map(r=>r?.key))){bad('invalid fact references');continue}
   for(const r of refs){
    const e=next.eventTypes.get(t.eventTypeId);
    if(!object(r)||!slotIds.includes(r.slotId)||!e||!e.factKeys.includes(r.factKey))bad('unregistered fact reference');
   }
   if(t.eventTypeId!==undefined&&!next.eventTypes.has(t.eventTypeId))bad('unknown event type');
   for(const line of t.turns){
    if(!object(line)||!slotIds.includes(line.slotId)||typeof line.text!=='string'||!line.text.trim()||line.text.length>500||!number(line.duration)||line.duration<.5||line.duration>30){bad('invalid turn');continue}
    const keys=[...line.text.matchAll(/\{([a-z][a-z0-9_.:-]*)\}/g)].map(m=>m[1]);
    if(keys.some(k=>!refs.some(r=>r.key===k&&r.slotId===line.slotId))||/[{}]/.test(line.text.replace(/\{([a-z][a-z0-9_.:-]*)\}/g,'')))bad('invalid placeholder');
   }
   if(t.participationIds!==undefined){
    if(!ids(t.participationIds))bad('invalid participation ids');
    else for(const key of t.participationIds){
     const p=next.participationActions.get(key);
     if(!p){bad('unknown participation action');continue}
     if(p.sourceSlot!==undefined&&!slotIds.includes(p.sourceSlot)||p.targetSlot!==undefined&&!slotIds.includes(p.targetSlot))bad('unbound participation slot');
     if(['question','share'].includes(p.kind)){
      const e=next.eventTypes.get(t.eventTypeId);
      if(!e||!Array.isArray(p.factKeys)||p.factKeys.some(k=>!e.factKeys.includes(k)))bad('unregistered participation fact');
     }
    }
   }
  }
  return errors.length?{ok:false,errors}:{ok:true,tables:next};
 }
 return {
  registerDefinitions(batch){const result=inspect(batch);if(!result.ok)return result;tables=result.tables;return {ok:true}},
  validateRegistry(batch={}){const r=inspect(batch);return r.ok?{ok:true}:r},
  get(type,key){return tables[type]?.get(key)??null},
  list(type){return [...(tables[type]?.values()??[])]},
 };
}
