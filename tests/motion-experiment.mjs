import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createStudioGeometry} from '../src/entities/character/studio-geometry.js';
import {createStudioModel} from '../src/entities/character/studio-model.js';
import {normalizeStudioCharacter} from '../src/entities/character/appearance.js';
import {motionManifest,createMotionTrace,sampleLabGround,replayMotion} from '../src/entities/character/motion-experiment.js';
const T=new Function(readFileSync('src/vendor/three-gltf.part.js','utf8')+';return three_module_exports;')();
const factory=createStudioGeometry(JSON.parse(gunzipSync(readFileSync('assets/models/characters/studio-v1.json.gz'))));
const make=(profile,options)=>createStudioModel(T,factory,normalizeStudioCharacter(profile),options);
const manifests=motionManifest();assert.equal(new Set(manifests.map(x=>x.id)).size,manifests.length);
assert(manifests.every(x=>x.rootOwnership==='physics'&&x.contactWindows===null));
const recorder=createMotionTrace({limit:2});assert.equal(recorder.push(0),false);recorder.start();recorder.push(1);recorder.push(2);assert.equal(recorder.push(3),false);assert.deepEqual(recorder.stop(),{frames:[1,2],active:false,error:null});
const f={pool:{minX:-56,maxX:-26,minZ:-13,maxZ:13,entry:6,bottom:-3},stairs:{x:-12,z:12,width:4,run:.55,count:12},ramps:[{angle:45,x:0,z:-16,width:7,run:6,height:6}],height:(x,z)=>x<-26?-3*Math.min(1,(-26-x)/6):Math.max(0,-16-z)};
assert.equal(sampleLabGround(f,0,-19).point[1],3);assert(Math.abs(sampleLabGround(f,0,-19).geometricNormal[2]-Math.SQRT1_2)<1e-12);
assert.equal(sampleLabGround(f,-12,13),null);assert.equal(sampleLabGround(f,-29,0).point[1],-1.5);
for(const body of ['male','female']){
 const results=['low','baseline','high'].map(strength=>replayMotion(make,{body},{strength,scenario:'walk',frames:90}));
 const base=results[1];assert.equal(base.rig.bones.length,47);assert(Math.abs(base.rig.meshHeight-1.76)<1e-6);
 for(const r of results){assert.equal(r.frames.length,90);assert(r.frames.every((frame,i)=>frame.state.root.every((v,k)=>v===base.frames[i].state.root[k])&&frame.joints.length===47));}
 assert.notDeepEqual(results[0].frames[60].joints.find(j=>j.id==='ribcage').rotation,results[2].frames[60].joints.find(j=>j.id==='ribcage').rotation);
 for(const scenario of ['idle','backpedal','pivot','jump']){
  const r=replayMotion(make,{body},{scenario,scale:.85,frames:100});assert.equal(r.rig.scale,.85);
  assert(r.frames.every(x=>x.joints.every(j=>j.rotation.every(Number.isFinite))));
  if(scenario==='jump')assert(r.frames.some(x=>!x.state.grounded)&&r.frames.at(-1).state.grounded);
  if(scenario==='backpedal')assert(r.frames.some(x=>x.state.action==='backpedal'));
  if(scenario==='pivot')assert(r.frames.some(x=>x.state.pivotWeight>.9));
 }
}
console.log('PASS motion manifest, trace limits, analytical lab samples, real male/female rig scripted driver experiments (no physics/IK)');
