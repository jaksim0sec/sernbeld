import {createItemRuntime,extendItemDefinitions} from '../src/core/shared-items.js';
function runTests(createItemRuntime,extendItemDefinitions){
 let n=0;const assert=(c,m)=>{if(!c)throw Error(m)};const eq=(a,b,m)=>assert(JSON.stringify(a)===JSON.stringify(b),m);
 const items=extendItemDefinitions({flower:{kind:'material',rarity:'common',name:'flower',value:2},sword:{kind:'weapon',rarity:'common',name:'sword',value:15,price:15,dmg:14,rate:1.6,reach:2.1}});
 const save={data:{v:1,inv:{flower:3,sword:2,unknown:9},money:20,equip:{right:'sword'},uniqueItems:[{id:'unique:9',itemId:'sword',state:{name:'old'}},{id:'unique:10',itemId:'flower',state:{note:'keepsake'}}]},write(){return true}};
 const s=createItemRuntime(save,()=>items);s.initialize();assert(s.count('flower')===3&&s.count('sword')===3&&s.balance()===20,'migration');assert(s.equipped('right').definitionId==='sword','equip migration');assert(!('inv' in save.data)&&s.snapshot().quarantine[0].original===9,'no duplicate inventory and unknown preservation');assert(s.holdingsFor(s.player).some(x=>x.record.legacyState?.note==='keepsake'),'keepsake preservation');n++;
 const before=s.snapshot();s.initialize();eq(s.snapshot(),before,'idempotent migration');n++;
 s.add('flower',2,90);s.add('flower',1,90);assert(s.holdingsFor(s.player).filter(x=>x.record.definitionId==='flower'&&x.record.recordType==='lot').length===2,'quality merging');n++;
 s.seedMerchant('npc:vendor','vendor');s.seedMerchant('npc:smith','smith');const result=s.sellDefinition('npc:vendor','flower');assert(result.ok&&s.count('flower')===5&&s.balance()===22&&s.balance('npc:vendor')===98,'sell');n++;
 const tx=s.snapshot().transactions[0],snap=s.snapshot();eq(s.trade(tx.request),tx.result,'replay');eq(s.snapshot(),snap,'no duplicate trade');assert(!s.trade({...tx.request,quantity:2}).ok,'collision');n++;
 const buy=s.buyDefinition('npc:smith','sword');assert(buy.ok&&s.count('sword')===4&&s.balance()===7&&s.balance('npc:smith')===115,'buy');assert(!s.buyDefinition('npc:smith','sword').ok,'finite stock');n++;
 assert(!s.equip('npc:smith',buy.recordId,'left').ok,'ownership');assert(s.equip(s.player,buy.recordId,'left').ok,'equip');assert(s.equipped('left').id===buy.recordId,'specific ID');n++;
 s.add('roadside_mugwort',3,85);assert(s.findDefinitions({requiredTags:['purpose.medicine']}).length===2,'tag lookup');assert(s.findAvailable({actorId:s.player,requiredTags:['purpose.medicine'],minimumQuality:80,quantity:3}).length===1,'quality lookup');n++;
 const restored=createItemRuntime({data:JSON.parse(JSON.stringify(save.data))},()=>items);eq(restored.snapshot(),s.snapshot(),'restore');n++;
 const initial=s.snapshot();save.write=()=>false;assert(!s.sellDefinition('npc:vendor','flower').ok,'write failure');eq(s.snapshot(),initial,'rollback');n++;
 const npc='npc:customer';save.write=()=>true;s.registerActor(npc,'npc',20);const offer=s.merchantOffers('npc:vendor').find(o=>o.definitionId==='flower');const res=s.trade({requestId:'npc:purchase:1',actorId:npc,counterpartyId:'npc:vendor',action:'buy',itemRecordId:offer.stockRecordIds[0],quantity:1,expectedUnitPrice:4});assert(res.ok&&s.balance(npc)===16&&s.count('flower',npc)===1,'NPC uses common trade');n++;
 const harvested=s.gather('herb:1','roadside_mugwort',2,73,1000,100);assert(harvested.ok,'gather');const gathered=s.snapshot();assert(!s.gather('herb:1','roadside_mugwort',2,73,1050,100).ok,'duplicate harvest');eq(gathered,s.snapshot(),'harvest unchanged');save.write=()=>false;assert(!s.gather('herb:2','roadside_mugwort',1,55,1200,100).ok,'failed harvest');assert(!save.data.picked['herb:2'],'harvest rollback');n++;
 return n;
}
console.log('PASS shared item runtime: '+runTests(createItemRuntime,extendItemDefinitions)+' scenarios');

