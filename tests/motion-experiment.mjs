import assert from 'node:assert/strict';
import {gaitSupportWeight,groundGaitTarget,transitionBodyHeight,groundFootCorrection,groundLegDistance,groundIKWeight,sampleBodySupport,smoothBodyHeight,smoothLocomotionHeight,runHeadFilter,anticipateFootStep} from '../src/entities/character/studio-integration.js';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createStudioGeometry} from '../src/entities/character/studio-geometry.js';
import {createStudioModel} from '../src/entities/character/studio-model.js';
import {normalizeStudioCharacter} from '../src/entities/character/appearance.js';
import {motionManifest,createMotionTrace,sampleLabGround,replayMotion,summarizeMotionTrace,motionQuality,motionPolicy,compareMotionStrength} from '../src/entities/character/motion-experiment.js';
const T=new Function(readFileSync('src/vendor/three-gltf.part.js','utf8')+';return three_module_exports;')();
const factory=createStudioGeometry(JSON.parse(gunzipSync(readFileSync('assets/models/characters/studio-v1.json.gz'))));
const make=(profile,options)=>createStudioModel(T,factory,normalizeStudioCharacter(profile),options);
const manifests=motionManifest();assert.equal(new Set(manifests.map(x=>x.id)).size,manifests.length);
assert(manifests.every(x=>x.rootOwnership==='physics'));
assert.equal(motionPolicy('walk').contactWindows.clock,'phase');assert.equal(motionPolicy('walk').contact.authoredLock,true);assert.equal(motionPolicy('backpedal').contact.phaseDirection,'reverse');
assert.deepEqual(motionPolicy('pivot').contactWindows.left.support,[Math.PI,2*Math.PI]);assert.equal(motionPolicy('airborne').contact.kind,'no-ground-lock');
assert(manifests.filter(x=>x.kind==='keyframe').every(x=>x.contactWindows===null&&x.contact.kind==='unannotated-keyframe'));
const recorder=createMotionTrace({limit:2});assert.equal(recorder.push(0),false);recorder.start();recorder.push(1);recorder.push(2);assert.equal(recorder.push(3),false);assert.deepEqual(recorder.stop(),{frames:[1,2],active:false,error:null});
const f={pool:{minX:-56,maxX:-26,minZ:-13,maxZ:13,entry:6,bottom:-3},stairs:{x:-12,z:12,width:4,run:.55,count:12},ramps:[{angle:45,x:0,z:-16,width:7,run:6,height:6}],height:(x,z)=>x<-26?-3*Math.min(1,(-26-x)/6):Math.max(0,-16-z)};
assert.equal(sampleLabGround(f,0,-19).point[1],3);assert(Math.abs(sampleLabGround(f,0,-19).geometricNormal[2]-Math.SQRT1_2)<1e-12);
assert.equal(sampleLabGround(f,-12,13),null);assert.equal(sampleLabGround(f,-29,0).point[1],-1.5);
for(const body of ['male','female']){
 const results=['low','baseline','high'].map(strength=>replayMotion(make,{body},{strength,scenario:'walk',frames:90}));
 const cmp=compareMotionStrength(results);
 assert.equal(cmp.rootDelta,0);assert.equal(cmp.phaseDelta,0);assert.equal(cmp.lowerLocalDelta,0);
 assert(cmp.channels.ribcage.lowToHighRad>0.01);
 console.log('T2 strength comparison '+JSON.stringify(cmp));
 const base=results[1];assert.equal(base.rig.bones.length,47);assert(Math.abs(base.rig.meshHeight-1.76)<1e-6);
 for(const r of results){assert.equal(r.frames.length,90);assert(r.frames.every((frame,i)=>frame.state.root.every((v,k)=>v===base.frames[i].state.root[k])&&frame.joints.length===47));}
 for(const r of results)for(const frame of r.frames)for(const side of ['left','right']){
  const sole=frame.soles[side];assert(sole.candidateCount>0&&sole.validCount===sole.candidateCount);
  assert(Number.isFinite(sole.minGap)&&sole.lowest.world.every(Number.isFinite));
 }
 assert.notDeepEqual(results[0].frames[60].joints.find(j=>j.id==='ribcage').rotation,results[2].frames[60].joints.find(j=>j.id==='ribcage').rotation);
 for(const scenario of ['idle','backpedal','pivot','jump']){
  const r=replayMotion(make,{body},{scenario,scale:.85,frames:100});assert.equal(r.rig.scale,.85);
  assert(r.frames.every(x=>x.joints.every(j=>j.rotation.every(Number.isFinite))));
  if(scenario==='jump')assert(r.frames.some(x=>!x.state.grounded)&&r.frames.at(-1).state.grounded);
  if(scenario==='backpedal')assert(r.frames.some(x=>x.state.action==='backpedal'));
  if(scenario==='pivot')assert(r.frames.some(x=>x.state.pivotWeight>.9));
 }
}
console.log('PASS motion manifest, trace limits, analytical lab samples, real male/female rig scripted driver experiments (no physics/IK)');

