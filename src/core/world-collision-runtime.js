import {createLegacyStaticCollision,sampleLegacyRoof,sampleHeightfieldTriangle,sampleLegacyStair,sampleLegacyWater} from './world-collision-legacy.js';

// Bridge for the existing world builder: authoritative geometry stays in the
// current spatial grid until a fixture proves parity. No second movement solver.
export function createRuntimeCollisionBridge({query,inside,local,playerContact,roofInFoot,roofInOuter,roofSurfaceLocal,stairUV,stairMinV,stairMaxV}){
 const registry=createLegacyStaticCollision({query,inside,local,playerContact});
 const roofHelpers={local,roofInFoot,roofInOuter,roofSurfaceLocal};
 let regionId="legacy-world",serial=0;
 const handles=new Map(),records=new Map(),types={box:0,cyl:0,roof:0,stair:0,terrain:0,water:0};
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
 function analytical(id,type,bounds,policy,sample,{priority=0,physics="solid"}={}){
  if(handles.has(id))throw new TypeError("duplicate analytical collision ID");
  const shape={id:"surface",type,center:[0,0,0],geometryRef:id,bounds,policy};
  if(type==="water"){delete shape.geometryRef;delete shape.bounds;shape.half=bounds.half;shape.center=bounds.center;}
  const h=registry.registerAnalytical({id,regionId,physics,transform:identity,shapes:[shape]},{sample,priority});
  handles.set(id,h);if(type==="water")types.water++;return h;
 }
 function roof(record){
  const r=record,reach=r.outerR??Math.hypot(r.ox??0,r.oz??0);
  if(!Number.isFinite(reach)||reach<=0)throw new TypeError("invalid roof footprint");
  const lo=Math.min(r.base,r.base+r.rise)-(r.thick??.3)-.5,hi=Math.max(r.base,r.base+r.rise)+.5;
  const bounds={min:[r.cx-reach,lo,r.cz-reach],max:[r.cx+reach,hi,r.cz+reach]};
  const base=record.collisionId??next("roof");
  // The footprint and eave are distinct policies even when authored together.
  const output=[];
  for(const part of ["foot","overhang"]){
   const overhang=part==="overhang",id=base+":"+part;
   output.push(analytical(id,"roof",bounds,roofPolicy(overhang),(x,z)=>{
    const hit=sampleLegacyRoof(r,x,z,roofHelpers);
    return hit&&hit.overhang===overhang?hit:null;
   }));
  }
  r.collisionId=base;types.roof++;return output;
 }
 function terrain({heights,gridN,cell,half}){
  const id=next("terrain"),bounds={min:[-half,-10000,-half],max:[half,10000,half]};
  const h=analytical(id,"heightfield",bounds,roofPolicy(false),(x,z)=>sampleHeightfieldTriangle({heights,gridN,cell,half,x,z}));
  types.terrain++;return h;
 }
 function stair(record){
  const a=record.a,b=record.b,minX=Math.min(a[0],b[0])-100,maxX=Math.max(a[0],b[0])+100;
  const minZ=Math.min(a[1],b[1])-100,maxZ=Math.max(a[1],b[1])+100;
  const id=next("stair"),bounds={min:[minX,Math.min(record.y0,record.y1)-1,minZ],max:[maxX,Math.max(record.y0,record.y1)+1,maxZ]};
  const h=analytical(id,"heightfield",bounds,roofPolicy(false),(x,z)=>sampleLegacyStair(record,x,z,{stairUV,minV:stairMinV,maxV:stairMaxV}));
  types.stair++;return h;
 }
 function water({contains,surfaceAt,bottomAt,bounds,priority=0}){
  const id=next("water");
  return analytical(id,"water",bounds,waterPolicy,root=>sampleLegacyWater({contains,surfaceAt,bottomAt},root),{priority,physics:"volume"});
 }
 function support(root,profile,{maxRise=0,maxDrop=Infinity,purpose="support",region=regionId}={}){
  return registry.sampleSupport({root,profile,maxRise,maxDrop},{regionId:region,purpose});
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
 function remove(id){
  const h=handles.get(id);if(!h)return false;
  registry.remove(h);handles.delete(id);records.delete(id);return true;
 }
 function debugSnapshot(){return {regionId,counts:{...types},registered:handles.size,capabilities:registry.capabilities()};}
 return {setRegion,primitive,roof,terrain,stair,water,support,staticSupport,staticCeiling,overlap,contacts,remove,get:registry.get,suspendRegion:registry.suspendRegion,resumeRegion:registry.resumeRegion,record:id=>records.get(id)??null,debugSnapshot};
}
