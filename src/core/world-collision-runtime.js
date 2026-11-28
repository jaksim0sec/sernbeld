import {classifySupport} from './world-collision.js';
import {createLegacyStaticCollision,sampleLegacyRoof,sampleHeightfieldTriangle,sampleLegacyStair,sampleLegacyWater} from './world-collision-legacy.js';

// Bridge for the existing world builder: authoritative geometry stays in the
// current spatial grid until a fixture proves parity. No second movement solver.
export function createRuntimeCollisionBridge({query,inside,local,playerContact,roofInFoot,roofInOuter,roofSurfaceLocal,stairUV,stairMinV,stairMaxV}){
 const registry=createLegacyStaticCollision({query,inside,local,playerContact});
 const roofHelpers={local,roofInFoot,roofInOuter,roofSurfaceLocal};
 let regionId="legacy-world",serial=0,traversalEpoch=0;
 const boundarySources=new Map(),boundaryGrids=new Map();
 const deferredGeometry=new Map(),DEFERRED_LIMIT=128;
 function materialize(source){
  let data=deferredGeometry.get(source);
  if(data)deferredGeometry.delete(source);
  else{
   const triangles=source.factory();
   if(!Array.isArray(triangles)||!triangles.length)throw new TypeError('empty deferred triangle mesh');
   const faces=triangles.map((v,i)=>triangleFace(v,'triangle:'+i)),tree=buildFaceTree(faces);
   if(tree.bounds.min.some((v,i)=>v<source.bounds.min[i]||tree.bounds.max[i]>source.bounds.max[i]))throw new TypeError('deferred mesh outside authored bounds');
   data={tree,closed:closedTopology(faces)};
  }
  deferredGeometry.set(source,data);
  if(deferredGeometry.size>DEFERRED_LIMIT)deferredGeometry.delete(deferredGeometry.keys().next().value);
  return data;
 }
 const BOUNDARY_CELL=32,BOUNDARY_MAX_CELLS=256;
 let boundaryOrder=0,lastBoundaryCandidates=0;
 function boundaryCells(bounds){
  const x0=Math.floor(bounds.min[0]/BOUNDARY_CELL),x1=Math.floor(bounds.max[0]/BOUNDARY_CELL);
  const z0=Math.floor(bounds.min[2]/BOUNDARY_CELL),z1=Math.floor(bounds.max[2]/BOUNDARY_CELL);
  if(![x0,x1,z0,z1].every(Number.isSafeInteger)||(x1-x0+1)*(z1-z0+1)>BOUNDARY_MAX_CELLS)return null;
  const keys=[];for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)keys.push(x+":"+z);
  return keys;
 }
 function indexBoundary(region,id,source){
  let grid=boundaryGrids.get(region);
  if(!grid){grid={cells:new Map(),large:new Set()};boundaryGrids.set(region,grid);}
  source.cells=boundaryCells(source.indexBounds);source.order=boundaryOrder++;
  if(!source.cells){grid.large.add(id);return;}
  for(const k of source.cells){
   let cell=grid.cells.get(k);if(!cell){cell=new Set();grid.cells.set(k,cell);}cell.add(id);
  }
 }
 function unindexBoundary(region,id,source){
  const grid=boundaryGrids.get(region);if(!grid||!source)return;
  if(!source.cells)grid.large.delete(id);
  else for(const k of source.cells){const cell=grid.cells.get(k);cell?.delete(id);if(!cell?.size)grid.cells.delete(k);}
  if(!grid.cells.size&&!grid.large.size)boundaryGrids.delete(region);
 }
 // Index actual triangle extents, not the entire owning terrain.
 // Preserve original registration order for simultaneous contact ties.
 function boundaryCandidates(region,bounds){
  const sources=boundarySources.get(region),grid=boundaryGrids.get(region);
  if(!sources||!grid){lastBoundaryCandidates=0;return [];}
  const cells=boundaryCells(bounds);
  if(!cells){lastBoundaryCandidates=sources.size;return sources;}
  const ids=new Set(grid.large);
  for(const k of cells)for(const id of grid.cells.get(k)??[])ids.add(id);
  const out=[...ids].map(id=>[id,sources.get(id)]).sort((a,b)=>a[1].order-b[1].order);
  lastBoundaryCandidates=out.length;return out;
 }
 const handles=new Map(),records=new Map(),types={box:0,cyl:0,roof:0,stair:0,terrain:0,water:0,labSurface:0};
 const identity={position:[0,0,0],yaw:0,scale:[1,1,1]};
 const roofPolicy=(overhang)=>({id:overhang?"legacy-roof-overhang":"legacy-roof-foot",block:false,support:true,mantle:false,oneWay:overhang,nav:false,camera:false,water:false,climb:"none"});
 const waterPolicy={id:"legacy-water",block:false,support:false,mantle:false,oneWay:false,nav:false,camera:false,water:true,climb:"none"};
 const next=(kind)=>regionId+":"+kind+":"+(++serial);
 function setRegion(id){if(typeof id!=="string"||!id||id.length>100)throw new TypeError("invalid runtime collision region");if(regionId!==id){regionId=id;traversalEpoch++;}}
 function primitive(record){
  const kind=record?.type;
  if(kind!=="box"&&kind!=="cyl")throw new TypeError("expected initialized primitive");
  const id=record.collisionId??next(kind);
  if(record.collisionId&&handles.has(id))throw new TypeError("duplicate authored collision ID");
  const h=registry.registerStatic(record,{instanceId:id,regionId});
  traversalEpoch++;record.collisionId=id;handles.set(id,h);records.set(id,record);types[kind]++;
  return h;
 }
 // Triangle faces are immutable, world-space collision geometry. The
 // moving body is still the existing vertical circular cylinder, not a
 // second character controller. A per-source BVH bounds narrow-phase work.
 function triangleFace(vertices,featureId,outwardOnly=false){
  if(!Array.isArray(vertices)||vertices.length!==3||!vertices.every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)))throw new TypeError("invalid triangle");
  const [a,b,c]=vertices.map(p=>[...p]),u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n);
  if(len<1e-9)throw new TypeError("degenerate triangle");
  return {vertices:[a,b,c],featureId,outwardOnly,normal:n.map(q=>q/len),bounds:{min:a.map((_,i)=>Math.min(a[i],b[i],c[i])),max:a.map((_,i)=>Math.max(a[i],b[i],c[i]))}};
 }
 function mergeBounds(items){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const {bounds:b} of items)for(let i=0;i<3;i++){min[i]=Math.min(min[i],b.min[i]);max[i]=Math.max(max[i],b.max[i]);}
  return {min,max};
 }
 function buildFaceTree(faces){
  const bounds=mergeBounds(faces);
  if(faces.length<=8)return {bounds,faces};
  const axis=[0,1,2].reduce((best,i)=>bounds.max[i]-bounds.min[i]>bounds.max[best]-bounds.min[best]?i:best,0);
  const sorted=[...faces].sort((a,b)=>(a.bounds.min[axis]+a.bounds.max[axis])-(b.bounds.min[axis]+b.bounds.max[axis]));
  const mid=sorted.length>>1;
  return {bounds,left:buildFaceTree(sorted.slice(0,mid)),right:buildFaceTree(sorted.slice(mid))};
 }
 const intersects=(a,b)=>a.min.every((v,i)=>v<=b.max[i]&&a.max[i]>=b.min[i]);
 function visitFaces(node,bounds,visit){
  if(!intersects(node.bounds,bounds))return;
  if(node.faces){for(const f of node.faces)if(intersects(f.bounds,bounds))visit(f);return;}
  visitFaces(node.left,bounds,visit);visitFaces(node.right,bounds,visit);
 }
 // Only exactly welded, consistently wound closed meshes receive volume semantics.
 function closedTopology(faces){
  const edges=new Map();
  for(const f of faces)for(let i=0;i<3;i++){
   const a=f.vertices[i].join(","),b=f.vertices[(i+1)%3].join(","),k=a<b?a+"|"+b:b+"|"+a;
   const e=edges.get(k)??[0,0];e[0]++;e[1]+=a<b?1:-1;edges.set(k,e);
  }
  return edges.size>0&&[...edges.values()].every(([n,w])=>n===2&&w===0);
 }
 function prepareBoundaryFaces(faces,bounds){
  if(!Array.isArray(faces))throw new TypeError("invalid boundary faces");
  return faces.flatMap(({a,b,bottom},i)=>{
   if(![a,b].every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite))||!Number.isFinite(bottom)||bottom<bounds.min[1]||a[1]<bottom||b[1]<bottom||Math.max(a[1],b[1])<=bottom||[a,b].some(p=>p.some((v,i)=>v<bounds.min[i]||v>bounds.max[i])))throw new TypeError("invalid boundary face");
   if(Math.hypot(b[0]-a[0],b[2]-a[2])<1e-8)throw new TypeError("degenerate boundary face");
   const lowA=[a[0],bottom,a[2]],lowB=[b[0],bottom,b[2]],out=[];
   if(b[1]>bottom)out.push(triangleFace([a,b,lowB],"boundary:"+i+":0",true));
   if(a[1]>bottom)out.push(triangleFace([a,lowB,lowA],"boundary:"+i+":1",true));
   return out;
  });
 }
 function clipY(poly,y,above){
  const out=[];
  for(let i=0;i<poly.length;i++){
   const a=poly[i],b=poly[(i+1)%poly.length],da=a[1]-y,db=b[1]-y,ina=above?da>=0:da<=0,inb=above?db>=0:db<=0;
   if(ina)out.push(a);
   if(ina!==inb){const t=da/(da-db);out.push([a[0]+(b[0]-a[0])*t,y,a[2]+(b[2]-a[2])*t]);}
  }
  return out;
 }
 // The exact projection of a triangle clipped to the body's height interval
 // is convex (possibly a line). A circle swept against that projection is
 // equivalent to the horizontal cylinder sweep against the clipped triangle.
 function hullXZ(poly){
  const points=poly.map(p=>[p[0],p[2]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]).filter((p,i,a)=>!i||Math.hypot(p[0]-a[i-1][0],p[1]-a[i-1][1])>1e-9);
  if(points.length<3)return points;
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const chain=ps=>{const out=[];for(const p of ps){while(out.length>=2&&cross(out[out.length-2],out[out.length-1],p)<=1e-12)out.pop();out.push(p);}return out;};
  return [...chain(points).slice(0,-1),...chain([...points].reverse()).slice(0,-1)];
 }
 function hullContact(poly,x,z,radius,face){
  if(!poly.length)return null;
  let best=Infinity,qx=0,qz=0,edge=null,inside=poly.length>=3;
  for(let i=0;i<(poly.length===2?1:poly.length);i++){
   const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz;
   const t=l?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/l)):0,px=a[0]+dx*t,pz=a[1]+dz*t,d=Math.hypot(x-px,z-pz);
   if(dx*(z-a[1])-dz*(x-a[0])< -1e-10)inside=false;
   if(d<best){best=d;qx=px;qz=pz;edge=[dx,dz];}
  }
  const depth=inside?radius+best:radius-best;
  if(depth<=.002)return null;
  let nx,nz;
  if(best>1e-9){const sign=inside?-1:1;nx=(x-qx)*sign/best;nz=(z-qz)*sign/best;}
  else{const [a,,b]=face.normal,l=Math.hypot(a,b),e=Math.hypot(...edge);nx=l?a/l:e?edge[1]/e:1;nz=l?b/l:e?-edge[0]/e:0;}
  return {nx,nz,depth,collider:face};
 }
 function sweepFace(face,x,z,y,dx,dz,radius,height){
  const lo=y+.002,hi=y+height-.002;
  if(face.bounds.max[1]<=lo||face.bounds.min[1]>=hi)return null;
  const [nx,,nz]=face.normal,a=face.vertices[0];
  if(face.outwardOnly&&(x-a[0])*nx+(z-a[2])*nz< -1e-9)return null;
  const poly=hullXZ(clipY(clipY(face.vertices,lo,true),hi,false));
  if(!poly.length)return null;
  const prior=hullContact(poly,x,z,radius,face);
  if(prior){
   const end=hullContact(poly,x+dx,z+dz,radius,face);
   const q=face.outwardOnly?{nx,nz}:prior;
   if(q.nx*dx+q.nz*dz< -1e-9||end&&end.depth>prior.depth+1e-5)return {...(end??prior),nx:q.nx,nz:q.nz,toi:0,collider:face};
   return null;
  }
  let best=null;
  for(let i=0;i<(poly.length===2?1:poly.length);i++){
   const a=poly[i],b=poly[(i+1)%poly.length],ex=b[0]-a[0],ez=b[1]-a[1],l=Math.hypot(ex,ez);
   // Reuse the existing exact continuous circle/segment primitive query.
   const o=l<1e-9?{type:"cyl",x:a[0],z:a[1],r:0,bot:lo-1,top:hi+1,walk:false}:{type:"box",cx:(a[0]+b[0])/2,cz:(a[1]+b[1])/2,hx:0,hz:l/2,cos:ez/l,sin:ex/l,bot:lo-1,top:hi+1,walk:false};
   const hit=registry.sweepPrimitive(o,x,z,y,dx,dz,radius,height);
   if(hit&&(!best||hit.toi<best.toi))best={...hit,collider:face};
  }
  return best;
 }
 function analytical(id,type,bounds,policy,sample,{priority=0,physics="solid",sourceKind=type,boundaryFaces=[],triangles=null,triangleFactory=null}={}){
  if(boundaryFaces.length&&type!=="heightfield")throw new TypeError("vertical boundaries require heightfield source");
  const faces=triangles??prepareBoundaryFaces(boundaryFaces,bounds);
  if(handles.has(id))throw new TypeError("duplicate analytical collision ID");
  const shape={id:"surface",type,center:[0,0,0],geometryRef:id,bounds,policy};
  if(type==="water"){delete shape.geometryRef;delete shape.bounds;shape.half=bounds.half;shape.center=bounds.center;}
  const h=registry.registerAnalytical({id,regionId,physics,transform:identity,shapes:[shape]},{sample,priority,sourceKind});traversalEpoch++;
  handles.set(id,h);
  if(faces.length||triangleFactory){
   if(!boundarySources.has(regionId))boundarySources.set(regionId,new Map());
   const source={bounds,policy,type,recoveryKey:{type:"triangleMesh",collisionId:id}};
   if(triangleFactory){
    source.factory=triangleFactory;source.indexBounds=bounds;
    Object.defineProperties(source,{tree:{get:()=>materialize(source).tree},closed:{get:()=>materialize(source).closed}});
   }else{
    source.tree=buildFaceTree(faces);source.indexBounds=source.tree.bounds;source.closed=type==="triangleMesh"&&closedTopology(faces);
   }
   boundarySources.get(regionId).set(id,source);indexBoundary(regionId,id,source);
  }
  if(type==="water")types.water++;return h;
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
 // Supporting solid meshes are traversal candidates by default; block-only and explicit exclusions stay disabled. Faces must be outward wound.
 function triangleMesh({collisionId,triangles,support=false,mantle=support,climb=mantle,bounds:authoredBounds=null}){
  if(typeof support!=="boolean"||typeof mantle!=="boolean"||typeof climb!=="boolean"||mantle&&!support||climb&&!mantle)throw new TypeError("invalid mesh support/mantle policy");
  const factory=typeof triangles==='function'?triangles:null;
  if(!factory&&(!Array.isArray(triangles)||!triangles.length))throw new TypeError("empty triangle mesh");
  const faces=factory?null:triangles.map((v,i)=>triangleFace(v,"triangle:"+i));
  const raw=factory?authoredBounds:mergeBounds(faces);
  if(!raw||!['min','max'].every(k=>Array.isArray(raw[k])&&raw[k].length===3&&raw[k].every(Number.isFinite))||raw.min.some((v,i)=>v>raw.max[i]))throw new TypeError('invalid deferred mesh bounds');
  const bounds={min:raw.min.map(v=>v-1e-7),max:raw.max.map(v=>v+1e-7)};
  const policy={id:mantle?"triangle-mesh-mantle":support?"triangle-mesh-support":"triangle-mesh-block",block:true,support,mantle,oneWay:false,nav:false,camera:false,water:false,climb:climb?"face":mantle?"mantleOnly":"none"};
  const h=analytical(collisionId??next("triangleMesh"),"triangleMesh",bounds,policy,()=>null,{sourceKind:"triangleMesh",triangles:faces,triangleFactory:factory});
  types.triangleMesh=(types.triangleMesh??0)+1;
  return h;
 }
 function terrain({heights,gridN,cell,half,collisionId,boundaryFaces=[]}){
  const id=collisionId??next("terrain"),bounds={min:[-half,-10000,-half],max:[half,10000,half]};
  const h=analytical(id,"heightfield",bounds,roofPolicy(false),(x,z)=>sampleHeightfieldTriangle({heights,gridN,cell,half,x,z}),{sourceKind:"terrain",boundaryFaces});
  types.terrain++;return h;
 }
 function labSurface({collisionId,bounds,sample,ramps=[]}){
  if(regionId!=='motion-lab')throw new TypeError('lab-only analytical registration');
  const boundaryFaces=ramps.flatMap(r=>[
   {a:[r.x-r.width/2,0,r.z],b:[r.x-r.width/2,r.height,r.z-r.run],bottom:0},
   {a:[r.x+r.width/2,r.height,r.z-r.run],b:[r.x+r.width/2,0,r.z],bottom:0}
  ]);
  const h=analytical(collisionId,'heightfield',bounds,roofPolicy(false),sample,{sourceKind:'lab-ground',boundaryFaces});
  // Reuse the registered side triangles for traversal without changing analytical top support.
  const source=boundarySources.get(regionId)?.get(h.id);if(source)source.boundaryClimb=true;
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
 // Sample geometric collision planes, not rendering normals. At a crease
 // retain the steepest actual incident face rather than averaging normals.
 function planeY(face,x,z){
  const [nx,ny,nz]=face.normal,a=face.vertices[0];
  return Math.abs(ny)<1e-9?null:a[1]-(nx*(x-a[0])+nz*(z-a[2]))/ny;
 }
 function facePointY(face,x,z){
  const y=planeY(face,x,z);if(y===null)return null;
  const [a,b,c]=face.vertices,side=(p,q)=>(q[0]-p[0])*(z-p[2])-(q[2]-p[2])*(x-p[0]);
  const signs=[side(a,b),side(b,c),side(c,a)];
  return signs.every(v=>v>=-1e-9)||signs.every(v=>v<=1e-9)?y:null;
 }
 // Geometric vertical winding, merging coincident seam crossings. Only
 // run inside the bounds of a validated closed source.
 function interiorContact(source,x,z,y,radius,height){
  if(!source.closed)return null;
  const mid=y+height/2,b=source.bounds;
  if(x<=b.min[0]||x>=b.max[0]||z<=b.min[2]||z>=b.max[2]||mid<=b.min[1]||mid>=b.max[1])return null;
  const hits=[];
  visitFaces(source.tree,{min:[x,mid,z],max:[x,b.max[1],z]},face=>{
   const h=facePointY(face,x,z);
   if(h!==null&&h>=mid-1e-8)hits.push({h,sign:Math.sign(face.normal[1])});
  });
  hits.sort((a,b)=>a.h-b.h);
  let winding=0;
  for(let i=0;i<hits.length;){
   const h=hits[i].h;if(Math.abs(h-mid)<=1e-8)return null;
   let positive=false,negative=false;
   do{positive||=hits[i].sign>0;negative||=hits[i].sign<0;i++;}while(i<hits.length&&Math.abs(hits[i].h-h)<=1e-8);
   winding+=Number(positive)-Number(negative);
  }
  if(!winding)return null;
  // Nearest boundary of the horizontal cross-section provides a recovery
  // direction; this is not arbitrary 3D depenetration.
  let best=null,onBoundary=false;
  visitFaces(source.tree,{min:[b.min[0],mid,b.min[2]],max:[b.max[0],mid,b.max[2]]},face=>{
   const poly=hullXZ(clipY(clipY(face.vertices,mid,true),mid,false));
   for(let i=0;i<poly.length;i++){
    const a=poly[i],q=poly[(i+1)%poly.length],dx=q[0]-a[0],dz=q[1]-a[1],l=dx*dx+dz*dz;
    const t=l?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/l)):0;
    const vx=a[0]+dx*t-x,vz=a[1]+dz*t-z,dist=Math.hypot(vx,vz);
    if(dist<=1e-8){onBoundary=true;continue;}
    if(!best||dist+radius<best.depth)best={nx:vx/dist,nz:vz/dist,depth:dist+radius,collider:source.recoveryKey,featureId:face.featureId,geometricNormal:[...face.normal],interior:true};
   }
  });
  return onBoundary?null:best;
 }
 function eachMeshFace(region,bounds,purpose,visit){
  for(const [id,source] of boundaryCandidates(region,bounds)){
   if(source.type!=="triangleMesh"||!intersects(source.bounds,bounds)||!source.policy[purpose])continue;
   const record=registry.get(id);if(!record?.effectiveActive)continue;
   visitFaces(source.tree,bounds,face=>visit(face,id,record.revision,source.policy));
  }
 }
 function meshHit(face,id,revision,policy,point,rootY){
  return {instanceId:id,shapeId:"surface",surfaceId:JSON.stringify([id,"surface",face.featureId]),featureId:face.featureId,point,geometricNormal:[...face.normal],contactNormal:[...face.normal],separation:rootY-point[1],toi:null,policyId:policy.id,revision};
 }
 function meshSupport(x,z,maxY,minY=-Infinity,region=regionId){
  let best=null;
  eachMeshFace(region,{min:[x,minY-.002,z],max:[x,maxY+.002,z]},"support",(face,id,revision,policy)=>{
   if(face.normal[1]<=1e-9)return;
   const y=facePointY(face,x,z);
   if(y===null||y>maxY+.002||y<minY-.002)return;
   if(!best||y>best.point[1]+1e-8||Math.abs(y-best.point[1])<=1e-8&&face.normal[1]<best.geometricNormal[1])best=meshHit(face,id,revision,policy,[x,y,z],maxY);
  });
  return best;
 }
 // Exact circular footprint against the convex projection of a clipped
 // face. Return a point within the clipped footprint, including tangency.
 function diskPoint(poly,x,z,radius){
  const hull=hullXZ(poly);if(!hull.length)return null;
  let inside=hull.length>=3,best=Infinity,point=null;
  for(let i=0;i<hull.length;i++){
   const a=hull[i],b=hull[(i+1)%hull.length],dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz,t=l?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/l)):0,px=a[0]+dx*t,pz=a[1]+dz*t,d=Math.hypot(x-px,z-pz);
   if(d<best){best=d;point=[px,pz];}
   if(dx*(z-a[1])-dz*(x-a[0])< -1e-10)inside=false;
  }
  return inside?[x,z]:best<=radius+1e-9?point:null;
 }
 // Neighboring walkable triangles can meet the footprint before the centre
 // crosses their edge. Test the real closest point and the local grade,
 // rather than requiring an identical extended destination plane.
 function reachableWalkFace(face,x,z,y,radius){
  if(!Number.isFinite(y)||face.normal[1]<=1e-9)return false;
  const grade=Math.hypot(face.normal[0],face.normal[2])/face.normal[1];
  if(grade>Math.tan(50*Math.PI/180)+1e-9)return false;
  const p=diskPoint(face.vertices,x,z,radius);
  if(!p)return false;
  const h=planeY(face,p[0],p[1]),d=Math.hypot(p[0]-x,p[1]-z);
  return h!==null&&y>=h-grade*d-.004;
 }
 // A curved walkable patch is not a collection of independent obstacles.
 // Trace the actual projected segment over upward triangles, accepting only
 // intervals joined at the same geometric height. A disconnected shelf or
 // a steep intervening face cannot supply a continuation.
 function connectedWalkFace(source,face,x,z,y,radius){
  const grade=Math.tan(50*Math.PI/180),walkable=f=>f.normal[1]>1e-9&&Math.hypot(f.normal[0],f.normal[2])/f.normal[1]<=grade+1e-9;
  if(!walkable(face)||!Number.isFinite(y))return false;
  const p=diskPoint(face.vertices,x,z,radius);if(!p)return false;
  const dx=p[0]-x,dz=p[1]-z,d=Math.hypot(dx,dz),h=planeY(face,p[0],p[1]);
  if(h>y+grade*d+.004)return false;
  const span=grade*d+.004,eps=1e-7,intervals=[];
  visitFaces(source.tree,{min:[Math.min(x,p[0])-eps,y-span,Math.min(z,p[1])-eps],max:[Math.max(x,p[0])+eps,y+span,Math.max(z,p[1])+eps]},f=>{
   if(!walkable(f))return;
   let lo=0,hi=1;
   for(let i=0;i<3;i++){
    const a=f.vertices[i],b=f.vertices[(i+1)%3],ex=b[0]-a[0],ez=b[2]-a[2];
    const c=ex*(z-a[2])-ez*(x-a[0]),v=ex*dz-ez*dx;
    if(Math.abs(v)<1e-12){if(c>1e-9)return;}
    else if(v>0)hi=Math.min(hi,(1e-9-c)/v);
    else lo=Math.max(lo,(1e-9-c)/v);
    if(lo>hi)return;
   }
   const base=planeY(f,x,z),delta=planeY(f,p[0],p[1])-base;
   intervals.push({f,lo,hi,base,delta,reach:Infinity});
  });
  let start=-Infinity;
  for(const a of intervals)if(a.lo<=eps&&a.base<=y+.004)start=Math.max(start,a.base);
  if(start<y-span)return false;
  for(const a of intervals)if(a.lo<=eps&&Math.abs(a.base-start)<=eps)a.reach=0;
  for(let k=0;k<intervals.length;k++){
   let changed=false;
   for(const a of intervals){
    if(a.reach===Infinity)continue;
    if(a.f===face&&a.hi>=1-eps)return true;
    for(const b of intervals){
     const lo=Math.max(a.reach,a.lo,b.lo),hi=Math.min(a.hi,b.hi,b.reach);
     if(lo>hi)continue;
     const offset=a.base-b.base,slope=a.delta-b.delta;
     let t=lo;
     if(Math.abs(offset+slope*t)>eps){
      if(Math.abs(slope)<1e-12)continue;
      t=-offset/slope;if(t<lo-eps||t>hi+eps)continue;
      t=Math.max(lo,Math.min(hi,t));
     }
     if(t<b.reach-eps){b.reach=t;changed=true;}
    }
   }
   if(!changed)break;
  }
  return false;
 }
 function meshCeiling(x,z,y,targetY,radius,height,region=regionId){
  const from=y+height-.002,to=targetY+height;let best=null;
  eachMeshFace(region,{min:[x-radius,from,z-radius],max:[x+radius,to,z+radius]},"block",(face,id,revision,policy)=>{
   if(policy.support?face.normal[1]>=-1e-9:Math.abs(face.normal[1])<1e-9)return;
   const poly=clipY(face.vertices,from,true);
   let lo=Math.max(from,face.bounds.min[1]),hi=Math.min(best?.limitY??to,face.bounds.max[1]);
   if(hi<lo||!diskPoint(clipY(poly,hi,false),x,z,radius))return;
   for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(diskPoint(clipY(poly,mid,false),x,z,radius))hi=mid;else lo=mid;}
   const p=diskPoint(clipY(poly,hi,false),x,z,radius);if(!p)return;
   const hit=meshHit(face,id,revision,policy,[p[0],planeY(face,p[0],p[1]),p[1]],y+height);
   hit.limitY=hi;if(!best||hi<best.limitY)best=hit;
  });
  return best;
 }
 // Downward blocking is distinct from walkable support. Block-only
 // triangle obstacles must not disappear when gravity crosses their top.
 // Support-enabled meshes retain centre-height locomotion and grade policy.
 function meshDescent(x,z,y,targetY,radius=.35,region=regionId){
  if(targetY>=y)return null;
  const from=y+.002,to=targetY;let best=null;
  eachMeshFace(region,{min:[x-radius,to,z-radius],max:[x+radius,from,z+radius]},"block",(face,id,revision,policy)=>{
   if(policy.support||Math.abs(face.normal[1])<1e-9)return;
   const poly=clipY(face.vertices,from,false);
   let lo=Math.max(best?.limitY??to,face.bounds.min[1]),hi=Math.min(from,face.bounds.max[1]);
   if(hi<lo||!diskPoint(clipY(poly,lo,true),x,z,radius))return;
   for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(diskPoint(clipY(poly,mid,true),x,z,radius))lo=mid;else hi=mid;}
   const p=diskPoint(clipY(poly,lo,true),x,z,radius);if(!p)return;
   const hit=meshHit(face,id,revision,policy,[p[0],planeY(face,p[0],p[1]),p[1]],y);
   hit.limitY=Math.min(y,lo);
   if(!best||hit.limitY>best.limitY)best=hit;
  });
  return best;
 }
 // A mantle landing and both hand contacts must belong to the same
 // explicitly enabled mesh. Never infer a circular wall or a flat proxy top.
 function meshTraversalHits(x,z,y,dx,dz,radius,height,reach,alignment,memo=(key,read)=>read()){
  const bounds={min:[Math.min(x,x+dx*reach)-radius,y+.002,Math.min(z,z+dz*reach)-radius],max:[Math.max(x,x+dx*reach)+radius,y+height-.002,Math.max(z,z+dz*reach)+radius]},out=[];
  for(const [id,source] of boundaryCandidates(regionId,bounds)){
   if((!source.boundaryClimb&&(source.type!=="triangleMesh"||(!source.policy.mantle&&source.policy.climb!=="face")))||!intersects(source.indexBounds,bounds))continue;
   const rec=registry.get(id);if(!rec?.effectiveActive)continue;
   const hit=memo(["mesh-entry",id,rec.revision,x,z,y,dx,dz,radius,height,reach,alignment],()=>{
    let best=null;
    visitFaces(source.tree,bounds,face=>{
     const c=sweepFace(face,x,z,y,dx*reach,dz*reach,radius,height);
     if(c&&-(dx*c.nx+dz*c.nz)>=alignment&&(!best||c.toi<best.toi))best=c;
    });
    return best;
   });
   if(hit)out.push({id,source,revision:rec.revision,hit});
  }
  return out.sort((a,b)=>a.hit.toi-b.hit.toi);
 }
 function* meshMantleCandidates(x,z,y,dx,dz,{radius=.35,height=1.72,step=.48,reach=.19,alignment=.65,walkMax=50*Math.PI/180}={},hits=null,memo=(key,read)=>read()){
  const len=Math.hypot(dx,dz);if(len<1e-8)return;
  dx/=len;dz/=len;
  for(const {id,source,revision,hit} of hits??meshTraversalHits(x,z,y,dx,dz,radius,height,reach,alignment,memo)){
   if(!source.policy.mantle)continue;
   // Search only within local reach; the real body-path validator rejects intervening higher geometry.
   const over=Math.min(source.tree.bounds.max[1]+.045,y+height+.045);
   const sample=(px,pz)=>memo(["mesh-stance",id,revision,y,step,over,px,pz],()=>{
    let best=null;
    visitFaces(source.tree,{min:[px,y+step,pz],max:[px,over,pz]},face=>{
     if(face.normal[1]<=1e-9)return;
     const h=facePointY(face,px,pz);
     if(h===null||h<=y+step||h>over)return;
     if(!best||h>best.y+1e-8||Math.abs(h-best.y)<=1e-8&&face.normal[1]<best.normal[1])best={x:px,y:h,z:pz,normal:face.normal,featureId:face.featureId};
    });
    return best;
   });
   const walkCos=Math.cos(walkMax)-1e-8,walkable=p=>p&&p.normal[1]>=walkCos;
   const lateral=[-hit.nz,hit.nx];
   // Keep the nearest geometric candidate first, but offer a bounded set
   // of alternatives on the same source for the existing body path validator.
   let offered=0;
   // Keep the centre ray first. A reachable face near an edge can lack
   // enough room for both palms along that ray; try bounded side alignment.
   const shifts=[0];
   for(let s=.16;s<=radius+.195+reach+1e-8;s+=.16)shifts.push(s,-s);
   for(const shift of shifts){
    let lastDistance=-Infinity;
    for(let d=radius+reach+.1;d<=2.4;d+=.08){
     if(d-lastDistance<.16-1e-8)continue;
     const tx=x+dx*d-dz*shift,tz=z+dz*d+dx*shift,stand=sample(tx,tz);
     if(!walkable(stand)||stand.y-y>height)continue;
     let valid=true;for(let i=0;i<8;i++){const p=sample(tx+Math.cos(i*Math.PI/4)*radius*.8,tz+Math.sin(i*Math.PI/4)*radius*.8);if(!walkable(p)||Math.abs(p.y-stand.y)>.24){valid=false;break;}}
     if(!valid)continue;
     let hands=null;
     for(const offset of [radius+.12,radius,.2,.1]){
      const pair=[];for(const sign of [-1,1]){const p=sample(tx-dx*offset+lateral[0]*sign*.195,tz-dz*offset+lateral[1]*sign*.195);if(!p||p.normal[1]<=.35||p.y-y>height)break;pair.push(p);}
      if(pair.length===2){hands=pair;break;}
     }
     if(!hands)continue;
     yield {instanceId:id,revision,toi:hit.toi,nx:hit.nx,nz:hit.nz,stand,hands,over:stand.y+.045};
     lastDistance=d;if(++offered>=3)break;
    }
    if(offered)break;
   }
  }
 }
 function meshMantlePlans(x,z,y,dx,dz,options){return [...meshMantleCandidates(x,z,y,dx,dz,options)].sort((a,b)=>a.toi-b.toi);}
 // Shared entry sweep; defer stance search until distance ordering selects the source.
 function meshTraversalEntries(x,z,y,dx,dz,options,memo=(key,read)=>read()){
  const {radius=.35,height=1.72,reach=.19,alignment=.65}=options;
  const len=Math.hypot(dx,dz);if(len<1e-8)return [];dx/=len;dz/=len;
  return meshTraversalHits(x,z,y,dx,dz,radius,height,reach,alignment,memo).map(entry=>({
   id:entry.id,revision:entry.revision,toi:entry.hit.toi,climb:entry.source.boundaryClimb||entry.source.policy.climb==="face",boundary:!!entry.source.boundaryClimb,nx:entry.hit.nx,nz:entry.hit.nz,
   mantles:entry.source.policy.mantle?()=>meshMantleCandidates(x,z,y,dx,dz,options,[entry],memo):null
  }));
 }
 function meshClimbEntries(x,z,y,dx,dz,radius,height,reach,alignment){
  return meshTraversalHits(x,z,y,dx,dz,radius,height,reach,alignment).filter(e=>e.source.policy.climb==="face").map(({id,revision,hit})=>({id,revision,toi:hit.toi}));
 }
 function meshClimbFace(id,revision,x,z,y,dx,dz,lo,hi){
  const source=boundarySources.get(regionId)?.get(id),rec=registry.get(id);
  if(!source||(!source.boundaryClimb&&source.policy.climb!=="face")||!rec?.effectiveActive||rec.revision!==revision)return null;
  const ax=x+dx*lo,az=z+dz*lo,bx=x+dx*hi,bz=z+dz*hi;
  let best=null;
  visitFaces(source.tree,{min:[Math.min(ax,bx)-1e-7,y-1e-7,Math.min(az,bz)-1e-7],max:[Math.max(ax,bx)+1e-7,y+1e-7,Math.max(az,bz)+1e-7]},face=>{
   const n=face.normal,a=face.vertices[0],den=n[0]*dx+n[2]*dz;
   // A rounded side may lean outward; do not use horizontal undersides.
   if(n[1]<-.65||den>=-.08)return;
   const t=(n[0]*(a[0]-x)+n[1]*(a[1]-y)+n[2]*(a[2]-z))/den;
   if(t<lo-1e-8||t>hi+1e-8||best&&t>=best.along)return;
   const p=[x+dx*t,y,z+dz*t];
   for(let i=0;i<3;i++){
    const a=face.vertices[i],b=face.vertices[(i+1)%3],u=b.map((v,j)=>v-a[j]),v=p.map((v,j)=>v-a[j]);
    const c=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    if(c.reduce((s,v,j)=>s+v*n[j],0)<-1e-7)return;
   }
   best={point:p,normal:n,along:t,grade:-den/Math.max(n[1],1e-8)};
  });
  return best;
 }
 function meshSlope(x,z,floor,walkMax){
  if(!Number.isFinite(floor))return undefined;
  const hit=meshSupport(x,z,floor,floor-.002);
  if(!hit||Math.abs(hit.point[1]-floor)>.002)return undefined;
  const n=hit.geometricNormal,state=classifySupport({geometricNormal:n,support:true,footContact:true,walkMax});
  if(state.kind==="walk")return null;
  const h=Math.hypot(n[0],n[2]);
  return state.kind==="slide"&&h>1e-9?{ux:-n[0]/h,uz:-n[2]/h,k:h/n[1]}:undefined;
 }
 function support(root,profile,{maxRise=0,maxDrop=Infinity,purpose="support",region=regionId}={}){
  const hit=registry.sampleSupport({root,profile,maxRise,maxDrop},{regionId:region,purpose});
  const mesh=purpose==="support"||purpose==="footIK"?meshSupport(root[0],root[2],root[1]+maxRise,root[1]-maxDrop,region):null;
  if(mesh&&(!hit||mesh.point[1]>hit.point[1])){mesh.separation=root[1]-mesh.point[1];return mesh;}
  return hit;
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
  const mesh=meshSlope(x,z,floor,walkMax);if(mesh!==undefined)return mesh;
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
  const hit=registry.sampleSupport({root:[x,maxY,z],profile:{radius,height},maxRise:0,maxDrop:Infinity,candidates,staticOnly:true},{regionId,purpose:"support"});
  const mesh=meshSupport(x,z,maxY);
  return mesh&&(!hit||mesh.point[1]>hit.point[1])?mesh:hit;
 }
 function staticCeiling(x,z,y,targetY,solids=null,radius=.35,height=1.72){
  const candidates=solids??[...query(x,z,radius)];
  const hit=registry.sampleCeiling({root:[x,y,z],targetY,profile:{radius,height},candidates},{regionId,purpose:"headroom"});
  const mesh=meshCeiling(x,z,y,targetY,radius,height);
  return mesh&&(!hit||mesh.limitY<hit.point[1])?mesh:hit;
 }
 // All actor/body consumers use the identical geometry contact query.
 function meshContacts(x,z,y,radius=.35,height=1.72){
  const out=[];
  // Mesh face overlap uses the same height-clipped projection as the sweep.
  // Preserve centre-height ground support: a body standing above a walkable
  // face must not be repelled by the uphill part of its own footprint.
  const interiorIds=new Set(),bodyBounds={min:[x-radius,y+.002,z-radius],max:[x+radius,y+height-.002,z+radius]};
  for(const [id,source] of boundaryCandidates(regionId,bodyBounds)){
   if(!intersects(source.bounds,bodyBounds)||!registry.get(id)?.effectiveActive)continue;
   const c=interiorContact(source,x,z,y,radius,height);
   if(c){interiorIds.add(id);out.push({...c,instanceId:id});}
  }
  eachMeshFace(regionId,{min:[x-radius,y+.002,z-radius],max:[x+radius,y+height-.002,z+radius]},"block",(face,id)=>{
   if(interiorIds.has(id))return;
   if(face.bounds.max[1]<=y+.002||face.bounds.min[1]>=y+height-.002)return;
   const source=boundarySources.get(regionId).get(id);
   if(source.policy.support&&face.normal[1]>1e-9&&(y>=planeY(face,x,z)-.004||connectedWalkFace(source,face,x,z,y,radius)))return;
   const poly=hullXZ(clipY(clipY(face.vertices,y+.002,true),y+height-.002,false));
   const c=hullContact(poly,x,z,radius,face);
   // face identity is stable for the existing decreasing-overlap rule.
   if(c)out.push({...c,collider:source.closed?source.recoveryKey:face,instanceId:id,featureId:face.featureId,geometricNormal:[...face.normal]});
  });
  return out;
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
  out.push(...meshContacts(x,z,y,radius,height));
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
 // Shared pre-rise horizontal sweep: both authored boundaries and
 // arbitrary static triangle obstacles use the same geometric narrow phase.
 function surfaceBoundarySweep(x,z,y,dx,dz,radius=.35,height=1.72,move=null){
  if(Math.hypot(dx,dz)<1e-9)return [];
  const hits=[],bounds={min:[Math.min(x,x+dx)-radius,y+.002,Math.min(z,z+dz)-radius],max:[Math.max(x,x+dx)+radius,y+height-.002,Math.max(z,z+dz)+radius]};
  for(const [id,source] of boundaryCandidates(regionId,bounds)){
   if(!intersects(source.bounds,bounds)||!registry.get(id)?.effectiveActive)continue;
   const prior=interiorContact(source,x,z,y,radius,height);
   if(prior){
    const end=interiorContact(source,x+dx,z+dz,y,radius,height);
    const middle=interiorContact(source,x+dx/2,z+dz/2,y,radius,height);
    // Only short decreasing-depth steps can recover an invalid interior
    // position. Exterior sweeps still use every actual face.
    if(Math.hypot(dx,dz)<=radius&&
       (middle?middle.depth<prior.depth-1e-5:prior.nx*dx+prior.nz*dz>1e-9)&&
       (!end||middle&&end.depth<middle.depth-1e-5))continue;
    hits.push({...prior,instanceId:id,toi:0});continue;
   }
   visitFaces(source.tree,bounds,face=>{
    // Coplanar triangles adjacent to the selected ground must not snag a
    // body crossing a triangulation seam. Compare the actual plane, not
    // whether the actor centre lies inside this individual triangle.
    if(source.type==="triangleMesh"&&source.policy.support&&face.normal[1]>1e-9&&move){
     const from=planeY(face,x,z),to=planeY(face,x+dx,z+dz);
     const slope=Math.hypot(face.normal[0],face.normal[2])/face.normal[1];
     const above=from!==null&&y>=from-.004;
     const selected=Number.isFinite(move.floor)&&to!==null&&Math.abs(to-move.floor)<=.004;
     if(above&&((selected&&move.grounded&&slope<=Math.tan(50*Math.PI/180)+1e-9)||to<=from+1e-8))return;
     const reach=radius+Math.hypot(dx,dz);
     if(move.grounded&&(reachableWalkFace(face,x,z,y,reach)||connectedWalkFace(source,face,x,z,y,reach))&&(reachableWalkFace(face,x+dx,z+dz,move.floor,reach)||connectedWalkFace(source,face,x+dx,z+dz,move.floor,reach)))return;
    }
    const hit=sweepFace(face,x,z,y,dx,dz,radius,height);
    if(hit)hits.push({...hit,instanceId:id,featureId:face.featureId,geometricNormal:[...face.normal]});
   });
  }
  hits.sort((a,b)=>a.toi-b.toi);
  const out=[];
  for(const h of hits){
   if(h.toi>hits[0].toi+1e-6)break;
   if(!out.some(q=>q.instanceId===h.instanceId&&Math.hypot(q.nx-h.nx,q.nz-h.nz)<1e-6))out.push(h);
  }
  return out;
 }
 // Compatibility name consumed by the generated game.js; the implementation
 // is region/geometry-driven. Rename the caller when rebuilding that bundle.
 const labSideSweep=surfaceBoundarySweep;
 function remove(id){
  const h=handles.get(id);if(!h)return false;
  const sourceRegion=registry.get(id)?.regionId;
  registry.remove(h);traversalEpoch++;handles.delete(id);records.delete(id);
  const sources=boundarySources.get(sourceRegion);deferredGeometry.delete(sources?.get(id));unindexBoundary(sourceRegion,id,sources?.get(id));sources?.delete(id);if(sources&&!sources.size)boundarySources.delete(sourceRegion);
  return true;
 }
 function debugSnapshot(){return {regionId,counts:{...types},registered:handles.size,analyticalIndex:registry.analyticalIndexStats(),boundaryIndex:{regions:boundaryGrids.size,cells:[...boundaryGrids.values()].reduce((n,g)=>n+g.cells.size,0),large:[...boundaryGrids.values()].reduce((n,g)=>n+g.large.size,0),lastCandidates:lastBoundaryCandidates,deferredResident:deferredGeometry.size,deferredLimit:DEFERRED_LIMIT},capabilities:registry.capabilities()};}
 return {setRegion,primitive,roof,terrain,triangleMesh,labSurface,stair,water,support,surfaceAt,hasSurfaceKind,groundSlope,activePrimitives,sampleWater,staticSupport,staticCeiling,meshSupport,meshDescent,meshTraversalEntries,meshMantlePlans,meshClimbEntries,meshClimbFace,meshSlope,staticSweep,surfaceBoundarySweep,labSideSweep,overlap,contacts,meshContacts,remove,get:registry.get,suspendRegion:id=>{const changed=registry.suspendRegion(id);traversalEpoch++;return changed;},resumeRegion:id=>{const changed=registry.resumeRegion(id);traversalEpoch++;return changed;},traversalEpoch:()=>traversalEpoch,record:id=>records.get(id)??null,debugSnapshot};
}
