import {classifySupport} from './world-collision.js';
import {createLegacyStaticCollision,sampleLegacyRoof,sampleHeightfieldTriangle,sampleLegacyStair,sampleLegacyWater} from './world-collision-legacy.js';

// Bridge for the existing world builder: authoritative geometry stays in the
// current spatial grid until a fixture proves parity. No second movement solver.
export function createRuntimeCollisionBridge({query,inside,local,playerContact,roofInFoot,roofInOuter,roofSurfaceLocal,stairUV,stairMinV,stairMaxV}){
 const registry=createLegacyStaticCollision({query,inside,local,playerContact});
 const roofHelpers={local,roofInFoot,roofInOuter,roofSurfaceLocal};
 let regionId="legacy-world",serial=0;
 const boundarySources=new Map();
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
 function analytical(id,type,bounds,policy,sample,{priority=0,physics="solid",sourceKind=type,boundaryFaces=[],triangles=null}={}){
  if(boundaryFaces.length&&type!=="heightfield")throw new TypeError("vertical boundaries require heightfield source");
  const faces=triangles??prepareBoundaryFaces(boundaryFaces,bounds);
  if(handles.has(id))throw new TypeError("duplicate analytical collision ID");
  const shape={id:"surface",type,center:[0,0,0],geometryRef:id,bounds,policy};
  if(type==="water"){delete shape.geometryRef;delete shape.bounds;shape.half=bounds.half;shape.center=bounds.center;}
  const h=registry.registerAnalytical({id,regionId,physics,transform:identity,shapes:[shape]},{sample,priority,sourceKind});
  handles.set(id,h);
  if(faces.length){
   if(!boundarySources.has(regionId))boundarySources.set(regionId,new Map());
   boundarySources.get(regionId).set(id,{tree:buildFaceTree(faces),bounds,policy,type,closed:type==="triangleMesh"&&closedTopology(faces),recoveryKey:{type:"triangleMesh",collisionId:id}});
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
 // Support is opt-in. Supporting mesh faces must be outward wound.
 function triangleMesh({collisionId,triangles,support=false}){
  if(typeof support!=="boolean")throw new TypeError("invalid mesh support policy");
  if(!Array.isArray(triangles)||!triangles.length)throw new TypeError("empty triangle mesh");
  const faces=triangles.map((v,i)=>triangleFace(v,"triangle:"+i)),raw=mergeBounds(faces);
  const bounds={min:raw.min.map(v=>v-1e-7),max:raw.max.map(v=>v+1e-7)};
  const policy={id:support?"triangle-mesh-support":"triangle-mesh-block",block:true,support,mantle:false,oneWay:false,nav:false,camera:false,water:false,climb:"none"};
  const h=analytical(collisionId??next("triangleMesh"),"triangleMesh",bounds,policy,()=>null,{sourceKind:"triangleMesh",triangles:faces});
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
  for(const [id,source] of boundarySources.get(region)??[]){
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
  // Mesh face overlap uses the same height-clipped projection as the sweep.
  // Preserve centre-height ground support: a body standing above a walkable
  // face must not be repelled by the uphill part of its own footprint.
  const interiorIds=new Set();
  for(const [id,source] of boundarySources.get(regionId)??[]){
   if(!registry.get(id)?.effectiveActive)continue;
   const c=interiorContact(source,x,z,y,radius,height);
   if(c){interiorIds.add(id);out.push({...c,instanceId:id});}
  }
  eachMeshFace(regionId,{min:[x-radius,y+.002,z-radius],max:[x+radius,y+height-.002,z+radius]},"block",(face,id)=>{
   if(interiorIds.has(id))return;
   if(face.bounds.max[1]<=y+.002||face.bounds.min[1]>=y+height-.002)return;
   const source=boundarySources.get(regionId).get(id);
   if(source.policy.support&&face.normal[1]>1e-9&&y>=planeY(face,x,z)-.004)return;
   const poly=hullXZ(clipY(clipY(face.vertices,y+.002,true),y+height-.002,false));
   const c=hullContact(poly,x,z,radius,face);
   // face identity is stable for the existing decreasing-overlap rule.
   if(c)out.push({...c,collider:source.closed?source.recoveryKey:face,instanceId:id,featureId:face.featureId,geometricNormal:[...face.normal]});
  });
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
  for(const [id,source] of boundarySources.get(regionId)??[]){
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
  registry.remove(h);handles.delete(id);records.delete(id);
  const sources=boundarySources.get(sourceRegion);sources?.delete(id);if(sources&&!sources.size)boundarySources.delete(sourceRegion);
  return true;
 }
 function debugSnapshot(){return {regionId,counts:{...types},registered:handles.size,analyticalIndex:registry.analyticalIndexStats(),capabilities:registry.capabilities()};}
 return {setRegion,primitive,roof,terrain,triangleMesh,labSurface,stair,water,support,surfaceAt,hasSurfaceKind,groundSlope,activePrimitives,sampleWater,staticSupport,staticCeiling,meshSupport,meshDescent,meshSlope,staticSweep,surfaceBoundarySweep,labSideSweep,overlap,contacts,remove,get:registry.get,suspendRegion:registry.suspendRegion,resumeRegion:registry.resumeRegion,record:id=>records.get(id)??null,debugSnapshot};
}
