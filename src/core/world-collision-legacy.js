import {createWorldCollision,legacyCollisionPolicy} from './world-collision.js';

// Legacy static primitives: reuse the existing grid and narrow phase.
export function createLegacyStaticCollision({query,inside,local,playerContact,skin=.002}){
 if(![query,inside,local,playerContact].every(f=>typeof f==="function")||!Number.isFinite(skin)||skin<0)throw new TypeError("invalid legacy callbacks");
 const links=new WeakMap(),byId=new Map();
 const positive=n=>Number.isFinite(n)&&n>0;
 const vec=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const order=(a,b)=>a<b?-1:a>b?1:0;
 function getProfile(args,allowZeroRadius=false){
  if(!args||!vec(args.root)||!args.profile||!(positive(args.profile.radius)||(allowZeroRadius&&args.profile.radius===0))||!positive(args.profile.height))throw new TypeError("invalid body query");
  return args.profile;
 }
 function candidates(x,z,r,resolve){
  // query returns a shared scratch array in world-render.part.js. Copy it
  // before invoking another callback that might query the same grid.
  const records=[...query(x,z,r)],out=[];
  for(const record of records){
   const link=links.get(record);
   if(!link)continue; // not adopted yet; caller must not switch authority
   const data=resolve(link.id,link.shapeId);
   if(data)out.push({record,data});
  }
  return out;
 }
 function pointOnTop(o,x,z){
  if(o.type==="cyl"){
   const dx=x-o.x,dz=z-o.z,d=Math.hypot(dx,dz),f=d>o.r?o.r/d:1;
   return [o.x+dx*f,o.top,o.z+dz*f];
  }
  const [lx,lz]=local(o,x,z),a=clamp(lx,-o.hx,o.hx),b=clamp(lz,-o.hz,o.hz);
  return [o.cx+a*o.cos+b*o.sin,o.top,o.cz-a*o.sin+b*o.cos];
 }
 function sidePoint(o,x,z,nx,nz,y){
  if(o.type==="cyl")return [o.x+nx*o.r,y,o.z+nz*o.r];
  const [lx,lz]=local(o,x,z);
  let a=clamp(lx,-o.hx,o.hx),b=clamp(lz,-o.hz,o.hz);
  if(Math.abs(lx)<=o.hx&&Math.abs(lz)<=o.hz){
   const ax=nx*o.cos-nz*o.sin,az=nx*o.sin+nz*o.cos;
   if(Math.abs(ax)>Math.abs(az))a=Math.sign(ax)*o.hx;
   else b=Math.sign(az)*o.hz;
  }
  return [o.cx+a*o.cos+b*o.sin,y,o.cz-a*o.sin+b*o.cos];
 }
 function contact(data,feature,point,n,c,separation){
  return {instanceId:data.instanceId,shapeId:data.shapeId,
   // JSON tuple avoids collisions when author-supplied IDs contain colons.
   surfaceId:JSON.stringify([data.instanceId,data.shapeId,feature]),featureId:feature,
   point,geometricNormal:n,contactNormal:c,separation,toi:null,
   policyId:data.shape.policy.id,revision:data.revision};
 }
 const backend={
  sampleSupport(args,filter,resolve){
   const profile=getProfile(args,true),[x,y,z]=args.root;
   const rise=args.maxRise??0,drop=args.maxDrop??Infinity;
   if(!Number.isFinite(rise)||rise<0||!(drop>=0))throw new TypeError("invalid support range");
   let best=null;
   for(const {record:o,data} of candidates(x,z,profile.radius,resolve)){
    if(o.top>y+rise+skin||o.top<y-drop-skin)continue;
    if(!(profile.radius===0?inside(o,x,z,0):playerContact(o,x,z,profile.radius)))continue;
    const hit=contact(data,"top",pointOnTop(o,x,z),[0,1,0],[0,1,0],y-o.top);
    if(!best||hit.point[1]>best.point[1]||hit.point[1]===best.point[1]&&order(hit.surfaceId,best.surfaceId)<0)best=hit;
   }
   return best;
  },
  overlapBody(args,filter,resolve){
   const profile=getProfile(args),[x,y,z]=args.root,head=y+profile.height,out=[];
   for(const {record:o,data} of candidates(x,z,profile.radius,resolve)){
    if(o.top<=y+skin||o.bot>=head-skin)continue;
    const c=playerContact(o,x,z,profile.radius);if(!c)continue;
    const n=[c.nx,0,c.nz],py=(Math.max(y,o.bot)+Math.min(head,o.top))/2;
    // At an OBB corner, the separation normal is diagonal; the geometric
    // feature is a corner, with no unique face normal. Do not invent one.
    let feature="side",geometricNormal=n;
    if(o.type==="box"){
     const nx=c.nx*o.cos-c.nz*o.sin,nz=c.nx*o.sin+c.nz*o.cos;
     if(Math.abs(nx)>1e-7&&Math.abs(nz)>1e-7){feature="corner:"+Math.sign(nx)+":"+Math.sign(nz);geometricNormal=null;}
     else feature=Math.abs(nx)>Math.abs(nz)?"side-x:"+Math.sign(nx):"side-z:"+Math.sign(nz);
    }
    out.push(contact(data,feature,sidePoint(o,x,z,c.nx,c.nz,py),geometricNormal,n,-c.depth));
   }
   return out.sort((a,b)=>order(a.surfaceId,b.surfaceId));
  }
 };
 const world=createWorldCollision({backend});
 function registerStatic(record,{instanceId,regionId,shapeId="main"}){
  if(!record||links.has(record))throw new TypeError("invalid or already registered legacy record");
  const box=record.type==="box";
  if(!box&&record.type!=="cyl")throw new TypeError("legacy primitive only");
  const policy=legacyCollisionPolicy({shape:box?"box":"cylinder",walk:record.walk!==false,climbable:record.climbable,mantleOnly:record.mantleOnly??false});
  const center=box?[record.cx,record.cy,record.cz]:[record.x,(record.y0+record.y1)/2,record.z];
  const shape={id:shapeId,type:box?"box":"cylinder",center:[0,0,0],policy,...(box?{half:[record.hx,record.hy,record.hz]}:{radius:record.r,height:record.y1-record.y0})};
  // Use records returned by addBox/addCyl, not incomplete authoring inputs.
  if(!Number.isFinite(record.top)||!Number.isFinite(record.bot)||!(record.top>record.bot)||Math.abs(record.top-(center[1]+(box?record.hy:shape.height/2)))>1e-7||Math.abs(record.bot-(center[1]-(box?record.hy:shape.height/2)))>1e-7)throw new TypeError("legacy record not initialized");
  const yaw=box?(record.yaw??0):0;
  if(box&&(!Number.isFinite(record.cos)||!Number.isFinite(record.sin)||Math.abs(record.cos-Math.cos(yaw))>1e-7||Math.abs(record.sin-Math.sin(yaw))>1e-7))throw new TypeError("legacy rotation not initialized");
  const h=world.register({id:instanceId,regionId,physics:"solid",transform:{position:center,yaw,scale:[1,1,1]},shapes:[shape]});
  const link={id:instanceId,shapeId,record,handle:h};links.set(record,link);byId.set(instanceId,link);
  return h;
 }
 function remove(h){
  world.remove(h);const link=byId.get(h.id);links.delete(link.record);byId.delete(h.id);
  return true;
 }
 // Intentionally no updateTransform: original legacy grid is static. A move
 // must be reinserted into that grid, then registered again under a fresh
 // revision. Old consumers are unchanged until authority is switched.
 return {registerStatic,remove,get:world.get,setActive:world.setActive,suspendRegion:world.suspendRegion,resumeRegion:world.resumeRegion,
  sampleSupport:world.sampleSupport,overlapBody:world.overlapBody,queryAabb:world.queryAabb,resolveShape:world.resolveShape,capabilities:world.capabilities};
}

