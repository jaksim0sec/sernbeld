import {normalizeStudioCharacter} from './appearance.js';
import {pivotFootTarget} from './schoolyard-motion.js';
import {animatePlayer,armTargets,mountWeapon,poseGrip,poseSurfaceHand,fitSurfaceHandReach} from './avatar-motion.js';
const clamp01=x=>Math.max(0,Math.min(1,x));
const phase=(from,to,t)=>{
 const fraction=clamp01((t-from)/(to-from));
 return fraction*fraction*(3-2*fraction);
};

// Build a continuous-ish support profile across the moving body's footprint.
// Exact treads remain the collision/foot-IK surface. Only the avatar root
// samples this profile; a deck edge or high wall must not lift the body.
export function sampleBodySupport(position,feetY,vx,vz,groundSurface){
 const raw=position.y,speed=Math.hypot(vx,vz);
 if(!groundSurface||speed<.12)return {y:raw,stepped:false};
 const center=groundSurface(position.x,position.z,feetY);
 if(!Number.isFinite(center)||Math.abs(center-raw)>.12)return {y:raw,stepped:false};
 const reach=.24*clamp01(speed/.65),dx=vx/speed,dz=vz/speed;
 let sum=center,lo=center,hi=center,valid=1;
 for(const fraction of [-1,-.5,.5,1]){
  const h=groundSurface(position.x+dx*reach*fraction,position.z+dz*reach*fraction,feetY);
  if(!Number.isFinite(h)||Math.abs(h-center)>.48)continue;
  sum+=h;lo=Math.min(lo,h);hi=Math.max(hi,h);valid++;
 }
 // Ignore steep drops/obstacles rather than averaging across unrelated levels.
 if(valid!==5||hi-lo>.48)return {y:raw,stepped:false};
 return {y:raw+(sum/valid-center),stepped:hi-lo>.08};
}
// A high swing foot does not authorize raising the whole torso. On staggered
// supports only a small shared correction is allowed; each leg handles its
// own remaining error in IK. On level ground retain the existing compensation.
export function bodySupportCorrection(errors,stepped){
 if(!errors.length)return 0;
 const hi=Math.max(...errors),lo=Math.min(...errors);
 const mixed=stepped||hi-lo>.12;
 const desired=mixed?Math.max(-.08,Math.min(.06,(hi+lo)*.5)):hi;
 return Math.max(-.16,Math.min(.18,desired));
}
// The root receives one final height target, including support compensation.
// Never clamp to the new target in a single frame: that reintroduces snapping.
export function smoothBodyHeight(previous,target,dt,grounded,speed=0){
 if(!grounded||!Number.isFinite(previous))return target;
 dt=Math.max(0,dt);
 const rate=12+Math.min(7.5,Math.max(0,speed))*2;
 const maxDelta=Math.max(2.4,speed*.8+.6)*dt;
 const delta=(target-previous)*(1-Math.exp(-dt*rate));
 return previous+Math.max(-maxDelta,Math.min(maxDelta,delta));
}

// Presentation-only critically damped body height, retaining vertical velocity.
export function smoothLocomotionHeight(previous,velocity,target,dt,speed){
 if(!Number.isFinite(previous))return {y:target,velocity:0};
 dt=Math.max(0,dt);if(!dt)return {y:previous,velocity};
 const rate=19+Math.min(7.5,Math.max(0,speed))*.7,decay=Math.exp(-rate*dt);
 const error=previous-target,term=velocity+rate*error;
 const next=target+(error+term*dt)*decay,v=(velocity-rate*term*dt)*decay;
 const limit=Math.max(2.4,speed*.8+.6),delta=Math.max(-limit*dt,Math.min(limit*dt,next-previous));
 return {y:previous+delta,velocity:Math.max(-limit,Math.min(limit,v))};
}
// Filter inherited yaw/roll oscillation in the body frame, preserving turns.
export function runHeadFilter(previous,yaw,roll,speed,runSpeed,dt){
 const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
 const weight=clamp01((speed-2.6)/Math.max(.5,runSpeed-2.6));
 const alpha=1-Math.exp(-Math.max(0,dt)*5);
 const fy=previous?wrap(previous.yaw+wrap(yaw-previous.yaw)*alpha):yaw;
 const fr=previous?previous.roll+(roll-previous.roll)*alpha:roll;
 return {state:{yaw:fy,roll:fr},yaw:wrap(yaw+wrap(fy-yaw)*weight*.85),roll:roll+(fr-roll)*weight*.85};
}

