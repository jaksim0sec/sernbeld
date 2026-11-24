import {attentionRotations} from '../attention-pose.js';
import {acquireShirtBinding} from './shirt-binding.js';
import {createGarmentPart} from './garment-pose.js';

const vertex=skin=>`
${skin}
attribute vec3 aColor,aRest;attribute vec4 aDetail,aInfluence;
uniform vec2 uBend;
varying vec3 vNormal,vColor,vPos,vRest,vFlags;varying vec2 vDetail;
void main(){
 vec3 transformed,objectNormal;garmentPose(transformed,objectNormal);
 vec4 mv=modelViewMatrix*vec4(transformed,1.);
 vNormal=normalMatrix*objectNormal;vPos=mv.xyz;vColor=aColor;vRest=aRest;
 float sleeve=step(.5,aInfluence.w)*(1.-step(1.5,aInfluence.w));
 vFlags=vec3(max(sleeve,aInfluence.x/255.),step(1.5,aInfluence.w)*(1.-step(2.5,aInfluence.w)),1.-step(1.5,aInfluence.w));
 float bend=mix(uBend.x,uBend.y,step(0.,aDetail.z));
 vDetail=vec2(aDetail.x+bend*aDetail.y,aDetail.w);gl_Position=projectionMatrix*mv;
}
`;
const fragment=`
uniform float uFirst;
varying vec3 vNormal,vColor,vPos,vRest,vFlags;varying vec2 vDetail;
void main(){
 if(uFirst>.5&&vFlags.x<.5)discard;
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
function buildPart(T,actor,fullIndex,id){
 const asset=actor.shirtAsset;if(!asset)throw Error('Shirt assets must be preloaded');
 const lease=acquireShirtBinding(T,actor,asset,fullIndex);
 const instance=createGarmentPart(T,actor,lease,id,(pose,skin)=>new T.ShaderMaterial({uniforms:{...pose,uBend:{value:new T.Vector2()},uFirst:{value:0}},vertexShader:vertex(skin),fragmentShader:fragment,side:T.DoubleSide}));
 const {object}=instance,material=object.material,uniforms=material.uniforms;
 object.name=id==='top'?'clothing:top.basic-shirt':'clothing:collar.basic';
 const rotations=attentionRotations(actor.data.bones);
 const ref=['forearm_right','forearm_left'].map(name=>{
  const r=rotations[name];return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().fromArray([r[0],r[1],r[2],0,r[3],r[4],r[5],0,r[6],r[7],r[8],0,0,0,0,1]));
 });
 const update=object.onBeforeRender;
 function updatePose(){
  const bend=(name,i)=>Math.sin(Math.min(2*Math.PI/3,actor.B[name].quaternion.angleTo(ref[i]))*.75);
  uniforms.uBend.value.set(bend('forearm_right',0),bend('forearm_left',1));update();
 }
 object.onBeforeRender=updatePose;object.userData.updateClothingPose=updatePose;
 object.userData.clothingDiagnostics={vertices:asset.meta.vertices,triangles:asset.meta.triangles,sourceJoints:asset.meta.sourceJoints,...object.userData.clothingDiagnostics};
 return {...instance,setFirstPerson(on){uniforms.uFirst.value=on?1:0;object.visible=id==='top'||!on;}};
}
export function buildShirt(T,actor,fullIndex){return buildPart(T,actor,fullIndex,'top');}
export function buildShirtCollar(T,actor,fullIndex){return buildPart(T,actor,fullIndex,'collar');}