export function sampleHeightfieldTriangle({heights,gridN,cell,half,x,z}){
 if(!Number.isInteger(gridN)||gridN<2||!Number.isFinite(cell)||cell<=0||![half,x,z].every(Number.isFinite)||heights?.length!==gridN*gridN)throw new TypeError("invalid heightfield");
 const gx=(x+half)/cell,gz=(z+half)/cell;
 // Match the rendered grid's existing interpolation; outside-world fallback
 // has no known triangle, so return no sample rather than guessing a normal.
 if(gx<0||gz<0||gx>=gridN-1||gz>=gridN-1)return null;
 const i=Math.floor(gx),j=Math.floor(gz),u=gx-i,v=gz-j,k=j*gridN+i;
 const a=heights[k],b=heights[k+1],c=heights[k+gridN],d=heights[k+gridN+1];
 if(![a,b,c,d].every(Number.isFinite))throw new TypeError("nonfinite heightfield cell");
 const lower=u+v<=1;
 const h=lower?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
 const dx=(lower?b-a:d-c)/cell,dz=(lower?c-a:d-b)/cell,len=Math.hypot(dx,1,dz);
 return {featureId:`${i}:${j}:${lower?0:1}`,point:[x,h,z],geometricNormal:[-dx/len,1/len,-dz/len]};
}
