import {normalizeStudioCharacter} from './appearance.js';
import {animatePlayer,armTargets,mountWeapon,poseGrip} from './avatar-motion.js';
const clamp01=x=>Math.max(0,Math.min(1,x));

export function createCharacterRuntime({T,scene,camera,player,Save,makeCharacter,makeWeapon,attackPose,worldRay,view,height,runSpeed=5}){
 let profile=normalizeStudioCharacter(Save.data.character??{body:'male'}),actor=makeCharacter(profile);
 scene.add(actor.group);actor.group.name='SERNBELD Player';
 let third=Save.data.settings.view==='third',open=false,frame=null,first=false;
 let weapons={right:null,left:null},equipped={},boom=3.1,cut=-1,lastMode=null;
 const dialog=document.createElement('dialog');dialog.id='character-chooser';
 dialog.style.cssText='position:fixed;inset:0;border:0;padding:0;margin:0;width:100vw;max-width:none;height:100dvh;max-height:none;background:#fafaf7;z-index:1000;';
 dialog.innerHTML='<button type="button" id="character-close" aria-label="돌아가기" style="position:absolute;right:.6rem;bottom:.6rem;z-index:2;border:1px solid #cbd5c7;border-radius:.7rem;background:#fff;padding:.7rem 1rem;color:#334a3c">돌아가기</button><iframe title="내 캐릭터 만들기" style="border:0;width:100%;height:100%"></iframe>';
 document.body.append(dialog);
 dialog.addEventListener('cancel',e=>{e.preventDefault();if(!first)closeChooser();});
 dialog.querySelector('button').onclick=()=>{if(!first)closeChooser();};
 function sendProfile(){frame?.contentWindow.postMessage({type:'sernbeld:edit-character',character:profile,first},location.origin);}
 function openChooser(required=false){
  first=required;open=true;dialog.querySelector('button').hidden=required;
  document.exitPointerLock?.();
  if(!frame){frame=dialog.querySelector('iframe');frame.src=new URL('./studio.html',import.meta.url).href;}
  if(!dialog.open)dialog.showModal();sendProfile();
 }
 function closeChooser(){open=false;dialog.close();}
 addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==frame?.contentWindow)return;
  if(e.data?.type==='sernbeld:studio-ready')sendProfile();
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
  anchors=null;thirdAim=null;headCut=null;lastHeadMode=null;headRoll=0;headMotion.set(0,0,0);weapons={right:null,left:null};equipped={};attachWeapons();Save.data.character=profile;Save.write();
 }
 function setThird(value){third=Boolean(value);thirdAim=null;headCut=null;lastHeadMode=null;headRoll=0;Save.data.settings.view=third?'third':'first';Save.write();lastMode=null;}
 // Body-frame anchors (metres, actor group space): the shoulder midpoint and the
 // first-person eye point a little above and in front of it.
 let anchors=null,thirdAim=null;
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
  return anchors={chest,eye:chest.clone().add(new T.Vector3(0,.19,.06))};
 }
 const flipY=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI);
 const _grip=new T.Vector3(),_blade=new T.Vector3(),_inward=new T.Vector3(),_pole=new T.Vector3();
 function update(dt,t,combat){
  attachWeapons();
  const walking=player.mode==='walk',firstPerson=!third&&walking;
  actor.group.visible=walking;actor.setFirst(firstPerson);actor.setShadow(!firstPerson);
  const pose=attackPose(combat.swing);
  animatePlayer(actor,dt,t,player,pose,Save.data.equip,{first:firstPerson,runSpeed});
  const {chest,eye}=bodyAnchors();
  if(firstPerson){
   // First evaluate the skeleton in world/player space, BEFORE camera-locking the
   // first-person arms. Otherwise the head follows the camera and cannot drive it.
   actor.group.position.copy(player.pos);
   yawQ.setFromAxisAngle(new T.Vector3(0,1,0),player.yaw+Math.PI);
   actor.group.quaternion.copy(yawQ);
   actor.group.updateMatrixWorld(true);
   actor.B.head.getWorldPosition(headTarget);
   actor.B.head.getWorldQuaternion(headQ);
   const headData=actor.data.bones.find(b=>b.id==='head');
   headPivot.fromArray(headData.pivot).multiplyScalar(actor.units/1428).add(actor.model.position).applyMatrix4(actor.group.matrixWorld);
   // Imported schoolyard eye-frame model: eye is offset from the animated head
   // in head-local coordinates, not glued to the weapon or pelvis.
   headEye.copy(eyeBasis).applyQuaternion(headQ);
   neutralEye.copy(eyeBasis).applyQuaternion(yawQ);
   headTarget.sub(headPivot).add(headEye).sub(neutralEye);
   headTarget.clampLength(0,.22);
   const changed=headCut!==player.teleportId||lastHeadMode!==player.mode;
   lastHeadMode=player.mode;
   headCut=player.teleportId;
   if(changed)headMotion.copy(headTarget);
   else headMotion.lerp(headTarget,1-Math.exp(-dt*45));
   // Keep collision-aware base camera and its attack recoil. Apply only the
   // skeleton-relative head offset, clipped by the same world-ray provider.
   const displacement=headMotion.clone().multiplyScalar(.86);
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
   headRoll+=(roll-headRoll)*(1-Math.exp(-dt*28));
   camera.rotation.set(
    Math.max(-1.55,Math.min(1.55,player.pitch+recoilPitch+Math.max(-.18,Math.min(.18,headPitchOffset)))),
    player.yaw+recoilYaw+Math.max(-.15,Math.min(.15,headYawOffset)),
    originalRoll+headRoll,'YXZ'
   );
   // Camera-locked arms: the skinned model follows the final, head-aware view.
   camera.updateMatrixWorld(true);
   actor.group.quaternion.copy(camera.quaternion).multiply(flipY);
   actor.group.position.copy(camera.position).sub(eye.clone().applyQuaternion(actor.group.quaternion));
  }else{
   headCut=null;lastHeadMode=null;headRoll=0;
   actor.group.position.copy(player.pos);actor.group.quaternion.setFromAxisAngle(new T.Vector3(0,1,0),player.yaw+Math.PI);
  }
  actor.group.updateMatrixWorld(true);
  if(!walking)return;
  const moving=clamp01(Math.hypot(player.vel.x,player.vel.z)/2),base=firstPerson?eye:chest,m=actor.group.matrixWorld;
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
 const trail=[];
 function updateTrail(combat){
  for(const h of Object.values(view.hands))h.g.visible=false;
  const swing=combat.swing,pose=attackPose(swing),weapon=swing&&weapons[swing.hand];
  const striking=weapon&&pose.travel>0&&pose.travel<1&&pose.weight>.45;
  if(striking){
   const len=view.hands[swing.hand].len;
   weapon.updateWorldMatrix(true,false);camera.updateMatrixWorld(true);
   const tip=camera.worldToLocal(weapon.localToWorld(new T.Vector3(0,len,0)));
   const mid=camera.worldToLocal(weapon.localToWorld(new T.Vector3(0,len*.48,0)));
   trail.unshift([tip,mid]);if(trail.length>view.trailN)trail.pop();
  }else trail.splice(0,Math.min(3,trail.length));
  const g=view.trailMesh.geometry,p=g.attributes.position,a=g.attributes.aA;
  for(let i=0;i<view.trailN;i++){
   const entry=trail[Math.min(i,trail.length-1)],alpha=i<trail.length?1-i/view.trailN:0;
   if(entry){p.setXYZ(i*2,...entry[0].toArray());p.setXYZ(i*2+1,...entry[1].toArray());}
   a.setX(i*2,alpha);a.setX(i*2+1,alpha*.2);
  }
  p.needsUpdate=a.needsUpdate=true;view.trailMesh.visible=trail.length>1;
 }
 function applyThirdCamera(dt,rig){
  if(!third||player.mode!=='walk')return;
  const yaw=rig.yaw,pitch=rig.pitch;
  // Retarget the schoolyard head-follow camera onto the actual animated head.
  // The avatar is only an aim target: collision, camera recoil and the existing
  // camera boom remain authoritative. Never move the player to fit the camera.
  actor.group.updateMatrixWorld(true);
  const head=actor.B.head.getWorldPosition(new T.Vector3());
  const bodyTarget=new T.Vector3(player.pos.x,player.pos.y+1.02,player.pos.z);
  const headTarget=new T.Vector3(head.x,Math.max(player.pos.y+.82,Math.min(player.pos.y+1.76,head.y)),head.z);
  const desiredTarget=bodyTarget.lerp(headTarget,.36);
  if(!thirdAim)thirdAim=desiredTarget.clone();
  else thirdAim.lerp(desiredTarget,1-Math.exp(-dt*25));
  const target=thirdAim;
  const direction=new T.Vector3(Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
  const desired=3.1,margin=.22;
  let room=desired;
  const right=new T.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  const up=new T.Vector3().crossVectors(direction,right).normalize();
  // Protect the near plane corners, not just the center ray.
  for(const [x,y] of [[0,0],[-1,-1],[-1,1],[1,-1],[1,1]]){
   const origin=target.clone().addScaledVector(right,x*.18).addScaledVector(up,y*.14);
   room=Math.min(room,Math.max(.05,worldRay(origin,direction,desired+margin)-margin));
  }
  const reset=cut!==player.teleportId||lastMode!==player.mode;
  boom=reset||room<boom?room:room+(boom-room)*Math.exp(-dt*8);
  cut=player.teleportId;lastMode=player.mode;
  camera.position.copy(target).addScaledVector(direction,boom);
  camera.rotation.set(pitch,yaw,0,'YXZ');
 }
 attachWeapons();
 return {update,updateTrail,applyThirdCamera,setThird,setProfile,openChooser,closeChooser,
  get mode(){return third?'third':'first';},get isOpen(){return open;},get profile(){return profile;},
  get actor(){return actor;},get bodyRoot(){return actor.group;},get handWeapons(){return weapons;}};
}
