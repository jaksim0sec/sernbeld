import {attentionRotations} from '../attention-pose.js';

// Common garment binding in the foot-anchored reference pose. The asset
// supplies anatomical weight constraints, render parts and coverage policy.
const STEP=.04;
const key=(x,y,z)=>x*1048576+y*1024+z;
const dot=(a,b,c,x,y,z)=>a*x+b*y+c*z;
function blend(out,matrices,joints,weights,offset){
 const e=out.elements;e.fill(0);
 for(let k=0;k<4;k++){const w=weights[offset+k];if(!w)continue;const m=matrices[joints[offset+k]].elements;for(let j=0;j<16;j++)e[j]+=w*m[j];}
 return out;
}
function referenceSkin(T,actor){
 const rotations=attentionRotations(actor.data.bones);
 const frame=new T.Matrix4().compose(new T.Vector3(0,-actor.mesh.geometry.boundingBox.min.y*actor.units,0),new T.Quaternion(),new T.Vector3().setScalar(actor.units));
 // Evaluate the reference pose with the same Three Bone/Object3D transform
 // pipeline as the runtime. Use a detached clone, never mutate live actors.
 const root=new T.Group(),bones=actor.bones.map(b=>{const copy=new T.Bone();copy.name=b.name;copy.position.copy(actor.rest[b.name]);return copy;});
 const byName=new Map(bones.map(b=>[b.name,b]));
 for(let i=0;i<bones.length;i++){
  const bone=bones[i],source=actor.bones[i],r=rotations[bone.name];
  if(r)bone.quaternion.setFromRotationMatrix(new T.Matrix4().fromArray([r[0],r[1],r[2],0,r[3],r[4],r[5],0,r[6],r[7],r[8],0,0,0,0,1]));
  (source.parent?.isBone?byName.get(source.parent.name):root).add(bone);
 }
 root.updateMatrixWorld(true);
 const referenceBones=bones.map(bone=>frame.clone().multiply(bone.matrixWorld));
 const matrices=actor.bones.map((bone,i)=>{
  const p=actor.data.bones[i].pivot;
  return referenceBones[i].clone().multiply(new T.Matrix4().makeTranslation(-p[0]/1428,-p[1]/1428,-p[2]/1428));
 });
 const names=['upper_arm_right','forearm_right','upper_arm_left','forearm_left'];
 const pivots=names.map(name=>new T.Vector3().setFromMatrixPosition(frame.clone().multiply(byName.get(name).matrixWorld)).toArray());
 return {matrices,pivots,frame,inverseBones:referenceBones.map(m=>m.clone().invert())};
}
// Closest point on a triangle; return barycentric coordinates in a reused array.
function closest(p,a,b,c,x,y,z,out){
 a*=3;b*=3;c*=3;
 const ax=p[a],ay=p[a+1],az=p[a+2],ux=p[b]-ax,uy=p[b+1]-ay,uz=p[b+2]-az,vx=p[c]-ax,vy=p[c+1]-ay,vz=p[c+2]-az;
 const px=x-ax,py=y-ay,pz=z-az,d1=dot(ux,uy,uz,px,py,pz),d2=dot(vx,vy,vz,px,py,pz);
 let t=0,s=0;
 if(d1<=0&&d2<=0){}
 else{
  const bx=px-ux,by=py-uy,bz=pz-uz,d3=dot(ux,uy,uz,bx,by,bz),d4=dot(vx,vy,vz,bx,by,bz);
  if(d3>=0&&d4<=d3)t=1;
  else{
   const vc=d1*d4-d3*d2;
   if(vc<=0&&d1>=0&&d3<=0)t=d1/(d1-d3||1);
   else{
    const cx=px-vx,cy=py-vy,cz=pz-vz,d5=dot(ux,uy,uz,cx,cy,cz),d6=dot(vx,vy,vz,cx,cy,cz);
    if(d6>=0&&d5<=d6)s=1;
    else{
     const vb=d5*d2-d1*d6;
     if(vb<=0&&d2>=0&&d6<=0)s=d2/(d2-d6||1);
     else{
      const va=d3*d6-d5*d4;
      if(va<=0&&d4-d3>=0&&d5-d6>=0){s=(d4-d3)/(d4-d3+d5-d6||1);t=1-s;}
      else{const den=va+vb+vc;if(Math.abs(den)>1e-20){t=vb/den;s=vc/den;}}
     }
    }
   }
  }
 }
 const qx=ax+ux*t+vx*s,qy=ay+uy*t+vy*s,qz=az+uz*t+vz*s;
 out[0]=1-t-s;out[1]=t;out[2]=s;out[3]=qx;out[4]=qy;out[5]=qz;
 return (x-qx)**2+(y-qy)**2+(z-qz)**2;
}
function surface(p,n,index,valid,regions=null,trackEdges=false){
 const cells=new Map(),tri=[],edges=trackEdges?new Map():null;
 const stride=p.length/3;
 const edge=(a,b)=>Math.min(a,b)*stride+Math.max(a,b);
 for(let i=0;i<index.length;i+=3){
  const a=index[i],b=index[i+1],c=index[i+2];if(a===b||b===c||a===c||!valid(a,b,c))continue;
  const id=tri.length/3;tri.push(a,b,c);
  if(edges)for(const [u,v] of [[a,b],[b,c],[c,a]]){const k=edge(u,v);edges.set(k,(edges.get(k)||0)+1);}
  const A=a*3,B=b*3,C=c*3;
  const lo=[0,1,2].map(k=>Math.floor(Math.min(p[A+k],p[B+k],p[C+k])/STEP)),hi=[0,1,2].map(k=>Math.floor(Math.max(p[A+k],p[B+k],p[C+k])/STEP));
  for(let x=lo[0];x<=hi[0];x++)for(let y=lo[1];y<=hi[1];y++)for(let z=lo[2];z<=hi[2];z++){
   const k=key(x,y,z);let list=cells.get(k);if(!list)cells.set(k,list=[]);list.push(id);
  }
 }
 const visited=new Uint32Array(tri.length/3),scratch=new Float64Array(6);let stamp=0;
 const result={a:0,b:0,c:0,u:0,v:0,w:0,x:0,y:0,z:0,nx:0,ny:0,nz:0,distance:0,alignment:0};
 function nearest(x,y,z,nx,ny,nz,r,guide=null){
  const tag=++stamp,r2=r*r;let best=Infinity,found=false;
  for(let i=Math.floor((x-r)/STEP);i<=Math.floor((x+r)/STEP);i++)for(let j=Math.floor((y-r)/STEP);j<=Math.floor((y+r)/STEP);j++)for(let k=Math.floor((z-r)/STEP);k<=Math.floor((z+r)/STEP);k++){
   const list=cells.get(key(i,j,k));if(!list)continue;
   for(const id of list){
    if(visited[id]===tag)continue;visited[id]=tag;
    const a=tri[id*3],b=tri[id*3+1],c=tri[id*3+2],d=closest(p,a,b,c,x,y,z,scratch);if(!Number.isFinite(d)||d>r2||d>best)continue;
    // Roundoff at a thin/degenerate triangle edge must not create negative
    // bone weights. Use a normalized convex barycentric combination.
    let u=Math.max(0,scratch[0]),v=Math.max(0,scratch[1]),w=Math.max(0,scratch[2]),total=u+v+w;
    if(!Number.isFinite(total)||total<1e-10)continue;
    u/=total;v/=total;w/=total;
    let X=n[a*3]*u+n[b*3]*v+n[c*3]*w,Y=n[a*3+1]*u+n[b*3+1]*v+n[c*3+1]*w,Z=n[a*3+2]*u+n[b*3+2]*v+n[c*3+2]*w;
    const l=Math.hypot(X,Y,Z)||1;X/=l;Y/=l;Z/=l;
    const alignment=dot(X,Y,Z,nx,ny,nz);
    let score=d+(1-Math.max(-1,Math.min(1,alignment)))*.00012;
    if(regions&&guide){const {region,amount}=guide,offset=region*stride;const influence=regions[offset+a]*u+regions[offset+b]*v+regions[offset+c]*w;score+=.0016*Math.max(0,amount-influence)**2;}
    if(score>=best)continue;best=score;found=true;
    Object.assign(result,{a,b,c,u,v,w,x:scratch[3],y:scratch[4],z:scratch[5],nx:X,ny:Y,nz:Z,distance:Math.sqrt(d),alignment});
   }
  }
  return found?result:null;
 }
 function nearEdge(hit,margin){
  if(!edges)return false;
  for(const [a,b] of [[hit.a,hit.b],[hit.b,hit.c],[hit.c,hit.a]]){
   if(edges.get(edge(a,b))!==1)continue;
   const A=a*3,B=b*3,dx=p[B]-p[A],dy=p[B+1]-p[A+1],dz=p[B+2]-p[A+2],x=hit.x-p[A],y=hit.y-p[A+1],z=hit.z-p[A+2],t=Math.max(0,Math.min(1,dot(x,y,z,dx,dy,dz)/(dx*dx+dy*dy+dz*dz||1)));
   if((x-dx*t)**2+(y-dy*t)**2+(z-dz*t)**2<margin*margin)return true;
  }
  return false;
 }
 return {nearest,nearEdge};
}
// Weld coincident render vertices before diffusion (UV/material seams must not
// split a skinning field). Smooth only along garment connectivity, never
// across nearby but disconnected surfaces. Rigid authored anchors stay fixed.
function smoothField(position,metric,index,field,locked,boneCount,passes,gradientLimit){
 const n=position.length/3,ids=new Int32Array(n),lookup=new Map(),groups=[],adj=[];
 for(let i=0;i<n;i++){
  const k=i*3,key=[0,1,2].map(j=>Math.round(position[k+j]*100000)).join(':');
  let id=lookup.get(key);if(id===undefined){id=groups.length;lookup.set(key,id);groups.push([]);adj.push(new Set());}
  ids[i]=id;groups[id].push(i);
 }
 for(let i=0;i<index.length;i+=3){const a=ids[index[i]],b=ids[index[i+1]],c=ids[index[i+2]];for(const [u,v] of [[a,b],[b,c],[c,a]])if(u!==v){adj[u].add(v);adj[v].add(u);}}
 const count=groups.length,base=new Float32Array(count*boneCount),fixed=new Uint8Array(count),centers=new Float32Array(count*3);
 groups.forEach((members,i)=>{
  const hard=members.filter(j=>locked[j]),source=hard.length?hard:members;fixed[i]=hard.length?1:0;
  for(const j of source)for(let b=0;b<boneCount;b++)base[i*boneCount+b]+=field[j*boneCount+b]/source.length;
  for(const j of members)for(let k=0;k<3;k++)centers[i*3+k]+=metric[j*3+k]/members.length;
 });
 // Local smoothing reduces noisy surface transfer without blending unrelated
 // spatial neighbors. The compact bone palette keeps the startup work bounded.
 let prev=base.slice(),next=new Float32Array(prev.length);
 for(let pass=0;pass<passes;pass++){
  for(let i=0;i<count;i++){
   const o=i*boneCount,neighbors=adj[i],w=neighbors.size;
   if(fixed[i]||!w){next.set(base.subarray(o,o+boneCount),o);continue;}
   for(let b=0;b<boneCount;b++){
    let sum=0;for(const j of neighbors)sum+=prev[j*boneCount+b];
    next[o+b]=base[o+b]*.16+prev[o+b]*.19+sum*.65/w;
   }
  }
  [prev,next]=[next,prev];
 }
 // Limit weight gradients by actual edge length, not vertex count. A short
 // edge cannot have two wildly different bone transforms (the usual cause
 // of a long spike at an armpit or cuff). Project onto a simplex-compatible
 // L1 constraint while retaining rigid anchors.
 const eu=[],ev=[],limits=[];
 for(let u=0;u<count;u++)for(const v of adj[u])if(v>u){
  const a=u*3,b=v*3,l=Math.hypot(centers[a]-centers[b],centers[a+1]-centers[b+1],centers[a+2]-centers[b+2]);
  eu.push(u);ev.push(v);limits.push(Math.min(2,gradientLimit*Math.max(l,.00001)));
 }
 for(let pass=0;pass<48;pass++){
  let maxViolation=0;
  for(let i=0;i<eu.length;i++){
   const e=pass%2?eu.length-1-i:i,u=eu[e],v=ev[e],a=u*boneCount,b=v*boneCount;
   if(fixed[u]&&fixed[v])continue;
   let delta=0;for(let j=0;j<boneCount;j++)delta+=Math.abs(prev[a+j]-prev[b+j]);
   const excess=delta-limits[e];if(excess<=.0001)continue;
   maxViolation=Math.max(maxViolation,excess);
   const rate=excess/delta,ra=fixed[u]?0:fixed[v]?rate:rate*.5,rb=fixed[v]?0:fixed[u]?rate:rate*.5;
   for(let j=0;j<boneCount;j++){const d=prev[b+j]-prev[a+j];prev[a+j]+=d*ra;prev[b+j]-=d*rb;}
  }
  if(maxViolation<.001)break;
 }
 for(let i=0;i<n;i++){
  const o=ids[i]*boneCount;field.set(prev.subarray(o,o+boneCount),i*boneCount);
  if(groups[ids[i]].length>1)for(let j=0;j<3;j++)metric[i*3+j]=centers[ids[i]*3+j];
 }
 return ids;
}
function normalizedInfluences(field,offset,boneCount,indices,weights,k,slots){
 let sum=0;
 const best=new Int16Array(slots).fill(-1),value=new Float32Array(slots);
 for(let b=0;b<boneCount;b++){
  const w=field[offset+b];if(w<=value[slots-1])continue;
  let j=slots-1;while(j>0&&w>value[j-1]){value[j]=value[j-1];best[j]=best[j-1];j--;}
  value[j]=w;best[j]=b;
 }
 for(const w of value)sum+=w;
 if(!(sum>1e-8))throw Error('Garment vertex has no bone influence');
 for(let j=0;j<slots;j++){indices[k+j]=Math.max(0,best[j]);weights[k+j]=value[j]/sum;}
}
function coverageMask(rest,asset,posed,posedN,skin,accept,allow){
 const n=posed.length/3,covered=new Uint8Array(n);
 if(!accept)return covered;
 const cloth=surface(rest,asset.normal,asset.index,accept,null,true);
 let lo=Infinity,hi=-Infinity;
 for(let i=1;i<rest.length;i+=3){lo=Math.min(lo,rest[i]);hi=Math.max(hi,rest[i]);}
 for(let i=0;i<n;i++){
  const j=i*3;if(!skin[i]||posed[j+1]<lo||posed[j+1]>hi||(allow&&!allow(i,posed)))continue;
  const hit=cloth.nearest(posed[j],posed[j+1],posed[j+2],posedN[j],posedN[j+1],posedN[j+2],.04);
  if(!hit||hit.alignment<.35||cloth.nearEdge(hit,.009))continue;
  const gap=dot(posed[j]-hit.x,posed[j+1]-hit.y,posed[j+2]-hit.z,hit.nx,hit.ny,hit.nz);
  if(gap<=.004&&gap>=-.035)covered[i]=255;
 }
 return covered;
}
export function bindGarmentGeometry(T,actor,asset,policy,fullIndex=actor.mesh.geometry.index){
 const ref=referenceSkin(T,actor),body=actor.mesh.geometry;
 const n=policy.bakeId?actor.bodyVertexCount:body.attributes.position.count;
 if(!Number.isInteger(n)||n<1||n>body.attributes.position.count)throw Error('Invalid garment body topology');
 const src=body.attributes.position.array.subarray(0,n*3),nrm=body.attributes.normal.array.subarray(0,n*3),skin=body.attributes.aSkin.array.subarray(0,n),ji=body.attributes.skinIndex.array.subarray(0,n*4),raw=body.attributes.skinWeight.array.subarray(0,n*4);
 const weights=Float32Array.from(raw,w=>w/255),posed=new Float32Array(src.length),posedN=new Float32Array(src.length);
 const boneCount=actor.bones.length,names=actor.bones.map(b=>b.name),byName=new Map(names.map((name,i)=>[name,i]));
 const groups=(policy.regions??[]).map(group=>new Set(group.map(name=>byName.get(name)).filter(i=>i!==undefined)));
 const regions=new Float32Array(n*groups.length),m=new T.Matrix4(),v=new T.Vector3(),normal=new T.Vector3();
 for(let i=0;i<n;i++){
  const j=i*3,k=i*4;blend(m,ref.matrices,ji,weights,k);
  v.fromArray(src,j).applyMatrix4(m).toArray(posed,j);normal.fromArray(nrm,j).transformDirection(m).toArray(posedN,j);
  for(let q=0;q<4;q++)for(let b=0;b<groups.length;b++)if(groups[b].has(ji[k+q]))regions[b*n+i]+=weights[k+q];
 }
 const count=asset.position.length/3,rest=asset.position.slice(),field=new Float32Array(count*boneCount),locked=new Uint8Array(count);
 let lo=Infinity,hi=-Infinity;
 for(let i=1;i<rest.length;i+=3){lo=Math.min(lo,rest[i]);hi=Math.max(hi,rest[i]);}
 const bodySurface=surface(posed,posedN,fullIndex.array,(a,b,c)=>a<n&&b<n&&c<n&&skin[a]&&skin[b]&&skin[c]&&Math.max(posed[a*3+1],posed[b*3+1],posed[c*3+1])>=lo-.10&&Math.min(posed[a*3+1],posed[b*3+1],posed[c*3+1])<=hi+.10,regions);
 const sum=new Float64Array(boneCount);
 let maxFit=0,maxDistance=0,misses=0;
 for(let i=0;i<count;i++){
  const j=i*3,x=rest[j],y=rest[j+1],z=rest[j+2],nx=asset.normal[j],ny=asset.normal[j+1],nz=asset.normal[j+2],guide=policy.guide?.(i,asset);
  const hit=bodySurface.nearest(x,y,z,nx,ny,nz,.045,guide)||bodySurface.nearest(x,y,z,nx,ny,nz,.12,guide)||bodySurface.nearest(x,y,z,nx,ny,nz,.25,guide);
  if(!hit)throw Error('No game skin surface for garment vertex '+i);
  maxDistance=Math.max(maxDistance,hit.distance);if(hit.distance>.075)misses++;
  sum.fill(0);
  for(const [id,factor] of [[hit.a,hit.u],[hit.b,hit.v],[hit.c,hit.w]])for(let q=0;q<4;q++)sum[ji[id*4+q]]+=factor*weights[id*4+q];
  locked[i]=policy.constrain?.(i,asset,sum,byName)?1:0;
  if(sum.some(w=>!Number.isFinite(w)||w< -1e-6))throw Error('Invalid garment skin weights at '+i+': '+Array.from(sum));
  for(let b=0;b<boneCount;b++)sum[b]=Math.max(0,sum[b]);
  const total=sum.reduce((a,b)=>a+b,0);
  if(!(total>1e-8))throw Error('Empty garment skin weights at '+i);
  for(let b=0;b<boneCount;b++)field[i*boneCount+b]=sum[b]/total;
  if((policy.fit?.(i,asset)??true)&&hit.distance<.035&&hit.alignment>.35){
   const gap=dot(x-hit.x,y-hit.y,z-hit.z,hit.nx,hit.ny,hit.nz),fit=Math.max(0,Math.min(.012,.0025-gap));
   rest[j]+=hit.nx*fit;rest[j+1]+=hit.ny*fit;rest[j+2]+=hit.nz*fit;maxFit=Math.max(maxFit,fit);
  }
 }
 // Compact the field before neighborhood diffusion. The graph solver's
 // cost depends on the garment's bones, not the full character skeleton.
 const active=[];
 for(let b=0;b<boneCount;b++){for(let i=0;i<count;i++)if(field[i*boneCount+b]>1e-8){active.push(b);break;}}
 const compact=new Float32Array(count*active.length);
 for(let i=0;i<count;i++)for(let b=0;b<active.length;b++)compact[i*active.length+b]=field[i*boneCount+active[b]];
 const welded=smoothField(asset.position,rest,asset.index,compact,locked,active.length,policy.smoothing??8,policy.gradientLimit??24);
 // Use eight channels only if requested and actually needed. Keeping all
 // local influences avoids discontinuities when the fourth-ranked bone changes.
 const slots=policy.maxInfluences===8&&active.length>4?8:4;
 const actual=new Uint8Array(count*slots),skinWeight=new Float32Array(count*slots);
 for(let i=0;i<count;i++){
  normalizedInfluences(compact,i*active.length,active.length,actual,skinWeight,i*slots,slots);
  for(let j=0;j<slots;j++)actual[i*slots+j]=active[actual[i*slots+j]];
 }
 const masks=new Map(),firstMasks=new Map();
 for(const part of policy.parts??[{id:'main',accept:()=>true}]){
  const allow=part.coverageAllowed?(i,p)=>part.coverageAllowed(i,p,ref,actor,asset):null;
  if(part.coverage)masks.set(part.id,coverageMask(rest,asset,posed,posedN,skin,(a,b,c)=>part.coverage(a,b,c,asset),allow));
  if(part.firstPersonCoverage)firstMasks.set(part.id,coverageMask(rest,asset,posed,posedN,skin,(a,b,c)=>part.firstPersonCoverage(a,b,c,asset),allow));
 }
 const coveredCount=[...masks.values()].reduce((sum,mask)=>sum+mask.reduce((n,v)=>n+(v?1:0),0),0);
 return assembleBinding(T,asset,policy,{rest,actual,skinWeight,slots,ref,welded,masks,firstMasks,diagnostics:{attentionJoints:ref.pivots,coveredCount,maxFit,maxDistance,misses,rigidVertices:locked.reduce((a,b)=>a+b,0),prebaked:false}});
}
// The expensive surface lookup and graph solve run only in the offline baker.
// Hydration uses the same geometry assembly path and original material data.
function assembleBinding(T,asset,policy,record){
 const {rest,actual,skinWeight,slots}=record,count=rest.length/3;
 const boneIds=[...new Set(actual.filter((_,i)=>skinWeight[i]>0))].sort((a,b)=>a-b),palette=new Map(boneIds.map((id,i)=>[id,i]));
 const joints=Uint8Array.from(actual,(id,i)=>skinWeight[i]>0?palette.get(id):0);
 const pack=(src,offset,Type)=>{const dst=new Type(count*4);for(let i=0;i<count;i++)dst.set(src.subarray(i*slots+offset,i*slots+offset+4),i*4);return dst;};
 const attributes=[['aJoint',pack(joints,0,Uint8Array),4,false],['aWeight',pack(skinWeight,0,Float32Array),4,false]];
 if(slots===8)attributes.push(['aJointExtra',pack(joints,4,Uint8Array),4,false],['aWeightExtra',pack(skinWeight,4,Float32Array),4,false]);
 const g=new T.BufferGeometry();
 for(const [name,array,size,normalized] of [['position',rest,3,false],['normal',asset.normal,3,false],...attributes,...(policy.attributes?.(asset)??[])])g.setAttribute(name,new T.BufferAttribute(array,size,normalized));
 g.setIndex(new T.BufferAttribute(asset.index,1));g.computeBoundingBox();g.computeBoundingSphere();
 const parts=new Map();
 for(const part of policy.parts??[{id:'main',accept:()=>true}]){
  const list=[];for(let i=0;i<asset.index.length;i+=3){const a=asset.index[i],b=asset.index[i+1],c=asset.index[i+2];if(part.accept(a,b,c,asset))list.push(a,b,c);}
  if(!list.length)throw Error('Empty garment part: '+part.id);
  const pg=new T.BufferGeometry();for(const [name,attr] of Object.entries(g.attributes))pg.setAttribute(name,attr);
  pg.setIndex(new T.BufferAttribute(new asset.index.constructor(list),1));pg.boundingBox=g.boundingBox.clone();pg.boundingSphere=g.boundingSphere.clone();
  parts.set(part.id,pg);
 }
 return {...record,geometry:g,parts,joints,boneIds,diagnostics:{...record.diagnostics,boneCount:boneIds.length}};
}
function unpackBake(text,Type,length){
 const raw=atob(text),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
 if(bytes.byteLength!==length*Type.BYTES_PER_ELEMENT)throw Error('Invalid garment bake buffer size');
 return new Type(bytes.buffer);
}
export function hydrateGarmentBinding(T,actor,asset,policy,bake){
 const n=actor.bodyVertexCount,count=asset.position.length/3,slots=bake.slots;
 if(bake.version!==1||bake.policy!==policy.bakeId||bake.bodyVertices!==n||bake.vertices!==count||bake.indices!==asset.index.length||![4,8].includes(slots)||JSON.stringify(bake.bones)!==JSON.stringify(actor.bones.map(b=>b.name)))throw Error('Garment bake does not match asset or rig');
 const rest=unpackBake(bake.rest,Float32Array,count*3),actual=unpackBake(bake.actual,Uint8Array,count*slots),skinWeight=unpackBake(bake.skinWeight,Float32Array,count*slots);
 if(rest.some(v=>!Number.isFinite(v))||actual.some(i=>i>=actor.bones.length)||skinWeight.some(w=>!Number.isFinite(w)||w<0||w>1.00001))throw Error('Invalid garment bake weights');
 for(let i=0;i<count;i++){let sum=0;for(let j=0;j<slots;j++)sum+=skinWeight[i*slots+j];if(Math.abs(sum-1)>1e-5)throw Error('Unnormalized garment bake weights');}
 const matrix=values=>{if(!Array.isArray(values)||values.length!==16||values.some(v=>!Number.isFinite(v)))throw Error('Invalid garment bake reference matrix');return new T.Matrix4().fromArray(values);};
 if(bake.inverseBones.length!==actor.bones.length)throw Error('Invalid garment bake bone count');
 const ref={frame:matrix(bake.frame),inverseBones:bake.inverseBones.map(matrix),pivots:bake.diagnostics.attentionJoints};
 if(!(ref.frame.elements[0]>0))throw Error('Invalid garment bake scale');
 const readMasks=entries=>new Map(Object.entries(entries).map(([id,data])=>[id,unpackBake(data,Uint8Array,n)]));
 return assembleBinding(T,asset,policy,{rest,actual,skinWeight,slots,ref,masks:readMasks(bake.masks),firstMasks:readMasks(bake.firstMasks),diagnostics:{...bake.diagnostics,prebaked:true}});
}
// Compute a conservative angular/height coverage field of an outer garment.
// Radial intersection tests work for both inward and outward overlap, so an
// inner waistband cannot poke through an outer tunic. This is a material
// coverage layer, not a modification of either garment's original geometry.
export function bakeGarmentLayer(inner,outer,{accept=()=>true,centerZ=0,margin=.006}={}){
 const ip=inner.rest,op=outer.rest,idx=outer.geometry.index.array;
 const rows=96,cols=96,lo=Math.min(...ip.filter((_,i)=>i%3===1)),hi=Math.max(...ip.filter((_,i)=>i%3===1)),height=hi-lo;
 const cells=new Float32Array(rows*cols).fill(Infinity),tris=[];
 for(let k=0;k<idx.length;k+=3){
  const a=idx[k],b=idx[k+1],c=idx[k+2];if(!accept(a,b,c))continue;
  const A=a*3,B=b*3,C=c*3;
  if(Math.max(op[A+1],op[B+1],op[C+1])<lo||Math.min(op[A+1],op[B+1],op[C+1])>hi)continue;
  tris.push([A,B,C]);
 }
 // At each height, intersect outer triangles with the horizontal plane,
 // then rasterize the resulting segments into a radial coverage table.
 for(let r=0;r<rows;r++){
  const y=lo+height*r/(rows-1),segments=[];
  for(const [a,b,c] of tris){
   const p=[];
   for(const [u,v] of [[a,b],[b,c],[c,a]]){
    const y0=op[u+1],y1=op[v+1];
    if((y0<=y&&y1>y)||(y1<=y&&y0>y)){
     const t=(y-y0)/(y1-y0);p.push([op[u]+(op[v]-op[u])*t,op[u+2]+(op[v+2]-op[u+2])*t-centerZ]);
    }
   }
   if(p.length===2)segments.push(p);
  }
  for(let c=0;c<cols;c++){
   const angle=c/cols*Math.PI*2,dx=Math.sin(angle),dz=Math.cos(angle);
   let far=0;
   for(const [[x,z],[X,Z]] of segments){
    const ux=X-x,uz=Z-z,det=dx*uz-dz*ux;if(Math.abs(det)<1e-8)continue;
    const t=(x*uz-z*ux)/det,s=(x*dz-z*dx)/det;
    if(t>0&&s>=0&&s<=1)far=Math.max(far,t);
   }
   if(far>0)cells[r*cols+c]=far;
  }
 }
 const out=new Uint8Array(ip.length/3);
 for(let i=0;i<out.length;i++){
  const x=ip[i*3],y=ip[i*3+1],z=ip[i*3+2]-centerZ,angle=(Math.atan2(x,z)+Math.PI*2)%(Math.PI*2);
  const c=Math.round(angle/(Math.PI*2)*cols)%cols,r=Math.round((y-lo)/height*(rows-1));
  const dr=Math.max(1,Math.ceil(margin/height*(rows-1))),radius=Math.hypot(x,z);
  // Only discard if the surrounding samples are all covered. Keep
  // openings/hem borders visible and allow small outward protrusion.
  let covered=r>=dr&&r<rows-dr;
  // At the top edge of the inner garment, the outer coverage is known at
  // the last row; it is safe to hide that closed waistband too.
  if(r>=dr)covered=true;
  for(let j=Math.max(0,r-dr);covered&&j<=Math.min(rows-1,r+dr);j++)for(let k=-1;k<=1;k++){
   const f=cells[j*cols+(c+k+cols)%cols];
   if(!Number.isFinite(f)||radius>f+.045){covered=false;break;}
  }
  if(covered)out[i]=255;
 }
 return out;
}

