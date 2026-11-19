import assert from 'node:assert/strict';
import {createRegionLifecycle} from '../src/core/region-lifecycle.js';
const entries=new Map();
const registry={
  get:id=>entries.get(id)??null,
  register:e=>{if(entries.has(e.id))throw Error('duplicate');entries.set(e.id,e);},
  remove:id=>entries.delete(id),
  list:()=>[...entries.values()]
};
const messages=[];let writes=0;
const save={data:{v:1,inv:{flower:3}},write(){writes++;this.beforeWrite?.();}};
const regions=createRegionLifecycle({registry,save,events:{emit:(type,payload)=>messages.push([type,payload])}});
save.beforeWrite=()=>regions.checkpointActive();
function descriptor(id,creature){return {
  id,kind:'wildlife',ref:creature,
  getState:()=>({hp:creature.hp,dead:creature.dead}),
  setState:s=>{creature.hp=s.hp;creature.dead=s.dead;},
  setActive:flag=>{creature.visible=flag;}
};}
const a={hp:100,dead:0,visible:true},b={hp:10,dead:0,visible:true};
assert.equal(regions.mount('sernbeld',[descriptor('wolf0',a)]),1);
assert.equal(regions.mount('woods',[descriptor('owl0',b)]),1);
assert.equal(registry.list().length,2);
regions.checkpointActive();
assert.equal(save.data.regionEntities,undefined,'pristine world must not generate deltas');
a.hp=18;save.write();
assert.equal(save.data.regionEntities.sernbeld.wolf0.hp,18,'active region changes persist on ordinary save');
assert.equal(save.data.regionEntities.woods,undefined,'unchanged regions stay compact');
assert.equal(regions.suspend('sernbeld'),true);
assert.equal(regions.isActive('sernbeld'),false);
assert.equal(registry.get('wolf0'),null);
assert.equal(registry.get('owl0')?.ref,b,'other region keeps running');
assert.equal(a.visible,false);
assert.equal(regions.suspend('sernbeld'),false,'double suspend is idempotent');
a.hp=100;
assert.equal(regions.resume('sernbeld'),true);
assert.equal(a.hp,18,'suspended state restored');
assert.equal(a.visible,true);
assert.equal(regions.resume('sernbeld'),false);
assert.equal(regions.unmount('sernbeld'),true);
assert.equal(regions.isMounted('sernbeld'),false,'unmount releases live records');
assert.equal(registry.get('wolf0'),null);
assert.equal(save.data.regionEntities.sernbeld.wolf0.hp,18);
const recreated={hp:100,dead:0,visible:true};
regions.mount('sernbeld',[descriptor('wolf0',recreated)]);
assert.equal(recreated.hp,18,'new instance restores serialized state on region return');
recreated.hp=100;save.write();
assert.equal(save.data.regionEntities?.sernbeld,undefined,'reverting to defaults removes saved delta');
assert.equal(regions.isActive('woods'),true);
assert.equal(save.data.inv.flower,3,'legacy save data preserved');
assert(messages.some(([type])=>type==='region.suspended'));
assert(messages.some(([type])=>type==='region.activated'));
assert(messages.some(([type])=>type==='region.unmounted'));
assert(writes>=3);
assert.throws(()=>regions.mount('sernbeld',[]),/mounted/);
assert.throws(()=>regions.mount('fail',[descriptor('dup',{hp:1,dead:0}),descriptor('dup',{hp:2,dead:0})]),/duplicate/);
assert.equal(regions.isMounted('fail'),false);
console.log('PASS: region mount, checkpoint, suspend, resume, unmount, state restoration');
