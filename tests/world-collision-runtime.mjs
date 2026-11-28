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
 'return {Player,addBox,query,inside,local,playerContact,playerContacts,traversalStart,traversalSide,traversalBody,traversalPathClear,traversalAttempt,traversalMemo,TRAVERSE_QUERY_LIMIT,roofInFoot,roofInOuter,roofSurfaceLocal,playerTerrain,playerSafeSpawn,addCyl,install(v){WorldCollision=v;},lab(f){playerTerrain=f.height;sample=f.height;stairSurface=f.stairHeight;waterLevel=f.waterLevel;}};'
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

 // Existing renderer endpoint and spawn probes must see mesh faces too.
 {
  const m=createRuntimeCollisionBridge({...env,stairUV:()=>[0,0,1],stairMinV:-1,stairMaxV:1});
  m.setRegion('mesh-overlap');env.install(m);
  const a=[0,0,-2],b=[0,2,-2],c=[0,2,2],d=[0,0,2];
  const h=m.triangleMesh({collisionId:'mesh:wall',triangles:[[a,b,c],[a,c,d]]});
  const p=env.playerContacts(.2,0,0);
  assert(p.length>0,'stationary body must see the same mesh faces as the sweep');
  assert(p.every(q=>q.instanceId===h.id&&q.nx>.999&&Math.abs(q.depth-.15)<1e-8));
  assert(env.playerContacts(.25,0,0).some(q=>p.some(k=>q.collider===k.collider&&q.depth<k.depth)),'stable face identity permits decreasing overlap');
  assert.equal(env.playerContacts(.4,0,0).length,0);
  assert.equal(env.playerContacts(.2,0,2.1).length,0);
  assert.equal(env.playerContacts(.2,0,-2).length,0);
  const spawn=env.playerSafeSpawn(.2,0,0);
  assert.equal(env.playerContacts(spawn.x,spawn.z,spawn.y).length,0,'spawn search rejects partial mesh intersection');
  assert(Math.abs(spawn.x-.2)+Math.abs(spawn.z)>.01);
  const candidate=Function('playerTerrain','playerFloor','stairSurface','WorldCollision','playerCeiling','playerContacts','roofHeight','roofOverhangTop',
   'const BOUND=100,CONTACT_SKIN=.002,PLAYER={step:.48,radius:.35,body:1.72},clamp2=(v,a,b)=>Math.max(a,Math.min(b,v));return ({'+candidateSrc+'}).candidate;'
  )(env.playerTerrain,env.playerFloor,()=>null,m,env.playerCeiling,env.playerContacts,env.roofHeight,env.roofOverhangTop);
  const actor={pos:{x:.2,y:0,z:0},onGround:true,swimming:false,nearby:[],solids:[]};
  assert.equal(candidate.call(actor,.05,0).contacts.length,0,'actual Player can escape existing shallow overlap');
  assert(candidate.call(actor,-.05,0).contacts.length>0,'actual Player cannot deepen overlap');
  m.suspendRegion('mesh-overlap');assert.equal(env.playerContacts(.2,0,0).length,0);
  m.resumeRegion('mesh-overlap');assert(env.playerContacts(.2,0,0).length>0);
  assert(m.remove(h.id));assert.equal(env.playerContacts(.2,0,0).length,0);
  env.install(null);
 }
 console.log('PASS T3 mesh endpoint overlap, stable identity, safe spawn and region lifecycle');

// Rendered fixture topology, transform and actual Player/renderer support parity.
{
 const hs=gameplay.indexOf('function renderedCollisionTriangles('),he=gameplay.indexOf('function createMotionLabFixtures(',hs);
 class Attr{constructor(a,n){this.a=a;this.count=a.length/n;this.n=n}getX(i){return this.a[i*this.n]}getY(i){return this.a[i*this.n+1]}getZ(i){return this.a[i*this.n+2]}}
 class Geometry{constructor(){this.attributes={}}setAttribute(k,v){this.attributes[k]=v}setIndex(a){this.index=new Attr(a,1)}computeVertexNormals(){}}
 const h=Function('BufferGeometry','Float32BufferAttribute',gameplay.slice(hs,he)+'return {renderedCollisionTriangles,curvedLabGeometry};')(Geometry,Attr);
 const tris=h.renderedCollisionTriangles(h.curvedLabGeometry(),{elements:[1,0,0,0,0,1,0,0,0,0,1,0,32,0,0,1]});
 assert.equal(tris.length,36);
 const edges=new Map();for(const t of tris)for(let k=0;k<3;k++){const a=t[k].join(','),b=t[(k+1)%3].join(','),key=[a,b].sort().join('|'),q=edges.get(key)??[0,0];q[0]++;q[1]+=a<b?1:-1;edges.set(key,q);}
 assert([...edges.values()].every(([n,w])=>n===2&&w===0));
 const m=createRuntimeCollisionBridge({...env,stairUV:()=>[0,0,1],stairMinV:-1,stairMaxV:1});m.setRegion('visible-fixture');env.install(m);
 m.triangleMesh({collisionId:'curve',triangles:tris,support:true});
 for(const [x,y,k] of [[33,.25,.25],[35,1.05,.55],[37,3.1,1.5],[39,4.6,0]]){const q=m.meshSupport(x,0,10);assert(Math.abs(q.point[1]-y)<1e-8);assert(Math.abs(Math.hypot(q.geometricNormal[0],q.geometricNormal[2])/q.geometricNormal[1]-k)<1e-8);assert(Math.abs(env.playerFloor(x,0,10)-y)<1e-8);}
 const seamCandidate=Function('playerTerrain','playerFloor','stairSurface','WorldCollision','playerCeiling','playerContacts','roofHeight','roofOverhangTop',
  'const BOUND=100,CONTACT_SKIN=.002,PLAYER={step:.48,radius:.35,body:1.72},clamp2=(v,a,b)=>Math.max(a,Math.min(b,v));return ({'+candidateSrc+'}).candidate;'
 )(env.playerTerrain,env.playerFloor,()=>null,m,env.playerCeiling,env.playerContacts,env.roofHeight,env.roofOverhangTop);
 // LIVE-B22: the capsule reaches the next triangle before its centre.
 for(const z of [-.9,0,.9])for(let i=3360;i<=3440;i+=4){
  const x=i/100,y=m.meshSupport(x,z,10).point[1];
  for(const dx of [-.04,.04]){
   const c=seamCandidate.call({pos:{x,y,z},onGround:true,swimming:false,nearby:[],solids:[]},dx,0);
   assert.equal(c.contacts.length,0,'walkable gradient seam '+[x,z,dx]);
  }
 }
 assert(seamCandidate.call({pos:{x:36.2,y:1.9,z:0},onGround:true,swimming:false,nearby:[],solids:[]},.04,0).contacts.length>0,'steep uphill remains blocked');
 assert(m.surfaceBoundarySweep(37,3.8,0,0,-1.2).length>0);assert.equal(m.surfaceBoundarySweep(37,3.8,5,0,-1.2).length,0);env.install(null);
}
console.log('PASS T3 rendered curved geometry topology and runtime support parity');