const mock=(time,action,x,teleportId=0)=>({time,state:{action,grounded:true,teleportId},soles:{left:{minGap:-.005,contacts:[{index:7,world:[x,0,0]}]}}});
const summary=summarizeMotionTrace([mock(0,'idle',0),mock(1,'walk',.02),mock(2,'walk',.04),mock(3,'walk',10,1)]);
assert.equal(summary.feet.left.comparisons,2);assert.equal(summary.feet.left.maxDrift,.04);assert.equal(summary.feet.left.maxPenetration,.005);assert.equal(summary.feet.right.maxDrift,null);assert.equal(summary.actions.length,3);assert.equal(summary.feet.left.windows.length,2);
console.log('PASS posed bare-body sole samples and trace summary reset/coverage');

const qframe=(i,phase,action,grounded=true)=>({time:i/60,state:{root:[0,0,0],renderRoot:[0,0,0],phase,heading:0,action,grounded,teleportId:0},bodyRoot:[0,0,0],joints:[{id:'head',rotation:[0,0,0,1]}]});
const quality=motionQuality([qframe(0,6.2,'walk'),qframe(1,.1,'walk'),qframe(2,.2,'backpedal'),qframe(3,.1,'backpedal'),qframe(4,.1,'airborne',false),qframe(5,.1,'idle')]);
assert.deepEqual(quality.phase,{forward:1,reverse:1,opposite:0});assert.equal(quality.maxLocalJointDeltaRad,0);assert.equal(quality.maxLocalJointDelta.joint,'head');assert.equal(quality.groundTransitions.length,2);assert.equal(quality.maxRootRenderGap,0);
console.log('PASS motion quality wrap/reverse, discontinuity and ground event diagnostics');

const flat=()=>0;
const ankle=(x,y=.08,z=0)=>({x,y,z});
assert.equal(gaitSupportWeight(0,'left'),0);
assert.equal(gaitSupportWeight(Math.PI,'left'),1);
assert.equal(gaitSupportWeight(0,'right'),1);
assert.equal(gaitSupportWeight(Math.PI,'right'),0);
for(let i=0;i<64;i++){const phase=i*Math.PI/32;assert(gaitSupportWeight(phase,'left')*gaitSupportWeight(phase,'right')===0);}
let lock=groundGaitTarget(null,'left',Math.PI,2.6,ankle(0),.08,0,flat);
assert.equal(lock.weight,1);
lock=groundGaitTarget(lock.state,'left',Math.PI+.1,2.6,ankle(.12),.08,0,flat);
assert.equal(lock.x,0);assert.equal(lock.state.x,0);
let fade=groundGaitTarget(lock.state,'left',Math.PI,2.6,ankle(.24),.08,0,flat);
assert(fade.weight>0&&fade.weight<1&&fade.x>0&&fade.x<.24);
let invalid=groundGaitTarget(lock.state,'left',Math.PI,2.6,ankle(.33),.08,0,flat);
assert.equal(invalid.weight,0);assert.equal(invalid.state.blocked,true);
assert.equal(groundGaitTarget(invalid.state,'left',Math.PI,2.6,ankle(.1),.08,0,flat).weight,0);
assert.equal(groundGaitTarget(invalid.state,'left',0,2.6,ankle(.1),.08,0,flat).state,null);
assert.equal(groundGaitTarget(lock.state,'left',Math.PI,0,ankle(.1),.08,0,flat).state,null);
assert.equal(groundGaitTarget(null,'left',Math.PI,2.6,ankle(0,.3),.08,0,flat).state,null);
assert.equal(groundGaitTarget(lock.state,'left',Math.PI,2.6,ankle(.1),.08,0,(x)=>x===0?null:0).state.blocked,true);
assert.equal(groundGaitTarget(lock.state,'left',Math.PI,2.6,ankle(.1),.08,0,()=>.08).state.blocked,true);
assert.equal(groundGaitTarget(lock.state,'left',Math.PI,2.6,ankle(.1),.08,0,()=>undefined).weight,0);
const reverse=groundGaitTarget(lock.state,'left',Math.PI-.1,2.6,ankle(-.12),.08,0,flat);
assert.equal(reverse.x,0);
console.log('PASS gait support intent, anchor preservation, reverse, release and invalidation');

