import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRuntimeCollisionBridge} from '../src/core/world-collision-runtime.js';

// Exercise the actual renderer's existing registration/probe functions, not
// a lookalike collision implementation.
const src=readFileSync(new URL('../src/render/world-render.part.js',import.meta.url),'utf8');
const start=src.indexOf('var CELL = 32;'),end=src.indexOf('function collidersAt(',start);
assert(start>=0&&end>start,'renderer extraction markers');
const env=Function(`const PLAYER={radius:.35,body:1.72,step:.48},HALF=20,CFG={cell:20},GRID_N=3,
  World={H:new Float64Array(9)},clamp2=(v,a,b)=>Math.max(a,Math.min(b,v)),
  stairSurface=()=>null,sample=()=>0;
  ${src.slice(start,end)}
  return {addBox,addCyl,addRoof,inside,local,query,playerFloor,playerCeiling,playerContacts,playerContact,
    roofInFoot,roofInOuter,roofSurfaceLocal,roofHeight,roofOverhangTop,playerTerrain,heightfieldTriangle,
    bodyBlockedAt,pushOut,occupiedAt,playerSteepGround,playerSweepColliders,playerSafeSpawn,install(v){WorldCollision=v;}};`)();
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

// T3: all legacy body probes must respect the same live registration state.
assert(env.bodyBlockedAt(0,0,0));
assert(env.occupiedAt(0,0,0));
const pushed={x:0,y:0,z:0};env.pushOut(pushed,.35,1.72);
assert(Math.hypot(pushed.x,pushed.z)>0);
bridge.suspendRegion('lab');
assert(!env.bodyBlockedAt(0,0,0));
assert(!env.occupiedAt(0,0,0));
const suspended={x:0,y:0,z:0};env.pushOut(suspended,.35,1.72);
assert.deepEqual(suspended,{x:0,y:0,z:0});
bridge.resumeRegion('lab');
assert(env.bodyBlockedAt(0,0,0));
bridge.setRegion('other');
assert(!env.bodyBlockedAt(0,0,0));
bridge.setRegion('lab');
assert(bridge.remove(b.collisionId));
assert(!env.bodyBlockedAt(0,0,0),'removed registration must not revive through stale grid record');
const slopeBridge=createRuntimeCollisionBridge({...env,stairUV:()=>[0,0,1],stairMinV:-1,stairMaxV:1});
slopeBridge.setRegion('motion-lab');
slopeBridge.labSurface({collisionId:'motion-lab:test-ground',bounds:{min:[-10,-10,-10],max:[10,10,10]},sample:(x,z)=>{
 const k=x<0?Math.tan(Math.PI/6):Math.tan(Math.PI/3),n=Math.hypot(1,k);
 return {point:[x,2,z],featureId:x<0?'walk':'slide',geometricNormal:x===0?null:[-k/n,1/n,0]};
}});
assert.equal(slopeBridge.groundSlope(-1,0,2,50*Math.PI/180),null);
const exact=slopeBridge.groundSlope(1,0,2,50*Math.PI/180);
assert(Math.abs(exact.k-Math.tan(Math.PI/3))<1e-9&&exact.ux===1);
assert.equal(slopeBridge.groundSlope(0,0,2,50*Math.PI/180),undefined,'ambiguous seam retains fallback');
assert.equal(slopeBridge.groundSlope(1,0,3,50*Math.PI/180),undefined,'different support height cannot supply normal');
slopeBridge.suspendRegion('motion-lab');
assert.equal(slopeBridge.groundSlope(1,0,2,50*Math.PI/180),undefined);
console.log('PASS T3 active body probes, exact slope normal and unresolved seam fallback');

 // Actual Player candidate, registered geometric normal and renderer sweep.
