import assert from 'node:assert/strict';
import {loadShirtReference,exportReference,manifest} from '../tools/export-shirt-reference.mjs';
const html=exportReference();
const code=html.slice(html.indexOf('const smooth=(a,b,v)'),html.indexOf('function selectJoint'));
const buttons=html.slice(html.indexOf('function buttonAnchors('),html.indexOf('function initButtons('));
const make=new Function('D','a','const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));const document={getElementById(){return {textContent:JSON.stringify(D.shirt)}}};'+code+'\n'+buttons+'\ninitClothRig(a,D.rig);const g=a.shirt.mesh;return {g,poseArrays,buttonAnchors,buttonPositions,meshNormals};');
for(const sex of ['male','female']){
 const {shirt,rig:r,body:b}=loadShirtReference(sex),rig=JSON.parse(r),{gunzipSync}=await import('node:zlib'),body=gunzipSync(Buffer.from(b,'base64'));
 const nv=body.readUInt32LE(0),p=Float32Array.from({length:nv*3},(_,i)=>body.readFloatLE(8+i*4)),n=Float32Array.from({length:nv*3},(_,i)=>body.readFloatLE(8+nv*12+i*4));
 const D={shirt,rig},a={sex,joints:[],body:{mesh:{rest:p,restNorm:n,weights:Uint8Array.from(Buffer.from(rig.body,'base64'))}},shirt:{mesh:{rest:Float32Array.from(shirt.v),restNorm:new Float32Array(shirt.v.length),weights:Uint8Array.from(Buffer.from(rig.shirt,'base64'))}}};
 assert.equal(a.shirt.mesh.rest.length/3,manifest.bodies[sex].vertices);assert.equal(new Set(shirt.f).size,manifest.bodies[sex].vertices);
 for(let i=0;i<2;i++){let sign=i?1:-1,j={p:rig.joints[i][0],sign,side:0,front:0,kind:'shoulder'},e={p:rig.joints[i][1],sign,side:0,front:0,kind:'elbow',parent:j};a.joints.push(j,e);}
 const {g,poseArrays,buttonAnchors,buttonPositions,meshNormals}=make(D,a);g.restNorm=meshNormals(g.rest,g.faces);const spec=buttonAnchors(g);
 for(const [s,f,e] of [[0,0,0],[90,0,0],[0,0,45],[0,0,90],[0,0,120],[65,30,85],[0,65,90]]){
  a.joints[2].side=s;a.joints[2].front=f;a.joints[3].front=e;const b=poseArrays(a,a.body.mesh)[0],[p,n]=poseArrays(a,g,b);assert(p.every(Number.isFinite)&&n.every(Number.isFinite));assert(buttonPositions(spec,p).every(Number.isFinite));
  if(!s&&!f&&!e)assert.deepEqual(p,g.rest);
 }
 console.log(sex+': '+g.rest.length/3+' vertices, '+g.faces.length/3+' triangles, seven pose samples OK');
}
