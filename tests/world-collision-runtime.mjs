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
  return {addBox,addCyl,addRoof,inside,local,query,playerFloor,playerCeiling,playerContacts,playerContact,
    roofInFoot,roofInOuter,roofSurfaceLocal,roofHeight,roofOverhangTop,playerTerrain,heightfieldTriangle,
    install(v){WorldCollision=v;}};`)();
const bridge=createRuntimeCollisionBridge({...env,stairUV:(s,x,z)=>[x-s.a[0],z-s.a[1],s.b[0]-s.a[0]],stairMinV:-1,stairMaxV:1});
env.install(bridge);bridge.setRegion('lab');
const profile={radius:.35,height:1.72};
const b=env.addBox({cx:0,cy:1,cz:0,hx:1,hy:1,hz:2,yaw:Math.PI/6,walk:false});
const c=env.addCyl({x:5,z:0,r:1,y0:0,y1:2,walk:true});
const second=env.addBox({cx:-5,cy:1,cz:0,hx:1,hy:1,hz:1,yaw:0,walk:true});
assert.notEqual(b.collisionId,second.collisionId);
assert.equal(bridge.get(b.collisionId).regionId,'lab');
const compareFloor=(x,z,maxY,radius=.35,solids=null)=>{
 env.install(null);
 const legacy=env.playerFloor(x,z,maxY,radius,solids);
 env.install(bridge);
 const migrated=env.playerFloor(x,z,maxY,radius,solids);
 assert.equal(migrated,legacy,'registered solid support must match original floor for '+[x,z,maxY,radius]);
};
for(const [x,z,maxY,r] of [[0,0,2.48,.35],[0,0,1,.35],[.95,1,2.48,.35],[5,0,2.48,.35],[6.1,0,2.48,.35],[6.1,0,2.48,0],[-5,0,2.48,.35]])compareFloor(x,z,maxY,r);
compareFloor(0,0,2.48,.35,[...env.query(0,0,.35)]);

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
for(const [x,z,maxY] of [[12,0,4.2],[14.5,0,3.5],[14.5,0,2.9]])compareFloor(x,z,maxY);
const overhead=env.addBox({cx:0,cy:4,cz:0,hx:1.5,hy:1,hz:1.5,yaw:0,walk:false});
const compareCeiling=(x,z,y,targetY,solids=null)=>{
 env.install(null);
 const original=env.playerCeiling(x,z,y,targetY,solids);
 env.install(bridge);
 const migrated=env.playerCeiling(x,z,y,targetY,solids);
 assert.equal(migrated,original,'headroom underside must remain exact across overlap and eaves');
};
for(const [x,z,y,targetY] of [[0,0,1,2],[0,0,1,1.05],[.85,.8,1,2],[3,0,1,2],[12,0,1,3.5],[14.5,0,1,2.5]])compareCeiling(x,z,y,targetY);
compareCeiling(0,0,1,2,[...env.query(0,0,.35)]);
const ceilingHit=bridge.staticCeiling(0,0,1,2);
assert.equal(ceilingHit?.instanceId,overhead.collisionId);
assert.deepEqual(ceilingHit.geometricNormal,[0,-1,0]);

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

assert.equal(bridge.sampleWater([25,-2,0],profile)?.instanceId,water.id);
assert.equal(bridge.sampleWater([30,-2,0],profile),null);
bridge.suspendRegion('lab');
assert.equal(bridge.sampleWater([25,-2,0],profile),null);
bridge.resumeRegion('lab');
assert.equal(bridge.sampleWater([25,-2,0],profile)?.instanceId,water.id);
assert.throws(()=>bridge.water({collisionId:water.id,contains:()=>true,surfaceAt:()=>0,bottomAt:()=>-1,bounds:{center:[0,-.5,0],half:[1,.5,1]}}),/duplicate/);
const explicit=bridge.terrain({collisionId:'lab:explicit-terrain',heights:new Float64Array(9),gridN:3,cell:2,half:2});
assert.equal(explicit.id,'lab:explicit-terrain');
const indexBefore=bridge.debugSnapshot().analyticalIndex;
const far=[];
for(let i=0;i<80;i++)far.push(bridge.water({collisionId:'far:'+i,contains:()=>{throw Error('far geometry must not be sampled')},surfaceAt:()=>0,bottomAt:()=>-1,bounds:{center:[1000+i*64,-.5,1000],half:[1,.5,1]}}));
assert.equal(bridge.sampleWater([25,-2,0],profile)?.instanceId,water.id);
assert(bridge.debugSnapshot().analyticalIndex.cells>indexBefore.cells);
for(const h of far)assert(bridge.remove(h.id));
assert.deepEqual(bridge.debugSnapshot().analyticalIndex,indexBefore);
const wide=bridge.water({collisionId:'large-water',contains:(x,z)=>x<0&&z<0,surfaceAt:()=>0,bottomAt:()=>-2,bounds:{center:[-2000,-1,-2000],half:[2000,1,2000]}});
assert.equal(bridge.debugSnapshot().analyticalIndex.largeSources,indexBefore.largeSources+1);
assert.equal(bridge.sampleWater([-100,-1,-100],profile)?.instanceId,wide.id);
assert(bridge.remove(wide.id));
assert.equal(bridge.sampleWater([-100,-1,-100],profile),null);
assert.deepEqual(bridge.debugSnapshot().analyticalIndex,indexBefore);
const diagonalBridge=createRuntimeCollisionBridge({...env,stairUV:(s,x,z)=>{
 const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],len=Math.hypot(dx,dz),px=x-s.a[0],pz=z-s.a[1];
 return [(px*dx+pz*dz)/len,px*s.n[0]+pz*s.n[1],len];
},stairMinV:.02,stairMaxV:2});
diagonalBridge.setRegion('stair-fixture');
const d=Math.SQRT1_2,flight={collisionId:'lab:diagonal-stair',a:[40,40],b:[46,46],n:[d,-d],y0:0,y1:2};
const sh=diagonalBridge.stair(flight);
assert.equal(sh.id,flight.collisionId);
const bounds=diagonalBridge.get(sh.id).shapes[0].worldBounds;
assert(bounds.max[0]-bounds.min[0]<8&&bounds.max[2]-bounds.min[2]<8);
const hit=diagonalBridge.support([43+d,2,43-d],profile);
assert.equal(hit?.instanceId,sh.id);
assert.equal(diagonalBridge.support([39,2,39],profile),null);

assert.equal(env.roofHeight(12,0),4);
assert.equal(env.roofOverhangTop(14.5,0,3.5),3+1*(1-2.5/3));
assert.equal(env.roofOverhangTop(14.5,0,2.9),-Infinity);
bridge.suspendRegion('lab');
assert.equal(env.roofHeight(12,0),-Infinity);
assert.equal(env.roofOverhangTop(14.5,0),-Infinity);
bridge.resumeRegion('lab');
assert.equal(env.roofHeight(12,0),4);
assert.equal(bridge.surfaceAt(-1.5,-1.5,'terrain')?.point[1],.5);
assert.equal(env.heightfieldTriangle(-1.5,-1.5),.5);
const secondFlight={...flight,collisionId:'lab:diagonal-stair-high',y0:10,y1:12};
diagonalBridge.stair(secondFlight);
assert.equal(diagonalBridge.surfaceAt(43+d,43-d,'stair')?.instanceId,sh.id,'first authored flight wins as in legacy');
assert.equal(diagonalBridge.surfaceAt(39,39,'stair'),null);
console.log('PASS: runtime static, roof, terrain, water, active region, resident render-independence, analytical index, IDs and migrated surface consumers');
