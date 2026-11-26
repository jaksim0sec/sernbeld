import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRuntimeCollisionBridge} from '../src/core/world-collision-runtime.js';

// Exercise the actual renderer's existing registration/probe functions, not
// a lookalike collision implementation.
const src=readFileSync(new URL('../src/render/world-render.part.js',import.meta.url),'utf8');
const start=src.indexOf('var CELL = 32;'),end=src.indexOf('function playerSafeSpawn(',start);
assert(start>=0&&end>start,'renderer extraction markers');
const env=Function(`const PLAYER={radius:.35,body:1.72,step:.48},HALF=20,CFG={cell:20},GRID_N=3,
  World={H:new Float64Array(9)},clamp2=(v,a,b)=>Math.max(a,Math.min(b,v)),
  stairSurface=()=>null,sample=()=>0;
  ${src.slice(start,end)}
  return {addBox,addCyl,addRoof,inside,local,query,playerFloor,playerContacts,playerContact,
    roofInFoot,roofInOuter,roofSurfaceLocal,
    install(v){WorldCollision=v;}};`)();
const bridge=createRuntimeCollisionBridge({...env,stairUV:(s,x,z)=>[x-s.a[0],z-s.a[1],s.b[0]-s.a[0]],stairMinV:-1,stairMaxV:1});
env.install(bridge);bridge.setRegion('lab');
const profile={radius:.35,height:1.72};
const b=env.addBox({cx:0,cy:1,cz:0,hx:1,hy:1,hz:2,yaw:Math.PI/6,walk:false});
const c=env.addCyl({x:5,z:0,r:1,y0:0,y1:2,walk:true});
const second=env.addBox({cx:-5,cy:1,cz:0,hx:1,hy:1,hz:1,yaw:0,walk:true});
assert.notEqual(b.collisionId,second.collisionId);
assert.equal(bridge.get(b.collisionId).regionId,'lab');
for(const [x,y,z] of [[0,2,0],[5,2,0],[-5,2,0]]){
 const hit=bridge.support([x,y,z],profile,{maxRise:.48});
 assert(hit&&Math.abs(hit.point[1]-env.playerFloor(x,z,y+.48))<1e-8,'live primitive support parity');
 assert(hit.instanceId===([0,5,-5].includes(x)?(x===0?b:x===5?c:second).collisionId:null));
}
assert(bridge.overlap([0,1,0],profile).some(h=>h.instanceId===b.collisionId),'static overlap uses registered ID');
const parity=(x,y,z,nearby=[],solids=null)=>{
 const r=profile.radius,old=[],candidates=solids??[...env.query(x,z,r)];
 for(const o of candidates){
  if(o.top<=y+.002||o.bot>=y+profile.height-.002)continue;
  const hit=env.playerContact(o,x,z,r);if(hit)old.push(hit);
 }
 for(const o of nearby){
  if(o.top<=y+.002||o.bot>=y+profile.height-.002)continue;
  const hit=env.playerContact(o,x,z,r);if(hit)old.push(hit);
 }
 const actual=env.playerContacts(x,z,y,nearby,r,solids);
 assert.deepEqual(actual,old,'registry overlap must preserve original contact normals, depth, source objects and order');
};
for(const point of [[0,1,0],[.95,.5,.75],[1.5,0,1.1],[5,.2,0],[6,.3,0]])parity(...point);
const staticBuffer=[...env.query(0,0,3)],dynamic={type:'cyl',x:.5,z:0,r:.27,bot:0,top:1.72,walk:false};
parity(0,.5,0,[dynamic],staticBuffer);

bridge.suspendRegion('lab');
assert.equal(bridge.support([0,2,0],profile,{maxRise:.48}),null,'region suspend');
bridge.resumeRegion('lab');
assert(bridge.support([0,2,0],profile,{maxRise:.48}),'resume without reauthoring');
const r=env.addRoof({shape:'gable',cx:12,cz:0,yaw:0,hx:2,hz:2,ox:3,oz:3,base:3,rise:1,half:3,acrossX:true});
assert.equal(bridge.support([12,4,0],profile).instanceId,r.collisionId+':foot','roof-foot policy');
assert.equal(bridge.support([14.5,3.16,0],profile,{maxRise:.48})?.instanceId,r.collisionId+':overhang','overhang one-way ID');
const water=bridge.water({contains:(x,z)=>x>20&&x<30&&Math.abs(z)<3,surfaceAt:()=>-.18,bottomAt:()=>-3,bounds:{center:[25,-1.59,0],half:[5,1.41,3]}});
assert.equal(bridge.debugSnapshot().counts.water,1);
assert(bridge.get(water.id)?.shapes[0].policy.water,'water is a non-solid volume');
assert.equal(bridge.overlap([25,-2,0],profile).length,0,'water is never blocking');
const terrainHandle=bridge.terrain({heights:new Float64Array([0,1,2,1,2,3,2,3,4]),gridN:3,cell:2,half:2});
const terrainHit=bridge.support([-1.5,.5,-1.5],profile,{maxRise:.05});
assert.equal(terrainHit?.instanceId,terrainHandle.id,'heightfield wins the measured surface query');
assert(Math.abs(terrainHit.point[1]-.5)<1e-8,'heightfield exact triangle');
assert(bridge.debugSnapshot().registered>=7,'live objects and surfaces registered');
// Execute the actual resident-contact implementation with no rendered actor.
const gameplay=readFileSync(new URL('../src/gameplay/gameplay.part.js',import.meta.url),'utf8');
const npcStart=gameplay.indexOf('  playerContacts(p) {'),npcEnd=gameplay.indexOf('  labels(camera',npcStart);
assert(npcStart>0&&npcEnd>npcStart,'resident-contact source boundary');
const residentContacts=Function(`const PLAYER={radius:.35}; return ({${gameplay.slice(npcStart,npcEnd)}}).playerContacts;`)();
const npc={def:{scale:1},x:0,z:0,y:0,hidden:false,ch:null};
const actor={pos:{x:.6,y:0,z:0}};
const absent=residentContacts.call({list:[npc]},actor);
assert.equal(absent.length,1,'unloaded resident remains physical');
npc.ch={group:{visible:false}};
assert.deepEqual(residentContacts.call({list:[npc]},actor),absent,'resident rendering/LOD cannot alter collisions');
npc.hidden=true;
assert.equal(residentContacts.call({list:[npc]},actor).length,0,'hidden resident not physically active');
npc.hidden=false;
assert.equal(residentContacts.call({list:[npc]},{pos:{x:.6,y:3,z:0}}).length,0,'vertical separation');
console.log('PASS: runtime static, roof, terrain, water, active region and resident render-independence');
