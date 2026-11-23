const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

// Locomotion speeds are authored in the world config. Stride grows with speed so the
// cadence stays human: about 1.7 steps/s while strolling and 2.7 steps/s at a run.
export const strideLength=speed=>clamp(.9+.55*speed,1.2,3.8);
export const gaitPhaseStep=(speed,dt)=>speed*dt*2*Math.PI/strideLength(speed);

// Authored in the studio joint axes (degrees), with the existing combat timeline as clock.
// In first person the body is camera-locked and invisible below the arms, so only the
// fingers are animated here; the arms come from the IK poses below.
export function animatePlayer(actor,dt,t,player,swingPose,equip,{first=false,runSpeed=5}={}){
 // Closed fist for a held weapon or a punch in progress.
 const fist=side=>equip?.[side]||(swingPose&&(swingPose.side===1)===(side==='right')&&swingPose.weight>.05)?1:first?.35:.15;
 const speed=Math.hypot(player.vel.x,player.vel.z),walk=clamp(speed/1.2,0,1);
 const run=clamp((speed-2.4)/Math.max(.5,runSpeed-2.4),0,1);
 actor.phase+=gaitPhaseStep(speed,dt);
 const sn=Math.sin(actor.phase),cs=Math.cos(actor.phase),ground=player.onGround&&!player.swimming;
 if(first){
  actor.pose({});
  actor.B.pelvis.position.copy(actor.rest.pelvis);
  for(const side of ['right','left'])actor.grip(side,fist(side));
  return;
 }
 const weight=ground?walk:0;
 const angles={thigh_left:[sn*(24+14*run)*weight,0],thigh_right:[-sn*(24+14*run)*weight,0],
  shin_left:[Math.max(0,-cs)*(34+30*run)*weight],shin_right:[Math.max(0,cs)*(34+30*run)*weight],
  foot_left:[-sn*9*weight],foot_right:[sn*9*weight],pelvis:[2+3*run,0],
  ribcage:[Math.sin(t*1.7)*.8+5*run*weight,-sn*4*weight],head:[-3*run*weight,-player.pitch*180/Math.PI*.35],
  upper_arm_left:[-sn*(16+18*run)*weight,4],upper_arm_right:[sn*(16+18*run)*weight,4],
  forearm_left:[12+34*run*weight,0],forearm_right:[12+34*run*weight,0],hand_left:[0,0,0],hand_right:[0,0,0]};
 if(!ground){
  if(player.swimming){
   angles.upper_arm_left=[55+Math.sin(t*3)*25,35];angles.upper_arm_right=[55-Math.sin(t*3)*25,35];
   angles.thigh_left=[Math.sin(t*4)*18,0];angles.thigh_right=[-Math.sin(t*4)*18,0];
  }else{angles.thigh_left=[18,0];angles.thigh_right=[-8,0];angles.shin_left=[28];angles.shin_right=[18];}
 }
 if(swingPose){
  const p=swingPose;
  angles.ribcage=[3+6*p.extension*p.weight-3*p.pull*p.weight,-p.arc*p.weight*10];
  angles.pelvis=[2+2*p.extension*p.weight,p.side*3*p.weight];
 }
 actor.pose(angles);
 actor.B.pelvis.position.copy(actor.rest.pelvis);
 actor.B.pelvis.position.y-=ground?Math.abs(cs)*(.010+.012*run)*weight:0;
 for(const side of ['right','left'])actor.grip(side,fist(side));
}

// ---------------------------------------------------------------------------
// Grip frames. A hand bone has identity rest rotation, so its local axes are the
// model axes. The anatomical frame is measured from the finger pivots instead:
//   gY: knuckles -> wrist (back along the hand), gZ: pinky -> index (handle axis),
//   gX: gY x gZ. A weapon's +Y (blade) leaves the fist along gZ, its edge or axe bit
//   faces the knuckles (-gY) and its flat faces the palm.
function armRig(T,actor){
 if(actor._armRig)return actor._armRig;
 const pivot=id=>new T.Vector3(...actor.data.bones.find(b=>b.id===id).pivot).multiplyScalar(1/1428);
 const rig={};
 for(const side of ['right','left']){
  const wrist=pivot('hand_'+side),index=pivot('index_'+side+'_0'),middle=pivot('middle_'+side+'_0');
  const ring=pivot('ring_'+side+'_0'),pinky=pivot('pinky_'+side+'_0');
  const F=middle.clone().sub(wrist).normalize(),A=index.clone().sub(pinky).normalize();
  const gY=F.clone().negate(),gZ=A.addScaledVector(F,-A.dot(F)).normalize(),gX=new T.Vector3().crossVectors(gY,gZ);
  const frame=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(gX,gY,gZ));
  const palm=side==='right'?gX.clone():gX.clone().negate();
  // Handle centre: just inside the knuckle line, towards the palm.
  const grip=index.add(middle).add(ring).multiplyScalar(1/3).sub(wrist)
   .addScaledVector(palm,.017/actor.units).addScaledVector(F,.006/actor.units);
  const mount=frame.clone().multiply(new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(
   new T.Vector3(0,-1,0),new T.Vector3(0,0,1),new T.Vector3(-1,0,0))));
  rig[side]={frame,frameInv:frame.clone().invert(),grip,mount,
   upperRest:actor.B['forearm_'+side].position.clone().normalize(),
   lowerRest:actor.B['hand_'+side].position.clone().normalize()};
 }
 return actor._armRig=rig;
}
export function gripFrame(T,actor,side){return armRig(T,actor)[side];}

