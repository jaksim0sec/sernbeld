import {SCHOOLYARD_REFERENCE_ABILITIES} from './schoolyard-reference-clips.js';
import {applyCombatStance} from './combat-stance.js';
// Motion driver retargeted from schoolyard_duel_v3_no_user_select.html.
// The reference's 47-joint channel convention is retained; world movement, collision,
// step-up, weapon contact, and combat damage remain owned by SERNBELD.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const ease=t=>t*t*(3-2*t);
const rad=180/Math.PI;
const IDLE={pelvis:[0,0],waist:[0,0],ribcage:[0,0],neck:[0,0],head:[0,0],
 thigh_left:[8,4],thigh_right:[-5,4],shin_left:[12],shin_right:[17],
 upper_arm_left:[16,8],upper_arm_right:[16,8],forearm_left:[26,0],forearm_right:[26,0],
 foot_left:[0],foot_right:[0]};
// Load the ORIGINAL authored channels from the uploaded source instead of
// approximating them with arbitrary angles. Global displacement/spin stay in
// reference metadata; they never change SERNBELD's player physics.
const sourceNames={roundKick:'yareung',frontKick:'ap',palmChop:'chop',dropKick:'drop',specialRoundKick:'yeot'};
function convertChannelPose(p){
 const out={};
 for(const [key,degree] of Object.entries(p)){
  const match=/^(.+)\.(\d+)$/.exec(key);
  if(match)(out[match[1]]??=[])[Number(match[2])]=degree;
 }
 // Reference virtual channels are anatomical body controls, not root movement.
 if(Number.isFinite(p.ribTw))(out.ribcage??=[])[1]=p.ribTw;
 if(Number.isFinite(p.lean))(out.waist??=[])[0]=-p.lean;
 return out;
}
export const SCHOOLYARD_CLIPS=Object.freeze(Object.fromEntries(Object.entries(sourceNames).map(([id,original])=>{
 const ability=SCHOOLYARD_REFERENCE_ABILITIES[original];
 return [id,Object.freeze({duration:ability.end,source:original,channels:ability.keys.map(key=>({t:key.t,p:convertChannelPose(key.p)}))})];
})));
function blendInto(target,clip,time,weight){
 const keys=clip.channels;if(!keys||!weight)return;
 const t=clamp(time,0,clip.duration);let i=0;
 while(i<keys.length-2&&keys[i+1].t<t)i++;
 const a=keys[i],b=keys[i+1],u=ease(clamp((t-a.t)/(b.t-a.t||1),0,1));
 const names=new Set([...Object.keys(a.p),...Object.keys(b.p)]);
 for(const name of names){
  // Include fingers and rare joints absent from the idle template.
  const dst=target[name]??(target[name]=Array(Math.max(a.p[name]?.length||0,b.p[name]?.length||0)).fill(0));
  const va=a.p[name]||IDLE[name]||[],vb=b.p[name]||IDLE[name]||[];
  for(let j=0;j<dst.length;j++)dst[j]+=((va[j]||0)*(1-u)+(vb[j]||0)*u-dst[j])*weight;
 }
}
export function sampleSchoolyardClip(name,time,weight=1){
 const clip=SCHOOLYARD_CLIPS[name];if(!clip)return null;
 const angles={};for(const [name,v] of Object.entries(IDLE))angles[name]=v.slice();
 blendInto(angles,clip.derivedFrom?SCHOOLYARD_CLIPS[clip.derivedFrom]:clip,time,clamp(weight,0,1));
 return angles;
}
export function createSchoolyardMotion(actor){
 const rig=actor.data.bones,angles={},vel={},targets={};
 for(const b of rig){angles[b.id]=new Float32Array(b.axes.length);vel[b.id]=new Float32Array(b.axes.length);targets[b.id]=new Float32Array(b.axes.length);}
 let prevGround=true,landing=0,airAge=0,turnFlex=0,prevYaw=null,clock=0,stepLift=0;
 let anim=null;
 const api={
  play(name){if(!SCHOOLYARD_CLIPS[name])return false;anim={name,time:0};return true;},
  get active(){return anim?.name??null;},
  update(dt,t,player,swing,{first=false,runSpeed=5,turnRate=null,gazeYaw=0,gaitSpeed=Math.hypot(player.vel.x,player.vel.z)}={}){
   dt=clamp(dt,0,.12);clock+=dt;
   const speed=gaitSpeed;
   const walking=clamp(speed/1.15,0,1);
   const run=clamp((speed-2.6)/Math.max(.5,runSpeed-2.6),0,1);
   const moving=walking*(1-.05*run);
   const phase=actor.phase;
   const s=Math.sin(phase),c=Math.cos(phase);
   const grounded=!!player.onGround&&!player.swimming;
   const descent=ease(clamp((.7-(player.vel.y??0))/3.7,0,1));
   if(grounded&&!prevGround)landing=1;
   prevGround=grounded;
   landing=Math.max(0,landing-dt*3.6);
   airAge=grounded?0:airAge+dt;
   const yaw=Number.isFinite(player.yaw)?player.yaw:0;
   const turn=turnRate??(prevYaw===null?0:Math.atan2(Math.sin(yaw-prevYaw),Math.cos(yaw-prevYaw))/Math.max(dt,.001));
   prevYaw=yaw;
   turnFlex+=(clamp(Math.abs(turn)*.16,0,1)-turnFlex)*(1-Math.exp(-12*dt));
   const crouch=grounded?(5+7*moving+11*turnFlex+12*landing):0;
   const stepping=Math.max(moving,first?0:turnFlex*.38);
   stepLift=Math.max(stepLift*Math.exp(-dt*10),grounded?clamp((player.stepRise||0)*2.5,0,1):0);
   for(const id in targets)targets[id].fill(0);
   const put=(id,...a)=>{const b=targets[id];if(b)for(let i=0;i<b.length;i++)b[i]=a[i]??0;};
   // Schoolyard V3 pelvis/lumbar/thoracic split, asymmetrical stride,
   // forearm counter-swing, planted-sole ankle counter-rotation.
   put('pelvis',-2*turnFlex,clamp(turn*1.2,-8,8));
   // Schoolyard V3 distributes gaze pitch along lumbar, thoracic, neck and
   // head joints (12/12/30/46%) so first-person view can follow the skull.
   const pitch=clamp((player.pitch||0)*rad,-75,75);
   put('waist',pitch*.12-crouch*.78-(first?4:14)*run,-clamp(turn*.65,-9,9));
   const gaze=clamp(gazeYaw*rad,-55,55);
   put('ribcage',pitch*.12-crouch*.25+Math.sin(t*1.7)*.8,-(6+4*run)*s*moving+clamp(turn*.9,-13,13)+gaze*.32);
   put('neck',pitch*.30+crouch*.16,0);
   put('head',-clamp(turn*.75,-12,12)+gaze*.68,pitch*.46+crouch*.12);
   for(const [side,o] of [['left',0],['right',Math.PI]]){
    const q=Math.sin(phase+o),push=Math.cos(phase+o);
    if(player.swimming){
     put('thigh_'+side,q*18,0);put('shin_'+side,20+10*Math.max(0,push));
     put('upper_arm_'+side,55+q*25,35);put('forearm_'+side,35,0);
    }else if(!grounded){
     // Raise one knee on takeoff. On descent, reach down with that leg
     // while the trailing knee folds and the heel lifts behind the body.
     const lead=side==='left';
     put('thigh_'+side,lead?64-36*descent:-7-15*descent,3);
     put('shin_'+side,lead?68-50*descent:24+52*descent);
     put('foot_'+side,lead?5-12*descent:4-15*descent);
     put('upper_arm_'+side,22+7*airAge,8);put('forearm_'+side,48,0);
    }else{
     const hip=(27+23*run)*stepping*q+(side==='left'?1:-1)*2+crouch*.53;
     const knee=((40+38*run)*Math.max(push,0)+5)*stepping+crouch*.65;
     const lift=stepLift*Math.max(0,q);
     put('thigh_'+side,hip+lift*16,4);
     put('shin_'+side,knee+lift*22);
     // Shin rotates opposite the hip axis in the studio rig.
     put('foot_'+side,clamp(knee-hip,-35,30)*.65);
     put('upper_arm_'+side,-(23+22*run)*moving*q+6*turnFlex,6);
     put('forearm_'+side,18+14*moving+42*run+5*turnFlex,0);
    }
   }
   // Preserve the NPC conversation nod that the old studio animator had.
   // It is an overlay, not another locomotion implementation.
   if(!first&&actor.talk>0){targets.head[0]=0;targets.head[1]+=Math.sin(t*7)*3;}
   // Keep the existing sword IK and finger handling authoritative. The full
   // body drives anticipation/reaction; grip targets still solve at the wrists.
   if(swing?.weight){
    const {weight:w,pull,extension,arc,side}=swing;
    const twist=clamp(arc*21,-37,37)*w;
    targets.pelvis[1]-=twist*.26;
    targets.waist[1]-=twist*.30;
    targets.ribcage[1]-=twist*.44;
    const lead=side===1?'left':'right';
    targets['upper_arm_'+lead][0]+=(19*pull-15*extension)*w;
    targets['forearm_'+lead][0]+=(22*pull+11*extension)*w;
   }
   if(anim){
    anim.time+=dt;
    const clip=SCHOOLYARD_CLIPS[anim.name],weight=ease(clamp(Math.min(anim.time/.12,(clip.duration-anim.time)/.17),0,1));
    const map={};for(const [id,a] of Object.entries(targets))map[id]=Array.from(a);
    blendInto(map,clip.derivedFrom?SCHOOLYARD_CLIPS[clip.derivedFrom]:clip,anim.time,weight);
    // Clip catalogs may contain finger joints absent from a simplified rig.
    for(const [id,a] of Object.entries(map)){
     const dst=targets[id];if(!dst)continue;
     for(let j=0;j<dst.length;j++)dst[j]=a[j]??0;
    }
    if(anim.time>=clip.duration)anim=null;
   }
   // Exact critically damped integration at a constant target over this sample.
   const stiffness=anim||swing?.weight?34:grounded?25:19,decay=Math.exp(-stiffness*dt);
   for(const b of rig){
    const a=angles[b.id],v=vel[b.id],tar=targets[b.id];
    for(let j=0;j<a.length;j++){
     const lo=b.axes[j].min,hi=b.axes[j].max,target=clamp(tar[j],lo,hi);
     const error=a[j]-target,term=v[j]+stiffness*error;
     v[j]=(v[j]-stiffness*term*dt)*decay;
     a[j]=clamp(target+(error+term*dt)*decay,lo,hi);
     if((a[j]===lo&&v[j]<0)||(a[j]===hi&&v[j]>0))v[j]=0;
    }
   }
   // No root-position writes here. In particular, keep SERNBELD step-up,
   // terrain sampling, climbing, swimming, and jump collision intact.
   actor.pose(angles);
   actor.B.pelvis.position.copy(actor.rest.pelvis);
   actor.B.pelvis.position.y-=grounded?(.013+.014*run)*moving*(1+Math.cos(phase*2))*.5:0;
   applyCombatStance(actor,swing,grounded,speed);
   return {bob:-.018*moving*Math.cos(2*phase),landing,grounded,first};
  }
 };
 return api;
}
