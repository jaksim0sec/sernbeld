import {attentionRotations} from '../attention-pose.js';

// Clothing stays independent of the character mesh. The approved attention
// pose is the reference frame; the current full game skeleton drives it.
// DQ blending avoids collapsing the circular elbow rings. Four pre-baked
// pose-space corrections per side come from the original cloth solver.
const names=['pelvis','waist','ribcage','neck','upper_arm_right','forearm_right','upper_arm_left','forearm_left'];
const pools=new WeakMap(),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const radians=180/Math.PI;
function referenceRig(T,actor){
 const rotations=attentionRotations(actor.data.bones),world=new Map(),frame=new T.Matrix4().compose(new T.Vector3(0,-actor.mesh.geometry.boundingBox.min.y*actor.units,0),new T.Quaternion(),new T.Vector3().setScalar(actor.units));
 function rest(bone){
  if(world.has(bone.name))return world.get(bone.name);
  const q=new T.Quaternion(),r=rotations[bone.name];
  if(r)q.setFromRotationMatrix(new T.Matrix4().fromArray([r[0],r[1],r[2],0,r[3],r[4],r[5],0,r[6],r[7],r[8],0,0,0,0,1]));
  const local=new T.Matrix4().compose(actor.rest[bone.name],q,new T.Vector3(1,1,1));
  const m=bone.parent?.isBone?rest(bone.parent).clone().multiply(local):local;
  world.set(bone.name,m);return m;
 }
 const matrices=names.map(name=>{if(!actor.B[name])throw Error('Missing shirt bone '+name);return frame.clone().multiply(rest(actor.B[name]));});
 return {inverse:matrices.map(m=>m.clone().invert()),heights:matrices.slice(0,4).map(m=>m.elements[13]),matrices};
}
function torsoWeights(y,heights,collar){
 // Each torso point uses two neighbouring bones; no arm influence for buttons/collar.
 const hi=collar?3:2;
 for(let i=0;i<hi;i++){const a=heights[i],b=heights[i+1];if(y<=b)return [i,i+1,b>a+1e-5?smooth(a,b,y):0];}
 return [hi,hi,0];
}
function makeGeometry(T,asset,heights){
 const {position,normal,color,detail,influence,index,corrections}=asset,n=position.length/3;
 const joints=new Uint8Array(n*4),weights=new Float32Array(n*4);
 for(let i=0;i<n;i++){
  const k=i*4,side=influence[k+2],kind=influence[k+3],arm=4+side*2,s=influence[k]/255,e=influence[k+1]/255;
  const [a,b,t]=torsoWeights(position[i*3+1],heights,kind===2);
  joints.set([a,b,arm,arm+1],k);weights.set([(1-s)*(1-t),(1-s)*t,s*(1-e),s*e],k);
 }
 const g=new T.BufferGeometry();
 for(const [name,array,size,normalized] of [['position',position,3,false],['normal',normal,3,false],['aColor',color,3,true],['aDetail',detail,4,false],['aInfluence',influence,4,false],['aJoint',joints,4,false],['aWeight',weights,4,false],...corrections.map((a,i)=>['aCorrection'+i,a,3,false])])g.setAttribute(name,new T.BufferAttribute(array,size,normalized));
 g.setIndex(new T.BufferAttribute(index,1));g.computeBoundingBox();g.computeBoundingSphere();
 return g;
}
function acquire(T,asset,heights){
 let byT=pools.get(asset);if(!byT){byT=new WeakMap();pools.set(asset,byT);}
 let shared=byT.get(T);if(!shared){shared={geometry:makeGeometry(T,asset,heights),users:0};byT.set(T,shared);}
 shared.users++;
 return {geometry:shared.geometry,release(){if(--shared.users===0){shared.geometry.dispose();byT.delete(T);}}};
}
const transformGLSL=`
attribute vec4 aJoint,aWeight,aInfluence;
attribute vec3 aCorrection0,aCorrection1,aCorrection2,aCorrection3;
uniform vec4 uReal[8],uDual[8],uCorrectRight,uCorrectLeft;
vec4 qmul(vec4 a,vec4 b){return vec4(a.w*b.xyz+b.w*a.xyz+cross(a.xyz,b.xyz),a.w*b.w-dot(a.xyz,b.xyz));}
vec4 qconj(vec4 q){return vec4(-q.xyz,q.w);}
vec3 qrotate(vec4 q,vec3 p){return p+2.*cross(q.xyz,cross(q.xyz,p)+q.w*p);}
void clothingPose(out vec3 p,out vec3 n){
 vec4 a=uReal[int(aJoint.x)],b=uReal[int(aJoint.y)],c=uReal[int(aJoint.z)],d=uReal[int(aJoint.w)];
 vec4 A=uDual[int(aJoint.x)],B=uDual[int(aJoint.y)],C=uDual[int(aJoint.z)],D=uDual[int(aJoint.w)];
 float sb=dot(a,b)<0.?-1.:1.,sc=dot(a,c)<0.?-1.:1.,sd=dot(a,d)<0.?-1.:1.;
 vec4 q=a*aWeight.x+b*(aWeight.y*sb)+c*(aWeight.z*sc)+d*(aWeight.w*sd);
 vec4 dual=A*aWeight.x+B*(aWeight.y*sb)+C*(aWeight.z*sc)+D*(aWeight.w*sd);
 float len=max(length(q),.00001);q/=len;dual/=len;dual-=q*dot(q,dual);
 vec4 k=mix(uCorrectRight,uCorrectLeft,aInfluence.z);
 vec3 rest=position+.00001*(aCorrection0*k.x+aCorrection1*k.y+aCorrection2*k.z+aCorrection3*k.w);
 p=qrotate(q,rest)+2.*qmul(dual,qconj(q)).xyz;n=qrotate(q,normal);
}
`;
const vertex=transformGLSL+`
attribute vec3 aColor;attribute vec4 aDetail;
uniform vec2 uBend;
varying vec3 vNormal,vColor,vPos,vRest,vFlags;varying vec2 vDetail;
void main(){
 vec3 p,n;clothingPose(p,n);vec4 mv=modelViewMatrix*vec4(p,1.);
 vNormal=normalMatrix*n;vPos=mv.xyz;vColor=aColor;vRest=position;
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
 const ref=referenceRig(T,actor),shared=acquire(T,asset,ref.heights);
 const uniforms={uReal:{value:names.map(()=>new T.Vector4(0,0,0,1))},uDual:{value:names.map(()=>new T.Vector4(0,0,0,0))},uCorrectRight:{value:new T.Vector4()},uCorrectLeft:{value:new T.Vector4()},uBend:{value:new T.Vector2()},uFirst:{value:0},uCollar:{value:1}};
 const material=new T.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:fragment,side:T.DoubleSide});
 const object=new T.Mesh(shared.geometry,material);object.name='clothing:top.basic-shirt';
 // The baked vertices are in metres, in the actor's foot-anchored frame.
 object.scale.setScalar(1/actor.units);object.position.y=actor.mesh.geometry.boundingBox.min.y;object.frustumCulled=false;
 // Body continues to supply the existing shadow; do not render undeformed
 // shadow geometry with the stock depth shader.
 object.castShadow=false;object.receiveShadow=false;
 const inverse=new T.Matrix4(),matrix=new T.Matrix4(),p=new T.Vector3(),scale=new T.Vector3(),qs=names.map(()=>new T.Quaternion()),relative=new T.Quaternion(),euler=new T.Euler(0,0,0,'ZXY');
 function updatePose(){
  inverse.copy(object.matrixWorld).invert();
  for(let i=0;i<names.length;i++){
   matrix.multiplyMatrices(inverse,actor.B[names[i]].matrixWorld).multiply(ref.inverse[i]);
   const q=qs[i];matrix.decompose(p,q,scale);q.normalize();
   uniforms.uReal.value[i].set(q.x,q.y,q.z,q.w);
   uniforms.uDual.value[i].set(.5*(p.x*q.w+p.y*q.z-p.z*q.y),.5*(-p.x*q.z+p.y*q.w+p.z*q.x),.5*(p.x*q.y-p.y*q.x+p.z*q.w),-.5*(p.x*q.x+p.y*q.y+p.z*q.z));
  }
  for(let s=0;s<2;s++){
   const arm=4+s*2,sign=s?1:-1;
   relative.copy(qs[2]).invert().multiply(qs[arm]);euler.setFromQuaternion(relative,'ZXY');
   const side=sign*euler.z*radians,front=-euler.x*radians;
   relative.copy(qs[arm]).invert().multiply(qs[arm+1]);euler.setFromQuaternion(relative,'ZXY');
   const bend=Math.abs(euler.x*radians),a=smooth(0,75,side),b=smooth(0,75,front),c=smooth(0,35,-front),w=Math.max(1,a+b+c);
   (s?uniforms.uCorrectLeft:uniforms.uCorrectRight).value.set(a/w,b/w,c/w,smooth(0,90,bend));
   if(s)uniforms.uBend.value.y=Math.sin(Math.min(120,bend)*Math.PI/240);else uniforms.uBend.value.x=Math.sin(Math.min(120,bend)*Math.PI/240);
  }
 }
 object.onBeforeRender=updatePose;
 object.userData.updateClothingPose=updatePose;
 object.userData.clothingDiagnostics={vertices:asset.meta.vertices,triangles:asset.meta.triangles,sourceJoints:asset.meta.sourceJoints,attentionJoints:ref.matrices.slice(4).map(m=>[m.elements[12],m.elements[13],m.elements[14]])};
 let disposed=false;
 return {object,setFirstPerson(on){uniforms.uFirst.value=on?1:0;object.visible=true;},setExternalCollar(on){uniforms.uCollar.value=on?0:1;},dispose(){if(disposed)return;disposed=true;material.dispose();shared.release();}};
}
