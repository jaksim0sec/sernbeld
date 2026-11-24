import {attentionRotations} from '../attention-pose.js';
import {bindShirtGeometry} from './shirt-binding.js';

// Share the actual-skeleton binding per source body and Three runtime.
// No per-frame CPU cloth collision solve, and no per-NPC geometry rebuild.
const pools=new WeakMap();
function acquire(T,actor,asset){
 let byT=pools.get(asset);if(!byT)pools.set(asset,byT=new WeakMap());
 let byBody=byT.get(T);if(!byBody)byT.set(T,byBody=new WeakMap());
 let shared=byBody.get(actor.data);
 if(!shared){shared={...bindShirtGeometry(T,actor,asset),users:0};byBody.set(actor.data,shared);}
 shared.users++;
 return {...shared,release(){if(--shared.users===0){shared.geometry.dispose();byBody.delete(actor.data);}}};
}
const vertex=`
#include <common>
#include <skinning_pars_vertex>
attribute vec3 aColor,aRest;attribute vec4 aDetail,aInfluence;
uniform vec2 uBend;
varying vec3 vNormal,vColor,vPos,vRest,vFlags;varying vec2 vDetail;
void main(){
 vec3 objectNormal=normal;
 #include <skinbase_vertex>
 #include <skinnormal_vertex>
 vec3 transformed=position;
 #include <skinning_vertex>
 vec4 mv=modelViewMatrix*vec4(transformed,1.);
 vNormal=normalMatrix*objectNormal;vPos=mv.xyz;vColor=aColor;vRest=aRest;
 float sleeve=step(.5,aInfluence.w)*(1.-step(1.5,aInfluence.w));
 vFlags=vec3(max(sleeve,aInfluence.x/255.),step(1.5,aInfluence.w)*(1.-step(2.5,aInfluence.w)),1.-step(1.5,aInfluence.w));
 float bend=mix(uBend.x,uBend.y,step(0.,aDetail.z));
 vDetail=vec2(aDetail.x+bend*aDetail.y,aDetail.w);gl_Position=projectionMatrix*mv;
}
`;
const fragment=`
uniform float uFirst,uCollar;
varying vec3 vNormal,vColor,vPos,vRest,vFlags;varying vec2 vDetail;
void main(){
 if(uFirst>.5&&vFlags.x<.5)discard;
 if(uCollar<.5&&vFlags.y>.5)discard;
 vec3 V=normalize(-vPos),N=normalize(vNormal+vec3(0.,0.,.000001));if(dot(N,V)<0.)N=-N;
 vec3 px=dFdx(vPos),py=dFdy(vPos),sx=cross(py,N),sy=cross(N,px);float det=dot(px,sx),hx=dFdx(vDetail.x),hy=dFdy(vDetail.x);
 vec3 C=N;if(abs(det)>1.e-12){vec3 grad=(sx*hx+sy*hy)/det;float len=length(grad);C=normalize(N-grad*min(1.,.78/max(len,.00001)));}
 vec3 L=normalize(vec3(-.43,.69,.66));float lit=dot(C,L),band=smoothstep(-.24,.78,lit),soft=clamp(lit*.5+.5,0.,1.);
 vec3 shade=mix(vec3(.59,.57,.55),vec3(1.01,1.00,.985),band)*(.92+.08*soft);
 vec3 phase=vRest*1010.,footprint=fwidth(phase),fade=1.-smoothstep(vec3(.55),vec3(2.9),footprint),q=sin(phase)*fade,blend=abs(N);blend/=max(dot(blend,vec3(1.)),.0001);
 float grain=dot(blend,vec3(q.y*q.z,q.x*q.z,q.x*q.y)),crease=clamp(vDetail.y,0.,1.);
 vec3 cloth=vColor*shade*(1.-.22*crease+.025*grain);
 float front=smoothstep(.040,.060,vRest.z)*vFlags.z,x=vRest.x-.001,edge=abs(x-.011);
 float panel=1.-smoothstep(.0105,.0125,abs(x)),seam=1.-smoothstep(.00065,.00165,edge),stitch=1.-smoothstep(.00045,.0014,abs(x+.010));
 cloth*=1.+front*(.018*panel-.15*seam-.07*stitch);
 gl_FragColor=vec4(max(cloth,0.),1.);
 #include <colorspace_fragment>
}
`;
export function buildShirt(T,actor){
 const asset=actor.shirtAsset;if(!asset)throw Error('Shirt assets must be preloaded');
 const shared=acquire(T,actor,asset);
 const uniforms={uBend:{value:new T.Vector2()},uFirst:{value:0},uCollar:{value:1}};
 const material=new T.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:fragment,side:T.DoubleSide});
 const object=new T.SkinnedMesh(shared.geometry,material);object.name='clothing:top.basic-shirt';
 // Exactly the same bone texture, bind matrix and final IK pose as the body.
 // Both meshes are siblings in actor.model with identical local transforms.
 object.bind(actor.skeleton,actor.mesh.bindMatrix);
 object.frustumCulled=false;object.castShadow=false;object.receiveShadow=false;
 const coverage=new Uint8Array(actor.mesh.geometry.attributes.position.count);
 coverage.set(shared.covered.subarray(0,coverage.length));
 actor.mesh.geometry.setAttribute('aClothCover',new T.BufferAttribute(coverage,1,true));
 const rotations=attentionRotations(actor.data.bones);
 const ref=['forearm_right','forearm_left'].map(name=>{
  const r=rotations[name];
  return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().fromArray([r[0],r[1],r[2],0,r[3],r[4],r[5],0,r[6],r[7],r[8],0,0,0,0,1]));
 });
 function updatePose(){
  const bend=(name,i)=>Math.sin(Math.min(2*Math.PI/3,actor.B[name].quaternion.angleTo(ref[i]))*.75);
  uniforms.uBend.value.set(bend('forearm_right',0),bend('forearm_left',1));
  material.uniformsNeedUpdate=true;
 }
 object.onBeforeRender=updatePose;
 object.userData.updateClothingPose=updatePose;
 object.userData.clothingDiagnostics={vertices:asset.meta.vertices,triangles:asset.meta.triangles,sourceJoints:asset.meta.sourceJoints,...shared.diagnostics};
 object.userData.referenceRest=shared.rest;
 let disposed=false;
 return {object,bodyCoverage:true,setFirstPerson(on){uniforms.uFirst.value=on?1:0;object.visible=true;},setExternalCollar(on){uniforms.uCollar.value=on?0:1;},dispose(){if(disposed)return;disposed=true;material.dispose();shared.release();}};
}
