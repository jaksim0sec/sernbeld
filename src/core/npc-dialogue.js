import {topicConditionsPass} from './npc-topic.js';
// Persistent NPC records are owned by Save, never by the dialogue UI or a rendered actor.
const object = value => value && typeof value === "object" && !Array.isArray(value);
const copy = value => JSON.parse(JSON.stringify(value));
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const validId = id => typeof id === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id) && !["constructor","prototype"].includes(id);
export function createNpcStateStore(save) {
  function record(id) {
    const root=save.data.npcStates;
    return validId(id)&&object(root)&&Object.hasOwn(root,id)&&object(root[id]) ? root[id] : null;
  }
  function requireRecord(id) {
    const value=record(id);
    if(!value)throw new Error("Unregistered NPC: "+id);
    return value;
  }
  return {
    ensure(id,region,legacyLineI=0) {
      if(!validId(id)||typeof region!=="string"||!region)throw new TypeError("Invalid NPC identity or region");
      if(!object(save.data.npcStates))save.data.npcStates={};
      const prior=record(id)||{};
      const relations=object(prior.relationships)?prior.relationships:{};
      const player=object(relations.player)?relations.player:{};
      const next={...prior,region,lineI:Number.isSafeInteger(prior.lineI)&&prior.lineI>=0?prior.lineI:count(legacyLineI),
        resources:object(prior.resources)?prior.resources:{},
        activity:typeof prior.activity==="string"?prior.activity:"idle",
        relationships:{...relations,player:{...player,talks:count(player.talks)}},
        memory:object(prior.memory)?prior.memory:{}};
      Object.defineProperty(save.data.npcStates,id,{value:next,writable:true,enumerable:true,configurable:true});
      return copy(next);
    },
    get(id) {const value=record(id);return value?copy(value):null;},
    observe(id,{region,activity,position}) {
      const value=requireRecord(id);
      if(typeof region==="string"&&region)value.region=region;
      if(typeof activity==="string"&&activity)value.activity=activity;
      if(position&&[position.x,position.y,position.z].every(Number.isFinite))value.position={x:position.x,y:position.y,z:position.z};
    },
    recordTalk(id,{lineI,day,hour}) {
      const value=requireRecord(id);
      value.lineI=count(lineI);
      value.relationships.player.talks=Math.min(Number.MAX_SAFE_INTEGER,value.relationships.player.talks+1);
      value.memory.lastTalk={day,hour};
    },
    recordTopic(id,{templateId,topicId,choiceId=null,completed=false,tick=0,rememberChoice=false,rememberCompletion=false,cooldown=0}) {
      const value=requireRecord(id),valid=v=>typeof v==='string'&&/^[a-z][a-z0-9_]*(?:[.:/-][a-z0-9_]+)*$/.test(v)&&v.length<=120;
      if(!valid(templateId)||!valid(topicId)||choiceId!==null&&!valid(choiceId)||!Number.isSafeInteger(tick)||tick<0)return false;
      if(!rememberChoice&&!rememberCompletion&&!cooldown)return true;
      const prior=value.memory.dialogue,old=object(prior)?prior:{};
      const choices=Array.isArray(old.choices)?old.choices.filter(x=>object(x)&&valid(x.templateId)&&valid(x.choiceId)):[];
      const topics=Array.isArray(old.topics)?old.topics.filter(valid):[];
      const times=object(old.lastTopicTicks)?Object.entries(old.lastTopicTicks).filter(([k,v])=>valid(k)&&Number.isSafeInteger(v)&&v>=0):[];
      if(rememberChoice&&choiceId)choices.push({templateId,choiceId,tick});
      if(completed&&rememberCompletion){const i=topics.indexOf(topicId);if(i>=0)topics.splice(i,1);topics.push(topicId);}
      if(completed&&cooldown){const i=times.findIndex(([k])=>k===templateId);if(i>=0)times.splice(i,1);times.push([templateId,tick]);}
      value.memory.dialogue={choices:choices.slice(-16),topics:topics.slice(-16),lastTopicTicks:Object.fromEntries(times.slice(-16)),lastTemplateId:completed?templateId:old.lastTemplateId??null};
      try{if(save.write()===false)throw Error('save failed');return true;}
      catch{if(prior===undefined)delete value.memory.dialogue;else value.memory.dialogue=prior;return false;}
    },
    recordAction(id,{id:actionId,ok,day,hour}) {
      const value=requireRecord(id);
      value.memory.lastAction={id:actionId,ok:!!ok,day,hour};
    }
  };
}
// Both modes share definitions; only participating dialogue consumes the saved cursor.
export function npcLinePool(def,hour) {
  const lines=def.lines??{};
  const pool=((hour>=20||hour<6)?lines.night:lines.day)??lines.day;
  return Array.isArray(pool)?pool.filter(line=>typeof line==="string"&&line.length):[];
}
export function selectNpcLine(def,{met,cursor=0,hour=12,custom}={}) {
  cursor=count(cursor);
  const first=def.lines?.first;
  if(!met&&(typeof first==="string"&&first||Array.isArray(first)&&first.some(line=>typeof line==="string"&&line.length)))return {text:first,first:true,nextCursor:cursor};
  if(typeof custom==="string"&&custom)return {text:custom,first:false,nextCursor:cursor};
  const pool=npcLinePool(def,hour);
  return pool.length?{text:pool[cursor%pool.length],first:false,nextCursor:cursor===Number.MAX_SAFE_INTEGER?0:cursor+1}:null;
}
// Recompute available descriptors at execution; never execute an action supplied by a view.
export function runNpcAction(choice,{reachable,choices,execute}) {
  if(!reachable())return {ok:false,reason:"unreachable"};
  const current=choice&&choices().find(action=>action.id===choice.id&&action.itemId===choice.itemId&&action.revision===choice.revision&&action.quote===choice.quote&&JSON.stringify(action.allocations)===JSON.stringify(choice.allocations));
  if(!current)return {ok:false,reason:"unavailable"};
  return execute(current)===false?{ok:false,reason:"rejected"}:{ok:true,reason:"executed"};
}