// Preserve the actual airborne root trajectory: decay only the previous visual
// offset, not the world height. Ground entry starts from the previous offset
// relative to the current physical root, so landing cannot snap to IK height.
export function transitionBodyHeight(previous,previousRoot,root,target,dt,grounded,wasGrounded,speed,reset=false){
 if(reset||!Number.isFinite(previous)||!Number.isFinite(previousRoot))return grounded?target:root;
 if(grounded&&wasGrounded)return smoothBodyHeight(previous,target,dt,true,speed);
 const offset=previous-previousRoot;
 const carried=root+offset;
 if(grounded)return smoothBodyHeight(carried,target,dt,true,speed);
 return root+offset*Math.exp(-Math.max(0,dt)*12);
}

// Ground IK releases a lifted ankle continuously, rather than dropping a
// 90 mm correction in one frame when the authored foot crosses a threshold.
export function groundFootCorrection(delta,stance){
 if(delta>=0)return Math.min(.27,delta);
 if(stance<=0||delta<=-.135)return 0;
 const t=clamp01((-delta-.045)/.09);
 return Math.max(-.09,delta)*stance*(1-t*t*(3-2*t));
}
// Anticipate a reachable upward tread along the movement direction.
// The exact support still owns contact and penetration prevention. Only
// the visual ankle target is raised before the discontinuity is crossed.
export function anticipateFootStep(x,z,surface,feetY,vx,vz,groundSurface,lock=0){
 const speed=Math.hypot(vx,vz);
 if(speed<.15||!Number.isFinite(surface)||!groundSurface)return surface;
 const reach=.30*clamp01(speed/.65),dx=vx/speed,dz=vz/speed;
 const at=d=>groundSurface(x+dx*d,z+dz*d,feetY);
 const valid=h=>Number.isFinite(h)&&Math.abs(h-feetY)<=.5;
 const end=at(reach);
 if(!valid(end)||end-surface<.06||end-surface>.48)return surface;
 // Locate the first actual rise, not a smoothed terrain normal. A gentle
 // continuous slope has no finite jump across the final narrow bracket.
 let lo=0,hi=reach,lower=surface,upper=end;
 for(let i=0;i<6;i++){
  const mid=(lo+hi)*.5,h=at(mid);
  if(!valid(h))return surface;
  if(h>=surface+.06){hi=mid;upper=h;}else{lo=mid;lower=h;}
 }
 const rise=upper-lower;
 if(rise<.06||rise>.48)return surface;
 const t=clamp01(1-hi/reach),ease=t*t*(3-2*t);
 // Keep a planted foot longer than a swinging one, converging to the
 // real upper support at the edge for both. Never lower the exact floor.
 return surface+Math.max(0,upper-surface)*ease*(1-clamp01(lock)*(1-ease));
}

// Fade ground IK from the authored pose for small target changes. A hard
// invocation threshold otherwise applies the full knee pole repair to even a
// millimetre-sized correction. Upward anti-penetration has a shorter fade.
export function groundIKWeight(vertical,horizontal){
 const magnitude=Math.hypot(vertical,horizontal);
 const full=vertical>0?.012:.035;
 const t=clamp01((magnitude-.002)/(full-.002));
 return t*t*(3-2*t);
}
// The rig's authored maximum knee flexion bounds the reachable ankle sphere.
export function groundLegDistance(l1,l2,distance,maxFlex){
 const max=l1+l2-.001;
 const flex=Math.max(0,Math.min(179,Number.isFinite(maxFlex)?maxFlex:135))*Math.PI/180;
 const min=Math.max(Math.abs(l1-l2)+.005,Math.sqrt(Math.max(0,l1*l1+l2*l2+2*l1*l2*Math.cos(flex))));
 return Math.min(max,Math.max(Math.min(max,min),distance));
}

