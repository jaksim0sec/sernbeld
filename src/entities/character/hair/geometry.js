// HAIR-11260710/T1. Pure head-local metre geometry; no runtime mutation.
function createHairKit(){
 const add=(a,b)=>a.map((x,i)=>x+b[i]), sub=(a,b)=>a.map((x,i)=>x-b[i]), mul=(a,s)=>a.map(x=>x*s), dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0), cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]], length=a=>Math.hypot(...a);
 const norm=a=>{const l=length(a);if(!(l>1e-10))throw Error('zero vector');return mul(a,1/l);};
 const lerp=(a,b,t)=>a+(b-a)*t, rad=d=>d*Math.PI/180;
 const direction=(theta,phi)=>[Math.sin(rad(theta))*Math.sin(rad(phi)),Math.cos(rad(theta)),Math.sin(rad(theta))*Math.cos(rad(phi))];
 const validVec=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
 function mesh(p,uv,ix,seams=[],root=[]){
  const n=new Float32Array(p.length);
  for(let i=0;i<ix.length;i+=3){const ids=ix.slice(i,i+3),a=p.slice(ids[0]*3,ids[0]*3+3),b=p.slice(ids[1]*3,ids[1]*3+3),c=p.slice(ids[2]*3,ids[2]*3+3),v=cross(sub(b,a),sub(c,a));if(length(v)<1e-12)throw Error('degenerate face '+i/3);for(const id of ids)for(let j=0;j<3;j++)n[id*3+j]+=v[j];}
  for(const [a,b] of seams)for(let j=0;j<3;j++){const s=n[a*3+j]+n[b*3+j];n[a*3+j]=n[b*3+j]=s;}
  for(let i=0;i<n.length;i+=3)n.set(norm(Array.from(n.subarray(i,i+3))),i);
  return {positions:Float32Array.from(p),normals:n,uv:Float32Array.from(uv),indices:Uint32Array.from(ix),rootMask:Uint8Array.from(root.length?root:Array(p.length/3).fill(0))};
 }
 function cat(points,t){
  const u=t*(points.length-1),i=Math.min(points.length-2,Math.floor(u)),f=u-i,a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],d=points[Math.min(points.length-1,i+2)];
  return b.map((x,k)=>.5*((2*x)+(-a[k]+c[k])*f+(2*a[k]-5*x+4*c[k]-d[k])*f*f+(-a[k]+3*x-3*c[k]+d[k])*f*f*f));
 }
 function profile(values,t){const u=t*(values.length-1),i=Math.min(values.length-2,Math.floor(u));return lerp(values[i],values[i+1],u-i);}
 function loft({controlPoints,widthProfile,depthProfile,twistProfile=[0,0],crossSection='lens',rootNormal,segments=24,sides=10}){
  if(!Array.isArray(controlPoints)||controlPoints.length<2||!controlPoints.every(validVec)||!validVec(rootNormal)||!Number.isInteger(segments)||segments<2||segments>128||!Number.isInteger(sides)||sides<6||sides>32||!['lens','ellipse'].includes(crossSection))throw Error('invalid loft');
  for(const vals of [widthProfile,depthProfile,twistProfile])if(!Array.isArray(vals)||vals.length<2||!vals.every(Number.isFinite))throw Error('invalid profile');
  if([...widthProfile,...depthProfile].some(x=>x<=0))throw Error('non-positive profile');
  const p=[],uv=[],ix=[],seams=[],root=[],stride=sides+1;let prev;
  for(let i=0;i<=segments;i++){
   const t=i/segments,c=cat(controlPoints,t),tangent=norm(sub(cat(controlPoints,Math.min(1,t+.0001)),cat(controlPoints,Math.max(0,t-.0001))));
   let w=prev?sub(prev,mul(tangent,dot(prev,tangent))):cross(tangent,rootNormal);
   if(length(w)<1e-8)w=cross(tangent,Math.abs(tangent[0])<.8?[1,0,0]:[0,1,0]);
   w=norm(w);prev=w;const d=cross(w,tangent),angle=rad(profile(twistProfile,t)),ww=add(mul(w,Math.cos(angle)),mul(d,Math.sin(angle))),dd=add(mul(d,Math.cos(angle)),mul(w,-Math.sin(angle)));
   for(let j=0;j<=sides;j++){const a=2*Math.PI*(j%sides)/sides,cs=Math.cos(a),sn=Math.sin(a),shape=crossSection==='lens'?Math.sign(sn)*Math.abs(sn)**1.6:sn;
    p.push(...add(c,add(mul(ww,cs*profile(widthProfile,t)/2),mul(dd,shape*profile(depthProfile,t)/2))));uv.push(j/sides,t);root.push(i===0?1:0);
   }seams.push([i*stride,i*stride+sides]);
   if(i)for(let j=0;j<sides;j++){const a=(i-1)*stride+j,b=i*stride+j;ix.push(a,b,a+1,a+1,b,b+1);}
  }
  for(const end of [0,1]){const center=p.length/3; p.push(...controlPoints[end?controlPoints.length-1:0]);uv.push(.5,end);root.push(end?0:1);const start=end?segments*stride:0;
   for(let j=0;j<sides;j++)if(end)ix.push(center,start+j+1,start+j);else ix.push(center,start+j,start+j+1);}
  return mesh(p,uv,ix,seams,root);
 }
 function surface(positions,indices,center){
  if(!validVec(center))throw Error('invalid center');
  const triangles=[];
  for(let k=0;k<indices.length;k+=3){const [i,j,l]=Array.from(indices.slice(k,k+3)),a=Array.from(positions.slice(i*3,i*3+3)),b=Array.from(positions.slice(j*3,j*3+3)),c=Array.from(positions.slice(l*3,l*3+3)),e=sub(b,a),f=sub(c,a);if(length(cross(e,f))>1e-12)triangles.push([sub(a,center),e,f]);}
  if(!triangles.length)throw Error('empty scalp surface');
  function radius(dir){const d=norm(dir);let max=0;for(const [a,e,f] of triangles){const h=cross(d,f),det=dot(e,h);if(Math.abs(det)<1e-12)continue;const s=mul(a,-1),u=dot(s,h)/det;if(u< -1e-7||u>1+1e-7)continue;const q=cross(s,e),v=dot(d,q)/det;if(v< -1e-7||u+v>1+1e-7)continue;const t=dot(f,q)/det;if(t>max)max=t;}return max||null;}
  function anchor(theta,phi,clearance=0){const d=direction(theta,phi),r=radius(d);if(r===null)throw Error('scalp ray missed: '+theta+','+phi);return {position:add(center,mul(d,r+clearance)),normal:d,theta,phi,clearance};}
  return {positions,indices,center,radius,anchor};
 }
 function studioHead(body){
  const {data,worldPositions:p,indices:ix}=body;
  const pivot=data.bones.find(b=>b.id==='head')?.pivot?.map(v=>v/1428);if(!pivot)throw Error('missing head pivot');
  let lo=Infinity,hi=-Infinity,faceLo=Infinity,faceHi=-Infinity;for(let i=1;i<p.length;i+=3){lo=Math.min(lo,p[i]);hi=Math.max(hi,p[i]);if(i>=data.face.start*3){faceLo=Math.min(faceLo,p[i]);faceHi=Math.max(faceHi,p[i]);}}
  const units=1.76/(hi-lo),cut=faceLo;const positions=[],indices=[],map=new Map();
  function vertex(i){if(!map.has(i)){map.set(i,positions.length/3);positions.push(...[0,1,2].map(a=>(p[i*3+a]-pivot[a])*units));}return map.get(i);}
  for(let k=0;k<data.parts[0].count;k+=3){const ids=Array.from(ix.slice(k,k+3));if(ids.every(i=>p[i*3+1]>=cut-1e-6))indices.push(...ids.map(vertex));}
  if(!positions.length)throw Error('no head triangles');
  const top=(faceHi-pivot[1])*units,bottom=(faceLo-pivot[1])*units;
  let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
  for(let i=0;i<positions.length;i+=3)if(positions[i+1]>=bottom+(top-bottom)*.55){x0=Math.min(x0,positions[i]);x1=Math.max(x1,positions[i]);z0=Math.min(z0,positions[i+2]);z1=Math.max(z1,positions[i+2]);}
  const center=[(x0+x1)/2,bottom+(top-bottom)*.58,(z0+z1)/2];
  return {...surface(Float32Array.from(positions),Uint32Array.from(indices),center),units,pivot};
 }
 // Front +Z, left/right +/-X, Y up; cap and parts use the same angular anchor convention.
 function hairline(phi){const c=Math.cos(rad(phi));return c>=0?lerp(83,60,c*c):lerp(83,112,c*c);}
 function scalpCap(fit,{rings=18,sides=48,clearance=.002}={}){
  if(!Number.isInteger(rings)||rings<2||!Number.isInteger(sides)||sides<8||!Number.isFinite(clearance)||clearance<=0)throw Error('invalid cap resolution');
  const p=[...fit.anchor(0,0,clearance).position],uv=[.5,0],ix=[],seams=[],root=[];
  for(let i=1;i<=rings;i++){const start=p.length/3;for(let j=0;j<=sides;j++){const phi=360*(j%sides)/sides;p.push(...fit.anchor(hairline(phi)*i/rings,phi,clearance).position);uv.push(j/sides,i/rings);}seams.push([start,start+sides]);for(let j=0;j<sides;j++){const a=start+j;if(i===1)ix.push(0,a,a+1);else{const b=a-sides-1;ix.push(b,a,b+1,b+1,a,a+1);}}}
  return mesh(p,uv,ix,seams,root);
 }
 const slots=['front','middle','back','extra'];
 function validatePart(part){
  if(part?.version!==1||!/^hair-[a-z0-9-]+$/.test(part.id)||!slots.includes(part.slot)||!Array.isArray(part.bodies)||!part.bodies.length||!part.bodies.every(x=>['male','female'].includes(x))||typeof part.join!=='string'||!part.join||!Array.isArray(part.compatibility)||!part.compatibility.length||!part.compatibility.every(x=>typeof x==='string'&&x)||!Array.isArray(part.clumps)||!part.clumps.length||!part.material||!part.lod||!part.physics)throw Error('invalid hair part');
  for(const c of part.clumps){if(!Array.isArray(c.controlPoints)||c.controlPoints.length<2||!c.controlPoints.every(v=>validVec(v)&&v[0]>=0&&v[0]<=160&&v[2]>=0&&v[2]<=.2)||!c.rootAnchor||!Number.isFinite(c.rootAnchor.theta)||!Number.isFinite(c.rootAnchor.phi)||c.rootAnchor.theta!==c.controlPoints[0][0]||c.rootAnchor.phi!==c.controlPoints[0][1]||!Number.isInteger(c.grooves)||c.grooves<0)throw Error('invalid clump anchors');}
  return part;
 }
 function compatible(parts,body){try{if(!['male','female'].includes(body)||!parts.length)return false;parts.forEach(validatePart);return new Set(parts.map(p=>p.slot)).size===parts.length&&parts.every(p=>p.bodies.includes(body)&&p.join===parts[0].join)&&parts[0].compatibility.some(t=>parts.every(p=>p.compatibility.includes(t)));}catch{return false;}}
 function makePart(fit,part){validatePart(part);return part.clumps.map(c=>{const a=fit.anchor(...c.controlPoints[0]);const points=c.controlPoints.map(v=>fit.anchor(...v).position);return loft({...c,controlPoints:points,rootNormal:a.normal});});}
 function penetration(fit,g){let max=0,count=0,miss=0,eligible=0;for(let i=0;i<g.positions.length;i+=3){if(g.rootMask[i/3])continue;eligible++;const v=sub(Array.from(g.positions.slice(i,i+3)),fit.center),l=length(v),r=fit.radius(v);if(r===null){miss++;continue;}const depth=Math.max(0,r-l);if(depth>1e-6){count++;max=Math.max(max,depth);}}return {maxMetres:max,count,eligible,miss};}
 function signedVolume(g){let sum=0;for(let i=0;i<g.indices.length;i+=3){const a=Array.from(g.positions.slice(g.indices[i]*3,g.indices[i]*3+3)),b=Array.from(g.positions.slice(g.indices[i+1]*3,g.indices[i+1]*3+3)),c=Array.from(g.positions.slice(g.indices[i+2]*3,g.indices[i+2]*3+3));sum+=dot(a,cross(b,c))/6;}return sum;}
 return {loft,surface,studioHead,scalpCap,hairline,validatePart,compatible,makePart,penetration,signedVolume,direction};
}
export const {loft,surface,studioHead,scalpCap,hairline,validatePart,compatible,makePart,penetration,signedVolume,direction}=createHairKit();
