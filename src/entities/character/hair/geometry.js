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
  if(!Array.isArray(controlPoints)||controlPoints.length<2||!controlPoints.every(validVec)||!validVec(rootNormal)||!Number.isInteger(segments)||segments<2||segments>128||!Number.isInteger(sides)||sides<6||sides>32||!['lens','ellipse','sculpted'].includes(crossSection))throw Error('invalid loft');
  for(const vals of [widthProfile,depthProfile,twistProfile])if(!Array.isArray(vals)||vals.length<2||!vals.every(Number.isFinite))throw Error('invalid profile');
  if([...widthProfile,...depthProfile].some(x=>x<=0))throw Error('non-positive profile');
  const p=[],uv=[],ix=[],seams=[],root=[],stride=sides+1;let prev;
  for(let i=0;i<=segments;i++){
   const t=i/segments,c=cat(controlPoints,t),tangent=norm(sub(cat(controlPoints,Math.min(1,t+.0001)),cat(controlPoints,Math.max(0,t-.0001))));
   let w=prev?sub(prev,mul(tangent,dot(prev,tangent))):cross(tangent,rootNormal);
   if(length(w)<1e-8)w=cross(tangent,Math.abs(tangent[0])<.8?[1,0,0]:[0,1,0]);
   w=norm(w);prev=w;const d=cross(w,tangent),angle=rad(profile(twistProfile,t)),ww=add(mul(w,Math.cos(angle)),mul(d,Math.sin(angle))),dd=add(mul(d,Math.cos(angle)),mul(w,-Math.sin(angle)));
   for(let j=0;j<=sides;j++){const a=2*Math.PI*(j%sides)/sides,cs=Math.cos(a),sn=Math.sin(a),shape=crossSection==='sculpted'?(sn>=0?Math.pow(sn,.72):-.32*Math.pow(-sn,1.6)):crossSection==='lens'?Math.sign(sn)*Math.abs(sn)**1.6:sn;
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
 // A composition is authored as three large regions of ONE front surface.
 // Adjacent regions share actual vertices above the split; smaller locks are
 // cut into the hem and sculpted into the same surface, not duplicated leaves.
 function composedFringe(fit,design){
  const {groups,rootBoundaries,midBoundaries}=design, rows=28,cols=24,splitRow=15;
  if(groups.length!==3||rootBoundaries.length!==4||midBoundaries.length!==4)throw Error('invalid fringe composition');
  const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  const sample=(keys,u)=>{let i=1;while(i<keys.length-1&&u>keys[i][0])i++;const a=keys[i-1],b=keys[i];return lerp(a[1],b[1],smooth((u-a[0])/(b[0]-a[0])));};
  const outer=[],uv=[],faces=[],lookup=new Map(),root=[];
  function vertex(key,theta,phi,clearance,u,t){
   if(lookup.has(key))return lookup.get(key);
   const id=outer.length/3;outer.push(...fit.anchor(theta,phi,clearance).position);uv.push(u,t);root.push(0);lookup.set(key,id);return id;
  }
  const pole=vertex('pole',0,0,.006,.5,0);
  groups.forEach((group,gi)=>{
   let prev;
   for(let i=1;i<=rows;i++){
    const t=i/rows, split=smooth((i-splitRow)/(rows-splitRow)), row=[];
    const edge=(side)=>{const k=gi+side,b=lerp(rootBoundaries[k],midBoundaries[k],smooth(t/.75));return lerp(b,group.split[side],split);};
    const left=edge(0),right=edge(1);
    for(let k=0;k<=cols;k++){
     const u=k/cols,phi=lerp(left,right,u),hem=sample(group.hem,u);
     const theta=105*t+(hem-105)*smooth((t-splitRow/rows)/(1-splitRow/rows));
     const shape=Math.sin(Math.PI*u),lift=Math.sin(Math.PI*t*.88);
     let relief=0;
     for(const groove of group.grooves){const center=groove.u+groove.drift*(1-t),strength=smooth((t-groove.start)/.22);relief+=groove.depth*strength*Math.exp(-Math.pow((u-center)/groove.width,2))*Math.sin(Math.PI*u);}
     const clearance=.006+.003*Math.sin(Math.PI*t)+group.bulge*shape**1.1*lift-relief;
     const key=i<=splitRow&&(k===0||k===cols)?'shared:'+i+':'+(gi+(k===cols?1:0)):gi+':'+i+':'+k;
     row.push(vertex(key,theta,phi,clearance,(gi+u)/groups.length,t));
    }
    for(let k=0;k<cols;k++){if(!prev)faces.push(pole,row[k],row[k+1]);else faces.push(prev[k],row[k],prev[k+1],prev[k+1],row[k],row[k+1]);}
    prev=row;
   }
  });
  // Close the thin shell. Internal welded edges are never capped, so upper
  // boundaries are physically continuous. Only the outer perimeter and
  // authored split edges get side faces.
  const count=outer.length/3,p=outer.slice(),ix=faces.slice(),allUv=uv.slice(),allRoot=root.slice(),edges=new Map();
  for(let i=0;i<count;i++){const v=outer.slice(i*3,i*3+3),dir=norm(sub(v,fit.center));p.push(...sub(v,mul(dir,.0015)));allUv.push(...uv.slice(i*2,i*2+2));allRoot.push(0);}
  for(let i=0;i<faces.length;i+=3){const [a,b,c]=faces.slice(i,i+3);ix.push(c+count,b+count,a+count);
   for(const [x,y] of [[a,b],[b,c],[c,a]]){const key=Math.min(x,y)+':'+Math.max(x,y),old=edges.get(key);if(old)old.n++;else edges.set(key,{x,y,n:1});}}
  for(const {x,y,n} of edges.values()){if(n>2)throw Error('non-manifold outer fringe');if(n===1)ix.push(y,x,x+count,y,x+count,y+count);}
  let result=mesh(p,allUv,ix,[],allRoot);if(signedVolume(result)<0){for(let i=0;i<ix.length;i+=3)[ix[i+1],ix[i+2]]=[ix[i+2],ix[i+1]];result=mesh(p,allUv,ix,[],allRoot);}
  result.composition={groups:groups.length,weldedRows:splitRow,outerVertices:count};return result;
 }
 const slots=['front','middle','back','extra'];
 function validatePart(part){
  if(part?.version!==1||!/^hair-[a-z0-9-]+$/.test(part.id)||!slots.includes(part.slot)||!Array.isArray(part.bodies)||!part.bodies.length||!part.bodies.every(x=>['male','female'].includes(x))||typeof part.join!=='string'||!part.join||!Array.isArray(part.compatibility)||!part.compatibility.length||!part.compatibility.every(x=>typeof x==='string'&&x)||!Array.isArray(part.clumps)||!part.clumps.length||!part.material||!part.lod||!part.physics)throw Error('invalid hair part');
  for(const c of part.clumps){if(c.guide&&(!Array.isArray(c.guide)||c.guide.length!==4||!c.guide.every(validVec)||![c.widthProfile,c.depthProfile,c.twistProfile].every(a=>Array.isArray(a)&&a.length>=2&&a.every(Number.isFinite))))throw Error('invalid Cartesian guide');if(!Array.isArray(c.controlPoints)||c.controlPoints.length<2||!c.controlPoints.every(v=>validVec(v)&&v[0]>=0&&v[0]<=160&&v[2]>=0&&v[2]<=.2)||!c.rootAnchor||!Number.isFinite(c.rootAnchor.theta)||!Number.isFinite(c.rootAnchor.phi)||c.rootAnchor.theta!==c.controlPoints[0][0]||c.rootAnchor.phi!==c.controlPoints[0][1]||!Number.isInteger(c.grooves)||c.grooves<0)throw Error('invalid clump anchors');}
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
 // Artist-authored Cartesian guide; the scalp never determines the individual
 // strand vertices. Fit by skull dimensions and a root attachment, then only
 // resolve actual intersections by translating whole cross sections.
 function guideLock(fit,c){
  const axes=[[1,0,0],[-1,0,0],[0,1,0],[0,0,1]];
  const [right,left,up,front]=axes.map(a=>fit.radius(a));
  if([right,left,up,front].some(x=>!(x>0)))throw Error('missing skull dimensions');
  const sx=(right+left)/2,sy=up,sz=front;
  const a=fit.anchor(c.rootAnchor.theta,c.rootAnchor.phi,.004);
  const points=[a.position,...c.guide.map(([x,y,z])=>add(fit.center,[x*sx,y*sy,z*sz]))];
  const segments=22,sides=8,stride=sides+1;
  const original=loft({controlPoints:points,rootNormal:a.normal,widthProfile:c.widthProfile.map(x=>x*sx),depthProfile:c.depthProfile.map(x=>x*sz),twistProfile:c.twistProfile,crossSection:'sculpted',segments,sides});
  const p=Array.from(original.positions),ix=Array.from(original.indices),uv=Array.from(original.uv),seams=[];
  const shifts=Array.from({length:segments+1},()=>[0,0,0]);let maxShift=0;
  for(let i=0;i<=segments;i++){
   const start=i*stride,center=cat(points,i/segments),out=norm(sub(center,fit.center));seams.push([start,start+sides]);
   // A whole cross section moves together, preserving the authored profile.
   // No shrinkwrap of non-colliding vertices.
   let moved=0;
   for(let iteration=0;iteration<12;iteration++){
    let deficit=0;
    for(let k=0;k<sides;k++){const q=p.slice((start+k)*3,(start+k)*3+3),ray=sub(q,fit.center),radial=length(ray),r=fit.radius(ray);if(r!==null)deficit=Math.max(deficit,r+.0008-radial);}
    if(deficit<1e-6)break;
    const delta=mul(out,deficit*1.15);moved+=length(delta);shifts[i]=add(shifts[i],delta);
    for(let k=0;k<=sides;k++)for(let axis=0;axis<3;axis++)p[(start+k)*3+axis]+=delta[axis];
   }
   maxShift=Math.max(maxShift,moved);
  }
  // End-cap centers must follow the translated end rings.
  const endStart=(segments+1)*stride;
  for(const end of [0,1])for(let axis=0;axis<3;axis++)p[(endStart+end)*3+axis]+=shifts[end?segments:0][axis];
  const result=mesh(p,uv,ix,seams,Array.from(original.rootMask));result.fitCorrectionMetres=maxShift;return result;
 }
 function makePart(fit,part){validatePart(part);return part.clumps.map(c=>{if(c.guide)return guideLock(fit,c);if(c.angularWidth)return ribbon(fit,c);const a=fit.anchor(...c.controlPoints[0]);const points=c.controlPoints.map(v=>fit.anchor(...v).position);return loft({...c,controlPoints:points,rootNormal:a.normal});});}
 function penetration(fit,g){let max=0,count=0,miss=0,eligible=0;for(let i=0;i<g.positions.length;i+=3){if(g.rootMask[i/3])continue;eligible++;const v=sub(Array.from(g.positions.slice(i,i+3)),fit.center),l=length(v),r=fit.radius(v);if(r===null){miss++;continue;}const depth=Math.max(0,r-l);if(depth>1e-6){count++;max=Math.max(max,depth);}}return {maxMetres:max,count,eligible,miss};}
 function signedVolume(g){let sum=0;for(let i=0;i<g.indices.length;i+=3){const a=Array.from(g.positions.slice(g.indices[i]*3,g.indices[i]*3+3)),b=Array.from(g.positions.slice(g.indices[i+1]*3,g.indices[i+1]*3+3)),c=Array.from(g.positions.slice(g.indices[i+2]*3,g.indices[i+2]*3+3));sum+=dot(a,cross(b,c))/6;}return sum;}
 return {loft,surface,studioHead,scalpCap,frontFoundation,composedFringe,hairline,validatePart,compatible,makePart,penetration,signedVolume,direction};
}
export const {loft,surface,studioHead,scalpCap,frontFoundation,composedFringe,hairline,validatePart,compatible,makePart,penetration,signedVolume,direction}=createHairKit();
