const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

// Locomotion speeds are authored in the world config. Stride grows with speed so the
// cadence stays human: about 1.7 steps/s while strolling and 2.7 steps/s at a run.
export const strideLength=speed=>clamp(.9+.55*speed,1.2,3.8);
export const gaitPhaseStep=(speed,dt)=>speed*dt*2*Math.PI/strideLength(speed);

// The standalone schoolyard V3 motion pipeline replaces the old sinusoidal
// body animator. Weapon IK and weapon-mount implementation below remain intact.
export {SCHOOLYARD_CLIPS,sampleSchoolyardClip} from './schoolyard-motion.js';
import {createSchoolyardMotion} from './schoolyard-motion.js';
export function animatePlayer(actor,dt,t,player,swingPose,equip,{first=false,runSpeed=5,turnRate=null,turnStep=0,gazeYaw=0,gaitSpeed=Math.hypot(player.vel.x,player.vel.z)}={}){
 // A cylindrical handle needs a partially curled grasp, not the full bare fist.
 const fist=side=>equip?.[side] ? .82 : (swingPose&&(swingPose.side===1)===(side==='right')&&swingPose.weight>.05) ? 1 : first ? .35 : .15;
 const heading=player.facingYaw??player.yaw;
 const backpedal=player.keyboardSteering&&!player.swimming&&!player.slide&&
  player.vel.x*Math.sin(heading)+player.vel.z*Math.cos(heading)>.08;
 const gait=gaitPhaseStep(gaitSpeed,dt),turn=Math.abs(turnStep)*2.2;
 // Preserve the original forward/turning cadence; only reverse translation reverses the stride.
 const phaseStep=backpedal&&gait>turn?-gait:Math.max(gait,turn);
 actor.phase=(actor.phase+phaseStep+2*Math.PI)%(2*Math.PI);
 const motion=actor._schoolyardMotion??(actor._schoolyardMotion=createSchoolyardMotion(actor));
 const response=motion.update(dt,t,player,swingPose,{first,runSpeed,turnRate,gazeYaw,gaitSpeed});
 // The reference special clip authors finger joints individually. Do not
 // overwrite those tracks with the generic fist curl when previewed later.
 if(motion.active!=='specialRoundKick')for(const side of ['right','left'])actor.grip(side,fist(side),Boolean(equip?.[side]));
 return response;
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
  // Locate the rod inside the flexed fingertips, centred at the finger bases.
  // The previous +6 mm longitudinal offset placed its axis beyond the knuckle
  // line; a 17 mm palmar offset then separated the shaft from the curled digits.
  const grip=index.add(middle).add(ring).multiplyScalar(1/3).sub(wrist)
   .addScaledVector(palm,.006/actor.units);
  const mount=frame.clone().multiply(new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(
   new T.Vector3(0,-1,0),new T.Vector3(0,0,1),new T.Vector3(-1,0,0))));
  rig[side]={frame,frameInv:frame.clone().invert(),grip,mount,palm:palm.clone(),
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

// An elbow is not a ball joint: cap flexion at the model's 128-degree range.
// Calculate the minimum wrist distance from the law of cosines, rather than
// letting IK invert its pole when the target is too close to the shoulder.
export function clampArmReach(l1,l2,desired,maxFlex=128){
 const min=Math.sqrt(Math.max(0,l1*l1+l2*l2+2*l1*l2*Math.cos(maxFlex*Math.PI/180)));
 const max=Math.max(0,l1+l2-.001);
 return clamp(Number.isFinite(desired)?desired:max,Math.min(min,max),max);
}

// Two-bone IK with an explicit elbow pole and forearm twist sharing.
// wristW and handQW are world-space. poleW points where the elbow should go.
export function solveArmChain(T,actor,side,wristW,handQW,poleW,{twistShare=.5}={}){
 const rig=armRig(T,actor)[side];
 const upper=actor.B['upper_arm_'+side],lower=actor.B['forearm_'+side],hand=actor.B['hand_'+side];
 const scale=actor.units*actor.group.scale.x;
 const l1=lower.position.length()*scale,l2=hand.position.length()*scale;
 const shoulder=upper.getWorldPosition(new T.Vector3());
 const toWrist=wristW.clone().sub(shoulder);
 const distance=clampArmReach(l1,l2,toWrist.length());
 const dir=toWrist.lengthSq()>1e-12?toWrist.normalize():rig.upperRest.clone().transformDirection(upper.parent.matrixWorld);
 const pole=poleW.clone().addScaledVector(dir,-poleW.dot(dir));
 if(pole.lengthSq()<1e-8&&rig.previousPole) pole.copy(rig.previousPole).addScaledVector(dir,-rig.previousPole.dot(dir));
 if(pole.lengthSq()<1e-8){
  const fallback=Math.abs(dir.y)<.8?new T.Vector3(0,1,0):new T.Vector3(1,0,0);
  pole.copy(fallback).addScaledVector(dir,-fallback.dot(dir));
 }
 pole.normalize();
 if(rig.previousPole)rig.previousPole.copy(pole);else rig.previousPole=pole.clone();
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

// Both reach fitting and IK use the same anatomical wrist target.
export function surfaceHandTarget(T,actor,side,contact,normal,fingers){
 const rig=armRig(T,actor)[side];
 const palm=normal.clone().negate();
 const x=palm.multiplyScalar(side==='right'?1:-1);
 const y=fingers.clone().negate().addScaledVector(x,fingers.dot(x)).normalize();
 const z=new T.Vector3().crossVectors(x,y);
 const orientation=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z)).multiply(rig.frameInv);
 const wrist=contact.clone().sub(rig.grip.clone().multiplyScalar(actor.units*actor.group.scale.x).applyQuaternion(orientation));
 return {wrist,orientation};
}