// Attach a weapon mesh (+Y blade, handle at userData.handleY metres) to the hand bone.
export function mountWeapon(T,actor,side,item){
 const g=armRig(T,actor)[side],handleY=Number.isFinite(item.userData.handleY)?item.userData.handleY:-.08;
 item.quaternion.copy(g.mount);item.scale.setScalar(1/actor.units);
 item.position.copy(g.grip).sub(new T.Vector3(0,handleY/actor.units,0).applyQuaternion(g.mount));
 item.userData.grip=g.grip.clone();item.userData.handleY=handleY;item.userData.side=side;
 return item;
}

const _q=[],_v=[];
function frameQuat(T,dir,normal,out){
 const x=dir.clone().normalize(),y=normal.clone().addScaledVector(x,-normal.dot(x));
 if(y.lengthSq()<1e-10)y.set(0,1,0).addScaledVector(x,-x.y);
 y.normalize();
 return out.setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,new T.Vector3().crossVectors(x,y)));
}
// Rotation taking the local frame (dirL, normalL) onto the world frame (dirW, normalW).
function alignFrames(T,dirL,normalL,dirW,normalW){
 const a=frameQuat(T,dirL,normalL,new T.Quaternion()),b=frameQuat(T,dirW,normalW,new T.Quaternion());
 return b.multiply(a.invert());
}
function twistAbout(T,q,axis){
 const p=new T.Vector3(q.x,q.y,q.z),d=axis.dot(p);
 const t=new T.Quaternion(axis.x*d,axis.y*d,axis.z*d,q.w);
 return t.lengthSq()<1e-12?new T.Quaternion():t.normalize();
}

// Two-bone IK with an explicit elbow pole and forearm twist sharing.
// wristW and handQW are world-space. poleW points where the elbow should go.
export function solveArmChain(T,actor,side,wristW,handQW,poleW,{twistShare=.5}={}){
 const rig=armRig(T,actor)[side];
 const upper=actor.B['upper_arm_'+side],lower=actor.B['forearm_'+side],hand=actor.B['hand_'+side];
 actor.group.updateMatrixWorld(true);
 const scale=actor.units*actor.group.scale.x;
 const l1=lower.position.length()*scale,l2=hand.position.length()*scale;
 const shoulder=upper.getWorldPosition(new T.Vector3());
 const toWrist=wristW.clone().sub(shoulder);
 const distance=clamp(toWrist.length(),Math.abs(l1-l2)+1e-3,l1+l2-1e-3),dir=toWrist.normalize();
 const pole=poleW.clone().addScaledVector(dir,-poleW.dot(dir));
 if(pole.lengthSq()<1e-8)pole.set(0,-1,0).addScaledVector(dir,dir.y);
 pole.normalize();
 const along=(distance*distance+l1*l1-l2*l2)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along));
 const elbow=shoulder.clone().addScaledVector(dir,along).addScaledVector(pole,height);
 const wrist=shoulder.clone().addScaledVector(dir,distance);
 // Hinge plane normal. At rest the forearm flexes forward about -X.
 const bend=new T.Vector3().crossVectors(pole,dir).normalize(),restBend=new T.Vector3(-1,0,0);
 const parentQ=upper.parent.getWorldQuaternion(new T.Quaternion());
 const upperW=alignFrames(T,rig.upperRest,restBend,elbow.clone().sub(shoulder),bend);
 upper.quaternion.copy(parentQ.clone().invert().multiply(upperW));
 let lowerW=alignFrames(T,rig.lowerRest,restBend,wrist.clone().sub(elbow),bend);
 // Share the wrist twist with the forearm (pronation/supination) to avoid a candy-wrapper wrist.
 const handLocal=lowerW.clone().invert().multiply(handQW);
 const twist=twistAbout(T,handLocal,rig.lowerRest);
 lowerW=lowerW.multiply(new T.Quaternion().slerp(twist,twistShare));
 lower.quaternion.copy(upperW.clone().invert().multiply(lowerW));
 hand.quaternion.copy(lowerW.clone().invert().multiply(handQW));
 actor.group.updateMatrixWorld(true);
 return {elbow,wrist,reach:distance/(l1+l2)};
}

