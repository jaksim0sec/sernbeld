import {livingWorldContent} from '../src/core/living-world-content.js';
import {createLivingWorldRuntime} from '../src/core/living-world-runtime.js';
import {createItemRuntime,extendItemDefinitions} from '../src/core/shared-items.js';
let checks=0;
const assert=(ok,msg)=>{if(!ok)throw Error(msg);checks++};
const copy=v=>JSON.parse(JSON.stringify(v));
const defs=extendItemDefinitions({});
const residents=[
 ...Array.from({length:3},(_,i)=>({id:'vendor'+i,role:'vendor',position:{x:i,y:0,z:0}})),
 ...Array.from({length:4},(_,i)=>({id:'docker'+i,position:{x:20+i,y:0,z:0}})),
 ...Object.entries({bran:null,sera:'guild',goram:'smith',miel:'inn',tino:'rival',iva:null}).map(([id,role],i)=>({id,role,position:{x:100+i*2,y:0,z:0}}))
];
function start(data={v:1,money:0},content=livingWorldContent){
 const save={data:copy(data),write:()=>true};
 const rt=createLivingWorldRuntime({save,getDefinitions:()=>defs,regionId:'sernbeld',residents,clock:{day:1,hour:8},content,conversationPair:()=>true,participationReach:()=>true});
 assert(rt.ok,'production registration: '+JSON.stringify(rt));
 const items=createItemRuntime(save,()=>defs);
 for(let i=0;i<20;i++){const result=rt.update();assert(result.ok,'production tick');if(!result.pending)return {save,rt,items}}
 throw Error('pending production tick');
}
const {save,rt,items}=start();
assert(residents.every(n=>!rt.managed(n.id)),'original resident schedules retained');
for(const [id,item,n,quality,reward] of [['vendor0','roadside_mugwort',2,40,6],['vendor1','round_clover',3,30,5],['vendor2','seashell',2,50,6]]){
 const initial=items.balance(),merchant='npc:'+id,prior=items.balance(merchant);
 const accept=rt.requestChoices(id).find(c=>c.id==='living.request.accept');
 assert(accept?.definitionId===item&&accept.quantity===n&&accept.minimumQuality===quality&&accept.reward===reward,'correct live request '+id);
 assert(rt.executeRequest(id,accept).ok,'accept '+id);
 items.createFor(items.player,item,n,quality-1);
 assert(!rt.requestChoices(id).some(c=>c.id==='living.request.submit'),'reject insufficient quality');
 items.createFor(items.player,item,n,quality);
 const submit=rt.requestChoices(id).find(c=>c.id==='living.request.submit');
 assert(!!submit,'qualified lot');
 const before=copy(save.data);save.write=()=>false;
 assert(!rt.executeRequest(id,submit).ok&&JSON.stringify(save.data)===JSON.stringify(before),'atomic rollback');
 save.write=()=>true;
 assert(rt.executeRequest(id,submit).ok,'submit '+id);
 assert(items.balance()===initial+reward&&items.balance(merchant)===prior-reward,'real wallet transfer');
 assert(items.count(item,merchant)===n&&items.count(item)===n,'real ownership transfer');
 assert(save.data.npcStates[id].relationships.player.affinity===2,'affinity');
 assert(rt.executeRequest(id,submit).replayed&&items.balance()===initial+reward,'no duplicate reward');
 assert(!rt.requestChoices(id).length,'one-shot request closed');
}
const restored=start(save.data);
assert(restored.items.balance()===17&&restored.rt.requestChoices('vendor0').length===0,'reload preserves rewards and closed request');
const stationary=residents.map(n=>({id:n.id,...n.position,stationary:true}));
for(const [prefix,max,x,topic] of [['vendor',3,0,'kael_market'],['docker',4,20,'kael_dock']]){
 for(let size=2;size<=max;size++){
  const w=start(save.data);
  const group=stationary.filter(n=>n.id.startsWith(prefix)&&Number(n.id.slice(prefix.length))<size);
  const observe=(px,now)=>w.rt.updateConversations({active:true,player:{x:px,y:0,z:1},now,npcs:group});
  assert(observe(x-12,0).some(l=>l.text==='···'),'mid-distance placeholder '+topic+size);
  assert(observe(x,1).some(l=>l.templateId===topic+'_chat_'+size&&l.text!=='···'),'actual group size '+topic+size);
  assert(w.rt.beginTalk(prefix+'0'),'join conversation');
  const reply=w.rt.participationChoices(prefix+'0').find(c=>c.id==='living.group.reply');
  assert(reply&&w.rt.executeParticipation(prefix+'0',reply).ok,'participation reply');
  w.rt.update(null);w.rt.clearGroups();
 }
}
const old=start({v:1,money:8,npcStates:{vendor0:{lineI:4}}},{});
const migrated=start(old.save.data);
assert(migrated.items.balance()===8&&migrated.save.data.npcStates.vendor0.lineI===4,'old save preserves inventory and dialogue');
assert(migrated.rt.requestChoices('vendor0').length===1,'old save receives new content');
console.log('PASS Kael production content: '+checks+' checks (actual requests, quality, ledger, rollback, migration, reload, 2–4 person conversation and participation)');
