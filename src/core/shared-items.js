// Shared item runtime: one canonical owner/record/holding/wallet store in Save.
const clone=x=>JSON.parse(JSON.stringify(x));
const safe=(n,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const grades=['low','normal','high','rare','heroic','legendary'];
const validId=x=>typeof x==='string'&&/^[a-z][a-z0-9_]*(?:[.:/-][a-z0-9_]+)*$/.test(x);
const check=(ok,msg)=>{if(!ok)throw Error(msg)};
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const qty=r=>r.recordType==='lot'?r.quantity:1;
const owns=(h,a)=>h?.ownerId===a&&h.location.holderId===a;
const available=(h,a)=>owns(h,a)&&['inventory','storage'].includes(h.location.kind);
const player='player:local',slots=['right','left'];
const herbs={
 roadside_mugwort:['길뚝쑥','P09','medicinal',2,['material.plant','purpose.medicine','purpose.dye','profession.herbalism'],1,3,'leaf','#769a62'],
 round_clover:['둥근토끼풀','P10','biological',1,['material.plant','purpose.feed','purpose.gardening'],2,4,'leaf','#86b96b'],
 salt_star_herb:['소금별초','P03','medicinal',5,['material.plant','purpose.medicine','property.coastal','profession.herbalism'],1,2,'flower','#eee6ae'],
 seashell:['조개껍데기','O03','biological',2,['material.shell','purpose.craft','purpose.decoration','property.coastal'],1,3,'pebble','#ded0b9'],
 wave_cap_mushroom:['물결갓버섯','P15','food',4,['material.fungus','purpose.cooking'],1,2,'mushroom','#a98e75']
};
export const gradeRegistry=Object.freeze(grades.map((id,rank)=>Object.freeze({id,rank,label:['하급','일반','상급','희귀','영웅','전설'][rank]})));
export const tagRegistry=Object.freeze([...new Set(Object.values(herbs).flatMap(h=>h[4]))]);
export const statRegistry=Object.freeze(['dmg','rate','reach']);
export const capabilityRegistry=Object.freeze({ingredient:{implementationState:'planned',effectHandlerId:null},equip:{implementationState:'available',effectHandlerId:'equip'}});
export function extendItemDefinitions(items){
 for(const [id,[name,source,category,value,tags,yieldMin,yieldMax,shape,color]] of Object.entries(herbs)){
  if(!Object.hasOwn(items,id))items[id]={name,desc:name,kind:'material',rarity:'common',value,category,tags,sourceRefs:[source],yieldMin,yieldMax,icon:{shape,color}};
 }
 for(const [id,d] of Object.entries(items)){
  const durable=d.kind==='weapon';
  Object.assign(d,{id,description:d.desc??d.name,category:d.category??(durable?'household':'biological'),
   usageType:durable?'long_use':'short_consumable',ownershipMode:durable?'unique':'lot',
   tags:d.tags??(id==='field_herb'?['material.plant','purpose.medicine']:[]),
   capabilities:[{capabilityId:durable?'equip':'ingredient'}],skillLinks:d.skillLinks??[],
   baseValue:d.value,baseStats:durable?{dmg:d.dmg,rate:d.rate,reach:d.reach}:{},
   allowedInstanceStats:durable?[...statRegistry]:[],sourceRefs:d.sourceRefs??[]});
  check(validId(id)&&safe(d.baseValue)&&d.tags.every(t=>tagRegistry.includes(t))&&d.allowedInstanceStats.every(k=>Number.isFinite(d.baseStats[k])&&d.baseStats[k]>=0),'invalid definition '+id);
 }
 return items;
}
export function createItemRuntime(save,getDefinitions,events){
 const defs=()=>getDefinitions(),def=id=>Object.hasOwn(defs(),id)?defs()[id]:null;
 const blank=()=>({version:1,nextSerial:1,owners:[{id:player,kind:'player'}],records:[],holdings:[],wallets:[{ownerId:player,currencyId:'silver',balance:0}],offers:[],transactions:[],quarantine:[]});
 const record=(s,id)=>s.records.find(r=>r.id===id),holding=(s,id)=>s.holdings.find(h=>h.itemRecordId===id),wallet=(s,id)=>s.wallets.find(w=>w.ownerId===id);
 const allocate=s=>{let id;do{check(safe(s.nextSerial,1,Number.MAX_SAFE_INTEGER-1),'item serial exhausted');id='item:'+s.nextSerial++;}while(record(s,id));return id};
 const durable=(d,id,quality=50)=>({id,definitionId:d.id,recordType:'unique',usageType:'long_use',quality,level:1,grade:'normal',wear:0,stats:clone(d.baseStats),traits:[]});
 const location=actor=>({kind:'inventory',holderId:actor});
 function put(s,actor,r){s.records.push(r);s.holdings.push({itemRecordId:r.id,ownerId:actor,location:location(actor)});return r}
 function erase(s,id){s.records=s.records.filter(r=>r.id!==id);s.holdings=s.holdings.filter(h=>h.itemRecordId!==id);for(const o of s.offers)o.stockRecordIds=o.stockRecordIds.filter(x=>x!==id)}
 function lotState(r){const {id,quantity,...rest}=r;return rest}
 function merge(s,r,actor){
  if(r.recordType!=='lot')return r;
  const exposure=id=>s.offers.filter(o=>o.stockRecordIds.includes(id)).map(o=>o.merchantId+':'+o.definitionId).sort();
  const h=holding(s,r.id);
  const target=s.records.find(a=>a.id!==r.id&&a.recordType==='lot'&&available(holding(s,a.id),actor)&&equal(holding(s,a.id).location,h.location)&&equal(lotState(a),lotState(r))&&equal(exposure(a.id),exposure(r.id))&&safe(a.quantity+r.quantity,1));
  if(!target)return r;target.quantity+=r.quantity;erase(s,r.id);return target;
 }
 function addTo(s,actor,id,n,quality=50){
  const d=def(id);check(d&&safe(n,1)&&safe(quality,0,100)&&wallet(s,actor),'invalid item creation');
  if(d.ownershipMode==='unique'){check(n<=10000,'too many unique items');return Array.from({length:n},()=>put(s,actor,durable(d,allocate(s),quality)))}
  return [merge(s,put(s,actor,{id:allocate(s),definitionId:id,recordType:'lot',quantity:n,quality}),actor)];
 }
 function validate(s){
  check(s?.version===1&&safe(s.nextSerial,1),'invalid economy version');
  const unique=(a,key)=>new Set(a.map(key)).size===a.length,owner=id=>s.owners.some(a=>a.id===id),occupied=new Set();
  check(unique(s.owners,a=>a.id)&&s.owners.every(a=>validId(a.id)),'duplicate owner');
  check(unique(s.records,a=>a.id)&&unique(s.holdings,a=>a.itemRecordId)&&s.records.length===s.holdings.length,'duplicate record or holding');
  for(const r of s.records){
   const d=def(r.definitionId),h=holding(s,r.id);check(validId(r.id)&&d&&h&&owner(h.ownerId)&&h.location.holderId===h.ownerId&&safe(r.quality,0,100),'invalid record reference or quality');
   check(['inventory','storage','equipped'].includes(h.location.kind),'invalid holding location');
   const keepsake=r.usageType==='permanent'&&r.legacyState!==undefined;
   check(r.recordType===d.ownershipMode||(keepsake&&r.recordType==='unique'),'wrong record type');
   if(r.recordType==='lot')check(safe(r.quantity,1)&&['level','grade','wear','stats'].every(k=>!Object.hasOwn(r,k)),'invalid lot');
   else if(!keepsake)check(r.usageType==='long_use'&&safe(r.level,1)&&grades.includes(r.grade)&&safe(r.wear,0,100)&&r.stats&&Object.entries(r.stats).every(([k,v])=>d.allowedInstanceStats.includes(k)&&Number.isFinite(v)&&v>=0)&&d.allowedInstanceStats.every(k=>Object.hasOwn(r.stats,k)),'invalid durable');
   if(h.location.kind==='equipped'){const key=h.ownerId+':'+h.location.slotId;check(!keepsake&&r.recordType==='unique'&&slots.includes(h.location.slotId)&&!occupied.has(key),'invalid equipped slot');occupied.add(key)}
  }
  check(unique(s.wallets,w=>w.ownerId)&&s.wallets.length===s.owners.length&&s.wallets.every(w=>owner(w.ownerId)&&w.currencyId==='silver'&&safe(w.balance)),'invalid wallet');
  check(unique(s.offers,o=>o.merchantId+':'+o.definitionId),'duplicate offer');
  const stocked=new Set();
  for(const o of s.offers){check(owner(o.merchantId)&&def(o.definitionId)&&[o.customerBuyPrice,o.customerSellPrice].every(n=>n===null||safe(n))&&safe(o.minimumQuality??0,0,100),'invalid offer');for(const rid of o.stockRecordIds){const r=record(s,rid);check(r&&r.definitionId===o.definitionId&&available(holding(s,rid),o.merchantId)&&!stocked.has(rid),'invalid stock');stocked.add(rid)}}
  check(unique(s.transactions,t=>t.request.requestId),'duplicate transaction');
  return s;
 }
 function migrate(data){
  if(data.itemEconomy){validate(data.itemEconomy);return data.itemEconomy}
  const s=blank();s.wallets[0].balance=safe(data.money)?data.money:0;
  if(data.money!==undefined&&!safe(data.money))s.quarantine.push({kind:'money',original:clone(data.money)});
  for(const [id,n] of Object.entries(data.inv??{})){
   if(def(id)&&safe(n,1)&&!(def(id).ownershipMode==='unique'&&n>10000))addTo(s,player,id,n);
   else s.quarantine.push({kind:'stack',id,original:n});
  }
  for(const old of data.uniqueItems??[]){
   if(!def(old.itemId)||!validId(old.id)||record(s,old.id)){s.quarantine.push({kind:'unique',original:clone(old)});continue}
   const d=def(old.itemId),r=d.ownershipMode==='unique'?durable(d,old.id):{id:old.id,definitionId:d.id,recordType:'unique',usageType:'permanent',quality:50,traits:[]};
   r.legacyState=clone(old.state??{});put(s,player,r);
  }
  if(safe(data.nextItemSerial,1))s.nextSerial=Math.max(s.nextSerial,data.nextItemSerial);
  for(const slot of slots){const id=data.equip?.[slot];if(!id)continue;const r=s.records.find(r=>r.definitionId===id&&r.usageType==='long_use'&&available(holding(s,r.id),player));if(r)holding(s,r.id).location={kind:'equipped',holderId:player,slotId:slot};else s.quarantine.push({kind:'equip',slot,original:id})}
  validate(s);data.itemEconomy=s;delete data.inv;delete data.uniqueItems;delete data.nextItemSerial;delete data.money;delete data.equip;return s;
 }
 const state=()=>save.data.itemEconomy??migrate(save.data);
 const count=(id,actor=player)=>{const s=state();return s.records.filter(r=>r.definitionId===id&&owns(holding(s,r.id),actor)&&r.usageType!=='permanent').reduce((n,r)=>n+qty(r),0)};
 function change(fn,{persist=false,event=null}={}){
  const old=state(),s=clone(old),res=fn(s);if(res===false||res?.ok===false)return res;
  validate(s);save.data.itemEconomy=s;
  if(persist){try{if(save.write?.()===false)throw Error('save failed')}catch{save.data.itemEconomy=old;return {ok:false,reason:'save_failed'}}}
  if(event)events?.emit('inventory.changed',event);return clone(res);
 }
 const fail=reason=>({ok:false,reason});
 function ensureActor(s,actor,kind='npc',balance=0){
  if(!s.owners.some(a=>a.id===actor)){check(validId(actor)&&safe(balance),'invalid actor');s.owners.push({id:actor,kind});s.wallets.push({ownerId:actor,currencyId:'silver',balance})}
 }
 function seedMerchant(actor,role){
  return change(s=>{
   if(s.owners.some(a=>a.id===actor))return true;
   ensureActor(s,actor,'npc',100);
   for(const d of Object.values(defs())){
    if(role==='smith'&&d.kind==='weapon'){const r=addTo(s,actor,d.id,1)[0];s.offers.push({merchantId:actor,definitionId:d.id,customerBuyPrice:d.price,customerSellPrice:null,stockRecordIds:[r.id]})}
    else if(role==='vendor'&&d.kind==='material'&&d.rarity==='common')s.offers.push({merchantId:actor,definitionId:d.id,customerBuyPrice:d.value*2,customerSellPrice:d.value,stockRecordIds:[]});
   }return true;
  });
 }
 function trade(q){
  if(!q||!validId(q.requestId)||q.actorId===q.counterpartyId||!['buy','sell'].includes(q.action)||!safe(q.quantity,1)||!safe(q.expectedUnitPrice))return fail('invalid_request');
  const prior=state().transactions.find(t=>t.request.requestId===q.requestId);if(prior)return equal(prior.request,q)?clone(prior.result):fail('request_id_conflict');
  return change(s=>{
   const r=record(s,q.itemRecordId),h=holding(s,q.itemRecordId);
   const seller=q.action==='buy'?q.counterpartyId:q.actorId,buyer=q.action==='buy'?q.actorId:q.counterpartyId;
   if(!r||!available(h,seller)||q.quantity>qty(r)||r.usageType==='permanent')return fail('unavailable');
   const o=s.offers.find(o=>o.merchantId===q.counterpartyId&&o.definitionId===r.definitionId);
   const price=q.action==='buy'?o?.customerBuyPrice:o?.customerSellPrice;
   if(price==null||price!==q.expectedUnitPrice||r.quality<(o.minimumQuality??0)||(q.action==='buy'&&!o.stockRecordIds.includes(r.id)))return fail('offer_mismatch');
   const w1=wallet(s,seller),w2=wallet(s,buyer),total=price*q.quantity;
   if(!w1||!w2||!safe(total)||w2.balance<total||!safe(w1.balance+total))return fail('funds');
   let moving=r;if(q.quantity<qty(r)){r.quantity-=q.quantity;moving=put(s,buyer,{...clone(r),id:allocate(s),quantity:q.quantity})}
   else{h.ownerId=buyer;h.location=location(buyer);for(const a of s.offers)a.stockRecordIds=a.stockRecordIds.filter(id=>id!==r.id)}
   if(q.action==='sell')o.stockRecordIds.push(moving.id);
   moving=merge(s,moving,buyer);w1.balance+=total;w2.balance-=total;
   const result={ok:true,recordId:moving.id,quantity:q.quantity,total};
   s.transactions.push({request:clone(q),result});return result;
  },{persist:true,event:{action:'trade',quantity:q.quantity}});
 }
 const equipped=(slot,actor=player)=>{const s=state(),h=s.holdings.find(h=>owns(h,actor)&&h.location.kind==='equipped'&&h.location.slotId===slot);return h?clone(record(s,h.itemRecordId)):null};
 function equip(actor,rid,slot){
  return change(s=>{const r=record(s,rid),h=holding(s,rid);if(!r||!owns(h,actor)||r.usageType!=='long_use'||r.wear===100||!slots.includes(slot))return fail('invalid_equipment');for(const a of s.holdings)if(owns(a,actor)&&a.location.kind==='equipped'&&a.location.slotId===slot)a.location=location(actor);h.location={kind:'equipped',holderId:actor,slotId:slot};return {ok:true,recordId:rid}},{persist:true});
 }
 function findDefinitions(q={}){return Object.values(defs()).filter(d=>(q.requiredTags??[]).every(t=>d.tags.includes(t))&&(!q.anyTags?.length||q.anyTags.some(t=>d.tags.includes(t)))&&(q.requiredCapabilities??[]).every(c=>d.capabilities.some(b=>b.capabilityId===c))&&(!q.usageType||d.usageType===q.usageType)&&(!q.category||d.category===q.category)&&(!q.skillId||d.skillLinks.some(l=>l.skillId===q.skillId)))}
 function tradeDefinition(merchant,id,action){
  const s=state(),o=s.offers.find(o=>o.merchantId===merchant&&o.definitionId===id);
  const rid=action==='buy'?o?.stockRecordIds[0]:s.records.find(r=>r.definitionId===id&&r.usageType!=='permanent'&&r.quality>=(o?.minimumQuality??0)&&available(holding(s,r.id),player))?.id;
  const price=action==='buy'?o?.customerBuyPrice:o?.customerSellPrice;
  if(!rid||price==null)return fail('unavailable');
  return trade({requestId:'trade:'+s.nextSerial+':'+s.transactions.length,actorId:player,counterpartyId:merchant,action,itemRecordId:rid,quantity:1,expectedUnitPrice:price});
 }
 return {
  initialize(){validate(state());for(const k of ['inv','uniqueItems','nextItemSerial','money','equip'])delete save.data[k];return true},snapshot:()=>clone(state()),player,count,entries(){return Object.keys(defs()).map(id=>[id,count(id)]).filter(([,n])=>n>0)},
  add(id,n=1,quality=50){change(s=>{addTo(s,player,id,n,quality);return true},{event:{action:'added',itemId:id,quantity:n}});return count(id)},
  take(id,n){if(!safe(n,1))throw Error('invalid quantity');return change(s=>{const a=s.records.filter(r=>r.definitionId===id&&r.usageType!=='permanent'&&available(holding(s,r.id),player));if(a.reduce((v,r)=>v+qty(r),0)<n)return false;let left=n;for(const r of a){const k=Math.min(left,qty(r));if(k===qty(r))erase(s,r.id);else r.quantity-=k;left-=k;if(!left)break}return true},{event:{action:'removed',itemId:id,quantity:n}})},
  balance(actor=player){return wallet(state(),actor)?.balance??0},
  credit(n){check(safe(n),'invalid credit');return change(s=>{const w=wallet(s,player);check(safe(w.balance+n),'wallet overflow');return w.balance+=n})},
  spend(n){check(safe(n),'invalid spend');return change(s=>{const w=wallet(s,player);if(w.balance<n)return false;w.balance-=n;return true})},
  seedMerchant,trade,equipped,equip,findDefinitions,
  registerActor(actor,kind='npc',balance=0){return change(s=>{ensureActor(s,actor,kind,balance);return true})},
  createFor(actor,id,n=1,quality=50){return change(s=>addTo(s,actor,id,n,quality),{persist:true})},
  merchantOffers(actor){return clone(state().offers.filter(o=>o.merchantId===actor))},
  canSell(merchant,id){const s=state(),o=s.offers.find(o=>o.merchantId===merchant&&o.definitionId===id);return !!(o&&o.customerSellPrice!==null&&wallet(s,merchant).balance>=o.customerSellPrice&&s.records.some(r=>r.definitionId===id&&r.usageType!=='permanent'&&r.quality>=(o.minimumQuality??0)&&available(holding(s,r.id),player)))},
  gather(nodeId,id,n,quality,now,respawnMs){
   const old=save.data.picked??{},last=old[nodeId];
   if(!safe(now,1)||!safe(respawnMs,1)||!safe(n,1)||!safe(quality,0,100)||!validId(nodeId)||(last&&now-last<=respawnMs))return fail('unavailable');
   const previous=state(),s=clone(previous);addTo(s,player,id,n,quality);validate(s);
   save.data.itemEconomy=s;save.data.picked={...old,[nodeId]:now};
   try{if(save.write?.()===false)throw Error('save failed')}catch{save.data.itemEconomy=previous;save.data.picked=old;return fail('save_failed')}
   events?.emit('inventory.changed',{action:'added',itemId:id,quantity:n});return {ok:true,total:count(id)};
  },
  equipDefinition(id,slot){const s=state(),current=equipped(slot);if(current?.definitionId===id)return {ok:true,recordId:current.id};const r=s.records.find(r=>r.definitionId===id&&r.usageType==='long_use'&&available(holding(s,r.id),player)&&r.wear!==100)??s.records.find(r=>r.definitionId===id&&r.usageType==='long_use'&&owns(holding(s,r.id),player)&&r.wear!==100);return r?equip(player,r.id,slot):fail('not_owned')},
  unequipDefinition(id){return change(s=>{for(const h of s.holdings)if(owns(h,player)&&h.location.kind==='equipped'&&record(s,h.itemRecordId)?.definitionId===id)h.location=location(player);return {ok:true}},{persist:true})},
  holdingsFor(actor){const s=state();return clone(s.holdings.filter(h=>h.ownerId===actor).map(h=>({holding:h,record:record(s,h.itemRecordId)})))},
  findAvailable(q){const s=state(),ids=new Set(findDefinitions(q).map(d=>d.id));if(!wallet(s,q.actorId))return [];return s.records.flatMap(r=>{if(r.usageType==='permanent'||!ids.has(r.definitionId)||r.quality<(q.minimumQuality??0)||qty(r)<(q.quantity??1)||(q.minimumLevel!==undefined&&!(r.level>=q.minimumLevel))||(q.maximumWear!==undefined&&!(r.wear<=q.maximumWear))||(q.minimumGrade!==undefined&&(!grades.includes(q.minimumGrade)||grades.indexOf(r.grade)<grades.indexOf(q.minimumGrade))))return [];const h=holding(s,r.id);if(available(h,q.actorId))return [{recordId:r.id,source:'owned',unitPrice:0}];const o=s.offers.find(o=>o.stockRecordIds.includes(r.id));return o&&o.customerBuyPrice!==null&&r.quality>=(o.minimumQuality??0)&&o.customerBuyPrice<=(q.maximumUnitPrice??Infinity)&&wallet(s,q.actorId).balance>=o.customerBuyPrice*(q.quantity??1)?[{recordId:r.id,source:'market',merchantId:o.merchantId,unitPrice:o.customerBuyPrice}]:[]})},
  canUse(actor,rid,cap){const s=state(),r=record(s,rid);if(!r||!owns(holding(s,rid),actor))return fail('not_owned');if(r.wear===100)return fail('worn_out');return cap==='equip'&&r.usageType==='long_use'?{ok:true}:fail('unsupported')},
  buyDefinition:(merchant,id)=>tradeDefinition(merchant,id,'buy'),
  sellDefinition:(merchant,id)=>tradeDefinition(merchant,id,'sell')
 };
}
