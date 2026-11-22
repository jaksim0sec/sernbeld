const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// Authored in the studio joint axes (degrees), with the existing combat timeline as clock.
export function animatePlayer(actor,dt,t,player,swingPose,equip){
 const speed=Math.hypot(player.vel.x,player.vel.z),run=clamp(speed/5,0,1),walk=clamp(speed/1.5,0,1);
 actor.phase+=speed*dt*(player.running?3.5:4.4);
 const sn=Math.sin(actor.phase),cs=Math.cos(actor.phase),ground=player.onGround&&!player.swimming;
 const weight=ground?walk:0;
 const angles={thigh_left:[sn*(25+12*run)*weight,0],thigh_right:[-sn*(25+12*run)*weight,0],
  shin_left:[Math.max(0,-cs)*(38+22*run)*weight],shin_right:[Math.max(0,cs)*(38+22*run)*weight],
  foot_left:[-sn*9*weight],foot_right:[sn*9*weight],pelvis:[2*run,0],
  ribcage:[Math.sin(t*1.7)*.8+4*run,-sn*4*weight],head:[0,-player.pitch*180/Math.PI*.35],
  upper_arm_left:[-sn*20*weight,3],upper_arm_right:[sn*20*weight,3],
  forearm_left:[12+8*run,0],forearm_right:[12+8*run,0],hand_left:[0,0,0],hand_right:[0,0,0]};
 if(!ground){
  if(player.swimming){
   angles.upper_arm_left=[55+Math.sin(t*3)*25,35];angles.upper_arm_right=[55-Math.sin(t*3)*25,35];
   angles.thigh_left=[Math.sin(t*4)*18,0];angles.thigh_right=[-Math.sin(t*4)*18,0];
  }else{angles.thigh_left=[18,0];angles.thigh_right=[-8,0];angles.shin_left=[28];angles.shin_right=[18];}
 }
 if(swingPose){
  const p=swingPose,side=p.side===1?'right':'left',other=side==='right'?'left':'right';
  angles['upper_arm_'+side]=[15+65*p.weight+12*p.pull-24*p.extension,8+23*p.weight];
  angles['forearm_'+side]=[12+72*p.pull+25*p.weight-28*p.extension,p.arc*13];
  angles['hand_'+side]=[p.recoil*14,-p.extension*15,p.arc*12];
  angles['upper_arm_'+other]=[10+20*p.weight,6];angles['forearm_'+other]=[15+25*p.weight,0];
  angles.ribcage=[3+8*p.extension-4*p.pull,-p.arc*p.weight*12];
  angles.pelvis=[2+3*p.extension,p.side*3*p.weight];
 }
 actor.pose(angles);
 if(swingPose){
  // Horizontal shoulder sweep is an additional degree of freedom around the anatomical joint.
  const side=swingPose.side===1?'right':'left';
  actor.B['upper_arm_'+side].rotateY(-swingPose.arc*swingPose.weight*.65);
 }
 actor.B.pelvis.position.copy(actor.rest.pelvis);
 actor.B.pelvis.position.y-=ground?Math.abs(cs)*.012*weight:0;
 for(const side of ['right','left'])actor.grip(side,equip?.[side]?1:.15);
}

// Solve actual skinned shoulder/elbow/wrist joints. Targets come from the original 1P motion.
export function solveArm(T,actor,side,targetWorld,orientationWorld){
 const upper=actor.B['upper_arm_'+side],lower=actor.B['forearm_'+side],hand=actor.B['hand_'+side];
 actor.group.updateMatrixWorld(true);
 const shoulder=upper.getWorldPosition(new T.Vector3()),wrist=targetWorld.clone();
 const l1=lower.position.length()*actor.units*actor.group.scale.x,l2=hand.position.length()*actor.units*actor.group.scale.x;
 const direction=wrist.sub(shoulder),distance=clamp(direction.length(),Math.abs(l1-l2)+.001,l1+l2-.002);direction.normalize();
 const along=(distance*distance+l1*l1-l2*l2)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along));
 const pole=new T.Vector3(side==='right'?-.6:.6,-1,0).transformDirection(actor.group.matrixWorld);
 pole.addScaledVector(direction,-pole.dot(direction)).normalize();
 const elbow=shoulder.clone().addScaledVector(direction,along).addScaledVector(pole,height);
 const parentQ=upper.parent.getWorldQuaternion(new T.Quaternion());
 const upperQ=new T.Quaternion().setFromUnitVectors(lower.position.clone().normalize(),elbow.clone().sub(shoulder).normalize());
 upper.quaternion.copy(parentQ.invert().multiply(upperQ));
 actor.group.updateMatrixWorld(true);
 const lowerQ=new T.Quaternion().setFromUnitVectors(hand.position.clone().normalize(),shoulder.clone().addScaledVector(direction,distance).sub(elbow).normalize());
 lower.quaternion.copy(upper.getWorldQuaternion(new T.Quaternion()).invert().multiply(lowerQ));
 actor.group.updateMatrixWorld(true);
 hand.quaternion.copy(lower.getWorldQuaternion(new T.Quaternion()).invert().multiply(orientationWorld));
}
