// Deterministic baking of the approved reference geometry and pose corrections.
function bakeShirtRuntime(sex,shirt,rig,body,template,patches){
 const clamp=(x,a,b)=>Math.min(b,Math.max(a,x)),smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t)};
 const chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
 function decode(s){s=s.replace(/\s/g,"");const a=new Uint8Array(s.length*3/4-(s.endsWith("==")?2:s.endsWith("=")?1:0));let k=0;for(let i=0;i<s.length;i+=4){const x=(chars.indexOf(s[i])<<18)|(chars.indexOf(s[i+1])<<12)|((chars.indexOf(s[i+2])&63)<<6)|(chars.indexOf(s[i+3])&63);a[k++]=x>>16;a[k++]=x>>8;a[k++]=x;}return a;}
 const p=Float32Array.from(shirt.v),f=Uint16Array.from(shirt.f),dv=new DataView(body.buffer,body.byteOffset,body.byteLength),nv=dv.getUint32(0,true),ni=dv.getUint32(4,true);
 const bp=new Float32Array(body.buffer,body.byteOffset+8,nv*3).slice(),bn=new Float32Array(body.buffer,body.byteOffset+8+nv*12,nv*3).slice(),bi=new Uint32Array(body.buffer,body.byteOffset+8+nv*28,ni).slice();
 const a={sex,joints:[],body:{mesh:{rest:bp,restNorm:bn,weights:decode(rig.body)}},shirt:{mesh:{rest:p,restNorm:new Float32Array(p.length),weights:decode(rig.shirt)}}};
 if(a.body.mesh.weights.length!==nv*2||a.shirt.mesh.weights.length!==p.length/3*2)throw Error("Reference rig size mismatch");
 for(let i=0;i<2;i++){let sign=i?1:-1,j={p:rig.joints[i][0],sign,side:0,front:0,kind:"shoulder"},e={p:rig.joints[i][1],sign,side:0,front:0,kind:"elbow",parent:j};a.joints.push(j,e);}
 const solver=new Function("a","rig","shirt","const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));const buffer=x=>x;const document={getElementById(){return {textContent:JSON.stringify(shirt)}}};"+template.slice(template.indexOf("const smooth=(a,b,v)"),template.indexOf("function selectJoint"))+"\n"+template.slice(template.indexOf("function fabricDetail("),template.indexOf("function initButtons("))+"\ninitClothRig(a,rig);return {poseArrays,meshNormals,fabricDetail,buttonAnchors,buttonPositions};")(a,rig,shirt);
 const g=a.shirt.mesh;g.restNorm=solver.meshNormals(p,f);solver.fabricDetail(a);
 const n=p.length/3,influence=new Uint8Array(n*4),sides=new Int8Array(n);
 for(let i=0;i<n;i++){sides[i]=p[i*3]>=0?1:-1;influence[i*4]=g.weights[i*2];influence[i*4+1]=g.weights[i*2+1];influence[i*4+2]=sides[i]>0?1:0;}
 for(const s of g.cloth.sides)for(let row=0;row<s.rows;row++)for(let k=0;k<s.loop.length;k++){const i=s.start+row*s.loop.length+k;sides[i]=s.sign;influence[i*4+2]=s.sign>0?1:0;influence[i*4+3]=1;influence[i*4+1]=0;}
 for(const s of g.cloth.long){const upper=Math.min(s.y0-s.ey,.062);for(const r of s.rings){const t=r.cuff?1:smooth(s.ey+upper,s.ey-.080,r.y);for(let k=0;k<s.n;k++){const i=r.start+k;sides[i]=s.sign;influence.set([255,Math.round(t*255),s.sign>0?1:0,1],i*4);}}}
 // CPU reference DQ baseline identical to the shader's two-joint blend.
 function mul(a,b){return [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];}
 const conj=q=>[-q[0],-q[1],-q[2],q[3]],rot=(q,v)=>mul(mul(q,[...v,0]),conj(q)).slice(0,3);
 function dq(j){const x=-j.front*Math.PI/360,z=j.sign*j.side*Math.PI/360,q=mul([0,0,Math.sin(z),Math.cos(z)],[Math.sin(x),0,0,Math.cos(x)]),r=rot(q,j.p),t=j.p.map((v,k)=>v-r[k]);return {q,d:mul([...t,0],q).map(v=>v*.5)};}
 function inverseResidual(i,target,pose,isElbow){
  const w=influence[i*4]/255,e=influence[i*4+1]/255,amount=isElbow?w*e:w,qr=pose.q.map((v,k)=>v*amount+(k===3?1-amount:0)),qd=pose.d.map(v=>v*amount),norm=Math.hypot(...qr),q=qr.map(v=>v/norm),d=qd.map(v=>v/norm),t=mul(d,conj(q)).map(v=>2*v),r=rot(conj(q),target.map((v,k)=>v-t[k]));return r.map((v,k)=>v-p[i*3+k]);
 }
 const samples=[[75,0,0],[0,75,0],[0,-35,0],[0,0,90]],corr=samples.map(()=>new Int16Array(n*3)),sampleStats=[];
 for(let side=0;side<2;side++){
  const j=a.joints[side*2],e=a.joints[side*2+1];
  for(let si=0;si<samples.length;si++){const [sv,fv,ev]=samples[si];j.side=sv;j.front=fv;e.front=ev;const posedBody=solver.poseArrays(a,a.body.mesh)[0],posed=solver.poseArrays(a,g,posedBody)[0],pose=dq(ev?e:j);let max=0,clipped=0;
   for(let i=0;i<n;i++){if(sides[i]!==j.sign)continue;const r=inverseResidual(i,Array.from(posed.slice(i*3,i*3+3)),pose,Boolean(ev));for(let k=0;k<3;k++){const val=Math.round(r[k]*100000);if(Math.abs(val)>32767)clipped++;corr[si][i*3+k]=clamp(val,-32767,32767);max=Math.max(max,Math.abs(r[k]));}}
   if(clipped)throw Error("Corrective residual overflow");sampleStats.push({side:j.sign,pose:samples[si],maxResidual:max});j.side=j.front=e.front=0;
  }
 }
 const renderTopology=new Function(template.slice(template.indexOf("function gatherRenderAttribute("),template.indexOf("function compactRenderMesh("))+";return renderTopology;")();
 const render=renderTopology(f,n,patches),pos=[],norm=[],color=[],detail=[],skin=[],indices=[],correct=samples.map(()=>[]);
 function rgb(s){const v=parseInt(s.slice(1),16);return [v>>16&255,v>>8&255,v&255].map(x=>{x/=255;return Math.round(255*(x<=.04045?x/12.92:((x+.055)/1.055)**2.4));});}
 const cloth=rgb("#d2c8bb"),pale=rgb("#e5dfd2"),cuff=new Set(shirt.cuff);
 function append(P,N,F,ids,C,D,I,cor){
  const offset=pos.length/3;for(const i of ids){pos.push(P[i*3],P[i*3+1],P[i*3+2]);norm.push(N[i*3],N[i*3+1],N[i*3+2]);color.push(...C(i));detail.push(...(D?D.slice(i*4,i*4+4):[0,0,0,0]));skin.push(...I(i));for(let k=0;k<correct.length;k++)correct[k].push(...(cor?cor[k].slice(i*3,i*3+3):[0,0,0]));}
  for(const i of F)indices.push(i+offset);
 }
 append(p,g.restNorm,render.index,render.ids,i=>cuff.has(i)?pale:cloth,g.detailData,i=>Array.from(influence.slice(i*4,i*4+4)),corr);
 const fit=new Function(template.slice(template.indexOf("function fitCollarSurface"),template.indexOf("function collarPieces"))+";return fitCollarSurface;")(),y=sex==="male"?1.475:1.445,collar=fit(bp,bi,[0,y,.025],[0,y+.045,.025],1.76),cp=Float32Array.from(collar.vertices),band=collar.faces.slice(0,collar.groups[0].count),outer=collar.faces.slice(collar.groups[1].start),nb=solver.meshNormals(cp,band),no=solver.meshNormals(cp,outer),S=collar.diagnostics.segments,join=collar.diagnostics.rearJoinIndex,R=collar.diagnostics.rows,bset=new Set(band),oset=new Set(outer);
 for(const i of oset){if(i<=S||!bset.has(i))continue;const k=i*3,A=nb,B=no,dot=A[k]*B[k]+A[k+1]*B[k+1]+A[k+2]*B[k+2],sign=dot<0?-1:1,x=A[k]+sign*B[k],y=A[k+1]+sign*B[k+1],z=A[k+2]+sign*B[k+2],len=Math.hypot(x,y,z);if(len>1e-6){A.set([x/len,y/len,z/len],k);B.set([sign*x/len,sign*y/len,sign*z/len],k);}}
 const collarStart=pos.length/3,baseLinear=cloth.map((_,i)=>{const x=[210,200,187][i]/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});
 const bandColor=i=>{const j=i%(S+1),edge=Math.min(j,S-j),t=clamp((edge-12)/(join-12),0,1),f=t*t*(3-2*t),row=clamp(Math.floor(i/(S+1))/R,0,1),shadow=(.70+.11*row)*(1-f)+f;return baseLinear.map(c=>Math.round(c*shadow*255));};
 for(const [F,N,C] of [[band,nb,bandColor],[outer,no,()=>cloth]]){const r=renderTopology(F,cp.length/3);append(cp,N,r.index,r.ids,C,null,()=>[0,0,0,2],null);}
 const buttonStart=pos.length/3,spec=solver.buttonAnchors(g),buttons=solver.buttonPositions(spec,p),buttonNormals=solver.meshNormals(buttons,spec.faces);
 append(buttons,buttonNormals,spec.faces,Array.from({length:buttons.length/3},(_,i)=>i),i=>rgb(spec.colors[i]),null,()=>[0,0,0,3],null);
 const count=pos.length/3;if(count>65535||indices.some(i=>i>=count)||pos.some(v=>!Number.isFinite(v))||norm.some(v=>!Number.isFinite(v)))throw Error("Invalid runtime geometry");
 // 16-bit correction residuals use 10 micrometre units. Keep original float32 rest positions/normals.
 const arrays=[Float32Array.from(pos),Float32Array.from(norm),Uint8Array.from(color),Float32Array.from(detail),Uint8Array.from(skin),Uint16Array.from(indices),...correct.map(c=>Int16Array.from(c))],bytes=new Uint8Array(arrays.reduce((s,a)=>s+a.byteLength+3,0));let offset=0;const sections=[];
 for(const arr of arrays){offset=(offset+3)&~3;bytes.set(new Uint8Array(arr.buffer),offset);sections.push({offset,length:arr.length});offset+=arr.byteLength;}
 const raw=bytes.slice(0,offset);
 return {raw,meta:{version:1,vertices:count,triangles:indices.length/3,shirtVertices:render.ids.length,collarVertices:buttonStart-collarStart,buttonVertices:count-buttonStart,sections,rawBytes:raw.length,correctiveSamples:samples,sampleStats,sourceJoints:rig.joints}};
}
// LZ4 block coding: tiny local decoder, no additional runtime dependency.
function compressBlock(src){
 const table=new Int32Array(1<<16).fill(-1),out=[];let anchor=0,i=0;
 const word=p=>(src[p]|src[p+1]<<8|src[p+2]<<16|src[p+3]<<24),hash=x=>(Math.imul(x,0x9e3779b1)>>>16)&65535;
 const ext=n=>{while(n>=255){out.push(255);n-=255;}out.push(n);};
 while(i+4<=src.length){const w=word(i),h=hash(w),p=table[h];table[h]=i;if(p<0||i-p>65535||word(p)!==w){i++;continue;}
  let len=4;while(i+len<src.length&&src[p+len]===src[i+len])len++;
  const lit=i-anchor,match=len-4;out.push((Math.min(lit,15)<<4)|Math.min(match,15));if(lit>=15)ext(lit-15);for(let k=anchor;k<i;k++)out.push(src[k]);out.push((i-p)&255,(i-p)>>>8);if(match>=15)ext(match-15);i+=len;anchor=i;
 }
 const lit=src.length-anchor;out.push(Math.min(lit,15)<<4);if(lit>=15)ext(lit-15);for(let k=anchor;k<src.length;k++)out.push(src[k]);return Uint8Array.from(out);
}
function decompressBlock(src,size){
 const out=new Uint8Array(size);let i=0,o=0;function count(n){if(n===15){let v;do{if(i>=src.length)throw Error("Truncated LZ4");v=src[i++];n+=v;}while(v===255);}return n;}
 while(i<src.length){const token=src[i++],lit=count(token>>>4);if(i+lit>src.length||o+lit>size)throw Error("Bad LZ4 literal");out.set(src.subarray(i,i+lit),o);i+=lit;o+=lit;if(i===src.length)break;if(i+2>src.length)throw Error("Bad LZ4 offset");const dist=src[i++]|src[i++]<<8,len=count(token&15)+4;if(!dist||dist>o||o+len>size)throw Error("Bad LZ4 match");for(let k=0;k<len;k++){out[o]=out[o-dist];o++;}}
 if(o!==size)throw Error("Bad LZ4 size");return out;
}


