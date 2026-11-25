// Persistent facts are independent of rendering and dialogue text.
const copy=v=>JSON.parse(JSON.stringify(v));
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const tick=v=>Number.isSafeInteger(v)&&v>=0;
const id=v=>typeof v==='string'&&/^[a-z][a-z0-9_]*(?:[.:/-][a-z0-9_]+)*$/.test(v)&&!['constructor','prototype','__proto__'].includes(v);
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const sortIds=a=>[...a].sort(cmp);
const ids=a=>Array.isArray(a)&&a.every(id)&&new Set(a).size===a.length;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=reason=>({ok:false,reason});
const factValue=v=>v===null||typeof v==='string'||typeof v==='boolean'||Number.isFinite(v);
const keyOf=(type,region,key)=>JSON.stringify([type,region,key]);
const factsOf=(facts,keys)=>Object.fromEntries(sortIds(keys).filter(k=>Object.hasOwn(facts,k)).map(k=>[k,facts[k]]));
export function createWorldSociety(registry,handlers={}, {interval=5}={}){
 if(!tick(interval)||interval<1)throw Error('invalid society interval');
 const types=()=>registry.list('eventTypes').sort((a,b)=>cmp(a.id,b.id));
 const signals=()=>registry.list('regionSignalTypes').sort((a,b)=>cmp(a.id,b.id));
 const enabled=()=>!!(types().length||signals().length);
 const resident=(data,n,region)=>registry.get('profiles',n)?.regionId===region&&Object.hasOwn(data.npcStates??{},n)&&data.npcStates[n].region===region;
 function valid(data){
  const w=data?.livingWorld;
  if(!w||!Array.isArray(w.events)||!Array.isArray(w.operationReceipts)||!obj(w.regionSignals)||!tick(w.worldTick)||!tick(w.nextSerial)||w.nextSerial<1)return false;
  if(w.nextSocietyTick!==undefined&&(!tick(w.nextSocietyTick)||w.nextSocietyTick<w.worldTick))return false;
  const seen=new Set(),active=new Set();
  for(const e of w.events){
   if(!obj(e)||!id(e.id)||seen.has(e.id)||!id(e.typeId)||!id(e.regionId)||!id(e.key)||!['active','resolved'].includes(e.state)||!tick(e.revision)||e.revision<1||!tick(e.openedAt)||e.openedAt>w.worldTick||!Number.isFinite(e.intensity)||!ids(e.affectedNpcIds)||!ids(e.subjectRefs)||!obj(e.facts)||!Object.values(e.facts).every(factValue))return false;
   seen.add(e.id);
   const k=keyOf(e.typeId,e.regionId,e.key);
   if(e.state==='active'){if(active.has(k)||e.resolvedAt!==null)return false;active.add(k)}
   else if(!tick(e.resolvedAt)||e.resolvedAt<e.openedAt||e.resolvedAt>w.worldTick)return false;
  }
  return true;
 }
 function nextDue(w){return enabled()?(w.nextSocietyTick??w.worldTick):Infinity}
 function observe(data,n,e,keys,source,at,confidence){
  const npc=data.npcStates[n];npc.knowledge??={};
  if(!obj(npc.knowledge))throw Error('invalid knowledge');
  const prior=Object.hasOwn(npc.knowledge,e.id)?npc.knowledge[e.id]:null;
  const facts=factsOf(e.facts,keys);
  if(prior?.revision===e.revision)for(const [k,v] of Object.entries(prior.facts??{}))if(!Object.hasOwn(facts,k))facts[k]=v;
  npc.knowledge[e.id]={eventId:e.id,revision:e.revision,observedTick:at,source,confidence,state:e.state,facts:factsOf(facts,Object.keys(facts))};
 }
 function evaluateDraft(data,items,at){
  if(!enabled())return {ok:true,changes:[]};
  if(!valid(data)||at!==data.livingWorld.worldTick)return fail('invalid_society');
  const w=data.livingWorld,changes=[];
  // Read-only view: no item mutation methods or live Save references reach policies.
  const view={holdingsFor:a=>items.holdingsFor(a),balance:a=>items.balance(a),merchantOffers:a=>items.merchantOffers(a)};
  try{
   for(const t of types())for(const regionId of sortIds(t.regionIds)){
    const active=w.events.filter(e=>e.typeId===t.id&&e.regionId===regionId&&e.state==='active');
    const fn=handlers[t.evaluateHandlerId];
    if(typeof fn!=='function')return fail('unsupported');
    const proposed=fn({regionId,at,data:copy(data),items:view,active:copy(active)});
    if(!Array.isArray(proposed))return fail('invalid_policy');
    const seen=new Set();
    for(const p of [...proposed].sort((a,b)=>cmp(a?.key,b?.key))){
     if(!obj(p)||!id(p.key)||seen.has(p.key)||!Number.isFinite(p.intensity)||p.intensity<t.minIntensity||p.intensity>t.maxIntensity||!ids(p.affectedNpcIds)||p.affectedNpcIds.some(n=>!resident(data,n,regionId))||!ids(p.subjectRefs)||!obj(p.facts)||Object.entries(p.facts).some(([k,v])=>!t.factKeys.includes(k)||!factValue(v))||!obj(p.observations??{}))return fail('invalid_policy');
     seen.add(p.key);
     for(const [n,keys] of Object.entries(p.observations??{}))if(!p.affectedNpcIds.includes(n)||!ids(keys)||keys.some(k=>!Object.hasOwn(p.facts,k)))return fail('invalid_policy');
     const payload={intensity:p.intensity,affectedNpcIds:sortIds(p.affectedNpcIds),subjectRefs:sortIds(p.subjectRefs),facts:factsOf(p.facts,Object.keys(p.facts))};
     let e=active.find(e=>e.key===p.key),changed=false;
     if(!e){
      if(w.nextSerial>=Number.MAX_SAFE_INTEGER)return fail('serial_overflow');
      e={id:'event:'+w.nextSerial++,typeId:t.id,regionId,key:p.key,state:'active',openedAt:at,resolvedAt:null,revision:1,...payload};
      w.events.push(e);changed=true;
     }else if(!equal(payload,{intensity:e.intensity,affectedNpcIds:e.affectedNpcIds,subjectRefs:e.subjectRefs,facts:e.facts})){
      if(!tick(e.revision+1))return fail('serial_overflow');
      Object.assign(e,payload,{revision:e.revision+1});changed=true;
     }
     if(changed)changes.push({eventId:e.id,state:e.state,revision:e.revision});
     for(const [n,keys] of Object.entries(p.observations??{}).sort((a,b)=>cmp(a[0],b[0]))){
      const old=data.npcStates[n].knowledge?.[e.id];
      if(old?.revision!==e.revision||keys.some(k=>!Object.hasOwn(old.facts??{},k)))observe(data,n,e,keys,'direct',at,1);
     }
    }
    for(const e of active)if(!seen.has(e.key)){
     if(!tick(e.revision+1))return fail('serial_overflow');
     e.state='resolved';e.resolvedAt=at;e.revision++;changes.push({eventId:e.id,state:e.state,revision:e.revision});
     // Resolution is not automatically broadcast; stale knowledge remains historical.
    }
   }
   for(const s of signals())for(const regionId of sortIds(s.regionIds)){
    const fn=handlers[s.handlerId];if(typeof fn!=='function')return fail('unsupported');
    const value=fn({regionId,at,data:copy(data),items:view});
    if(!Number.isFinite(value)||value<s.min||value>s.max)return fail('invalid_policy');
    const r=w.regionSignals[regionId]??={};
    r[s.id]=value;
   }
   return {ok:true,changes};
  }catch{return fail('invalid_policy')}
 }
 function periodicDraft(data,items,at){
  const r=evaluateDraft(data,items,at);if(!r.ok)return r;
  if(!tick(at+interval))return fail('invalid_tick');
  data.livingWorld.nextSocietyTick=at+interval;return r;
 }
 function shareDraft(data,command){
  if(!valid(data)||!obj(command))return fail('invalid');
  const {operationId,eventId,fromId,toId,revision,keys}=command,w=data.livingWorld;
  if(!id(operationId)||!id(eventId)||!id(fromId)||!id(toId)||fromId===toId||!tick(revision)||!ids(keys)||!keys.length)return fail('invalid');
  const request={operationId,eventId,fromId,toId,revision,keys:sortIds(keys)};
  const prior=w.operationReceipts.find(r=>r.operationId===operationId);
  if(prior)return equal(prior.request,request)?copy(prior.result):fail('request_id_conflict');
  const e=w.events.find(e=>e.id===eventId),t=e&&registry.get('eventTypes',e.typeId);
  if(!e||!t||e.state!=='active'||e.revision!==revision)return fail('stale');
  if(!resident(data,fromId,e.regionId)||!resident(data,toId,e.regionId))return fail('unreachable');
  const source=data.npcStates[fromId].knowledge?.[eventId];
  if(source?.revision!==revision||request.keys.some(k=>!Object.hasOwn(source.facts??{},k)||source.facts[k]!==e.facts[k]))return fail('unavailable');
  const fn=handlers[t.propagationHandlerId];let confidence;
  try{confidence=fn?.({request:copy(request),event:copy(e),source:copy(source),data:copy(data),at:w.worldTick})}catch{return fail('invalid_policy')}
  if(!Number.isFinite(confidence)||confidence<=0||confidence>1||confidence>source.confidence)return fail('unavailable');
  const before=data.npcStates[toId].knowledge?.[eventId];
  if(before?.revision!==revision||request.keys.some(k=>!Object.hasOwn(before.facts??{},k)))observe(data,toId,e,request.keys,fromId,w.worldTick,confidence);
  const result={ok:true,operationId,eventId,toId,revision};
  w.operationReceipts.push({operationId,request,result});return copy(result);
 }
 function knownEvents(data,npcId,{historical=false}={}){
  const knowledge=data.npcStates?.[npcId]?.knowledge??{};
  return (data.livingWorld?.events??[]).flatMap(e=>{
   const k=knowledge[e.id];if(!k)return [];
   if(!historical&&(e.state!=='active'||k.revision!==e.revision))return [];
   return [{id:e.id,typeId:e.typeId,regionId:e.regionId,revision:k.revision,state:k.state,facts:copy(k.facts),confidence:k.confidence,observedTick:k.observedTick}];
  });
 }
 return {enabled,valid,nextDue,evaluateDraft,periodicDraft,shareDraft,knownEvents};
}