// Pose an arm so the grip centre sits at gripW with the weapon's +Y along bladeW.
// inwardW is the direction the palm should face (projected off the blade axis).
export function poseGrip(T,actor,side,gripW,bladeW,inwardW,poleW,options){
 const rig=armRig(T,actor)[side];
 const gZ=bladeW.clone().normalize();
 const palm=inwardW.clone().addScaledVector(gZ,-inwardW.dot(gZ));
 if(palm.lengthSq()<1e-8)palm.set(side==='right'?1:-1,0,0);
 palm.normalize();
 const gX=side==='right'?palm:palm.negate(),gY=new T.Vector3().crossVectors(gZ,gX);
 const gripQW=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(gX,gY,gZ));
 const handQW=gripQW.multiply(rig.frameInv);
 const scale=actor.units*actor.group.scale.x;
 const wristW=gripW.clone().sub(rig.grip.clone().multiplyScalar(scale).applyQuaternion(handQW));
 return solveArmChain(T,actor,side,wristW,handQW,poleW,options);
}

// Compatibility wrapper: place the wrist at targetWorld with the given hand orientation.
export function solveArm(T,actor,side,targetWorld,orientationWorld){
 actor.group.updateMatrixWorld(true);
 const out=new T.Vector3(side==='right'?-1:1,-.6,-.35).transformDirection(actor.group.matrixWorld);
 return solveArmChain(T,actor,side,targetWorld.clone(),orientationWorld,out);
}

// ---------------------------------------------------------------------------
// Weapon/fist arcs in the body frame (+X = body's left, +Y up, +Z forward), metres.
// `base` is the anchor (eye point in first person, chest in third person).
const dirAt=(T,a,e)=>new T.Vector3(Math.sin(a)*Math.cos(e),Math.sin(e),Math.cos(a)*Math.cos(e));
export function armTargets(T,side,swing,{armed,first,aspect=1,phase=0,moving=0}){
 const s=side==='right'?1:-1;               // +1 right hand
 const out=new T.Vector3(-s,0,0);            // towards that hand's outside
 const active=Boolean(swing&&((swing.side===1)===(side==='right')));
 const w=active?swing.weight:0,pull=active?swing.pull:0,ext=active?swing.extension:0,rec=active?swing.recoil:0;
 const arc=active?swing.arc*s:0;            // + = wound up towards the hand's own side
 if(!armed){
  // Fist: guard close to the chin, then a straight punch.
  const reach=first?.30+.22*ext*w:.24+.30*ext*w;
  const grip=new T.Vector3(-s*(first?.13:.13)*(1-.5*ext*w),first?-.17+.05*ext*w:-.12+.06*ext*w,reach);
  const blade=new T.Vector3(s*.25,1,.15*ext*w).normalize();
  return {grip,blade,inward:new T.Vector3(s,0,0),pole:out.clone().multiplyScalar(.7).add(new T.Vector3(0,-.7,-.2)),show:w>.02};
 }
 const narrow=first?clamp(aspect*.75,.45,1):1;
 // Blade heading: idle slightly across the body, wind-up out to the own side,
 // follow-through across to the other side.
 const idleA=s*.28,targetA=-s*clamp(arc,-1.15,1.25)*.85;
 const a=idleA+(targetA-idleA)*w;
 const e=(first?.62:.30)+w*(.55*pull-.48*ext)+.08*rec;
 const blade=dirAt(T,a,e);
 const handA=a*(first?.45:.6);
 const r=(first?.42:.40)+w*(.10*ext-.08*pull)-.03*rec;
 const side0=(first?.17*narrow:.20)*(1-.55*w);
 const grip=dirAt(T,handA,0).multiplyScalar(r).addScaledVector(out,side0);
 grip.y+=(first?-.21:-.30)+w*(.10*pull-.04*ext);
 if(first&&moving){grip.y+=Math.sin(phase*2)*.007*moving;grip.x+=Math.sin(phase)*.006*moving;}
 const inward=dirAt(T,a+s*Math.PI/2,0);
 const pole=out.clone().multiplyScalar(.75).add(new T.Vector3(0,-.65,-.15));
 return {grip,blade,inward,pole,show:true};
}
