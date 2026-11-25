// Offline, deterministic candidate search. No model/mesh edits and no tolerance relaxation.
// Run in a clean checkout with the complete source assets.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';

const policyPath='src/entities/character/clothing/shirt-binding.js';
const bakePath='assets/models/clothing/runtime-bindings-v1.json.gz';
const stressPath='tests/shirt-runtime.mjs';
const contractPath='src/entities/character/clothing/README.md';
const original=readFileSync(policyPath,'utf8'),originalBake=readFileSync(bakePath);
const originalTest=readFileSync(stressPath,'utf8'),originalContract=readFileSync(contractPath,'utf8');
const baseline=JSON.parse(gunzipSync(originalBake));
const candidates=[[10,14],[10,12],[16,12],[10,10],[16,10],[24,10],[16,8],[24,6]];
const run=(...args)=>{
 const p=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:32*1024*1024});
 if(p.error)throw p.error;
 const output=(p.stdout??'')+'\n'+(p.stderr??'');
 console.log(output);
 return {ok:p.status===0,output};
};
function policy(smoothing,gradient){
 const next=original.replace('bakeRevision:1,','bakeRevision:2,').replace('smoothing:10,','smoothing:'+smoothing+',').replace('gradientLimit:16,','gradientLimit:'+gradient+',');
 assert(next.includes('bakeRevision:2,')&&next.includes('smoothing:'+smoothing+',')&&next.includes('gradientLimit:'+gradient+','),'policy baseline mismatch');
 return next;
}
function preserve(){
 const baked=JSON.parse(gunzipSync(readFileSync(bakePath)));
 assert.deepEqual(baked.layers,baseline.layers,'layer coverage changed');
 for(const sex of ['male','female']){
  const a=baseline.bodies[sex]['shirt-v1'],b=baked.bodies[sex]['shirt-v1'];
  assert.equal(b.revision,2);
  for(const key of ['rest','actual','skinWeight','masks','firstMasks','frame','inverseBones','bones','vertices','indices','slots','bodyVertices']){
   if(key==='actual'||key==='skinWeight')continue; // binding weights are the intended change
   assert.deepEqual(b[key],a[key],sex+' changed '+key);
  }
  assert.notEqual(b.skinWeight,a.skinWeight,'no actual weight change');
  assert.deepEqual(baked.bodies[sex]['pants-v1'],baseline.bodies[sex]['pants-v1'],'unrelated pants changed');
 }
}
function metrics(output){
 const rows=[];
 for(const line of output.split('\n')){
  const m=line.match(/^STRAIN (male|female) (\{.*\})$/);
  if(m)rows.push({sex:m[1],...JSON.parse(m[2])});
 }
 assert.equal(rows.length,8,'all eight authored poses must be measured');
 return rows;
}
const base=run(stressPath);
assert(base.ok,'baseline ordinary pose or assembly failure');
const baseMetrics=metrics(base.output);
assert(base.output.includes('STRESS TARGET NOT MET female'),'baseline no longer reproduces female stress issue; reassess');
let selected=null;
try{
 for(const [smoothing,gradient] of candidates){
  console.log('CANDIDATE smoothing='+smoothing+' gradient='+gradient);
  writeFileSync(policyPath,policy(smoothing,gradient));
  const test=run(stressPath);
  if(!test.ok||test.output.includes('STRESS TARGET NOT MET'))continue;
  const data=metrics(test.output);
  // Reject an ordinary-pose regression rather than trading it for a stress pass.
  if(data.some((r,i)=>i%4!==3&&(r.armpit.p95>baseMetrics[i].armpit.p95+.10||r.armpit.p99>baseMetrics[i].armpit.p99+.15)))continue;
  if(!run('tools/bake-garments.mjs').ok)continue;
  try{preserve()}catch(e){console.warn('Rejected candidate: '+e.message);continue}
  if(!run('tests/garment-alignment.mjs').ok)continue;
  selected={smoothing,gradient,stress:data.filter((_,i)=>i%4===3)};
  break;
 }
 if(!selected)throw Error('No candidate passed all existing stress, ordinary, rest/mask preservation and baked clearance gates');
 const old="if(armpit.p95>=2.5||armpit.p99>=3.5||whole.p99>=3.5)console.warn('STRESS TARGET NOT MET '+sex+' '+JSON.stringify({armpit,whole}));";
 assert(originalTest.includes(old),'stress diagnostic baseline changed');
 writeFileSync(stressPath,originalTest.replace(old,"assert(armpit.p95<2.5&&armpit.p99<3.5&&whole.p99<3.5,'Extreme shoulder strain '+sex+' '+JSON.stringify({armpit,whole}));").replace("   // Retain the target in the diagnostic output. This artificial combined\n   // pose currently exceeds the target for the female rig; a generic\n   // pose-corrective/cloth solver would be needed to guarantee it.\n","   // This bounded extreme pose is a strict regression gate for both rigs.\n"));
 const previous='극단 포즈의 상대 변형 목표(p95 < 2.5, p99 < 3.5)는 여성 리그에서 아직 미충족이며 테스트에서 `STRESS TARGET NOT MET`으로 표시한다.';
 assert(originalContract.includes(previous),'contract baseline changed');
 writeFileSync(contractPath,originalContract.replace(previous,'극단 포즈의 상대 변형 목표(p95 < 2.5, p99 < 3.5)를 두 체형 모두의 필수 회귀 기준으로 검사한다. 가중치 전이 변경은 원본·기준 형상·가림 마스크와 바지의 사전 계산 데이터를 보존한다.'));
 assert(run(stressPath).ok,'strict stress regression failed');
 assert(run('tools/bake-garments.mjs','--check').ok,'stale bake');
 console.log('SELECTED '+JSON.stringify(selected));
 writeFileSync('garment-quality-result.json',JSON.stringify(selected,null,2)+'\n');
}catch(e){
 writeFileSync(policyPath,original);writeFileSync(bakePath,originalBake);
 writeFileSync(stressPath,originalTest);writeFileSync(contractPath,originalContract);
 throw e;
}