const candidateSrc=gameplay.slice(gameplay.indexOf('  candidate(dx,dz){'),gameplay.indexOf('  blocked(x,z){'));
assert(candidateSrc.startsWith('  candidate(dx,dz){'));
const grade=Math.tan(Math.PI/3);
let registered=true,steep=true,atStair=false,ledge=false;
const surface=(x,z)=>ledge?(x>0?.3:0):x*(steep?grade:.5);
const candidateBridge=createRuntimeCollisionBridge({...env,stairUV:()=>[0,0,1],stairMinV:-1,stairMaxV:1});
candidateBridge.setRegion('motion-lab');
candidateBridge.labSurface({collisionId:'motion-lab:candidate-ground',bounds:{min:[-2,-4,-2],max:[2,4,2]},sample:(x,z)=>{
 const k=ledge?0:steep?grade:.5,n=Math.hypot(1,k);
 return {point:[x,surface(x,z),z],featureId:'candidate',geometricNormal:registered?[-k/n,1/n,0]:null};
}});
const candidate=Function('playerTerrain','playerFloor','stairSurface','WorldCollision',
 'const BOUND=100,CONTACT_SKIN=.002,PLAYER={step:.48,radius:.35},clamp2=(v,a,b)=>Math.max(a,Math.min(b,v)),roofHeight=()=>-Infinity,roofOverhangTop=()=>-Infinity,playerCeiling=(x,z,y,target)=>target,playerContacts=()=>[];return ({'+candidateSrc+'}).candidate;'
)(surface,(x,z)=>surface(x,z),()=>atStair?0:null,candidateBridge);
const actorOnSlope={pos:{x:0,y:0,z:0},onGround:true,swimming:false,nearby:[],solids:null};
const diagonalStep=candidate.call(actorOnSlope,.02,.08);
assert.equal(diagonalStep.contacts.length,1,'diagonal uphill on steep grade must not bypass walk limit');
assert.equal(diagonalStep.contacts[0].nx,-1);
assert.equal(Math.abs(diagonalStep.contacts[0].nz),0);
assert.equal(candidate.call(actorOnSlope,0,.08).contacts.length,0,'contour movement remains legal');
assert.equal(candidate.call(actorOnSlope,-.02,.08).contacts.length,0,'downhill candidate remains legal');
steep=false;
assert.equal(candidate.call(actorOnSlope,.08,0).contacts.length,0,'registered gentle slope remains walkable');
ledge=true;
assert.equal(candidate.call(actorOnSlope,.08,0).contacts.length,1,'flat destination does not authorize abrupt terrain rise');
ledge=false;steep=true;registered=false;
assert.equal(candidate.call(actorOnSlope,.08,0).contacts.length,1,'legacy steep direct approach still blocked');
registered=true;atStair=true;
assert.equal(candidate.call(actorOnSlope,.02,.08).contacts.length,0,'stair branch remains a step, not a slope');
env.install(bridge);
assert(env.playerSweepColliders(5,0,.35).includes(c),'active primitive enters sweep');
bridge.suspendRegion('lab');
assert(!env.playerSweepColliders(5,0,.35).includes(c),'suspended primitive excluded from sweep');
bridge.resumeRegion('lab');
assert(env.playerSweepColliders(5,0,.35).includes(c),'resumed primitive enters sweep');
console.log('PASS T3 exact uphill slope gate, contour preservation, discontinuity/stair fallback, active sweep candidates');

// T3: vertically stacked flights must resolve against the actor's height.
const stacked=createRuntimeCollisionBridge({...env,stairUV:(s,x,z)=>[x-s.a[0],z-s.a[1],s.b[0]-s.a[0]],stairMinV:-1,stairMaxV:1});
stacked.setRegion('stacked');
const upper={collisionId:'stacked:upper',a:[60,0],b:[66,0],n:[0,1],y0:5,y1:7};
const lower={...upper,collisionId:'stacked:lower',y0:0,y1:2};
stacked.stair(upper);stacked.stair(lower);
env.install(stacked);
const low=stacked.surfaceAt(62,0,'stair',3),high=stacked.surfaceAt(62,0,'stair',8);
assert.equal(low?.instanceId,lower.collisionId);
assert.equal(high?.instanceId,upper.collisionId);
assert.equal(stacked.surfaceAt(62,0,'stair')?.instanceId,upper.collisionId,'unbounded authored order preserved');
assert.equal(env.playerFloor(62,0,3),low.point[1]);
assert.equal(env.playerFloor(62,0,8),high.point[1]);
assert.equal(env.playerTerrain(62,0,3),low.point[1],'bounded tread');
assert.equal(env.playerTerrain(62,0,0),high.point[1],'no reachable tread keeps legacy rise barrier');
const actualCandidate=Function('playerTerrain','playerFloor','stairSurface','WorldCollision','playerCeiling','playerContacts','roofHeight','roofOverhangTop',
 'const BOUND=100,CONTACT_SKIN=.002,PLAYER={step:.48,radius:.35},clamp2=(v,a,b)=>Math.max(a,Math.min(b,v));return ({'+candidateSrc+'}).candidate;'
)(env.playerTerrain,env.playerFloor,()=>0,stacked,env.playerCeiling,env.playerContacts,env.roofHeight,env.roofOverhangTop);
const foot=env.playerFloor(61.69,0,3);
const stairActor={pos:{x:61.69,y:foot,z:0},onGround:true,swimming:false,nearby:[],solids:null};
const step=actualCandidate.call(stairActor,.08,0);
assert.equal(step.contacts.length,0,'lower stair not blocked by upper flight');
assert.equal(step.y,env.playerFloor(61.77,0,foot+.48+.002));
assert(step.y>foot,'test crosses a tread');
const cap=env.addBox({cx:61.69,cy:foot+1.72+.1+.1,cz:0,hx:.5,hy:.1,hz:.5,yaw:0,walk:false});
assert(actualCandidate.call(stairActor,.08,0).contacts.length>0,'insufficient origin headroom vetoes step');
assert(stacked.remove(cap.collisionId));
assert.equal(actualCandidate.call(stairActor,.08,0).contacts.length,0,'removed overhead no longer vetoes');
stacked.suspendRegion('stacked');
assert.equal(stacked.surfaceAt(62,0,'stair',3),null);
stacked.resumeRegion('stacked');
assert.equal(env.playerFloor(62,0,3),low.point[1]);
console.log('PASS T3 vertically stacked stair support, real candidate step, headroom and active region');


