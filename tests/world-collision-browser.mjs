import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';


// Extract the exact collision/geometry functions used by the generated game.
// The isolated comparison must use the same narrow phase, not a second solver.
const readSource=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const section=(source,start,end)=>{
 const i=source.indexOf(start),j=source.indexOf(end,i);
 assert(i>=0&&j>i,'Missing comparison source '+start);
 return source.slice(i,j);
};
const rendererSource=readSource('src/render/world-render.part.js');
const gameplaySource=readSource('src/gameplay/gameplay.part.js');
const rockComparisonSource=[
 'const CONTACT_SKIN=.002,clamp2=(v,a,b)=>Math.max(a,Math.min(b,v));',
 section(rendererSource,'function local(','function groundAt('),
 section(rendererSource,'function playerContact(','// The static broad phase'),
 section(gameplaySource,'function renderedCollisionTriangles(','function curvedLabGeometry('),
 'return {local,inside,playerContact,renderedCollisionTriangles};'
].join('\n');

function compareRockProfiles(createBridge,callbacks,proxy,triangles,ground){
 const {local,inside,playerContact}=callbacks;
 const record={...proxy,collisionId:'proxy'};
 const legacy=createBridge({query:()=>[record],local,inside,playerContact});
 legacy.setRegion('rock-proxy');legacy.primitive(record);
 const exact=createBridge({query:()=>[],local,inside,playerContact});
 exact.setRegion('rock-mesh');exact.triangleMesh({collisionId:'mesh',triangles});
 const radius=.35,height=1.72,x=record.x,z=record.z;
 const reach=Math.max(record.r,...triangles.flat().map(v=>Math.hypot(v[0]-x,v[2]-z)))+radius+2;
 const approaches=[];
 for(const y of [ground,ground+.5])for(let i=0;i<8;i++){
  const a=i*Math.PI/4,dx=Math.cos(a),dz=Math.sin(a);
  const args=[x+dx*reach,z+dz*reach,y,-dx*reach,-dz*reach];
  const p=legacy.staticSweep(...args,null,radius,height)[0];
  const m=exact.surfaceBoundarySweep(...args,radius,height)[0];
  const proxyDistance=p?reach*(1-p.toi):null,meshDistance=m?reach*(1-m.toi):null;
  approaches.push({angle:i*45,feetY:y,proxyDistance,meshDistance,delta:proxyDistance===null||meshDistance===null?null:meshDistance-proxyDistance});
 }
 const lo=Math.min(record.bot,...triangles.flat().map(v=>v[1]))-1;
 const hi=Math.max(record.top,...triangles.flat().map(v=>v[1]))+1;
 const crown=exact.meshDescent(x,z,hi,lo,radius);
 return {proxyTop:record.top,meshFootprintTop:crown?.limitY??null,approaches};
}

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

 // Compare actual Kael rock placements, their live registered mantle proxy,
 // and the rendered instanced world matrix. Keep production behavior intact.
 const kaelRocks=await page.evaluate(async({source,compare})=>{
  const d=window.__dev,{createRuntimeCollisionBridge}=await import(new URL('src/core/world-collision-runtime.js',location.href).href);
  const callbacks=Function(source)(),compareProfiles=Function('return ('+compare+')')();
  const p=d.player.pos,original=d.rocks.last.slice(),out=[];
  d.renderer.setAnimationLoop(null);
  const selected=[0,1,2,3].map(v=>d.veg.rocks.filter(r=>r.v===v&&r.s>1.2).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0]).filter(Boolean);
  try{
   for(const r of selected){
    const proxy=d.playerContacts(r.x,r.z,r.y).map(c=>c.collider).find(c=>c.type==='cyl'&&c.mantleOnly&&Math.abs(c.x-r.x)<1e-6&&Math.abs(c.z-r.z)<1e-6);
    if(!proxy)throw Error('Kael rock live proxy missing');
    d.rocks.last=[Infinity,Infinity];d.rocks.update({x:r.x,z:r.z});
    const mesh=d.rocks.meshes[r.v].m,m=mesh.matrix.clone();let found=false;
    for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,m);if(Math.hypot(m.elements[12]-r.x,m.elements[14]-r.z)<.001){found=true;break;}}
    if(!found)throw Error('Kael rock rendered instance missing');
    mesh.updateWorldMatrix(true,false);m.premultiply(mesh.matrixWorld);
    const triangles=callbacks.renderedCollisionTriangles(mesh.geometry,m);
    if(!triangles.length)throw Error('Empty Kael rock mesh');
    const ground=d.playerTerrain(r.x,r.z);
    out.push({variant:r.v,x:r.x,z:r.z,size:r.s,triangles:triangles.length,ground,...compareProfiles(createRuntimeCollisionBridge,callbacks,proxy,triangles,ground)});
   }
  }finally{
   d.rocks.last=[Infinity,Infinity];
   d.rocks.update({x:Number.isFinite(original[0])?original[0]:d.camera.position.x,z:Number.isFinite(original[1])?original[1]:d.camera.position.z});
  }
  if(!out.length||!out.some(r=>r.approaches.some(a=>a.meshDistance!==null)))throw Error('No actual Kael rock comparison samples');
  return out;
 },{source:rockComparisonSource,compare:compareRockProfiles.toString()});
 await writeFile('test-results/physics-t3-kael-rock-proxy.json',JSON.stringify(kaelRocks));
 console.log('T3 actual Kael rock proxy versus rendered mesh '+JSON.stringify(kaelRocks));

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
  assert(q.meshOverlap<=.002,'LIVE-B21 final bare-body intersection '+JSON.stringify(q));
 }
 // Visible nonprimitive fixtures: actual Player, same renderer geometry
 // and runtime bridge, no synthetic collider substituted in the browser.
 const geometryEvidence=await page.evaluate(()=>{
  const d=window.__dev,p=d.player,input=d.input,f=d.fixtures;
  const curve=f.curve,rock=f.rock;
  const stats=d.collision.stats();
  if(stats.counts.triangleMesh!==2||!d.scene.getObjectByName('motion-lab-irregular-rock')||!d.scene.getObjectByName('motion-lab-continuous-curve'))throw Error('visible geometry registration');
  const supports=[[1,.25],[3,1.05],[5,3.1],[7,4.6]].map(([dx,y])=>{
   const q=d.collision.probe(curve.x+dx,curve.z,y);
   if(q.hit?.instanceId!==curve.id||Math.abs(q.hit.point[1]-y)>1e-5||Math.abs(q.difference)>1e-5)throw Error('mesh support parity '+JSON.stringify(q));
   return {x:dx,height:q.hit.point[1],normal:q.hit.geometricNormal};
  });
  input.keys.clear();input.setSprint(false);input.independentHeading=true;
  p.teleport(curve.x+1,curve.z,-Math.PI/2,0,.25);
  const gentle=p.candidate(.08,0);
  if(gentle.contacts.length||Math.abs(gentle.y-.27)>1e-5)throw Error('gentle visible ascent '+JSON.stringify(gentle));
  p.teleport(curve.x+4.2,curve.z,-Math.PI/2,0,1.9);
  if(!p.candidate(.08,0).contacts.length)throw Error('steep visible ascent accepted');
  p.teleport(rock.maxX+1,rock.z,Math.PI/2,0,0);
  const hit=p.candidate(rock.x-p.pos.x,0).contacts.find(c=>c.instanceId===rock.id);
  if(!hit)throw Error('visible rock does not block actual Player candidate');
  const start=p.pos.x;
  window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',bubbles:true}));
  for(let i=0;i<90;i++){p.advance(1/60,input,[]);d.avatars.update(1/60,i/60,{swing:null});}
  window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',bubbles:true}));
  const stop=p.pos.x,overlap=d.playerContacts(p.pos.x,p.pos.z,p.pos.y).filter(c=>c.instanceId===rock.id);
  if(!(stop<start-.15&&stop>rock.x)||overlap.length)throw Error('rock fixed-tick collision '+JSON.stringify({start,stop,overlap:overlap.length}));
  const cam=d.camera;cam.position.set(rock.x+9,5,rock.z+10);cam.lookAt(rock.x+3,1.5,rock.z-2);d.renderer.render(d.scene,cam);
  return {supports,rock:{triangles:rock.triangleCount,toi:hit.toi,start,stop,overlap:overlap.length},curveTriangles:curve.triangleCount};
 });
 console.log('T3 visible geometry evidence '+JSON.stringify(geometryEvidence));
 await page.screenshot({path:'test-results/physics-t3-irregular-geometry.png'});
 await page.evaluate(()=>window.__dev.reset());
 const trials=await page.evaluate(async()=>{
  const d=window.__dev,p=d.player,input=d.input;
  const m=await import(new URL('src/entities/character/motion-experiment.js',location.href).href);
  const key=(type,code)=>window.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true,cancelable:true}));
  const out={};input.independentHeading=true;
  const cases=[['idle',[]],['walk',['KeyW']],['run',['KeyW','ShiftLeft']],['backpedal',['KeyS']],['pivot',['KeyA']],['jump',['Space']]];
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
 assert(trials.run.summary.actions.some(a=>a.action==='run'),'actual sprint state did not activate');
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
