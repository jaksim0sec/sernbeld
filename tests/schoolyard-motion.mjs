import assert from 'node:assert/strict';
import {createSchoolyardMotion,SCHOOLYARD_CLIPS,sampleSchoolyardClip,pivotFootTarget} from '../src/entities/character/schoolyard-motion.js';
import {SCHOOLYARD_REFERENCE_ABILITIES} from '../src/entities/character/schoolyard-reference-clips.js';

// Regression: animation must never own world translation or terrain step-up.
const names=['pelvis','waist','ribcage','neck','head','thigh_left','thigh_right','shin_left','shin_right','foot_left','foot_right','upper_arm_left','upper_arm_right','forearm_left','forearm_right'];
const bones=names.map(id=>({id,axes:Array.from({length:id.startsWith('shin_')?1:2},()=>({min:-40,max:120}))}));
let lastPose=null;
const actor={data:{bones},phase:0,rest:{pelvis:{y:0}},B:{pelvis:{position:{y:0,copy(v){this.y=v.y;}}}},pose(angles){lastPose=angles;}};
const motion=createSchoolyardMotion(actor);
const player={vel:{x:2,z:1},pos:{x:12,y:1.2,z:-5},onGround:true,pitch:.1,yaw:.2,swimming:false};
const origin={...player.pos};
for(let frame=0;frame<300;frame++){
 actor.phase+=.12;
 if(frame===75)player.onGround=false;
 if(frame===105)player.onGround=true;
 motion.update(1/60,frame/60,player,null,{runSpeed:5});
 for(const b of bones)for(const value of lastPose[b.id])
  assert(value>=-40&&value<=120&&Number.isFinite(value),'joint out of range: '+b.id);
}
assert.deepEqual(player.pos,origin,'animation modified physical movement (step-up regression)');
player.onGround=false;
player.vel.y=5;
for(let frame=0;frame<16;frame++)motion.update(1/60,5+frame/60,player,null);
const raisedKnee=lastPose.thigh_left[0],risingFront=lastPose.shin_left[0],risingRear=lastPose.shin_right[0];
assert(raisedKnee>45&&risingFront>risingRear,'Takeoff should lift the front knee first');
player.vel.y=-4;
for(let frame=0;frame<16;frame++)motion.update(1/60,6+frame/60,player,null);
assert(lastPose.thigh_left[0]<raisedKnee&&lastPose.shin_left[0]<risingFront-25,'Front leg should reach toward the ground during descent');
assert(lastPose.shin_right[0]>risingRear+25,'Rear knee should fold back during descent');
for(const name of ['frontKick','roundKick','palmChop','dropKick','specialRoundKick'])
 assert(SCHOOLYARD_CLIPS[name]&&sampleSchoolyardClip(name,.2),'missing registered-only move: '+name);
assert.equal(motion.active,null,'unused clips must not auto-play');
console.log('PASS schoolyard motion joints / registered clips / world-translation ownership');

assert.equal(SCHOOLYARD_REFERENCE_ABILITIES.yeot.ch.length,40,'exact source channels missing');
assert.equal(SCHOOLYARD_REFERENCE_ABILITIES.yareung.keys.length,7,'exact reference keyframes truncated');
assert(sampleSchoolyardClip('specialRoundKick',.3).index_right_0?.[0]>0,'special kick finger keyframes not sampled');

// Stationary A/D alternates lifted knees without changing world position.
for(const rate of [-2.4,2.4]){
 const pivotPlayer={...player,vel:{x:0,y:0,z:0},onGround:true,keyboardSteering:true};
 const driver=createSchoolyardMotion(actor);let left=false,right=false,response;
 for(let i=0;i<180;i++){
  response=driver.update(1/60,i/60,pivotPlayer,null,{turnRate:rate});
  left||=lastPose.shin_left[0]-lastPose.shin_right[0]>15;
  right||=lastPose.shin_right[0]-lastPose.shin_left[0]>15;
 }
 assert(left&&right,'stationary pivot did not alternate lifted legs');
 assert(response.pivotWeight>.95,'stationary pivot blend too weak');
 assert.deepEqual(pivotPlayer.pos,origin);
 for(let i=0;i<60;i++)response=driver.update(1/60,3+i/60,pivotPlayer,null,{turnRate:0});
 assert.equal(response.pivotWeight,0,'pivot did not settle at idle');
 response=driver.update(1/60,5,pivotPlayer,null,{turnRate:rate,gaitSpeed:2.6});
 assert.equal(response.pivotWeight,0,'pivot altered walking gait');
}
let planted=null,swing=null;const p0={x:.1,z:0};
for(let i=0;i<20;i++){
 const phase=.05+i*.14,neutral={x:.1*Math.cos(phase),z:.1*Math.sin(phase)};
 const l=pivotFootTarget(planted,'right',phase,p0,neutral,1);planted=l.state;
 assert.equal(l.x,p0.x);assert.equal(l.z,p0.z);assert.equal(l.lift,0);
 const s=pivotFootTarget(swing,'left',phase,p0,neutral,1);swing=s.state;
 assert(s.lift>0,'swing foot not lifted');
}
console.log('PASS stationary pivot alternating knees, planted support, swing lift, idle and walking preservation');
