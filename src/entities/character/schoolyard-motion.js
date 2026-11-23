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
const KICK_GUARD={upper_arm_left:[55,16],upper_arm_right:[62,16],forearm_left:[105,0],forearm_right:[112,0]};
// Imported animation catalog. Clips not requested in SERNBELD are intentionally
// registered only: no controls, hitboxes, stamina, or combat dispatch.
export const SCHOOLYARD_CLIPS=Object.freeze({
 frontKick:{duration:.56,channels:[
  {t:0,p:{...KICK_GUARD,thigh_left:[18,5],thigh_right:[-10,5],shin_left:[22],shin_right:[32],ribcage:[6,-14]}},
  {t:.10,p:{thigh_right:[72,5],shin_right:[112],waist:[-2,0]}},
  {t:.20,p:{thigh_right:[90,5],shin_right:[6],waist:[-8,0],ribcage:[0,8]}},
  {t:.34,p:{thigh_right:[62,5],shin_right:[104]}},
  {t:.56,p:{...IDLE}}]},
 roundKick:{duration:1.1,channels:[
  {t:0,p:{thigh_left:[34,0],shin_left:[60],thigh_right:[-18,0],shin_right:[66],ribcage:[12,-28],upper_arm_left:[70,0],forearm_left:[100]}},
  {t:.14,p:{thigh_right:[40,0],shin_right:[100],ribcage:[5,26]}},
  {t:.30,p:{thigh_right:[78,22],shin_right:[105],pelvis:[12,16],ribcage:[-14,26]}},
  {t:.42,p:{thigh_right:[88,34],shin_right:[6],pelvis:[16,-12]}},
  {t:.60,p:{thigh_right:[55,8],shin_right:[85],ribcage:[4,6]}},
  {t:.78,p:{thigh_right:[40,0],shin_right:[88],ribcage:[22,0]}},
  {t:1.1,p:IDLE}]},
 palmChop:{duration:.8,channels:[
  {t:0,p:{upper_arm_right:[100,10],forearm_right:[70],ribcage:[-8,-20]}},
  {t:.14,p:{upper_arm_right:[105,10],forearm_right:[40],waist:[-12,0]}},
  {t:.28,p:{upper_arm_right:[40,10],forearm_right:[6],waist:[24,0],ribcage:[0,22]}},
  {t:.42,p:{upper_arm_right:[15,10],forearm_right:[10],waist:[28,0]}},
  {t:.8,p:IDLE}]},
 dropKick:{duration:1.5,channels:[
  {t:0,p:{thigh_left:[55,0],thigh_right:[50,0],shin_left:[95],shin_right:[95],waist:[24,0]}},
  {t:.16,p:{thigh_left:[20,0],thigh_right:[20,0],shin_left:[30],shin_right:[30]}},
  {t:.32,p:{thigh_left:[85,0],thigh_right:[85,0],shin_left:[118],shin_right:[118],pelvis:[18,0]}},
  {t:.46,p:{thigh_left:[12,0],thigh_right:[16,0],shin_left:[2],shin_right:[2]}},
  {t:.66,p:{thigh_left:[12,0],thigh_right:[16,0],shin_left:[2],shin_right:[2]}},
  {t:.9,p:{thigh_left:[40,0],thigh_right:[25,0],shin_left:[60],shin_right:[40]}},
  {t:1.2,p:{thigh_left:[75,0],thigh_right:[65,0],shin_left:[115],shin_right:[105]}},
  {t:1.5,p:IDLE}]},
 specialRoundKick:{duration:1.1,derivedFrom:'roundKick',channels:null}
});
function blendInto(target,clip,time,weight){
 const keys=clip.channels;if(!keys||!weight)return;
 const t=clamp(time,0,clip.duration);let i=0;
 while(i<keys.length-2&&keys[i+1].t<t)i++;
 const a=keys[i],b=keys[i+1],u=ease(clamp((t-a.t)/(b.t-a.t||1),0,1));
 const names=new Set([...Object.keys(a.p),...Object.keys(b.p)]);
 for(const name of names){
  const dst=target[name];if(!dst)continue;
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
 let prevGround=true,landing=0,airAge=0,turnFlex=0,prevYaw=null,clock=0;
 let anim=null;
 const api={
  play(name){if(!SCHOOLYARD_CLIPS[name])return false;anim={name,time:0};return true;},
  get active(){return anim?.name??null;},
  update(dt,t,player,swing,{first=false,runSpeed=5,armed=false}={}){
   dt=clamp(dt,0,.05);clock+=dt;
   const speed=Math.hypot(player.vel.x,player.vel.z);
   const walking=clamp(speed/1.15,0,1);
   const run=clamp((speed-2.6)/Math.max(.5,runSpeed-2.6),0,1);
   const moving=walking*(1-.14*run);
   const phase=actor.phase;
   const s=Math.sin(phase),c=Math.cos(phase);
   const grounded=!!player.onGround&&!player.swimming;
   if(grounded&&!prevGround)landing=1;
   prevGround=grounded;
   landing=Math.max(0,landing-dt*3.6);
   airAge=grounded?0:airAge+dt;
   const yaw=Number.isFinite(player.yaw)?player.yaw:0;
   const turn=prevYaw===null?0:Math.atan2(Math.sin(yaw-prevYaw),Math.cos(yaw-prevYaw))/Math.max(dt,.001);
   prevYaw=yaw;
   turnFlex+=(clamp(Math.abs(turn)*.06,0,1)-turnFlex)*(1-Math.exp(-12*dt));
   const crouch=grounded?(5+7*moving+11*turnFlex+12*landing):0;
   const bob=Math.cos(phase*2)*moving;
   for(const id in targets)targets[id].fill(0);
   const put=(id,...a)=>{const b=targets[id];if(b)for(let i=0;i<b.length;i++)b[i]=a[i]??0;};
   // Schoolyard V3 pelvis/lumbar/thoracic split, asymmetrical stride,
   // forearm counter-swing, planted-sole ankle counter-rotation.
   put('pelvis',-2*turnFlex,clamp(turn*1.2,-8,8));
   // Schoolyard V3 distributes gaze pitch along lumbar, thoracic, neck and
   // head joints (12/12/30/46%) so first-person view can follow the skull.
   const pitch=clamp((player.pitch||0)*rad,-75,75);
   put('waist',pitch*.12-crouch*.78-4*run,-clamp(turn*.65,-9,9));
   put('ribcage',pitch*.12-crouch*.25+Math.sin(t*1.7)*.8,-6*s*moving+clamp(turn*.9,-13,13));
   put('neck',pitch*.30+crouch*.16,0);
   put('head',-clamp(turn*.75,-12,12),pitch*.46+crouch*.12);
   for(const [side,o] of [['left',0],['right',Math.PI]]){
    const q=Math.sin(phase+o),push=Math.cos(phase+o);
    if(player.swimming){
     put('thigh_'+side,q*18,0);put('shin_'+side,20+10*Math.max(0,push));
     put('upper_arm_'+side,55+q*25,35);put('forearm_'+side,35,0);
    }else if(!grounded){
     put('thigh_'+side,side==='left'?24:-10,4);
     put('shin_'+side,side==='left'?42:26);
     put('upper_arm_'+side,22+7*airAge,8);put('forearm_'+side,48,0);
    }else{
     const hip=28*moving*q+(side==='left'?1:-1)*2+crouch*.53;
     const knee=(44*Math.max(push,0)+5)*moving+crouch*.46;
     put('thigh_'+side,hip,4);
     put('shin_'+side,knee);
     // Shin rotates opposite the hip axis in the studio rig.
     put('foot_'+side,clamp(knee-hip,-35,30)*.65);
     put('upper_arm_'+side,-23*moving*q+6*turnFlex,6);
     put('forearm_'+side,18+14*moving+5*turnFlex,0);
    }
   }
   // Keep the existing sword IK and finger handling authoritative. The full
   // body drives anticipation/reaction; grip targets still solve at the wrists.
   if(swing?.weight){
    const w=swing.weight;
    targets.ribcage[0]+=(-6*swing.pull+10*swing.extension)*w;
    targets.ribcage[1]+=(-10*swing.arc)*w;
    targets.pelvis[1]+=3*(swing.side||0)*w;
    targets.waist[0]+=(-4*swing.pull+6*swing.extension)*w;
   }
   if(anim){
    anim.time+=dt;
    const clip=SCHOOLYARD_CLIPS[anim.name],weight=ease(clamp(Math.min(anim.time/.12,(clip.duration-anim.time)/.17),0,1));
    const map={};for(const [id,a] of Object.entries(targets))map[id]=Array.from(a);
    blendInto(map,clip.derivedFrom?SCHOOLYARD_CLIPS[clip.derivedFrom]:clip,anim.time,weight);
    for(const [id,a] of Object.entries(map))targets[id].set(a);
    if(anim.time>=clip.duration)anim=null;
   }
   // Damped spring retargeting from the reference, substepped to remain stable
   // when the browser skips frames. Joint limits come from the real studio rig.
   const stiffness=anim?34:grounded?25:19,steps=Math.max(1,Math.ceil(dt/.01)),h=dt/steps;
   for(let n=0;n<steps;n++)for(const b of rig){
    const a=angles[b.id],v=vel[b.id],tar=targets[b.id];
    for(let j=0;j<a.length;j++){
     const lo=b.axes[j].min,hi=b.axes[j].max,target=clamp(tar[j],lo,hi);
     v[j]+=(stiffness*stiffness*(target-a[j])-2*stiffness*v[j])*h;
     a[j]=clamp(a[j]+v[j]*h,lo,hi);
     if((a[j]===lo&&v[j]<0)||(a[j]===hi&&v[j]>0))v[j]=0;
    }
   }
   // No root-position writes here. In particular, keep SERNBELD step-up,
   // terrain sampling, climbing, swimming, and jump collision intact.
   actor.pose(angles);
   actor.B.pelvis.position.copy(actor.rest.pelvis);
   actor.B.pelvis.position.y-=grounded?.013*moving*(1+Math.cos(phase*2))*.5:0;
   return {bob:-.018*moving*Math.cos(2*phase),landing,grounded,first};
  }
 };
 return api;
}
