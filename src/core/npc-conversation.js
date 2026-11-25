import {isTopicGraph,ambientTemplate,groupFacts,topicConditionsPass} from './npc-topic.js';
// Presentation-only NPC groups. Nothing in this module changes economy or knowledge.
const copy=v=>JSON.parse(JSON.stringify(v));
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const point=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const all=(tags,required)=>required.every(t=>tags.includes(t));
function matchSlots(slots,members){
 const used=new Set(),binding={},matches=[];
 function match(i){
  if(i===slots.length){matches.push({...binding});return}
  const s=slots[i];
  for(const n of members){
   if(used.has(n.id)||!all(n.tags,s.tags)||s.role&&s.role!==n.role)continue;
   used.add(n.id);binding[s.id]=n.id;
   match(i+1);
   used.delete(n.id);delete binding[s.id];
  }
 }
 if(slots.length===members.length)match(0);
 return matches;
}
export function createNpcConversations({registry,knownEvents=()=>[],canPair=()=>false,hold=()=>true,release=()=>{},config={}}){
 const c={midIn:18,midOut:22,nearIn:7,nearOut:9,pairIn:3,pairOut:4,scanEvery:.5,duration:30,cooldown:20,maxGroups:3,maxCandidates:64,maxPairs:256,cell:6,...config};
 if(!Object.values(c).every(v=>Number.isFinite(v)&&v>0)||!(c.nearIn<c.nearOut&&c.nearOut<c.midIn&&c.midIn<c.midOut&&c.pairIn<c.pairOut)||!['maxGroups','maxCandidates','maxPairs'].every(k=>Number.isSafeInteger(c[k])))throw Error('invalid conversation config');
 const groups=new Map(),owner=new Map(),cooldown=new Map(),ordinaryCursor=new Map();
 let next=1,lastTime=-Infinity,nextScan=0,region=null,stats={scans:0,pairs:0,materializations:0};
 const eligible=n=>n&&typeof n.id==='string'&&point(n)&&n.stationary===true&&n.available!==false&&!n.hidden&&Array.isArray(n.tags)&&n.tags.length>0;
 const templates=()=>registry.list('conversationTemplates').map(t=>ambientTemplate(t,registry)).filter(Boolean).sort((a,b)=>Number(!!b.graph)-Number(!!a.graph)||Number(!!b.eventTypeId)-Number(!!a.eventTypeId)||(a.graph||b.graph||a.eventTypeId||b.eventTypeId?cmp(a.id,b.id):0));
 const closest=(g,byId,player)=>Math.min(...g.npcIds.map(id=>dist(byId.get(id),player)));
 function end(g,now){
  groups.delete(g.id);
  for(const id of g.npcIds){owner.delete(id);cooldown.set(id,now+c.cooldown);try{release(id,g.id)}catch{}}
 }
 function clear(now=lastTime){for(const g of [...groups.values()])end(g,now);region=null;nextScan=0}
 function pair(a,b,r){
  if(stats.pairs>=c.maxPairs)return false;
  stats.pairs++;
  if(dist(a,b)>r||Math.abs(a.y-b.y)>1.8)return false;
  try{return canPair(a,b)===true}catch{return false}
 }
 function materialize(g,byId,now){
  stats.materializations++;
  const members=g.npcIds.map(id=>byId.get(id));
  const ordinary=[];
  templateLoop: for(const t of templates()){
   if(!t.regionIds.includes(g.regionId))continue;
   const bindings=matchSlots(t.slots,members);if(!bindings.length)continue;
   const refs=t.factRefs??[],events=new Map();
   if(t.eventTypeId){
    for(const n of members)events.set(n.id,knownEvents(n.id).filter(e=>e.typeId===t.eventTypeId&&e.state==='active'));
   }
   const candidates=t.eventTypeId?[...new Set(members.flatMap(n=>events.get(n.id).map(e=>e.id)))].sort(cmp):[null];
   for(const binding of bindings)for(const eventId of candidates){
    const selected=new Map();
    if(eventId!==null){
     for(const n of members){const e=events.get(n.id).find(e=>e.id===eventId);if(e)selected.set(n.id,e)}
     if(!selected.size||new Set([...selected.values()].map(e=>e.revision)).size!==1)continue;
    }
    let facts={};let valid=true;
    for(const r of refs){const e=selected.get(binding[r.slotId]);if(!e||!Object.hasOwn(e.facts,r.factKey)){valid=false;break}facts[r.key]=String(e.facts[r.factKey])}
    if(!valid)continue;
    if(t.graph){
     const revision=eventId===null?null:[...selected.values()][0].revision;
     facts=groupFacts(t.graph,binding,eventId,revision,knownEvents);
     if(!facts)continue;
     const e=t.graph.eligibility;
     // Ambient eligibility uses only available member context. Unknown conditions fail closed.
     if(!members.some(n=>(!e.npcIds||e.npcIds.includes(n.id))&&(!e.roles||e.roles.includes(n.role))&&(!e.tags||all(n.tags,e.tags))&&topicConditionsPass(e.conditions,{...n,role:n.role,event:{id:eventId,revision,state:'active'},facts})))continue;
    }
    if(!t.graph&&!t.eventTypeId){ordinary.push({t,binding});continue templateLoop;}
    g.materialized={templateId:t.id,binding,eventId,revision:eventId===null?null:[...selected.values()][0].revision,turns:t.turns.map(l=>({npcId:binding[l.slotId],duration:l.duration,text:l.text.replace(/\{([a-z][a-z0-9_.:-]*)\}/g,(_,k)=>facts[k])})),participationIds:t.participationIds??[],...(t.graph?{facts,graph:true}:{})};
    return;
   }
  }
  if(!ordinary.length){g.materialized=null;return;}
  // Rotate eligible ordinary templates once per materialized group, never per frame or binding.
  // Keep registration order for the first selection, event precedence and existing LOD/hold.
  const key=JSON.stringify([g.regionId,ordinary.map(({t})=>t.id)]);
  const index=(ordinaryCursor.get(key)??0)%ordinary.length;
  ordinaryCursor.delete(key);ordinaryCursor.set(key,(index+1)%ordinary.length);
  if(ordinaryCursor.size>128)ordinaryCursor.delete(ordinaryCursor.keys().next().value);
  const {t,binding}=ordinary[index];
  g.materialized={templateId:t.id,binding,eventId:null,revision:null,turns:t.turns.map(l=>({npcId:binding[l.slotId],duration:l.duration,text:l.text})),participationIds:t.participationIds??[]};
 }
 function stillValid(g){
  const m=g.materialized;if(!m?.eventId)return true;
  const t=registry.get('conversationTemplates',m.templateId);
  if(isTopicGraph(t)){const facts=groupFacts(t,m.binding,m.eventId,m.revision,knownEvents);return !!facts&&JSON.stringify(facts)===JSON.stringify(m.facts);}
  const required=new Set((t?.factRefs??[]).map(r=>m.binding[r.slotId]));
  if(!required.size)return g.npcIds.some(id=>knownEvents(id).some(e=>e.id===m.eventId&&e.revision===m.revision&&e.state==='active'));
  return [...required].every(id=>knownEvents(id).some(e=>e.id===m.eventId&&e.revision===m.revision&&e.state==='active'));
 }
 function scan(near,byId,player,now){
  stats.scans++;
  const sorted=near.sort((a,b)=>dist(a,player)-dist(b,player)||cmp(a.id,b.id)).slice(0,c.maxCandidates);
  const cells=new Map(),cell=n=>[Math.floor(n.x/c.cell),Math.floor(n.z/c.cell)];
  for(const n of sorted){const k=cell(n).join(',');if(!cells.has(k))cells.set(k,[]);cells.get(k).push(n)}
  for(const a of sorted){
   if(groups.size>=c.maxGroups||stats.pairs>=c.maxPairs)break;
   if(owner.has(a.id)||(cooldown.get(a.id)??0)>now)continue;
   const [x,z]=cell(a),neighbours=[],radius=Math.ceil(c.pairIn/c.cell);
   for(let dx=-radius;dx<=radius;dx++)for(let dz=-radius;dz<=radius;dz++)neighbours.push(...(cells.get([x+dx,z+dz].join(','))??[]));
   neighbours.sort((a,b)=>cmp(a.id,b.id));
   const members=[a];let common=[...a.tags];
   for(const b of neighbours){
    if(members.length===4||stats.pairs>=c.maxPairs)break;
    if(b.id===a.id||owner.has(b.id)||(cooldown.get(b.id)??0)>now)continue;
    const overlap=common.filter(t=>b.tags.includes(t));
    if(!overlap.length||!members.every(n=>pair(n,b,c.pairIn)))continue;
    members.push(b);common=overlap;
   }
   if(members.length<2)continue;
   const id='conversation:'+next++,npcIds=members.map(n=>n.id).sort(cmp),acquired=[];
   for(const n of npcIds){let ok=false;try{ok=hold(n,id)===true}catch{}if(!ok)break;acquired.push(n)}
   if(acquired.length!==npcIds.length){for(const n of acquired)try{release(n,id)}catch{}continue}
   const g={id,regionId:region,npcIds,formedAt:now,endAt:now+c.duration,lod:2,attempted:false,materialized:null};
   groups.set(id,g);for(const n of npcIds)owner.set(n,id);
  }
 }
 function update({active,regionId,player,npcs=[],now,suppressed=false}){
  if(!Number.isFinite(now)||now<lastTime)throw Error('nonmonotonic conversation clock');
  lastTime=now;stats.pairs=0;
  if(!active||!point(player)||suppressed){clear(now);return []}
  if(region!==regionId){clear(now);region=regionId}
  const byId=new Map(npcs.map(n=>[n.id,n]));
  for(const [id,until] of cooldown)if(until<=now)cooldown.delete(id);
  // No template evaluation or candidate pair scans outside the local observation radius.
  for(const g of [...groups.values()]){
   if(now>=g.endAt||g.npcIds.some(id=>!eligible(byId.get(id)))||closest(g,byId,player)>c.midOut){end(g,now);continue}
   if(now>=nextScan){
    const m=g.npcIds.map(id=>byId.get(id));
    if(m.some((a,i)=>m.slice(i+1).some(b=>!pair(a,b,c.pairOut)))){end(g,now);continue}
   }
  }
  if(now>=nextScan){
   nextScan=now+c.scanEvery;
   const near=npcs.filter(n=>eligible(n)&&!owner.has(n.id)&&dist(n,player)<=c.midIn);
   if(near.length>=2&&templates().length)scan(near,byId,player,now);
  }
  const out=[];
  for(const g of [...groups.values()]){
   const d=closest(g,byId,player);
   g.lod=d<=(g.lod===3?c.nearOut:c.nearIn)?3:2;
   if(g.lod===3&&!g.attempted){g.attempted=true;materialize(g,byId,now)}
   if(g.lod===3&&!stillValid(g)){end(g,now);continue}
   let speakerId=g.npcIds[0],text='···',cursor=null;
   if(g.lod===3&&g.materialized){
    let elapsed=now-g.formedAt;
    cursor=g.materialized.turns.findIndex(t=>{if(elapsed<t.duration)return true;elapsed-=t.duration;return false});
    if(cursor<0){end(g,now);continue}
    const turn=g.materialized.turns[cursor];speakerId=turn.npcId;text=turn.text;
   }
   out.push({groupId:g.id,npcIds:[...g.npcIds],speakerId,text,lod:g.lod,cursor,templateId:g.materialized?.templateId??null});
  }
  return out;
 }
 function leaveNpc(id){const g=groups.get(owner.get(id));if(g)end(g,lastTime)}
 function participationFor(id){const g=groups.get(owner.get(id));return g&&g.lod===3&&(g.materialized?.graph||g.materialized?.participationIds.length)&&lastTime<g.endAt&&stillValid(g)?(()=>{let offset=lastTime-g.formedAt;const cursor=g.materialized.turns.findIndex(t=>{if(offset<t.duration)return true;offset-=t.duration;return false});if(cursor<0)return null;return copy({...g,anchorId:id,cursor,offset,currentTurn:g.materialized.turns[cursor]})})():null}
 return {update,clear,leaveNpc,participationFor,groupFor:id=>owner.get(id)??null,snapshot:()=>({groups:copy([...groups.values()]),stats:{...stats}})};
}

