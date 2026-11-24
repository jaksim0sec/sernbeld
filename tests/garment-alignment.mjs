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
for(const sex of ['male','female']){
 const actor=createStudioModel(T,factory,normalizeStudioCharacter({body:sex})),shirt=actor.clothing.equip('top.basic-shirt'),b=shirt.userData.garmentBinding,asset=actor.shirtAsset;
 const att=attentionRotations(actor.data.bones);
 for(const [name,r] of Object.entries(att))actor.B[name].quaternion.setFromRotationMatrix(new T.Matrix4().fromArray([r[0],r[1],r[2],0,r[3],r[4],r[5],0,r[6],r[7],r[8],0,0,0,0,1]));
 actor.group.updateMatrixWorld(true);
 shirt.userData.updateGarmentPose();
 // Compare the actual native skinned body to the sleeve, not just the
 // rigid garment transform. Use cross-section ray intersections at the
 // same bone-relative height and azimuth.
 const bodyG=actor.mesh.geometry,bodyPositions=bodyG.attributes.position,bodyJoints=bodyG.attributes.skinIndex,bodyWeights=bodyG.attributes.skinWeight;
 function clearance(name,side,s){
  const elbow=actor.B['forearm_'+side].getWorldPosition(new T.Vector3()),wrist=actor.B['hand_'+side].getWorldPosition(new T.Vector3()),axis=wrist.clone().sub(elbow),length=axis.length();axis.normalize();
  const axial=p=>p.clone().sub(elbow).dot(axis)/length;
  const sleeve=new Map(),bins=Array.from({length:32},()=>[]),count=b.rest.length/3;
  for(let i=0;i<count;i++)if(asset.influence[i*4+3]===1&&asset.influence[i*4+2]===s)sleeve.set(i,shirt.userData.deformGarmentVertex(i));
  const index=shirt.geometry.index.array;
  for(let i=0;i<index.length;i+=3){
   const p=sleeve.get(index[i]),q=sleeve.get(index[i+1]),r=sleeve.get(index[i+2]);if(!p||!q||!r)continue;
   const h=[axial(p),axial(q),axial(r)],lo=Math.max(0,Math.floor(Math.min(...h)*32)),hi=Math.min(31,Math.floor(Math.max(...h)*32));
   for(let k=lo;k<=hi;k++)bins[k].push([p,q,r]);
  }
  const arm=new Set(['upper_arm_'+side,'forearm_'+side,'hand_'+side].map(name=>actor.bones.indexOf(actor.B[name])));
  const samples=[[],[],[]],miss=[0,0,0],inside=[0,0,0],v=new T.Vector3(),hit=new T.Vector3(),ray=new T.Ray();
  for(let i=0;i<actor.bodyVertexCount;i++){
   let w=0;for(let k=0;k<4;k++)if(arm.has(bodyJoints.array[i*4+k]))w+=bodyWeights.array[i*4+k]/255;
   if(w<.7||!bodyG.attributes.aSkin.array[i])continue;
   actor.mesh.getVertexPosition(i,v).applyMatrix4(actor.mesh.matrixWorld);
   const t=axial(v);if(t<.04||t>.85)continue;
   const group=t<.28?0:t<.55?1:2,center=elbow.clone().addScaledVector(axis,t*length),dir=v.clone().sub(center),radius=dir.length();
   if(radius<.006)continue;
   ray.set(center,dir.normalize());let best=Infinity;
   for(const tri of bins[Math.floor(t*32)])if(ray.intersectTriangle(...tri,false,hit))best=Math.min(best,hit.distanceTo(center));
   if(!Number.isFinite(best)){miss[group]++;continue;}
   const gap=best-radius;samples[group].push(gap);if(gap<-.004)inside[group]++;
  }
  console.log('SLEEVE CLEARANCE '+sex+' '+side+' '+name+' '+JSON.stringify({bands:samples.map(stats),miss,inside}));
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
 seamError('attention');clearance('attention','right',0);clearance('attention','left',1);
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
  seamError(name);clearance(name,'right',0);clearance(name,'left',1);
  for(const {side,elbow,distal,cuffs} of sides){
   const error=p=>shirt.userData.deformGarmentVertex(p.i).distanceTo(p.local.clone().applyMatrix4(elbow.matrixWorld));
   const d=stats(distal.map(error)),c=stats(cuffs.map(error));
   console.log('FOREARM TRACK '+sex+' '+side+' '+name+' '+JSON.stringify({distal:d,cuff:c}));
   if(d.count<50||d.p95>.012||c.max>.002)errors.push({sex,side,name,d,c});
  }
 }
 actor.dispose();
}
assert.deepEqual(errors,[],'Distal sleeve fails to follow actual forearm frame');
console.log('PASS distal sleeves follow actual final arm transform');