const close=(a,b)=>assert(Math.abs(a-b)<1e-9);
for(const fps of [30,60,120]){
 const dt=1/fps;
 let y=.12,root=0;
 for(let i=1;i<=fps;i++){
  const nextRoot=3*i/fps-3*(i/fps)**2;
  const next=transitionBodyHeight(y,root,nextRoot,nextRoot,dt,false,false,2.6);
  close(next-nextRoot,(y-root)*Math.exp(-dt*12));
  y=next;root=nextRoot;
 }
 close(y-root,.12*Math.exp(-12));
 const landed=transitionBodyHeight(y,root,0,-.12,dt,true,false,2.6);
 assert(landed<y&&landed>-.12);
 assert(Math.abs(landed-y)<=Math.max(2.4,2.6*.8+.6)*dt+1e-9);
}
close(transitionBodyHeight(.18,0,5,5.12,1/60,true,false,0,true),5.12);
close(transitionBodyHeight(.18,0,5,5,1/60,false,true,0,true),5);
close(transitionBodyHeight(null,0,5,5,1/60,false,false,0),5);
close(transitionBodyHeight(.1,0,.1,.2,0,false,true,0),.2);
console.log('PASS visual offset continuity through takeoff, flight, landing and teleport at 30/60/120 FPS');

assert.equal(groundFootCorrection(.4,0),.27);
assert.equal(groundFootCorrection(-.135,1),0);
assert.equal(groundFootCorrection(-.06,0),0);
assert(Math.abs(groundFootCorrection(-.090001,1)-groundFootCorrection(-.089999,1))<.00001);
for(let i=0;i<135;i++){
 const a=groundFootCorrection(-i/1000,1),b=groundFootCorrection(-(i+1)/1000,1);
 assert(Math.abs(a-b)<.004);
}
for(const flex of [100,120,135,150]){
 const d=groundLegDistance(.42,.41,0,flex);
 const angle=Math.acos((d*d-.42**2-.41**2)/(2*.42*.41))*180/Math.PI;
 assert(Math.abs(angle-flex)<1e-8);
 assert(Math.abs(groundLegDistance(.42,.41,10,flex)-.829)<1e-9);
}
console.log('PASS continuous ground-foot release and authored knee reach bounds');

for(const body of ['male','female']){
 const actor=make({body});
 try{for(const side of ['left','right']){
  const axis=actor.data.bones.find(b=>b.id==='shin_'+side).axes[0];
  assert(Number.isFinite(axis.max)&&axis.max>0&&axis.max<180);
  const l1=actor.B['shin_'+side].position.length()*actor.units,l2=actor.B['foot_'+side].position.length()*actor.units;
  const d=groundLegDistance(l1,l2,0,axis.max);
  assert(d>Math.abs(l1-l2)&&d<l1+l2);
 }}finally{actor.dispose();}
}


assert.equal(groundIKWeight(0,0),0);
assert.equal(groundIKWeight(.002,0),0);
assert.equal(groundIKWeight(-.002,0),0);
assert.equal(groundIKWeight(.012,0),1);
assert.equal(groundIKWeight(-.035,0),1);
assert.equal(groundIKWeight(0,.035),1);
assert(groundIKWeight(.008,0)>groundIKWeight(-.008,0),'prioritize upward clearance');
for(const direction of [-1,1])for(let i=0;i<1000;i++){
 const a=groundIKWeight(direction*i*.0001,0),b=groundIKWeight(direction*(i+1)*.0001,0);
 assert(b>=a-1e-12&&b-a<.016,'continuous ground IK influence');
}
for(let i=0;i<100;i++){
 const a=groundIKWeight(0,i*.0005),b=groundIKWeight(0,(i+1)*.0005);
 assert(b>=a&&b-a<.024,'continuous horizontal anchor influence');
}
console.log('PASS bounded ground IK influence, no threshold jump, upward clearance priority');