// LIVE-B23: exact rendered rock and authored collision policy, actual Player
// falling onto the crown, jumping again, and settling without a false air state.
{
 const make=Function('IcosahedronGeometry','Vector3','BufferGeometry','Float32BufferAttribute',
  slicePart(readPart('src/world/region.part.js'),'function mulberry32','var N3 =')+
  slicePart(gameplay,'function rockGeometry(','function rockMaterial(')+
  slicePart(gameplay,'function renderedCollisionTriangles(','function createMotionLabFixtures(')+
  'return {rockGeometry,renderedCollisionTriangles,curvedLabGeometry};'
 )(three.IcosahedronGeometry,three.Vector3,three.BufferGeometry,three.Float32BufferAttribute);
 const rock=Function(slicePart(gameplay,'const rock={','const rockObject=')+'return rock;')();
 const mat=new three.Matrix4().compose(new three.Vector3(rock.x,rock.y,rock.z),
  new three.Quaternion().setFromEuler(new three.Euler(rock.tilt,rock.rot,rock.tilt*.6)),
  new three.Vector3(rock.s*1.15,rock.s,rock.s));
 const rockTriangles=make.renderedCollisionTriangles(make.rockGeometry(101+rock.v*17),mat);
 const m=createRuntimeCollisionBridge({...playerEnv,stairUV:()=>[0,0,1],stairMinV:-1,stairMaxV:1});
 m.setRegion('motion-lab');playerEnv.install(m);
 const registration=gameplay.match(/WorldCollision\?\.triangleMesh\(\{collisionId:rock\.id,triangles:rockTriangles[^\n]*\);/);
 assert(registration,'live rock registration');
 Function('WorldCollision','rock','rockTriangles',registration[0])(m,rock,rockTriangles);
 for(const [dx,dz] of [[0,0],[-.5,0],[.5,0],[0,-.5],[0,.5]]){
  const x=rock.x+dx,z=rock.z+dz,actor=new playerEnv.Player();
  actor.teleport(x,z,0,0,5);
  for(let i=0;i<180;i++)actor.advance(1/60,neutral,[]);
  const y=actor.pos.y,hit=m.meshSupport(x,z,10);
  assert(actor.onGround&&hit&&Math.abs(y-hit.point[1])<1e-6,'real rock must provide stable ground '+[x,z,y]);
  assert.equal(m.meshContacts(x,z,y).length,0,'landed body remains clear');
  actor.advance(1/60,{...neutral,consumeJump:()=>true},[]);
  assert(!actor.onGround&&actor.vel.y>0,'rock landing grants ordinary jump');
  for(let i=0;i<180;i++)actor.advance(1/60,neutral,[]);
  assert(actor.onGround&&Math.abs(actor.pos.y-y)<1e-6,'jump returns to rock support');
 }
 // LIVE-B22: full fixed-tick route through the real gradient change.
 m.triangleMesh({collisionId:'curve',triangles:make.renderedCollisionTriangles(make.curvedLabGeometry(),new three.Matrix4().makeTranslation(32,0,0)),support:true});
 for(const z of [-.9,0,.9]){
  const actor=new playerEnv.Player();actor.teleport(33,z,-Math.PI/2,0,.25);
  const walk={...neutral,move:()=>({x:0,y:1,mag:1})};
  let latched=false,peak=0,land=0;
  for(let i=0;i<650;i++){
   actor.advance(1/60,walk,[]);
   if(actor.pos.x<35.5&&!latched)assert(actor.onGround,'walkable gradient route must retain support');
   latched||=actor.traversal?.kind==='latch';
   peak=Math.max(peak,actor.pos.y);if(actor.onGround)land=Math.max(land,actor.pos.y);
  }
  assert(latched&&land>=4.6-.003,'continuous curve must reach the actual summit '+JSON.stringify({z,latched,peak,land,pos:actor.pos.toArray()}));
 }
 playerEnv.install(null);
}
console.log('PASS T3 real rock support, repeat jump and fixed-tick walkable gradient route');


 // Closed-volume regression: the cylinder can be entirely inside a mesh.
 {
  const m=createRuntimeCollisionBridge({...env,stairUV:()=>[0,0,1],stairMinV:-1,stairMaxV:1});
  m.setRegion('closed-interior');env.install(m);
  const a=[-3,-1,-3],b=[3,-1,-3],c=[3,-1,3],d=[-3,-1,3],e=[-3,4,-3],f=[3,4,-3],g=[3,4,3],h=[-3,4,3];
  const tris=[[a,b,c],[a,c,d],[e,h,g],[e,g,f],[a,e,f],[a,f,b],[b,f,g],[b,g,c],[c,g,h],[c,h,d],[d,h,e],[d,e,a]];
  const mesh=m.triangleMesh({collisionId:'closed:volume',triangles:tris});
  const at=x=>env.playerContacts(x,0,0),q=at(2)[0];
  assert(q?.interior&&q.instanceId===mesh.id,'fully enclosed cylinder must report solid contact');
  assert(Math.abs(q.depth-1.35)<1e-8&&q.nx>.999);
  assert(at(2.1)[0].depth<q.depth,'inside escape reduces depth');
  assert.equal(m.surfaceBoundarySweep(2,0,0,.1,0).length,0,'short outward escape');
  assert(m.surfaceBoundarySweep(2,0,0,-.1,0).length>0,'cannot deepen interior');
  assert.equal(m.surfaceBoundarySweep(2.95,0,0,.1,0).length,0,'exit through wall from inside');
  assert(at(3.05).some(c=>c.collider===q.collider&&c.depth<q.depth),'stable recovery identity');
  assert(m.surfaceBoundarySweep(3.7,0,0,-.6,0).length>0,'outside cannot enter');
  assert.equal(at(3.5).length,0);assert.equal(env.playerContacts(0,0,4.1).length,0);
  assert(at(0).some(c=>c.interior),'diagonal seam counts once');
  assert(at(3).every(c=>!c.interior),'exact side boundary uses ordinary faces');
  const spawn=env.playerSafeSpawn(2,0,0);
  assert.equal(env.playerContacts(spawn.x,spawn.z,spawn.y).length,0,'safe spawn rejects enclosed body');
  const candidate=Function('playerTerrain','playerFloor','stairSurface','WorldCollision','playerCeiling','playerContacts','roofHeight','roofOverhangTop',
   'const BOUND=100,CONTACT_SKIN=.002,PLAYER={step:.48,radius:.35,body:1.72},clamp2=(v,a,b)=>Math.max(a,Math.min(b,v));return ({'+candidateSrc+'}).candidate;'
  )(env.playerTerrain,env.playerFloor,()=>null,m,env.playerCeiling,env.playerContacts,env.roofHeight,env.roofOverhangTop);
  const actor={pos:{x:2,y:0,z:0},onGround:true,swimming:false,nearby:[],solids:[]};
  assert.equal(candidate.call(actor,.1,0).contacts.length,0);
  assert(candidate.call(actor,-.1,0).contacts.length>0);
  actor.pos.x=2.95;assert.equal(candidate.call(actor,.1,0).contacts.length,0);
  m.suspendRegion('closed-interior');assert.equal(at(2).length,0);
  m.resumeRegion('closed-interior');assert(at(2).length>0);
  assert(m.remove(mesh.id));assert.equal(at(2).length,0);
  const sheet=m.triangleMesh({collisionId:'open:sheet',triangles:tris.slice(2,4)});
  assert.equal(at(2).length,0,'open mesh does not acquire volume semantics');
  assert(m.remove(sheet.id));env.install(null);
 }
 console.log('PASS T3 closed solid interior, seam, recovery, spawn and lifecycle');

 // Downward collision with a non-walkable triangle obstacle, including
 // radius-only contact and actual fixed-tick Player behavior.
 {
  const m=createRuntimeCollisionBridge({...playerEnv,stairUV:()=>[0,0,1],stairMinV:-1,stairMaxV:1});
  m.setRegion('vertical-mesh');playerEnv.install(m);
  const top=(x,y)=>[[[x-1,y,-1],[x-1,y,1],[x+1,y,-1]],[[x+1,y,-1],[x-1,y,1],[x+1,y,1]]];
  const a=m.triangleMesh({collisionId:'vertical:block',triangles:top(10,2.5)});
  const b=m.triangleMesh({collisionId:'vertical:lower',triangles:top(10,1)});
  assert.equal(m.meshSupport(10,0,4),null,'block-only does not become support');
  assert.equal(m.meshDescent(10,0,4,0)?.instanceId,a.id,'first downward hit');
  assert(Math.abs(m.meshDescent(10,0,4,0).limitY-2.5)<1e-6);
  assert.equal(m.meshDescent(11.2,0,4,0)?.instanceId,a.id,'footprint intersects beyond center');
  assert.equal(m.meshDescent(11.4,0,4,0),null,'footprint clear');
  assert.equal(m.meshDescent(10,0,2.4,2),null,'no retroactive contact above feet');
  assert.equal(m.meshDescent(10,0,2.5,2.4)?.limitY,2.5,'resting vertical collision');
  assert.equal(m.meshDescent(10,0,2.5,3),null,'upward motion separate');
  const actor=new playerEnv.Player();actor.teleport(10,0,0,0,4);
  actor.onGround=false;actor.vel.y=-12;
  for(let i=0;i<120;i++)actor.advance(1/120,neutral);
  assert(Math.abs(actor.pos.y-2.5)<1e-6,'actual Player cannot fall through block-only mesh');
  assert(!actor.onGround,'blocking-only does not grant a jump');
  const before=actor.pos.y;actor.advance(1/60,{...neutral,consumeJump:()=>true});
  assert.equal(actor.pos.y,before,'jump cannot start from block-only contact');
  const slope=m.triangleMesh({collisionId:'vertical:slope',triangles:[[[20,2,-1],[20,2,1],[22,3,-1]],[[22,3,-1],[20,2,1],[22,3,1]]]});
  assert(Math.abs(m.meshDescent(21,0,4,0).limitY-2.675)<1e-5,'sloped highest footprint point');
  const walk=m.triangleMesh({collisionId:'vertical:walk',triangles:top(30,2),support:true});
  assert.equal(m.meshDescent(30,0,4,0),null,'walkable mesh retains center support');
  assert.equal(m.meshSupport(30,0,4)?.instanceId,walk.id);
  m.suspendRegion('vertical-mesh');assert.equal(m.meshDescent(10,0,4,0),null);
  m.resumeRegion('vertical-mesh');assert.equal(m.meshDescent(10,0,4,0)?.instanceId,a.id);
  assert(m.remove(a.id));assert.equal(m.meshDescent(10,0,4,0)?.instanceId,b.id);
  assert(m.remove(b.id));assert.equal(m.meshDescent(10,0,4,0),null);
  assert(m.remove(slope.id));playerEnv.install(null);
 }
 console.log('PASS T3 downward triangle blocking, actual Player, non-walkable policy, footprint and lifecycle');

 // Spatial source broad phase: distant meshes must not enter the local
 // narrow phase. Check negative cell seam, overflow, region and removal.
 {
  const b=createRuntimeCollisionBridge({...env,query:()=>[]});
  b.setRegion('source-index');
  const wall=(x,z)=>[[[x,0,z-1],[x,2,z-1],[x,2,z+1]],[[x,0,z-1],[x,2,z+1],[x,0,z+1]]];
  const near=b.triangleMesh({collisionId:'index-near',triangles:wall(-32,0)});
  for(let i=0;i<300;i++)b.triangleMesh({collisionId:'index-far-'+i,triangles:wall(100+i*64,100)});
  const big=b.triangleMesh({collisionId:'index-large',triangles:[[[500,0,500],[500,2,500],[500,2,100000]]]});
  const sweep=()=>b.surfaceBoundarySweep(-34,0,0,4,0);
  assert.equal(sweep()[0]?.instanceId,near.id,'local sweep');
  assert(b.debugSnapshot().boundaryIndex.lastCandidates<=2,'local sweep should not enumerate distant sources');
  assert(b.contacts(-32.1,0,0).some(c=>c.instanceId===near.id));
  assert(b.debugSnapshot().boundaryIndex.lastCandidates<=2,'endpoint broad phase');
  assert.equal(b.surfaceBoundarySweep(498,600,0,4,0)[0]?.instanceId,big.id,'large overflow remains queryable');
  b.suspendRegion('source-index');assert.equal(sweep().length,0);
  b.resumeRegion('source-index');assert.equal(sweep()[0]?.instanceId,near.id);
  b.setRegion('other-index');assert.equal(sweep().length,0);
  b.setRegion('source-index');assert(b.remove(near.id));assert.equal(sweep().length,0);
  assert(b.remove(big.id));assert.equal(b.debugSnapshot().boundaryIndex.large,0);
 }
 console.log('PASS T3 spatial boundary source index, seam, overflow, region and removal');


 // Geometry mantle: real support, both hands, actual Player action and
 // invalidation; an adjacent block-only mesh cannot masquerade as a lip.
 {
  const m=createRuntimeCollisionBridge({...playerEnv,stairUV:()=>[0,0,1],stairMinV:-1,stairMaxV:1});
  m.setRegion('mesh-mantle');playerEnv.install(m);
  const box=(x,h)=>{const a=[x-1.2,0,-1.2],b=[x+1.2,0,-1.2],c=[x+1.2,0,1.2],d=[x-1.2,0,1.2],e=[x-1.2,h,-1.2],f=[x+1.2,h,-1.2],g=[x+1.2,h,1.2],q=[x-1.2,h,1.2];return [[a,b,c],[a,c,d],[e,q,g],[e,g,f],[a,e,f],[a,f,b],[b,f,g],[b,g,c],[c,g,q],[c,q,d],[d,q,e],[d,e,a]];};
  const h=m.triangleMesh({collisionId:'mantle:actual',triangles:box(0,1),support:true,mantle:true});
  m.triangleMesh({collisionId:'mantle:disabled',triangles:box(10,1),support:true,mantle:false});
  m.triangleMesh({collisionId:'mantle:tall',triangles:box(20,3),support:true,mantle:true});
  const compound=m.triangleMesh({collisionId:'mantle:compound',triangles:[...box(30,1),...box(40,6)],support:true});
  const localPlans=m.meshMantlePlans(30,1.56,0,0,-1);
  assert.equal(localPlans[0]?.instanceId,compound.id,'remote high crown cannot reject local low ledge');
  assert.equal(localPlans[0].stand.y,1);
  const plans=m.meshMantlePlans(0,1.56,0,0,-1);
  assert.equal(plans[0]?.instanceId,h.id);assert.equal(plans[0].stand.y,1);
  assert(plans[0].hands.every(v=>v.y===1&&v.normal[1]===1));
  const alternatives=m.meshMantlePlans(0,1.5,0,0,-1);
  assert.equal(alternatives.length,3,'bounded alternate stable stances on the same source');
  for(let i=0;i<alternatives.length;i++){
   const plan=alternatives[i];assert.equal(plan.instanceId,h.id);assert.equal(plan.revision,m.get(h.id).revision);assert.equal(plan.stand.y,1);
   assert(plan.hands.every(v=>v.y===1&&v.normal[1]===1));
   if(i)assert(alternatives[i-1].stand.z-plan.stand.z>=.16-1e-8,'nearest first, distinct alternatives');
  }
  // Near-edge meshes must not require the player to steer inward by hand.
  // The lateral search is bounded and uses actual same-source support/hands.
  for(const x of [-1.45,-1.4,-1.3,-1.2,-1.1,-.95,0,.95,1.1,1.2,1.3,1.4,1.45]){
   for(const dx of (x===0?[0]:[0,-Math.sign(x)*.3,-Math.sign(x)*.707])){
    const actor=new playerEnv.Player();actor.teleport(x,1.56,0,0,0);
    const action=playerEnv.traversalStart(actor,dx,-Math.sqrt(1-dx*dx));
    assert.equal(action?.kind,'mantle','mesh edge/diagonal admission '+[x,dx]);
    assert.equal(action.surface.meshId,h.id);
    assert(action.hands.every(v=>Math.abs(v.point.x)<=1.2+1e-8&&Math.abs(v.point.z)<=1.2+1e-8&&v.point.y===1));
    for(let i=1;i<=40;i++){
     const p=playerEnv.traversalBody(action,i/40,new three.Vector3());
     assert.equal(playerEnv.playerContacts(p.x,p.z,p.y,[]).length,0,'mesh edge path clearance');
    }
    assert.equal(playerEnv.traversalStart(actor,0,1),null,'away input must not grab');
   }
  }
  const edgeActor=new playerEnv.Player();edgeActor.teleport(1.3,1.56,0,0,0);
  edgeActor.advance(1/60,{move:()=>({x:0,y:1,mag:1}),run:()=>false,consumeJump:()=>true});
  assert.equal(edgeActor.traversal?.kind,'mantle','fixed tick near-edge entry');
  for(let i=0;i<150&&edgeActor.traversal;i++)edgeActor.advance(1/60,neutral);
  assert(!edgeActor.traversal&&edgeActor.onGround&&Math.abs(edgeActor.pos.y-1)<1e-6,'near-edge landing');
  assert.equal(m.meshMantlePlans(10,1.56,0,0,-1).length,0);
  assert.equal(m.meshMantlePlans(20,1.56,0,0,-1).length,0);
  assert.equal(m.meshMantlePlans(0,1.56,0,0,1).length,0);
  const actor=new playerEnv.Player();actor.teleport(0,1.56,0,0,0);
  actor.advance(1/60,{move:()=>({x:0,y:1,mag:1}),run:()=>false,consumeJump:()=>true});
  assert.equal(actor.traversal?.kind,'mantle','actual Player selects mesh mantle');
  assert.equal(actor.traversal.surface.meshId,h.id);
  for(let i=0;i<150&&actor.traversal;i++)actor.advance(1/60,neutral);
  assert(!actor.traversal&&actor.onGround&&Math.abs(actor.pos.y-1)<1e-6,'actual Player mantle lands on real mesh');
  actor.teleport(0,1.56,0,0,0);
  actor.advance(1/60,{move:()=>({x:0,y:1,mag:1}),run:()=>false,consumeJump:()=>true});
  assert(actor.traversal);
  m.suspendRegion('mesh-mantle');actor.advance(1/60,neutral);assert(!actor.traversal,'suspension invalidates traversal');
  assert.equal(m.meshMantlePlans(0,1.56,0,0,-1).length,0);
  m.resumeRegion('mesh-mantle');assert(m.remove(h.id));assert.equal(m.meshMantlePlans(0,1.56,0,0,-1).length,0);
  playerEnv.install(null);
 }
 console.log('PASS T3 geometry mantle plan, actual Player, opt-in, reach and lifecycle');


// Shared body/nav queries and bounded depenetration use the same triangle
// geometry, including closed interiors and active-region lifetime.
{
 const m=createRuntimeCollisionBridge({...env,query:()=>[]});m.setRegion('mesh-body');env.install(m);
 const a=[-3,-1,-3],b=[3,-1,-3],c=[3,-1,3],d=[-3,-1,3],e=[-3,4,-3],f=[3,4,-3],g=[3,4,3],h=[-3,4,3];
 const tris=[[a,b,c],[a,c,d],[e,h,g],[e,g,f],[a,e,f],[a,f,b],[b,f,g],[b,g,c],[c,g,h],[c,h,d],[d,h,e],[d,e,a]];
 const mesh=m.triangleMesh({collisionId:'mesh-body:solid',triangles:tris});
 assert(env.bodyBlockedAt(2,0,0),'body admission cannot ignore enclosed mesh');
 assert(env.occupiedAt(2,0,0),'navigation cannot ignore enclosed mesh');
 assert(env.bodyBlockedAt(3.2,0,0),'body radius detects mesh boundary');
 assert(!env.bodyBlockedAt(3.5,0,0),'clear body');
 assert(!env.occupiedAt(2,0,4.1),'vertical separation');
 const p={x:2,y:0,z:0};env.pushOut(p,.35,1.72);
 assert(p.x>=3.348&&p.y===0&&!m.meshContacts(p.x,p.z,p.y).length,'bounded mesh escape');
 const p2={x:3.2,y:0,z:0};env.pushOut(p2,.35,1.72);
 assert(!m.meshContacts(p2.x,p2.z,p2.y).length,'surface penetration resolves');
 const low=m.triangleMesh({collisionId:'mesh-body:low',triangles:[[[10,.3,-1],[10,.3,1],[12,.3,-1]],[[12,.3,-1],[10,.3,1],[12,.3,1]]]});
 assert(!env.occupiedAt(11,0,0),'low obstruction does not change nav step contract');
 assert(m.remove(low.id));
 m.suspendRegion('mesh-body');assert(!env.bodyBlockedAt(2,0,0));assert(!env.occupiedAt(2,0,0));
 const inactive={x:2,y:0,z:0};env.pushOut(inactive,.35,1.72);assert.equal(inactive.x,2);
 m.resumeRegion('mesh-body');assert(env.bodyBlockedAt(2,0,0));
 assert(m.remove(mesh.id));assert(!env.bodyBlockedAt(2,0,0));assert(!env.occupiedAt(2,0,0));
 env.install(null);
}
console.log('PASS T3 shared mesh body, navigation, recovery and region lifetime');

 // T3: dense bidirectionally curved walkable surfaces must not introduce
 // fictitious walls at triangle edges or reject the actor's own ground.
 {
  const m=createRuntimeCollisionBridge({...playerEnv,stairUV:()=>[0,0,1],stairMinV:-1,stairMaxV:1});
  m.setRegion('curvature-continuity');playerEnv.install(m);
  const p=(i,j)=>[i*.15,2+.12*Math.sin(i*.65)*Math.cos(j*.65),j*.15],triangles=[];
  for(let i=0;i<20;i++)for(let j=0;j<20;j++){
   const a=p(i,j),b=p(i+1,j),c=p(i,j+1),d=p(i+1,j+1);triangles.push([a,c,b],[b,c,d]);
  }
  m.triangleMesh({collisionId:'curved:walkable',triangles,support:true});
  const actor=new playerEnv.Player();
  // All local face grades are below the shared 50-degree limit.
  for(let x=.5;x<2.5;x+=.18)for(let z=.5;z<2.5;z+=.18){
   const y=m.meshSupport(x,z,10).point[1];
   assert.equal(m.meshContacts(x,z,y).length,0,'walkable curved surface is not a body obstacle');
   actor.pos.set(x,y,z);actor.onGround=true;
   for(let i=0;i<8;i++){
    const dx=.05*Math.cos(i*Math.PI/4),dz=.05*Math.sin(i*Math.PI/4);
    assert.equal(actor.candidate(dx,dz).contacts.length,0,'continuous walkable path '+[x,z,i]);
   }
  }
  for(const [x,z,yaw] of [[.65,.8,-Math.PI/2],[.8,.65,Math.PI],[.65,.65,-3*Math.PI/4]]){
   actor.teleport(x,z,yaw,0,m.meshSupport(x,z,10).point[1]);
   const walk={...neutral,move:()=>({x:0,y:1,mag:1})};
   for(let i=0;i<35;i++){
    actor.advance(1/60,walk,[]);
    assert(actor.onGround,'continuous curved fixed ticks retain support');
    const ground=m.meshSupport(actor.pos.x,actor.pos.z,10);
    assert(ground&&Math.abs(actor.pos.y-ground.point[1])<.004,'actual feet follow curved surface');
   }
   assert(Math.hypot(actor.pos.x-x,actor.pos.z-z)>1.1,'no artificial stalls in any tested direction');
  }
  // A disconnected higher sheet in the same source is not a ground seam.
  const quad=(a,b,y0,y1)=>[[[a,y0,-1],[a,y0,1],[b,y1,-1]],[[b,y1,-1],[a,y0,1],[b,y1,1]]];
  m.setRegion('curvature-obstacles');
  m.triangleMesh({collisionId:'separated',triangles:[...quad(10,11,2,2),...quad(11.08,12,2.25,2.25)],support:true});
  assert(m.meshContacts(10.9,0,2).length>0,'disconnected elevated sheet still blocks body');
  assert(m.surfaceBoundarySweep(10.9,0,2,.02,0,.35,1.72,{grounded:true,floor:2}).length>0,'disconnected sheet still blocks approach');
  m.triangleMesh({collisionId:'steep',triangles:[...quad(20,21,2,2),...quad(21,21.4,2,2.8)],support:true});
  assert(m.surfaceBoundarySweep(20.8,0,2,.06,0,.35,1.72,{grounded:true,floor:2}).length>0,'steep incident face still blocks approach');
  playerEnv.install(null);
 }
 console.log('PASS T3 multidirectional curvature, fixed-tick continuity and separated/steep obstacle preservation');

// T4: early one-shot jump reaches both actual primitive and mesh geometry.
{
const box=(x,z,h)=>{const a=[x-1.2,0,z-1.2],b=[x+1.2,0,z-1.2],c=[x+1.2,0,z+1.2],d=[x-1.2,0,z+1.2],e=[x-1.2,h,z-1.2],f=[x+1.2,h,z-1.2],g=[x+1.2,h,z+1.2],q=[x-1.2,h,z+1.2];return [[a,b,c],[a,c,d],[e,q,g],[e,g,f],[a,e,f],[a,f,b],[b,f,g],[b,g,c],[c,g,q],[c,q,d],[d,q,e],[d,e,a]];};
const m=createRuntimeCollisionBridge({...playerEnv,stairUV:()=>[0,0,1],stairMinV:-1,stairMaxV:1});
playerEnv.install(m);m.setRegion('t4-entry');
m.triangleMesh({collisionId:'t4-entry:mesh',triangles:box(120,100,1),support:true,mantle:true});
playerEnv.addBox({cx:125,cy:.5,cz:100,hx:1.2,hy:.5,hz:1.2});
playerEnv.addBox({cx:130,cy:.5,cz:100,hx:1.2,hy:.5,hz:1.2,climbable:false});
const results=[];
for(const [name,x,z,press,cancel] of [['mesh-early',120,102,true,false],['primitive-early',125,102,true,false],['primitive-held',125,102,false,false],['mesh-held',120,102,false,false],['disabled-held',130,102,false,false],['disabled',130,102,true,false],['mesh-close',120,101.56,true,false],['primitive-close',125,101.56,true,false],['release',125,102,true,true]]){
 const p=new playerEnv.Player();p.teleport(x,z,0,0,0);let first=null;
 for(let i=0;i<45;i++){
  p.advance(1/60,{move:()=>cancel&&i>4?{x:0,y:0,mag:0}:{x:0,y:1,mag:1},run:()=>false,consumeJump:()=>i===0&&press});
  if(p.traversal){first={tick:i,kind:p.traversal.kind};break;}
 }
 if(first)for(let i=0;i<150&&p.traversal;i++)p.advance(1/60,{move:()=>({x:0,y:0,mag:0}),run:()=>false,consumeJump:()=>false});
 results.push({name,first,grounded:p.onGround,y:p.pos.y});
}
playerEnv.install(null);

 for(const name of ['mesh-early','primitive-early','mesh-close','primitive-close','primitive-held','mesh-held']){
  const r=results.find(x=>x.name===name);assert.equal(r.first?.kind,'mantle',name);assert(r.grounded&&Math.abs(r.y-1)<1e-6,'completed mantle '+name);
 }
 for(const name of ['disabled-held','disabled','release'])assert.equal(results.find(x=>x.name===name).first,null,name);
 assert(results.find(x=>x.name==='mesh-early').first.tick>0);
 assert(results.find(x=>x.name==='primitive-early').first.tick>0);
 console.log('PASS T4 buffered grab admission and completed primitive/mesh mantle '+JSON.stringify(results));
}

 // T4: geometric box faces, not rounded collision normals, own grab anchors.
 {
  const m=createRuntimeCollisionBridge({...playerEnv,stairUV:()=>[0,0,1],stairMinV:-1,stairMaxV:1});
  playerEnv.install(m);m.setRegion('t4-corner');
  let count=0;
  for(const yaw of [0,.47])for(const height of [1,3]){
   const cx=180+count*10,cz=100;
   const box=playerEnv.addBox({cx,cz,cy:height/2,hx:1.2,hz:1.2,hy:height/2,yaw});
   for(const [a,b,dx,dz] of [[1.45,1.45,-1,-1],[1.45,-1.45,-1,1],[-1.45,1.45,1,-1],[-1.45,-1.45,1,1],[0,1.56,0,-1],[1.12,1.56,0,-1],[1.45,1.45,1,1]]){
    const p=new playerEnv.Player();
    p.pos.set(cx+a*box.cos+b*box.sin,0,cz-a*box.sin+b*box.cos);p.onGround=true;
    const action=playerEnv.traversalStart(p,dx*box.cos+dz*box.sin,-dx*box.sin+dz*box.cos);
    const away=dx===1&&dz===1&&a>0&&b>0;
    if(away){assert.equal(action,null,'away from corner');count++;continue;}
    assert.equal(action?.kind,height===1?'mantle':'latch','real face admission '+[yaw,height,a,b]);
    const {nx,nz}=action.surface;
    assert(Math.min(Math.abs(nx*box.cos-nz*box.sin),Math.abs(nx*box.sin+nz*box.cos))<1e-8,'axis-aligned geometric face');
    for(const hand of action.hands){
     const [u,v]=playerEnv.local(box,hand.point.x,hand.point.z);
     assert(Math.abs(u)<=box.hx+1e-8&&Math.abs(v)<=box.hz+1e-8);
     assert(Math.min(Math.abs(Math.abs(u)-box.hx),Math.abs(Math.abs(v)-box.hz))<1e-8,'hand is on the actual face edge');
    }
    for(let i=1;i<=240;i++){
     const q=playerEnv.traversalBody(action,i/240,new three.Vector3());
     assert.equal(playerEnv.playerContacts(q.x,q.z,q.y,[]).length,0,'clear alignment and ascent');
    }
    count++;
   }
  }
  playerEnv.install(null);
  console.log('PASS T4 28 diagonal, edge, centered and away box entries; real hand anchors and 5760 path samples');
 }

 // T4-C: a real corner can retain a planted hand even when the next
 // notional four-contact stance would put that hand outside the wall.
 {
  const m=createRuntimeCollisionBridge({...playerEnv,stairUV:()=>[0,0,1],stairMinV:-1,stairMaxV:1});
  playerEnv.install(m);m.setRegion('t4-retained-holds');
  const cx=470,cz=100;
  const box=playerEnv.addBox({cx,cz,cy:2,hx:1,hz:1,hy:2,collisionId:'t4-retained-wall'});
  const p=new playerEnv.Player();p.pos.set(cx+.52,0,cz+1.368);p.onGround=true;
  const old=playerEnv.traversalStart(p,0,-1);
  assert.equal(old?.kind,'latch');
  p.pos.copy(old.to);old.moving=1;
  const step=playerEnv.traversalSide(p,old,1);
  assert(step,'moving pair can reach the actual wall even if a hypothetical four-new-hold pose cannot');
  assert.equal(step.hands[1],old.hands[1],'planted hand retained');
  assert.equal(step.feet[0],old.feet[0],'planted foot retained');
  assert(step.feet[1].point.x<cx+1&&step.hands[0].point.x<cx+1,'new pair stays on actual face');
  assert(step.to.x>p.pos.x+.29,'requested lateral step, not a new face');
  const impossible={...old,hands:[old.hands[0],{...old.hands[1],point:old.hands[1].point.clone().add(new three.Vector3(-2,0,0))}]};
  assert.equal(playerEnv.traversalSide(p,impossible,1),null,'reject retained anchor outside existing horizontal envelope');
  p.pos.copy(step.to);
  assert.equal(playerEnv.traversalSide(p,step,1),null,'do not invent another step beyond the physical wall');
  playerEnv.install(null);
  console.log('PASS T4-C selected moving pair and planted anchor rejection');
 }
 // T4: actual fixed ticks release stale registered primitive anchors.
 {
  const m=createRuntimeCollisionBridge({...playerEnv,stairUV:()=>[0,0,1],stairMinV:-1,stairMaxV:1});
  playerEnv.install(m);
  const input=(x,y,jump=false)=>({move:()=>({x,y,mag:Math.hypot(x,y)}),run:()=>false,consumeJump:()=>jump});
  const move=input(0,1);
  for(const [i,height] of [[0,1],[1,3]]){
   const cx=500+i*12,cz=100;
   m.setRegion('t4-life-'+i);
   const box=playerEnv.addBox({cx,cz,cy:height/2,hx:1.2,hz:1.2,hy:height/2,collisionId:'t4-life-box-'+i});
   const p=new playerEnv.Player();p.teleport(cx,cz+1.56,0,0,0);
   p.advance(1/60,input(0,1,true));assert.equal(p.traversal?.kind,height===1?'mantle':'latch');
   for(let k=0;k<6;k++)p.advance(1/60,move);
   assert(p.traversal?.surface.sourceRef,'registered primitive anchor');
   const before=p.pos.clone();m.suspendRegion('t4-life-'+i);p.advance(1/60,move);
   assert.equal(p.traversal,null,'suspended source releases in one tick');
   assert(p.pos.distanceTo(before)<1e-8,'no stale anchor displacement');
   m.resumeRegion('t4-life-'+i);p.teleport(cx,cz+1.56,0,0,0);
   p.advance(1/60,input(0,1,true));assert(p.traversal);
   assert(m.remove(box.collisionId));
   playerEnv.addBox({cx,cz,cy:height/2,hx:1.2,hz:1.2,hy:height/2,collisionId:box.collisionId});
   p.advance(1/60,move);assert.equal(p.traversal,null,'same ID replacement invalidates old revision');
  }
  playerEnv.install(null);
  console.log('PASS T4 registered primitive suspend/replacement release');
 }

// Independent landing lifetime: actual Player traversal and support registry.
{
 const m=createRuntimeCollisionBridge({...playerEnv,stairUV:()=>[0,0,1],stairMinV:-1,stairMaxV:1});
 playerEnv.install(m);m.setRegion('t4-landing');
 const makeDeck=()=>playerEnv.addBox({cx:630,cy:.5,cz:100,hx:1.2,hz:1.2,hy:.5,collisionId:'t4-landing:deck'});
 const deck=makeDeck();
 const hand=playerEnv.addBox({cx:635,cy:.5,cz:100,hx:1.2,hz:1.2,hy:.5,collisionId:'t4-landing:hand'});
 const actor=new playerEnv.Player();
 const entry=()=>{
  actor.teleport(630,102,0,0,1);actor.onGround=false;
  const action={kind:'crest',surface:{nx:0,nz:1,sourceRef:{id:hand.collisionId,revision:m.get(hand.collisionId).revision}},from:actor.pos.clone(),to:new three.Vector3(630,1,100),duration:.56,elapsed:0};
  assert(playerEnv.traversalPathClear(action));assert.equal(action.landingRef?.id,deck.collisionId);actor.traversal=action;
 };
 entry();for(let i=0;i<6;i++)actor.advanceTraversal(1/60,0,0,false);
 const before=actor.pos.clone();assert(m.remove(deck.collisionId));makeDeck();
 actor.advanceTraversal(1/60,0,0,false);assert.equal(actor.traversal,null);assert(!actor.onGround);assert(actor.pos.distanceTo(before)<1e-8);
 entry();assert(m.remove(deck.collisionId));actor.advanceTraversal(1/60,0,0,false);assert.equal(actor.traversal,null);assert(!actor.onGround);
 const missing={kind:'crest',surface:{nx:0,nz:1},from:new three.Vector3(630,1,102),to:new three.Vector3(630,1,100),duration:.56,elapsed:0};
 assert(!playerEnv.traversalPathClear(missing),'no floating landing admission');
 makeDeck();entry();for(let i=0;i<60&&actor.traversal;i++)actor.advanceTraversal(1/60,0,0,false);
 assert(actor.onGround&&Math.abs(actor.pos.y-1)<1e-8,'live landing completes');
 playerEnv.install(null);
 console.log('PASS T4 distinct landing source replacement/removal and live support');
}

 // Deferred static geometry: exact support, bounded cache and stable revision.
{
 const m=createRuntimeCollisionBridge({...env,stairUV:()=>[0,0,1],stairMinV:-1,stairMaxV:1});
 env.install(m);m.setRegion('deferred-rock-test');
 let built=0;
 const top=x=>[[[x-1,1,-1],[x-1,1,1],[x+1,1,-1]],[[x+1,1,-1],[x-1,1,1],[x+1,1,1]]];
 const register=i=>{const x=2000+i*40;return m.triangleMesh({collisionId:'deferred:'+i,bounds:{min:[x-1,1,-1],max:[x+1,1,1]},triangles:()=>{built++;return top(x);},support:true,mantle:true});};
 const first=register(0);for(let i=1;i<140;i++)register(i);
 assert.equal(built,0,'registration does not build rock triangle trees');
 const legacy=env.addCyl({x:2000,z:0,r:2,y0:0,y1:2,climbable:true,mantleOnly:true,legacyOnly:true});
 assert(env.query(2000,0,0).includes(legacy),'legacy camera/nav proxy preserved');
 assert(!m.activePrimitives(2000,0,0).includes(legacy),'legacy proxy excluded from Player registry');
 assert.equal(env.playerFloor(2000,0,3,0),1,'rendered height wins instead of fake cylinder');
 assert.equal(built,1);
 const revision=m.get(first.id).revision;
 for(let i=1;i<140;i++)assert.equal(m.meshSupport(2000+i*40,0,2)?.point[1],1);
 assert(m.debugSnapshot().boundaryIndex.deferredResident<=128);
 assert.equal(m.meshSupport(2000,0,2)?.point[1],1);assert.equal(built,141,'evicted geometry rebuilt');
 assert.equal(m.get(first.id).revision,revision,'cache eviction is not a geometry revision');
 m.suspendRegion('deferred-rock-test');assert.equal(m.meshSupport(2000,0,2),null);
 m.resumeRegion('deferred-rock-test');assert.equal(m.meshSupport(2000,0,2)?.point[1],1);
 assert(m.remove(first.id));assert.equal(m.meshSupport(2000,0,2),null);
 env.install(null);
 console.log('PASS T4 deferred rock source: exact support, retired proxy, bounded cache, lifetime');
}

 // Full motion-lab fixtures from their exact production constructor, no GPU.
 {
  const m=createRuntimeCollisionBridge({...playerEnv,stairUV:()=>[0,0,1],stairMinV:-1,stairMaxV:1});
  m.setRegion('motion-lab');playerEnv.install(m);
  const makeLab=Function('T','WorldCollision','addBox','addCyl','clamp2',
    'const {Vector3,Group,Mesh,MeshStandardMaterial,PlaneGeometry,BoxGeometry,BufferGeometry,Float32BufferAttribute,CylinderGeometry,IcosahedronGeometry,DoubleSide}=T;const PLAYER={body:1.72},boxGeo=new BoxGeometry(1,1,1);'+
    slicePart(readPart('src/world/region.part.js'),'function mulberry32','var N3 =')+
    slicePart(gameplay,'function rockGeometry(','function rockMaterial(')+
    slicePart(gameplay,'function mesh(geo,','function box(g,')+
    slicePart(gameplay,'function renderedCollisionTriangles(','async function bootMotionLab(')+
    'return createMotionLabFixtures(new Group());'
  );
  const f=makeLab(three,m,playerEnv.addBox,playerEnv.addCyl,(x,a,b)=>Math.max(a,Math.min(b,x)));
  const labGround=Function(slicePart(readPart('src/entities/character/motion-experiment.js'),'export function sampleLabGround(','// Detached driver experiment').replace('export ','')+'return sampleLabGround;')();
  m.labSurface({collisionId:'motion-lab:ground',bounds:{min:[-10000,-4,-10000],max:[10000,7,10000]},sample:(x,z)=>labGround(f,x,z),ramps:f.ramps});
  playerEnv.lab(f);
  const forward={...neutral,move:()=>({x:0,y:1,mag:1})};
  const route=(name,x,z,yaw,frames,target,kind)=>{
   const p=new playerEnv.Player();p.teleport(x,z,yaw,0,0);
   let peak=0,land=0;const actions=new Set(),tickMs=[];
   for(let i=0;i<frames;i++){const t0=performance.now();p.advance(1/60,forward,[]);tickMs.push(performance.now()-t0);peak=Math.max(peak,p.pos.y);if(p.onGround)land=Math.max(land,p.pos.y);if(p.traversal)actions.add(p.traversal.kind);}
   const sorted=tickMs.sort((a,b)=>a-b),pct=q=>sorted[Math.floor((sorted.length-1)*q)];
   const result={name,peak,land,pos:p.pos.toArray(),actions:[...actions],p50:pct(.50),p95:pct(.95),search:p.traversalSearchStats??null};
   console.log('T4 flat-ground approach '+JSON.stringify(result));
   if(target!==null)assert(land>=target-.003,name+' failed to reach support');
   if(kind)assert(actions.has(kind),name+' missing '+kind);else if(target!==null)assert.equal(actions.size,0,name+' incorrectly triggered traversal');
  };
  route('stairs',f.stairs.x,f.stairs.z-.7,Math.PI,230,f.stairs.count*f.stairs.rise);
  for(const r of f.ramps)route('ramp-'+r.angle,r.x,r.z+.7,0,r.angle===60?1000:400,r.height,r.angle===60?'latch':null);
  route('curve-ground-entry',f.curve.x-.7,f.curve.z,-Math.PI/2,650,4.6,'latch');
  for(const side of [-1,1])for(const k of [3,5])route('stair-side-'+side+'-'+k,f.stairs.x+side*(f.stairs.width/2+.7),f.stairs.z+(k+.5)*f.stairs.run,side*Math.PI/2,180,(k+1)*f.stairs.rise,'mantle');
  for(const r of f.ramps)for(const side of [-1,1]){
   route('ramp-side-'+r.angle+'-'+side,r.x+side*(r.width/2+.7),r.z-r.run*.6,side*Math.PI/2,500,r.angle<60?r.height*.6:null,'latch');
   const p=new playerEnv.Player();p.teleport(r.x+side*(r.width/2+.7),r.z-r.run*.6,side*Math.PI/2,0,0);
   for(let i=0;i<60&&!p.traversal;i++)p.advance(1/60,forward,[]);
   assert(p.traversal?.surface.boundary,'ramp side uses registered boundary');
   const z=p.pos.z;
   for(let i=0;i<100;i++)p.advance(1/60,{...neutral,move:()=>({x:side,y:0,mag:1})},[]);
   assert(p.traversal&&p.pos.z<z-.3,'uphill lateral movement '+r.angle+' '+side);
  }
  route('mesh-mantle',f.mantle.x,f.mantle.z+2,0,130,1,'mantle');
  // Actual irregular rock: directed input only, a real climb and crown landing.
  route('rock',f.rock.maxX+.7,f.rock.z,Math.PI/2,550,1.7,'latch');

  // T4-C: step-off airborne contact and directional jump while latched.
  const air=new playerEnv.Player();air.teleport(f.wall.x,f.wall.z+f.wall.depth/2+.52,0,0,0);
  air.pos.y=1.2;air.onGround=false;air.vel.y=-.2;
  for(let i=0;i<60&&!air.traversal;i++)air.advance(1/60,forward,[]);
  assert(air.traversal,"directed airborne wall contact without fresh jump");
  air.advance(1/60,{...forward,consumeJump:()=>true},[]);
  assert(air.traversal,"toward-wall jump must not drop");
  air.advance(1/60,{...neutral,consumeJump:()=>true},[]);
  assert(!air.traversal,"neutral jump deliberately releases");
  const climber=new playerEnv.Player();climber.teleport(f.rock.maxX+.7,f.rock.z,Math.PI/2,0,0);
  for(let i=0;i<120&&!climber.traversal;i++)climber.advance(1/60,forward,[]);
  assert.equal(climber.traversal?.kind,'latch');
  const rockRef=climber.traversal.surface;
  assert.equal(rockRef.meshId,f.rock.id);
  assert([...climber.traversal.hands,...climber.traversal.feet].every(h=>h.sourceRef.id===f.rock.id&&h.sourceRef.revision===rockRef.revision));
  m.suspendRegion('motion-lab');
  climber.advance(1/60,forward,[]);
  assert.equal(climber.traversal,null,'suspended mesh climb must release');
  assert.equal(m.meshClimbFace(rockRef.meshId,rockRef.revision,rockRef.x,rockRef.z,.6,-1,0,0,2),null);
  m.resumeRegion('motion-lab');
  playerEnv.install(null);
 }

{
  const m=createRuntimeCollisionBridge({...playerEnv,stairUV:()=>[0,0,1],stairMinV:-1,stairMaxV:1});
  m.setRegion('traversal-budget');playerEnv.install(m);
  const p=new playerEnv.Player();p.pos.set(0,0,0);
  const {traversalAttempt:attempt,traversalMemo:memo,TRAVERSE_QUERY_LIMIT:limit}=playerEnv;
  let reads=0,completed=0;
  const build=()=>{for(let i=0;i<limit+20;i++)memo(['synthetic-probe',i],()=>++reads);completed++;return null;};
  assert.equal(attempt(p,'auto',1,0,null,build),null);
  assert.equal(reads,limit);assert.equal(completed,0);assert(p.traversalSearch.pending);
  p.simTime+=1/60;
  assert.equal(attempt(p,'auto',1,0,null,build),null);
  assert.equal(reads,limit+20,'deferred work reuses exact probe evidence');
  assert.equal(completed,1);assert.equal(p.traversalSearchStats.maxTick,limit);
  p.simTime+=1/60;
  attempt(p,'auto',1,0,null,build);
  assert.equal(completed,1,'unchanged failed search is cached');
  assert.equal(p.traversalSearchStats.failedSkips,1);
  p.simTime+=1/60;attempt(p,'auto',0,1,null,build);
  assert.equal(reads,2*limit+20,'direction invalidates cached failure');
  p.simTime+=1/60;p.pos.x=.01;attempt(p,'auto',0,1,null,build);
  assert.equal(reads,3*limit+20,'position invalidates pending evidence');
  const rev=m.traversalEpoch();
  m.suspendRegion('traversal-budget');assert(m.traversalEpoch()>rev);
  p.simTime+=1/60;attempt(p,'auto',0,1,null,build);
  assert.equal(reads,4*limit+20,'region revision invalidates pending evidence');
  p.simTime+=1/60;p.nearby=[{type:'cyl',x:1,z:0,r:.3,bot:0,top:1.72}];
  attempt(p,'auto',0,1,null,build);
  assert.equal(reads,5*limit+20,'nearby collision change invalidates pending evidence');
  p.simTime+=1/60;attempt(p,'auto',0,1,null,build);assert.equal(completed,2);
  p.teleport(0,0,0);assert.equal(p.traversalSearch,null);
  playerEnv.install(null);
  console.log('PASS T4-B exact failure caching, fixed-tick budget, resume and invalidation');
}
