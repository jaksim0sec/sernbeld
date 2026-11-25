// Logical movement depends only on a verified route and the existing game clock.
const point=p=>p&&typeof p==='object'&&[p.x,p.y,p.z].every(Number.isFinite);
const tick=v=>Number.isSafeInteger(v)&&v>=0;
const copy=v=>JSON.parse(JSON.stringify(v));
const distance=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
const fail=reason=>({ok:false,reason});
export function gameClockTick({day,hour}={}){
 if(!Number.isSafeInteger(day)||day<1||!Number.isFinite(hour)||hour<0||hour>=24)return null;
 const t=(day-1)*1440+Math.floor(hour*60);
 return tick(t)?t:null;
}
export function buildLogicalRoute({regionId,from,to,metersPerTick,findPath,validateSegment}={}){
 if(typeof regionId!=='string'||!regionId||!point(from)||!point(to)||!Number.isFinite(metersPerTick)||metersPerTick<=0||typeof findPath!=='function'||typeof validateSegment!=='function')return fail('invalid');
 let path;try{path=findPath(copy(from),copy(to),regionId)}catch{return fail('unreachable')}
 if(!Array.isArray(path)||path.length>4096||!path.every(point))return fail('unreachable');
 if(distance(from,to)>1e-6&&(!path.length||distance(path[path.length-1],to)>1e-6))return fail('unreachable');
 const points=[copy(from)];
 for(const p of path)if(distance(points[points.length-1],p)>1e-6)points.push(copy(p));
 if(distance(points[points.length-1],to)>1e-6)return fail('unreachable');
 let length=0;
 try{for(let i=1;i<points.length;i++){if(validateSegment(copy(points[i-1]),copy(points[i]),regionId)!==true)return fail('unreachable');length+=distance(points[i-1],points[i])}}catch{return fail('unreachable')}
 const duration=Math.max(1,Math.ceil(length/metersPerTick));
 if(!tick(duration)||!Number.isFinite(length))return fail('invalid');
 return {ok:true,route:{regionId,points,metersPerTick,length,duration}};
}
export function validLogicalRoute(route){
 if(!route||typeof route.regionId!=='string'||!route.regionId||!Array.isArray(route.points)||!route.points.length||route.points.length>4097||!route.points.every(point)||!Number.isFinite(route.metersPerTick)||route.metersPerTick<=0)return false;
 const length=route.points.slice(1).reduce((n,p,i)=>n+distance(route.points[i],p),0);
 return Number.isFinite(length)&&Math.abs(length-route.length)<1e-6&&tick(route.duration)&&route.duration===Math.max(1,Math.ceil(length/route.metersPerTick));
}
export function positionOnRoute(route,elapsed){
 if(!validLogicalRoute(route)||!tick(elapsed))return null;
 let left=Math.min(route.length,elapsed*route.metersPerTick);
 for(let i=1;i<route.points.length;i++){
  const a=route.points[i-1],b=route.points[i],len=distance(a,b);
  if(len>0&&left<len){const t=left/len;return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t}}
  left-=len;
 }
 return copy(route.points[route.points.length-1]);
}
export function samePosition(a,b){return point(a)&&point(b)&&distance(a,b)<1e-6}
// NavGrid returns [x,z] waypoints; require caller-provided terrain and collision validation.
export function createNavGridRouteAdapter({nav,ground,validateSegment}){
 return ({regionId,from,to,metersPerTick})=>buildLogicalRoute({regionId,from,to,metersPerTick,validateSegment,findPath(a,b){
  const path=nav.path(a.x,a.z,b.x,b.z);
  if(!Array.isArray(path))return null;
  let y=a.y;
  return path.map(([x,z],i)=>{y=i===path.length-1?b.y:ground(x,z,y);return {x,y,z}});
 }});
}