// Exercise complete fixed-tick Player, not just the candidate method.
const readPart=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const slicePart=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i);return s.slice(i,j);};
const three=new Function(readPart('src/vendor/three-gltf.part.js')+';return three_module_exports;')();
const playerEnv=Function('Vector3','Vector2','sample','stairSurface','waterLevel','normalAt','World','HALF','GRID_N','CFG','clamp2',
 slicePart(readPart('src/world/region.part.js'),'var PLAYER =','var ring =')+
 slicePart(src,'var CELL = 32;','function occupiedAt')+
 slicePart(gameplay,'var _n =','var CameraRig =')+
 'return {Player,query,inside,local,playerContact,roofInFoot,roofInOuter,roofSurfaceLocal,playerTerrain,playerSafeSpawn,install(v){WorldCollision=v;}};'
)(three.Vector3,three.Vector2,()=>0,()=>null,()=>-100,(x,z,v)=>v.set(0,1,0),{},0,0,{cell:2.5,seaLevel:0},(x,a,b)=>Math.max(a,Math.min(b,x)));
const liveStack=createRuntimeCollisionBridge({...playerEnv,stairUV:(s,x,z)=>[x-s.a[0],z-s.a[1],s.b[0]-s.a[0]],stairMinV:-1,stairMaxV:1});
liveStack.setRegion('stacked-player');liveStack.stair({...upper});liveStack.stair({...lower});
playerEnv.install(liveStack);
const neutral={move:()=>({x:0,y:0,mag:0}),run:()=>false,consumeJump:()=>false};
for(const flight of [lower,upper]){
 const y=liveStack.surfaceAt(62,0,'stair',flight.y1+.1).point[1];
 const actor=new playerEnv.Player();actor.teleport(62,0,0,0,y);
 assert.equal(actor.pos.y,y,'explicit saved height keeps the selected flight');
 assert(actor.onGround);
 for(let i=0;i<120;i++){
  actor.advance(1/120,neutral);
  assert.equal(actor.pos.y,y,'fixed-tick recovery must not switch floors');
  assert.equal(actor.renderPos.y,y,'rendered actor must remain on actual floor');
 }
}
assert.equal(playerEnv.playerTerrain(62,0,-1,true),0,'unreachable stair is not penetration ground');
assert.equal(playerEnv.playerTerrain(62,0,-1),high.point[1],'candidate retains legacy rise barrier');
console.log('PASS T3 saved height, actual fixed ticks and presentation retain stacked flight');

 
// T3 continuous static sweep: endpoints miss a shallow cylinder/OBB graze.
const sweepBridge=createRuntimeCollisionBridge({...env,stairUV:()=>[0,0,1],stairMinV:-1,stairMaxV:1});
sweepBridge.setRegion('sweep');env.install(sweepBridge);
const grazing=env.addCyl({x:20,z:0,r:.1,y0:0,y1:2,walk:false});
const gx=19.96,gz=.4475,dx=.08;
assert.equal(env.playerContacts(gx,gz,0).length,0);
assert.equal(env.playerContacts(gx+dx,gz,0).length,0);
const hits=sweepBridge.staticSweep(gx,gz,0,dx,0);
assert.equal(hits.length,1);
assert.equal(hits[0].collider,grazing);
assert(hits[0].toi>0&&hits[0].toi<.5);
assert(hits[0].nx<0&&hits[0].nz>0);
assert.equal(sweepBridge.staticSweep(gx,gz,2,dx,0).length,0,'support top is not a side obstacle');
assert.equal(sweepBridge.staticSweep(20,0,0,1,0).length,0,'existing overlap escape belongs to endpoint solver');
const sweptCandidate=Function('playerTerrain','playerFloor','stairSurface','WorldCollision','playerCeiling','playerContacts','roofHeight','roofOverhangTop',
 'const BOUND=100,CONTACT_SKIN=.002,PLAYER={step:.48,radius:.35},clamp2=(v,a,b)=>Math.max(a,Math.min(b,v));return ({'+candidateSrc+'}).candidate;'
)(env.playerTerrain,env.playerFloor,()=>null,sweepBridge,env.playerCeiling,env.playerContacts,env.roofHeight,env.roofOverhangTop);
const grazingActor={pos:{x:gx,y:0,z:gz},onGround:true,swimming:false,nearby:[],solids:env.playerSweepColliders(gx,gz,.45)};
assert.equal(sweptCandidate.call(grazingActor,dx,0).contacts[0].collider,grazing,'actual Player detects interior contact with clear endpoints');
sweepBridge.suspendRegion('sweep');
assert.equal(sweepBridge.staticSweep(gx,gz,0,dx,0,[grazing]).length,0,'cached inactive record excluded');
sweepBridge.resumeRegion('sweep');
assert.equal(sweepBridge.staticSweep(gx,gz,0,dx,0,[grazing]).length,1);
assert(sweepBridge.remove(grazing.collisionId));
assert.equal(sweepBridge.staticSweep(gx,gz,0,dx,0,[grazing]).length,0,'stale cached record excluded');
const ob=env.addBox({cx:25,cy:1,cz:0,hx:.1,hy:1,hz:.1,yaw:Math.PI/4,walk:false});
const world=(a,b)=>[25+a*ob.cos+b*ob.sin,-a*ob.sin+b*ob.cos];
const q=.3475/Math.SQRT2;
const [sx,sz]=world(.1+q-.04/Math.SQRT2,.1+q+.04/Math.SQRT2);
const [ex,ez]=world(.1+q+.04/Math.SQRT2,.1+q-.04/Math.SQRT2);
assert.equal(env.playerContacts(sx,sz,0).length,0);
assert.equal(env.playerContacts(ex,ez,0).length,0);
const corner=sweepBridge.staticSweep(sx,sz,0,ex-sx,ez-sz);
assert.equal(corner[0]?.collider,ob);
assert(corner[0].toi>0&&corner[0].toi<.5);
console.log('PASS T3 continuous static cylinder/rotated-box grazing, actual candidate and region lifecycle');