const pools=new WeakMap();
// Cache by asset, policy, constructor surface, body and reference frame.
// The same immutable vertex buffers are shared by all NPCs of a body shape.
export function acquireGarmentBinding(T,actor,asset,policy,fullIndex){
 let byPolicy=pools.get(asset);if(!byPolicy)pools.set(asset,byPolicy=new WeakMap());
 let byT=byPolicy.get(policy);if(!byT)byPolicy.set(policy,byT=new WeakMap());
 let byBody=byT.get(T);if(!byBody)byT.set(T,byBody=new WeakMap());
 let byFrame=byBody.get(actor.data);if(!byFrame)byBody.set(actor.data,byFrame=new Map());
 // Body-only garments have identical body vertex ordering across all face
 // styles. Keep the reference frame in the binding and apply that frame to
 // each actor, instead of re-fitting the entire garment for every face height.
 const key=policy.bakeId?'body:'+actor.bodyVertexCount:actor.units.toFixed(6)+':'+actor.mesh.geometry.boundingBox.min.y.toFixed(6);
 let shared=byFrame.get(key);
 if(!shared){
  let binding;
  const bake=policy.bakeId&&actor.garmentBakes?.[policy.bakeId];
  if(bake)try{binding=hydrateGarmentBinding(T,actor,asset,policy,bake);}catch(error){console.warn('Garment bake rejected: '+policy.bakeId,error);}
  shared={...(binding??bindGarmentGeometry(T,actor,asset,policy,fullIndex)),users:0};byFrame.set(key,shared);
 }
 shared.users++;
 let released=false;
 return {shared,release(){if(released)return;released=true;if(--shared.users===0){for(const g of shared.parts.values())g.dispose();shared.geometry.dispose();byFrame.delete(key);}}};
}
