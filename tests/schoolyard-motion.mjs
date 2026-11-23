import assert from 'node:assert/strict';
import {createSchoolyardMotion,SCHOOLYARD_CLIPS,sampleSchoolyardClip} from '../src/entities/character/schoolyard-motion.js';

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
for(const name of ['frontKick','roundKick','palmChop','dropKick','specialRoundKick'])
 assert(SCHOOLYARD_CLIPS[name]&&sampleSchoolyardClip(name,.2),'missing registered-only move: '+name);
assert.equal(motion.active,null,'unused clips must not auto-play');
console.log('PASS schoolyard motion joints / registered clips / world-translation ownership');