// T3: a flight above the actor must not erase underlying landing support.
{
 const overhead={collisionId:'overhead:flight',a:[72,0],b:[78,0],n:[0,1],y0:5,y1:7};
 const overheadBridge=createRuntimeCollisionBridge({...playerEnv,stairUV:(s,x,z)=>[x-s.a[0],z-s.a[1],s.b[0]-s.a[0]],stairMinV:-1,stairMaxV:1});
 overheadBridge.setRegion('overhead');overheadBridge.stair(overhead);
 playerEnv.install(overheadBridge);
 const under=new playerEnv.Player();under.teleport(74,0,0,0,0);
 assert.equal(under.pos.y,0,'saved ground position beneath unreachable flight');
 under.pos.y=.8;under.previousPos.copy(under.pos);under.onGround=false;under.vel.y=-1;
 for(let i=0;i<120;i++)under.advance(1/120,neutral);
 assert.equal(under.pos.y,0,'airborne actor lands on actual ground beneath upper flight');
 assert(under.onGround);
 assert(Math.abs(under.renderPos.y)<1e-6,'presentation converges on actual landed ground');
 assert(playerEnv.playerTerrain(74,0,.48)>5,'horizontal authored stair barrier remains separate');
 const slopeUnder=createRuntimeCollisionBridge({...env,stairUV:(s,x,z)=>[x-s.a[0],z-s.a[1],s.b[0]-s.a[0]],stairMinV:-1,stairMaxV:1});
 slopeUnder.setRegion('slope-under');
 slopeUnder.terrain({collisionId:'slope-under:terrain',heights:new Float64Array([-40,0,40,-40,0,40,-40,0,40]),gridN:3,cell:20,half:20});
 slopeUnder.stair({...overhead,collisionId:'slope-under:flight',a:[-2,0],b:[4,0]});
 env.install(slopeUnder);
 assert.equal(env.playerFloor(0,0,.002),0,'registered underlying terrain remains support');
 const underGrade=env.playerSteepGround(0,0,0);
 assert(underGrade&&Math.abs(underGrade.k-2)<1e-9&&Math.abs(underGrade.ux-1)<1e-9,'unreachable overhead stair cannot make steep terrain walkable');
 console.log('PASS T3 underlying ground landing and slope beneath unreachable flight');
}


