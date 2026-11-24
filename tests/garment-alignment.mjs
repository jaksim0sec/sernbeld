import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createStudioGeometry} from '../src/entities/character/studio-geometry.js';
import {createStudioModel} from '../src/entities/character/studio-model.js';
import {normalizeStudioCharacter} from '../src/entities/character/appearance.js';
import {attentionRotations} from '../src/entities/character/attention-pose.js';
import {loadDefaultShirts} from '../src/entities/character/clothing/shirt-source.js';
import {loadDefaultPants} from '../src/entities/character/clothing/pants-source.js';
import {poseGrip} from '../src/entities/character/avatar-motion.js';
import {acquireGarmentBinding} from '../src/entities/character/clothing/garment-binding.js';
import {createGarmentPart} from '../src/entities/character/clothing/garment-pose.js';
const T=new Function(readFileSync('src/vendor/three-gltf.part.js','utf8')+';return three_module_exports;')();
const readGz=p=>JSON.parse(gunzipSync(readFileSync(p)));
const source=readGz('assets/models/characters/studio-v1.json.gz');
source.lod=readGz('assets/models/characters/studio-v1.lod.json.gz');
const fetchLocal=async url=>new Response(readFileSync(url));
[source.defaultShirts,source.defaultPants]=await Promise.all([loadDefaultShirts(fetchLocal),loadDefaultPants(fetchLocal)]);
const baked=readGz('assets/models/clothing/runtime-bindings-v1.json.gz');
source.garmentBakes=baked.bodies;source.garmentLayers=baked.layers;
const factory=createStudioGeometry(source),errors=[];
const stats=a=>{const s=a.slice().sort((a,b)=>a-b);return {count:s.length,min:s[0],p50:s[Math.floor((s.length-1)*.5)],p95:s[Math.floor((s.length-1)*.95)],max:s.at(-1)};};
// Compare the outermost cloth and native skin intersections from the same
// bone-axis plane. Restrict the skin mesh to vertices owned by this forearm.
function forearmFrame(actor,side){
 const origin=actor.B['forearm_'+side].getWorldPosition(new T.Vector3());
 const axis=actor.B['hand_'+side].getWorldPosition(new T.Vector3()).sub(origin);
 const length=axis.length();
 axis.multiplyScalar(1/length);
 const x=new T.Vector3(Math.abs(axis.x)<.8?1:0,Math.abs(axis.x)<.8?0:1,0);
 x.addScaledVector(axis,-x.dot(axis)).normalize();
 return {origin,axis,length,x,z:new T.Vector3().crossVectors(axis,x)};
}
function compareSection(frame,t,skin,skinIndex,cloth,clothIndex){
 const {origin,axis,length,x,z}=frame,center=origin.clone().addScaledVector(axis,t*length),delta=new T.Vector3();
 const triangles=(points,index)=>{
  const slice=[];
  for(let i=0;i<index.length;i+=3){
   const a=points[index[i]],b=points[index[i+1]],c=points[index[i+2]];
   if(!a||!b||!c)continue;
   const ha=delta.subVectors(a,center).dot(axis),hb=delta.subVectors(b,center).dot(axis),hc=delta.subVectors(c,center).dot(axis);
   if(Math.min(ha,hb,hc)<=0&&Math.max(ha,hb,hc)>=0)slice.push([a,b,c]);
  }
  return slice;
 };
 const skinSlice=triangles(skin,skinIndex),clothSlice=triangles(cloth,clothIndex),ray=new T.Ray(),hit=new T.Vector3(),direction=new T.Vector3();
 const outerRadius=triangles=>{
  let radius=0;
  for(const triangle of triangles){
   if(!ray.intersectTriangle(...triangle,false,hit))continue;
   const distance=hit.distanceTo(center);
   if(distance<.12)radius=Math.max(radius,distance);
  }
  return radius;
 };
 const gaps=[];
 for(let i=0;i<32;i++){
  const angle=i*Math.PI/16;
  direction.copy(x).multiplyScalar(Math.cos(angle)).addScaledVector(z,Math.sin(angle));
  ray.set(center,direction);
  const skinRadius=outerRadius(skinSlice),clothRadius=outerRadius(clothSlice);
  if(skinRadius&&clothRadius)gaps.push(clothRadius-skinRadius);
 }
 return {count:gaps.length,min:Math.min(...gaps)};
}
function sampleSleeve({origin,axis,length,x,z}){
 const position=[],normal=[],index=[],sides=18,rings=9;
 for(let row=0;row<rings;row++)for(let i=0;i<sides;i++){
  const angle=i*2*Math.PI/sides,out=x.clone().multiplyScalar(Math.cos(angle)).addScaledVector(z,Math.sin(angle));
  const center=origin.clone().addScaledVector(axis,length*(.24+.68*row/(rings-1))).addScaledVector(x,.035);
  position.push(...center.addScaledVector(out,.042).toArray());normal.push(...out.toArray());
  if(row===rings-1)continue;
  const a=row*sides+i,b=row*sides+(i+1)%sides;
  index.push(a,b,b+sides,a,b+sides,a+sides);
 }
 return {position:Float32Array.from(position),normal:Float32Array.from(normal),index:Uint16Array.from(index)};
}
for(const sex of ['male','female']){
 const actor=createStudioModel(T,factory,normalizeStudioCharacter({body:sex})),shirt=actor.clothing.equip('top.basic-shirt'),b=shirt.userData.garmentBinding,asset=actor.shirtAsset;
 const att=attentionRotations(actor.data.bones);
 for(const [name,r] of Object.entries(att))actor.B[name].quaternion.setFromRotationMatrix(new T.Matrix4().fromArray([r[0],r[1],r[2],0,r[3],r[4],r[5],0,r[6],r[7],r[8],0,0,0,0,1]));
 actor.group.updateMatrixWorld(true);
 shirt.userData.updateGarmentPose();
 const bodyG=actor.mesh.geometry,bodyPositions=bodyG.attributes.position;
 function clearance(name,side,object=shirt,belongs=i=>asset.influence[i*4+3]===1&&asset.influence[i*4+2]===(side==='right'?0:1),samples=[.12,.22,.32,.52,.72,.82]){
  const frame=forearmFrame(actor,side);
  const joint=actor.bones.indexOf(actor.B['forearm_'+side]);
  const skin=Array.from({length:actor.bodyVertexCount},(_,i)=>{
   let weight=0;
   for(let j=i*4;j<i*4+4;j++)if(bodyG.attributes.skinIndex.array[j]===joint)weight+=bodyG.attributes.skinWeight.array[j];
   return weight>=128&&bodyG.attributes.aSkin.array[i]?actor.mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(actor.mesh.matrixWorld):null;
  });
  const cloth=Array.from({length:object.geometry.attributes.position.count},(_,i)=>belongs(i)?object.userData.deformGarmentVertex(i):null);
  const parts=samples.map(t=>compareSection(frame,t,skin,bodyG.index.array,cloth,object.geometry.index.array));
  for(const [i,{count,min}] of parts.entries()){
   const required=samples[i]<.18?27:31;
   assert(count>=required&&min>=-.003,sex+' '+side+' '+name+' at '+samples[i]+' '+JSON.stringify(parts[i]));
  }
  console.log('SLEEVE SECTIONS '+sex+' '+side+' '+name+' '+JSON.stringify(parts));
 }
 // Check native body duplicates at the neck junction independently of the
 // garment. An animated seam may separate even if the rest triangles match.
 const seams=new Map(),neckY=actor.data.bones.find(b=>b.id==='neck').pivot[1]/1428;
 for(let i=0;i<actor.bodyVertexCount;i++){
  const x=bodyPositions.getX(i),y=bodyPositions.getY(i),z=bodyPositions.getZ(i);
  if(Math.abs(y-neckY)>.08)continue;
  const key=[x,y,z].map(v=>Math.round(v*100000)).join(':');
  let ids=seams.get(key);if(!ids)seams.set(key,ids=[]);ids.push(i);
 }
 function seamError(name){
  const gaps=[];
  for(const ids of seams.values())if(ids.length>1){
   const p=actor.mesh.getVertexPosition(ids[0],new T.Vector3()).applyMatrix4(actor.mesh.matrixWorld);
   for(const i of ids.slice(1))gaps.push(p.distanceTo(actor.mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(actor.mesh.matrixWorld)));
  }
  console.log('NECK SEAM '+sex+' '+name+' '+JSON.stringify(stats(gaps)));
 }
 seamError('attention');clearance('attention','right');clearance('attention','left');
 if(sex==='male'){
  // An independently built, offset tube with no shirt channels or source rig.
  const side='right',frame=forearmFrame(actor,side);
  const tube=sampleSleeve(frame),policy={
   limbs:[{parent:'upper_arm_right',joint:'forearm_right',tip:'hand_right'}],
   limbRegion:()=>0
  };
  const lease=acquireGarmentBinding(T,actor,tube,policy,bodyG.index);
  const part=createGarmentPart(T,actor,lease,'main',(uniforms,skin)=>new T.ShaderMaterial({
   uniforms,vertexShader:skin+'void main(){vec3 p,n;garmentPose(p,n);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',
   fragmentShader:'void main(){gl_FragColor=vec4(1.);}'
  }));
  actor.model.add(part.object);
  actor.group.updateMatrixWorld(true);
  part.object.userData.updateGarmentPose();
  clearance('independent sleeve',side,part.object,()=>true,[.32,.52,.72]);
  actor.pose({upper_arm_right:[40,25],forearm_right:[90,0]});
  actor.group.updateMatrixWorld(true);
  part.object.userData.updateGarmentPose();
  clearance('independent sleeve bent',side,part.object,()=>true,[.32,.52,.72]);
  part.object.removeFromParent();
  part.dispose();
  for(const [name,r] of Object.entries(att))actor.B[name].quaternion.setFromRotationMatrix(new T.Matrix4().fromArray([r[0],r[1],r[2],0,r[3],r[4],r[5],0,r[6],r[7],r[8],0,0,0,0,1]));
  actor.group.updateMatrixWorld(true);
  shirt.userData.updateGarmentPose();
 }
 const sides=['right','left'].map((side,s)=>{
  const elbow=actor.B['forearm_'+side],wrist=actor.B['hand_'+side],id=actor.bones.indexOf(elbow);
  const E=elbow.getWorldPosition(new T.Vector3()),W=wrist.getWorldPosition(new T.Vector3()),dir=W.clone().sub(E),length=dir.length();dir.normalize();
  const ref=elbow.matrixWorld.clone().invert(),distal=[],cuffs=[],bands=[[],[],[],[]];
  for(let i=0;i<b.rest.length/3;i++){
   if(asset.influence[i*4+3]!==1||asset.influence[i*4+2]!==s)continue;
   const p=shirt.userData.deformGarmentVertex(i),t=p.clone().sub(E).dot(dir)/length;
   let w=0;for(let k=0;k<b.slots;k++)if(b.actual[i*b.slots+k]===id)w+=b.skinWeight[i*b.slots+k];
   const point={i,t,w,local:p.clone().applyMatrix4(ref)};
   if(t>=.45)distal.push(point);
   if(asset.influence[i*4+1]>248)cuffs.push(point);
   const bin=Math.max(0,Math.min(3,Math.floor(t*4)));bands[bin].push(w);
  }
  console.log('FOREARM REF '+sex+' '+side+' '+JSON.stringify({E:E.toArray(),W:W.toArray(),length,distal:stats(distal.map(v=>v.w)),cuffT:stats(cuffs.map(v=>v.t)),bands:bands.map(stats)}));
  return {side,elbow,distal,cuffs};
 });
 for(const [name,pose] of [['bend',{upper_arm_right:[40,25],forearm_right:[90,0],upper_arm_left:[45,25],forearm_left:[90,0]}],['twist',{upper_arm_right:[30,50],forearm_right:[70,25],upper_arm_left:[30,50],forearm_left:[70,25],head:[25,30],neck:[20,10]}],['game IK',null]]){
  actor.pose(pose??{});
  actor.group.updateMatrixWorld(true);
  if(!pose)poseGrip(T,actor,'right',new T.Vector3(-.22,1.28,.38),new T.Vector3(.1,.8,.6).normalize(),new T.Vector3(1,0,0),new T.Vector3(-1,-.7,-.2));
  actor.group.updateMatrixWorld(true);shirt.userData.updateGarmentPose();
  seamError(name);clearance(name,'right');clearance(name,'left');
  for(const {side,elbow,distal,cuffs} of sides){
   const error=p=>shirt.userData.deformGarmentVertex(p.i).distanceTo(p.local.clone().applyMatrix4(elbow.matrixWorld));
   const d=stats(distal.map(error)),c=stats(cuffs.map(error));
   console.log('FOREARM TRACK '+sex+' '+side+' '+name+' '+JSON.stringify({distal:d,cuff:c}));
   if(d.count<50||d.p95>.012||c.max>.002)errors.push({sex,side,name,d,c});
  }
 }
 for(const [name,speed] of [['walk',2.6],['run',5]]){
  actor.speed=speed;
  for(let frame=0;frame<21;frame++)actor.animate(1/60,frame/60);
  actor.group.updateMatrixWorld(true);shirt.userData.updateGarmentPose();
  for(const side of ['right','left'])clearance(name,side);
 }
 for(const level of [1,2]){
  actor.setLOD(level);
  for(const side of ['right','left'])clearance('run LOD'+level,side,shirt,undefined,[.22,.32,.52,.72,.82]);
 }
 actor.dispose();
}
assert.deepEqual(errors,[],'Distal sleeve fails to follow actual forearm frame');
console.log('PASS distal sleeves follow actual final arm transform');

console.warn('PARTIAL garment clearance: diagnostic only; complete skin fit is not asserted');
