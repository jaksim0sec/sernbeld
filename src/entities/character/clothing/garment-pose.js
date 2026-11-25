// Reference-space dual-quaternion skinning driven by the final game bones.
export function garmentSkinningGLSL(count,slots=4,linearBlend=0){
 if(!Number.isInteger(count)||count<1||count>64||![4,8].includes(slots))throw Error('Invalid garment bone palette');
 if(!Number.isFinite(linearBlend)||linearBlend<0||linearBlend>1)throw Error('Invalid garment pose blend');
 return `
attribute vec4 aJoint,aWeight;
${slots===8?'attribute vec4 aJointExtra,aWeightExtra;':''}
uniform vec4 uGarmentReal[${count}],uGarmentDual[${count}];
vec4 garmentMul(vec4 a,vec4 b){return vec4(a.w*b.xyz+b.w*a.xyz+cross(a.xyz,b.xyz),a.w*b.w-dot(a.xyz,b.xyz));}
vec3 garmentRotate(vec4 q,vec3 p){return p+2.*cross(q.xyz,cross(q.xyz,p)+q.w*p);}
vec4 blendReal(vec4 j,vec4 w){return uGarmentReal[int(j.x)]*w.x+uGarmentReal[int(j.y)]*w.y+uGarmentReal[int(j.z)]*w.z+uGarmentReal[int(j.w)]*w.w;}
vec4 blendDual(vec4 j,vec4 w){return uGarmentDual[int(j.x)]*w.x+uGarmentDual[int(j.y)]*w.y+uGarmentDual[int(j.z)]*w.z+uGarmentDual[int(j.w)]*w.w;}
${linearBlend>0?`uniform mat4 uGarmentLinear[${count}];
mat4 garmentLinear(vec4 j,vec4 w){return uGarmentLinear[int(j.x)]*w.x+uGarmentLinear[int(j.y)]*w.y+uGarmentLinear[int(j.z)]*w.z+uGarmentLinear[int(j.w)]*w.w;}`:''}
void garmentPose(out vec3 p,out vec3 n){
 vec4 q=blendReal(aJoint,aWeight),dual=blendDual(aJoint,aWeight);
 ${slots===8?'if(aWeightExtra.x>0.){q+=blendReal(aJointExtra,aWeightExtra);dual+=blendDual(aJointExtra,aWeightExtra);}':''}
 float len=max(length(q),1.e-6);q/=len;dual/=len;dual-=q*dot(q,dual);
 p=garmentRotate(q,position)+2.*garmentMul(dual,vec4(-q.xyz,q.w)).xyz;
 n=garmentRotate(q,normal);
 ${linearBlend>0?`mat4 linear=garmentLinear(aJoint,aWeight);
 ${slots===8?'if(aWeightExtra.x>0.)linear+=garmentLinear(aJointExtra,aWeightExtra);':''}
 p=mix(p,(linear*vec4(position,1.)).xyz,${linearBlend.toFixed(4)});
 n=normalize(mix(n,mat3(linear)*normal,${linearBlend.toFixed(4)}));`:''}
}
`;
}
const states=new WeakMap();
export function acquireGarmentPose(T,actor,binding){
 let map=states.get(actor);if(!map)states.set(actor,map=new Map());
 let state=map.get(binding);
 if(!state){
  const {boneIds,ref,slots}=binding,real=boneIds.map(()=>new T.Vector4(0,0,0,1)),dual=boneIds.map(()=>new T.Vector4(0,0,0,0));
  const palette=new Map(boneIds.map((id,i)=>[actor.bones[id],i]));
  const parents=boneIds.map(id=>{let p=actor.bones[id].parent;while(p?.isBone){if(palette.has(p))return palette.get(p);p=p.parent;}return -1;});
  const depth=i=>parents[i]<0?0:1+depth(parents[i]);
  const signOrder=boneIds.map((_,i)=>i).sort((a,b)=>depth(a)-depth(b));
  const m=new T.Matrix4(),inverse=new T.Matrix4(),p=new T.Vector3(),q=new T.Quaternion(),scale=new T.Vector3(),r=new T.Quaternion(),d=new T.Quaternion(),conj=new T.Quaternion(),tmp=new T.Vector3();
  const linearBlend=binding.poseLinearBlend??0,linear=linearBlend?boneIds.map(()=>new T.Matrix4()):null,unitScale=new T.Vector3(1,1,1),linearPoint=new T.Vector3(),sample=new T.Vector3();
  const uniforms={uGarmentReal:{value:real},uGarmentDual:{value:dual}};
  if(linear)uniforms.uGarmentLinear={value:linear};
  function update(){
   // The world matrices are final (including IK). Cancel the actor's world
   // translation/rotation/scale so all deltas remain in garment metres.
   inverse.copy(actor.model.matrixWorld).invert();inverse.premultiply(ref.frame);
   for(let i=0;i<boneIds.length;i++){
    const b=boneIds[i];m.multiplyMatrices(inverse,actor.bones[b].matrixWorld).multiply(ref.inverseBones[b]);
    m.decompose(p,q,scale);q.normalize();
    if(linear)linear[i].compose(p,q,unitScale);
    real[i].set(q.x,q.y,q.z,q.w);
    dual[i].set(.5*(p.x*q.w+p.y*q.z-p.z*q.y),.5*(-p.x*q.z+p.y*q.w+p.z*q.x),.5*(p.x*q.y-p.y*q.x+p.z*q.w),-.5*(p.x*q.x+p.y*q.y+p.z*q.z));
   }
   // Quaternion signs are chosen once along the bone hierarchy. Per-vertex
   // dominant-bone sign choices can flip discontinuously between neighbors.
   for(const i of signOrder){
    const parent=parents[i],negative=parent<0?real[i].w<0:real[i].dot(real[parent])<0;
    if(negative){real[i].multiplyScalar(-1);dual[i].multiplyScalar(-1);}
   }
  }
  // CPU counterpart of the exact shader, for objective deformation tests.
  // Caller updates matrices and pose once before sampling a frame.
  function deformVertex(i,out=new T.Vector3()){
   const j=i*slots,ids=binding.joints,w=binding.skinWeight;
   let rx=0,ry=0,rz=0,rw=0,dx=0,dy=0,dz=0,dw=0;
   for(let k=0;k<slots;k++){
    const id=ids[j+k],a=real[id],b=dual[id],weight=w[j+k];
    rx+=a.x*weight;ry+=a.y*weight;rz+=a.z*weight;rw+=a.w*weight;
    dx+=b.x*weight;dy+=b.y*weight;dz+=b.z*weight;dw+=b.w*weight;
   }
   const len=Math.max(1e-6,Math.hypot(rx,ry,rz,rw));
   rx/=len;ry/=len;rz/=len;rw/=len;dx/=len;dy/=len;dz/=len;dw/=len;
   const dot=rx*dx+ry*dy+rz*dz+rw*dw;
   r.set(rx,ry,rz,rw);d.set(dx-rx*dot,dy-ry*dot,dz-rz*dot,dw-rw*dot);
   conj.copy(r).conjugate();d.multiply(conj);
   out.fromArray(binding.rest,i*3).applyQuaternion(r).add(tmp.set(d.x*2,d.y*2,d.z*2));
   if(linear){linearPoint.set(0,0,0);for(let k=0;k<slots;k++){const weight=w[j+k];if(weight>0)linearPoint.addScaledVector(sample.fromArray(binding.rest,i*3).applyMatrix4(linear[ids[j+k]]),weight);}out.lerp(linearPoint,linearBlend);}
   return out;
  }
  state={users:0,uniforms,update,deformVertex};map.set(binding,state);
 }
 state.users++;
 let released=false;
 return {...state,release(){if(released)return;released=true;if(--state.users===0)map.delete(binding);}};
}
export function createGarmentPart(T,actor,lease,id,materialFactory){
 const {shared}=lease,geometry=shared.parts.get(id);if(!geometry){lease.release();throw Error('Unknown garment part '+id);}
 const pose=acquireGarmentPose(T,actor,shared);
 let material,object;
 try{
  material=materialFactory(pose.uniforms,garmentSkinningGLSL(shared.boneIds.length,shared.slots,shared.poseLinearBlend??0));
  object=new T.Mesh(geometry,material);
  // Transform from the shared garment reference frame into the actor's
  // actual model-local coordinates; face morphs do not require a new binding.
  const frame=shared.ref.frame.elements,units=frame[0];
  object.scale.setScalar(1/units);object.position.y=-frame[13]/units;
  object.frustumCulled=false;object.castShadow=false;object.receiveShadow=false;
 }catch(err){pose.release();lease.release();material?.dispose();throw err;}
 object.onBeforeRender=()=>{pose.update();material.uniformsNeedUpdate=true;};
 object.userData.updateGarmentPose=pose.update;
 object.userData.deformGarmentVertex=(i,out)=>pose.deformVertex(i,out).applyMatrix4(object.matrixWorld);
 object.userData.garmentBinding=shared;
 object.userData.clothingDiagnostics=shared.diagnostics;
 object.userData.referenceRest=shared.rest;
 let disposed=false;
 return {object,bodyCoverage:shared.masks.get(id),firstPersonCoverage:shared.firstMasks.get(id),setLOD(level){const levels=shared.partLods.get(id);const next=levels[Math.min(levels.length-1,Math.max(0,level|0))];if(object.geometry!==next)object.geometry=next;},dispose(){if(disposed)return;disposed=true;material.dispose();pose.release();lease.release();}};
}