// T3: automatic spawn must not choose a stale or inactive walkable proxy.
{
 const spawnBridge=createRuntimeCollisionBridge({...env,stairUV:()=>[0,0,1],stairMinV:-1,stairMaxV:1});
 spawnBridge.setRegion('spawn-low');env.install(spawnBridge);
 const low=env.addBox({cx:90,cy:.5,cz:0,hx:1,hy:.5,hz:1,yaw:0,walk:true});
 spawnBridge.setRegion('spawn-high');
 env.addBox({cx:90,cy:3.5,cz:0,hx:1,hy:.5,hz:1,yaw:0,walk:true});
 assert.equal(env.playerSafeSpawn(90,0).y,4,'active upper walkable box supplies automatic spawn');
 spawnBridge.setRegion('spawn-low');
 assert.equal(env.playerSafeSpawn(90,0).y,1,'different-region upper box cannot select spawn height');
 spawnBridge.suspendRegion('spawn-low');
 assert.equal(env.playerSafeSpawn(90,0).y,0,'suspended region has no walkable spawn box');
 spawnBridge.resumeRegion('spawn-low');
 assert.equal(env.playerSafeSpawn(90,0).y,1,'resumed platform is usable again');
 assert(spawnBridge.remove(low.collisionId));
 assert.equal(env.playerSafeSpawn(90,0).y,0,'removed proxy cannot select spawn height even if grid still contains it');
 spawnBridge.setRegion('spawn-high');
 assert.equal(env.playerSafeSpawn(90,0).y,4,'active upper platform remains usable');
 env.install(null);
 assert.equal(env.playerSafeSpawn(90,0).y,4,'legacy extraction retains unregistered behavior');
 console.log('PASS T3 automatic spawn respects registered region and removed proxy');
}


// T3: resident and registered static sweep share the earliest contact rule.
{
 const mixed=createRuntimeCollisionBridge({...env,stairUV:()=>[0,0,1],stairMinV:-1,stairMaxV:1});
 mixed.setRegion('mixed-sweep');env.install(mixed);
 const resident={def:{scale:1},x:40,z:0,y:0,hidden:false,ch:null};
 const x=39.96,z=.6175,dx=.08;
 const p={pos:{x,y:0,z},onGround:true,swimming:false,solids:[]};
 p.nearby=residentContacts.call({list:[resident]},p);
 assert.equal(p.nearby.length,1);
 assert.equal(env.playerContacts(x,z,0,p.nearby).length,0);
 assert.equal(env.playerContacts(x+dx,z,0,p.nearby).length,0);
 const candidate=Function('playerTerrain','playerFloor','stairSurface','WorldCollision','playerCeiling','playerContacts','roofHeight','roofOverhangTop',
  'const BOUND=100,CONTACT_SKIN=.002,PLAYER={step:.48,radius:.35,body:1.72},clamp2=(v,a,b)=>Math.max(a,Math.min(b,v));return ({'+candidateSrc+'}).candidate;'
 )(env.playerTerrain,env.playerFloor,()=>null,mixed,env.playerCeiling,env.playerContacts,env.roofHeight,env.roofOverhangTop);
 const contact=candidate.call(p,dx,0).contacts[0];
 assert(contact&&contact.collider===p.nearby[0],'actual Player cannot cross resident with both endpoints clear');
 assert(contact.toi>0&&contact.toi<.5&&contact.nx<0&&contact.nz>0);
 assert.equal(mixed.staticSweep(x,z,2,dx,0,[],.35,1.72,p.nearby).length,0,'vertical separation');
 assert.equal(mixed.staticSweep(40,0,0,dx,0,[],.35,1.72,p.nearby).length,0,'existing overlap may escape');
 assert.equal(mixed.staticSweep(x,z,0,0,0,[],.35,1.72,p.nearby).length,0,'stationary sweep');
 const later=env.addCyl({x:40.02,z:0,r:.27,y0:0,y1:2,walk:false});
 const staticHit=mixed.staticSweep(x,z,0,dx,0,[later])[0];
 assert(staticHit&&staticHit.toi>contact.toi);
 assert.equal(mixed.staticSweep(x,z,0,dx,0,[later],.35,1.72,p.nearby)[0].collider,p.nearby[0],'earliest resident wins across populations');
 const earlier=env.addCyl({x:39.94,z:0,r:.27,y0:0,y1:2,walk:false});
 const first=mixed.staticSweep(x,z,0,dx,0,[earlier],.35,1.72,p.nearby);
 // This earlier cylinder is already overlapping the origin, so it does not
 // override a new contact. A coincident static produces a simultaneous hit.
 assert.equal(first[0].collider,p.nearby[0]);
 const coincident=env.addCyl({x:40,z:0,r:.27,y0:0,y1:2,walk:false});
 const tied=mixed.staticSweep(x,z,0,dx,0,[coincident],.35,1.72,p.nearby);
 assert.equal(tied.length,2);
 assert(tied.some(c=>c.collider===coincident)&&tied.some(c=>c.collider===p.nearby[0]));
 resident.hidden=true;
 p.nearby=residentContacts.call({list:[resident]},p);
 assert.equal(candidate.call(p,dx,0).contacts.length,0,'inactive resident not swept');
 console.log('PASS T3 shared static/resident narrow phase, actual candidate, earliest contact, overlap escape and inactive residents');
}

