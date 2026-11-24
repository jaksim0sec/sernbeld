#!/usr/bin/env node
// Builds assets/models/characters/studio-v1.lod.json.gz from studio-v1.json.gz.
// Pure Node (no npm packages). Deterministic: the same input always yields the same output.
//
// The game keeps the original vertex buffers (face editing, skin weights and joint
// palettes are untouched) and only swaps in these reduced triangle lists:
//   bodies.<body>.levels[L][part]  : body/head triangles per source part, L = 0..2
//   features["mesh:primitive"][L-1]: eye/brow/mouth/ear/glasses triangles, L = 1..2
// Every level uses a subset of the previous level's vertices (progressive half-edge
// collapse), part and seam borders are locked so no cracks can open between parts.
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync,gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SOURCE='assets/models/characters/studio-v1.json.gz';
const TARGET='assets/models/characters/studio-v1.lod.json.gz';
// Below 8.5%, the body can lose visible surfaces even with the neck seam locked.
export const BODY_RATIOS=[.3,.12,.085];
export const FEATURE_RATIOS=[.4,.14];

const unpack=(encoded,Type)=>{const b=Buffer.from(encoded,'base64');return new Type(b.buffer,b.byteOffset,b.byteLength/Type.BYTES_PER_ELEMENT);};
const pack=array=>Buffer.from(array.buffer,array.byteOffset,array.byteLength).toString('base64');

class Heap{
 constructor(){this.cost=[];this.a=[];this.b=[];this.sa=[];this.sb=[];}
 get size(){return this.cost.length;}
 push(c,a,b,sa,sb){const C=this.cost,A=this.a,B=this.b,SA=this.sa,SB=this.sb;let i=C.length;C.push(c);A.push(a);B.push(b);SA.push(sa);SB.push(sb);
  while(i>0){const p=(i-1)>>1;if(C[p]<=c)break;C[i]=C[p];A[i]=A[p];B[i]=B[p];SA[i]=SA[p];SB[i]=SB[p];i=p;}
  C[i]=c;A[i]=a;B[i]=b;SA[i]=sa;SB[i]=sb;}
 pop(){const C=this.cost,A=this.a,B=this.b,SA=this.sa,SB=this.sb,top=[C[0],A[0],B[0],SA[0],SB[0]];
  const c=C.pop(),a=A.pop(),b=B.pop(),sa=SA.pop(),sb=SB.pop(),n=C.length;
  if(n){let i=0;for(;;){let l=2*i+1;if(l>=n)break;const r=l+1;if(r<n&&C[r]<C[l])l=r;if(C[l]>=c)break;C[i]=C[l];A[i]=A[l];B[i]=B[l];SA[i]=SA[l];SB[i]=SB[l];i=l;}
   C[i]=c;A[i]=a;B[i]=b;SA[i]=sa;SB[i]=sb;}
  return top;}
}

