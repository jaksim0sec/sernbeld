import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createStudioGeometry,controls} from '../src/entities/character/studio-geometry.js';
import {createStudioModel} from '../src/entities/character/studio-model.js';
import {normalizeStudioCharacter,resolveNpcAppearance} from '../src/entities/character/appearance.js';
import {calculateFemalePose} from '../src/entities/character/female-base.js';
import {animatePlayer,solveArm} from '../src/entities/character/avatar-motion.js';
const T=new Function(readFileSync('src/vendor/three-gltf.part.js','utf8')+';return three_module_exports;')();
const source=JSON.parse(gunzipSync(readFileSync('assets/models/characters/studio-v1.json.gz')));
const factory=createStudioGeometry(source);
for(const body of ['male','female']){
 const profile=normalizeStudioCharacter({body}),actor=createStudioModel(T,factory,profile),g=actor.mesh.geometry;
 assert.equal(actor.bones.length,47);assert.equal(actor.units>1,true);
 assert(actor.mesh.userData.studioFeatures.some(f=>f.eyeStyle==='neutral'&&f.iris));
 const count=g.index.count;actor.setLOD(1);assert(g.index.count<count*.5,'Distance LOD must reduce actual triangles');actor.setLOD(0);
 actor.setFirst(true);
 assert(g.index.count>0&&g.index.count<count*.8,'First-person mode must cull hidden body triangles');
 actor.setFirst(false);assert.equal(g.index.count,count,'Third-person mode must restore full body geometry');
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
