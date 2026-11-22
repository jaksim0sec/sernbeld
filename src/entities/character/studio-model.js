// Native Three.js skinning of the supplied studio geometry. One material/draw per character.
export function createStudioModel(T, factory, profile, {scale=1}={}){
 const built=factory.build(profile),{body,features,palette,blush,cheek}=built,data=body.data;
 const group=new T.Group(),model=new T.Group();group.add(model);group.scale.setScalar(scale);
 group.name='SERNBELD Studio Character';group.userData.appearance=profile;
 const bones=data.bones.map(b=>{const o=new T.Bone();o.name=b.id;return o;});
 const B=Object.fromEntries(bones.map(b=>[b.name,b]));
 const boneIndex=new Map(data.bones.map((b,i)=>[b.id,i]));
 data.bones.forEach((b,i)=>{
  const parent=data.bones.find(p=>p.id===b.parent);
  bones[i].position.fromArray(b.pivot.map((v,k)=>(v-(parent?.pivot[k]??0))/1428));
  (B[b.parent]??model).add(bones[i]);
 });
 const positions=[],normals=[],joints=[],weights=[],colors=[],skin=[],arms=[],indices=[];
 function append(ix,p,n,ji,we,pal,{skin:isSkin=true,colors:col,material}={}){
  const remap=new Map(),base=material?.pbrMetallicRoughness?.baseColorFactor??[1,1,1];
  for(const id of ix){
   if(!remap.has(id)){
    const target=positions.length/3;remap.set(id,target);
    for(let k=0;k<3;k++){
     positions.push(p[id*3+k]);normals.push(n[id*3+k]);colors.push(base[k]*(col?.[id*3+k]??1));
    }
    let arm=0;
    for(let k=0;k<4;k++){
     const name=pal[ji[id*4+k]],w=we[id*4+k]/255;
     joints.push(boneIndex.get(name)??0);weights.push(w);
     if(/arm|hand|thumb|index|middle|ring|pinky/.test(name))arm+=w;
    }
    arms.push(arm);skin.push(isSkin?1:0);
   }
   indices.push(remap.get(id));
  }
 }
 for(const part of data.parts)append(body.indices.subarray(part.start,part.start+part.count),body.worldPositions,body.normals,body.joints,body.weights,part.skin);
 for(const f of features)append(f.indices,f.positions,f.normals,f.jointIds,f.weights,f.skins,f);
 const geometry=new T.BufferGeometry();
 for(const [key,values,size] of [['position',positions,3],['normal',normals,3],['color',colors,3],['skinWeight',weights,4],['aSkin',skin,1],['aArm',arms,1]])
  geometry.setAttribute(key,new T.BufferAttribute(new Float32Array(values),size));
 geometry.setAttribute('skinIndex',new T.BufferAttribute(new Uint16Array(joints),4));geometry.setIndex(indices);
 geometry.computeBoundingBox();
 // A vertex-cluster LOD keeps complete surfaces at distance; never skip arbitrary triangles.
 const fullIndex=geometry.index,clusters=new Map(),remap=new Uint32Array(positions.length/3);
 for(let i=0;i<remap.length;i++){
  let dominant=0;for(let k=1;k<4;k++)if(weights[i*4+k]>weights[i*4+dominant])dominant=k;
  const key=[...positions.slice(i*3,i*3+3).map(v=>Math.round(v/.012)),joints[i*4+dominant],skin[i],...colors.slice(i*3,i*3+3).map(v=>Math.round(v*5))].join(',');
  if(!clusters.has(key))clusters.set(key,i);remap[i]=clusters.get(key);
 }
 const low=[];
 for(let i=0;i<indices.length;i+=3){const a=remap[indices[i]],b=remap[indices[i+1]],c=remap[indices[i+2]];if(a!==b&&b!==c&&a!==c)low.push(a,b,c);}
 const lowIndex=new T.BufferAttribute(new Uint32Array(low),1);
 const height=geometry.boundingBox.max.y-geometry.boundingBox.min.y;
 const units=1.76/height;
 // Keep the model's original pivot coordinate system. Feet, not the pelvis, anchor the actor.
 model.scale.setScalar(units);model.position.y=-geometry.boundingBox.min.y*units;
 const vecColor=hex=>new T.Color(hex);
 const uniforms={uSkinLight:{value:vecColor(palette.light)},uSkinShadow:{value:vecColor(palette.shadow)},
  uHeadOffset:{value:new T.Vector3(...data.headOffset.map(x=>x/1428))},uHeadScale:{value:new T.Vector3(...data.face.scale.map(x=>x/(32*1428)))},
  uCheekCenter:{value:new T.Vector3(...cheek)},uBlushColor:{value:vecColor(blush.color)},uBlushStrength:{value:blush.strength},
  uHeadForward:{value:new T.Vector3(0,0,1)},uFirst:{value:0}};
 const material=new T.ShaderMaterial({uniforms,side:T.DoubleSide,vertexShader:`
 #include <common>
 #include <skinning_pars_vertex>
 attribute vec3 color;
 attribute float aSkin,aArm;
 varying vec3 vNormal,vWorldNormal,vLocal,vColor;
 varying float vSkin,vArm;
 uniform vec3 uHeadOffset,uHeadScale;
 void main(){
  vec3 objectNormal=normal;
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  vec3 transformed=position;
  #include <skinning_vertex>
  vNormal=normalize(normalMatrix*objectNormal);
  vWorldNormal=normalize(mat3(modelMatrix)*objectNormal);
  vLocal=(position-uHeadOffset)/uHeadScale;
  vColor=color;vSkin=aSkin;vArm=aArm;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(transformed,1.);
 }`,fragmentShader:`
 varying vec3 vNormal,vWorldNormal,vLocal,vColor;
 varying float vSkin,vArm;
 uniform vec3 uSkinLight,uSkinShadow,uHeadForward,uCheekCenter,uBlushColor;
 uniform float uBlushStrength,uFirst;
 void main(){
  if(uFirst>.5&&vArm<.5)discard;
  vec3 wn=normalize(vWorldNormal);
  float neckMask=smoothstep(.22,.31,vLocal.z)*(1.-smoothstep(.24,.36,abs(vLocal.x)))*smoothstep(-.66,-.58,vLocal.y)*(1.-smoothstep(.02,.14,vLocal.y));
  wn=normalize(mix(wn,uHeadForward,neckMask*.38));
  vec3 vn=normalize(mat3(viewMatrix)*wn);
  float tone=smoothstep(.158,.205,dot(vn,normalize(vec3(-.42,.68,.61))));
  vec3 skin=mix(uSkinShadow,uSkinLight,tone);
  float chin=smoothstep(.14,.30,vLocal.z)*(1.-smoothstep(.16,.34,abs(vLocal.x)))*smoothstep(.14,.26,-vLocal.y)*(1.-smoothstep(.30,.46,-vLocal.y));
  float bridge=smoothstep(.18,.30,vLocal.z)*(1.-smoothstep(.24,.42,abs(vLocal.x)))*smoothstep(.34,.46,-vLocal.y)*(1.-smoothstep(.52,.66,-vLocal.y));
  skin=mix(skin,uSkinShadow,.18*chin+.10*bridge);
  vec2 cheek=vec2((abs(vLocal.x)-abs(uCheekCenter.x))/.085,(vLocal.y-uCheekCenter.y)/.065);
  skin=mix(skin,uBlushColor,exp(-dot(cheek,cheek))*smoothstep(.20,.30,vLocal.z)*uBlushStrength);
  gl_FragColor=vec4(mix(vColor,skin,vSkin),1.);
  #include <colorspace_fragment>
 }`});
 const mesh=new T.SkinnedMesh(geometry,material);mesh.name='studio-body-and-face';
 model.add(mesh);model.updateMatrixWorld(true);
 const skeleton=new T.Skeleton(bones);
 mesh.bind(skeleton);mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;
 mesh.userData.studioFeatures=features.map(f=>f.extra);mesh.userData.faceStrength=body.editor.strength;
 mesh.onBeforeRender=()=>uniforms.uHeadForward.value.set(0,0,1).transformDirection(B.head.matrixWorld);
 const rest=Object.fromEntries(bones.map(b=>[b.name,b.position.clone()]));
 // Rig axes never change. Allocate them once, not once per bone per animation frame.
 const axes=new Map(data.bones.map(b=>[b.id,b.axes.map(a=>new T.Vector3(...a.d))]));
 const rotationStep=new T.Quaternion();
 function pose(angles={}){
  for(const b of data.bones){
   const q=B[b.id].quaternion;q.identity();
   const rotations=angles[b.id],jointAxes=axes.get(b.id);
   if(!rotations)continue;
   for(let i=0;i<jointAxes.length;i++){
    const degrees=rotations[i]??0;
    if(degrees)q.multiply(rotationStep.setFromAxisAngle(jointAxes[i],degrees*Math.PI/180));
   }
  }
 }
 function grip(side,amount){
  const hand=data.hands.find(h=>h.id==='hand_'+side);
  for(const f of hand.fingers)f.joints.forEach((id,i)=>{
   B[id].quaternion.setFromAxisAngle(axes.get(id)[0],f.flex[i]*amount*Math.PI/180);
  });
 }
 const api={group,model,mesh,B,bones,skeleton,data,rest,units,profile,speed:0,talk:0,phase:0,pose,grip,
  setLOD(i){const next=i?lowIndex:fullIndex;if(geometry.index!==next)geometry.setIndex(next);},setShadow(on){mesh.castShadow=on;},setFirst(first){uniforms.uFirst.value=first?1:0;},
  animate(dt,t){
   const w=Math.min(1,this.speed/1.5);this.phase+=dt*this.speed*4.4;
   const sn=Math.sin(this.phase),cs=Math.cos(this.phase);
   pose({thigh_left:[sn*25*w,0],thigh_right:[-sn*25*w,0],shin_left:[Math.max(0,-cs)*38*w],shin_right:[Math.max(0,cs)*38*w],
    upper_arm_left:[-sn*20*w,3],upper_arm_right:[sn*20*w,3],forearm_left:[10+8*w,0],forearm_right:[10+8*w,0],
    ribcage:[Math.sin(t*1.7)*.8+3*w,-sn*4*w],head:[this.talk>0?0:Math.sin(t*.35)*6,this.talk>0?Math.sin(t*7)*3:0]});
   B.pelvis.position.copy(rest.pelvis);B.pelvis.position.y-=Math.abs(cs)*.012*w;
   this.talk=Math.max(0,this.talk-dt);
  },
  dispose(){group.removeFromParent();geometry.dispose();material.dispose();skeleton.dispose();}
 };
 return api;
}
