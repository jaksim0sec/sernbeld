// Verify render-only LOD from preserved original.
import {readFileSync} from 'node:fs';
import {loadShirtReference,manifest} from './export-shirt-reference.mjs';
const template=readFileSync(new URL('../assets/models/clothing/shirt-v1/reference-template.html',import.meta.url),'utf8');
function detailSource(t){return "const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));const smooth=(a,b,v)=>{let t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t)};const buffer=x=>x;\n"+t.slice(t.indexOf("function fabricDetail("),t.indexOf("function buttonAnchors("))+"\n"+t.slice(t.indexOf("function meshNormals("),t.indexOf("// Long sleeve: shared upper hem"))+"\nconst mesh={rest:p,cloth};fabricDetail({shirt:{mesh}});return {detail:mesh.detailData,normals:meshNormals(p,f)};";}
const makeDetail=new Function('p','f','cloth',detailSource(template));
function optimize(p,f,rig,cuff,sex,detail,normals){
 const n=p.length/3,cl=rig.cloth,faces=Array.from({length:f.length/3},(_,i)=>Array.from(f.slice(i*3,i*3+3))),inc=Array.from({length:n},()=>[]),safe=new Uint8Array(n),blocked=new Uint8Array(n),removed=new Uint8Array(n),drop=new Uint8Array(faces.length),added=[],patches=[],cs=new Set(cuff);
 for(let i=0;i<cl.base;i++){const x=Math.abs(p[i*3]),y=p[i*3+1],z=p[i*3+2];if((y<(sex==="male"?1.165:1.155)||x<.055)&&y<1.38&&(x>.026||z<.035)&&!cs.has(i))safe[i]=1;}
 for(let j=0;j<faces.length;j++)for(const i of faces[j])inc[i].push(j);
 const sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>{let d=Math.hypot(...a)||1;return a.map(v=>v/d)},P=i=>Array.from(p.slice(i*3,i*3+3)),N=i=>Array.from(normals.slice(i*3,i*3+3)),cross2=(a,b)=>a[0]*b[1]-a[1]*b[0];
 const limits=[.00045,.06,.06,.06,.00016,.04];let maxima=limits.map(()=>0);
 for(let i=0;i<n;i++){
  if(!safe[i]||blocked[i]||inc[i].length<4||inc[i].length>9)continue;
  const next=new Map();let valid=true;
  for(const j of inc[i]){let t=faces[j],k=t.indexOf(i),a=t[(k+1)%3],b=t[(k+2)%3];if(next.has(a)||!safe[a]||!safe[b]||blocked[a]||blocked[b]){valid=false;break;}next.set(a,b);}
  if(!valid||next.size!==inc[i].length)continue;
  let ring=[next.keys().next().value];while(ring.length<next.size){let v=next.get(ring.at(-1));if(v===undefined||ring.includes(v)){valid=false;break;}ring.push(v);}
  if(!valid||next.get(ring.at(-1))!==ring[0]||ring.some(v=>cs.has(v)!==cs.has(i)||inc[v].some(j=>faces[j].some(k=>!safe[k]))))continue;
  let center=P(i),normal=unit(N(i)),u=unit(cross(normal,Math.abs(normal[0])<.9?[1,0,0]:[0,1,0])),v=cross(normal,u);
  const xy=new Map([[i,[0,0]]]),attr=new Map();
  for(const k of [i,...ring]){let d=sub(P(k),center);xy.set(k,[dot(d,u),dot(d,v)]);attr.set(k,[dot(d,normal),...N(k),detail[k*4],detail[k*4+3]]);}
  if(ring.some((a,k)=>cross2(xy.get(a),xy.get(ring[(k+1)%ring.length]))<=1e-12))continue;
  let best=null;
  for(let root=0;root<ring.length;root++){
   let q=ring.slice(root).concat(ring.slice(0,root)),tris=[],max=limits.map(()=>0),ok=true;
   for(let k=1;k<q.length-1;k++){let t=[q[0],q[k],q[k+1]],A=xy.get(t[0]),B=xy.get(t[1]),C=xy.get(t[2]);if(cross2(sub(B,A),sub(C,A))<=1e-12){ok=false;break;}tris.push(t);}
   if(!ok)continue;
   function compare(point,original){
    for(const t of tris){let A=xy.get(t[0]),B=xy.get(t[1]),C=xy.get(t[2]),ab=sub(B,A),ac=sub(C,A),ap=sub(point,A),den=cross2(ab,ac),s=cross2(ap,ac)/den,h=cross2(ab,ap)/den,w=1-s-h;if(Math.min(w,s,h)<-1e-7)continue;let a=attr.get(t[0]),b=attr.get(t[1]),c=attr.get(t[2]);for(let j=0;j<limits.length;j++){max[j]=Math.max(max[j],Math.abs(original[j]-(w*a[j]+s*b[j]+h*c[j])));if(max[j]>limits[j])return false;}return true;}return false;
   }
   if(!compare([0,0],attr.get(i)))continue;
   for(let k=2;k<q.length-1&&ok;k++){let A=xy.get(q[0]),B=xy.get(q[k]),D=sub(B,A);for(const j of ring){let R=xy.get(j),den=cross2(R,D);if(Math.abs(den)<1e-14)continue;let t=cross2(A,D)/den,s=cross2(A,R)/den;if(t<=1e-7||t>=1-1e-7||s<=1e-7||s>=1-1e-7)continue;let aa=attr.get(i),bb=attr.get(j);if(!compare(R.map(x=>x*t),aa.map((x,k)=>x+(bb[k]-x)*t))){ok=false;break;}}}
   if(!ok)continue;
   let score=max.reduce((s,v,k)=>s+v/limits[k],0);if(!best||score<best.score)best={tris,max,score};
  }
  if(!best)continue;
  removed[i]=1;blocked[i]=1;for(const j of ring)blocked[j]=1;
  for(const j of inc[i])drop[j]=1;added.push(...best.tris);patches.push([i,...best.tris.flat()]);
  maxima=maxima.map((v,k)=>Math.max(v,best.max[k]));
 }
 const result=faces.filter((_,i)=>!drop[i]).concat(added),used=new Uint8Array(n);
 for(const t of result)for(const i of t){if(removed[i])throw Error("Removed vertex referenced");used[i]=1;}
 const source=Uint16Array.from(Array.from({length:n},(_,i)=>i).filter(i=>used[i])),map=new Int32Array(n).fill(-1);source.forEach((i,k)=>map[i]=k);
 const indices=Uint16Array.from(result.flatMap(t=>t.map(i=>map[i])));
 function topology(ts){let edges=new Map(),degenerate=0;for(const t of ts){if(new Set(t).size!==3||Math.hypot(...cross(sub(P(t[1]),P(t[0])),sub(P(t[2]),P(t[0]))))<1e-12)degenerate++;for(let j=0;j<3;j++){let a=t[j],b=t[(j+1)%3],key=Math.min(a,b)*n+Math.max(a,b);edges.set(key,(edges.get(key)||0)+1);}}return {degenerate,nonmanifold:[...edges.values()].filter(v=>v>2).length,boundary:[...edges].filter(x=>x[1]===1).map(x=>x[0]).sort((a,b)=>a-b).join(",")};}
 const before=topology(faces),after=topology(result);
 if(after.degenerate||after.nonmanifold||before.boundary!==after.boundary||source.length!==n-patches.length)throw Error("Topology verification failed");
 return {source,indices,patches,maxima};
}
for(const sex of ['male','female']){
 const {shirt,rig:raw}=loadShirtReference(sex),rig=JSON.parse(raw),p=Float32Array.from(shirt.v),f=Uint16Array.from(shirt.f);
 const {detail,normals}=makeDetail(p,f,rig.cloth),o=optimize(p,f,rig,shirt.cuff,sex,detail,normals);
 const info=manifest.bodies[sex],lod=info.renderLod;
 if(o.source.length!==lod.vertices||o.indices.length/3!==lod.triangles||JSON.stringify(o.patches)!==JSON.stringify(shirt.renderPatches))throw Error('Stored render LOD differs: '+sex);
 console.log(sex+': '+o.patches.length+' static vertices removed; max errors '+o.maxima.join(', '));
}
