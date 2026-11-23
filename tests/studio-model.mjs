import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createStudioGeometry,controls} from '../src/entities/character/studio-geometry.js';
import {createStudioModel} from '../src/entities/character/studio-model.js';
import {normalizeStudioCharacter,resolveNpcAppearance} from '../src/entities/character/appearance.js';
import {calculateFemalePose} from '../src/entities/character/female-base.js';
import {animatePlayer,solveArm,gripFrame} from '../src/entities/character/avatar-motion.js';
const T=new Function(readFileSync('src/vendor/three-gltf.part.js','utf8')+';return three_module_exports;')();
const source=JSON.parse(gunzipSync(readFileSync('assets/models/characters/studio-v1.json.gz')));
const factory=createStudioGeometry(source);
// LOD sidecar: progressive levels must shrink and stay a vertex subset of level 0.
{
 const lodSource={...source,lod:JSON.parse(gunzipSync(readFileSync('assets/models/characters/studio-v1.lod.json.gz')))};
 const lodFactory=createStudioGeometry(lodSource);
 for(const body of ['male','female']){
  const actor=createStudioModel(T,lodFactory,normalizeStudioCharacter({body})),levels=actor.lodLevels;
  assert(levels[0]>levels[1]&&levels[1]>levels[2],'LOD levels must decrease: '+levels);
  assert(levels[0]<120000,'Near LOD must be far below the 190k source mesh: '+levels[0]);
  const n=actor.mesh.geometry.attributes.position.count;
  for(const l of [0,1,2]){actor.setLOD(l);for(const i of actor.mesh.geometry.index.array)assert(i<n);}
  actor.setFirst(true);assert(actor.mesh.geometry.index.count/3<levels[0]*.6);
  console.log('PASS studio LOD',body,JSON.stringify({levels,vertices:n}));actor.dispose();
 }
}
for(const body of ['male','female']){
 const profile=normalizeStudioCharacter({body}),actor=createStudioModel(T,factory,profile),g=actor.mesh.geometry;
 assert.equal(actor.bones.length,47);assert.equal(actor.units>1,true);
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
   expected.addScaledVector(new T.Vector3(r[0]*p.x+r[3]*p.y+r[6]*p.z+tf.offset[0],r[1]*p.x+r[4]*p.y+r[7]*p.z+tf.offset[1],r[2]*p.x+r[5]*p.y+r[8]*p.z+tf.offset[2]),weights.array[i*4+j]);
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
