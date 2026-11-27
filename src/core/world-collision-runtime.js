import {classifySupport} from './world-collision.js';
import {createLegacyStaticCollision,sampleLegacyRoof,sampleHeightfieldTriangle,sampleLegacyStair,sampleLegacyWater} from './world-collision-legacy.js';

// Bridge for the existing world builder: authoritative geometry stays in the
// current spatial grid until a fixture proves parity. No second movement solver.
export function createRuntimeCollisionBridge({query,inside,local,playerContact,roofInFoot,roofInOuter,roofSurfaceLocal,stairUV,stairMinV,stairMaxV}){
 const registry=createLegacyStaticCollision({query,inside,local,playerContact});
 const roofHelpers={local,roofInFoot,roofInOuter,roofSurfaceLocal};
 let regionId="legacy-world",serial=0;
 const handles=new Map(),records=new Map(),types={box:0,cyl:0,roof:0,stair:0,terrain:0,water:0,labSurface:0};
 const identity={position:[0,0,0],yaw:0,scale:[1,1,1]};
 const roofPolicy=(overhang)=>({id:overhang?"legacy-roof-overhang":"legacy-roof-foot",block:false,support:true,mantle:false,oneWay:overhang,nav:false,camera:false,water:false,climb:"none"});
 const waterPolicy={id:"legacy-water",block:false,support:false,mantle:false,oneWay:false,nav:false,camera:false,water:true,climb:"none"};
 const next=(kind)=>regionId+":"+kind+":"+(++serial);
 function setRegion(id){if(typeof id!=="string"||!id||id.length>100)throw new TypeError("invalid runtime collision region");regionId=id;}
 function primitive(record){
  const kind=record?.type;
  if(kind!=="box"&&kind!=="cyl")throw new TypeError("expected initialized primitive");
  const id=record.collisionId??next(kind);
  if(record.collisionId&&handles.has(id))throw new TypeError("duplicate authored collision ID");
  const h=registry.registerStatic(record,{instanceId:id,regionId});
  record.collisionId=id;handles.set(id,h);records.set(id,record);types[kind]++;
  return h;
 }
 function analytical(id,type,bounds,policy,sample,{priority=0,physics="solid",sourceKind=type}={}){
  if(handles.has(id))throw new TypeError("duplicate analytical collision ID");
  const shape={id:"surface",type,center:[0,0,0],geometryRef:id,bounds,policy};
  if(type==="water"){delete shape.geometryRef;delete shape.bounds;shape.half=bounds.half;shape.center=bounds.center;}
  const h=registry.registerAnalytical({id,regionId,physics,transform:identity,shapes:[shape]},{sample,priority,sourceKind});
  handles.set(id,h);if(type==="water")types.water++;return h;
 }
 function roof(record){
  const r=record,reach=r.outerR??Math.hypot(r.ox??0,r.oz??0);
  if(!Number.isFinite(reach)||reach<=0)throw new TypeError("invalid roof footprint");
  const lo=Math.min(r.base,r.base+r.rise)-(r.thick??.3)-.5,hi=Math.max(r.base,r.base+r.rise)+.5;
  const bounds={min:[r.cx-reach,lo,r.cz-reach],max:[r.cx+reach,hi,r.cz+reach]};
  const base=record.collisionId??next("roof");
  if(typeof base!=="string"||!base||base.length>246||base.includes("\0")||["foot","overhang"].some(part=>handles.has(base+":"+part)))throw new TypeError("invalid or duplicate roof collision ID");
  // The footprint and eave are distinct policies even when authored together.
  const output=[];
  for(const part of ["foot","overhang"]){
   const overhang=part==="overhang",id=base+":"+part;
   output.push(analytical(id,"roof",bounds,roofPolicy(overhang),(x,z)=>{
    const hit=sampleLegacyRoof(r,x,z,roofHelpers);
    return hit&&hit.overhang===overhang?hit:null;
   },{sourceKind:overhang?"roof-overhang":"roof-foot"}));
  }
  r.collisionId=base;types.roof++;return output;
 }
 function terrain({heights,gridN,cell,half,collisionId}){
  const id=collisionId??next("terrain"),bounds={min:[-half,-10000,-half],max:[half,10000,half]};
  const h=analytical(id,"heightfield",bounds,roofPolicy(false),(x,z)=>sampleHeightfieldTriangle({heights,gridN,cell,half,x,z}),{sourceKind:"terrain"});
  types.terrain++;return h;
 }
 function labSurface({collisionId,bounds,sample}){
  if(regionId!=='motion-lab')throw new TypeError('lab-only analytical registration');
  const h=analytical(collisionId,'heightfield',bounds,roofPolicy(false),sample,{sourceKind:'lab-ground'});
  types.labSurface++;return h;
 }
 function stair(record){
  const a=record.a,b=record.b,n=record.n;
  const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),ux=dx/len,uz=dz/len;
  // Invert the legacy stairUV projection to obtain the four actual corners.
  const det=ux*n[1]-uz*n[0];
  if(!Number.isFinite(det)||Math.abs(det)<1e-8)throw new TypeError("invalid stair axes");
  const corners=[0,len].flatMap(u=>[stairMinV,stairMaxV].map(v=>[
   a[0]+(u*n[1]-uz*v)/det,a[1]+(ux*v-u*n[0])/det]));
  const minX=Math.min(...corners.map(p=>p[0]))-1e-7,maxX=Math.max(...corners.map(p=>p[0]))+1e-7;
  const minZ=Math.min(...corners.map(p=>p[1]))-1e-7,maxZ=Math.max(...corners.map(p=>p[1]))+1e-7;
  const id=record.collisionId??next("stair"),bounds={min:[minX,Math.min(record.y0,record.y1)-1,minZ],max:[maxX,Math.max(record.y0,record.y1)+1,maxZ]};
  const h=analytical(id,"heightfield",bounds,roofPolicy(false),(x,z)=>sampleLegacyStair(record,x,z,{stairUV,minV:stairMinV,maxV:stairMaxV}),{sourceKind:"stair"});
  types.stair++;return h;
 }
 function water({contains,surfaceAt,bottomAt,bounds,priority=0,collisionId}){
  const id=collisionId??next("water");
  return analytical(id,"water",bounds,waterPolicy,root=>sampleLegacyWater({contains,surfaceAt,bottomAt},root),{priority,physics:"volume"});
 }
 function support(root,profile,{maxRise=0,maxDrop=Infinity,purpose="support",region=regionId}={}){
  return registry.sampleSupport({root,profile,maxRise,maxDrop},{regionId:region,purpose});
 }
 // Filter by surface class before choosing a hit. Preserve the existing
 // stair declaration order and distinguish solid footprint from one-way eaves.
 function surfaceAt(x,z,kind,maxY=Infinity){
  if(!["terrain","stair","roof-foot","roof-overhang","lab-ground"].includes(kind))throw new TypeError("invalid surface kind");
  const y=Number.isFinite(maxY)?maxY:0;
  return registry.sampleSupport({root:[x,y,z],profile:{radius:0,height:1.72},maxRise:Number.isFinite(maxY)?0:Number.MAX_VALUE,maxDrop:Infinity,analyticalOnly:true,sourceKind:kind,firstAnalytical:kind==="stair"&&!Number.isFinite(maxY)},{regionId,purpose:"support"});
 }
 function hasSurfaceKind(kind){return kind==="terrain"?types.terrain>0:kind==="stair"?types.stair>0:types.roof>0;}
 // Grounded actor consumers distinguish an exact geometric slope from an
 // unresolved seam/fallback. Null means known walkable, undefined means
 // preserve the legacy finite-difference classification.
 function groundSlope(x,z,floor,walkMax){
  if(!Number.isFinite(floor))return undefined;
  const kind=regionId==="motion-lab"?"lab-ground":"terrain";
  const hit=surfaceAt(x,z,kind);
  if(!hit||Math.abs(hit.point[1]-floor)>.002||!hit.geometricNormal)return undefined;
  // A registered level primitive at the actual foot point is a distinct
  // support, even when its top happens to coincide with the terrain.
  const solid=staticSupport(x,z,floor,0);
  if(solid&&Math.abs(solid.point[1]-floor)<=.002)return null;
  const n=hit.geometricNormal;
  const state=classifySupport({geometricNormal:n,support:true,footContact:true,walkMax});
  if(state.kind!=="slide")return state.kind==="walk"?null:undefined;
  const k=Math.hypot(n[0],n[2])/n[1],h=Math.hypot(n[0],n[2]);
  return {ux:-n[0]/h,uz:-n[2]/h,k};
 }
 // All legacy broadphase consumers share the same registered active region
 // and block policy; keep their distinct vertical/step tolerances intact.
 function activePrimitives(x,z,range){
  return [...query(x,z,range)].filter(record=>registry.activeStatic(record,{regionId,purpose:"block"}));
 }
 function sampleWater(root,profile,{region=regionId}={}){
  return registry.sampleWater({root,profile},{regionId:region,purpose:"water"});
 }
 function overlap(root,profile,{region=regionId}={}){
  return registry.overlapBody({root,profile},{regionId:region,purpose:"block"});
 }
 // Player support migration: only the solid primitive part is switched.
 // Terrain, roof and stair policy still use their existing exact legacy path.
 function staticSupport(x,z,maxY,radius,solids=null,height=1.72){
  const candidates=solids??[...query(x,z,radius)];
  return registry.sampleSupport({root:[x,maxY,z],profile:{radius,height},maxRise:0,maxDrop:Infinity,candidates,staticOnly:true},{regionId,purpose:"support"});
 }
 function staticCeiling(x,z,y,targetY,solids=null,radius=.35,height=1.72){
  const candidates=solids??[...query(x,z,radius)];
  return registry.sampleCeiling({root:[x,y,z],targetY,profile:{radius,height},candidates},{regionId,purpose:"headroom"});
 }
 // Authoritative compatibility consumer for the existing capsule solver.
 // It uses normalized SurfaceContact but returns the legacy objects unchanged.
 // The existing cached candidate order must be retained for corner response.
 function contacts(x,z,y,nearby=[],radius=.35,solids=null,height=1.72){
  const candidates=solids??[...query(x,z,radius)];
  const hits=registry.overlapBody({root:[x,y,z],profile:{radius,height},candidates},{regionId,purpose:"block"});
  const found=new Map(),out=[];
  for(const h of hits){
   const collider=records.get(h.instanceId);
   if(collider)found.set(collider,{nx:h.contactNormal[0],nz:h.contactNormal[2],depth:-h.separation,collider});
  }
  for(const collider of candidates){const c=found.get(collider);if(c)out.push(c);}
  for(const collider of nearby){
   if(collider.top<=y+.002||collider.bot>=y+height-.002)continue;
   const c=playerContact(collider,x,z,radius);if(c)out.push(c);
  }
  return out;
 }
 // Horizontal sweep at candidate feet height. Static geometry uses the
 // registry; active resident snapshots use the same primitive narrow phase.
 // Return only the earliest simultaneous contacts across both populations.
 function staticSweep(x,z,y,dx,dz,solids=null,radius=.35,height=1.72,nearby=[]){
  const hits=registry.sweepBody({root:[x,y,z],delta:[dx,0,dz],profile:{radius,height},candidates:solids},{regionId,purpose:"block"})
   .map(h=>({nx:h.contactNormal[0],nz:h.contactNormal[2],depth:-h.separation,collider:records.get(h.instanceId),toi:h.toi}));
  for(const o of nearby){
   const c=registry.sweepPrimitive(o,x,z,y,dx,dz,radius,height);
   if(c)hits.push(c);
  }
  if(!hits.length)return [];
  hits.sort((a,b)=>a.toi-b.toi);
  return hits.filter(h=>h.toi<=hits[0].toi+1e-6);
 }
 function remove(id){
  const h=handles.get(id);if(!h)return false;
  registry.remove(h);handles.delete(id);records.delete(id);return true;
 }
 function debugSnapshot(){return {regionId,counts:{...types},registered:handles.size,analyticalIndex:registry.analyticalIndexStats(),capabilities:registry.capabilities()};}
 return {setRegion,primitive,roof,terrain,labSurface,stair,water,support,surfaceAt,hasSurfaceKind,groundSlope,activePrimitives,sampleWater,staticSupport,staticCeiling,staticSweep,overlap,contacts,remove,get:registry.get,suspendRegion:registry.suspendRegion,resumeRegion:registry.resumeRegion,record:id=>records.get(id)??null,debugSnapshot};
}
