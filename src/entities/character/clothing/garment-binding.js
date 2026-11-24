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
 const rotations=attentionRotations(actor.data.bones),world=new Map(),frame=new T.Matrix4().compose(new T.Vector3(0,-actor.mesh.geometry.boundingBox.min.y*actor.units,0),new T.Quaternion(),new T.Vector3().setScalar(actor.units));
 function rest(bone){
  if(world.has(bone.name))return world.get(bone.name);
  const q=new T.Quaternion(),r=rotations[bone.name];
  if(r)q.setFromRotationMatrix(new T.Matrix4().fromArray([r[0],r[1],r[2],0,r[3],r[4],r[5],0,r[6],r[7],r[8],0,0,0,0,1]));
  const local=new T.Matrix4().compose(actor.rest[bone.name],q,new T.Vector3(1,1,1));
  const m=bone.parent?.isBone?rest(bone.parent).clone().multiply(local):local;
  world.set(bone.name,m);return m;
 }
 const referenceBones=actor.bones.map(bone=>frame.clone().multiply(rest(bone)));
 const matrices=actor.bones.map((bone,i)=>{
  const p=actor.data.bones[i].pivot;
  return referenceBones[i].clone().multiply(new T.Matrix4().makeTranslation(-p[0]/1428,-p[1]/1428,-p[2]/1428));
 });
 const names=['upper_arm_right','forearm_right','upper_arm_left','forearm_left'];
 const pivots=names.map(name=>new T.Vector3().setFromMatrixPosition(frame.clone().multiply(rest(actor.B[name]))).toArray());
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
    const a=tri[id*3],b=tri[id*3+1],c=tri[id*3+2],d=closest(p,a,b,c,x,y,z,scratch);if(d>r2||d>best)continue;
    const [u,v,w]=scratch;
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
function smoothField(position,index,field,locked,boneCount,passes){
 const n=position.length/3,ids=new Int32Array(n),lookup=new Map(),groups=[],adj=[];
 for(let i=0;i<n;i++){
  const k=i*3,key=[0,1,2].map(j=>Math.round(position[k+j]*100000)).join(':');
  let id=lookup.get(key);if(id===undefined){id=groups.length;lookup.set(key,id);groups.push([]);adj.push(new Set());}
  ids[i]=id;groups[id].push(i);
 }
 for(let i=0;i<index.length;i+=3){const a=ids[index[i]],b=ids[index[i+1]],c=ids[index[i+2]];for(const [u,v] of [[a,b],[b,c],[c,a]])if(u!==v){adj[u].add(v);adj[v].add(u);}}
 const count=groups.length,base=new Float32Array(count*boneCount),fixed=new Uint8Array(count);
 groups.forEach((members,i)=>{
  const hard=members.filter(j=>locked[j]),source=hard.length?hard:members;fixed[i]=hard.length?1:0;
  for(const j of source)for(let b=0;b<boneCount;b++)base[i*boneCount+b]+=field[j*boneCount+b]/source.length;
 });
 let prev=base.slice(),next=new Float32Array(prev.length);
 for(let pass=0;pass<passes;pass++){
  for(let i=0;i<count;i++){
   const o=i*boneCount,neighbors=adj[i],w=neighbors.size;
   if(fixed[i]||!w){next.set(base.subarray(o,o+boneCount),o);continue;}
   for(let b=0;b<boneCount;b++){
    let sum=0;for(const j of neighbors)sum+=prev[j*boneCount+b];
    next[o+b]=base[o+b]*.22+prev[o+b]*.18+sum*.60/w;
   }
  }
  [prev,next]=[next,prev];
 }
 for(let i=0;i<n;i++){const o=ids[i]*boneCount;field.set(prev.subarray(o,o+boneCount),i*boneCount);}
 return ids;
}
function normalizedTop4(field,offset,boneCount,indices,weights,k){
 let sum=0;
 const best=[-1,-1,-1,-1],value=[0,0,0,0];
 for(let b=0;b<boneCount;b++){
  const w=field[offset+b];if(w<=value[3])continue;
  let j=3;while(j>0&&w>value[j-1]){value[j]=value[j-1];best[j]=best[j-1];j--;}
  value[j]=w;best[j]=b;
 }
 for(const w of value)sum+=w;
 if(!(sum>1e-8))throw Error('Garment vertex has no bone influence');
 for(let j=0;j<4;j++){indices[k+j]=Math.max(0,best[j]);weights[k+j]=value[j]/sum;}
}
function coverageMask(rest,asset,posed,posedN,skin,accept){
 const n=posed.length/3,covered=new Uint8Array(n);
 if(!accept)return covered;
 const cloth=surface(rest,asset.normal,asset.index,accept,null,true);
 let lo=Infinity,hi=-Infinity;
 for(let i=1;i<rest.length;i+=3){lo=Math.min(lo,rest[i]);hi=Math.max(hi,rest[i]);}
 for(let i=0;i<n;i++){
  const j=i*3;if(!skin[i]||posed[j+1]<lo||posed[j+1]>hi)continue;
  const hit=cloth.nearest(posed[j],posed[j+1],posed[j+2],posedN[j],posedN[j+1],posedN[j+2],.04);
  if(!hit||hit.alignment<.35||cloth.nearEdge(hit,.009))continue;
  const gap=dot(posed[j]-hit.x,posed[j+1]-hit.y,posed[j+2]-hit.z,hit.nx,hit.ny,hit.nz);
  if(gap<=.012)covered[i]=255;
 }
 return covered;
}
export function bindGarmentGeometry(T,actor,asset,policy,fullIndex=actor.mesh.geometry.index){
 const ref=referenceSkin(T,actor),body=actor.mesh.geometry,src=body.attributes.position.array,nrm=body.attributes.normal.array,skin=body.attributes.aSkin.array,ji=body.attributes.skinIndex.array,raw=body.attributes.skinWeight.array,n=src.length/3;
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
 const bodySurface=surface(posed,posedN,fullIndex.array,(a,b,c)=>skin[a]&&skin[b]&&skin[c]&&Math.max(posed[a*3+1],posed[b*3+1],posed[c*3+1])>=lo-.10&&Math.min(posed[a*3+1],posed[b*3+1],posed[c*3+1])<=hi+.10,regions);
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
  const total=sum.reduce((a,b)=>a+b,0);
  if(!(total>1e-8)||sum.some(w=>!Number.isFinite(w)||w<0))throw Error('Invalid garment skin weights at '+i);
  for(let b=0;b<boneCount;b++)field[i*boneCount+b]=sum[b]/total;
  if((policy.fit?.(i,asset)??true)&&hit.distance<.035&&hit.alignment>.35){
   const gap=dot(x-hit.x,y-hit.y,z-hit.z,hit.nx,hit.ny,hit.nz),fit=Math.max(0,Math.min(.012,.0025-gap));
   rest[j]+=hit.nx*fit;rest[j+1]+=hit.ny*fit;rest[j+2]+=hit.nz*fit;maxFit=Math.max(maxFit,fit);
  }
 }
 // A single field across the whole garment ensures matching seam transforms.
 const welded=smoothField(asset.position,asset.index,field,locked,boneCount,policy.smoothing??8);
 // Clearance is also a continuous seam attribute. Different source normals
 // on duplicated seam vertices must not produce a visible crack.
 const seam=new Map();
 for(let i=0;i<count;i++){const id=welded[i],j=i*3;let s=seam.get(id);if(!s)seam.set(id,s=[0,0,0,0]);s[0]+=rest[j];s[1]+=rest[j+1];s[2]+=rest[j+2];s[3]++;}
 for(let i=0;i<count;i++){const s=seam.get(welded[i]);if(s[3]>1)for(let j=0;j<3;j++)rest[i*3+j]=s[j]/s[3];}
 const actual=new Uint8Array(count*4),skinWeight=new Float32Array(count*4);
 for(let i=0;i<count;i++)normalizedTop4(field,i*boneCount,boneCount,actual,skinWeight,i*4);
 const boneIds=[...new Set(actual.filter((_,i)=>skinWeight[i]>0))].sort((a,b)=>a-b),palette=new Map(boneIds.map((id,i)=>[id,i]));
 const joints=Uint8Array.from(actual,(id,i)=>skinWeight[i]>0?palette.get(id):0);
 // Keep reference-space positions intact. Runtime dual-quaternion blending
 // avoids inverse blended LBS matrices and preserves rigid cuffs under twist.
 const g=new T.BufferGeometry();
 for(const [name,array,size,normalized] of [['position',rest,3,false],['normal',asset.normal,3,false],['aJoint',joints,4,false],['aWeight',skinWeight,4,false],...(policy.attributes?.(asset)??[])])g.setAttribute(name,new T.BufferAttribute(array,size,normalized));
 g.setIndex(new T.BufferAttribute(asset.index,1));g.computeBoundingBox();g.computeBoundingSphere();
 const parts=new Map(),masks=new Map(),firstMasks=new Map();
 for(const part of policy.parts??[{id:'main',accept:()=>true}]){
  const list=[];for(let i=0;i<asset.index.length;i+=3){const a=asset.index[i],b=asset.index[i+1],c=asset.index[i+2];if(part.accept(a,b,c,asset))list.push(a,b,c);}
  if(!list.length)throw Error('Empty garment part: '+part.id);
  const pg=new T.BufferGeometry();for(const [name,attr] of Object.entries(g.attributes))pg.setAttribute(name,attr);
  pg.setIndex(new T.BufferAttribute(new asset.index.constructor(list),1));pg.boundingBox=g.boundingBox.clone();pg.boundingSphere=g.boundingSphere.clone();
  parts.set(part.id,pg);
  if(part.coverage)masks.set(part.id,coverageMask(rest,asset,posed,posedN,skin,(a,b,c)=>part.coverage(a,b,c,asset)));
  if(part.firstPersonCoverage)firstMasks.set(part.id,coverageMask(rest,asset,posed,posedN,skin,(a,b,c)=>part.firstPersonCoverage(a,b,c,asset)));
 }
 const coveredCount=[...masks.values()].reduce((sum,mask)=>sum+mask.reduce((n,v)=>n+(v?1:0),0),0);
 return {geometry:g,parts,masks,firstMasks,rest,actual,skinWeight,boneIds,ref,welded,diagnostics:{attentionJoints:ref.pivots,coveredCount,maxFit,maxDistance,misses,boneCount:boneIds.length,rigidVertices:locked.reduce((a,b)=>a+b,0)}};
}
const pools=new WeakMap();
// Cache by asset, policy, constructor surface, body and reference frame.
// The same immutable vertex buffers are shared by all NPCs of a body shape.
export function acquireGarmentBinding(T,actor,asset,policy,fullIndex){
 let byPolicy=pools.get(asset);if(!byPolicy)pools.set(asset,byPolicy=new WeakMap());
 let byT=byPolicy.get(policy);if(!byT)byPolicy.set(policy,byT=new WeakMap());
 let byBody=byT.get(T);if(!byBody)byT.set(T,byBody=new WeakMap());
 let byFrame=byBody.get(actor.data);if(!byFrame)byBody.set(actor.data,byFrame=new Map());
 const key=actor.units.toFixed(6)+':'+actor.mesh.geometry.boundingBox.min.y.toFixed(6);
 let shared=byFrame.get(key);if(!shared){shared={...bindGarmentGeometry(T,actor,asset,policy,fullIndex),users:0};byFrame.set(key,shared);}
 shared.users++;
 let released=false;
 return {shared,release(){if(released)return;released=true;if(--shared.users===0){for(const g of shared.parts.values())g.dispose();shared.geometry.dispose();byFrame.delete(key);}}};
}