// Fit the visual torso to planted hands in the wall-normal/vertical plane.
// Preserve lateral grip spacing and the original anatomical elbow limits.
export function fitSurfaceReachOffset(holds){
 let outward=0,vertical=0,weight=0;
 for(const h of holds)weight=Math.max(weight,h.weight);
 for(let pass=0;pass<10;pass++)for(const h of holds){
  if(h.weight<=0)continue;
  const x=h.x-outward,y=h.y-vertical,r=Math.hypot(x,y),d=Math.hypot(r,h.lateral);
  const target=clamp(d,h.min,h.max);
  if(Math.abs(d-target)<1e-7||r<1e-8)continue;
  const allowed=Math.sqrt(Math.max(0,target*target-h.lateral*h.lateral));
  const factor=(1-allowed/r)*Math.min(1,h.weight*2);
  outward=clamp(outward+x*factor,-.08,.08);
  vertical=clamp(vertical+y*factor,-.28,.28);
 }
 return {outward:outward*weight,vertical:vertical*weight};
}
export function fitSurfaceHandReach(T,actor,holds,outward){
 const scale=actor.units*actor.group.scale.x;
 const constraints=holds.filter(h=>h.hand&&h.handWeight>0).map(h=>{
  const {wrist}=surfaceHandTarget(T,actor,h.side,h.palm,h.hand.normal,h.fingers);
  const shoulder=actor.B['upper_arm_'+h.side].getWorldPosition(new T.Vector3());
  const delta=wrist.sub(shoulder),x=delta.dot(outward),y=delta.y;
  const l1=actor.B['forearm_'+h.side].position.length()*scale;
  const l2=actor.B['hand_'+h.side].position.length()*scale;
  return {x,y,lateral:Math.sqrt(Math.max(0,delta.lengthSq()-x*x-y*y)),
   min:clampArmReach(l1,l2,0)+.004,max:clampArmReach(l1,l2,Infinity)-.006,weight:h.handWeight};
 });
 const correction=fitSurfaceReachOffset(constraints);
 return outward.clone().multiplyScalar(correction.outward).add(new T.Vector3(0,correction.vertical,0));
}
export function poseSurfaceHand(T,actor,side,contact,normal,fingers,pole,weight){
 if(weight<=0)return;
 const hand=actor.B['hand_'+side];
 const {wrist,orientation}=surfaceHandTarget(T,actor,side,contact,normal,fingers);
 const current=hand.getWorldPosition(new T.Vector3()).lerp(wrist,weight);
 const rotation=hand.getWorldQuaternion(new T.Quaternion()).slerp(orientation,weight);
 return solveArmChain(T,actor,side,current,rotation,pole);
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
 const idleA=-s*.12,targetA=-s*arc*(first?.72:.85);
 const a=idleA+(targetA-idleA)*w;
 const follow=active?(swing.travel??0)**2:0;
 const e=(first?.72:.86)+w*(.31*pull-.46*ext-.85*follow)+.08*rec;
 const blade=dirAt(T,a,e);
 const handA=a*(first?.48:.80)+s*.24*follow*w;
 const r=(first?.39:.30)+w*(.19*ext+.08*follow-.035*pull)-.03*rec;
 const side0=(first?.17*narrow:.27)*(1-.63*w);
 const grip=dirAt(T,handA,0).multiplyScalar(r).addScaledVector(out,side0);
 grip.y+=(first?-.21:-.35)+w*(.24*pull+.12*ext-.12*follow);
 if(first&&moving){grip.y+=Math.sin(phase*2)*.007*moving;grip.x+=Math.sin(phase)*.006*moving;}
 const inward=dirAt(T,a+s*Math.PI/2,w*(.10*pull-.32*follow));
 const pole=out.clone().multiplyScalar(.75).add(new T.Vector3(0,-.65,-.15));
 return {grip,blade,inward,pole,show:true};
}
