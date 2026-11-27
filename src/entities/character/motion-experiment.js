import {SCHOOLYARD_CLIPS} from './schoolyard-motion.js';
import {animatePlayer} from './avatar-motion.js';
const finite=Number.isFinite, TAU=2*Math.PI;
const vec=v=>v&&[v.x,v.y,v.z].every(finite)?[v.x,v.y,v.z]:null;
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
export const MOTION_STRENGTH=Object.freeze({low:.65,baseline:1,high:1.35});
export function motionManifest(clips=SCHOOLYARD_CLIPS){
 const base={schemaVersion:1,rigVersion:'studio-v1',rootOwnership:'physics',displacement:'in-place',source:'existing project motion driver',referencePermission:'project use only; redistribution not established',contactWindows:null,transitionWindows:null,tests:['tests/schoolyard-motion.mjs']};
 return [...['idle','walk','run','backpedal','pivot','airborne','swim','social'].map(id=>({...base,id,kind:'procedural',duration:null,repeat:id!=='airborne',actions:[id],syncGroup:['walk','run','backpedal'].includes(id)?'gait':id,channels:['pelvis','waist','ribcage','neck','head','arms','legs'],markers:[]})),
 ...Object.entries(clips).map(([id,c])=>({...base,id,kind:'keyframe',duration:c.duration,repeat:false,actions:[],syncGroup:null,channels:[...new Set(c.channels.flatMap(k=>Object.keys(k.p)))].sort(),markers:c.channels.map(k=>({time:k.t,kind:'authored-key'})),source:'user-supplied schoolyard reference: '+c.source}))];
}
export function readMotionState(player,actor,support){
 const root=vec(player.pos),velocity=vec(player.vel),renderRoot=vec(player.renderPos??player.pos),heading=player.facingYaw??player.yaw??0;
 if(!root||!velocity||!renderRoot||!finite(actor.phase)||!finite(heading))throw new TypeError('nonfinite motion state');
 const speed=Math.hypot(velocity[0],velocity[2]);
 const action=player.mode==='fly'?'fly':player.traversal?'traversal':player.swimming?'swim':player.slide?'slide':!player.onGround?'airborne':speed<.12?'idle':player.running?'run':player.keyboardSteering&&velocity[0]*Math.sin(heading)+velocity[2]*Math.cos(heading)>.08?'backpedal':'walk';
 return {action,root,renderRoot,velocity,heading,phase:((actor.phase%TAU)+TAU)%TAU,grounded:!!player.onGround&&!player.swimming,teleportId:player.teleportId??0,supportCandidate:support?{surfaceId:support.surfaceId,featureId:support.featureId,revision:support.revision,point:support.point?.slice(),geometricNormal:support.geometricNormal?.slice()??null,separation:support.separation}:null};
}
// Use the same authored pivot conversion and foot alignment as studio-model.
export function measureRig(actor){
 const scale=actor.group.scale.y,unit=actor.units*scale/1428,offset=actor.model.position.y*scale;
 if(!finite(unit)||unit<=0||!finite(offset)||!finite(scale)||scale<=0)throw new TypeError('invalid rig scale');
 const byId=new Map(actor.data.bones.map(b=>[b.id,b]));
 const bones=actor.data.bones.map((b,i)=>{
  const parent=byId.get(b.parent);
  return {id:b.id,parent:b.parent??null,index:i,pivot:b.pivot.map((v,k)=>v*unit+(k===1?offset:0)),localRest:b.pivot.map((v,k)=>(v-(parent?.pivot[k]??0))*unit),length:parent?dist(b.pivot,parent.pivot)*unit:null,axes:b.axes.map(a=>({direction:a.d.slice(),min:a.min,max:a.max})),inverseBind:actor.skeleton?.boneInverses?.[i]?.elements?.slice()??null};
 });
 const box=actor.mesh?.geometry?.boundingBox,ankles=bones.filter(b=>b.id==='foot_left'||b.id==='foot_right');
 return {rigVersion:'studio-v1',body:actor.profile.body,scale,units:actor.units,meshHeight:box?(box.max.y-box.min.y)*actor.units*scale:null,bones,ankleRest:Math.min(...ankles.map(b=>b.pivot[1])),soleAnchorKind:'rest ankle offset proxy; not actual posed mesh sole'};
}
export function capturePose(actor,state,{time=0,groundSurface=null,ankleRest=null}={}){
 actor.group.updateWorldMatrix(true,true);
 const joints=actor.data.bones.map(b=>{
  const node=actor.B[b.id],p=node.getWorldPosition(node.position.clone()),q=node.quaternion.toArray();
  if(!vec(p)||!q.every(finite))throw new TypeError('nonfinite pose: '+b.id);
  return {id:b.id,world:vec(p),local:vec(node.position),rotation:q};
 });
 const feet=['left','right'].map(side=>{
  const p=joints.find(j=>j.id==='foot_'+side).world,surface=groundSurface?.(p[0],p[2],state.root[1]);
  const gap=finite(surface)&&finite(ankleRest)?p[1]-ankleRest-surface:null;
  return {side,ankle:p,surface:finite(surface)?surface:null,ankleProxyGap:gap,nearSupport:state.grounded&&gap!==null&&Math.abs(gap)<=.03};
 });
 return {time,state,bodyRoot:vec(actor.group.position),joints,feet};
}
export function createMotionTrace({limit=600}={}){
 if(!Number.isInteger(limit)||limit<1||limit>1800)throw new RangeError('trace limit');
 let active=false,frames=[],error=null;
 const read=()=>({frames:frames.slice(),active,error});
 return {start(){active=true;frames=[];error=null;},stop(reason=null){active=false;error=reason;return read();},get active(){return active;},push(frame){if(!active)return false;frames.push(frame);if(frames.length===limit)active=false;return true;},read};
}
export function sampleLabGround(fixtures,x,z){
 const p=fixtures.pool,s=fixtures.stairs;
 if(x>p.minX&&x<p.maxX&&z>p.minZ&&z<p.maxZ){
  const u=(p.maxX-x)/p.entry,entry=u<1,dx=entry?-p.bottom/p.entry:0,n=Math.hypot(dx,1);
  return {point:[x,fixtures.height(x,z),z],featureId:entry?'pool-entry':'pool-bottom',geometricNormal:Math.abs(u-1)<1e-8?null:[-dx/n,1/n,0]};
 }
 if(Math.abs(x-s.x)<=s.width/2&&z>=s.z&&z<=s.z+s.run*s.count)return null;
 for(const r of fixtures.ramps){
  const u=r.z-z;
  if(Math.abs(x-r.x)<=r.width/2&&u>=0&&u<=r.run){
   const k=r.height/r.run,n=Math.hypot(1,k);
   return {point:[x,fixtures.height(x,z),z],featureId:'ramp-'+r.angle,geometricNormal:[0,1/n,k/n]};
  }
 }
 return {point:[x,0,z],featureId:'floor',geometricNormal:[0,1,0]};
}
// Detached driver experiment only: scripted roots, no physics/foot IK.
// Amplitude variation is applied to bounded upper body channels, not physics.
export function replayMotion(makeActor,profile,{scenario='walk',strength='baseline',scale=1,frames=120}={}){
 if(!['idle','walk','backpedal','pivot','jump'].includes(scenario)||!Object.hasOwn(MOTION_STRENGTH,strength)||!Number.isInteger(frames)||frames<1||frames>600||!finite(scale)||scale<=0||scale>2)throw new TypeError('invalid experiment');
 const actor=makeActor(profile,{scale,clothing:false});
 try{
  const p={pos:actor.group.position.clone().set(0,0,0),vel:actor.group.position.clone().set(0,0,0),yaw:0,facingYaw:0,onGround:true,mode:'walk',keyboardSteering:true,teleportId:0};
  const measure=measureRig(actor),originalPose=actor.pose.bind(actor),upper=/^(pelvis|waist|ribcage|neck|head|upper_arm_|forearm_)/,factor=MOTION_STRENGTH[strength];let neutral={};
  actor.pose=angles=>{neutral=Object.fromEntries(Object.entries(angles).map(([id,a])=>[id,Array.from(a)]));originalPose(angles);};
  for(let i=0;i<60;i++)animatePlayer(actor,1/60,i/60,p,null,{});
  actor.pose=angles=>{
   const output={};
   for(const b of actor.data.bones){
    const a=angles[b.id];if(!a)continue;
    output[b.id]=Array.from(a,(v,i)=>{const n=neutral[b.id]?.[i]??0;return upper.test(b.id)?Math.max(b.axes[i].min,Math.min(b.axes[i].max,n+(v-n)*factor)):v;});
   }
   originalPose(output);
  };
  const trace=[];
  for(let i=0;i<frames;i++){
   const t=i/60,turn=scenario==='pivot'?2.4:0;
   p.vel.set(0,0,scenario==='walk'?-2.6:scenario==='backpedal'?2.6:0);
   if(scenario==='jump'&&i>=24&&i<84){const u=(i-24)/60;p.onGround=false;p.pos.y=4*u*(1-u);p.vel.y=4-8*u;}else{p.onGround=true;p.pos.y=0;}
   p.pos.z+=p.vel.z/60;p.yaw+=turn/60;p.facingYaw=p.yaw;
   actor.group.position.copy(p.pos);actor.group.rotation.y=p.yaw+Math.PI;
   const before=vec(p.pos),response=animatePlayer(actor,1/60,1+t,p,null,{}, {turnRate:turn,turnStep:turn/60,runSpeed:7.5});
   if(dist(before,vec(p.pos))!==0)throw Error('animation wrote physical root');
   const state=readMotionState(p,actor,null);state.pivotPhase=response.pivotPhase;state.pivotWeight=response.pivotWeight;state.landing=response.landing;
   trace.push(capturePose(actor,state,{time:t,groundSurface:()=>0,ankleRest:measure.ankleRest}));
  }
  return {scenario,strength,scale,rig:measure,frames:trace,scope:'scripted driver; no physics or post-IK'};
 }finally{actor.dispose();}
}
