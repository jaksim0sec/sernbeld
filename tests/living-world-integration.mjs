import {createLivingWorldRegistry} from '../src/core/living-world-registry.js';
import {createLivingWorldState} from '../src/core/living-world-state.js';
import {createNpcScheduler} from '../src/core/npc-scheduler.js';
import {createNpcRequests} from '../src/core/npc-requests.js';
import {createItemRuntime,extendItemDefinitions} from '../src/core/shared-items.js';

let checks=0;
const a=(ok,msg)=>{if(!ok)throw Error(msg);checks++};
const copy=v=>JSON.parse(JSON.stringify(v));
const defs=extendItemDefinitions({food:{kind:'material',name:'fixture',value:2}});
const registry=createLivingWorldRegistry({regions:['kael'],handlers:['rest']});
a(registry.registerDefinitions({
 needs:[{id:'hunger',min:0,max:100,initial:0,perTick:10,threshold:30}],
 actions:[{id:'rest',handlerId:'rest',duration:2,interruptPolicy:'pauseable',needWeights:{hunger:1}}],
 roles:[{id:'worker',actionIds:['rest'],needWeights:{hunger:1}}],
 profiles:[{id:'a',regionId:'kael',roleId:'worker',tags:['worker']}],
 requestPolicies:[{id:'food',needKey:'hunger',tags:['worker'],selector:{definitionId:'food'},quantity:1,minimumQuality:60,reward:2,ttlTicks:4,needDelta:-100,label:'fixture'}]
}).ok,'register');
const initial={data:{v:1,money:0},write:()=>true};
a(createLivingWorldState(initial,registry,()=>defs).initialize().ok,'initialize');
initial.data.itemEconomy.wallets.find(w=>w.ownerId==='npc:a').balance=20;
createItemRuntime(initial,()=>defs).createFor('player:local','food',1,70);
function make(data){
 const save={data:copy(data),write:()=>true};
 const requests=createNpcRequests(registry);
 const scheduler=createNpcScheduler({save,registry,getDefinitions:()=>defs,requests,handlers:{rest:{plan({npc}){return npc.needs.hunger>=60?{ok:true,plan:{needEffects:{hunger:-100}}}:{ok:false,reason:'not_needed'}}}}});
 return {save,scheduler,items:createItemRuntime(save,()=>defs)};
}
const whole=make(initial.data),frame=make(initial.data),split=make(initial.data);
a(whole.scheduler.advanceTo(24,1000).ok,'single catchup');
for(let t=0;t<=24;t++)a(frame.scheduler.advanceTo(t,100).ok,'frame '+t);
let result,steps=0;
do{result=split.scheduler.advanceTo(24,1);a(result.ok&&result.processed<=1,'bounded slice');if(++steps>100)throw Error('nontermination')}while(result.pending);
a(JSON.stringify(whole.save.data)===JSON.stringify(frame.save.data),'frame independent requests and jobs');
a(JSON.stringify(whole.save.data)===JSON.stringify(split.save.data),'budget independent requests and jobs');
a(whole.save.data.livingWorld.requests.some(r=>r.createdAt===3),'threshold observed at logical tick not frame end');
const player=make(initial.data);
a(player.scheduler.advanceTo(3,100).ok,'first episode');
const accept=player.scheduler.requestChoices('a')[0];a(accept&&player.scheduler.executeRequest('a',accept).ok,'accept actual request');
const submit=player.scheduler.requestChoices('a').find(c=>c.id==='living.request.submit');a(!!submit,'qualified actual lot');
const before=copy(player.save.data);player.save.write=()=>false;
a(!player.scheduler.executeRequest('a',submit).ok&&JSON.stringify(player.save.data)===JSON.stringify(before),'outer transaction rollback');
const reload=make(before);
a(reload.scheduler.executeRequest('a',submit).ok&&reload.items.balance()===2,'player resolves after reload');
a(reload.scheduler.executeRequest('a',submit).replayed&&reload.items.balance()===2,'reward once');
const self=make(before);
a(self.scheduler.advanceTo(10,100).ok,'unobserved NPC continues');
a(!self.scheduler.executeRequest('a',submit).ok&&self.items.balance()===0,'stale player loses race to NPC or expiry');
console.log('PASS living world integration: '+checks+' checks (request, scheduler, ledger, rollback, reload and clock partition)');
