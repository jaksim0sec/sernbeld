import {normalizeStudioCharacter} from './appearance.js';
import {animatePlayer,armTargets,mountWeapon,poseGrip,poseSurfaceHand} from './avatar-motion.js';
const clamp01=x=>Math.max(0,Math.min(1,x));
const phase=(from,to,t)=>{
 const fraction=clamp01((t-from)/(to-from));
 return fraction*fraction*(3-2*fraction);
};

// Presentation-only camera math. No physics or animated bone writes.
export function smoothCameraHeight(previous,target,dt,grounded){
 if(!Number.isFinite(previous))return target;
 const next=target+(previous-target)*Math.exp(-Math.max(0,dt)*(grounded?8:14));
 return Math.max(target-.42,Math.min(target+.42,next));
}
export function solveThirdBoom({feet,aimY,yaw,pitch,near,fov,aspect,height,previous,reset,dt,worldRay}){
 const desired=3.1, margin=.075, minBoom=.85;
 const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
 const direction={x:sy*cp,y:-sp,z:cy*cp};
 const right={x:cy,y:0,z:-sy},up={x:sy*sp,y:cp,z:cy*sp};
 const pivot={x:feet.x,y:feet.y+1.23,z:feet.z};
 const target={x:feet.x,y:aimY+1.23,z:feet.z};
 const h=Math.tan(fov*Math.PI/360)*near+.025,w=h*Math.max(.5,aspect);
 const point=(length,x=0,y=0)=>({
  x:target.x+direction.x*length+right.x*x+up.x*y,
  y:target.y+direction.y*length+up.y*y,
  z:target.z+direction.z*length+right.z*x+up.z*y
 });
 const corners=[[-w,-h],[-w,h],[w,-h],[w,h]];
 const clearRay=end=>{
  if(!worldRay)return true;
  const x=end.x-pivot.x,y=end.y-pivot.y,z=end.z-pivot.z,d=Math.hypot(x,y,z);
  return d<1e-6||worldRay(pivot,{x:x/d,y:y/d,z:z/d},d+margin)>=d+margin-.001;
 };
 const clearWorld=length=>clearRay(point(length))&&corners.every(([x,y])=>clearRay(point(length-near,x,y)));
 // Both the camera and its actual near plane must stay outside the player's
 // conservative torso/head/limb envelope, even at steep pitch.
 const outside=p=>p.y<feet.y-.18||p.y>feet.y+height+.22||Math.hypot(p.x-feet.x,p.z-feet.z)>=.50;
 const clearBody=length=>outside(point(length))&&outside(point(length-near))&&corners.every(([x,y])=>outside(point(length-near,x,y)));
 let minimum=minBoom;
 while(minimum<desired&&!clearBody(minimum))minimum+=.15;
 if(minimum>desired||!clearBody(minimum))return {fallback:true,boom:0};
 let room=desired;
 if(!clearWorld(desired)){
  if(!clearWorld(minimum))return {fallback:true,boom:0};
  let lo=minimum,hi=desired;
  for(let i=0;i<6;i++){const mid=(lo+hi)*.5;if(clearWorld(mid))lo=mid;else hi=mid;}
  room=lo;
 }
 // Recovery starts outside the body, not at the compressed (inside-body) boom.
 // A little extra clearance prevents flickering at the mode threshold.
 if(!reset&&previous===0&&room<minimum+.15)return {fallback:true,boom:0};
 let boom=reset?room:Math.min(room,room+(Math.max(minimum,previous)-room)*Math.exp(-Math.max(0,dt)*8));
 // The room candidate was already world-checked above. In open space this
 // keeps the normal frame at five rays instead of checking it three times.
 if(boom!==room&&(!clearBody(boom)||!clearWorld(boom)))boom=room;
 if(!clearBody(boom))return {fallback:true,boom:0};
 return {fallback:false,boom,position:point(boom)};
}

