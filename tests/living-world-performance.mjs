import {createLivingWorldRegistry} from '../src/core/living-world-registry.js';
import {createLivingWorldState} from '../src/core/living-world-state.js';
import {createNpcScheduler} from '../src/core/npc-scheduler.js';
import {createNpcConversations} from '../src/core/npc-conversation.js';
import {extendItemDefinitions} from '../src/core/shared-items.js';
const a=(v,m)=>{if(!v)throw Error(m)};
const defs=extendItemDefinitions({});
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1]??0;
for(const size of [100,300,1000]){
 const registry=createLivingWorldRegistry({regions:['kael'],handlers:['idle']});
 const profiles=Array.from({length:size},(_,i)=>({id:'n'+i,regionId:'kael',roleId:'idle',tags:['worker']}));
 a(registry.registerDefinitions({profiles,actions:[{id:'idle',handlerId:'idle',duration:10080,interruptPolicy:'pauseable',needWeights:{}}],roles:[{id:'idle',actionIds:['idle'],needWeights:{}}],conversationTemplates:[{id:'talk',topic:'idle',regionIds:['kael'],slots:[{id:'a',tags:['worker']},{id:'b',tags:['worker']}],turns:[{slotId:'a',text:'fixture',duration:20}]}]}).ok,'register load');
 let writes=0;const save={data:{v:1},write(){writes++;return true}};
 a(createLivingWorldState(save,registry,()=>defs).initialize().ok,'initialize load');
 const scheduler=createNpcScheduler({save,registry,getDefinitions:()=>defs,handlers:{idle:{plan:()=>({ok:true,plan:{}})}}});
 const timings=[];let result,iterations=0;
 do{const start=Date.now();result=scheduler.advanceTo(0,32);timings.push(Date.now()-start);a(result.ok&&result.processed<=32,'slice budget');a(++iterations<=size+1,'catchup progress')}while(result.pending);
 a(scheduler.snapshot().length===size,'one job per NPC');
 if(size===100){let slices=0;do{result=scheduler.advanceTo(10080,32);a(result.ok&&result.processed<=32,'seven day slice');a(++slices<100,'seven day termination')}while(result.pending);a(scheduler.snapshot().length===size,'seven day queue bound')}
 const groups=createNpcConversations({registry,canPair:()=>true});
 const npcs=profiles.map((p,i)=>({...p,x:i<32?i%8:100+i,y:0,z:i<32?Math.floor(i/8):0,stationary:true}));
 for(let i=0;i<1800;i++){const out=groups.update({active:true,regionId:'kael',player:{x:-100,y:0,z:0},npcs,now:i});a(!out.length,'far no group')}
 a(groups.snapshot().stats.scans===0&&groups.snapshot().stats.materializations===0,'unobserved zero scans/materializations');
 for(let i=1800;i<1860;i++){const out=groups.update({active:true,regionId:'kael',player:{x:0,y:0,z:0},npcs,now:i});a(out.length<=3&&groups.snapshot().stats.pairs<=256,'bounded local scan')}
 groups.clear();a(groups.snapshot().groups.length===0,'clear groups');
 console.log('MEASURE living-world '+JSON.stringify({size,slices:timings.length,p50Ms:percentile(timings,.5),p95Ms:percentile(timings,.95),maxMs:Math.max(...timings),writes,saveChars:JSON.stringify(save.data).length,heapBytes:typeof process!=='undefined'?process.memoryUsage().heapUsed:null}));
}
console.log('PASS living-world operation budgets, 100/300/1000 logical NPCs, 7-day sparse scheduler and 30-minute unobserved group counters (not device frame timing)');