// The procedural driver bends the swing knee while cos(phase+offset)>0.
// Author a conservative support window inside the opposite half-cycle.
// Reverse playback traverses the same support window in the opposite direction.
export function gaitSupportWeight(phase,side){
 return clamp01((-Math.cos(phase+(side==='right'?Math.PI:0))-.12)/.5);
}
// World-space ankle anchor, owned only by presentation. A vanished support,
// unreachable target or changed height invalidates this stance until swing.
export function groundGaitTarget(previous,side,phase,speed,foot,sole,feetY,surfaceAt,dt=Infinity){
 const intent=gaitSupportWeight(phase,side),blend=clamp01((speed-.15)/.5);
 const free=state=>({state,weight:0,x:foot.x,z:foot.z});
 if(!intent||!blend)return free(null);
 const valid=y=>Number.isFinite(y)&&Math.abs(y-feetY)<=.5;
 const height=surfaceAt(foot.x,foot.z,feetY);
 if(!valid(height))return free({blocked:true});
 let state=previous;
 if(!state&&Math.abs(height+sole-foot.y)<=.10)state={x:foot.x,z:foot.z,y:height,age:0};
 if(!state||state.blocked)return free(state);
 const anchorY=surfaceAt(state.x,state.z,feetY),distance=Math.hypot(state.x-foot.x,state.z-foot.z);
 if(!valid(anchorY)||Math.abs(anchorY-state.y)>.04||Math.abs(anchorY-height)>.24||distance>=.32)return free({blocked:true});
 const age=Math.min(.09,(state.age??.09)+Math.max(0,dt));
 state={...state,age};
 const acquisition=clamp01(age/.09),release=(1-clamp01((Math.abs(anchorY-state.y)-.02)/.02))*(1-clamp01((Math.abs(anchorY-height)-.12)/.12));
 const weight=intent*blend*acquisition*acquisition*(3-2*acquisition)*release*(1-clamp01((distance-.16)/.16))*(1-clamp01((Math.abs(height+sole-foot.y)-.10)/.12));
 return {state,weight,x:foot.x+(state.x-foot.x)*weight,z:foot.z+(state.z-foot.z)*weight};
}

