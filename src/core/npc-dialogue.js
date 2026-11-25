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
  if(!met&&typeof def.lines?.first==="string"&&def.lines.first)return {text:def.lines.first,first:true,nextCursor:cursor};
  if(typeof custom==="string"&&custom)return {text:custom,first:false,nextCursor:cursor};
  const pool=npcLinePool(def,hour);
  return pool.length?{text:pool[cursor%pool.length],first:false,nextCursor:cursor===Number.MAX_SAFE_INTEGER?0:cursor+1}:null;
}
// Recompute available descriptors at execution; never execute an action supplied by a view.
export function runNpcAction(choice,{reachable,choices,execute}) {
  if(!reachable())return {ok:false,reason:"unreachable"};
  const current=choice&&choices().find(action=>action.id===choice.id&&action.itemId===choice.itemId);
  if(!current)return {ok:false,reason:"unavailable"};
  return execute(current)===false?{ok:false,reason:"rejected"}:{ok:true,reason:"executed"};
}
