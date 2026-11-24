import {attentionRotations} from '../attention-pose.js';

// Bind the approved cloth in its foot-anchored attention pose to the actual
// game skin. The reference viewer's two-joint rig is not the game skeleton.
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
 const matrices=actor.bones.map((bone,i)=>{
  const p=actor.data.bones[i].pivot;
  return frame.clone().multiply(rest(bone)).multiply(new T.Matrix4().makeTranslation(-p[0]/1428,-p[1]/1428,-p[2]/1428));
 });
 const names=['upper_arm_right','forearm_right','upper_arm_left','forearm_left'];
 const pivots=names.map(name=>new T.Vector3().setFromMatrixPosition(frame.clone().multiply(rest(actor.B[name]))).toArray());
 return {matrices,pivots};
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
function surface(p,n,index,valid,arms=null,trackEdges=false){
 const cells=new Map(),tri=[],edges=trackEdges?new Map():null;
 const edge=(a,b)=>Math.min(a,b)*65536+Math.max(a,b);
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
 function nearest(x,y,z,nx,ny,nz,r,arm=-1,amount=0){
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
    if(arms&&arm>=0){const influence=arms[a*2+arm]*u+arms[b*2+arm]*v+arms[c*2+arm]*w;score+=.0016*Math.max(0,amount-influence)**2;}
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
export function bindShirtGeometry(T,actor,asset){
 const ref=referenceSkin(T,actor),body=actor.mesh.geometry,src=body.attributes.position.array,nrm=body.attributes.normal.array,skin=body.attributes.aSkin.array,ji=body.attributes.skinIndex.array,raw=body.attributes.skinWeight.array,n=src.length/3;
 const weights=Float32Array.from(raw,w=>w/255),posed=new Float32Array(src.length),posedN=new Float32Array(src.length),arms=new Float32Array(n*2);
 const m=new T.Matrix4(),v=new T.Vector3(),normal=new T.Vector3();
 const fore=['right','left'].map(side=>actor.bones.findIndex(b=>b.name==='forearm_'+side));
 const armSide=actor.bones.map(b=>/arm|hand|thumb|index|middle|ring|pinky/.test(b.name)?b.name.endsWith('_right')?0:b.name.endsWith('_left')?1:-1:-1);
 // Body attributes remain unchanged; this temporary geometry is only for binding.
 for(let i=0;i<n;i++){
  const j=i*3,k=i*4;blend(m,ref.matrices,ji,weights,k);
  v.fromArray(src,j).applyMatrix4(m).toArray(posed,j);normal.fromArray(nrm,j).transformDirection(m).toArray(posedN,j);
  for(let q=0;q<4;q++){const s=armSide[ji[k+q]];if(s>=0)arms[i*2+s]+=weights[k+q];}
 }
 const count=asset.position.length/3,rest=asset.position.slice(),position=new Float32Array(rest.length),normals=new Float32Array(rest.length),indices=new Uint8Array(count*4),skinWeight=new Float32Array(count*4);
 let lo=Infinity,hi=-Infinity;for(let i=1;i<rest.length;i+=3){lo=Math.min(lo,rest[i]);hi=Math.max(hi,rest[i]);}
 const bodySurface=surface(posed,posedN,body.index.array,(a,b,c)=>skin[a]&&skin[b]&&skin[c]&&Math.max(posed[a*3+1],posed[b*3+1],posed[c*3+1])>=lo-.10&&Math.min(posed[a*3+1],posed[b*3+1],posed[c*3+1])<=hi+.10,arms);
 const sum=new Float64Array(actor.bones.length);
 let maxFit=0,maxDistance=0,misses=0;
 for(let i=0;i<count;i++){
  const j=i*3,k=i*4,x=rest[j],y=rest[j+1],z=rest[j+2],nx=asset.normal[j],ny=asset.normal[j+1],nz=asset.normal[j+2],side=asset.influence[k+2],amount=asset.influence[k]/255,kind=asset.influence[k+3];
  const hit=bodySurface.nearest(x,y,z,nx,ny,nz,.045,side,amount)||bodySurface.nearest(x,y,z,nx,ny,nz,.12,side,amount)||bodySurface.nearest(x,y,z,nx,ny,nz,.25,side,amount);
  if(!hit)throw Error('No game skin surface for shirt vertex '+i);
  maxDistance=Math.max(maxDistance,hit.distance);if(hit.distance>.075)misses++;
  sum.fill(0);
  for(const [id,factor] of [[hit.a,hit.u],[hit.b,hit.v],[hit.c,hit.w]])for(let q=0;q<4;q++){
   let bone=ji[id*4+q];
   // The cuff belongs to the forearm, not the individually bending fingers.
   if(kind===1&&/hand|thumb|index|middle|ring|pinky/.test(actor.bones[bone].name)&&armSide[bone]===side)bone=fore[side];
   sum[bone]+=factor*weights[id*4+q];
  }
  let total=0;
  for(let q=0;q<4;q++){let best=0,id=0;for(let b=0;b<sum.length;b++)if(sum[b]>best){best=sum[b];id=b;}indices[k+q]=id;skinWeight[k+q]=best;total+=best;sum[id]=0;}
  if(total<1e-8)throw Error('No game skin weights for shirt vertex '+i);
  for(let q=0;q<4;q++)skinWeight[k+q]/=total;
  // Minimal rest-pose clearance only where the real skin intersects the cloth.
  // Preserve the authored collar and button surfaces.
  if(kind<2&&hit.distance<.035&&hit.alignment>.35){
   const gap=dot(x-hit.x,y-hit.y,z-hit.z,hit.nx,hit.ny,hit.nz),fit=Math.max(0,Math.min(.012,.0025-gap));
   rest[j]+=hit.nx*fit;rest[j+1]+=hit.ny*fit;rest[j+2]+=hit.nz*fit;maxFit=Math.max(maxFit,fit);
  }
  // Invert the same blended attention transform that the game uses. At
  // attention the result reconstructs the approved cloth (plus tiny clearance).
  blend(m,ref.matrices,indices,skinWeight,k);if(Math.abs(m.determinant())<1e-10)throw Error('Singular shirt bind');
  m.invert();v.fromArray(rest,j).applyMatrix4(m).toArray(position,j);normal.set(nx,ny,nz).transformDirection(m).toArray(normals,j);
 }
 // Mask only skin actually beneath the shirt surface in attention pose,
 // leaving the neck, hands and hem openings untouched. No source mesh edits.
 const covered=new Uint8Array(n),cloth=surface(rest,asset.normal,asset.index,(a,b,c)=>Math.max(a,b,c)<asset.meta.shirtVertices,null,true);
 let coveredCount=0;
 for(let i=0;i<n;i++){
  const j=i*3;if(!skin[i]||posed[j+1]<lo||posed[j+1]>hi)continue;
  const hit=cloth.nearest(posed[j],posed[j+1],posed[j+2],posedN[j],posedN[j+1],posedN[j+2],.04);
  if(!hit||hit.alignment<.35||cloth.nearEdge(hit,.009))continue;
  const gap=dot(posed[j]-hit.x,posed[j+1]-hit.y,posed[j+2]-hit.z,hit.nx,hit.ny,hit.nz);
  if(gap>.012)continue;
  covered[i]=255;coveredCount++;
 }
 const g=new T.BufferGeometry();
 for(const [name,array,size,normalized] of [['position',position,3,false],['normal',normals,3,false],['aRest',asset.position,3,false],['aColor',asset.color,3,true],['aDetail',asset.detail,4,false],['aInfluence',asset.influence,4,false],['skinIndex',indices,4,false],['skinWeight',skinWeight,4,false]])g.setAttribute(name,new T.BufferAttribute(array,size,normalized));
 g.setIndex(new T.BufferAttribute(asset.index,1));g.computeBoundingBox();g.computeBoundingSphere();
 return {geometry:g,covered,rest,diagnostics:{attentionJoints:ref.pivots,coveredCount,maxFit,maxDistance,misses}};
}
