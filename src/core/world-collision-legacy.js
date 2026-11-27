import {createWorldCollision,legacyCollisionPolicy} from './world-collision.js';

// Legacy static primitives: reuse the existing grid and narrow phase.
export function createLegacyStaticCollision({query,inside,local,playerContact,skin=.002}){
 if(![query,inside,local,playerContact].every(f=>typeof f==="function")||!Number.isFinite(skin)||skin<0)throw new TypeError("invalid legacy callbacks");
 const links=new WeakMap(),byId=new Map(),analytical=new Map();
 // Sparse immutable XZ index; very large sources avoid world-sized allocation.
 const analyticalCells=new Map(),largeAnalytical=new Set(),CELL=32,MAX_CELLS=256;
 const cellKey=(x,z)=>x+":"+z;
 function indexAnalytical(a){
  const b=a.bounds,x0=Math.floor(b.min[0]/CELL),x1=Math.floor(b.max[0]/CELL),
   z0=Math.floor(b.min[2]/CELL),z1=Math.floor(b.max[2]/CELL);
  if(![x0,x1,z0,z1].every(Number.isSafeInteger)||(x1-x0+1)*(z1-z0+1)>MAX_CELLS){
   largeAnalytical.add(a);return;
  }
  for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
   const key=cellKey(x,z);let set=analyticalCells.get(key);
   if(!set)analyticalCells.set(key,set=new Set());
   set.add(a);a.cells.push(key);
  }
 }
 function unindexAnalytical(a){
  largeAnalytical.delete(a);
  for(const key of a.cells){const set=analyticalCells.get(key);set.delete(a);if(!set.size)analyticalCells.delete(key);}
 }
 function* analyticalAt(x,z,kind){
  const local=analyticalCells.get(cellKey(Math.floor(x/CELL),Math.floor(z/CELL)));
  for(const set of [local,largeAnalytical])if(set)for(const a of set){
   const b=a.bounds;
   if(a.kind===kind&&x>=b.min[0]&&x<=b.max[0]&&z>=b.min[2]&&z<=b.max[2])yield a;
  }
 }
 const positive=n=>Number.isFinite(n)&&n>0;
 const vec=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const order=(a,b)=>a<b?-1:a>b?1:0;
 function getProfile(args,allowZeroRadius=false){
  if(!args||!vec(args.root)||!args.profile||!(positive(args.profile.radius)||(allowZeroRadius&&args.profile.radius===0))||!positive(args.profile.height))throw new TypeError("invalid body query");
  return args.profile;
 }
 function candidates(x,z,r,resolve,provided=null){
  // The player already builds an authoritative collider candidate buffer once
  // per physics substep. Keep its order and avoid repeating a grid lookup.
  if(provided!==null&&!Array.isArray(provided))throw new TypeError('invalid collision candidate buffer');
  const records=provided??[...query(x,z,r)],out=[];
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
 // Minimize squared distance from a center segment to a convex primitive.
 // In OBB-local coordinates the distance is quadratic between face crossings.
 function closestSweepTime(o,x,z,dx,dz){
  if(o.type==="cyl")return clamp(((o.x-x)*dx+(o.z-z)*dz)/(dx*dx+dz*dz),0,1);
  const [a,b]=local(o,x,z),u=dx*o.cos-dz*o.sin,v=dx*o.sin+dz*o.cos,ts=[0,1];
  const axes=[[a,u,o.hx],[b,v,o.hz]];
  for(const [p,d,h] of axes)if(d!==0)for(const edge of [-h,h]){
   const t=(edge-p)/d;if(t>0&&t<1)ts.push(t);
  }
  ts.sort((a,b)=>a-b);
  let best=Infinity,bestT=0;
  const consider=t=>{
   const q=a+u*t,r=b+v*t,ex=q-clamp(q,-o.hx,o.hx),ez=r-clamp(r,-o.hz,o.hz),s=ex*ex+ez*ez;
   if(s<best){best=s;bestT=t;}
  };
  for(let i=1;i<ts.length;i++){
   const lo=ts[i-1],hi=ts[i],mid=(lo+hi)/2;
   let num=0,den=0;
   for(const [p,d,h] of axes){
    const q=p+d*mid;
    if(q<-h||q>h){num+=d*(p-Math.sign(q)*h);den+=d*d;}
   }
   consider(lo);consider(hi);
   if(den>0)consider(clamp(-num/den,lo,hi));
  }
  return bestT;
 }
 const backend={
  sampleSupport(args,filter,resolve){
   const profile=getProfile(args,true),[x,y,z]=args.root;
   const rise=args.maxRise??0,drop=args.maxDrop??Infinity;
   if(!Number.isFinite(rise)||rise<0||!(drop>=0)||args.staticOnly!==undefined&&typeof args.staticOnly!=="boolean")throw new TypeError("invalid support range");
   let best=null,bestOrder=Infinity;
   if(!args.analyticalOnly)for(const {record:o,data} of candidates(x,z,profile.radius,resolve,args.candidates??null)){
    if(o.top>y+rise+skin||o.top<y-drop-skin)continue;
    if(!(profile.radius===0?inside(o,x,z,0):playerContact(o,x,z,profile.radius)))continue;
    const hit=contact(data,"top",pointOnTop(o,x,z),[0,1,0],[0,1,0],y-o.top);
    if(!best||hit.point[1]>best.point[1]||hit.point[1]===best.point[1]&&order(hit.surfaceId,best.surfaceId)<0)best=hit;
   }
   if(!args.staticOnly)for(const a of analyticalAt(x,z,"surface")){
    if(args.sourceKind!==undefined&&a.sourceKind!==args.sourceKind)continue;
    const data=resolve(a.id,a.shapeId);if(!data)continue;
    const s=a.sample(x,z);if(!s)continue;
    if(!vec(s.point)||typeof s.featureId!=="string"||(s.geometricNormal!==null&&(!vec(s.geometricNormal)||Math.abs(Math.hypot(...s.geometricNormal)-1)>1e-6)))throw new TypeError("invalid analytical surface result");
    if(s.point[1]>y+rise+skin||s.point[1]<y-drop-skin)continue;
    const hit=contact(data,s.featureId,s.point,s.geometricNormal,null,y-s.point[1]);
    const earlier=args.firstAnalytical&&a.sequence<bestOrder;
    if(!best||earlier||!args.firstAnalytical&&(hit.point[1]>best.point[1]||hit.point[1]===best.point[1]&&order(hit.surfaceId,best.surfaceId)<0)){
     best=hit;bestOrder=a.sequence;
    }
   }
   return best;
  },
  sampleCeiling(args,filter,resolve){
   const profile=getProfile(args),[x,y,z]=args.root,stop=args.targetY;
   if(!Number.isFinite(stop)||stop<y)throw new TypeError("invalid ceiling movement");
   let best=null,limit=stop;
   for(const {record:o,data} of candidates(x,z,profile.radius,resolve,args.candidates??null)){
    if(o.bot<y+profile.height-skin||o.bot>limit+profile.height||!playerContact(o,x,z,profile.radius))continue;
    const point=pointOnTop(o,x,z);point[1]=o.bot;
    const hit=contact(data,"underside",point,[0,-1,0],[0,-1,0],o.bot-(y+profile.height));
    best=hit;limit=o.bot-profile.height-skin;
   }
   return best;
  },
  sampleWater(args,filter,resolve){
   getProfile(args,true);
   const [x,,z]=args.root;let best=null;
   for(const a of analyticalAt(x,z,"water")){
    const data=resolve(a.id,a.shapeId);if(!data)continue;
    const s=a.sample(args.root);if(!s)continue;
    if(![s.surfaceY,s.bottomY,s.depth,s.feetImmersion].every(Number.isFinite)||s.depth<=0||s.bottomY>=s.surfaceY||Math.abs(s.surfaceY-s.bottomY-s.depth)>1e-7)throw new TypeError("invalid water result");
    const hit={...s,instanceId:a.id,shapeId:a.shapeId,revision:data.revision,priority:a.priority};
    if(!best||hit.priority>best.priority||hit.priority===best.priority&&order(hit.instanceId,best.instanceId)<0)best=hit;
   }
   return best;
  },
  sweepBody(args,filter,resolve){
   const profile=getProfile(args),[x,y,z]=args.root,delta=args.delta;
   if(!vec(delta)||delta[1]!==0)throw new TypeError("static horizontal sweep only");
   const [dx,,dz]=delta,distance=Math.hypot(dx,dz);
   if(distance<1e-9)return [];
   const out=[];
   for(const {record:o,data} of candidates(x,z,profile.radius+distance,resolve,args.candidates??null)){
    if(o.top<=y+skin||o.bot>=y+profile.height-skin)continue;
    // Leave existing overlaps to the endpoint escape solver.
    if(playerContact(o,x,z,profile.radius))continue;
    const t=closestSweepTime(o,x,z,dx,dz);
    let c=playerContact(o,x+dx*t,z+dz*t,profile.radius);
    if(!c)continue;
    let lo=0,hi=t;
    for(let i=0;i<20;i++){
     const mid=(lo+hi)/2,p=playerContact(o,x+dx*mid,z+dz*mid,profile.radius);
     if(p){hi=mid;c=p;}else lo=mid;
    }
    const px=x+dx*hi,pz=z+dz*hi,n=[c.nx,0,c.nz];
    let feature="side",geometricNormal=n;
    if(o.type==="box"){
     const nx=c.nx*o.cos-c.nz*o.sin,nz=c.nx*o.sin+c.nz*o.cos;
     if(Math.abs(nx)>1e-7&&Math.abs(nz)>1e-7){feature="corner:"+Math.sign(nx)+":"+Math.sign(nz);geometricNormal=null;}
     else feature=Math.abs(nx)>Math.abs(nz)?"side-x:"+Math.sign(nx):"side-z:"+Math.sign(nz);
    }
    const hit=contact(data,feature,sidePoint(o,px,pz,c.nx,c.nz,(Math.max(y,o.bot)+Math.min(y+profile.height,o.top))/2),geometricNormal,n,-c.depth);
    hit.toi=hi;out.push(hit);
   }
   return out.sort((a,b)=>a.toi-b.toi||order(a.surfaceId,b.surfaceId));
  },
  overlapBody(args,filter,resolve){
   const profile=getProfile(args),[x,y,z]=args.root,head=y+profile.height,out=[];
   for(const {record:o,data} of candidates(x,z,profile.radius,resolve,args.candidates??null)){
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
 let analyticalSequence=0;
 function registerAnalytical(instance,{sample,priority=0,sourceKind="generic"}={}){
  if(typeof sample!=="function"||!Number.isFinite(priority)||instance?.shapes?.length!==1)throw new TypeError("invalid analytical source");
  const shape=instance.shapes[0],kind=instance.physics==="volume"?"water":"surface";
  if(kind==="surface"&&(!["heightfield","roof"].includes(shape.type)||instance.physics!=="solid"))throw new TypeError("invalid analytical shape");
  if(kind==="water"&&shape.type!=="water")throw new TypeError("invalid water shape");
  // World-coordinate sampler must agree with the immutable authoring transform.
  // No analytical transform updates until the sampler/grid is rebuilt.
  const h=world.register(instance),bounds=world.get(h.id).shapes[0].worldBounds;
  if(!bounds.min.every(Number.isFinite)||!bounds.max.every(Number.isFinite)){
   world.remove(h);throw new TypeError("nonfinite analytical world bounds");
  }
  const a={id:h.id,shapeId:shape.id,kind,sample,priority,bounds,cells:[],sourceKind,sequence:++analyticalSequence};
  indexAnalytical(a);analytical.set(h.id,a);return h;
 }
 function remove(h){
  world.remove(h);const link=byId.get(h.id);
  if(link){links.delete(link.record);byId.delete(h.id);}
  const a=analytical.get(h.id);if(a){unindexAnalytical(a);analytical.delete(h.id);}
  return true;
 }
 // Intentionally no updateTransform: original legacy grid is static. A move
 // must be reinserted into that grid, then registered again under a fresh
 // revision. Old consumers are unchanged until authority is switched.
 return {registerStatic,registerAnalytical,remove,get:world.get,setActive:world.setActive,suspendRegion:world.suspendRegion,resumeRegion:world.resumeRegion,
  activeStatic:(record,filter)=>{const link=links.get(record);return Boolean(link&&world.isEligible(link.id,link.shapeId,filter));},
  sampleSupport:world.sampleSupport,sampleCeiling:world.sampleCeiling,sampleWater:world.sampleWater,overlapBody:world.overlapBody,sweepBody:world.sweepBody,queryAabb:world.queryAabb,resolveShape:world.resolveShape,capabilities:world.capabilities,
  analyticalIndexStats:()=>({cells:analyticalCells.size,largeSources:largeAnalytical.size,sources:analytical.size})};
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


export function sampleLegacyRoof(record,x,z,{local,roofInFoot,roofInOuter,roofSurfaceLocal}){
 const r=record,[lx,lz]=local(r,x,z),foot=roofInFoot(r,lx,lz);
 if(!foot&&!roofInOuter(r,lx,lz))return null;
 const y=roofSurfaceLocal(r,lx,lz);
 let dx=0,dz=0,feature,ambiguous=false;
 if(r.shape==="shed"){
  dz=r.rise/(r.z1-r.z0);feature="shed";
 }else if(r.shape==="cone"){
  if(r.seg){
   let best=-Infinity,face=-1,ties=0,ax=0,az=0;
   for(let i=0;i<r.seg;i++){
    const a=(i+.5)/r.seg*Math.PI*2+(r.rot||0),c=Math.cos(a),s=Math.sin(a),d=lx*c+lz*s;
    if(d>best+1e-9){best=d;face=i;ties=1;ax=c;az=s;}else if(Math.abs(d-best)<=1e-9)ties++;
   }
   ambiguous=ties>1&&r.rise!==0;
   const k=-r.rise/(r.half*Math.cos(Math.PI/r.seg));dx=k*ax;dz=k*az;feature=ambiguous?"cone-edge":"cone:"+face;
  }else{
   const d=Math.hypot(lx,lz);ambiguous=d<1e-9&&r.rise!==0;
   if(d>1e-9){dx=-r.rise*lx/(r.half*d);dz=-r.rise*lz/(r.half*d);}
   feature=ambiguous?"cone-apex":"cone";
  }
 }else if(r.shape==="gable"){
  const v=r.acrossX?lx:lz,d=-r.rise/r.half*Math.sign(v);
  if(r.acrossX)dx=d;else dz=d;
  ambiguous=Math.abs(v)<1e-9&&r.rise!==0;feature=ambiguous?"ridge":"gable:"+Math.sign(v);
 }else throw new TypeError("unsupported roof shape");
 const wx=dx*r.cos+dz*r.sin,wz=-dx*r.sin+dz*r.cos,len=Math.hypot(wx,1,wz);
 if(!Number.isFinite(y)||!Number.isFinite(len))throw new TypeError("invalid roof geometry");
 return {featureId:(foot?"foot:":"overhang:")+feature,point:[x,y,z],geometricNormal:ambiguous?null:[-wx/len,1/len,-wz/len],overhang:!foot};
}

export function sampleLegacyStair(record,x,z,{stairUV,minV,maxV}){
 const [u,v,L]=stairUV(record,x,z);
 if(!Number.isFinite(L)||L<=0||!Number.isFinite(record.y0)||!Number.isFinite(record.y1)||!Number.isFinite(minV)||!Number.isFinite(maxV)||minV>=maxV)throw new TypeError("invalid stair geometry");
 if(u<0||u>L||v<minV||v>maxV)return null;
 const rise=record.y1-record.y0,steps=Math.max(1,Math.ceil(Math.abs(rise)/.3)),k=Math.min(steps-1,Math.floor(u/L*steps));
 // Match exact stairSurface: one-step stairs retain the first-step rule.
 const y=k===0?record.y0+.06:k===steps-1?record.y1+.06:record.y0+rise*(k+.5)/steps+.06;
 return {featureId:"tread:"+k,point:[x,y,z],geometricNormal:[0,1,0]};
}

export function sampleLegacyWater({surfaceAt,contains,bottomAt},root){
 if(!Array.isArray(root)||root.length!==3||!root.every(Number.isFinite)||![surfaceAt,contains,bottomAt].every(f=>typeof f==="function"))throw new TypeError("invalid water query");
 const [x,y,z]=root;
 if(!contains(x,z))return null;
 const surface=surfaceAt(x,z),bottom=bottomAt(x,z);
 if(!Number.isFinite(surface)||!Number.isFinite(bottom)||bottom>=surface)return null;
 return {surfaceY:surface,bottomY:bottom,depth:surface-bottom,feetImmersion:Math.max(0,Math.min(surface-bottom,surface-y)),feetWithin:y>=bottom&&y<=surface};
}