export function createCharacterRuntime({T,scene,camera,player,Save,makeCharacter,makeWeapon,attackPose,worldRay,groundSurface,view,height,runSpeed=5}){
 let profile=normalizeStudioCharacter(Save.data.character??{body:'male'}),actor=makeCharacter(profile);
 scene.add(actor.group);actor.group.name='SERNBELD Player';
 let third=Save.data.settings.view==='third',open=false,frame=null,first=false;
 let weapons={right:null,left:null},equipped={},boom=3.1,cut=-1,lastMode=null;
 let bodyYaw=player.yaw+Math.PI,bodyCut=null,footOffset=0,gaitSpeed=0;
 const dialog=document.createElement('dialog');dialog.id='character-chooser';
 dialog.style.cssText='position:fixed;inset:0;border:0;padding:0;margin:0;width:100vw;max-width:none;height:100dvh;max-height:none;background:#181818;z-index:1000;';
 dialog.innerHTML='<iframe title="내 캐릭터 만들기" style="display:block;border:0;width:100%;height:100%"></iframe>';
 document.body.append(dialog);
 dialog.addEventListener('cancel',e=>{e.preventDefault();if(!first)closeChooser();});
 function sendProfile(){frame?.contentWindow.postMessage({type:'sernbeld:edit-character',character:profile,first},location.origin);}
 function openChooser(required=false){
  first=required;open=true;
  document.exitPointerLock?.();
  if(!frame){frame=dialog.querySelector('iframe');frame.src=new URL('./studio.html',import.meta.url).href;}
  if(!dialog.open)dialog.showModal();sendProfile();
 }
 function closeChooser(){open=false;dialog.close();}
 addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==frame?.contentWindow)return;
  if(e.data?.type==='sernbeld:studio-ready')sendProfile();
  if(e.data?.type==='sernbeld:cancel-character'&&open&&!first)closeChooser();
  if(e.data?.type==='sernbeld:apply-character'){
   try{setProfile(e.data.character);Save.data.characterCreated=true;Save.write();first=false;closeChooser();}
   catch(err){console.error('Character apply',err);}
  }
 });
 function attachWeapons(){
  for(const side of ['right','left']){
   const id=Save.data.equip?.[side]??null;if(equipped[side]===id)continue;
   weapons[side]?.removeFromParent();weapons[side]?.geometry.dispose();weapons[side]=null;equipped[side]=id;
   if(!id)continue;
   const item=makeWeapon(id);if(!item)continue;
   item.geometry.computeBoundingBox();
   item.userData.len=Math.max(.15,item.geometry.boundingBox.max.y);
   mountWeapon(T,actor,side,item);
   item.frustumCulled=false;item.castShadow=true;
   actor.B['hand_'+side].add(item);weapons[side]=item;
  }
 }
 function setProfile(raw){
  const next=normalizeStudioCharacter(raw),replacement=makeCharacter(next);
  for(const weapon of Object.values(weapons)){weapon?.removeFromParent();weapon?.geometry.dispose();}
  actor.dispose();actor=replacement;profile=next;actor.group.name='SERNBELD Player';scene.add(actor.group);
  anchors=null;headCut=null;bodyCut=null;lastHeadMode=null;headRoll=0;headMotion.set(0,0,0);weapons={right:null,left:null};equipped={};attachWeapons();Save.data.character=profile;Save.write();
 }
 function setThird(value, {persist=true}={}){
  third=Boolean(value);headCut=null;bodyCut=null;lastHeadMode=null;headRoll=0;lastMode=null;
  if(persist){Save.data.settings.view=third?'third':'first';Save.write();}
 }
 // Body-frame anchors (metres, actor group space): the shoulder midpoint and the
 // first-person eye point a little above and in front of it.
 let anchors=null;
 let cameraY=null,cameraCut=null,headPitch=0,headYaw=0;
 // Head-follow is a camera offset, never a player-world transform. This keeps
 // the existing step-up, stairs, camera wall avoidance and attack recoil.
 const headMotion=new T.Vector3(),headTarget=new T.Vector3(),headPivot=new T.Vector3(),headEye=new T.Vector3(),neutralEye=new T.Vector3();
 const yawQ=new T.Quaternion(),headQ=new T.Quaternion(),localHeadQ=new T.Quaternion(),headViewQ=new T.Quaternion();
 const headViewEuler=new T.Euler(0,0,0,'YXZ');
 const eyeBasis=new T.Vector3(0,.065,.038),tmpUp=new T.Vector3();
 let headCut=null,lastHeadMode=null,headRoll=0;
 function bodyAnchors(){
  if(anchors)return anchors;
  const pivot=id=>new T.Vector3(...actor.data.bones.find(b=>b.id===id).pivot).multiplyScalar(actor.units/1428).add(actor.model.position);
  const chest=pivot('upper_arm_left').add(pivot('upper_arm_right')).multiplyScalar(.5);
  return anchors={chest,eye:chest.clone().add(new T.Vector3(0,.19,.06)),headRest:pivot('head'),
   ankleRest:Math.min(pivot('foot_left').y,pivot('foot_right').y)};
 }
 const flipY=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI);
 const upAxis=new T.Vector3(0,1,0),displacement=new T.Vector3();
 const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
 const _grip=new T.Vector3(),_blade=new T.Vector3(),_inward=new T.Vector3(),_pole=new T.Vector3();
 function update(dt,t,combat){
  attachWeapons();
  const walking=player.mode==='walk',traversal=player.renderTraversal,firstPerson=!third&&walking&&!traversal;
  for(const weapon of Object.values(weapons))if(weapon)weapon.visible=!traversal;
  actor.group.visible=walking;actor.setFirst(firstPerson);actor.setShadow(!firstPerson);
  if(!walking){bodyCut=null;cameraCut=null;return;}
  const pose=attackPose(combat.swing),renderPos=player.renderPos??player.pos;
  const cameraReset=cameraCut!==player.teleportId;
  cameraY=smoothCameraHeight(cameraReset?null:cameraY,renderPos.y,dt,player.onGround&&!player.swimming);
  cameraCut=player.teleportId;
  const aimYaw=player.yaw+Math.PI;
  if(traversal){
   bodyYaw=Math.atan2(-traversal.action.surface.nx,-traversal.action.surface.nz);
   footOffset=gaitSpeed=0;
   poseTraversal(traversal.action,traversal.t,renderPos);
   return;
  }
  if(bodyCut!==player.teleportId){bodyYaw=aimYaw;bodyCut=player.teleportId;footOffset=0;gaitSpeed=0;actor._combatStance=null;}
  const speed=Math.hypot(player.vel.x,player.vel.z);
  gaitSpeed+=(speed-gaitSpeed)*(1-Math.exp(-dt*12));
  let turnRate=0,turnStep=0;
  if(firstPerson)bodyYaw=aimYaw;
  else{
   const target=combat.swing?(combat.swing.aimYaw??player.yaw)+Math.PI:
    speed>.12?(player.moveHeading??Math.atan2(player.vel.x,player.vel.z)):bodyYaw;
   const delta=wrap(target-bodyYaw);
   turnStep=delta*(1-Math.exp(-(pose?17:11)*dt));
   bodyYaw+=turnStep;
   turnRate=turnStep/Math.max(.001,dt);
  }
  if(!firstPerson){
   actor.group.position.copy(renderPos);
   actor.group.quaternion.setFromAxisAngle(upAxis,bodyYaw);
  }
  animatePlayer(actor,dt,t,player,pose,Save.data.equip,{
   first:firstPerson,runSpeed,turnRate:firstPerson?null:turnRate,turnStep,gaitSpeed,
   gazeYaw:firstPerson?0:wrap(aimYaw-bodyYaw)
  });
  const {chest,eye,headRest,ankleRest}=bodyAnchors();
  if(firstPerson){
   // Keep the eye anchor independent of the actor's floor-clamped render Y.
   const yOffset=cameraY-renderPos.y;
   if(Math.abs(yOffset)>1e-6){
    const dir=new T.Vector3(0,Math.sign(yOffset),0),distance=Math.abs(yOffset);
    const safe=worldRay?Math.max(0,Math.min(distance,worldRay(camera.position,dir,distance+.075)-.075)):distance;
    camera.position.addScaledVector(dir,safe);
   }
   // First evaluate the skeleton in world/player space, BEFORE camera-locking the
   // first-person arms. Otherwise the head follows the camera and cannot drive it.
   actor.group.position.copy(renderPos);
   yawQ.setFromAxisAngle(upAxis,aimYaw);
   actor.group.quaternion.copy(yawQ);
   actor.B.head.getWorldPosition(headTarget);
   actor.B.head.getWorldQuaternion(headQ);
   headPivot.copy(headRest).applyMatrix4(actor.group.matrixWorld);
   // Imported schoolyard eye-frame model: eye is offset from the animated head
   // in head-local coordinates, not glued to the weapon or pelvis.
   headEye.copy(eyeBasis).applyQuaternion(headQ);
   neutralEye.copy(eyeBasis).applyQuaternion(yawQ);
   headTarget.sub(headPivot).add(headEye).sub(neutralEye);
   headTarget.clampLength(0,.08);
   const changed=headCut!==player.teleportId||lastHeadMode!==player.mode;
   lastHeadMode=player.mode;
   headCut=player.teleportId;
   if(changed){headMotion.set(0,0,0);headPitch=headYaw=headRoll=0;}
   else headMotion.lerp(headTarget,1-Math.exp(-dt*9));
   // Keep collision-aware base camera and its attack recoil. Apply only the
   // skeleton-relative head offset, clipped by the same world-ray provider.
   displacement.copy(headMotion).multiplyScalar(.55);
   const distance=displacement.length();
   if(distance>1e-6){
    const dir=displacement.divideScalar(distance);
    const safe=worldRay?Math.max(0,Math.min(distance,worldRay(camera.position,dir,distance+.07)-.07)):distance;
    camera.position.addScaledVector(dir,safe);
   }
   // The reference uses the animated head transform for BOTH eye position and
   // gaze. Preserve player aim authority and the game's existing camera recoil:
   // anatomical limits must not prevent looking up/down or aiming a weapon.
   const recoilPitch=camera.rotation.x-player.pitch;
   const recoilYaw=Math.atan2(Math.sin(camera.rotation.y-player.yaw),Math.cos(camera.rotation.y-player.yaw));
   const originalRoll=camera.rotation.z;
   headViewQ.copy(headQ).multiply(flipY);
   headViewEuler.setFromQuaternion(headViewQ,'YXZ');
   const headYawOffset=Math.atan2(Math.sin(headViewEuler.y-player.yaw),Math.cos(headViewEuler.y-player.yaw));
   const headPitchOffset=headViewEuler.x-player.pitch;
   localHeadQ.copy(yawQ).invert().multiply(headQ);
   tmpUp.set(0,1,0).applyQuaternion(localHeadQ);
   const angularRoll=Math.atan2(tmpUp.x,tmpUp.y);
   const roll=Math.max(-.03,Math.min(.03,angularRoll*.3));
   const headAlpha=1-Math.exp(-dt*9);
   headRoll+=(roll-headRoll)*headAlpha;
   headPitch+=(Math.max(-.045,Math.min(.045,headPitchOffset))-headPitch)*headAlpha;
   headYaw+=(Math.max(-.04,Math.min(.04,headYawOffset))-headYaw)*headAlpha;
   camera.rotation.set(
    Math.max(-1.55,Math.min(1.55,player.pitch+recoilPitch+headPitch)),
    player.yaw+recoilYaw+headYaw,
    originalRoll+headRoll,'YXZ'
   );
   // Camera-locked arms: the skinned model follows the final, head-aware view.
   camera.updateMatrixWorld(true);
   actor.group.quaternion.copy(camera.quaternion).multiply(flipY);
   actor.group.position.copy(camera.position).sub(displacement.copy(eye).applyQuaternion(actor.group.quaternion));
  }else{
   headCut=null;lastHeadMode=null;headRoll=0;
   actor.group.position.copy(renderPos);actor.group.quaternion.setFromAxisAngle(upAxis,bodyYaw);
   let desired=0;
   if(player.onGround&&!player.swimming){
    let best=-Infinity;
    for(const side of ['left','right']){
      const foot=actor.B['foot_'+side].getWorldPosition(displacement);
      const surface=groundSurface?.(foot.x,foot.z,player.pos.y)??renderPos.y;
      best=Math.max(best,surface+ankleRest*actor.group.scale.y-foot.y);
    }
    desired=Math.max(-.16,Math.min(.18,best));
   }
   footOffset=actor._combatStance||!player.onGround||player.swimming?0:footOffset+(desired-footOffset)*(1-Math.exp(-dt*24));
   actor.B.pelvis.position.y+=footOffset/(actor.units*actor.group.scale.y);
   if(player.onGround&&!player.swimming&&!actor._combatStance&&groundSurface)fitFeet(actor,renderPos,ankleRest,dt);
  }
  actor.group.updateWorldMatrix(true,false);
  const moving=clamp01(speed/2),base=firstPerson?eye:chest,m=actor.group.matrixWorld;
  for(const side of ['right','left']){
   const weapon=weapons[side];
   const target=armTargets(T,side,pose,{armed:Boolean(weapon),first:firstPerson,aspect:camera.aspect||1,phase:actor.phase,moving});
   if(!weapon&&!target.show)continue;
   _grip.copy(target.grip).add(base).applyMatrix4(m);
   _blade.copy(target.blade).transformDirection(m);
   _inward.copy(target.inward).transformDirection(m);
   _pole.copy(target.pole).transformDirection(m);
   if(weapon&&firstPerson&&worldRay){
    // Pull the weapon back instead of pushing the blade through walls.
    const reach=weapon.userData.len+.08,room=worldRay(_grip,_blade,reach);
    if(room<reach)_grip.addScaledVector(_blade,-(reach-room));
   }
   poseGrip(T,actor,side,_grip,_blade,_inward,_pole);
  }
 }
 // Ground-adaptive two-segment leg pose. This is presentation only; it
 // never writes player position/velocity. Preserve the swing phase and lift
 // a foot only when its sole would intersect the actual support surface.
 const footV=new T.Vector3(),hipV=new T.Vector3(),kneeV=new T.Vector3(),goalV=new T.Vector3(),dirV=new T.Vector3(),poleV=new T.Vector3(),newKnee=new T.Vector3(),oldDir=new T.Vector3(),newDir=new T.Vector3(),qA=new T.Quaternion(),qB=new T.Quaternion(),qParent=new T.Quaternion(),footWorldQ=new T.Quaternion();
 function fitFeet(a,root,ankleRest,dt){
  const sole=ankleRest*a.group.scale.y;
  for(const side of ['left','right']){
   const hip=a.B['thigh_'+side],knee=a.B['shin_'+side],foot=a.B['foot_'+side];
   if(!hip||!knee||!foot)continue;
   foot.getWorldPosition(footV);
   const surface=groundSurface(footV.x,footV.z,player.pos.y);
   if(surface===null||Math.abs(surface-player.pos.y)>.5)continue;
   const delta=surface+sole-footV.y;
   // Do not pin the raised swing foot to the floor. Correct only penetration
   // or a near-contact foot; airborne legs keep the authored pose.
   if(delta<-.09||Math.abs(delta)<.004)continue;
   goalV.copy(footV);goalV.y+=Math.max(-.09,Math.min(.27,delta));
   solveFoot(a,side,goalV,foot.getWorldQuaternion(footWorldQ));
  }
 }
 function solveFoot(a,side,target,rotation,preferredPole=null){
  const hip=a.B['thigh_'+side],knee=a.B['shin_'+side],foot=a.B['foot_'+side];
  const scale=a.units*a.group.scale.x;
  hip.getWorldPosition(hipV);knee.getWorldPosition(kneeV);foot.getWorldPosition(footV);
  dirV.copy(target).sub(hipV);
  const l1=knee.position.length()*scale,l2=foot.position.length()*scale;
  const d=Math.min(l1+l2-.001,Math.max(Math.abs(l1-l2)+.005,dirV.length()));
  if(dirV.lengthSq()<1e-8)return;
  dirV.normalize();
  if(preferredPole)poleV.copy(preferredPole);
  else poleV.copy(kneeV).sub(hipV);
  poleV.addScaledVector(dirV,-poleV.dot(dirV));
  if(poleV.lengthSq()<1e-7){poleV.set(0,0,1).transformDirection(a.group.matrixWorld);poleV.addScaledVector(dirV,-poleV.dot(dirV));}
  if(poleV.lengthSq()<1e-7)return;
  poleV.normalize();
  const along=(d*d+l1*l1-l2*l2)/(2*d);
  newKnee.copy(hipV).addScaledVector(dirV,along).addScaledVector(poleV,Math.sqrt(Math.max(0,l1*l1-along*along)));
  goalV.copy(hipV).addScaledVector(dirV,d);
  oldDir.copy(kneeV).sub(hipV).normalize();newDir.copy(newKnee).sub(hipV).normalize();
  hip.getWorldQuaternion(qA);qA.premultiply(qB.setFromUnitVectors(oldDir,newDir));
  hip.parent.getWorldQuaternion(qParent);hip.quaternion.copy(qParent.invert().multiply(qA));
  knee.getWorldPosition(kneeV);foot.getWorldPosition(footV);
  oldDir.copy(footV).sub(kneeV).normalize();newDir.copy(goalV).sub(kneeV).normalize();
  knee.getWorldQuaternion(qA);qA.premultiply(qB.setFromUnitVectors(oldDir,newDir));
  knee.parent.getWorldQuaternion(qParent);knee.quaternion.copy(qParent.invert().multiply(qA));
  foot.parent.getWorldQuaternion(qParent);foot.quaternion.copy(qParent.invert().multiply(rotation));
 }

 const traversalYaw=new T.Quaternion(),traversalLean=new T.Quaternion(),xAxis=new T.Vector3(1,0,0);
 const surfaceBasis=new T.Matrix4();
 function poseTraversal(action,t,root){
  const {kind,surface,previous}=action;
  const outward=new T.Vector3(surface.nx,0,surface.nz),uphill=outward.clone().negate();
  const across=new T.Vector3(surface.nz,0,-surface.nx);
  const mantle=kind==='mantle',crest=kind==='crest';
  const settle=phase(.77,1,t),reach=phase(0,.25,t),pull=phase(.24,.66,t);
  const step=phase(.26,1,t),lift=kind==='latch'?phase(0,1,t):step;
  let lean=action.tilt*lift+(action.oldTilt??previous?.tilt??(kind==='latch'?0:action.tilt))*(1-lift);
  let crouch=0;
  actor.group.position.copy(root);
  if(mantle){
   // The standing collision volume goes over the edge first. The rig stays
   // tucked underneath it until the knees and hips have crossed the lip.
   const low=clamp01((1.31-(action.to.y-action.from.y))/.85);
   const down=action.from.y-.57*low*reach;
   const tuck=Math.max(down,action.to.y-.81);
   const rise=Math.max(tuck,action.to.y-.56);
   const folded=down+(tuck-down)*pull+(rise-tuck)*phase(.57,.76,t);
   actor.group.position.y=folded+(action.to.y-folded)*settle;
   lean=(previous?.tilt??0)*(1-reach);
   crouch=Math.max(low*reach,.82*pull)*(1-settle);
  }else if(crest){
   lean=(previous?.tilt??0)*(1-phase(.14,.84,t));
   crouch=.30*Math.sin(t*Math.PI);
  }
  actor.group.quaternion.copy(traversalYaw.setFromAxisAngle(upAxis,bodyYaw)).multiply(traversalLean.setFromAxisAngle(xAxis,lean));
  actor.B.pelvis.position.copy(actor.rest.pelvis);
  actor._combatStance=null;
  const curl=mantle?phase(.3,.68,t)*(1-settle):0;
  const climbing=!(mantle||crest),turn=climbing&&action.moving!==undefined?(action.moving===0?-1:1)*Math.sin(t*Math.PI):0;
  actor.pose({
   waist:[-(mantle?9+41*crouch:4),turn*5],ribcage:[-(mantle?10*crouch:3),turn*8],
   neck:[mantle?crouch*16:6],head:[0,mantle?crouch*10:7],
   thigh_left:[climbing?28:14+curl*84,6],shin_left:[climbing?43:13+curl*84],
   thigh_right:[climbing?32:10+curl*66,8],shin_right:[climbing?48:13+curl*78],
   upper_arm_left:[mantle?22+22*pull:42,8],forearm_left:[36,0],
   upper_arm_right:[mantle?17+22*pull:42,8],forearm_right:[36,0]
  });
  actor.group.updateWorldMatrix(true,false);
  const swing=(from,to,progress,clearance)=>{
   const normal=from.normal.clone().lerp(to.normal,progress).normalize();
   const point=from.point.clone().lerp(to.point,progress).addScaledVector(normal,Math.sin(progress*Math.PI)*clearance);
   return {point,normal,lip:to.lip&&progress>.5};
  };
  const sole=bodyAnchors().ankleRest*actor.group.scale.y;
  for(const [i,side] of ['right','left'].entries()){
   const sign=i===0?-1:1;
   let hand=action.hands?.[i]??previous?.hands[i],handWeight=1;
   let foot=action.feet?.[i]??previous?.feet[i],footWeight=1;
   if(kind==='latch'){
    handWeight=phase(i*.04,.83+i*.13,t);
    footWeight=phase(.24+i*.08,.86+i*.12,t);
   }else if(kind==='climb'){
    if(i===action.moving)hand=swing(action.oldHand,hand,phase(.035,.55,t),.13);
    else foot=swing(action.oldFoot,foot,phase(.36,.94,t),.14);
   }else if(mantle){
    if(previous)hand=swing(previous.hands[i],hand,reach,.07);
    else handWeight=phase(i*.04,.21+i*.04,t);
    handWeight*=1-phase(.59+i*.038,.79+i*.052,t);
    footWeight=1-phase(.15+i*.12,.58+i*.12,t);
   }else if(crest){
    handWeight=1-phase(.15+i*.11,.58+i*.11,t);
    footWeight=1-phase(.10+i*.12,.49+i*.12,t);
   }
   if(hand){
    const fingers=hand.lip?uphill:upAxis.clone().addScaledVector(hand.normal,-hand.normal.y).normalize();
    const palm=hand.point.clone().addScaledVector(hand.normal,hand.lip?.029:.018);
    if(hand.lip)palm.addScaledVector(uphill,.014);
    // The released limb lifts away before merging back to the arm swing.
    if(mantle&&t>.59)palm.addScaledVector(upAxis,phase(.60,.82,t)*.12);
    const pole=across.clone().multiplyScalar(sign*.65).addScaledVector(outward,.27).addScaledVector(upAxis,-.71);
    actor.grip(side,hand.lip?.15:.055);
    poseSurfaceHand(T,actor,side,palm,hand.normal,fingers,pole,handWeight);
   }else actor.grip(side,.08);
   const footBone=actor.B['foot_'+side];
   if(foot&&footWeight>0){
    const normal=foot.normal,fingers=upAxis.clone().addScaledVector(normal,-normal.y).normalize();
    const ankle=foot.point.clone().addScaledVector(normal,.115).addScaledVector(fingers,-.026);
    const rotation=new T.Quaternion().setFromRotationMatrix(surfaceBasis.makeBasis(
     new T.Vector3().crossVectors(normal,fingers),normal,fingers));
    const pole=across.clone().multiplyScalar(sign*.52).addScaledVector(outward,.26).addScaledVector(upAxis,.26);
    const target=footBone.getWorldPosition(new T.Vector3()).lerp(ankle,footWeight);
    solveFoot(actor,side,target,footBone.getWorldQuaternion(new T.Quaternion()).slerp(rotation,footWeight),pole);
   }
   if(mantle||crest){
    const plant=phase(.64+i*.10,.86+i*.105,t);
    if(plant>0){
     const target=action.to.clone().addScaledVector(across,sign*.125).addScaledVector(uphill,i===0?.125:-.055);
     target.y=(groundSurface?.(target.x,target.z,action.to.y)??action.to.y)+sole;
     target.y+=Math.sin(plant*Math.PI)*.13;
     const blend=footBone.getWorldPosition(new T.Vector3()).lerp(target,plant);
     solveFoot(actor,side,blend,footBone.getWorldQuaternion(new T.Quaternion()).slerp(traversalYaw,plant));
    }
   }
  }
 }
 const trail=[];
 function updateTrail(combat){
  for(const h of Object.values(view.hands))h.g.visible=false;
  if(player.traversal||(third&&!actor.group.visible)){trail.length=0;view.trailMesh.visible=false;return;}
  const swing=combat.swing,pose=attackPose(swing),weapon=swing&&weapons[swing.hand];
  const striking=weapon&&pose.travel>0&&pose.travel<1&&pose.weight>.45;
  if(striking){
   const len=view.hands[swing.hand].len;
   weapon.updateWorldMatrix(true,false);camera.updateMatrixWorld(true);
   const tip=camera.worldToLocal(weapon.localToWorld(new T.Vector3(0,len,0)));
   const mid=camera.worldToLocal(weapon.localToWorld(new T.Vector3(0,len*.48,0)));
   trail.unshift([tip,mid]);if(trail.length>view.trailN)trail.pop();
  }else if(trail.length)trail.splice(0,Math.min(3,trail.length));
  else return;
  const g=view.trailMesh.geometry,p=g.attributes.position,a=g.attributes.aA;
  for(let i=0;i<view.trailN;i++){
   const entry=trail[Math.min(i,trail.length-1)],alpha=i<trail.length?1-i/view.trailN:0;
   if(entry){p.setXYZ(i*2,...entry[0].toArray());p.setXYZ(i*2+1,...entry[1].toArray());}
   a.setX(i*2,alpha);a.setX(i*2+1,alpha*.2);
  }
  p.needsUpdate=a.needsUpdate=true;view.trailMesh.visible=trail.length>1;
 }
 function applyThirdCamera(dt,rig){
  if((!third&&!player.renderTraversal)||player.mode!=='walk')return;
  const yaw=rig.yaw,pitch=rig.pitch,feet=player.renderPos??player.pos;
  const mode=player.renderTraversal?'traversal':player.mode;
  const reset=cut!==player.teleportId||lastMode!==mode;
  const result=solveThirdBoom({feet,aimY:cameraY??feet.y,yaw,pitch,near:camera.near??.2,
   fov:camera.fov??65,aspect:camera.aspect||1,height,previous:boom,reset,dt,worldRay});
  boom=result.boom;cut=player.teleportId;lastMode=mode;
  if(result.fallback){
   // No collision-free third-person view outside the body. Keep the base
   // eye camera from CameraRig for this frame and suppress the world avatar.
   // Never force the boom through the wall or persist a view-mode change.
   actor.group.visible=false;
   const offset=(cameraY??feet.y)-feet.y;
   if(Math.abs(offset)>1e-6){
    const dir=new T.Vector3(0,Math.sign(offset),0),distance=Math.abs(offset);
    const safe=worldRay?Math.max(0,Math.min(distance,worldRay(camera.position,dir,distance+.075)-.075)):distance;
    camera.position.addScaledVector(dir,safe);
   }
  }else{
   actor.group.visible=true;
   camera.position.set(result.position.x,result.position.y,result.position.z);
  }
  camera.rotation.set(pitch,yaw,0,'YXZ');
 }

 attachWeapons();
 return {update,updateTrail,applyThirdCamera,setThird,setProfile,openChooser,closeChooser,
  get mode(){return third?'third':'first';},get isOpen(){return open;},get profile(){return profile;},
  get actor(){return actor;},get bodyRoot(){return actor.group;},get handWeapons(){return weapons;}};
}
