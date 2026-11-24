// Reference-space dual-quaternion skinning driven by the final game bones.
export function garmentSkinningGLSL(count){
 if(!Number.isInteger(count)||count<1||count>64)throw Error('Invalid garment bone palette');
 return `
attribute vec4 aJoint,aWeight;
uniform vec4 uGarmentReal[${count}],uGarmentDual[${count}];
vec4 garmentMul(vec4 a,vec4 b){return vec4(a.w*b.xyz+b.w*a.xyz+cross(a.xyz,b.xyz),a.w*b.w-dot(a.xyz,b.xyz));}
vec3 garmentRotate(vec4 q,vec3 p){return p+2.*cross(q.xyz,cross(q.xyz,p)+q.w*p);}
void garmentPose(out vec3 p,out vec3 n){
 vec4 a=uGarmentReal[int(aJoint.x)],b=uGarmentReal[int(aJoint.y)],c=uGarmentReal[int(aJoint.z)],d=uGarmentReal[int(aJoint.w)];
 vec4 A=uGarmentDual[int(aJoint.x)],B=uGarmentDual[int(aJoint.y)],C=uGarmentDual[int(aJoint.z)],D=uGarmentDual[int(aJoint.w)];
 vec3 s=vec3(dot(a,b)<0.?-1.:1.,dot(a,c)<0.?-1.:1.,dot(a,d)<0.?-1.:1.);
 vec4 q=a*aWeight.x+b*(aWeight.y*s.x)+c*(aWeight.z*s.y)+d*(aWeight.w*s.z);
 vec4 dual=A*aWeight.x+B*(aWeight.y*s.x)+C*(aWeight.z*s.y)+D*(aWeight.w*s.z);
 float len=max(length(q),1.e-6);q/=len;dual/=len;dual-=q*dot(q,dual);
 p=garmentRotate(q,position)+2.*garmentMul(dual,vec4(-q.xyz,q.w)).xyz;
 n=garmentRotate(q,normal);
}
`;
}
const states=new WeakMap();
export function acquireGarmentPose(T,actor,binding){
 let map=states.get(actor);if(!map)states.set(actor,map=new Map());
 let state=map.get(binding);
 if(!state){
  const {boneIds,ref}=binding,real=boneIds.map(()=>new T.Vector4(0,0,0,1)),dual=boneIds.map(()=>new T.Vector4(0,0,0,0));
  const m=new T.Matrix4(),inverse=new T.Matrix4(),p=new T.Vector3(),q=new T.Quaternion(),scale=new T.Vector3(),r=new T.Quaternion(),d=new T.Quaternion(),conj=new T.Quaternion(),anchor=new T.Vector4(),tmp=new T.Vector3();
  const uniforms={uGarmentReal:{value:real},uGarmentDual:{value:dual}};
  function update(){
   // The world matrices are final (including IK). Cancel the actor's world
   // translation/rotation/scale so all deltas remain in garment metres.
   inverse.copy(actor.model.matrixWorld).invert();inverse.premultiply(ref.frame);
   for(let i=0;i<boneIds.length;i++){
    const b=boneIds[i];m.multiplyMatrices(inverse,actor.bones[b].matrixWorld).multiply(ref.inverseBones[b]);
    m.decompose(p,q,scale);q.normalize();
    real[i].set(q.x,q.y,q.z,q.w);
    dual[i].set(.5*(p.x*q.w+p.y*q.z-p.z*q.y),.5*(-p.x*q.z+p.y*q.w+p.z*q.x),.5*(p.x*q.y-p.y*q.x+p.z*q.w),-.5*(p.x*q.x+p.y*q.y+p.z*q.z));
   }
  }
  // CPU counterpart of the exact shader, for objective deformation tests.
  // Caller updates matrices and pose once before sampling a frame.
  function deformVertex(i,out=new T.Vector3()){
   const j=i*4,ids=binding.geometry.attributes.aJoint.array,w=binding.skinWeight;
   anchor.copy(real[ids[j]]);let rx=0,ry=0,rz=0,rw=0,dx=0,dy=0,dz=0,dw=0;
   for(let k=0;k<4;k++){
    const id=ids[j+k],a=real[id],b=dual[id],weight=w[j+k]*(anchor.dot(a)<0?-1:1);
    rx+=a.x*weight;ry+=a.y*weight;rz+=a.z*weight;rw+=a.w*weight;
    dx+=b.x*weight;dy+=b.y*weight;dz+=b.z*weight;dw+=b.w*weight;
   }
   const len=Math.max(1e-6,Math.hypot(rx,ry,rz,rw));
   rx/=len;ry/=len;rz/=len;rw/=len;dx/=len;dy/=len;dz/=len;dw/=len;
   const dot=rx*dx+ry*dy+rz*dz+rw*dw;
   r.set(rx,ry,rz,rw);d.set(dx-rx*dot,dy-ry*dot,dz-rz*dot,dw-rw*dot);
   conj.copy(r).conjugate();d.multiply(conj);
   return out.fromArray(binding.rest,i*3).applyQuaternion(r).add(tmp.set(d.x*2,d.y*2,d.z*2));
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
  material=materialFactory(pose.uniforms,garmentSkinningGLSL(shared.boneIds.length));
  object=new T.Mesh(geometry,material);
  object.scale.setScalar(1/actor.units);object.position.y=actor.mesh.geometry.boundingBox.min.y;
  object.frustumCulled=false;object.castShadow=false;object.receiveShadow=false;
 }catch(err){pose.release();lease.release();material?.dispose();throw err;}
 object.onBeforeRender=()=>{pose.update();material.uniformsNeedUpdate=true;};
 object.userData.updateGarmentPose=pose.update;
 object.userData.deformGarmentVertex=(i,out)=>pose.deformVertex(i,out).applyMatrix4(object.matrixWorld);
 object.userData.garmentBinding=shared;
 object.userData.clothingDiagnostics=shared.diagnostics;
 object.userData.referenceRest=shared.rest;
 let disposed=false;
 return {object,bodyCoverage:shared.masks.get(id),firstPersonCoverage:shared.firstMasks.get(id),dispose(){if(disposed)return;disposed=true;material.dispose();pose.release();lease.release();}};
}
