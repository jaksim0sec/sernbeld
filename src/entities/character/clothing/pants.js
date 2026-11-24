import {acquireGarmentBinding} from './garment-binding.js';
import {createGarmentPart} from './garment-pose.js';

// Anatomical lower-body policy using the shared garment pipeline. Use the
// real leg pivots, not the viewer's fixed knee height for skinning.
const policies=new WeakMap();
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
function bindingPolicy(actor,asset){
 let map=policies.get(actor.data);if(!map)policies.set(actor.data,map=new Map());
 const key=asset.meta.sex+':'+actor.units.toFixed(6)+':'+actor.mesh.geometry.boundingBox.min.y.toFixed(6);
 if(map.has(key))return map.get(key);
 const sides=['left','right'],pivot=name=>actor.data.bones.find(b=>b.id===name).pivot;
 const frameY=name=>(pivot(name)[1]/1428-actor.mesh.geometry.boundingBox.min.y)*actor.units;
 const leftSign=Math.sign(pivot('thigh_left')[0]-pivot('thigh_right')[0])||1;
 const knee=sides.map(side=>frameY('shin_'+side));
 const {hem,top,crotch}=asset.meta;
 const sideOf=x=>x*leftSign>=0?0:1;
 const policy=Object.freeze({
  regions:sides.map(side=>['thigh_'+side,'shin_'+side,'foot_'+side]),
  guide(i,a){const x=a.position[i*3],y=a.position[i*3+1];return {region:sideOf(x),amount:1-smooth(crotch-.09,crotch+.06,y)};},
  constrain(i,a,weights,bones){
   const x=a.position[i*3],y=a.position[i*3+1],side=sideOf(x),other=1-side;
   const pelvis=bones.get('pelvis'),waist=bones.get('waist');
   // The waistband tracks the same torso bones as the shirt. Never allow
   // foot or opposite-leg influences to stretch the lower trouser cuff.
   const torsoWeight=smooth(crotch-.13,top-.055,y);
   const torsoTotal=weights[pelvis]+weights[waist];
   const waistShare=torsoTotal>1e-8?Math.max(0,Math.min(1,weights[waist]/torsoTotal)):0;
   const across=.5*(1-smooth(0,.075,Math.abs(x)))*smooth(crotch-.015,crotch+.09,y);
   weights.fill(0);
   weights[pelvis]=torsoWeight*(1-waistShare);weights[waist]=torsoWeight*waistShare;
   for(const [s,mix] of [[side,1-across],[other,across]]){
    const w=(1-torsoWeight)*mix,shin=1-smooth(knee[s]-.11,knee[s]+.12,y);
    weights[bones.get('shin_'+sides[s])]=w*shin;
    weights[bones.get('thigh_'+sides[s])]=w*(1-shin);
   }
   if(y<=hem+.014){
    weights.fill(0);weights[bones.get('shin_'+sides[side])]=1;return true;
   }
   return false;
  },
  fit:()=>true,smoothing:8,gradientLimit:16,maxInfluences:8,
  attributes:a=>[['aRest',a.position,3,false],['aDetail',a.detail,4,false]],
  parts:[{id:'main',accept:()=>true,coverage:()=>true}]
 });
 map.set(key,policy);return policy;
}

