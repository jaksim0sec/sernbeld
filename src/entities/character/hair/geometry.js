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
  // Exact ray/triangle tests accelerated by a median-split AABB hierarchy.
  // Bounds are relative to the same ray origin as the original brute-force code.
  const entries=triangles.map(([a,e,f])=>{const b=add(a,e),c=add(a,f);return {a,e,f,lo:a.map((x,i)=>Math.min(x,b[i],c[i])-1e-8),hi:a.map((x,i)=>Math.max(x,b[i],c[i])+1e-8)};});
  function build(items){const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const item of items)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],item.lo[k]);hi[k]=Math.max(hi[k],item.hi[k]);}
   if(items.length<=8)return {lo,hi,items};const axis=hi.map((x,i)=>x-lo[i]).reduce((best,x,i,a)=>x>a[best]?i:best,0);
   items.sort((a,b)=>a.lo[axis]+a.hi[axis]-b.lo[axis]-b.hi[axis]);const mid=items.length>>1;return {lo,hi,left:build(items.slice(0,mid)),right:build(items.slice(mid))};
  }
  const tree=build(entries),cache=new Map();
  function radius(dir){const d=norm(dir),key=d.join(',');if(cache.has(key))return cache.get(key);let max=0;
   function visit(node){let near=0,far=Infinity;for(let k=0;k<3;k++){if(Math.abs(d[k])<1e-15){if(node.lo[k]>0||node.hi[k]<0)return;continue;}let a=node.lo[k]/d[k],b=node.hi[k]/d[k];if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(far<near||far<max)return;}
    if(!node.items){visit(node.left);visit(node.right);return;}
    for(const {a,e,f} of node.items){const h=cross(d,f),det=dot(e,h);if(Math.abs(det)<1e-12)continue;const s=mul(a,-1),u=dot(s,h)/det;if(u< -1e-7||u>1+1e-7)continue;const q=cross(s,e),v=dot(d,q)/det;if(v< -1e-7||u+v>1+1e-7)continue;const t=dot(f,q)/det;if(t>max)max=t;}
   }
   visit(tree);const result=max||null;if(cache.size<20000)cache.set(key,result);return result;
  }
  function anchor(theta,phi,clearance=0){const d=direction(theta,phi),r=radius(d);if(r===null)throw Error('scalp ray missed: '+theta+','+phi);return {position:add(center,mul(d,r+clearance)),normal:d,theta,phi,clearance};}
  return {positions,indices,center,radius,anchor};
 }
 function studioHead(body){
  const {data,worldPositions:p,indices:ix}=body;
  const pivot=data.bones.find(b=>b.id==='head')?.pivot?.map(v=>v/1428);if(!pivot)throw Error('missing head pivot');
  let lo=Infinity,hi=-Infinity,faceLo=Infinity,faceHi=-Infinity;for(let i=1;i<p.length;i+=3){lo=Math.min(lo,p[i]);hi=Math.max(hi,p[i]);if(i>=data.face.start*3){faceLo=Math.min(faceLo,p[i]);faceHi=Math.max(faceHi,p[i]);}}
  const units=1.76/(hi-lo),cut=faceLo;const positions=[],normals=[],indices=[],map=new Map();
  function vertex(i){if(!map.has(i)){map.set(i,positions.length/3);positions.push(...[0,1,2].map(a=>(p[i*3+a]-pivot[a])*units));if(body.normals)normals.push(...body.normals.subarray(i*3,i*3+3));}return map.get(i);}
  for(let k=0;k<data.parts[0].count;k+=3){const ids=Array.from(ix.slice(k,k+3));if(ids.every(i=>p[i*3+1]>=cut-1e-6))indices.push(...ids.map(vertex));}
  if(!positions.length)throw Error('no head triangles');
  const top=(faceHi-pivot[1])*units,bottom=(faceLo-pivot[1])*units;
  let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
  for(let i=0;i<positions.length;i+=3)if(positions[i+1]>=bottom+(top-bottom)*.55){x0=Math.min(x0,positions[i]);x1=Math.max(x1,positions[i]);z0=Math.min(z0,positions[i+2]);z1=Math.max(z1,positions[i+2]);}
  const center=[(x0+x1)/2,bottom+(top-bottom)*.58,(z0+z1)/2];
  return {...surface(Float32Array.from(positions),Uint32Array.from(indices),center),units,pivot,...(normals.length?{normals:Float32Array.from(normals)}:{})};
 }
 // Front +Z, left/right +/-X, Y up; cap and parts use the same angular anchor convention.
 function hairline(phi){const c=Math.cos(rad(phi));return c>=0?lerp(83,60,c*c):lerp(83,112,c*c);}
 function scalpCap(fit,{rings=18,sides=48,clearance=.002}={}){
  if(!Number.isInteger(rings)||rings<2||!Number.isInteger(sides)||sides<8||!Number.isFinite(clearance)||clearance<=0)throw Error('invalid cap resolution');
  const p=[...fit.anchor(0,0,clearance).position],uv=[.5,0],ix=[],seams=[],root=[];
  for(let i=1;i<=rings;i++){const start=p.length/3;for(let j=0;j<=sides;j++){const phi=360*(j%sides)/sides;p.push(...fit.anchor(hairline(phi)*i/rings,phi,clearance).position);uv.push(j/sides,i/rings);}seams.push([start,start+sides]);for(let j=0;j<sides;j++){const a=start+j;if(i===1)ix.push(0,a,a+1);else{const b=a-sides-1;ix.push(b,a,b+1,b+1,a,a+1);}}}
  return mesh(p,uv,ix,seams,root);
 }
 // Continuous front root panel, not the full scalp cap. It ends at the
 // frontal hairline, leaving the unbuilt side/back deliberately bare.
 function frontFoundation(fit,{rings=18,sides=36}={}){
  const p=[...fit.anchor(0,0,.006).position],uv=[.5,0],ix=[];
  for(let i=1;i<=rings;i++){const t=i/rings,start=p.length/3;
   for(let j=0;j<=sides;j++){const u=j/sides,phi=-81+162*u,edge=Math.abs(u*2-1);
    const end=75+9*edge,theta=t*end,clearance=.006+.002*Math.sin(Math.PI*t)*(1-edge*.5);
    p.push(...fit.anchor(theta,phi,clearance).position);uv.push(u,t);
   }
   for(let j=0;j<sides;j++){const a=start+j;if(i===1)ix.push(0,a,a+1);else{const b=a-sides-1;ix.push(b,a,b+1,b+1,a,a+1);}}
  }return mesh(p,uv,ix);
 }
 const slots=['front','middle','back','extra'];
 function validatePart(part){
  if(part?.version!==1||!/^hair-[a-z0-9-]+$/.test(part.id)||!slots.includes(part.slot)||!Array.isArray(part.bodies)||!part.bodies.length||!part.bodies.every(x=>['male','female'].includes(x))||typeof part.join!=='string'||!part.join||!Array.isArray(part.compatibility)||!part.compatibility.length||!part.compatibility.every(x=>typeof x==='string'&&x)||!Array.isArray(part.clumps)||!part.clumps.length||!part.material||!part.lod||!part.physics)throw Error('invalid hair part');
  for(const c of part.clumps){if(!Array.isArray(c.controlPoints)||c.controlPoints.length<2||!c.controlPoints.every(v=>validVec(v)&&v[0]>=0&&v[0]<=160&&v[2]>=0&&v[2]<=.2)||!c.rootAnchor||!Number.isFinite(c.rootAnchor.theta)||!Number.isFinite(c.rootAnchor.phi)||c.rootAnchor.theta!==c.controlPoints[0][0]||c.rootAnchor.phi!==c.controlPoints[0][1]||!Number.isInteger(c.grooves)||c.grooves<0)throw Error('invalid clump anchors');}
  return part;
 }
 function compatible(parts,body){try{if(!['male','female'].includes(body)||!parts.length)return false;parts.forEach(validatePart);return new Set(parts.map(p=>p.slot)).size===parts.length&&parts.every(p=>p.bodies.includes(body)&&p.join===parts[0].join)&&parts[0].compatibility.some(t=>parts.every(p=>p.compatibility.includes(t)));}catch{return false;}}
 function ribbon(fit,c){
  const p=[],uv=[],ix=[],seams=[],root=[],segments=22,sides=8,stride=sides+1;
  for(let i=0;i<=segments;i++){
   const t=i/segments, [theta,phi,clearance]=cat(c.controlPoints,t),width=profile(c.angularWidth,t),depth=profile(c.depthProfile,t);
   for(let k=0;k<=sides;k++){
    const a=2*Math.PI*(k%sides)/sides,side=Math.cos(a),outer=Math.sin(a);
    const angle=phi+side*width/2, polar=Math.max(1,theta+side*c.sweep*Math.sin(Math.PI*t)-(c.tipCut??0)*Math.abs(side)*Math.max(0,(t-.7)/.3)**2);
    // Follow the actual skull through the crown; below the ear line extend the lock
    // from a measured surface anchor instead of projecting it onto the cheek/neck.
    const limit=c.surfaceLimit??112, at=Math.min(polar,limit), anchor=fit.anchor(at,angle,0);
    const extension=Math.max(0,polar-limit)*Math.PI/180*fit.radius(direction(at,angle));
    const point=add(anchor.position,mul(anchor.normal,clearance+outer*depth/2));
    point[1]-=extension;p.push(...point);uv.push(k/sides,t);root.push(i===0?1:0);
   }
   seams.push([i*stride,i*stride+sides]);
   if(i)for(let k=0;k<sides;k++){const a=(i-1)*stride+k,b=i*stride+k;ix.push(a,b,a+1,a+1,b,b+1);}
  }
  for(const end of [0,1]){const start=end?segments*stride:0,center=p.length/3,avg=[0,0,0];for(let k=0;k<sides;k++)for(let a=0;a<3;a++)avg[a]+=p[(start+k)*3+a]/sides;p.push(...avg);uv.push(.5,end);root.push(end?0:1);for(let k=0;k<sides;k++)if(end)ix.push(center,start+k+1,start+k);else ix.push(center,start+k,start+k+1);}
  let result=mesh(p,uv,ix,seams,root);if(signedVolume(result)<0){for(let i=0;i<ix.length;i+=3)[ix[i+1],ix[i+2]]=[ix[i+2],ix[i+1]];result=mesh(p,uv,ix,seams,root);}return result;
 }
 // Detail pass on the existing parent lock: carve its terminal envelope and
 // longitudinal relief in its own surface coordinates; do not add leaf meshes.
 function detailedRibbon(fit,c){
  const d=c.detail,rows=32,cols=28;
  const p=[],uv=[],ix=[],root=[],outer=[],inner=[];
  const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  const sample=(keys,u)=>{let i=1;while(i<keys.length-1&&u>keys[i][0])i++;const a=keys[i-1],b=keys[i];return lerp(a[1],b[1],smooth((u-a[0])/(b[0]-a[0])));};
  function addVertex(u,q,side){
   const end=sample(d.hem,u),tail=smooth((q-d.start)/(1-d.start)),t=q-(1-end)*tail;
   const [theta,phi,clearance]=cat(c.controlPoints,t),width=profile(c.angularWidth,t),depth=profile(c.depthProfile,t);
   const angle=phi+u*width/2+sample(d.bend,u)*tail;
   const polar=Math.max(1,theta+u*c.sweep*Math.sin(Math.PI*t)-(c.tipCut??0)*Math.abs(u)*Math.max(0,(t-.7)/.3)**2);
   const limit=c.surfaceLimit??112,at=Math.min(polar,limit),anchor=fit.anchor(at,angle,0);
   const extension=Math.max(0,polar-limit)*Math.PI/180*fit.radius(direction(at,angle));
   const round=Math.sqrt(Math.max(0,1-u*u));
   let relief=0;
   if(side>0)for(const groove of d.grooves){
    const center=groove.u+groove.drift*(1-q),fade=smooth((q-groove.start)/.20);
    relief+=groove.depth*fade*Math.exp(-Math.pow((u-center)/groove.width,2))*round;
   }
   // Preserve the root volume and make the cut ends thinner, not blunt slabs.
   const thinning=1-.64*smooth((q-.80)/.20);
   const radial=clearance+side*round*depth/2*thinning-relief;
   const point=add(anchor.position,mul(anchor.normal,radial));point[1]-=extension;
   const id=p.length/3;p.push(...point);uv.push(side>0?Math.acos(u)/(2*Math.PI):1-Math.acos(u)/(2*Math.PI),t);root.push(q===0?1:0);return id;
  }
  for(let i=0;i<=rows;i++){
   const q=i/rows,a=[],b=[];
   for(let k=0;k<=cols;k++){const u=2*k/cols-1,id=addVertex(u,q,1);a.push(id);b.push(k===0||k===cols?id:addVertex(u,q,-1));}
   outer.push(a);inner.push(b);
   if(i)for(let k=0;k<cols;k++){
    const A=outer[i-1],B=a,C=inner[i-1],D=b;
    ix.push(A[k],B[k],A[k+1],A[k+1],B[k],B[k+1],C[k],C[k+1],D[k],C[k+1],D[k+1],D[k]);
   }
  }
  // Weld lateral edges and close root/end. At the corner one triangle collapses
  // topologically (shared index), so emit only three-distinct-index faces.
  function tri(a,b,c){if(a!==b&&b!==c&&a!==c)ix.push(a,b,c);}
  for(let k=0;k<cols;k++){
   const A=outer[0],B=inner[0],C=outer[rows],D=inner[rows];
   tri(A[k],A[k+1],B[k]);tri(A[k+1],B[k+1],B[k]);
   tri(C[k],D[k],C[k+1]);tri(C[k+1],D[k],D[k+1]);
  }
  let result=mesh(p,uv,ix,[],root);
  if(signedVolume(result)<0){for(let i=0;i<ix.length;i+=3)[ix[i+1],ix[i+2]]=[ix[i+2],ix[i+1]];result=mesh(p,uv,ix,[],root);}
  result.detail={rows,cols,trim:d.hem.map(([u,end])=>({u,end}))};return result;
 }
 function makePart(fit,part){validatePart(part);return part.clumps.map(c=>{if(c.detail)return detailedRibbon(fit,c);if(c.angularWidth)return ribbon(fit,c);const a=fit.anchor(...c.controlPoints[0]);const points=c.controlPoints.map(v=>fit.anchor(...v).position);return loft({...c,controlPoints:points,rootNormal:a.normal});});}
 function penetration(fit,g){let max=0,count=0,miss=0,eligible=0;for(let i=0;i<g.positions.length;i+=3){if(g.rootMask[i/3])continue;eligible++;const v=sub(Array.from(g.positions.slice(i,i+3)),fit.center),l=length(v),r=fit.radius(v);if(r===null){miss++;continue;}const depth=Math.max(0,r-l);if(depth>1e-6){count++;max=Math.max(max,depth);}}return {maxMetres:max,count,eligible,miss};}
 function signedVolume(g){let sum=0;for(let i=0;i<g.indices.length;i+=3){const a=Array.from(g.positions.slice(g.indices[i]*3,g.indices[i]*3+3)),b=Array.from(g.positions.slice(g.indices[i+1]*3,g.indices[i+1]*3+3)),c=Array.from(g.positions.slice(g.indices[i+2]*3,g.indices[i+2]*3+3));sum+=dot(a,cross(b,c))/6;}return sum;}
 return {loft,surface,studioHead,scalpCap,frontFoundation,hairline,validatePart,compatible,makePart,penetration,signedVolume,direction};
}
export const {loft,surface,studioHead,scalpCap,frontFoundation,hairline,validatePart,compatible,makePart,penetration,signedVolume,direction}=createHairKit();