for(const fps of [30,60,120]){
 const dt=1/fps,speed=2.6;let oldY=null,y=null,v=0,oldPrev=null,prev=null,oldV=null,prevV=null,oldJerk=0,jerk=0;
 for(let i=0;i<fps*3;i++){
  const x=i*dt*speed,raw=Math.floor(x/.55)*.22;
  const target=sampleBodySupport({x,y:raw,z:0},raw,speed,0,x=>Math.floor(x/.55)*.22).y;
  oldY=smoothBodyHeight(oldY,target,dt,true,speed);
  const next=smoothLocomotionHeight(y,v,target,dt,speed);y=next.y;v=next.velocity;
  assert(Math.abs(y-raw)<.48,'visual body remains in low-step range');
  if(prev!==null){
   const a=(oldY-oldPrev)/dt,b=(y-prev)/dt;
   assert(Math.abs(b)<=Math.max(2.4,speed*.8+.6)+1e-8);
   if(prevV!==null&&i>fps/2){oldJerk+=Math.abs(a-oldV);jerk+=Math.abs(b-prevV);}
   oldV=a;prevV=b;
  }
  oldPrev=oldY;prev=y;
 }
 console.log('T3.5 stair velocity change',fps,oldJerk,jerk);
 assert(jerk<oldJerk,'step-height velocity changes should decrease '+[fps,jerk,oldJerk]);
 let lock=groundGaitTarget(null,'left',Math.PI,2.6,{x:0,y:.08,z:0},.08,0,()=>0,dt);
 assert(lock.weight>0&&lock.weight<1,'late anchor must blend in');
 for(let i=0;i<Math.ceil(.1*fps);i++)lock=groundGaitTarget(lock.state,'left',Math.PI,2.6,{x:.1,y:.08,z:0},.08,0,()=>0,dt);
 assert(Math.abs(lock.weight-1)<1e-9);
 let state=null,rawPower=0,filteredPower=0;
 for(let i=0;i<fps*4;i++){
  const yaw=.15*Math.sin(i*dt*2*Math.PI*2.5)+.3,roll=.08*Math.sin(i*dt*2*Math.PI*2.5);
  const r=runHeadFilter(state,yaw,roll,7.5,7.5,dt);state=r.state;
  if(i>=fps){rawPower+=(yaw-.3)**2+roll**2;filteredPower+=(r.yaw-.3)**2+r.roll**2;}
 }
 console.log('T3.5 head oscillation power ratio',fps,filteredPower/rawPower);
 assert(filteredPower<rawPower*.4,'running yaw/roll oscillation should decrease');
 const walk=runHeadFilter(state,.5,.2,2.6,7.5,dt);
 assert(Math.abs(walk.yaw-.5)<1e-9&&Math.abs(walk.roll-.2)<1e-9,'walk head pose remains authored');
}
console.log('PASS T3.5 visual stair velocity, smooth stance acquisition, running head yaw/roll filter');


 // T3.5 upward tread crossing: compare the actual visual support target
 // against the original exact-height step; never change collision height.
 for(const fps of [30,60,120])for(const speed of [1.3,2.6,5.2])for(const lock of [0,1]){
  const dt=1/fps,stair=x=>x>=0?.22:0;
  let previous=null,oldPrevious=null,max=0,oldMax=0;
  for(let i=0;i<fps;i++){
   const x=-.6+i*dt*speed,exact=stair(x),feetY=exact;
   const anticipated=anticipateFootStep(x,0,exact,feetY,speed,0,stair,lock);
   assert(anticipated>=exact-1e-10&&anticipated<=.22+1e-10,'bounded exact support');
   if(previous!==null){max=Math.max(max,Math.abs(anticipated-previous));oldMax=Math.max(oldMax,Math.abs(exact-oldPrevious));}
   previous=anticipated;oldPrevious=exact;
  }
  assert(oldMax===.22&&max<oldMax,'ascending step target must not snap '+[fps,speed,lock,max]);
  if(fps===60&&speed===2.6)console.log('T3.5 upward ankle support max delta',lock,oldMax,max);
 }
 const riser=(x,z)=>z>=0?.22:0;
 const smooth=(x,z)=>x*.8;
 assert(anticipateFootStep(0,-.10,0,0,0,2.6,riser)>0,'rotated stair approach');
 assert(anticipateFootStep(-.10,0,0,0,2.6,0,x=>x>=0?.8:0)===0,'tall ledge cannot lift the leg');
 assert(anticipateFootStep(0,0,0,0,2.6,0,smooth)===0,'continuous grade is not a step');
 assert(anticipateFootStep(.10,0,.22,.22,-2.6,0,x=>x>=0?.22:0)===.22,'descent retains exact support');
 assert(anticipateFootStep(-.10,0,0,0,0,0,x=>x>=0?.22:0)===0,'idle remains planted');
 assert(anticipateFootStep(-.10,0,0,0,2.6,0,x=>x>=0?null:0)===0,'missing surface cannot lift leg');
 console.log('PASS T3.5 upward ankle anticipation, exact tread and non-step preservation');