function runSupplyTests(){
 const assert=(condition,message)=>{if(!condition)throw Error(message)};
 const defs=extendItemDefinitions({flower:{kind:'material',rarity:'common',name:'flower',value:2}});
 const save={data:{v:1,npcStates:{a:{lineI:7}},regionEntities:{old:true}},write(){return true}};
 const events=[];const s=createItemRuntime(save,()=>defs,{emit:(...args)=>events.push(args)});
 s.initialize();s.registerActor('npc:a','npc',20);s.seedMerchant('npc:vendor','vendor');
 s.add('flower',2,40);s.add('flower',2,70);s.add('flower',1,80);
 const plan=s.planSupply({actorId:s.player,selector:{definitionId:'flower',minQuality:60},quantity:3});
 assert(plan.ok&&plan.allocations.length===2&&plan.allocations.reduce((n,a)=>n+a.quantity,0)===3,'multi-lot supply');
 assert(!s.planSupply({actorId:s.player,selector:{definitionId:'flower',minQuality:60},quantity:4}).ok,'quality shortage');
 const reservation={operationId:'lock:1',actorId:s.player,allocations:plan.allocations,expiresAt:20};
 assert(s.reserve(reservation).ok&&s.reserve(reservation).ok,'reservation idempotency');
 assert(!s.reserve({...reservation,expiresAt:21}).ok,'reservation conflict');
 assert(!s.take('flower',3),'reserved quantity protected from take');
 const sale={requestId:'sale:1',actorId:s.player,counterpartyId:'npc:vendor',action:'sell',itemRecordId:plan.allocations[0].recordId,quantity:1,expectedUnitPrice:2};
 assert(s.trade(sale).reason==='reserved','reserved quantity protected from trade');
 s.add('flower',1,70);
 assert(s.holdingsFor(s.player).filter(x=>x.record.quality===70).length===2,'reserved identity preserved from merge');
 const reloaded=createItemRuntime({data:JSON.parse(JSON.stringify(save.data)),write(){return true}},()=>defs);
 assert(!reloaded.trade(sale).ok,'reservation survives reload');
 assert(s.release('lock:1').ok&&s.trade(sale).ok,'release permits trade');
 const before=JSON.stringify(save.data),count=events.length;
 save.write=()=>{save.data.npcStates.a.lineI=999;save.data.regionEntities.new=true;save.data.newRoot=1;return false};
 assert(s.sellDefinition('npc:vendor','flower').reason==='save_failed','failed save');
 assert(JSON.stringify(save.data)===before&&events.length===count,'rollback all save roots and notifications');
 save.write=()=>{save.data.npcStates.a.lineI=100;throw Error('storage')};
 assert(s.gather('herb:2','flower',1,40,1000,100).reason==='save_failed','failed gather');
 assert(JSON.stringify(save.data)===before&&events.length===count,'gather rollback all roots');
 save.write=()=>true;
 const market=s.planSupply({actorId:'npc:a',selector:{definitionId:'flower'},quantity:1,sourceKinds:['market'],constraints:{accessibleMerchantIds:['npc:vendor']}});
 assert(market.ok&&market.allocations[0].source==='market','market planning');
 assert(!s.planSupply({actorId:'npc:a',selector:{definitionId:'flower'},quantity:1,sourceKinds:['market']}).ok,'market access explicit');
 return 14;
}
console.log('PASS shared item supply and rollback: '+runSupplyTests()+' checks');