const vertex=skin=>`
${skin}
attribute vec3 aRest;attribute vec4 aDetail;
varying vec3 vNormal,vPos,vRest;varying vec2 vDetail;
void main(){
 vec3 p,n;garmentPose(p,n);
 vec4 mv=modelViewMatrix*vec4(p,1.);
 vNormal=normalMatrix*n;vPos=mv.xyz;vRest=aRest;vDetail=vec2(aDetail.x,aDetail.w);
 gl_Position=projectionMatrix*mv;
}
`;
// Adapt the supplied trousers shader; preserve the original wrinkle height,
// inset pocket, lip, stitches, dye and filtered weave in rest space.
const fragment=`
uniform vec3 uColor;uniform float uPantsTop;
varying vec3 vNormal,vPos,vRest;varying vec2 vDetail;
void main(){
 vec3 V=normalize(-vPos),N=normalize(vNormal+vec3(0.,0.,.000001));if(dot(N,V)<0.)N=-N;
 float down=uPantsTop-vRest.y;
 float angle=atan(abs(vRest.x),vRest.z-.045);
 float t=clamp((down-.047)/.136,0.,1.),path=.64+.98*t-.10*sin(3.14159265*t);
 float mouth=(angle-path)*.105*.82,pocketAA=clamp(fwidth(mouth)*.65,.00055,.0022);
 float mouthSpan=smoothstep(.047,.054,down)*(1.-smoothstep(.174,.183,down));
 float opening=(1.-smoothstep(.00115,.00245+pocketAA,abs(mouth)))*mouthSpan;
 float lip=(1.-smoothstep(.0005,.0017+pocketAA,abs(mouth+.0038)))*mouthSpan;
 float stitchBand=(1.-smoothstep(.0003,.0009+pocketAA,abs(mouth+.0075)))*mouthSpan;
 float stitchPhase=down*1450.,stitchMask=smoothstep(-.2,.45,cos(stitchPhase));
 stitchMask=mix(stitchMask,.5,smoothstep(.6,2.8,fwidth(stitchPhase)));
 float tension=exp(-pow((mouth+.013)/.012,2.))*mouthSpan;
 float pocketRelief=lip*.00042-opening*.00075+tension*.00032;
 vec3 C=N,px=dFdx(vPos),py=dFdy(vPos),sx=cross(py,N),sy=cross(N,px);
 float det=dot(px,sx),hx=dFdx(vDetail.x+pocketRelief),hy=dFdy(vDetail.x+pocketRelief);
 if(abs(det)>1.e-12){vec3 grad=(sx*hx+sy*hy)/det;float len=length(grad);C=normalize(N-grad*min(1.,.78/max(len,.00001)));}
 vec3 L=normalize(vec3(-.43,.69,.66));float lit=dot(C,L),band=smoothstep(-.24,.78,lit),soft=clamp(lit*.5+.5,0.,1.);
 vec3 shade=mix(vec3(.59,.57,.55),vec3(1.01,1.00,.985),band)*(.92+.08*soft);
 vec3 phase=vRest*1010.,footprint=fwidth(phase),fade=1.-smoothstep(vec3(.55),vec3(2.9),footprint),q=sin(phase)*fade,blend=abs(N);
 blend/=max(dot(blend,vec3(1.)),.0001);
 float grain=dot(blend,vec3(q.y*q.z,q.x*q.z,q.x*q.y)),crease=clamp(vDetail.y,0.,1.);
 vec3 cloth=uColor*shade*(1.-.22*crease+.025*grain);
 float dye=.5*sin(vRest.y*58.+sin(vRest.x*47.)*1.7)+.3*sin(vRest.x*87.+vRest.z*61.)+.2*sin(vRest.y*119.+vRest.z*83.);
 vec3 thread=vRest*vec3(1370.,1110.,1370.),tw=1.-smoothstep(vec3(.55),vec3(2.7),fwidth(thread)),fiber=sin(thread)*tw;
 float yarn=dot(blend,vec3(fiber.y*fiber.z,fiber.x*fiber.z,fiber.x*fiber.y));
 cloth*=1.+.025*dye+.042*yarn+.023*grain;
 cloth*=1.-.48*opening+.055*lip-.12*stitchBand*stitchMask-.018*tension;
 gl_FragColor=vec4(max(cloth,0.),1.);
 #include <colorspace_fragment>
}
`;
export function buildPants(T,actor,fullIndex){
 const asset=actor.pantsAsset;if(!asset)throw Error('Pants assets must be preloaded');
 const lease=acquireGarmentBinding(T,actor,asset,bindingPolicy(actor,asset),fullIndex);
 const instance=createGarmentPart(T,actor,lease,'main',(uniforms,skin)=>new T.ShaderMaterial({
  uniforms:{...uniforms,uColor:{value:new T.Color('#806e59')},uPantsTop:{value:asset.meta.top}},
  vertexShader:vertex(skin),fragmentShader:fragment,side:T.DoubleSide
 }));
 instance.object.name='clothing:pants.basic-trousers';
 return {...instance,setFirstPerson(on){instance.object.visible=!on;}};
}
