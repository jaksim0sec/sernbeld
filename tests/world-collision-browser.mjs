import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';

const {chromium}=await import('playwright');
const port=8796,url='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
let browser;
try{
 for(let n=0;n<100;n++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:780,height:360},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.__dev?.collision?.stats,{},{timeout:180000});
 const main=await page.evaluate(()=>{
  const d=window.__dev,s=d.collision.stats(),near=(a,b)=>Math.abs(a-b)<=1e-6;
  if(s.registered<20||!s.counts.box||!s.counts.cyl||!s.counts.roof||s.counts.terrain!==1||s.counts.stair!==d.stairs.length)
   throw Error('Main world collision registrations incomplete '+JSON.stringify(s));
  if(s.regionId!==d.region.id)throw Error('Main collision region mismatch');
  const p=d.player.pos,probe=d.collision.probe(p.x,p.z,p.y);
  if(!Number.isFinite(probe.legacy)||probe.hit&&!Number.isFinite(probe.hit.point[1]))throw Error('Nonfinite world floor probe');
  if(d.playerContacts(p.x,p.z,p.y).length)throw Error('Player started inside solid');
  const nearest=d.collidersAt(p.x,p.z,10);
  if(!Array.isArray(nearest))throw Error('Legacy static grid unavailable');
  return {region:s.regionId,registered:s.registered,types:s.counts,probe:{old:probe.legacy,new:probe.hit?.point[1]??null}};
 });
 await mkdir('test-results',{recursive:true});
 await page.screenshot({path:'test-results/physics-t1-kael.png'});
 await page.evaluate(()=>{
  const d=window.__dev;
  if(d.ui.travel.hidden)d.ui.toggleTravel();
  const click=label=>{const el=[...d.ui.travel.querySelectorAll('button')].find(b=>b.textContent.trim()===label);if(!el)throw Error('Missing '+label);el.click();};
  click('플레이 설정');click('개발자 모드');click('모션 테스트 공간');
 });
 await page.waitForURL('**/*motionLab=1');
 await page.waitForFunction(()=>window.__dev?.motionLab===true&&!!window.__dev.collision?.stats,{},{timeout:180000});
 const lab=await page.evaluate(()=>{
  const d=window.__dev,s=d.collision.stats(),f=d.fixtures;
  if(s.regionId!=='motion-lab'||s.counts.box<10||s.counts.cyl<1||s.counts.water!==1||s.counts.terrain!==0||s.counts.labSurface!==1)
   throw Error('Lab collision registrations incomplete '+JSON.stringify(s));
  for(const ramp of f.ramps){
   const x=ramp.x,z=ramp.z-ramp.run/2,y=ramp.height/2,p=d.collision.probe(x,z,y);
   if(!p.hit||Math.abs(p.hit.point[1]-y)>1e-6||p.hit.featureId!=='ramp-'+ramp.angle)throw Error('Ramp registration '+JSON.stringify(p));
  }
  for(const l of f.ledges){
   const p=d.collision.probe(l.x,l.z,l.height);
   if(p.hit?.point[1]!==l.height||Math.abs(p.difference)>1e-6)throw Error('Ledge query parity '+l.id+' '+JSON.stringify(p));
  }
  const p=d.collision.probe(f.wall.x,f.wall.z,f.wall.height);
  if(p.hit?.point[1]!==f.wall.height||Math.abs(p.difference)>1e-6)throw Error('Wall query parity '+JSON.stringify(p));
  if(d.collidersAt(400,-450,10).length)throw Error('Lab world contaminated by Kael colliders');
  return {region:s.regionId,registered:s.registered,types:s.counts,fixtures:f.ledges.length};
 });
 await page.evaluate(()=>window.__dev.motionExperiment.start());
 await page.waitForFunction(()=>window.__dev.motionExperiment.read().frames.length>=3,{},{timeout:10000});
 await page.evaluate(()=>{window.__dev.input.independentHeading=true;window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));});
 await page.waitForFunction(()=>window.__dev.player.pos.z<-.8,{},{timeout:20000});
 await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW'})));
 const trace=await page.evaluate(()=>window.__dev.motionExperiment.stop());
 assert.equal(trace.error,null);assert(trace.frames.every(f=>f.joints.length===47));
 assert(trace.frames.some(f=>f.state.action==='walk'||f.state.action==='run'));
 assert(trace.frames.every(f=>['left','right'].every(side=>f.soles[side].candidateCount>0&&Number.isFinite(f.soles[side].minGap))));
 assert(trace.summary.actions.length>=2);
 console.log('T2 actual lab bare-body sole observations '+JSON.stringify(trace.summary));
 // Render the same post-IK pose from three views without changing the runtime camera policy.
 await page.evaluate(()=>window.__dev.renderer.setAnimationLoop(null));
 for(const [name,angle] of [['front',0],['side',Math.PI/2],['three-quarter',Math.PI/4]]){
  await page.evaluate(angle=>{
   const d=window.__dev,a=d.avatars.actor.group,cam=d.camera,theta=a.rotation.y+angle;
   cam.position.set(a.position.x+Math.sin(theta)*3,a.position.y+1.15,a.position.z+Math.cos(theta)*3);
   cam.lookAt(a.position.x,a.position.y+.88,a.position.z);d.renderer.render(d.scene,cam);
  },angle);
  await page.screenshot({path:'test-results/motion-t2-'+name+'.png'});
 }
  // Reproducible real-controller/pose fixture. Advance existing Player and
 // avatar update directly at 60 Hz, as in world-playability; no alternate solver.
 // LIVE-B21 actual player and avatar at each wedge side.
 const sideEvidence=await page.evaluate(()=>{
  const d=window.__dev,p=d.player,input=d.input;
  const key=(type,code)=>window.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true,cancelable:true}));
  const out=[];input.independentHeading=true;
  const step=i=>{p.advance(1/60,input,[]);d.avatars.update(1/60,i/60,{swing:null});};
  for(const ramp of d.fixtures.ramps)for(const side of [-1,1]){
   input.keys.clear();input.setSprint(false);
   const edge=ramp.x+side*ramp.width/2,z=ramp.z-ramp.run/2;
   p.teleport(edge+side*1.2,z,side*Math.PI/2,0,0);
   for(let i=0;i<12;i++)step(i);
   key('keydown','KeyW');
   let minClear=Infinity;
   for(let i=12;i<102;i++){step(i);minClear=Math.min(minClear,side*(p.pos.x-edge));}
   key('keyup','KeyW');
   for(let i=102;i<114;i++)step(i);
   const clearance=side*(p.pos.x-edge),actor=d.avatars.actor;
   actor.group.updateMatrixWorld(true);
   const v=actor.group.position.clone();let meshOverlap=0;
   for(let i=0;i<actor.mesh.geometry.attributes.position.count;i++){
    actor.mesh.getVertexPosition(i,v);actor.mesh.localToWorld(v);
    if(v.z<ramp.z&&v.z>ramp.z-ramp.run&&v.y>0&&v.y<ramp.height*(ramp.z-v.z)/ramp.run&&Math.abs(v.x-ramp.x)<ramp.width/2)
     meshOverlap=Math.max(meshOverlap,-side*(v.x-edge));
   }
   key('keydown','KeyS');for(let i=114;i<150;i++)step(i);key('keyup','KeyS');
   out.push({angle:ramp.angle,side,clearance,minClear,meshOverlap,escape:side*(p.pos.x-edge)});
  }
  d.reset();return out;
 });
 console.log('LIVE-B21 actual sidewall clearance and bare-body mesh overlap '+JSON.stringify(sideEvidence));
 for(const q of sideEvidence){
  assert(q.minClear>=.345&&q.clearance<.45,'LIVE-B21 sidewall capsule '+JSON.stringify(q));
  assert(q.escape>q.clearance+.15,'LIVE-B21 release '+JSON.stringify(q));
 }
 const trials=await page.evaluate(async()=>{
  const d=window.__dev,p=d.player,input=d.input;
  const m=await import(new URL('src/entities/character/motion-experiment.js',location.href).href);
  const key=(type,code)=>window.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true,cancelable:true}));
  const out={};input.independentHeading=true;
  const cases=[['idle',[]],['walk',['KeyW']],['backpedal',['KeyS']],['pivot',['KeyA']],['jump',['Space']]];
  for(const [name,codes] of cases){
   input.keys.clear();input.setSprint(false);d.reset();
   const actor=d.avatars.actor,rig=m.measureRig(actor),frames=[];
   const step=(i,record)=>{
    p.advance(1/60,input,[]);
    const before=p.pos.clone();d.avatars.update(1/60,i/60,{swing:null});
    if(before.distanceTo(p.pos)>1e-9)throw Error('avatar changed physics root');
    if(record){
     const hit=d.collision.probe(p.pos.x,p.pos.z,p.pos.y).hit;
     frames.push(m.capturePose(actor,m.readMotionState(p,actor,hit),{time:i/60,groundSurface:d.playerFootSurface,ankleRest:rig.ankleRest}));
    }
   };
   for(let i=0;i<60;i++)step(i,false);
   for(let i=60;i<72;i++)step(i,true);
   for(const c of codes)key('keydown',c);
   for(let i=72;i<132;i++)step(i,true);
   for(const c of codes)key('keyup',c);
   for(let i=132;i<192;i++)step(i,true);
   out[name]={summary:m.summarizeMotionTrace(frames),quality:m.motionQuality(frames),frames};
  }
  d.reset();return out;
 });
 assert(trials.walk.summary.actions.some(a=>a.action==='walk'));
 assert(trials.backpedal.summary.actions.some(a=>a.action==='backpedal'));
 assert(trials.pivot.quality.pivotFrames>0);
 assert(trials.jump.quality.groundTransitions.some(x=>x.kind==='leave-ground'));
 assert(trials.jump.quality.groundTransitions.some(x=>x.kind==='land'));
 for(const trial of Object.values(trials))assert.equal(trial.quality.frames,132);
 const qualitySummary=Object.fromEntries(Object.entries(trials).map(([k,v])=>[k,{summary:v.summary,quality:v.quality}]));
 await writeFile('test-results/motion-t2-fixed-trace.json',JSON.stringify(trials));
 console.log('T2 fixed 60Hz post-IK observations '+JSON.stringify(qualitySummary));
 await page.screenshot({path:'test-results/physics-t1-lab.png'});
 // Reuse the real visible rig to render detached-driver poses. Same profile,
 // root, phase, camera and lighting for all three strengths; no gameplay write.
 const strengthEvidence=await page.evaluate(async()=>{
  const d=window.__dev,m=await import(new URL('src/entities/character/motion-experiment.js',location.href).href);
  const replays=['low','baseline','high'].map(strength=>d.motionExperiment.replay({scenario:'walk',strength,scale:d.avatars.actor.group.scale.y,frames:90}));
  const comparison=m.compareMotionStrength(replays);
  return {comparison,poses:Object.fromEntries(replays.map(r=>[r.strength,[30,60].map(i=>r.frames[i])]))};
 });
 assert.equal(strengthEvidence.comparison.rootDelta,0);assert.equal(strengthEvidence.comparison.phaseDelta,0);
 assert.equal(strengthEvidence.comparison.lowerLocalDelta,0);
 await writeFile('test-results/motion-t2-strength.json',JSON.stringify(strengthEvidence));
 for(const [strength,poses] of Object.entries(strengthEvidence.poses))for(let pose=0;pose<poses.length;pose++)for(const [view,angle] of [['front',0],['side',Math.PI/2],['three-quarter',Math.PI/4]]){
  await page.evaluate(({frame,angle})=>{
   const d=window.__dev,actor=d.avatars.actor,a=actor.group,cam=d.camera;
   a.position.fromArray(frame.bodyRoot);a.rotation.set(0,frame.state.heading+Math.PI,0);
   for(const j of frame.joints){actor.B[j.id].position.fromArray(j.local);actor.B[j.id].quaternion.fromArray(j.rotation);}
   a.updateMatrixWorld(true);const theta=a.rotation.y+angle;
   cam.position.set(a.position.x+Math.sin(theta)*3,a.position.y+1.15,a.position.z+Math.cos(theta)*3);
   cam.lookAt(a.position.x,a.position.y+.88,a.position.z);d.renderer.render(d.scene,cam);
  },{frame:poses[pose],angle});
  await page.screenshot({path:'test-results/motion-t2-strength-'+strength+'-'+pose+'-'+view+'.png'});
 }
 console.log('T2 matched strength evidence '+JSON.stringify(strengthEvidence.comparison));

 assert.deepEqual(errors,[]);
 console.log('PASS: Kael and motion-lab live collision registration, support parity, PWA and LOD-independent runtime '+JSON.stringify({main,lab}));
} finally {
 await browser?.close();
 server.kill();
}
