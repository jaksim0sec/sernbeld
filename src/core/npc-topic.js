// Data-only NPC topic definitions. No UI, persistent writes or domain effects.
const own=(o,k)=>o!=null&&Object.hasOwn(o,k);
const obj=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const id=s=>typeof s==='string'&&s.length<=120&&/^[a-z][a-z0-9_]*(?:[.:/-][a-z0-9_]+)*$/.test(s)&&!s.split(/[.:/-]/).some(k=>['constructor','prototype','__proto__'].includes(k));
const ids=a=>Array.isArray(a)&&a.every(id)&&new Set(a).size===a.length;
const tick=n=>Number.isSafeInteger(n)&&n>=0;
const text=s=>typeof s==='string'&&s.trim().length>0&&s.length<=500;
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const primitive=v=>typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v);
const shape=(o,keys)=>obj(o)&&Object.keys(o).every(k=>keys.includes(k));
const copy=v=>JSON.parse(JSON.stringify(v));
export const isTopicGraph=t=>own(t,'version')||own(t,'nodes')||own(t,'source')||own(t,'topicId');
const conditionFields={met:['value'],role:['id'],tag:['id'],activity:['id'],affinityGte:['value'],questState:['id','state'],eventActive:[],knowsFact:['alias'],choiceSeen:['id'],topicSeen:['id'],actionAvailable:['id']};
function validCondition(c,refs,depth=0){
 if(!obj(c)||depth>8)return false;
 if(['all','any'].includes(c.op))return shape(c,['op','conditions'])&&Array.isArray(c.conditions)&&c.conditions.length>0&&c.conditions.length<=16&&c.conditions.every(x=>validCondition(x,refs,depth+1));
 if(c.op==='not')return shape(c,['op','condition'])&&validCondition(c.condition,refs,depth+1);
 if(!own(conditionFields,c.op)||!shape(c,['op',...conditionFields[c.op]]))return false;
 switch(c.op){
 case 'met':return typeof c.value==='boolean';
 case 'affinityGte':return Number.isFinite(c.value);
 case 'eventActive':return !!refs.event;
 case 'knowsFact':return refs.aliases.has(c.alias);
 case 'role':return id(c.id)&&refs.roles.has(c.id);
 case 'activity':case 'tag':return id(c.id);
 case 'choiceSeen':return refs.choices.has(c.id);
 case 'topicSeen':return refs.topics.has(c.id);
 case 'questState':return refs.quests.has(c.id)&&id(c.state);
 case 'actionAvailable':return refs.actions.has(c.id);
 default:return false;
 }
}
function conditionsOK(a,refs){return Array.isArray(a)&&a.length<=32&&a.every(c=>validCondition(c,refs));}
function placeholders(s,aliases,slot){
 if(!text(s))return false;
 const keys=[...s.matchAll(/\{([a-z][a-z0-9_.:-]*)\}/g)].map(m=>m[1]);
 return keys.every(k=>aliases.get(k)?.slotId===slot)&&!/[{}]/.test(s.replace(/\{([a-z][a-z0-9_.:-]*)\}/g,''));
}
function edges(n){return n.type==='speak'?[n.next]:n.type==='choice'?n.choices.map(c=>c.nextNode):n.type==='effect'?Object.values(n.outcomes):[];}
export function validateTopicGraph(t,{regions=new Set(),profiles=new Map(),roles=new Set(),events=new Map(),topics=new Set(),handlers=new Set(),quests=new Set(),actions=new Set()}={}){
 const errors=[],bad=m=>errors.push(m);
 if(!shape(t,['id','version','source','topicId','priority','eligibility','slots','eventBinding','entryNode','nodes','cooldown','memoryPolicy','ambientPath','label','participationIds'])||!id(t.id)||t.version!==1||!['named','personal','event'].includes(t.source)||!id(t.topicId)||!Number.isSafeInteger(t.priority)||Math.abs(t.priority)>10000||!id(t.entryNode)||!Array.isArray(t.nodes)||t.nodes.length<1||t.nodes.length>128){return ['invalid graph header'];}
 if(own(t,'label')&&!text(t.label))bad('invalid topic label');
 const e=t.eligibility;
 if(!shape(e,['npcIds','regionIds','roles','tags','conditions'])||!Array.isArray(e.conditions))return ['invalid eligibility'];
 for(const [k,set] of [['npcIds',profiles],['regionIds',regions],['roles',roles],['tags',null]])if(own(e,k)&&(!ids(e[k])||!e[k].length||set&&e[k].some(x=>!set.has(x))))bad('invalid eligibility '+k);
 if(t.source==='named'&&!e.npcIds?.length)bad('named graph requires NPC IDs');
 if(own(t,'cooldown')&&!tick(t.cooldown))bad('invalid cooldown');
 if(own(t,'memoryPolicy')&&!['none','choices','completion'].includes(t.memoryPolicy))bad('invalid memory policy');
 if(!Array.isArray(t.slots)||t.slots.length<2||t.slots.length>5||!ids(t.slots.map(s=>s?.id))||t.slots.some(s=>!shape(s,['id','kind','tags','role'])||!['npc','player'].includes(s.kind)||own(s,'tags')&&!ids(s.tags)||own(s,'role')&&!roles.has(s.role)||s.kind==='player'&&(own(s,'tags')||own(s,'role'))))return [...errors,'invalid slots'];
 const npcs=t.slots.filter(s=>s.kind==='npc'),players=t.slots.filter(s=>s.kind==='player');
 if(players.length!==1||!npcs.length||(t.source!=='event'&&npcs.length!==1))bad('invalid NPC/player slot count');
 const npcSlots=new Set(npcs.map(s=>s.id)),slotIds=new Set(t.slots.map(s=>s.id));
 const refs=new Map(),binding=t.eventBinding;
 if(t.source==='event'){
  const event=events.get(binding?.typeId);
  if(!shape(binding,['typeId','factRefs'])||!event||!ids(event.factKeys)||!ids(event.regionIds)||!Array.isArray(binding.factRefs)||binding.factRefs.length>32||!ids(binding.factRefs.map(r=>r?.alias)))return [...errors,'invalid event binding'];
  for(const r of binding.factRefs){
   if(!shape(r,['alias','slotId','factKey'])||!npcSlots.has(r.slotId)||!event.factKeys.includes(r.factKey))bad('unregistered fact reference');
   else refs.set(r.alias,r);
  }
  if(Array.isArray(e.regionIds)&&e.regionIds.some(r=>!event.regionIds.includes(r)))bad('event region mismatch');
 }else if(own(t,'eventBinding'))bad('non-event binding');
 if(!ids(t.nodes.map(n=>n?.id)))return [...errors,'invalid or duplicate node id'];
 const nodes=new Map(t.nodes.map(n=>[n.id,n])),choiceIds=new Set();
 for(const n of t.nodes)if(n.type==='choice'&&Array.isArray(n.choices))for(const c of n.choices){if(!id(c?.id)||choiceIds.has(c.id))bad('invalid or duplicate choice id');else choiceIds.add(c.id);}
 const condRefs={aliases:refs,event:binding,roles,choices:choiceIds,topics:new Set([...topics,t.topicId]),quests,actions};
 if(!conditionsOK(e.conditions,condRefs))bad('invalid eligibility conditions');
 for(const n of t.nodes){
  switch(n.type){
  case 'speak':
   if(!shape(n,['id','type','speakerSlot','pages','next'])||!npcSlots.has(n.speakerSlot)||!Array.isArray(n.pages)||!n.pages.length||n.pages.length>16||!n.pages.every(s=>placeholders(s,refs,n.speakerSlot))||!nodes.has(n.next))bad('invalid speak '+n.id);
   break;
  case 'choice':
   if(!shape(n,['id','type','choices'])||!Array.isArray(n.choices)||!n.choices.length||n.choices.length>16){bad('invalid choices '+n.id);break;}
   for(const c of n.choices)if(!shape(c,['id','label','conditions','nextNode'])||!text(c.label)||/[{}]/.test(c.label)||!conditionsOK(c.conditions,condRefs)||!nodes.has(c.nextNode))bad('invalid choice '+n.id);
   if(!n.choices.some(c=>Array.isArray(c?.conditions)&&!c.conditions.length))bad('choice has no unconditional fallback '+n.id);
   break;
  case 'effect':
   if(!shape(n,['id','type','action','outcomes'])||!shape(n.action,['handlerId','argsRefs'])||!handlers.has(n.action.handlerId)||!obj(n.action.argsRefs)||Object.entries(n.action.argsRefs).some(([k,v])=>!id(k)||!shape(v,['kind','id'])||!(v.kind==='slot'&&slotIds.has(v.id)||v.kind==='fact'&&refs.has(v.id)))||!shape(n.outcomes,['ok','fail','stale'])||!['ok','fail','stale'].every(k=>nodes.has(n.outcomes[k])))bad('invalid effect '+n.id);
   break;
  case 'end':if(!shape(n,['id','type','mode'])||!['topicHub','close'].includes(n.mode))bad('invalid end '+n.id);break;
  default:bad('unknown node type '+n.id);
  }
 }
 if(!nodes.has(t.entryNode))bad('missing entry');
 if(own(t,'participationIds')&&(!t.ambientPath?.length||!ids(t.participationIds)))bad('invalid graph participation ids');
 if(own(t,'ambientPath')){
  if(npcs.length<2||!Array.isArray(t.ambientPath)||!t.ambientPath.length||t.ambientPath.length>32||t.ambientPath.some(x=>!shape(x,['slotId','text','duration'])||!npcSlots.has(x.slotId)||!placeholders(x.text,refs,x.slotId)||!Number.isFinite(x.duration)||x.duration<.5||x.duration>30))bad('invalid ambient path');
 }
 if(errors.length)return errors;
 const visited=new Set(),walk=k=>{if(visited.has(k))return;visited.add(k);for(const x of edges(nodes.get(k)))walk(x);};
 walk(t.entryNode);if(visited.size!==nodes.size)bad('unreachable node');
 for(const n of nodes.values())if(n.type==='effect'){
  if(n.id===t.entryNode||[...nodes.values()].some(p=>p.type!=='choice'&&edges(p).includes(n.id)))bad('effect requires explicit choice '+n.id);
 }
 // Automatic edges cannot cycle, even if disconnected from the initial node.
 const done=new Set(),stack=new Set();
 function auto(k){if(stack.has(k))return false;if(done.has(k))return true;const n=nodes.get(k);stack.add(k);if(n.type!=='choice'&&edges(n).some(x=>!auto(x)))return false;stack.delete(k);done.add(k);return true;}
 if([...nodes.keys()].some(k=>!auto(k)))bad('automatic cycle');
 // Every node must have a route to end even if all conditional choices disappear.
 const exit=new Set(t.nodes.filter(n=>n.type==='end').map(n=>n.id));
 let changed=true;while(changed){changed=false;for(const n of t.nodes){if(exit.has(n.id))continue;const next=n.type==='choice'?n.choices.filter(c=>!c.conditions.length).map(c=>c.nextNode):edges(n);if(next.length&&(n.type==='effect'?next.every(k=>exit.has(k)):next.some(k=>exit.has(k)))){exit.add(n.id);changed=true;}}}
 if(exit.size!==nodes.size)bad('missing unconditional exit');
 return errors;
}
// Three-valued conditions prevent absent context from becoming true under NOT.
function evaluate(c,x){
 const list=(v,k)=>Array.isArray(v)?v.includes(k):null;
 const boolean=v=>typeof v==='boolean'?v:null;
 switch(c.op){
 case 'all':case 'any':{const a=c.conditions.map(v=>evaluate(v,x));return c.op==='all'?(a.includes(false)?false:a.includes(null)?null:true):(a.includes(true)?true:a.includes(null)?null:false);}
 case 'not':{const v=evaluate(c.condition,x);return v===null?null:!v;}
 case 'met':return typeof x.met==='boolean'?x.met===c.value:null;
 case 'role':return typeof x.role==='string'?x.role===c.id:null;
 case 'tag':return list(x.tags,c.id);
 case 'activity':return typeof x.activity==='string'?x.activity===c.id:null;
 case 'affinityGte':return Number.isFinite(x.affinity)?x.affinity>=c.value:null;
 case 'questState':return own(x.questStates,c.id)?x.questStates[c.id]===c.state:null;
 case 'eventActive':return !!x.event&&x.event.state==='active';
 case 'knowsFact':return own(x.facts,c.alias);
 case 'choiceSeen':return list(x.choiceIds,c.id);
 case 'topicSeen':return list(x.topicIds,c.id);
 case 'actionAvailable':return list(x.actionIds,c.id);
 default:return null;
 }
}
export function topicConditionsPass(conditions,context){return conditions.every(c=>evaluate(c,context)===true);}
function eventContext(t,x,event){
 if(!event||event.state!=='active'||event.typeId!==t.eventBinding.typeId||!id(event.id)||!tick(event.revision)||!obj(event.facts)||event.regionId!==undefined&&event.regionId!==x.regionId)return null;
 const facts=Object.create(null);
 for(const r of t.eventBinding.factRefs){if(!own(event.facts,r.factKey)||!primitive(event.facts[r.factKey]))return null;facts[r.alias]=event.facts[r.factKey];}
 return {event,facts};
}
const match=(a,v)=>!a||a.includes(v);
const all=(a,v)=>!a||Array.isArray(v)&&a.every(k=>v.includes(k));
const specificity=t=>(t.source==='named'?1000:0)+(t.eligibility.npcIds?.length?100:0)+(t.eligibility.roles?.length?20:0)+(t.eligibility.tags?.length??0)*2+(t.eligibility.conditions.length?4:0)+(t.eligibility.regionIds?.length?1:0);
function stableIndex(s,n){let h=0;for(const c of s)h=(Math.imul(h,31)+c.charCodeAt(0))>>>0;return h%n;}
// Build once after registration; resolve only at interaction/explicit refresh, never each frame.
export function createTopicResolver(registry){
 const global=[],byRegion=new Map(),byRole=new Map(),byNpc=new Map();
 const put=(m,k,t)=>{if(!m.has(k))m.set(k,[]);m.get(k).push(t);};
 for(const t of registry.list('conversationTemplates').filter(isTopicGraph)){
  if(t.slots.filter(s=>s.kind==='npc').length!==1)continue; // group participation is T4
  const e=t.eligibility;
  if(e.npcIds)for(const k of e.npcIds)put(byNpc,k,t);
  else if(e.roles)for(const k of e.roles)put(byRole,k,t);
  else if(e.regionIds)for(const k of e.regionIds)put(byRegion,k,t);
  else global.push(t);
 }
 function resolve(x,{onlyTemplateId=null,ignoreCooldown=false}={}){
  const choices=new Map(),eligible=[...global,...(byNpc.get(x.npcId)??[]),...(byRole.get(x.role)??[]),...(byRegion.get(x.regionId)??[])];
  const services=Array.isArray(x.services)?x.services.slice():[]; // authoritative descriptors, not effects
  for(const t of eligible){
   if(onlyTemplateId&&t.id!==onlyTemplateId)continue;
   const e=t.eligibility,slot=t.slots.find(s=>s.kind==='npc');
   if(!match(e.npcIds,x.npcId)||!match(e.roles,x.role)||!match(e.regionIds,x.regionId)||!all(e.tags,x.tags)||!all(slot.tags,x.tags)||slot.role&&slot.role!==x.role)continue;
   if(!ignoreCooldown&&t.cooldown&&own(x.lastTopicTicks,t.id)&&(!tick(x.now)||!tick(x.lastTopicTicks[t.id])||x.now-x.lastTopicTicks[t.id]<t.cooldown))continue;
   const contexts=t.source==='event'?(Array.isArray(x.knownEvents)?x.knownEvents:[]).map(event=>eventContext(t,x,event)).filter(Boolean):[{event:null,facts:{}}];
   for(const context of contexts){
    if(t.source==='event'&&!registry.get('eventTypes',t.eventBinding.typeId)?.regionIds.includes(x.regionId))continue;
    if(!topicConditionsPass(e.conditions,{...x,...context,choiceIds:[...(x.choiceIds??[]),...(x.choiceHistory??[]).filter(c=>c.templateId===t.id).map(c=>c.choiceId)]}))continue;
    const key=JSON.stringify([t.source==='event'?'event':'personal',t.topicId,context.event?.id??null]);
    if(!choices.has(key))choices.set(key,[]);
    choices.get(key).push({template:t,topicId:t.topicId,source:t.source,eventRef:context.event?{id:context.event.id,revision:context.event.revision}:null,facts:copy(context.facts),slotBinding:Object.fromEntries(t.slots.map(s=>[s.id,s.kind==='player'?'player':x.npcId]))});
   }
  }
  const topics=[];
  for(const candidates of choices.values()){
   candidates.sort((a,b)=>specificity(b.template)-specificity(a.template)||b.template.priority-a.template.priority||cmp(a.template.id,b.template.id));
   const top=candidates[0],peers=candidates.filter(c=>specificity(c.template)===specificity(top.template)&&c.template.priority===top.template.priority);
   const fresh=peers.filter(c=>c.template.id!==x.lastTemplateId),pool=fresh.length?fresh:peers;
   const selected=pool[stableIndex(String(x.npcId)+':'+String(x.cursor??0),pool.length)];
   topics.push(selected);
  }
  topics.sort((a,b)=>(a.source==='event'?1:0)-(b.source==='event'?1:0)||cmp(a.topicId,b.topicId)||cmp(a.eventRef?.id??'',b.eventRef?.id??''));
  return {topics,services};
 }
 return {resolve};
}
// Convert already-selected legacy text into the same node contract without rewriting authored text.
export function legacyLineGraph(line){
 const pages=(Array.isArray(line)?line:[line]).filter(text);
 return {entryNode:'intro',nodes:[{id:'intro',type:'speak',speakerSlot:'npc',pages:pages.length?pages:['안녕하세요.'],next:'hub'},{id:'hub',type:'end',mode:'topicHub'}]};
}

