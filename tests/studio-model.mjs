import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createStudioGeometry,controls} from '../src/entities/character/studio-geometry.js';
import {createStudioModel} from '../src/entities/character/studio-model.js';
import {normalizeStudioCharacter,resolveNpcAppearance} from '../src/entities/character/appearance.js';
import {calculateFemalePose} from '../src/entities/character/female-base.js';
import {animatePlayer,armTargets,solveArm,gripFrame} from '../src/entities/character/avatar-motion.js';
import {createCharacterRuntime} from '../src/entities/character/studio-integration.js';
const T=new Function(readFileSync('src/vendor/three-gltf.part.js','utf8')+';return three_module_exports;')();
const source=JSON.parse(gunzipSync(readFileSync('assets/models/characters/studio-v1.json.gz')));
const factory=createStudioGeometry(source);
{
 const player={mode:'walk',pos:new T.Vector3(),vel:new T.Vector3(),yaw:0,pitch:0,onGround:true,teleportId:1};
 globalThis.document={createElement:()=>({style:{},addEventListener(){},querySelector:()=>({})}),body:{append(){}}};
 globalThis.addEventListener=()=>{};
 const runtime=createCharacterRuntime({
  T,scene:new T.Scene(),camera:new T.PerspectiveCamera(),player,
  Save:{data:{settings:{view:'third'}},write(){}},
  makeCharacter:profile=>createStudioModel(T,factory,profile),attackPose:()=>null
 });
 const forward=()=>new T.Vector3(0,0,1).applyQuaternion(runtime.bodyRoot.quaternion);
 runtime.update(1/60,0,{});
 player.vel.set(2.6,0,0);
 runtime.update(1/60,1/60,{});
 assert(forward().x<.65,'Entering a side step must not snap the body');
 for(let i=2;i<=45;i++)runtime.update(1/60,i/60,{});
 assert(forward().x>.97,'Third-person body must turn to face lateral travel');
 player.vel.set(0,0,0);
 for(let i=46;i<=90;i++)runtime.update(1/60,i/60,{});
 assert(forward().x>.97,'Stopping must preserve facing');
 runtime.actor.dispose();
 delete globalThis.document;
 delete globalThis.addEventListener;
}
{
 const pose={side:1,weight:1,pull:1,extension:0,recoil:0};
 const windup=armTargets(T,'right',{...pose,arc:2.16},{armed:true,first:false});
 const prepared=armTargets(T,'right',{...pose,arc:1.3},{armed:true,first:false});
 assert(windup.blade.angleTo(prepared.blade)>.25,'The outer part of the swing must not flatten at a fixed blade heading');
}
// LOD sidecar: progressive levels must shrink and stay a vertex subset of level 0.
{
 const lodSource={...source,lod:JSON.parse(gunzipSync(readFileSync('assets/models/characters/studio-v1.lod.json.gz')))};
 const lodFactory=createStudioGeometry(lodSource);
 for(const body of ['male','female']){
  for(const [i,part] of source.bodies[body].parts.entries()){
   if(!part.skin.some(id=>id.startsWith('thumb_')))continue;
   const near=Buffer.from(lodSource.lod.bodies[body].levels[0][i],'base64');
   assert(near.length/4>=part.count*.55,'Near-view finger geometry is oversimplified');
  }
  const actor=createStudioModel(T,lodFactory,normalizeStudioCharacter({body})),levels=actor.lodLevels;
  assert(levels[0]>levels[1]&&levels[1]>levels[2],'LOD levels must decrease: '+levels);
  assert(levels[0]<120000,'Near LOD must be far below the 190k source mesh: '+levels[0]);
  const n=actor.mesh.geometry.attributes.position.count;
  for(const l of [0,1,2]){actor.setLOD(l);for(const i of actor.mesh.geometry.index.array)assert(i<n);}
  actor.setFirst(true);assert(actor.mesh.geometry.index.count/3<levels[0]*.6);
  console.log('PASS studio LOD',body,JSON.stringify({levels,vertices:n}));actor.dispose();
  // Exact-profile NPCs may share vertex GPU buffers, but not geometry state,
  // skeletons, per-actor shader uniforms, or lifetime.
  const profile=normalizeStudioCharacter({body});
  const a=createStudioModel(T,lodFactory,profile),b=createStudioModel(T,lodFactory,normalizeStudioCharacter({...profile,pose:{head:[12,0]}}));
  const changed=createStudioModel(T,lodFactory,normalizeStudioCharacter({...profile,values:profile.values.map((v,i)=>i===0?.3:v)}));
  const ga=a.mesh.geometry,gb=b.mesh.geometry;
  assert.notStrictEqual(ga,gb,'Each instance needs independent LOD selection');
  assert.strictEqual(ga.attributes.position,gb.attributes.position,'Identical profiles must reuse vertex VBO');
  assert.notStrictEqual(ga.attributes.position,changed.mesh.geometry.attributes.position,'Different face controls cannot share buffers');
  assert.notStrictEqual(a.skeleton,b.skeleton,'Skeletons must stay independent');
  assert.notStrictEqual(a.mesh.material,b.mesh.material,'Uniform sets must stay independent');
  a.setLOD(2);assert.equal(a.mesh.geometry.index.count/3,levels[2]);
  assert.equal(b.mesh.geometry.index.count/3,levels[0],'A second NPC LOD was overwritten');
  a.pose({head:[15,0]});assert(b.B.head.quaternion.angleTo(new T.Quaternion())<1e-7,'One NPC posed another');
  let disposed=0;for(const g of [ga,gb])g.addEventListener('dispose',()=>disposed++);
  a.dispose();assert.equal(disposed,0,'Shared VBOs were disposed while a second NPC used them');
  b.dispose();assert.equal(disposed,2,'Shared VBOs must be released when the final NPC is gone');
  changed.dispose();
  console.log('PASS shared character geometry',body);
 }
}
for(const body of ['male','female']){
 const profile=normalizeStudioCharacter({body}),actor=createStudioModel(T,factory,profile),g=actor.mesh.geometry;
 assert.equal(actor.bones.length,47);assert.equal(actor.units>1,true);
 // Runtime GPU attributes must represent exactly the original studio skin data.
 assert(g.attributes.skinIndex.array instanceof Uint8Array,'47-bone indices must fit uint8');
 assert(g.attributes.skinWeight.array instanceof Uint8Array&&g.attributes.skinWeight.normalized,'Skin weights must use normalized uint8');
 assert(g.attributes.aSkin.array instanceof Uint8Array&&g.attributes.aSkin.normalized,'Skin mask must use normalized uint8');
 // A normalized Uint8 mask needs the encoded value 255 (not 1) for a
 // full-strength skin pixel. Otherwise the shader mixes almost entirely white.
 const skinMask=g.attributes.aSkin;
 assert(skinMask.array.some(v=>v===255),'All body skin lost its full-strength shader mask');
 assert(skinMask.array.every(v=>v===0||v===255),'Skin mask has unintended intermediate opacity');
 const skinVertex=skinMask.array.indexOf(255);
 assert.equal(skinMask.getX(skinVertex),1,'Skin mask must decode to exactly 1.0 in the shader');
 assert(g.attributes.aArm.array instanceof Uint8Array&&g.attributes.aArm.normalized,'First-person arm mask must use normalized uint8');
 assert(g.index.array instanceof Uint16Array||g.index.array instanceof Uint32Array,'Index buffer must be integer typed');
 const gpuBytes=Object.values(g.attributes).reduce((sum,a)=>sum+a.array.byteLength,0)+g.index.array.byteLength;
 const unpackedGpuBytes=g.attributes.position.count*68+g.index.count*4;
 assert(gpuBytes<unpackedGpuBytes,'Packed vertex buffers failed to reduce GPU bytes');
 const weight=g.attributes.skinWeight;
 for(let i=0;i<weight.count;i+=Math.max(1,Math.floor(weight.count/300))){
  const total=weight.getX(i)+weight.getY(i)+weight.getZ(i)+weight.getW(i);
  assert(Math.abs(total-1)<.01,'Packed skinning weights corrupted: '+total);
 }
 console.log('PASS packed character buffers',body,JSON.stringify({gpuBytes,unpackedGpuBytes,ratio:gpuBytes/unpackedGpuBytes}));
 assert(actor.mesh.userData.studioFeatures.some(f=>f.eyeStyle==='neutral'&&f.iris));
 const count=g.index.count;actor.setLOD(1);assert(g.index.count<count*.5,'Distance LOD must reduce actual triangles');actor.setLOD(0);
 actor.setFirst(true);
 assert(g.index.count>0&&g.index.count<count*.8,'First-person mode must cull hidden body triangles');
 actor.setFirst(false);assert.equal(g.index.count,count,'Third-person mode must restore full body geometry');
 // Grip regression: the rod axis belongs inside the curled fingers, NOT
 // beyond the knuckle line. Both hands must agree with the mirrored rig.
 for(const side of ['right','left']){
  const hand=actor.data.hands.find(h=>h.id==='hand_'+side),g=gripFrame(T,actor,side);
  const pivot=id=>new T.Vector3(...actor.data.bones.find(b=>b.id===id).pivot).multiplyScalar(1/1428);
  const wrist=pivot('hand_'+side),middle=pivot('middle_'+side+'_0');
  const forward=middle.clone().sub(wrist).normalize();
  const knuckle=pivot('index_'+side+'_0').add(middle).add(pivot('ring_'+side+'_0')).multiplyScalar(1/3).sub(wrist);
  const along=g.grip.dot(forward)-knuckle.dot(forward);
  assert(along<=1e-6,'Weapon grip centre is beyond the finger bases ('+side+'): '+along);
  // The thumb must oppose the shaft instead of flexing away from it.
  // Measured on the original 47-bone rig: the old thumb_2 gap was ~28 mm
  // from the shaft axis even after the longitudinal grip correction.
  actor.pose({});actor.grip(side,.82,true);actor.group.updateMatrixWorld(true);
  const gripOrigin=actor.B['hand_'+side].localToWorld(g.grip.clone());
  const bladeAxis=new T.Vector3(0,0,1).applyQuaternion(g.frame);
  const gripEnd=actor.B['hand_'+side].localToWorld(g.grip.clone().add(bladeAxis));
  const worldAxis=gripEnd.sub(gripOrigin).normalize();
  const thumbTipJoint=actor.B['thumb_'+side+'_2'].getWorldPosition(new T.Vector3());
  const thumbDistance=thumbTipJoint.sub(gripOrigin).cross(worldAxis).length();
  assert(thumbDistance>.011&&thumbDistance<.026,
   'Thumb does not oppose weapon shaft ('+side+'): '+thumbDistance);
  actor.pose({});
  actor.grip(side,1);
  for(const f of hand.fingers)for(const id of f.joints){
   const bone=actor.data.bones.find(b=>b.id===id),limit=bone.axes[0].max*Math.PI/180;
   const actual=actor.B[id].quaternion.angleTo(new T.Quaternion());
   assert(actual<=limit+1e-5,'Weapon grip overextends '+id+': '+actual+' > '+limit);
  }
 }
 const angles={head:[22,12],upper_arm_right:[65,20],forearm_right:[82,20],thigh_left:[20,0]};
 actor.pose(angles);actor.group.updateMatrixWorld(true);actor.skeleton.update();
 const transforms=calculateFemalePose(actor.data.bones,angles),pos=g.attributes.position,skin=g.attributes.skinIndex,weights=g.attributes.skinWeight;
 let maxError=0;
 for(let i=0;i<pos.count;i+=Math.max(1,Math.floor(pos.count/200))){
  const p=new T.Vector3().fromBufferAttribute(pos,i),expected=new T.Vector3();
  for(let j=0;j<4;j++){
   const tf=transforms.get(actor.bones[skin.array[i*4+j]].name),r=tf.rotation;
   expected.addScaledVector(new T.Vector3(r[0]*p.x+r[3]*p.y+r[6]*p.z+tf.offset[0],r[1]*p.x+r[4]*p.y+r[7]*p.z+tf.offset[1],r[2]*p.x+r[5]*p.y+r[8]*p.z+tf.offset[2]),[weights.getX(i),weights.getY(i),weights.getZ(i),weights.getW(i)][j]);
  }
  const actual=actor.mesh.applyBoneTransform(i,p.clone());maxError=Math.max(maxError,actual.distanceTo(expected));
 }
 assert(maxError<1e-5,'Studio and game skinning disagree: '+maxError);
 // Face controls must move real vertices. Invariant: body below the neck is unchanged.
 const plain=factory.build(profile).body.worldPositions.slice();
 const edited=factory.build(normalizeStudioCharacter({...profile,values:controls.map((_,i)=>i===0?.7:0)})).body.worldPositions.slice();
 let changed=0;
 for(let i=0;i<plain.length;i++)if(Math.abs(plain[i]-edited[i])>1e-7)changed++;
 assert(changed>300,'Face profile did not deform actual geometry');
 const neutral=new T.Vector3();actor.pose();actor.group.updateMatrixWorld(true);actor.B.hand_right.getWorldPosition(neutral);
 const target=neutral.clone().add(new T.Vector3(.03,.18,.15));
 solveArm(T,actor,'right',target,new T.Quaternion());actor.group.updateMatrixWorld(true);
 const error=actor.B.hand_right.getWorldPosition(new T.Vector3()).distanceTo(target);
 assert(error<.002,'Arm IK failed: '+error);
 animatePlayer(actor,1/60,1,{vel:new T.Vector3(0,0,2),onGround:true,pitch:.2},null,{right:'sword'});
 assert(actor.B.index_right_1.quaternion.angleTo(new T.Quaternion())>.8,'Fingers do not close around equipped grip');
 console.log('PASS studio native rig',JSON.stringify({body,vertices:pos.count,triangles:count/3,maxSkinError:maxError,changed,ikError:error}));
 actor.dispose();
}
const def={id:'bran',name:'브란',title:'항만 관리인'};
assert.deepEqual(resolveNpcAppearance(def),resolveNpcAppearance(def));