// LIVE-B21 triangular sidewall, not the solid landing platform.
const wedge={x:50,z:0,width:7,height:6,run:6,angle:45};
bridge.setRegion('motion-lab');
bridge.labSurface({collisionId:'sidewall-regression',bounds:{min:[45,0,-7],max:[55,6,1]},sample:()=>null,ramps:[wedge]});
for(const side of [-1,1]){
 const edge=wedge.x+side*wedge.width/2,from=edge+side*.8;
 const contact=bridge.labSideSweep(from,-3,0,-side*1.1,0,.35,1.72);
 assert.equal(contact.length,1);
 assert(Math.abs(contact[0].toi-(.8-.348)/1.1)<.00001);
 assert(Math.abs(contact[0].nx-side)<1e-6);
 assert.equal(bridge.labSideSweep(edge+side*.5,-3,0,side*.4,0).length,0);
 assert.equal(bridge.labSideSweep(edge+side*.2,-3,0,side*.4,0).length,0);
 assert(bridge.labSideSweep(edge+side*.2,-3,0,-side*.05,0).length>0);
 assert.equal(bridge.labSideSweep(edge+side*.8,-3,3.5,-side*1.1,0).length,0);
 assert.equal(bridge.labSideSweep(edge-side*.1,-3,3,side*.5,0).length,0);
 assert.equal(bridge.labSideSweep(edge+side*.5,-3,0,0,-.4).length,0);
}
assert.equal(bridge.labSideSweep(50,.5,0,0,-1).length,0);
bridge.setRegion('lab');
assert.equal(bridge.labSideSweep(54.3,-3,0,-1.1,0).length,0);
console.log('PASS LIVE-B21 triangular sidewall radius, clearance, escape and ramp entry');


 // T3 geometry generalization: actual terrain registration outside the lab.
 // A faceted outline supplies world-space boundaries without a ramp category.
 {
  const curved=createRuntimeCollisionBridge({...env,stairUV:()=>[0,0,1],stairMinV:-1,stairMaxV:1});
  curved.setRegion('natural-geometry');
  const heights=Float64Array.from({length:25},(_,i)=>.55*(i%5-2)**2);
  const faces=[{a:[0,2,-1],b:[1,2,0],bottom:0},{a:[1,2,0],b:[0,2,1],bottom:0}];
  const h=curved.terrain({collisionId:'natural:curve',heights,gridN:5,cell:1,half:2,boundaryFaces:faces});
  env.install(curved);
  for(const x of [.25,1.25]){
   const y=env.playerFloor(x,.1,10);
   const grade=env.playerSteepGround(x,.1,y);
   if(x<1)assert.equal(grade,null,'gentle segment of curved heightfield');
   else assert(grade&&Math.abs(grade.k-1.65)<1e-8,'steep segment of the same heightfield');
  }
  for(const side of [-1,1]){
   const n=Math.SQRT1_2,ox=.5+n*.8,oz=side*(.5+n*.8);
   const hit=curved.surfaceBoundarySweep(ox,oz,0,-n*1.1,-side*n*1.1);
   assert.equal(hit.length,1,'rotated faceted boundary blocks outside the lab');
   assert(Math.abs(hit[0].toi-(.8-.348)/1.1)<1e-5);
   assert(Math.abs(hit[0].nx-n)<1e-6&&Math.abs(hit[0].nz-side*n)<1e-6);
   assert.equal(curved.labSideSweep(ox,oz,0,-n*1.1,-side*n*1.1).length,1,'existing Player caller consumes generic query');
   assert.equal(curved.surfaceBoundarySweep(ox,oz,2.1,-n*1.1,-side*n*1.1).length,0,'above face clearance');
   assert.equal(curved.surfaceBoundarySweep(ox,oz,0,n*.5,side*n*.5).length,0,'outward motion');
  }
  curved.suspendRegion('natural-geometry');
  assert.equal(curved.surfaceBoundarySweep(1.1,-1.1,0,-.8,.8).length,0,'suspended boundary');
  curved.resumeRegion('natural-geometry');
  assert(curved.surfaceBoundarySweep(1.1,-1.1,0,-.8,.8).length>0,'resumed boundary');
  assert(curved.remove(h.id));
  assert.equal(curved.surfaceBoundarySweep(1.1,-1.1,0,-.8,.8).length,0,'removed boundary');
  env.install(null);
 }
 console.log('PASS T3 natural heightfield grade and oriented vertical boundary lifecycle');


 // Same runtime candidate, nonprimitive closed obstacle with slanted faces.
 {
  const meshBridge=createRuntimeCollisionBridge({...env,stairUV:()=>[0,0,1],stairMinV:-1,stairMaxV:1});
  meshBridge.setRegion('irregular-solid');env.install(meshBridge);
  const a=[0,0,-1],b=[0,0,1],c=[1,2,0],d=[-1,0,0];
  const triangles=[[a,b,c],[a,c,d],[b,d,c],[a,d,b]];
  // Force multiple BVH leaves while retaining a known local tetrahedron.
  for(let i=1;i<=20;i++)for(const t of triangles.slice(0,4))triangles.push(t.map(p=>[p[0]+20*i,p[1],p[2]]));
  const h=meshBridge.triangleMesh({collisionId:'irregular:rock',triangles});
  assert.equal(meshBridge.get(h.id).shapes[0].type,'triangleMesh');
  assert.equal(meshBridge.get(h.id).shapes[0].policy.support,false);
  const hits=meshBridge.surfaceBoundarySweep(1.8,0,0,-2,0);
  assert(hits.length>0,'slanted solid intersects the upper body before the feet reach it');
  assert(Math.abs(hits[0].toi-(1.8-.859-.348)/2)<1e-5,'exact horizontal sweep of height-clipped slanted face');
  assert(hits[0].nx>.999999&&Math.abs(hits[0].nz)<1e-6);
  assert(hits[0].geometricNormal.every(Number.isFinite));
  assert.equal(meshBridge.surfaceBoundarySweep(1.8,0,2.1,-2,0).length,0,'above mesh');
  assert.equal(meshBridge.surfaceBoundarySweep(1.8,0,-2,-2,0).length,0,'below mesh');
  assert(meshBridge.surfaceBoundarySweep(0,1.6,0,0,-2).length>0,'approach from a different heading');
  assert(meshBridge.surfaceBoundarySweep(21.8,0,0,-2,0).length>0,'another BVH leaf is queried');
  assert.equal(meshBridge.surfaceBoundarySweep(1.1,0,0,.4,0).length,0,'existing overlap can escape');
  assert(meshBridge.surfaceBoundarySweep(1.1,0,0,-.1,0).length>0,'existing overlap cannot deepen');
  const candidate=Function('playerTerrain','playerFloor','stairSurface','WorldCollision','playerCeiling','playerContacts','roofHeight','roofOverhangTop',
   'const BOUND=100,CONTACT_SKIN=.002,PLAYER={step:.48,radius:.35,body:1.72},clamp2=(v,a,b)=>Math.max(a,Math.min(b,v));return ({'+candidateSrc+'}).candidate;'
  )(env.playerTerrain,env.playerFloor,()=>null,meshBridge,env.playerCeiling,env.playerContacts,env.roofHeight,env.roofOverhangTop);
  const actor={pos:{x:1.8,y:0,z:0},onGround:true,swimming:false,nearby:[],solids:[]};
  assert(candidate.call(actor,-2,0).contacts.some(q=>q.instanceId===h.id),'actual Player candidate uses the new geometry query');
  assert.equal(candidate.call(actor,.1,0).contacts.length,0,'outward candidate remains legal');
  meshBridge.suspendRegion('irregular-solid');
  assert.equal(meshBridge.surfaceBoundarySweep(1.8,0,0,-2,0).length,0);
  meshBridge.resumeRegion('irregular-solid');
  assert(meshBridge.surfaceBoundarySweep(1.8,0,0,-2,0).length>0);
  assert(meshBridge.remove(h.id));
  assert.equal(meshBridge.surfaceBoundarySweep(1.8,0,0,-2,0).length,0);
  assert.throws(()=>meshBridge.triangleMesh({triangles:[[a,a,b]]}),/degenerate/);
  env.install(null);
 }
 console.log('PASS T3 triangle geometry, slanted body contact, BVH, actual Player candidate and lifecycle');


 // Continuous nonprimitive support and radius-aware sloped headroom.
 {
  const m=createRuntimeCollisionBridge({...env,stairUV:()=>[0,0,1],stairMinV:-1,stairMaxV:1});
  m.setRegion('mesh-walk');env.install(m);
  const strip=(x0,y0,x1,y1,z0=-2,z1=2)=>[
   [[x0,y0,z0],[x0,y0,z1],[x1,y1,z0]],[[x1,y1,z0],[x0,y0,z1],[x1,y1,z1]]
  ];
  const h=m.triangleMesh({collisionId:'mesh:continuous',triangles:[...strip(0,0,2,1),...strip(2,1,4,4),...strip(4,4,6,4)],support:true});
  assert.equal(m.get(h.id).shapes[0].policy.support,true);
  assert.equal(env.playerFloor(1,.2,2),.5);
  assert.equal(env.playerFloor(1,.2,.2),0,'unreachable mesh preserves ground');
  assert.equal(env.playerSteepGround(1,.2,.5),null);
  const steep=env.playerSteepGround(3,.2,2.5);
  assert(steep&&Math.abs(steep.k-1.5)<1e-8&&steep.ux>.999);
  assert(m.meshSlope(2,0,1,50*Math.PI/180)?.k>1.49,'crease retains actual steep incident normal');
  assert.equal(m.support([1,.5,.2],{radius:.35,height:1.72}).instanceId,h.id);
  const candidate=Function('playerTerrain','playerFloor','stairSurface','WorldCollision','playerCeiling','playerContacts','roofHeight','roofOverhangTop',
   'const BOUND=100,CONTACT_SKIN=.002,PLAYER={step:.48,radius:.35,body:1.72},clamp2=(v,a,b)=>Math.max(a,Math.min(b,v));return ({'+candidateSrc+'}).candidate;'
  )(env.playerTerrain,env.playerFloor,()=>null,m,env.playerCeiling,env.playerContacts,env.roofHeight,env.roofOverhangTop);
  const actor={pos:{x:1,y:.5,z:.2},onGround:true,swimming:false,nearby:[],solids:[]};
  const up=candidate.call(actor,.08,0);assert.equal(up.contacts.length,0,'gentle mesh ascent '+JSON.stringify(up));assert(Math.abs(up.y-.54)<1e-8);
  actor.pos={x:2.2,y:1.3,z:.2};
  assert(candidate.call(actor,.08,0).contacts.length>0,'steep uphill blocked');
  actor.onGround=false;
  assert.equal(candidate.call(actor,-.08,0).contacts.length,0,'steep downhill allowed');
  const overhead=m.triangleMesh({collisionId:'mesh:overhead',triangles:strip(10,3,12,4).map(t=>[...t].reverse()),support:true});
  const ceiling=env.playerCeiling(11,0,0,3);
  assert(Math.abs(ceiling-(3.5-.35*.5-1.72-.002))<1e-5,'sloped underside clearance '+ceiling);
  assert.equal(env.playerCeiling(13,0,0,3),3);
  assert.equal(env.playerFloor(11,0,8),0,'underside is not a floor');
  m.suspendRegion('mesh-walk');assert.equal(env.playerFloor(1,.2,2),0);assert.equal(env.playerCeiling(11,0,0,3),3);
  m.resumeRegion('mesh-walk');assert.equal(env.playerFloor(1,.2,2),.5);
  assert(m.remove(overhead.id));assert.equal(env.playerCeiling(11,0,0,3),3);
  env.install(null);
 }
 console.log('PASS T3 triangle mesh support, grade, Player ascent/descent, underside radius and region lifecycle');