// positions: Float32Array (xyz per vertex id), indices: triangle list of vertex ids.
// Returns one index array per requested ratio (fractions of the input triangle count).
export function simplify(positions,indices,ratios,{lock=null,groups=null,protectJoints=false}={}){
 const triCount=indices.length/3;
 const local=new Map(),ids=[];
 const tri=new Int32Array(indices.length);
 for(let i=0;i<indices.length;i++){let k=local.get(indices[i]);if(k===undefined){k=ids.length;local.set(indices[i],k);ids.push(indices[i]);}tri[i]=k;}
 const n=ids.length,P=new Float64Array(n*3);
 for(let i=0;i<n;i++)for(let k=0;k<3;k++)P[i*3+k]=positions[ids[i]*3+k];
 const Q=new Float64Array(n*10),vt=Array.from({length:n},()=>[]),alive=new Uint8Array(triCount).fill(1);
 for(let t=0;t<triCount;t++){
  const a=tri[t*3],b=tri[t*3+1],c=tri[t*3+2];
  if(a===b||b===c||a===c){alive[t]=0;continue;}
  vt[a].push(t);vt[b].push(t);vt[c].push(t);
  const ux=P[b*3]-P[a*3],uy=P[b*3+1]-P[a*3+1],uz=P[b*3+2]-P[a*3+2],wx=P[c*3]-P[a*3],wy=P[c*3+1]-P[a*3+1],wz=P[c*3+2]-P[a*3+2];
  let nx=uy*wz-uz*wy,ny=uz*wx-ux*wz,nz=ux*wy-uy*wx;const len=Math.hypot(nx,ny,nz);if(!len)continue;
  const area=len*.5;nx/=len;ny/=len;nz/=len;const d=-(nx*P[a*3]+ny*P[a*3+1]+nz*P[a*3+2]);
  const q=[nx*nx,nx*ny,nx*nz,nx*d,ny*ny,ny*nz,ny*d,nz*nz,nz*d,d*d];
  for(const v of [a,b,c])for(let k=0;k<10;k++)Q[v*10+k]+=q[k]*area;
 }
 // Borders (edges with one triangle) and caller-locked vertices never move.
 const locked=new Uint8Array(n),edges=new Map();
 const ek=(a,b)=>a<b?a*n+b:b*n+a;
 for(let t=0;t<triCount;t++)if(alive[t])for(let e=0;e<3;e++){const a=tri[t*3+e],b=tri[t*3+(e+1)%3],k=ek(a,b);edges.set(k,(edges.get(k)||0)+1);}
 for(const [k,count] of edges)if(count!==2){locked[Math.floor(k/n)]=1;locked[k%n]=1;}
 if(lock)for(let i=0;i<n;i++)if(lock(ids[i]))locked[i]=1;
 const version=new Int32Array(n),removed=new Uint8Array(n);
 const err=(u,v)=>{const q=k=>Q[u*10+k]+Q[v*10+k],x=P[v*3],y=P[v*3+1],z=P[v*3+2];
  let e=q(0)*x*x+2*q(1)*x*y+2*q(2)*x*z+2*q(3)*x+q(4)*y*y+2*q(5)*y*z+2*q(6)*y+q(7)*z*z+2*q(8)*z+q(9);
  if(groups&&groups[ids[u]]!==groups[ids[v]])e=e*4+1e-9;
  return Math.max(0,e);};
 let heap=new Heap();
 const pushVertex=u=>{if(locked[u]||removed[u])return;const seen=new Set();
  for(const t of vt[u])if(alive[t])for(let e=0;e<3;e++){const v=tri[t*3+e];if(v!==u&&!seen.has(v)){seen.add(v);heap.push(err(u,v),u,v,version[u],version[v]);}}};
 for(let u=0;u<n;u++)pushVertex(u);
 let live=0;for(let t=0;t<triCount;t++)live+=alive[t];
 const targets=ratios.map(r=>Math.max(4,Math.floor(triCount*r))),out=[];
 const snapshot=()=>{const list=[];for(let t=0;t<triCount;t++)if(alive[t])list.push(ids[tri[t*3]],ids[tri[t*3+1]],ids[tri[t*3+2]]);return Uint32Array.from(list);};
 let level=0;
 const flips=(u,v)=>{
  for(const t of vt[u]){if(!alive[t])continue;const a=tri[t*3],b=tri[t*3+1],c=tri[t*3+2];if(a===v||b===v||c===v)continue;
   const p=[a,b,c].map(x=>x===u?v:x);
   const n0=normal(a,b,c),n1=normal(p[0],p[1],p[2]);
   if(n1[3]<1e-14||n0[0]*n1[0]+n0[1]*n1[1]+n0[2]*n1[2]<.25*n0[3]*n1[3])return true;}
  return false;};
 const normal=(a,b,c)=>{const ux=P[b*3]-P[a*3],uy=P[b*3+1]-P[a*3+1],uz=P[b*3+2]-P[a*3+2],wx=P[c*3]-P[a*3],wy=P[c*3+1]-P[a*3+1],wz=P[c*3+2]-P[a*3+2];
  const x=uy*wz-uz*wy,y=uz*wx-ux*wz,z=ux*wy-uy*wx;return [x,y,z,Math.hypot(x,y,z)];};
 while(level<targets.length){
  while(live<=targets[level]&&level<targets.length){
   out.push(snapshot());level++;
   if(protectJoints&&level===1){
    heap=new Heap();
    for(let u=0;u<n;u++)pushVertex(u);
   }
  }
  if(level>=targets.length||!heap.size)break;
  const [,u,v,su,sv]=heap.pop();
  if(removed[u]||removed[v]||version[u]!==su||version[v]!==sv||locked[u])continue;
  if(protectJoints&&level===0&&groups[ids[u]]!==groups[ids[v]])continue;
  // Link condition: an edge collapse may not join disjoint fans or
  // create duplicate/non-manifold faces. This protects connected shells.
  const un=new Set(),vn=new Set(),opposite=new Set();
  let incident=0;
  for(const t of vt[u])if(alive[t]){
   const face=[tri[t*3],tri[t*3+1],tri[t*3+2]];
   for(const w of face)if(w!==u)un.add(w);
   if(face.includes(v)){incident++;for(const w of face)if(w!==u&&w!==v)opposite.add(w);}
  }
  if(incident!==2||opposite.size!==2)continue;
  for(const t of vt[v])if(alive[t])for(let e=0;e<3;e++)if(tri[t*3+e]!==v)vn.add(tri[t*3+e]);
  if([...un].some(w=>w!==v&&w!==u&&vn.has(w)&&!opposite.has(w)))continue;
  if(flips(u,v))continue;
  for(const t of vt[u]){if(!alive[t])continue;const a=tri[t*3],b=tri[t*3+1],c=tri[t*3+2];
   if(a===v||b===v||c===v){alive[t]=0;live--;continue;}
   for(let e=0;e<3;e++)if(tri[t*3+e]===u)tri[t*3+e]=v;vt[v].push(t);}
  vt[u]=[];removed[u]=1;for(let k=0;k<10;k++)Q[v*10+k]+=Q[u*10+k];
  vt[v]=vt[v].filter(t=>alive[t]);
  version[v]++;const ring=new Set();for(const t of vt[v])for(let e=0;e<3;e++)ring.add(tri[t*3+e]);
  for(const w of ring){if(w!==v)version[w]++;}
  for(const w of ring)pushVertex(w);
 }
 while(out.length<targets.length)out.push(snapshot());
 return out;
}

