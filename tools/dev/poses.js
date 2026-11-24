import {attentionRotations} from '../../src/entities/character/attention-pose.js';
import {poseGrip} from '../../src/entities/character/avatar-motion.js';

const bends = {
  bend: {upper_arm_right:[40,25], forearm_right:[90,0], upper_arm_left:[45,25], forearm_left:[90,0]},
  twist: {upper_arm_right:[30,50], forearm_right:[70,25], upper_arm_left:[30,50], forearm_left:[70,25], head:[25,30], neck:[20,10]}
};

export const poses = {
  attention:'차렷',
  bend:'팔꿈치 굽힘',
  twist:'비틀기',
  ik:'손 IK',
  walk:'보행'
};

export function poseActor(T, actor, pose) {
  actor.pose(bends[pose]);
  if (pose === 'attention') {
    for (const [name,r] of Object.entries(attentionRotations(actor.data.bones))) {
      actor.B[name].quaternion.setFromRotationMatrix(new T.Matrix4().fromArray([
        r[0],r[1],r[2],0,r[3],r[4],r[5],0,r[6],r[7],r[8],0,0,0,0,1
      ]));
    }
  }
  if (pose === 'walk') {
    actor.speed = 2.6;
    actor.animate(1/60, 0.5);
  }
  actor.group.updateMatrixWorld(true);
  if (pose === 'ik') {
    poseGrip(T, actor, 'right', new T.Vector3(-.22,1.28,.38),
      new T.Vector3(.1,.8,.6).normalize(), new T.Vector3(1,0,0), new T.Vector3(-1,-.7,-.2));
    actor.group.updateMatrixWorld(true);
  }
}
