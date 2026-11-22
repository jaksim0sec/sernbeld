import {normalizeStudioCharacter} from './appearance.js';
import {animatePlayer,solveArm} from './avatar-motion.js';

export function createCharacterRuntime({T,scene,camera,player,Save,makeCharacter,makeWeapon,attackPose,worldRay,view,height}){
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
   const hand=actor.B['hand_'+side];
   const fingers=actor.data.bones.filter(b=>['index_'+side+'_0','middle_'+side+'_0','ring_'+side+'_0'].includes(b.id));
   const wrist=actor.data.bones.find(b=>b.id==='hand_'+side).pivot;
   const palm=new T.Vector3(...fingers.reduce((a,b)=>a.map((v,i)=>v+b.pivot[i]/fingers.length),[0,0,0]).map((v,i)=>(v-wrist[i])/1428));
   // A weapon's +Y is the blade, while the fingers curl toward -Y. Flipping it
   // 180 degrees put the blade through the wrist and made third-person grips inverted.
   const handleY=Number.isFinite(item.userData.handleY)?item.userData.handleY:-.08;
   item.rotation.set(0,0,0);item.scale.setScalar(1/actor.units);
   item.position.copy(palm).add(new T.Vector3(0,-handleY/actor.units,0));
   item.userData.grip=palm;item.userData.handleY=handleY;item.userData.side=side;
   item.frustumCulled=false;item.castShadow=true;
   hand.add(item);weapons[side]=item;
  }
 }
 function setProfile(raw){
  const next=normalizeStudioCharacter(raw),replacement=makeCharacter(next);
  for(const weapon of Object.values(weapons)){weapon?.removeFromParent();weapon?.geometry.dispose();}
  actor.dispose();actor=replacement;profile=next;actor.group.name='SERNBELD Player';scene.add(actor.group);
  weapons={right:null,left:null};equipped={};attachWeapons();Save.data.character=profile;Save.write();
 }
 function setThird(value){third=Boolean(value);Save.data.settings.view=third?'third':'first';Save.write();lastMode=null;}
 function update(dt,t,combat){
  attachWeapons();
  actor.group.position.copy(player.pos);actor.group.rotation.y=player.yaw+Math.PI;
  actor.group.visible=player.mode==='walk';actor.setFirst(!third);
  const pose=attackPose(combat.swing);animatePlayer(actor,dt,t,player,pose,Save.data.equip);
  actor.group.updateMatrixWorld(true);
  if(!third&&player.mode==='walk'){
   // The old hand motion still provides wind-up, extension, wall retraction and impact recoil.
   // Its floating props stay hidden; these targets animate the real skinned arms instead.
   camera.updateMatrixWorld(true);
   for(const side of ['right','left']){
    const h=view.hands[side],weapon=weapons[side];
    // The old prop pivot sits beyond the anatomical arm reach. Keep its motion,
    // but bring the grip into the visible, reachable part of the same camera view.
    const target=h.g.position.clone();
    // Preserve the original attack arc but place the palm below the camera,
    // far enough from the shoulder to avoid folded and inside-out elbows.
    const horizontal=Math.min(.55,Math.max(.33,camera.aspect*.32));
    target.set(target.x*horizontal,target.y*.76,target.z*.78);
    camera.localToWorld(target);
    const desired=h.g.getWorldQuaternion(new T.Quaternion());
    if(weapon){
     const wristQ=desired.clone().multiply(weapon.quaternion.clone().invert());
     target.sub(weapon.userData.grip.clone().multiplyScalar(actor.units).applyQuaternion(wristQ));
     solveArm(T,actor,side,target,wristQ);
    }else solveArm(T,actor,side,target,desired);
   }
  }else if(third&&player.mode==='walk'){
   // Aim the actual wrist and blade together. The animation clock controls
   // the arc, but the elbow is solved anatomically rather than freely twisted.
   const rootQ=actor.group.getWorldQuaternion(new T.Quaternion());
   for(const side of ['right','left']){
    const weapon=weapons[side];if(!weapon)continue;
    const sign=side==='right'?-1:1;
    const active=pose&&((pose.side===1)===(side==='right'));
    const weight=active?pose.weight:0,pull=active?pose.pull:0,extension=active?pose.extension:0;
    const arc=active?pose.arc:0;
    // Wind-up carries the hand toward its own shoulder; follow-through crosses
    // toward the torso. Drive the blade farther than the wrist for a real arc.
    const palm=new T.Vector3(sign*.36-arc*.14*weight,1.14+.23*pull+.10*extension,.27+.14*extension);
    const blade=new T.Vector3(sign*.13-arc*.85*weight,.82-.20*extension,.48+.15*pull).normalize();
    const swordQ=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),blade.applyQuaternion(rootQ));
    const wristQ=swordQ.multiply(weapon.quaternion.clone().invert());
    const wrist=palm.applyMatrix4(actor.group.matrixWorld)
      .sub(weapon.userData.grip.clone().multiplyScalar(actor.units).applyQuaternion(wristQ));
    solveArm(T,actor,side,wrist,wristQ);
   }
  }
  actor.group.updateMatrixWorld(true);
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
  const locomotion=camera.position.clone().sub(player.pos);locomotion.y-=height;
  const target=new T.Vector3(player.pos.x,player.pos.y+1.02,player.pos.z).addScaledVector(locomotion,.35);
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