function glbDocument(encoded){
 const bytes=Buffer.from(encoded,'base64'),jsonLength=bytes.readUInt32LE(12),binOffset=28+jsonLength;
 const doc=JSON.parse(bytes.subarray(20,20+jsonLength).toString('utf8'));
 const accessor=id=>{const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],cols={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
  const Type={5126:Float32Array,5123:Uint16Array,5125:Uint32Array}[a.componentType],start=binOffset+(v.byteOffset||0)+(a.byteOffset||0);
  return new Type(bytes.buffer.slice(bytes.byteOffset+start,bytes.byteOffset+start+a.count*cols*Type.BYTES_PER_ELEMENT));};
 return {doc,accessor};
}

export async function buildLod(source){
 const result={version:1,source:'studio-v1',bodyRatios:BODY_RATIOS,featureRatios:FEATURE_RATIOS,bodies:{},features:{}};
 for(const [name,data] of Object.entries(source.bodies)){
  const base=unpack(data.p,Int16Array),fitted=unpack(data.face.fitted,Float32Array);
  const positions=new Float32Array(Math.max(base.length,data.face.start*3+fitted.length));
  for(let i=0;i<base.length;i++)positions[i]=base[i];positions.set(fitted,data.face.start*3);
  const indices=unpack(data.f,data.indexType==='Uint32Array'?Uint32Array:Uint16Array);
  const joints=unpack(data.wi,Uint8Array),weights=unpack(data.ww,Uint8Array);
  const levels=BODY_RATIOS.map(()=>[]);
  const neck=new Uint8Array(positions.length/3);
  const neckPivot=data.bones.find(b=>b.id==='neck').pivot[1],headPivot=data.bones.find(b=>b.id==='head').pivot[1];
  // The fitted head/neck junction is authored at rimOriginal. Preserve
  // its complete one-ring plus the narrow neck articulation band.
  for(const id of data.face.rimOriginal)neck[id]=1;
  for(let v=0;v<neck.length;v++){
   const y=positions[v*3+1];
   if(y>=Math.min(neckPivot,headPivot)-38&&y<=Math.max(neckPivot,headPivot)+30)neck[v]=1;
  }
  const seam=neck.slice();
  for(let i=0;i<indices.length;i+=3){
   const a=indices[i],b=indices[i+1],c=indices[i+2];
   if(neck[a]||neck[b]||neck[c])seam[a]=seam[b]=seam[c]=1;
  }
  data.parts.forEach(part=>{
   // Keep skinning clean: collapses across different dominant joints are discouraged.
   const groups=new Int32Array(positions.length/3);
   for(let v=0;v<groups.length;v++){let best=0;for(let k=1;k<4;k++)if(weights[v*4+k]>weights[v*4+best])best=k;groups[v]=part.skin.indexOf(part.skin[joints[v*4+best]])*1;}
   const hand=part.skin.some(id=>id.startsWith('thumb_'));
   // The rigid forearm sections need more triangles than the general far mesh.
   const forearm=part.skin.length===1&&part.skin[0].startsWith('forearm_');
   const [near,mid,far]=BODY_RATIOS;
   const ratios=[hand ? .60 : near,mid,forearm ? mid : far];
   const lists=simplify(positions,indices.subarray(part.start,part.start+part.count),ratios,{groups,protectJoints:hand,lock:id=>Boolean(seam[id])});
   lists.forEach((list,i)=>levels[i].push(pack(list)));
  });
  result.bodies[name]={levels,triangles:levels.map(l=>l.reduce((s,p)=>s+Buffer.from(p,'base64').length/12,0))};
 }
 const {doc,accessor}=glbDocument(source.faceGlb);
 doc.meshes.forEach((mesh,mi)=>{
  if(mesh.extras?.eyeStyle==='common')return;
  mesh.primitives.forEach((primitive,pi)=>{
   const positions=accessor(primitive.attributes.POSITION),indices=accessor(primitive.indices);
   if(indices.length<600)return;
   result.features[mi+':'+pi]=simplify(positions,indices,FEATURE_RATIOS).map(pack);
  });
 });
 return result;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const t0=performance.now();
 const source=JSON.parse(gunzipSync(await readFile(path.join(root,SOURCE))));
 const lod=await buildLod(source);
 const json=Buffer.from(JSON.stringify(lod));
 await writeFile(path.join(root,TARGET),gzipSync(json,{level:9}));
 for(const [name,b] of Object.entries(lod.bodies))console.log(name,'triangles per level',b.triangles.join(' / '));
 console.log('features',Object.keys(lod.features).length,'written',TARGET,((performance.now()-t0)/1000).toFixed(1)+'s');
}