// Rebuild the sidecars from the original source. Node 22+.
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {loadShirtReference,manifest} from './export-shirt-reference.mjs';
const root=new URL('../assets/models/clothing/shirt-v1/',import.meta.url);
const template=readFileSync(new URL('reference-template.html',root),'utf8');
for(const sex of ['male','female']){
 const {shirt,rig,body}=loadShirtReference(sex),info=manifest.bodies[sex];
 const {raw,meta}=bakeShirtRuntime(sex,shirt,JSON.parse(rig),gunzipSync(Buffer.from(body,'base64')),template,shirt.renderPatches);
 const packed=compressBlock(raw);
 if(decompressBlock(packed,raw.length).some((v,i)=>v!==raw[i]))throw Error('Runtime compression mismatch');
 const encoded=Buffer.from(packed).toString('base64');meta.parts=[];meta.packedBytes=packed.length;meta.sourcePositionSha256=info.positionSha256;meta.sourceIndexSha256=info.indexSha256;
 for(let i=0;i<encoded.length;i+=400000){const name='runtime.'+String(meta.parts.length).padStart(2,'0')+'.part';meta.parts.push(name);writeFileSync(new URL(sex+'/'+name,root),encoded.slice(i,i+400000));}
 writeFileSync(new URL(sex+'/runtime.json',root),JSON.stringify(meta,null,2)+'\n');
 console.log(sex+': '+meta.vertices+' vertices, '+meta.triangles+' triangles, '+meta.packedBytes+' packed bytes');
}
