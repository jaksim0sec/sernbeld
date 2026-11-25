// Presentation-only resident activity; scheduler jobs remain authoritative.
import {residentWalkSpeed} from './npc-movement.js';
export const RESIDENT_ACTIVITY_KEY='sernbeld.resident-activity.v1';
export const RESIDENT_ACTIVITY_TTL=30*60*1000;
const LIMIT=512, MAX_BYTES=128*1024, HEARTBEAT=60*1000;
const finite=Number.isFinite;
const pair=p=>Array.isArray(p)&&p.length===2&&p.every(finite);
const point=p=>p&&[p.x,p.y,p.z].every(finite);
// Invalidate only presentation snapshots from the previous distribution policy.
export function residentActivityStamp(entry,spot){return JSON.stringify([2,entry,spot]);}
const FOLK_PLACES=['stall_c','plaza','inn_yard','quay','guild_board','west_gate'];
const GUARD_PLACES=['plaza','quay','west_gate','north_gate'];
const KID_PLACES=['fountain_bench','plaza','inn_yard'];
export function distributedResidentDay(job,i,day){
 return day.map(([hour,place,mode],phase)=>{
  if(hour===0){
   if(job==='guard'&&i%2)place='west_gate';
   return mode?[hour,place,mode]:[hour,place];
  }
  if(job==='folk'&&mode==='wander')place=FOLK_PLACES[(i+phase*2)%FOLK_PLACES.length];
  if(job==='docker'){
   if(mode==='work'&&i%2)place=place==='pier_a'?'pier_b':'pier_a';
   if(mode==='wander'&&place==='quay'&&i%3===1)place='harbor_office';
   if(mode==='wander'&&place==='quay'&&i%3===2)place='plaza';
   if(mode==='wander'&&place==='inn'&&i%2)place='inn_yard';
  }
  if(job==='guard'){
   if(mode==='wander')place=GUARD_PLACES[i%GUARD_PLACES.length];
   if(mode==='stand'&&i%2)place=place==='west_gate'?'north_gate':'west_gate';
  }
  if(job==='kid'&&mode==='wander')place=KID_PLACES[(i+phase)%KID_PLACES.length];
  const offset=job==='vendor'?0:((i*7+phase*3)%13-6)/20;
  return mode?[hour+offset,place,mode]:[hour+offset,place];
 });
}
// A resident counts once, even if both its current and reserved positions are close.
export function residentDestinationClear(actor,x,z,others,queue=[]){
 let nearby=0;
 const pending=new Map(queue.map(([n,tx,tz])=>[n,[tx,tz]]));
 for(const n of others){
  if(n===actor)continue;
  const target=pending.get(n)??(n.path&&n.pi<n.path.length?n.path[n.path.length-1]:null);
  const here=n.hidden?Infinity:Math.hypot(n.x-x,n.z-z);
  const there=target?Math.hypot(target[0]-x,target[1]-z):Infinity;
  const d=Math.min(here,there);
  if(d<1.2)return false;
  if(d<3.5&&++nearby>=3)return false;
 }
 return true;
}
export function pickResidentWanderPoint(center,{random,pointAt,available,attempts=12,minRadius=2,maxRadius=11}){
 if(!pair(center))return null;
 for(let i=0;i<attempts;i++){
  const angle=random()*Math.PI*2,dist=minRadius+(maxRadius-minRadius)*random();
  const p=pointAt(center[0]+Math.cos(angle)*dist,center[1]+Math.sin(angle)*dist);
  if(p&&available(p.x,p.z))return p;
 }
 return null;
}
export function createResidentActivityCache(storage=()=>localStorage){
 let lastAt=-Infinity,lastSignature=null;
 return {
  read(now=Date.now()){
   try{
    const raw=storage().getItem(RESIDENT_ACTIVITY_KEY);
    if(!raw||raw.length>MAX_BYTES)return null;
    const c=JSON.parse(raw);
    if(c?.version!==1||!finite(c.savedAt)||now<c.savedAt||now-c.savedAt>RESIDENT_ACTIVITY_TTL||
      typeof c.regionId!=='string'||!Number.isSafeInteger(c.day)||c.day<1||
      !c.entries||typeof c.entries!=='object'||Array.isArray(c.entries)||Object.keys(c.entries).length>LIMIT)return null;
    return c;
   }catch{return null;}
  },
  write(regionId,day,entries,now=Date.now(),force=false){
   try{
    if(Object.keys(entries).length>LIMIT||!finite(now)||!Number.isSafeInteger(day)||day<1)return false;
    const signature=JSON.stringify([regionId,day,entries]);
    if(signature===lastSignature&&now>=lastAt&&now-lastAt<(force?1000:HEARTBEAT))return true;
    const raw=JSON.stringify({version:1,regionId,day,savedAt:now,entries});
    if(raw.length>MAX_BYTES)return false;
    storage().setItem(RESIDENT_ACTIVITY_KEY,raw);
    lastAt=now;lastSignature=signature;return true;
   }catch{return false;}
  },
  clear(){lastSignature=null;lastAt=-Infinity;try{storage().removeItem(RESIDENT_ACTIVITY_KEY);}catch{}}
 };
}
export function captureResidentActivity(n,stamp,pending){
 const target=pending??(n.path&&n.pi<n.path.length?n.path[n.path.length-1]:null);
 if(!point(n)||!finite(n.yaw)||!finite(n.wait)||target!==null&&!pair(target))return null;
 return {stamp,x:n.x,y:n.y,z:n.z,yaw:n.yaw,wait:Math.max(0,Math.min(20,n.wait)),hidden:!!n.hidden,target:target?[...target]:null};
}
// Restore current-schedule presentation state. Rebuild paths against current navigation.
export function restoreResidentActivity(n,r,{stamp,spot,pointAt,queue}){
 if(!r||r.stamp!==stamp||!point(r)||!finite(r.yaw)||!finite(r.wait)||r.wait<0||r.wait>20||
   typeof r.hidden!=='boolean'||r.target!==null&&!pair(r.target))return false;
 const home=n.entry[1]==='home',wander=n.entry[2]==='wander';
 if(r.hidden){
  if(!home||r.target!==null||Math.hypot(r.x-spot[0],r.z-spot[1])>.35||Math.abs(r.y-n.y)>.8)return false;
 }else{
  if(home&&!r.target)return false;
  const p=pointAt(r.x,r.z,r.y);
  if(!p||Math.abs(p.y-r.y)>.8)return false;
  if(r.target){
   if(Math.hypot(r.target[0]-spot[0],r.target[1]-spot[1])>(wander?16:.05)||!pointAt(...r.target))return false;
  }
 }
 Object.assign(n,{x:r.x,y:r.y,z:r.z,yaw:r.yaw,wait:r.wait,hidden:r.hidden,path:null,pi:0,speed:0});
 if(r.target)queue(n,...r.target);
 return true;
}
// Cold/expired start: preserve work/home/stand and distribute wander phases.
export function seedResidentActivity(n,{random=Math.random,pointAt,segment,available=()=>true}){
 n.wait=2+random()*18;
 if(n.hidden||n.entry[2]!=='wander'||random()>=.35)return false;
 const a=pointAt(n.x,n.z,n.y);
 if(!a)return false;
 const angle=random()*Math.PI*2,dist=3+random()*5;
 const b=pointAt(a.x+Math.cos(angle)*dist,a.z+Math.sin(angle)*dist);
 if(!b||!available(b.x,b.z)||!segment(a,b))return false;
 const t=.15+random()*.65,p=pointAt(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,a.y+(b.y-a.y)*t);
 if(!p||!available(p.x,p.z)||!segment(p,b))return false;
 Object.assign(n,{x:p.x,y:p.y,z:p.z,yaw:Math.atan2(b.x-a.x,b.z-a.z),path:[[b.x,b.z]],pi:0,wait:0,speed:residentWalkSpeed(n.def?.scale)});
 return true;
}