// Presentation-only camera math. No physics or animated bone writes.
export function smoothCameraHeight(previous,target,dt,grounded){
 if(!Number.isFinite(previous))return target;
 const next=target+(previous-target)*Math.exp(-Math.max(0,dt)*(grounded?8:14));
 return Math.max(target-.42,Math.min(target+.42,next));
}
export function solveThirdBoom({feet,bodyFeet=feet,aimY,yaw,pitch,near,fov,aspect,height,previous,reset,dt,worldRay}){
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
 const outside=p=>p.y<bodyFeet.y-.18||p.y>bodyFeet.y+height+.22||Math.hypot(p.x-bodyFeet.x,p.z-bodyFeet.z)>=.50;
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

// Try collision-checked views around the traversal surface instead of hiding
// the avatar immediately. Retain the previous safe orbit during recovery.
export function solveTraversalCamera({surface,previousView,...base}){
 const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
 const outward=Math.atan2(surface.nx,surface.nz);
 const pitch=Math.max(-.70,Math.min(.70,base.pitch));
 const follow=1-Math.exp(-Math.max(0,base.dt)*10);
 const previous=base.reset?null:previousView;
 const yaw=previous?previous.yaw+wrap(base.yaw-previous.yaw)*follow:base.yaw;
 const preferredPitch=previous?previous.pitch+(pitch-previous.pitch)*follow:pitch;
 const candidates=[[yaw,preferredPitch]];
 if(previous)candidates.push([previous.yaw,previous.pitch]);
 for(const a of [outward,outward+Math.PI/3,outward-Math.PI/3,outward+Math.PI/2,outward-Math.PI/2,base.yaw+Math.PI/2,base.yaw-Math.PI/2]){
  candidates.push([a,pitch],[a,0]);
 }
 let best=null;
 for(const [a,p] of candidates){
  const result=solveThirdBoom({...base,yaw:a,pitch:p,reset:true});
  if(result.fallback)continue;
  const view={...result,yaw:a,pitch:p};
  if(!best||view.boom>best.boom)best=view;
  if(view.boom>=1.65){best=view;break;}
 }
 if(!best)return {fallback:true,boom:0,yaw:base.yaw,pitch:base.pitch};
 const eased=solveThirdBoom({...base,yaw:best.yaw,pitch:best.pitch});
 return {...(eased.fallback?best:eased),yaw:best.yaw,pitch:best.pitch};
}

export function createCharacterRuntime({T,scene,camera,player,Save,getEquipped,makeCharacter,makeWeapon,attackPose,worldRay,groundSurface,view,height,runSpeed=5}){
 let profile=normalizeStudioCharacter(Save.data.character??{body:'male'}),actor=makeCharacter(profile);
 scene.add(actor.group);actor.group.name='SERNBELD Player';
 let third=Save.data.settings.view==='third',open=false,frame=null,first=false;
 let weapons={right:null,left:null},equipped={},boom=3.1,cut=-1,lastMode=null,traversalView=null;
 let bodyYaw=player.yaw+Math.PI,bodyCut=null,bodyY=null,bodyRootY=null,bodyGrounded=false,gaitSpeed=0,slideWeight=0,lastSlide=null,bodyVelocity=0,runHeadState=null;
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
   const record=getEquipped(side),id=record&&record.wear<100?record.definitionId:null;if(equipped[side]===id)continue;
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
 const runHeadEuler=new T.Euler(0,0,0,'YXZ'),runHeadLocal=new T.Quaternion(),runHeadParent=new T.Quaternion(),runHeadGroup=new T.Quaternion();
 const eyeBasis=new T.Vector3(0,.065,.038),tmpUp=new T.Vector3();
 let headCut=null,lastHeadMode=null,headRoll=0;
 function bodyAnchors(){
  if(anchors)return anchors;
  const pivot=id=>new T.Vector3(...actor.data.bones.find(b=>b.id===id).pivot).multiplyScalar(actor.units/1428).add(actor.model.position);
  const chest=pivot('upper_arm_left').add(pivot('upper_arm_right')).multiplyScalar(.5);
  return anchors={chest,eye:chest.clone().add(new T.Vector3(0,.19,.06)),headRest:pivot('head'),
   ankleRest:Math.min(pivot('foot_left').y,pivot('foot_right').y),
   kneeFlex:Object.fromEntries(['left','right'].map(side=>[side,actor.data.bones.find(b=>b.id==='shin_'+side)?.axes[0]?.max]))};
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
  if(!walking){bodyCut=null;bodyY=null;bodyGrounded=false;bodyVelocity=0;runHeadState=null;cameraCut=null;turnFeet={};gaitFeet={};return;}
  const pose=attackPose(combat.swing),renderPos=player.renderPos??player.pos;
  const cameraReset=cameraCut!==player.teleportId;
  cameraY=smoothCameraHeight(cameraReset?null:cameraY,renderPos.y,dt,player.onGround&&!player.swimming);
  cameraCut=player.teleportId;
  const aimYaw=player.yaw+Math.PI;
  const steeringYaw=player.keyboardSteering&&!player.swimming&&!player.slide&&Number.isFinite(player.facingYaw)?player.facingYaw+Math.PI:aimYaw;
  if(traversal){
   bodyYaw=Math.atan2(-traversal.action.surface.nx,-traversal.action.surface.nz);
   gaitSpeed=0;bodyY=null;bodyGrounded=false;bodyVelocity=0;runHeadState=null;turnFeet={};gaitFeet={};
   poseTraversal(traversal.action,traversal.t,renderPos);
   return;
  }
  const bodyReset=bodyCut!==player.teleportId;
  if(bodyReset){bodyYaw=firstPerson?aimYaw:steeringYaw;bodyCut=player.teleportId;gaitSpeed=0;bodyVelocity=0;runHeadState=null;actor._combatStance=null;turnFeet={};gaitFeet={};}
  const grounded=!firstPerson&&player.onGround&&!player.swimming;
  const speed=Math.hypot(player.vel.x,player.vel.z);
  const support=grounded?sampleBodySupport(renderPos,player.pos.y,player.vel.x,player.vel.z,groundSurface):{y:renderPos.y,stepped:false};
  gaitSpeed+=(speed-gaitSpeed)*(1-Math.exp(-dt*12));
  let turnRate=0,turnStep=0;
  if(firstPerson)bodyYaw=aimYaw;
  else{
   const target=combat.swing?(combat.swing.aimYaw??player.yaw)+Math.PI:
    player.keyboardSteering&&!player.swimming&&!player.slide?steeringYaw:
    speed>.12?(player.moveHeading??Math.atan2(player.vel.x,player.vel.z)):bodyYaw;
   const delta=wrap(target-bodyYaw);
   turnStep=delta*(1-Math.exp(-(pose?17:11)*dt));
   bodyYaw+=turnStep;
   turnRate=turnStep/Math.max(.001,dt);
  }
  if(!firstPerson){
   actor.group.position.copy(renderPos);actor.group.position.y=support.y;
   actor.group.quaternion.setFromAxisAngle(upAxis,bodyYaw);
  }
  const motion=animatePlayer(actor,dt,t,player,pose,equipped,{
   first:firstPerson,runSpeed,turnRate:firstPerson?null:turnRate,turnStep,gaitSpeed,
   gazeYaw:firstPerson?0:wrap(aimYaw-bodyYaw)
  });
  const {chest,eye,headRest,ankleRest}=bodyAnchors();
  if(firstPerson){
   bodyY=null;bodyGrounded=false;bodyVelocity=0;runHeadState=null;turnFeet={};gaitFeet={};
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
   actor.group.position.copy(renderPos);actor.group.position.y=support.y;actor.group.quaternion.setFromAxisAngle(upAxis,bodyYaw);
   let desired=0;
   if(grounded&&!actor._combatStance){
    const errors=[];
    const gaitBlend=!player.slide&&(motion?.pivotWeight??0)<.005?clamp01((gaitSpeed-.15)/.5):0;
    for(const side of ['left','right']){
     const foot=actor.B['foot_'+side].getWorldPosition(displacement);
     const surface=groundSurface?.(foot.x,foot.z,player.pos.y)??renderPos.y;
     if(Number.isFinite(surface)&&Math.abs(surface-player.pos.y)<=.5){
      const weight=1-gaitBlend+gaitBlend*gaitSupportWeight(actor.phase,side);
      if(weight>0)errors.push((surface+ankleRest*actor.group.scale.y-foot.y)*weight);
     }
    }
    desired=bodySupportCorrection(errors,support.stepped);
   }
   if(grounded&&bodyGrounded&&!bodyReset&&Number.isFinite(bodyY)){
    const smooth=smoothLocomotionHeight(bodyY,bodyVelocity,support.y+desired,dt,gaitSpeed);
    bodyY=smooth.y;bodyVelocity=smooth.velocity;
   }else{
    bodyY=transitionBodyHeight(bodyY,bodyRootY,renderPos.y,support.y+desired,dt,grounded,bodyGrounded,speed,bodyReset);
    bodyVelocity=0;
   }
   bodyRootY=renderPos.y;bodyGrounded=grounded;
   actor.group.position.y=bodyY;
   if(grounded&&!actor._combatStance&&groundSurface)fitFeet(actor,actor.group.position,ankleRest,dt,motion);
    else {turnFeet={};gaitFeet={};}
  }
  // Sliding down a steep face: crouched, feet planted on the slope, arms
  // out for balance. Eased in and out over the regular airborne pose.
  if(player.slide)lastSlide=player.slide;
  slideWeight+=((player.slide&&!player.swimming&&!firstPerson?1:0)-slideWeight)*(1-Math.exp(-dt*10));
  if(slideWeight>.01&&!firstPerson&&lastSlide)poseSlide(renderPos,ankleRest,slideWeight);
  actor.group.updateWorldMatrix(true,false);
  if(grounded&&!player.slide&&!combat.swing&&!actor._combatStance){
   const head=actor.B.head;
   actor.group.getWorldQuaternion(runHeadGroup);
   head.getWorldQuaternion(runHeadLocal).premultiply(runHeadParent.copy(runHeadGroup).invert());
   runHeadEuler.setFromQuaternion(runHeadLocal,'YXZ');
   const stabilized=runHeadFilter(runHeadState,runHeadEuler.y,runHeadEuler.z,gaitSpeed,runSpeed,dt);
   runHeadState=stabilized.state;
   if(gaitSpeed>2.6){
    runHeadEuler.y=stabilized.yaw;runHeadEuler.z=stabilized.roll;
    runHeadLocal.setFromEuler(runHeadEuler).premultiply(runHeadGroup);
    head.parent.getWorldQuaternion(runHeadParent);
    head.quaternion.copy(runHeadParent.invert().multiply(runHeadLocal));
    head.updateWorldMatrix(false,true);
   }
  }else runHeadState=null;
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
 let turnFeet={},gaitFeet={};
 const turnNeutral=new T.Vector3(),groundForward=new T.Vector3();
 const authoredHipQ=new T.Quaternion(),authoredKneeQ=new T.Quaternion();
 function fitFeet(a,root,ankleRest,dt,motion){
  const sole=ankleRest*a.group.scale.y;
  const pivot=motion?.pivotWeight??0;
  if(pivot<.005)turnFeet={};else gaitFeet={};
  for(const side of ['left','right']){
   const hip=a.B['thigh_'+side],knee=a.B['shin_'+side],foot=a.B['foot_'+side];
   if(!hip||!knee||!foot)continue;
   foot.getWorldPosition(footV);
   if(pivot>=.005){
    const rest=a.data.bones.find(b=>b.id==='foot_'+side)?.pivot;
    if(rest){
     turnNeutral.set(...rest).multiplyScalar(a.units/1428).add(a.model.position);
     a.group.localToWorld(turnNeutral);
     const step=pivotFootTarget(turnFeet[side],side,motion.pivotPhase,footV,turnNeutral,pivot);
     const surface=groundSurface(step.x,step.z,player.pos.y);
     if(Number.isFinite(surface)&&Math.abs(surface-player.pos.y)<=.5){
      turnFeet[side]=step.state;
      goalV.set(step.x,footV.y+(surface+sole-footV.y)*pivot+step.lift,step.z);
      solveFoot(a,side,goalV,foot.getWorldQuaternion(footWorldQ));
      continue;
     }
     delete turnFeet[side];
    }
   }
   const useGait=pivot<.005&&!player.slide&&gaitSpeed>.15;
   const contact=useGait?groundGaitTarget(gaitFeet[side],side,a.phase,gaitSpeed,footV,sole,player.pos.y,groundSurface,dt):null;
   if(contact?.state)gaitFeet[side]=contact.state;else delete gaitFeet[side];
   const x=contact?.x??footV.x,z=contact?.z??footV.z;
   const surface=groundSurface(x,z,player.pos.y);
   if(!Number.isFinite(surface)||Math.abs(surface-player.pos.y)>.5)continue;
   const delta=surface+sole-footV.y;
   // Swing feet retain lift, except for penetration correction. A supported
   // ankle may follow a bounded world-space anchor, rather than sliding.
   const blend=useGait?clamp01((gaitSpeed-.15)/.5):0;
   const stance=1-blend+blend*gaitSupportWeight(a.phase,side);
   let vertical=groundFootCorrection(delta,stance);
   // A swing ankle must start climbing before its sample crosses a riser.
   // Keep exact tread collision and the existing stance/leg reach policy.
   if(useGait){
    const ahead=anticipateFootStep(x,z,surface,player.pos.y,player.vel.x,player.vel.z,groundSurface,contact?.weight??0);
    if(ahead>surface)vertical=Math.max(vertical,Math.min(.27,ahead+sole-footV.y));
   }
   const weight=groundIKWeight(vertical,Math.hypot(x-footV.x,z-footV.z));
   if(!weight)continue;
   goalV.set(x,footV.y+vertical,z);
   solveFoot(a,side,goalV,foot.getWorldQuaternion(footWorldQ),null,bodyAnchors().kneeFlex[side]??135,weight);
  }
 }
 function solveFoot(a,side,target,rotation,preferredPole=null,groundFlex=null,weight=1){
  const hip=a.B['thigh_'+side],knee=a.B['shin_'+side],foot=a.B['foot_'+side];
  const scale=a.units*a.group.scale.x;
  hip.getWorldPosition(hipV);knee.getWorldPosition(kneeV);foot.getWorldPosition(footV);
  dirV.copy(target).sub(hipV);
  const l1=knee.position.length()*scale,l2=foot.position.length()*scale;
  const d=groundFlex===null?Math.min(l1+l2-.001,Math.max(Math.abs(l1-l2)+.005,dirV.length())):groundLegDistance(l1,l2,dirV.length(),groundFlex);
  if(dirV.lengthSq()<1e-8)return;
  dirV.normalize();
  if(preferredPole)poleV.copy(preferredPole);
  else poleV.copy(kneeV).sub(hipV);
  poleV.addScaledVector(dirV,-poleV.dot(dirV));
  if(groundFlex!==null){
   // The projected authored knee can become singular or cross the ankle line
   // as the target moves backward. Keep the bend in the anatomical forward
   // hemisphere; retain authored lateral bias when it is well conditioned.
   groundForward.set(0,0,1).transformDirection(a.group.matrixWorld);
   groundForward.addScaledVector(dirV,-groundForward.dot(dirV));
   if(groundForward.lengthSq()>1e-7){
    groundForward.normalize();
    const forward=poleV.dot(groundForward),blend=clamp01(forward/.045);
    if(blend>0)poleV.normalize();else poleV.copy(groundForward);
    poleV.lerp(groundForward,1-blend);
   }
  }
  if(poleV.lengthSq()<1e-7){poleV.set(0,0,1).transformDirection(a.group.matrixWorld);poleV.addScaledVector(dirV,-poleV.dot(dirV));}
  if(poleV.lengthSq()<1e-7)return;
  poleV.normalize();
  const along=(d*d+l1*l1-l2*l2)/(2*d);
  newKnee.copy(hipV).addScaledVector(dirV,along).addScaledVector(poleV,Math.sqrt(Math.max(0,l1*l1-along*along)));
  goalV.copy(hipV).addScaledVector(dirV,d);
  if(weight<1){authoredHipQ.copy(hip.quaternion);authoredKneeQ.copy(knee.quaternion);}
  oldDir.copy(kneeV).sub(hipV).normalize();newDir.copy(newKnee).sub(hipV).normalize();
  hip.getWorldQuaternion(qA);qA.premultiply(qB.setFromUnitVectors(oldDir,newDir));
  hip.parent.getWorldQuaternion(qParent);hip.quaternion.copy(qParent.invert().multiply(qA));
  knee.getWorldPosition(kneeV);foot.getWorldPosition(footV);
  oldDir.copy(footV).sub(kneeV).normalize();newDir.copy(goalV).sub(kneeV).normalize();
  knee.getWorldQuaternion(qA);qA.premultiply(qB.setFromUnitVectors(oldDir,newDir));
  knee.parent.getWorldQuaternion(qParent);knee.quaternion.copy(qParent.invert().multiply(qA));
  if(weight<1){
   // Blend both solved local joints against the same pre-IK authored pose.
   // Recompute the foot's local rotation afterwards to keep its world orientation.
   hip.quaternion.slerp(authoredHipQ,1-weight);
   knee.quaternion.slerp(authoredKneeQ,1-weight);
  }
  foot.parent.getWorldQuaternion(qParent);foot.quaternion.copy(qParent.invert().multiply(rotation));
 }

 const SLIDE_POSE={
  waist:[-12,0],ribcage:[-6,10],neck:[-4,0],head:[0,0],
  thigh_left:[50,12],shin_left:[74],thigh_right:[42,10],shin_right:[64],
  upper_arm_left:[22,52],forearm_left:[32,0],upper_arm_right:[30,44],forearm_right:[40,0]
 };
 const slideSaved=[];
 function poseSlide(root,ankleRest,weight){
  const bones=actor.bones;
  for(let i=0;i<bones.length;i++)(slideSaved[i]??=new T.Quaternion()).copy(bones[i].quaternion);
  actor.pose(SLIDE_POSE);
  for(let i=0;i<bones.length;i++)bones[i].quaternion.copy(slideSaved[i].slerp(bones[i].quaternion,weight));
  for(const side of ['left','right'])actor.grip(side,.25);
  const scale=actor.units*actor.group.scale.y;
  actor.B.pelvis.position.y-=.24*weight/scale;
  actor.group.updateWorldMatrix(true,false);
  // Feet along the slope's contour so both soles meet the face.
  const left=new T.Vector3(1,0,0).applyQuaternion(actor.group.quaternion);
  const down=new T.Vector3(-lastSlide.ux,0,-lastSlide.uz);
  const k=lastSlide.k,normal=new T.Vector3(-lastSlide.ux*k,1,-lastSlide.uz*k).normalize();
  const toes=down.clone().setY(-k).normalize();
  const rotation=new T.Quaternion().setFromRotationMatrix(surfaceBasis.makeBasis(new T.Vector3().crossVectors(normal,toes),normal,toes));
  const sole=ankleRest*actor.group.scale.y;
  for(const [side,sign,lead] of [['left',1,.07],['right',-1,-.05]]){
   const target=root.clone().addScaledVector(left,sign*.15).addScaledVector(down,lead);
   const ground=groundSurface?.(target.x,target.z,root.y+.6)??root.y;
   target.y=ground+sole;
   const foot=actor.B['foot_'+side];
   const pole=down.clone().multiplyScalar(.7).addScaledVector(left,sign*.25).addScaledVector(upAxis,.2);
   solveFoot(actor,side,foot.getWorldPosition(new T.Vector3()).lerp(target,weight),
    foot.getWorldQuaternion(new T.Quaternion()).slerp(rotation,weight),pole);
  }
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
  const limbs=[];
  // Across is opposite the actor's local +X when facing into the surface.
  // Local +X is anatomical left: negative across belongs to the left limbs.
  for(const [i,side] of ['left','right'].entries()){
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
    footWeight=action.pull?1-phase(.02+i*.03,.14+i*.03,t):1-phase(.15+i*.12,.58+i*.12,t);
   }else if(crest){
    handWeight=1-phase(.15+i*.11,.58+i*.11,t);
    footWeight=1-phase(.10+i*.12,.49+i*.12,t);
   }
   let fingers,palm,pole;
   if(hand){
    fingers=hand.lip?uphill:upAxis.clone().addScaledVector(hand.normal,-hand.normal.y).normalize();
    palm=hand.point.clone().addScaledVector(hand.normal,hand.lip?.029:.018);
    if(hand.lip)palm.addScaledVector(uphill,.014);
    // The released limb lifts away before merging back to the arm swing.
    if(mantle&&t>.59)palm.addScaledVector(upAxis,phase(.60,.82,t)*.12);
    pole=across.clone().multiplyScalar(sign*.65).addScaledVector(outward,.27).addScaledVector(upAxis,-.71);
   }
   limbs.push({i,side,sign,hand,foot,handWeight,footWeight,fingers,palm,pole});
  }
  if(mantle){
   // Bounded visual offset only. Apply before both arm and leg IK.
   actor.group.position.add(fitSurfaceHandReach(T,actor,limbs,outward));
   actor.group.updateWorldMatrix(true,false);
  }
  for(const {i,side,sign,hand,foot,handWeight,footWeight,fingers,palm,pole} of limbs){
   if(hand){
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
  const traversal=player.renderTraversal,mode=traversal?'traversal':player.mode;
  const reset=cut!==player.teleportId||lastMode!==mode;
  const base={feet,aimY:cameraY??feet.y,yaw,pitch,near:camera.near??.2,
   fov:camera.fov??65,aspect:camera.aspect||1,height,previous:boom,reset,dt,worldRay};
  const result=traversal?solveTraversalCamera({...base,bodyFeet:actor.group.position,
   aimY:actor.group.position.y-.28,surface:traversal.action.surface,previousView:traversalView}):solveThirdBoom({...base,bodyFeet:actor.group.position});
  traversalView=traversal&&!result.fallback?{yaw:result.yaw,pitch:result.pitch}:null;
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
  camera.rotation.set(result.fallback?pitch:result.pitch??pitch,result.fallback?yaw:result.yaw??yaw,0,'YXZ');
 }

 attachWeapons();
 return {update,updateTrail,applyThirdCamera,setThird,setProfile,openChooser,closeChooser,
  get mode(){return third?'third':'first';},get isOpen(){return open;},get profile(){return profile;},
  get actor(){return actor;},get bodyRoot(){return actor.group;},get handWeapons(){return weapons;}};
}