// Session progression is an ephemeral domain contract, independent of DOM and timers.
export function createDialogueSession(def,line,options=[]) {
  const pages=(Array.isArray(line)?line:[line]).filter(value=>typeof value==="string"&&value.length);
  if(!pages.length)pages.push("");
  const responses=options.map(o=>({id:o.id??null,label:o.label,kind:o.kind??"reply",itemId:o.itemId??null}));
  let page=0,status="active";
  return {
    speakerId:def.id??null,
    participantId:"player",
    get status(){return status;},
    get text(){return pages[page];},
    get pageIndex(){return page;},
    get pageCount(){return pages.length;},
    get canAdvance(){return status==="active"&&page+1<pages.length;},
    get choices(){return status==="active"&&page===pages.length-1?responses.map(o=>({...o})):[];},
    advance(){if(!this.canAdvance)return false;page++;return true;},
    select(index){if(status!=="active"||page!==pages.length-1||!Number.isInteger(index)||!responses[index])return false;status="selected";return true;},
    close(){if(status==="active")status="closed";}
  };
}

// Graph and legacy greeting pages use one ephemeral anchor; domain services own all effects.
export function createTopicSession(def,line,{readContext=()=>({}),resolve=()=>({topics:[],services:[]}),reachable=()=>true,executeService=()=>({ok:false}),executeEffect=()=>({ok:false,reason:'stale'}),remember=()=>true}={}){
 const pagesOf=v=>{const a=(Array.isArray(v)?v:[v]).filter(s=>typeof s==='string'&&s.length);return a.length?a:['안녕하세요.'];};
 const serviceKey=s=>JSON.stringify([s.id,s.itemId??null,s.revision??null,s.quote??null,s.allocations??null]);
 const topicKey=t=>JSON.stringify([t.template.id,t.eventRef?.id??null,t.eventRef?.revision??null]);
 let status='active',revision=0,pages=pagesOf(line),page=0,phase='hub',selected=null,node=null,nextNode=null;
 let choiceHistory=[],topicIds=[],lastTemplateId=null;
 const context=()=>{const x=readContext()??{};return {...x,choiceHistory:[...(x.choiceHistory??[]),...choiceHistory],topicIds:[...(x.topicIds??[]),...topicIds],lastTemplateId:lastTemplateId??x.lastTemplateId};};
 const findNode=k=>selected?.template.nodes.find(n=>n.id===k);
 const safeReach=()=>{try{return reachable()===true;}catch{return false;}};
 function close(){if(status==='active'){status='closed';revision++;selected=null;}}
 function show(v){pages=pagesOf(v);page=0;}
 function hub(v){selected=null;node=null;nextNode=null;phase='hub';if(v!==undefined)show(v);}
 function live(){
  if(!safeReach()){close();return false;}
  if(!selected)return true;
  const r=resolve(context(),{onlyTemplateId:selected.template.id,ignoreCooldown:true});
  const current=r.topics.find(t=>topicKey(t)===topicKey(selected));
  if(!current||JSON.stringify(current.facts)!==JSON.stringify(selected.facts)){hub('지금은 그 이야기를 계속하기 어려워요.');return false;}
  return true;
 }
 function condContext(){
  const x=context();
  return {...x,choiceIds:[...(x.choiceIds??[]),...x.choiceHistory.filter(c=>c.templateId===selected?.template.id).map(c=>c.choiceId)],event:selected?.eventRef?{...selected.eventRef,state:'active'}:null,facts:selected?.facts??{}};
 }
 function record(choiceId,completed){
  if(!selected)return;
  const t=selected.template;
  if(choiceId){choiceHistory.push({templateId:t.id,choiceId});choiceHistory=choiceHistory.slice(-16);}
  if(completed){topicIds.push(t.topicId);topicIds=topicIds.slice(-16);lastTemplateId=t.id;}
  try{remember({templateId:t.id,topicId:t.topicId,choiceId,completed,tick:context().now??0,rememberChoice:t.memoryPolicy==='choices'&&!!choiceId,rememberCompletion:completed&&t.memoryPolicy==='completion',cooldown:completed?t.cooldown??0:0});}catch{}
 }
 function transition(k,explicit=false){
  for(let i=0;i<32;i++){
   const n=findNode(k);
   if(!n){hub('대화를 계속할 수 없어요.');return;}
   node=n;
   if(n.type==='speak'){
    show(n.pages.map(s=>s.replace(/\{([a-z][a-z0-9_.:-]*)\}/g,(_,key)=>String(selected.facts[key]??''))));
    phase='speak';nextNode=n.next;prepareLast();return;
   }
   if(n.type==='choice'){phase='choice';nextNode=null;return;}
   if(n.type==='end'){record(null,true);if(n.mode==='close'){close();return;}hub();return;}
   if(n.type==='effect'&&explicit){
    const args=Object.fromEntries(Object.entries(n.action.argsRefs).map(([key,r])=>[key,r.kind==='slot'?selected.slotBinding[r.id]:selected.facts[r.id]]));
    let outcome='stale';
    try{const r=executeEffect(n.action.handlerId,args);outcome=r?.ok===true?'ok':['stale','unavailable','unreachable'].includes(r?.reason)?'stale':'fail';}catch{outcome='fail';}
    k=n.outcomes[outcome];explicit=false;continue;
   }
   hub('대화를 계속할 수 없어요.');return;
  }
  hub('대화를 계속할 수 없어요.');
 }
 function prepareLast(){
  if(phase!=='speak'||page!==pages.length-1)return;
  const n=findNode(nextNode);
  if(n?.type==='choice'){node=n;phase='choice';nextNode=null;}
  else if(n?.type==='end'&&n.mode==='topicHub'){record(null,true);hub();}
 }
 function descriptors(){
  if(status!=='active'||page!==pages.length-1)return [];
  if(phase==='choice')return node.choices.filter(c=>topicConditionsPass(c.conditions,condContext())).map(c=>({id:c.id,label:c.label,kind:'reply',token:JSON.stringify(['choice',node.id,c.id]),target:c}));
  if(phase!=='hub')return [];
  const r=resolve(context());
  return [...r.topics.map(t=>({id:t.template.id,label:t.template.label??t.topicId,kind:'reply',token:'topic:'+topicKey(t),topic:t})),...r.services.map(s=>({...s,token:'service:'+serviceKey(s),service:s}))];
 }
 return {
  graph:true,speakerId:def.id,participantId:'player',
  get status(){return status;},get revision(){return revision;},get text(){return pages[page];},
  get pageIndex(){return page;},get pageCount(){return pages.length;},
  get canAdvance(){return status==='active'&&(page+1<pages.length||phase==='speak');},
  get choices(){return descriptors().map(({target,topic,service,...v})=>v);},
  advance(expected=revision){
   if(status!=='active'||expected!==revision||!this.canAdvance)return false;
   revision++;if(!live())return true;
   if(page+1<pages.length){page++;prepareLast();return true;}
   transition(nextNode);return true;
  },
  select(index,expected=revision,token){
   if(status!=='active'||expected!==revision||!Number.isInteger(index))return false;
   const item=descriptors()[index];
   if(!item||token!==undefined&&token!==item.token){revision++;live();return true;}
   revision++;if(!live())return true;
   if(item.topic){selected=item.topic;transition(selected.template.entryNode);return true;}
   if(item.target){record(item.target.id,false);transition(item.target.nextNode,true);return true;}
   if(item.service){
    let r;try{r=executeService(item.service);}catch{r={ok:false};}
    if(r?.close||r?.reason==='unreachable'){close();return true;}
    hub(r?.text??(r?.ok?'완료했습니다.':'지금은 그 행동을 할 수 없어요.'));return true;
   }
   return false;
  },
  close
 };
}
