import {gaitPhaseStep,gripFrame} from './avatar-motion.js';
import {createSchoolyardMotion} from './schoolyard-motion.js';
// Immutable geometry attributes can be shared by identical character profiles.
const geometryPools=new WeakMap();
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
 // Typed-array assembly. Level 0 owns the vertex buffer; levels 1-2 and the
 // first-person arm list reference a subset of the same vertices.
 const pool=geometryPools.get(factory)??new Map();
 geometryPools.set(factory,pool);
 // Pose is animation state, not geometry. Identical faces still share buffers.
 const geometryKey=JSON.stringify({...profile,pose:undefined});
 let shared=pool.get(geometryKey),geometry,lodIndex,firstIndex;
 // Full appearance equality is required: never share a modified face with another NPC.
 if(shared){
  geometry=new T.BufferGeometry();
  for(const [name,attribute] of Object.entries(shared.template.attributes))geometry.setAttribute(name,attribute);
  geometry.setIndex(shared.lodIndex[0]);
  geometry.boundingBox=shared.template.boundingBox.clone();
  lodIndex=shared.lodIndex;firstIndex=shared.firstIndex;
  shared.geometries.add(geometry);shared.users++;
 }else{
 const lod=factory.source.lod,bodyLod=lod?.bodies?.[profile.body]??null;
 const unpack=(encoded)=>{const bin=atob(encoded),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return new Uint32Array(u.buffer);};
 const sources=[];
 data.parts.forEach((part,k)=>{
  const full=body.indices.subarray(part.start,part.start+part.count);
  const levels=bodyLod?bodyLod.levels.map(l=>unpack(l[k])):[full,null,null];
  sources.push({levels,p:body.worldPositions,n:body.normals,ji:body.joints,we:body.weights,pal:part.skin,isSkin:true,col:null,material:null});
 });
 for(const f of features){
  const reduced=lod?.features?.[f.key];
  // Facial features: the 40% list is visually identical at speaking distance.
  const levels=reduced?(()=>{const [near,far]=reduced.map(unpack);return [near,far,far];})():[f.indices,f.indices,f.indices];
  sources.push({levels,p:f.positions,n:f.normals,ji:f.jointIds,we:f.weights,pal:f.skins,isSkin:f.skin??true,col:f.colors,material:f.material});
 }
 let vertexCount=0;
 const marks=sources.map(src=>{
  const remap=new Int32Array(src.p.length/3).fill(-1);
  for(const id of src.levels[0])if(remap[id]<0)remap[id]=vertexCount++;
  return remap;
 });
 const position=new Float32Array(vertexCount*3),normal=new Float32Array(vertexCount*3),color=new Float32Array(vertexCount*3);
 // Preserve the original 8-bit studio weights exactly. The normalized vertex
 // attribute restores weight/255 on the GPU without 32-bit weight buffers.
 // All 47 bone indices fit in an unnormalized uint8 vertex attribute.
 const skinWeight=new Uint8Array(vertexCount*4),skinIndex=new Uint8Array(vertexCount*4),aSkin=new Uint8Array(vertexCount),aArm=new Uint8Array(vertexCount);
 const armBone=new Uint8Array(data.bones.length);
 data.bones.forEach((b,i)=>{armBone[i]=/arm|hand|thumb|index|middle|ring|pinky/.test(b.id)?1:0;});
 sources.forEach((src,s)=>{
  const remap=marks[s],base=src.material?.pbrMetallicRoughness?.baseColorFactor??[1,1,1],palette=src.pal.map(name=>boneIndex.get(name)??0);
  for(let id=0;id<remap.length;id++){
   const v=remap[id];if(v<0)continue;
   for(let k=0;k<3;k++){position[v*3+k]=src.p[id*3+k];normal[v*3+k]=src.n[id*3+k];color[v*3+k]=base[k]*(src.col?.[id*3+k]??1);}
   let arm=0;
   for(let k=0;k<4;k++){const bone=palette[src.ji[id*4+k]]??0,w=src.we[id*4+k]/255;skinIndex[v*4+k]=bone;skinWeight[v*4+k]=src.we[id*4+k];if(armBone[bone])arm+=src.we[id*4+k];}
   aArm[v]=Math.min(255,arm);aSkin[v]=src.isSkin?255:0;
  }
 });
 const IndexArray=vertexCount<=65536?Uint16Array:Uint32Array;
 const levelIndex=level=>{
  let count=0;for(const src of sources)count+=(src.levels[level]??src.levels[0]).length;
  const out=new IndexArray(count);let o=0;
  sources.forEach((src,s)=>{const remap=marks[s];for(const id of src.levels[level]??src.levels[0])out[o++]=remap[id];});
  return out;
 };
 geometry=new T.BufferGeometry();
 for(const [key,values,size] of [['position',position,3],['normal',normal,3],['color',color,3],['skinWeight',skinWeight,4],['aSkin',aSkin,1],['aArm',aArm,1]])
  geometry.setAttribute(key,new T.BufferAttribute(values,size,key==='skinWeight'||key==='aSkin'||key==='aArm'));
 geometry.setAttribute('skinIndex',new T.BufferAttribute(skinIndex,4));
 const fullIndex=new T.BufferAttribute(levelIndex(0),1);
 geometry.setIndex(fullIndex);geometry.computeBoundingBox();
 if(bodyLod)lodIndex=[fullIndex,new T.BufferAttribute(levelIndex(1),1),new T.BufferAttribute(levelIndex(2),1)];
 else{
  // Fallback when the LOD sidecar is missing: vertex clustering (complete surfaces only).
  const indices=fullIndex.array,cluster=cell=>{
   const clusters=new Map(),rep=new Uint32Array(vertexCount);
   for(let i=0;i<vertexCount;i++){
    let dominant=0;for(let k=1;k<4;k++)if(skinWeight[i*4+k]>skinWeight[i*4+dominant])dominant=k;
    const key=Math.round(position[i*3]/cell)+','+Math.round(position[i*3+1]/cell)+','+Math.round(position[i*3+2]/cell)+','+skinIndex[i*4+dominant]+','+aSkin[i]+','+Math.round(color[i*3]*5)+','+Math.round(color[i*3+1]*5)+','+Math.round(color[i*3+2]*5);
    let r=clusters.get(key);if(r===undefined){r=i;clusters.set(key,i);}rep[i]=r;
   }
   const low=[];
   for(let i=0;i<indices.length;i+=3){const a=rep[indices[i]],b=rep[indices[i+1]],c=rep[indices[i+2]];if(a!==b&&b!==c&&a!==c)low.push(a,b,c);}
   return new T.BufferAttribute(IndexArray.from(low),1);
  };
  const low=cluster(.012);lodIndex=[fullIndex,low,low];
 }
 // First person draws only complete triangles touching the arms.
 firstIndex=(()=>{const src=fullIndex.array,out=[];
  for(let i=0;i<src.length;i+=3)if(aArm[src[i]]>127||aArm[src[i+1]]>127||aArm[src[i+2]]>127)out.push(src[i],src[i+1],src[i+2]);
  return new T.BufferAttribute(IndexArray.from(out),1);})();
 shared={template:geometry,lodIndex,firstIndex,users:1,geometries:new Set([geometry])};
 pool.set(geometryKey,shared);
 }
 let distanceLOD=0,firstPerson=false;
 function applyIndex(){
  const target=firstPerson?firstIndex:lodIndex[distanceLOD];
  if(geometry.index!==target)geometry.setIndex(target);
 }
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
 const limits=new Map(data.bones.map(b=>[b.id,b.axes.map(a=>[a.min,a.max])]));
 const handData=Object.fromEntries(data.hands.map(h=>[h.id.split('_')[1],h]));
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
 const thumbOpposition={};
 function grip(side,amount,onHandle=false){
  const hand=handData[side];
  // A closed fist and a cylindrical grasp are different poses. With a handle,
  // the fingers curve around its surface while the thumb must oppose the
  // handle, rather than following its original flexion axis away from it.
  for(const f of hand.fingers)f.joints.forEach((id,i)=>{
   const [min,max]=limits.get(id)[0],thumb=f.id.startsWith('thumb');
   const bend=(thumb&&onHandle) ? .15 : amount;
   const degrees=Math.max(min,Math.min(max,f.flex[i]*bend));
   B[id].quaternion.setFromAxisAngle(axes.get(id)[0],degrees*Math.PI/180);
   if(thumb&&i===0&&onHandle){
    // Anatomical opposition, mirrored in the original rest-pose hand frame.
    // Calibrated from the studio finger pivots: thumb_2 moves from 28 mm away
    // from the shaft to ~15.5 mm on either hand with a 15 mm radius handle.
    const opposing=thumbOpposition[side]??(thumbOpposition[side]=
     new T.Quaternion().setFromAxisAngle(gripFrame(T,api,side).palm,
      (side==='right'?-35:35)*Math.PI/180));
    B[id].quaternion.premultiply(opposing);
   }
  });
 }
 const api={group,model,mesh,B,bones,skeleton,data,rest,units,profile,speed:0,talk:0,phase:0,pose,grip,
  setLOD(i){distanceLOD=Math.max(0,Math.min(2,i|0));applyIndex();},
  get lodLevels(){return lodIndex.map(i=>i.count/3);},
  setShadow(on){mesh.castShadow=on;},
  setFirst(first){firstPerson=Boolean(first);uniforms.uFirst.value=firstPerson?1:0;applyIndex();},
  animate(dt,t){
   // NPCs use the same joint-limit/spring pipeline as the player.
   // Their existing simulation and navigation keep authority over position.
   const speed=Math.max(0,this.speed);
   this.phase+=gaitPhaseStep(speed,dt);
   if(!this._npcLocomotion)this._npcLocomotion={vel:{x:0,z:0},onGround:true,swimming:false,pitch:0,yaw:0};
   this._npcLocomotion.vel.x=speed;
   const motion=this._schoolyardMotion??(this._schoolyardMotion=createSchoolyardMotion(this));
   motion.update(dt,t,this._npcLocomotion,null,{runSpeed:5});
   this.talk=Math.max(0,this.talk-dt);
  },
  dispose(){
   group.removeFromParent();material.dispose();skeleton.dispose();
   // WebGL deletes shared VBOs during geometry.dispose(). Defer disposal until
   // every instance referencing these attributes has been removed.
   if(--shared.users===0){
    for(const g of shared.geometries)g.dispose();
    shared.geometries.clear();
    pool.delete(geometryKey);
   }
  }
 };
 return api;
}
