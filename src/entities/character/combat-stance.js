// Keep a supporting ankle planted while the pelvis turns and shifts weight.
// Foot anchors are world-space. Only the visual skeleton is adjusted.
function solveLeg(actor,side,target,heel){
 const {model,B}=actor,hip=B['thigh_'+side],knee=B['shin_'+side],foot=B['foot_'+side];
 const scale=model.getWorldScale(hip.position.clone()).x;
 const origin=hip.getWorldPosition(hip.position.clone());
 const ankle=target.clone();
 const direction=ankle.sub(origin);
 const a=knee.position.length()*scale,b=foot.position.length()*scale;
 const distance=Math.max(Math.abs(a-b)+.001,Math.min(a+b-.0001,direction.length()));
 direction.normalize();
 const forward=hip.position.clone().set(0,0,1).transformDirection(model.matrixWorld);
 forward.addScaledVector(direction,-forward.dot(direction)).normalize();
 const along=(distance*distance+a*a-b*b)/(2*distance);
 const bend=Math.sqrt(Math.max(0,a*a-along*along));
 const joint=origin.clone().addScaledVector(direction,along).addScaledVector(forward,bend);
 const end=origin.clone().addScaledVector(direction,distance);
 const parent=hip.parent.getWorldQuaternion(hip.quaternion.clone()).invert();
 hip.quaternion.setFromUnitVectors(knee.position.clone().normalize(),joint.clone().sub(origin).normalize().applyQuaternion(parent));
 const upper=hip.getWorldQuaternion(hip.quaternion.clone()).invert();
 knee.quaternion.setFromUnitVectors(foot.position.clone().normalize(),end.sub(joint).normalize().applyQuaternion(upper));
 const leg=knee.getWorldQuaternion(knee.quaternion.clone()).invert();
 foot.quaternion.copy(leg.multiply(model.getWorldQuaternion(foot.quaternion.clone())));
 if(heel)foot.rotateX(heel);
}

export function applyCombatStance(actor,swing,grounded,speed){
 if(!actor.model||!actor.B.foot_left)return;
 const weight=grounded&&swing?swing.weight*Math.max(0,1-speed/.65):0;
 if(weight<.015){actor._combatStance=null;return;}
 const support=swing.side===1?'left':'right',rear=support==='left'?'right':'left';
 let stance=actor._combatStance;
 if(!stance||stance.support!==support){
  const foot=side=>actor.B['foot_'+side].getWorldPosition(actor.B['foot_'+side].position.clone());
  stance=actor._combatStance={support,left:foot('left'),right:foot('right')};
 }
 const units=actor.units;
 const supportLocal=actor.model.worldToLocal(stance[support].clone());
 actor.B.pelvis.position.x+=(supportLocal.x>0?1:-1)*.025*weight/units;
 actor.B.pelvis.position.z+=(-.025*swing.pull+.045*swing.extension)*weight/units;
 actor.B.pelvis.position.y-=.012*weight/units;
 solveLeg(actor,support,stance[support],0);
 const back=actor.model.worldToLocal(stance[rear].clone());
 back.z-=.075*swing.pull*weight/units;
 back.y+=.012*swing.extension*weight/units;
 solveLeg(actor,rear,actor.model.localToWorld(back),-.22*swing.extension*weight);
}
