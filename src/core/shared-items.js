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
 const locks=s=>s.reservations??[];
 const locked=(s,rid,except=null)=>locks(s).reduce((n,l)=>n+(l.id===except?0:l.allocations.filter(a=>a.recordId===rid).reduce((sum,a)=>sum+a.quantity,0)),0);
 const free=(s,r)=>qty(r)-locked(s,r.id);
 const allocate=s=>{let id;do{check(safe(s.nextSerial,1,Number.MAX_SAFE_INTEGER-1),'item serial exhausted');id='item:'+s.nextSerial++;}while(record(s,id));return id};
 const durable=(d,id,quality=50)=>({id,definitionId:d.id,recordType:'unique',usageType:'long_use',quality,level:1,grade:'normal',wear:0,stats:clone(d.baseStats),traits:[]});
 const location=actor=>({kind:'inventory',holderId:actor});
 function put(s,actor,r){s.records.push(r);s.holdings.push({itemRecordId:r.id,ownerId:actor,location:location(actor)});return r}
 function erase(s,id){s.records=s.records.filter(r=>r.id!==id);s.holdings=s.holdings.filter(h=>h.itemRecordId!==id);for(const o of s.offers)o.stockRecordIds=o.stockRecordIds.filter(x=>x!==id)}
 function lotState(r){const {id,quantity,...rest}=r;return rest}
 function merge(s,r,actor){
  if(r.recordType!=='lot'||locked(s,r.id)>0)return r;
  const exposure=id=>s.offers.filter(o=>o.stockRecordIds.includes(id)).map(o=>o.merchantId+':'+o.definitionId).sort();
  const h=holding(s,r.id);
  const target=s.records.find(a=>a.id!==r.id&&a.recordType==='lot'&&locked(s,a.id)===0&&available(holding(s,a.id),actor)&&equal(holding(s,a.id).location,h.location)&&equal(lotState(a),lotState(r))&&equal(exposure(a.id),exposure(r.id))&&safe(a.quantity+r.quantity,1));
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
  check(s.reservations===undefined||Array.isArray(s.reservations),'invalid reservations');
  check(unique(locks(s),l=>l.id),'duplicate reservation');
  for(const l of locks(s)){
   check(validId(l.id)&&owner(l.actorId)&&safe(l.expiresAt)&&Array.isArray(l.allocations)&&l.allocations.length>0&&unique(l.allocations,a=>a.recordId),'invalid reservation');
   for(const a of l.allocations){const r=record(s,a.recordId);check(r&&r.usageType!=='permanent'&&available(holding(s,r.id),l.actorId)&&safe(a.quantity,1)&&locked(s,r.id)<=qty(r),'invalid reserved holding')}
  }
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
 let writing=false;
 function change(fn,{persist=false,event=null,updateRoot=null}={}){
  if(writing)return {ok:false,reason:'busy'};
  const s=clone(state()),res=fn(s);if(res===false||res?.ok===false)return res;
  validate(s);
  const root=save.data, before=persist?clone(root):null;
  try{
   root.itemEconomy=s;
   if(updateRoot)updateRoot(root);
   if(persist){
    writing=true;
    if(typeof save.write!=='function'||save.write()===false)throw Error('save failed');
   }
  }catch(error){
   if(!persist)throw error;
   for(const k of Object.keys(root))delete root[k];
   Object.assign(root,before);save.data=root;
   return {ok:false,reason:'save_failed'};
  }finally{writing=false}
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
   if(q.quantity>free(s,r))return fail('reserved');
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
  return change(s=>{const r=record(s,rid),h=holding(s,rid);if(!r||!owns(h,actor)||locked(s,rid)>0||r.usageType!=='long_use'||r.wear===100||!slots.includes(slot))return fail('invalid_equipment');for(const a of s.holdings)if(owns(a,actor)&&a.location.kind==='equipped'&&a.location.slotId===slot)a.location=location(actor);h.location={kind:'equipped',holderId:actor,slotId:slot};return {ok:true,recordId:rid}},{persist:true});
 }
 function findDefinitions(q={}){return Object.values(defs()).filter(d=>(q.requiredTags??[]).every(t=>d.tags.includes(t))&&(!q.anyTags?.length||q.anyTags.some(t=>d.tags.includes(t)))&&(q.requiredCapabilities??[]).every(c=>d.capabilities.some(b=>b.capabilityId===c))&&(!q.usageType||d.usageType===q.usageType)&&(!q.category||d.category===q.category)&&(!q.skillId||d.skillLinks.some(l=>l.skillId===q.skillId)))}
 function tradeDefinition(merchant,id,action){
  const s=state(),o=s.offers.find(o=>o.merchantId===merchant&&o.definitionId===id);
  const rid=action==='buy'?o?.stockRecordIds.find(rid=>record(s,rid)&&free(s,record(s,rid))>0):s.records.find(r=>free(s,r)>0&&r.definitionId===id&&r.usageType!=='permanent'&&r.quality>=(o?.minimumQuality??0)&&available(holding(s,r.id),player))?.id;
  const price=action==='buy'?o?.customerBuyPrice:o?.customerSellPrice;
  if(!rid||price==null)return fail('unavailable');
  return trade({requestId:'trade:'+s.nextSerial+':'+s.transactions.length,actorId:player,counterpartyId:merchant,action,itemRecordId:rid,quantity:1,expectedUnitPrice:price});
 }
 // Read-only allocation plan. Market access is explicitly supplied by the caller.
 function planSupply({actorId,selector={},quantity=selector.quantity??1,sourceKinds=['owned'],constraints={}}={}){
  const s=state(),ids=new Set(findDefinitions(selector).map(d=>d.id));
  if(!wallet(s,actorId)||!safe(quantity,1)||!Array.isArray(sourceKinds)||sourceKinds.some(k=>!['owned','market'].includes(k)))return fail('invalid');
  const min=selector.minQuality??selector.minimumQuality??0,grade=selector.minGrade??selector.minimumGrade,level=selector.minLevel??selector.minimumLevel,wear=selector.maxWear??selector.maximumWear;
  if(!safe(min,0,100)||(grade!==undefined&&!grades.includes(grade))||(level!==undefined&&!safe(level,1))||(wear!==undefined&&!safe(wear,0,100)))return fail('invalid');
  const candidates=[];
  for(const r of s.records){
   if(!ids.has(r.definitionId)||(selector.definitionId&&r.definitionId!==selector.definitionId)||r.usageType==='permanent'||r.quality<min||!free(s,r)||(grade!==undefined&&grades.indexOf(r.grade)<grades.indexOf(grade))||(level!==undefined&&!(r.level>=level))||(wear!==undefined&&!(r.wear<=wear)))continue;
   const h=holding(s,r.id),expected=JSON.stringify(canonical({record:r,holding:h}));
   if(available(h,actorId)&&sourceKinds.includes('owned'))candidates.push({recordId:r.id,source:'owned',unitPrice:0,expected,available:free(s,r)});
   else if(sourceKinds.includes('market')&&Array.isArray(constraints.accessibleMerchantIds)){
    const o=s.offers.find(o=>o.stockRecordIds.includes(r.id)&&constraints.accessibleMerchantIds.includes(o.merchantId)&&o.merchantId!==actorId);
    if(o&&o.customerBuyPrice!==null&&r.quality>=(o.minimumQuality??0)&&o.customerBuyPrice<=(selector.maximumUnitPrice??Infinity))candidates.push({recordId:r.id,source:'market',merchantId:o.merchantId,unitPrice:o.customerBuyPrice,expected,available:free(s,r)});
   }
  }
  candidates.sort((a,b)=>(a.source==='owned'?0:1)-(b.source==='owned'?0:1)||a.unitPrice-b.unitPrice||(a.recordId<b.recordId?-1:a.recordId>b.recordId?1:0));
  const allocations=[];let remaining=quantity,budget=wallet(s,actorId).balance;
  for(const {available,...a} of candidates){const n=Math.min(remaining,available,a.unitPrice?Math.floor(budget/a.unitPrice):remaining);if(!n)continue;allocations.push({...a,quantity:n});remaining-=n;budget-=a.unitPrice*n;if(!remaining)break}
  return remaining?fail('unavailable'):{ok:true,allocations};
 }
 // Owned allocations only until access, market and scheduler contracts are integrated.
 function reserve({operationId,actorId,allocations,expiresAt}={}){
  if(!validId(operationId)||!safe(expiresAt)||!Array.isArray(allocations)||!allocations.length||new Set(allocations.map(a=>a?.recordId)).size!==allocations.length)return fail('invalid');
  return change(s=>{
   const entry={id:operationId,actorId,expiresAt,allocations:clone(allocations)};
   const prior=locks(s).find(l=>l.id===operationId);
   if(prior)return equal(prior,entry)?{ok:true,reservation:prior}:fail('request_id_conflict');
   if(!wallet(s,actorId))return fail('invalid');
   for(const a of allocations){
    if(!a||a.source!=='owned'||!safe(a.quantity,1))return fail('unsupported');
    const r=record(s,a.recordId),h=holding(s,a.recordId);
    if(!r||!available(h,actorId)||r.usageType==='permanent'||a.expected!==JSON.stringify(canonical({record:r,holding:h})))return fail('stale');
    if(a.quantity>free(s,r))return fail('reserved');
   }
   (s.reservations??=[]).push(entry);return {ok:true,reservation:entry};
  },{persist:true});
 }
 function release(reservationId){
  if(!validId(reservationId))return fail('invalid');
  return change(s=>{if(s.reservations)s.reservations=s.reservations.filter(l=>l.id!==reservationId);return {ok:true}},{persist:true});
 }
 // Trusted code registers policy validators; production data cannot execute arbitrary handlers.
 const transferPolicies=new Map(), consumptionPolicies=new Map(), recipes=new Map();
 const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
 const validSelector=s=>plain(s)&&safe(s.quantity,1)&&
  (s.definitionId===undefined||!!def(s.definitionId))&&
  (s.requiredTags===undefined||Array.isArray(s.requiredTags)&&s.requiredTags.every(t=>tagRegistry.includes(t)))&&
  (s.anyTags===undefined||Array.isArray(s.anyTags)&&s.anyTags.every(t=>tagRegistry.includes(t)))&&
  (s.category===undefined||typeof s.category==='string')&&
  (s.minQuality===undefined||safe(s.minQuality,0,100))&&
  (s.definitionId!==undefined||s.requiredTags?.length>0||s.anyTags?.length>0||s.category!==undefined);
 const validEffect=e=>plain(e)&&validId(e.needId)&&Number.isFinite(e.delta)&&e.delta!==0&&Number.isFinite(e.min)&&Number.isFinite(e.max)&&e.min<e.max;
 function registerConsumptionPolicy(id,{input,effect,validate:guard}={}){
  if(!validId(id)||consumptionPolicies.has(id)||!validSelector(input)||!validEffect(effect)||typeof guard!=='function')return fail('invalid');
  consumptionPolicies.set(id,{input:clone(input),effect:clone(effect),guard});return {ok:true};
 }
 function registerRecipe(id,{inputs,outputs,qualityPolicy,validate:guard}={}){
  if(!validId(id)||recipes.has(id)||!Array.isArray(inputs)||!inputs.length||!inputs.every(validSelector)||
    !Array.isArray(outputs)||!outputs.length||!outputs.every(o=>plain(o)&&!!def(o.definitionId)&&safe(o.quantity,1)&&(def(o.definitionId).ownershipMode!=='unique'||o.quantity<=10000))||
    typeof qualityPolicy!=='function'||typeof guard!=='function')return fail('invalid');
  recipes.set(id,{inputs:clone(inputs),outputs:clone(outputs),qualityPolicy,guard});return {ok:true};
 }
 function matchesInput(r,input){
  const d=def(r.definitionId);
  return r.recordType==='lot'&&d?.usageType==='short_consumable'&&(!input.definitionId||input.definitionId===r.definitionId)&&
    (!input.category||d.category===input.category)&&(input.requiredTags??[]).every(t=>d.tags.includes(t))&&
    (!input.anyTags?.length||input.anyTags.some(t=>d.tags.includes(t)))&&r.quality>=(input.minQuality??0);
 }
 // Explicit input bindings allow overlapping ingredient selectors without counting a record twice.
 function verifyInputs(s,allocations,bindings,inputs){
  if(!Array.isArray(bindings)||!bindings.length)return false;
  const used=new Map(),counts=inputs.map(()=>0),byId=new Map(allocations.map(a=>[a.recordId,a.quantity]));
  for(const b of bindings){
   if(!plain(b)||!safe(b.inputIndex,0,inputs.length-1)||!safe(b.quantity,1)||!byId.has(b.recordId))return false;
   const r=record(s,b.recordId);if(!r||!matchesInput(r,inputs[b.inputIndex]))return false;
   const next=(used.get(b.recordId)??0)+b.quantity,count=counts[b.inputIndex]+b.quantity;
   if(!safe(next)||next>byId.get(b.recordId)||!safe(count)||count>inputs[b.inputIndex].quantity)return false;
   used.set(b.recordId,next);counts[b.inputIndex]=count;
  }
  return counts.every((n,i)=>n===inputs[i].quantity)&&allocations.every(a=>used.get(a.recordId)===a.quantity);
 }
 function consumptionEffect(q,p){
  const id=q.actorId.startsWith('npc:')?q.actorId.slice(4):null;
  const npc=id&&Object.hasOwn(save.data.npcStates??{},id)?save.data.npcStates[id]:null;
  const e=p.effect,needs=npc?.needs;
  if(!plain(needs)||!Object.hasOwn(needs,e.needId)||!Number.isFinite(needs[e.needId])||needs[e.needId]<e.min||needs[e.needId]>e.max)return fail('unavailable');
  return {ok:true,npcId:id,needId:e.needId,value:Math.min(e.max,Math.max(e.min,needs[e.needId]+e.delta))};
 }
 function registerTransferPolicy(id,validatePolicy){
  if(!validId(id)||typeof validatePolicy!=='function'||transferPolicies.has(id))return fail('invalid');
  transferPolicies.set(id,validatePolicy);return {ok:true};
 }
 function operationRequest(command){
  if(!command||!validId(command.operationId)||!validId(command.actorId)||typeof command.kind!=='string'||!command.payload||typeof command.payload!=='object'||Array.isArray(command.payload))return null;
  try{return clone({...command,requestId:command.operationId})}catch{return null}
 }
 function prepareOperation(s,q){
  const prior=s.transactions.find(t=>t.request.requestId===q.requestId);
  if(prior)return equal(prior.request,q)?{ok:true,replay:clone(prior.result)}:fail('request_id_conflict');
  if(!['transfer','consume','produce'].includes(q.kind))return fail('unsupported');
  const {recipientId,allocations,reservationId,policyId,tick,recipeId}=q.payload;
  const transfer=q.kind==='transfer',consume=q.kind==='consume';
  const policy=transfer?transferPolicies.get(policyId):consume?consumptionPolicies.get(policyId):recipes.get(recipeId);
  if(!policy)return fail('unsupported');
  if(!wallet(s,q.actorId)||(transfer&&(!wallet(s,recipientId)||recipientId===q.actorId))||!Array.isArray(allocations)||!allocations.length||new Set(allocations.map(a=>a?.recordId)).size!==allocations.length)return fail('invalid');
  const reservation=reservationId===undefined?null:locks(s).find(l=>l.id===reservationId);
  if(reservationId!==undefined&&(!reservation||reservation.actorId!==q.actorId||!safe(tick)||tick>reservation.expiresAt||!equal(reservation.allocations,allocations)))return fail('stale');
  for(const a of allocations){
   if(!a||a.source!=='owned'||!safe(a.quantity,1))return fail('invalid');
   const r=record(s,a.recordId),h=holding(s,a.recordId);
   if(!r||!available(h,q.actorId)||r.usageType==='permanent'||a.quantity>qty(r))return fail('unavailable');
   if(!reservation&&a.expected!==JSON.stringify(canonical({record:r,holding:h})))return fail('stale');
   if(a.quantity>qty(r)-locked(s,r.id,reservationId??null))return fail('reserved');
  }
  try{if((transfer?policy:policy.guard)(clone(q),clone(save.data))!==true)return fail('unavailable')}catch{return fail('invalid_policy')}
  if(transfer)return {ok:true};
  const inputs=consume?[policy.input]:policy.inputs;
  const bindings=consume?allocations.map(a=>({inputIndex:0,recordId:a.recordId,quantity:a.quantity})):q.payload.inputBindings;
  if(!verifyInputs(s,allocations,bindings,inputs))return fail('input_mismatch');
  if(consume)return consumptionEffect(q,policy);
  let quality;
  try{quality=policy.qualityPolicy(allocations.map(a=>({record:clone(record(s,a.recordId)),quantity:a.quantity})),q.payload.seed)}catch{return fail('invalid_policy')}
  if(!safe(quality,0,100))return fail('invalid_policy');
  return {ok:true,outputs:policy.outputs.map(o=>({...o,quality}))};
 }
 function applyOperation(s,q,validation){
  if(!validation.ok||validation.replay)return validation.replay??validation;
  const {recipientId,allocations,reservationId}=q.payload;
  if(reservationId!==undefined)s.reservations=s.reservations.filter(l=>l.id!==reservationId);
  const moved=[];
  for(const a of allocations){
   const r=record(s,a.recordId),h=holding(s,r.id);let moving=r;
   if(q.kind!=='transfer'){
    if(a.quantity===qty(r))erase(s,r.id);else r.quantity-=a.quantity;
    moved.push({recordId:a.recordId,quantity:a.quantity});continue;
   }
   if(a.quantity<qty(r)){r.quantity-=a.quantity;moving=put(s,recipientId,{...clone(r),id:allocate(s),quantity:a.quantity})}
   else{h.ownerId=recipientId;h.location=location(recipientId);for(const o of s.offers)o.stockRecordIds=o.stockRecordIds.filter(id=>id!==r.id)}
   moving=merge(s,moving,recipientId);moved.push({recordId:moving.id,quantity:a.quantity});
  }
  const result={ok:true,operationId:q.operationId,kind:q.kind,allocations:moved};
  if(q.kind==='consume')result.need={npcId:validation.npcId,needId:validation.needId,value:validation.value};
  if(q.kind==='produce'){
   result.outputs=[];
   for(const o of validation.outputs){
    const created=addTo(s,q.actorId,o.definitionId,o.quantity,o.quality);
    result.outputs.push({...o,recordIds:created.map(r=>r.id)});
   }
  }
  s.transactions.push({request:clone(q),result:clone(result)});return result;
 }
 function canExecute(command){
  const q=operationRequest(command);if(!q)return fail('invalid');
  const result=prepareOperation(state(),q);return result.replay??result;
 }
 function commitOperation(command){
  if(writing)return fail('busy');
  const q=operationRequest(command);if(!q)return fail('invalid');
  const prior=state().transactions.find(t=>t.request.requestId===q.requestId);
  if(prior)return equal(prior.request,q)?clone(prior.result):fail('request_id_conflict');
  const validation=prepareOperation(state(),q);
  if(!validation.ok||validation.replay)return validation.replay??validation;
  try{
   return change(s=>applyOperation(s,q,validation),{persist:true,event:{action:q.kind,operationId:q.operationId},
    updateRoot:q.kind==='consume'?root=>{root.npcStates[validation.npcId].needs[validation.needId]=validation.value}:null});
  }catch{return fail('invalid_operation')}
 }
 return {
  planSupply,reserve,release,registerTransferPolicy,registerConsumptionPolicy,registerRecipe,canExecute,commitOperation,
  initialize(){validate(state());for(const k of ['inv','uniqueItems','nextItemSerial','money','equip'])delete save.data[k];return true},snapshot:()=>clone(state()),player,count,entries(){return Object.keys(defs()).map(id=>[id,count(id)]).filter(([,n])=>n>0)},
  add(id,n=1,quality=50){change(s=>{addTo(s,player,id,n,quality);return true},{event:{action:'added',itemId:id,quantity:n}});return count(id)},
  take(id,n){if(!safe(n,1))throw Error('invalid quantity');return change(s=>{const a=s.records.filter(r=>r.definitionId===id&&r.usageType!=='permanent'&&available(holding(s,r.id),player));if(a.reduce((v,r)=>v+free(s,r),0)<n)return false;let left=n;for(const r of a){const k=Math.min(left,free(s,r));if(!k)continue;if(k===qty(r))erase(s,r.id);else r.quantity-=k;left-=k;if(!left)break}return true},{event:{action:'removed',itemId:id,quantity:n}})},
  balance(actor=player){return wallet(state(),actor)?.balance??0},
  credit(n){check(safe(n),'invalid credit');return change(s=>{const w=wallet(s,player);check(safe(w.balance+n),'wallet overflow');return w.balance+=n})},
  spend(n){check(safe(n),'invalid spend');return change(s=>{const w=wallet(s,player);if(w.balance<n)return false;w.balance-=n;return true})},
  seedMerchant,trade,equipped,equip,findDefinitions,
  registerActor(actor,kind='npc',balance=0){return change(s=>{ensureActor(s,actor,kind,balance);return true})},
  createFor(actor,id,n=1,quality=50){return change(s=>addTo(s,actor,id,n,quality),{persist:true})},
  merchantOffers(actor){return clone(state().offers.filter(o=>o.merchantId===actor))},
  canSell(merchant,id){const s=state(),o=s.offers.find(o=>o.merchantId===merchant&&o.definitionId===id);return !!(o&&o.customerSellPrice!==null&&wallet(s,merchant).balance>=o.customerSellPrice&&s.records.some(r=>free(s,r)>0&&r.definitionId===id&&r.usageType!=='permanent'&&r.quality>=(o.minimumQuality??0)&&available(holding(s,r.id),player)))},
  gather(nodeId,id,n,quality,now,respawnMs){
   const old=save.data.picked??{},last=old[nodeId];
   if(!safe(now,1)||!safe(respawnMs,1)||!safe(n,1)||!safe(quality,0,100)||!validId(nodeId)||(last&&now-last<=respawnMs))return fail('unavailable');
   return change(s=>{addTo(s,player,id,n,quality);return {ok:true,total:s.records.filter(r=>r.definitionId===id&&owns(holding(s,r.id),player)&&r.usageType!=='permanent').reduce((n,r)=>n+qty(r),0)}},{persist:true,updateRoot:root=>{root.picked={...old,[nodeId]:now}},event:{action:'added',itemId:id,quantity:n}});
  },
  equipDefinition(id,slot){const s=state(),current=equipped(slot);if(current?.definitionId===id)return {ok:true,recordId:current.id};const r=s.records.find(r=>r.definitionId===id&&r.usageType==='long_use'&&available(holding(s,r.id),player)&&free(s,r)>0&&r.wear!==100)??s.records.find(r=>r.definitionId===id&&r.usageType==='long_use'&&owns(holding(s,r.id),player)&&r.wear!==100);return r?equip(player,r.id,slot):fail('not_owned')},
  unequipDefinition(id){return change(s=>{for(const h of s.holdings)if(owns(h,player)&&h.location.kind==='equipped'&&record(s,h.itemRecordId)?.definitionId===id)h.location=location(player);return {ok:true}},{persist:true})},
  holdingsFor(actor){const s=state();return clone(s.holdings.filter(h=>h.ownerId===actor).map(h=>({holding:h,record:record(s,h.itemRecordId)})))},
  findAvailable(q){const s=state(),ids=new Set(findDefinitions(q).map(d=>d.id));if(!wallet(s,q.actorId))return [];return s.records.flatMap(r=>{if(r.usageType==='permanent'||!ids.has(r.definitionId)||r.quality<(q.minimumQuality??0)||free(s,r)<(q.quantity??1)||(q.minimumLevel!==undefined&&!(r.level>=q.minimumLevel))||(q.maximumWear!==undefined&&!(r.wear<=q.maximumWear))||(q.minimumGrade!==undefined&&(!grades.includes(q.minimumGrade)||grades.indexOf(r.grade)<grades.indexOf(q.minimumGrade))))return [];const h=holding(s,r.id);if(available(h,q.actorId))return [{recordId:r.id,source:'owned',unitPrice:0}];const o=s.offers.find(o=>o.stockRecordIds.includes(r.id));return o&&o.customerBuyPrice!==null&&r.quality>=(o.minimumQuality??0)&&o.customerBuyPrice<=(q.maximumUnitPrice??Infinity)&&wallet(s,q.actorId).balance>=o.customerBuyPrice*(q.quantity??1)?[{recordId:r.id,source:'market',merchantId:o.merchantId,unitPrice:o.customerBuyPrice}]:[]})},
  canUse(actor,rid,cap){const s=state(),r=record(s,rid);if(!r||!owns(holding(s,rid),actor))return fail('not_owned');if(r.wear===100)return fail('worn_out');return cap==='equip'&&r.usageType==='long_use'?{ok:true}:fail('unsupported')},
  buyDefinition:(merchant,id)=>tradeDefinition(merchant,id,'buy'),
  sellDefinition:(merchant,id)=>tradeDefinition(merchant,id,'sell')
 };
}