// Ambient graphs reuse the legacy formation/hold pipeline; no second group manager.
export function ambientTemplate(t,registry){
 if(!isTopicGraph(t))return t;
 if(!t.ambientPath?.length)return null;
 return {id:t.id,regionIds:t.eligibility.regionIds??registry.get('eventTypes',t.eventBinding.typeId)?.regionIds??[],slots:t.slots.filter(s=>s.kind==='npc').map(s=>({...s,tags:s.tags??[]})),eventTypeId:t.eventBinding.typeId,factRefs:t.eventBinding.factRefs.map(r=>({...r,key:r.alias})),turns:t.ambientPath,participationIds:t.participationIds??[],graph:t};
}
// Each referenced fact must still belong to its bound speaker, not merely the anchor.
export function groupFacts(t,binding,eventId,revision,knownEvents){
 const facts=Object.create(null),events=new Map();
 for(const id of Object.values(binding)){
  if(id==='player')continue;
  const e=knownEvents(id).find(e=>e.id===eventId&&e.typeId===t.eventBinding.typeId&&e.revision===revision&&e.state==='active');
  if(e)events.set(id,e);
 }
 if(!events.size)return null;
 for(const r of t.eventBinding.factRefs){
  const e=events.get(binding[r.slotId]);
  if(!own(e?.facts,r.factKey)||!primitive(e.facts[r.factKey]))return null;
  facts[r.alias]=e.facts[r.factKey];
 }
 return copy(facts);
}
export function graphGroupTopic(registry,group,knownEvents,x){
 const m=group?.materialized,t=registry.get('conversationTemplates',m?.templateId);
 if(!t||!isTopicGraph(t)||!t.ambientPath||!m.eventId||group.anchorId!==x.npcId||group.regionId!==x.regionId)return null;
 const e=t.eligibility;
 if(!match(e.npcIds,x.npcId)||!match(e.roles,x.role)||!match(e.regionIds,x.regionId)||!all(e.tags,x.tags))return null;
 const facts=groupFacts(t,m.binding,m.eventId,m.revision,knownEvents);
 if(!facts||JSON.stringify(facts)!==JSON.stringify(m.facts))return null;
 const event={id:m.eventId,revision:m.revision,state:'active',typeId:t.eventBinding.typeId};
 if(!topicConditionsPass(e.conditions,{...x,event,facts,choiceIds:[...(x.choiceIds??[]),...(x.choiceHistory??[]).filter(c=>c.templateId===t.id).map(c=>c.choiceId)]}))return null;
 return {template:t,topicId:t.topicId,source:t.source,eventRef:{id:m.eventId,revision:m.revision},groupId:group.id,facts,slotBinding:{...m.binding,[t.slots.find(s=>s.kind==='player').id]:'player'}};
}
