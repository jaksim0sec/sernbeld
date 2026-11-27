import {SCHOOLYARD_CLIPS} from './schoolyard-motion.js';
import {animatePlayer} from './avatar-motion.js';
const finite=Number.isFinite, TAU=2*Math.PI;
const vec=v=>v&&[v.x,v.y,v.z].every(finite)?[v.x,v.y,v.z]:null;
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
export const MOTION_STRENGTH=Object.freeze({low:.65,baseline:1,high:1.35});
// Declarative presentation contract, not a replacement for Player or the IK solver.
// Pivot and the T3 ground-gait consumer have explicit presentation windows.
export function motionPolicy(action){
 const policy={entry:'authoritative action or presentation driver changes',exit:'authoritative action changes; no clip-completion wait',reset:'teleport or actor replacement',contactAuthority:'physical support and explicit IK intent',contactWindows:null,transitionWindows:{kind:'event-driven',interruptible:true,phaseContinuity:'preserve unless explicit reset'}};
 if(action==='idle'||action==='social')return {...policy,contact:{kind:'bilateral-ground-candidate',requires:['grounded','third-person'],authoredLock:false}};
 if(['walk','run','backpedal'].includes(action))return {...policy,contact:{kind:'gait-ankle-target',authoredLock:true,phaseDirection:action==='backpedal'?'reverse':'forward',source:'studio-integration.js gaitSupportWeight/groundGaitTarget',requires:['grounded','third-person','no slide','no pivot','no combat stance']},contactWindows:{clock:'phase',units:'radian',period:TAU,rule:'cos(phase + sideOffset) < -0.12; left offset 0, right offset PI',weight:'ramped by phase, speed, ankle gap and anchor distance; not a guaranteed sole lock'}};
 if(action==='pivot')return {...policy,contact:{kind:'pivot-ankle-target',requires:['grounded','third-person','pivotWeight>0'],authoredLock:true,source:'pivotFootTarget'},contactWindows:{clock:'pivotPhase',units:'radian',period:TAU,left:{swing:[0,Math.PI],support:[Math.PI,TAU]},right:{support:[0,Math.PI],swing:[Math.PI,TAU]},interval:'start-inclusive/end-exclusive',weight:'blend by pivotWeight; not a guaranteed sole lock'}};
 if(action==='airborne'||action==='swim'||action==='fly')return {...policy,contact:{kind:'no-ground-lock',authoredLock:false}};
 return {...policy,contact:{kind:'external-action-specific',authoredLock:false}};
}
const upperMotionChannel=id=>/^(pelvis|waist|ribcage|neck|head|upper_arm_|forearm_)/.test(id);
const quaternionAngle=(a,b)=>2*Math.acos(Math.max(0,Math.min(1,Math.abs(a.reduce((s,v,i)=>s+v*b[i],0)))));
export function compareMotionStrength(replays){
 const [low,base,high]=['low','baseline','high'].map(s=>replays.find(r=>r.strength===s));
 if(!low||!base||!high||[low,high].some(r=>r.scenario!==base.scenario||r.scale!==base.scale||r.rig.body!==base.rig.body||r.frames.length!==base.frames.length))throw Error('strength comparison requires matching replays');
 let rootDelta=0,phaseDelta=0,lowerLocalDelta=0;const channels={};
 for(let i=0;i<base.frames.length;i++){
  const b=base.frames[i],l=low.frames[i],h=high.frames[i];
  if(l.time!==b.time||h.time!==b.time)throw Error('strength replay timing mismatch');
  for(const f of [l,h]){
   rootDelta=Math.max(rootDelta,dist(f.state.root,b.state.root));
   phaseDelta=Math.max(phaseDelta,Math.abs(f.state.phase-b.state.phase));
  }
  for(let j=0;j<b.joints.length;j++){
   const x=b.joints[j],y=l.joints[j],z=h.joints[j];
   if(x.id!==y.id||x.id!==z.id)throw Error('strength rig channel mismatch');
   if(!upperMotionChannel(x.id)){
    // Component comparison avoids acos precision noise for identical quaternions.
    lowerLocalDelta=Math.max(lowerLocalDelta,dist(x.rotation,y.rotation),dist(x.rotation,z.rotation),dist(x.local,y.local),dist(x.local,z.local));continue;
   }
   const c=channels[x.id]??={lowToBaselineRad:0,highToBaselineRad:0,lowToHighRad:0};
   c.lowToBaselineRad=Math.max(c.lowToBaselineRad,quaternionAngle(y.rotation,x.rotation));
   c.highToBaselineRad=Math.max(c.highToBaselineRad,quaternionAngle(z.rotation,x.rotation));
   c.lowToHighRad=Math.max(c.lowToHighRad,quaternionAngle(y.rotation,z.rotation));
  }
 }
 return {scenario:base.scenario,body:base.rig.body,scale:base.scale,frames:base.frames.length,rootDelta,phaseDelta,lowerLocalDelta,channels,scope:'detached driver only; not full post-IK or approved appearance'};
}
export function motionManifest(clips=SCHOOLYARD_CLIPS){
 const base={schemaVersion:1,rigVersion:'studio-v1',rootOwnership:'physics',displacement:'in-place',source:'existing project motion driver',referencePermission:'project use only; redistribution not established',contactWindows:null,transitionWindows:null,tests:['tests/schoolyard-motion.mjs']};
 return [...['idle','walk','run','backpedal','pivot','airborne','swim','social'].map(id=>({...base,...motionPolicy(id),id,kind:'procedural',duration:null,repeat:id!=='airborne',actions:[id],syncGroup:['walk','run','backpedal'].includes(id)?'gait':id,channels:['pelvis','waist','ribcage','neck','head','arms','legs'],markers:[]})),
 ...Object.entries(clips).map(([id,c])=>({...base,id,kind:'keyframe',duration:c.duration,repeat:false,actions:[],syncGroup:null,channels:[...new Set(c.channels.flatMap(k=>Object.keys(k.p)))].sort(),markers:c.channels.map(k=>({time:k.t,kind:'authored-key'})),contact:{kind:'unannotated-keyframe',authoredLock:false},source:'user-supplied schoolyard reference: '+c.source}))];
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
// Rest-sole candidates are actual bare-body mesh vertices, selected once per
// geometry. Sample the posed skin, not the ankle offset or an IK target.
const soleCache=new WeakMap();
function soleCandidates(actor){
 const g=actor.mesh.geometry;
 let cached=soleCache.get(g);if(cached)return cached;
 const p=g.attributes.position,indices=g.attributes.skinIndex,weights=g.attributes.skinWeight;
 cached={};
 for(const side of ['left','right']){
  const root='foot_'+side,byId=new Map(actor.data.bones.map(b=>[b.id,b]));
  const belongs=b=>{for(let n=b;n;n=byId.get(n.parent))if(n.id===root)return true;return false;};
  const ids=new Set(actor.data.bones.flatMap((b,i)=>belongs(b)?[i]:[]));
  const candidates=[];let low=Infinity;
  for(let i=0;i<actor.bodyVertexCount;i++){
   let w=0;
   for(const k of ['X','Y','Z','W'])if(ids.has(indices['get'+k](i)))w+=weights['get'+k](i);
   if(w<.5)continue;
   const y=p.getY(i);low=Math.min(low,y);candidates.push({i,y});
  }
  cached[side]=candidates.filter(v=>(v.y-low)*actor.units<=.025).map(v=>v.i);
  if(!cached[side].length)throw Error('Missing rest sole vertices: '+side);
 }
 soleCache.set(g,cached);return cached;
}
export function samplePosedSoles(actor,state,groundSurface){
 if(!groundSurface)return null;
 // SkinnedMesh.updateMatrixWorld refreshes its attached bind inverse.
 actor.group.updateMatrixWorld(true);
 const ids=soleCandidates(actor),v=actor.group.position.clone();
 return Object.fromEntries(['left','right'].map(side=>{
  let minGap=Infinity,lowest=null,valid=0;const contact=[];
  for(const index of ids[side]){
   actor.mesh.getVertexPosition(index,v);actor.mesh.localToWorld(v);
   if(!vec(v))throw Error('nonfinite skinned sole vertex');
   const surface=groundSurface(v.x,v.z,state.root[1]);
   if(!finite(surface))continue;
   valid++;const gap=v.y-surface;
   if(gap<minGap){minGap=gap;lowest={index,world:vec(v),gap};}
   if(state.grounded&&Math.abs(gap)<=.015)contact.push({index,world:vec(v),gap});
  }
  contact.sort((a,b)=>Math.abs(a.gap)-Math.abs(b.gap)||a.index-b.index);
  return [side,{candidateCount:ids[side].length,validCount:valid,minGap:valid?minGap:null,lowest,contacts:contact.slice(0,8)}];
 }));
}
// Observations only: these are not authored contact windows or action authority.
// Compare the same skin vertex continuously; do not mistake rolling contacts
// or a teleport for drift. A gap in coverage starts a new observation.
export function summarizeMotionTrace(frames){
 const actions=[],feet={left:{windows:[],maxDrift:null,maxPenetration:null,comparisons:0},right:{windows:[],maxDrift:null,maxPenetration:null,comparisons:0}};
 const anchors={left:new Map(),right:new Map()};let previous=null;
 for(let i=0;i<frames.length;i++){
  const f=frames[i],s=f.state;if(!s)continue;
  const reset=!previous||previous.state.teleportId!==s.teleportId||f.time<=previous.time;
  if(reset||actions.at(-1)?.action!==s.action)actions.push({action:s.action,start:i,end:i});else actions.at(-1).end=i;
  for(const side of ['left','right']){
   const m=feet[side],sole=f.soles?.[side],contacts=sole?.contacts??[],old=reset?new Map():anchors[side],next=new Map();
   if(s.grounded&&finite(sole?.minGap))m.maxPenetration=Math.max(m.maxPenetration??0,-sole.minGap,0);
   if(contacts.length){
    if(reset||m.windows.at(-1)?.end!==i-1)m.windows.push({start:i,end:i});else m.windows.at(-1).end=i;
    for(const c of contacts){
     const anchor=old.get(c.index)??c.world;
     if(old.has(c.index)){m.comparisons++;m.maxDrift=Math.max(m.maxDrift??0,Math.hypot(c.world[0]-anchor[0],c.world[2]-anchor[2]));}
     next.set(c.index,anchor);
    }
   }
   anchors[side]=next;
  }
  previous=f;
 }
 return {actions,feet,scope:'observed bare-body sole samples; no authored support or pass/fail inference'};
}
// A separate presentation diagnostic: measured changes, never a new solver.
// The same action and fixed sampling interval are required for phase checks.
export function motionQuality(frames){
 const result={frames:frames.length,phase:{forward:0,reverse:0,opposite:0},maxLocalJointDeltaRad:null,maxLocalJointDelta:null,maxRootRenderGap:null,maxRenderBodyGap:null,groundTransitions:[],pivotFrames:0};
 let previous=null;
 for(let i=0;i<frames.length;i++){
  const f=frames[i],s=f.state;if(!s)continue;
  if(s.root&&s.renderRoot)result.maxRootRenderGap=Math.max(result.maxRootRenderGap??0,dist(s.root,s.renderRoot));
  if(s.renderRoot&&f.bodyRoot)result.maxRenderBodyGap=Math.max(result.maxRenderBodyGap??0,dist(s.renderRoot,f.bodyRoot));
  const p=previous?.state,dt=previous?f.time-previous.time:0;
  if(p&&p.teleportId===s.teleportId&&dt>0&&dt<=.1){
   const headingDelta=Math.atan2(Math.sin(s.heading-p.heading),Math.cos(s.heading-p.heading));
   if(s.action==='idle'&&s.grounded&&Math.abs(headingDelta)/dt>.12)result.pivotFrames++;
   if(p.grounded!==s.grounded)result.groundTransitions.push({frame:i,kind:s.grounded?'land':'leave-ground'});
   if(s.action===p.action&&['walk','run','backpedal'].includes(s.action)){
    const d=Math.atan2(Math.sin(s.phase-p.phase),Math.cos(s.phase-p.phase));
    if(Math.abs(d)>1e-6){const reverse=s.action==='backpedal';result.phase[reverse?'reverse':'forward']++;if(reverse?d>0:d<0)result.phase.opposite++;}
   }
   const old=new Map((previous.joints??[]).map(j=>[j.id,j.rotation]));
   for(const j of f.joints??[]){
    const q=old.get(j.id);if(!q)continue;
    const dot=Math.abs(q.reduce((sum,v,k)=>sum+v*j.rotation[k],0));
    const angle=2*Math.acos(Math.max(0,Math.min(1,dot)));
    if(result.maxLocalJointDeltaRad===null||angle>result.maxLocalJointDeltaRad){result.maxLocalJointDeltaRad=angle;result.maxLocalJointDelta={joint:j.id,frame:i,action:s.action,radians:angle};}
   }
  }
  previous=f;
 }
 return result;
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
 return {time,state,bodyRoot:vec(actor.group.position),joints,feet,soles:samplePosedSoles(actor,state,groundSurface)};
}
export function createMotionTrace({limit=600}={}){
 if(!Number.isInteger(limit)||limit<1||limit>1800)throw new RangeError('trace limit');
 let active=false,frames=[],error=null;
 const read=()=>({frames:frames.slice(),active,error,...(frames[0]?.state?{summary:summarizeMotionTrace(frames),quality:motionQuality(frames)}:{})});
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
   const state=readMotionState(p,actor,null);if(scenario==='pivot'&&response.pivotWeight>.005)state.action='pivot';state.pivotPhase=response.pivotPhase;state.pivotWeight=response.pivotWeight;state.landing=response.landing;
   trace.push(capturePose(actor,state,{time:t,groundSurface:()=>0,ankleRest:measure.ankleRest}));
  }
  return {scenario,strength,scale,rig:measure,frames:trace,scope:'scripted driver; no physics or post-IK'};
 }finally{actor.dispose();}
}