// Ephemeral group ownership uses the authoritative action scheduler for managed residents.
export function createConversationBridge({registry,scheduler,readState,managed,knownEvents,canPair,settled,playerHeld=()=>false}){
 const locks=new Map(),enabled=registry.list('conversationTemplates').some(t=>!!ambientTemplate(t,registry));
 let joined=null;
 const action=id=>readState().npcStates?.[id]?.currentAction;
 const isTraveling=id=>readState().livingWorld?.scheduler?.some(j=>j.npcId===id&&j.status==='running'&&j.plan?.route);
 function available(id){
  if(playerHeld(id)||joined?.group.npcIds.includes(id)||!settled())return false;
  if(!managed(id))return true;
  const a=action(id),l=locks.get(id);
  return !!a&&a.interruptPolicy==='pauseable'&&!isTraveling(id)&&(!a.paused||l?.job===a.id&&!l.released);
 }
 function hold(id,groupId){
  if(!available(id))return false;
  if(!managed(id))return true;
  const a=action(id);
  if(a.paused)return false;
  const r=scheduler.pause(id,a.id);if(!r.ok)return false;
  locks.set(id,{groupId,job:a.id,released:false});return true;
 }
 function release(id,groupId){
  const l=locks.get(id);if(!l||l.groupId!==groupId)return;
  const r=scheduler.resume(id,l.job);
  if(r.ok||r.reason==='stale')locks.delete(id);else l.released=true;
 }
 const core=createNpcConversations({registry,knownEvents,canPair,hold,release});
 function retry(){for(const [id,l] of locks)if(l.released)release(id,l.groupId)}
 function claim(id){
  const l=locks.get(id);
  if(l&&!l.released&&action(id)?.id===l.job&&action(id)?.paused===true){
   locks.delete(id);core.leaveNpc(id);return l.job;
  }
  core.leaveNpc(id);return null;
 }
 function join(id){
  if(joined||!settled())return null;
  const group=core.participationFor(id);if(!group)return null;
  const acquired=new Map();
  for(const npcId of group.npcIds)if(managed(npcId)){
   const l=locks.get(npcId),a=action(npcId);
   if(!l||l.released||l.groupId!==group.id||a?.id!==l.job||a.paused!==true)return null;
   acquired.set(npcId,l);
  }
  for(const npcId of acquired.keys())locks.delete(npcId);
  joined={group,locks:acquired};core.leaveNpc(id);return copy(group);
 }
 function leaveJoined(){
  if(!joined)return;
  const old=joined;joined=null;
  for(const [id,l] of old.locks){locks.set(id,l);release(id,l.groupId)}
 }
 function joinedFor(id){
  if(!joined||joined.group.anchorId!==id||!settled())return null;
  for(const [npcId,l] of joined.locks)if(action(npcId)?.id!==l.job||action(npcId)?.paused!==true)return null;
  return copy(joined.group);
 }
 function clear(now){leaveJoined();core.clear(now)}
 return {
  enabled,groupFor:id=>joined?.group.npcIds.includes(id)?joined.group.id:core.groupFor(id),leaveNpc:id=>{if(joined?.group.npcIds.includes(id))leaveJoined();else core.leaveNpc(id)},clear,claim,retry,join,leaveJoined,joinedFor,participationFor:core.participationFor,
  joinedAnchor:()=>joined?.group.anchorId??null,
  groupHeld:id=>{const l=joined?.locks.get(id)??locks.get(id);return l&&!l.released?l.job:null},
  update(args){
   if(!enabled)return [];
   if(!args.active)leaveJoined();
   if(!args.active||args.suppressed||!settled())return core.update({...args,npcs:[],suppressed:true});
   return core.update({...args,npcs:args.npcs.map(n=>({...n,tags:registry.get('profiles',n.id)?.tags??[],role:n.role??registry.get('profiles',n.id)?.roleId??null,available:n.available!==false&&available(n.id)}))});
  },
  snapshot:core.snapshot
 };
}
