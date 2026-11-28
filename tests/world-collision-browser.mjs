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
 const mantle=createBridge({query:()=>[],local,inside,playerContact});
 mantle.setRegion('rock-mantle');mantle.triangleMesh({collisionId:'mesh',triangles,support:true,mantle:true});
 const approaches=[];
 for(const y of [ground,ground+.5])for(let i=0;i<8;i++){
  const a=i*Math.PI/4,dx=Math.cos(a),dz=Math.sin(a);
  const args=[x+dx*reach,z+dz*reach,y,-dx*reach,-dz*reach];
  const p=legacy.staticSweep(...args,null,radius,height)[0];
  const m=exact.surfaceBoundarySweep(...args,radius,height)[0];
  const proxyDistance=p?reach*(1-p.toi):null,meshDistance=m?reach*(1-m.toi):null;
  const plans=meshDistance===null?[]:mantle.meshMantlePlans(x+dx*(meshDistance+.025),z+dz*(meshDistance+.025),y,-dx,-dz,{radius,height});
  const plan=plans[0];
  approaches.push({angle:i*45,feetY:y,proxyDistance,meshDistance,delta:proxyDistance===null||meshDistance===null?null:meshDistance-proxyDistance,mantleCandidate:plan?{stand:plan.stand,hands:plan.hands,over:plan.over}:null});
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
  if(s.registered<20||!s.counts.box||!s.counts.cyl||!s.counts.triangleMesh||!s.counts.roof||s.counts.terrain!==1||s.counts.stair!==d.stairs.length)
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

 // Compare the retired Player proxy against the rendered instance and live exact registration.
 const kaelRocks=await page.evaluate(async({source,compare})=>{
  const d=window.__dev,{createRuntimeCollisionBridge}=await import(new URL('src/core/world-collision-runtime.js',location.href).href);
  const callbacks=Function(source)(),compareProfiles=Function('return ('+compare+')')();
  const p=d.player.pos,original=d.rocks.last.slice(),out=[];
  d.renderer.setAnimationLoop(null);
  const selected=[0,1,2,3].map(v=>d.veg.rocks.filter(r=>r.v===v&&r.s>1.2).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0]).filter(Boolean);
  try{
   for(const r of selected){
    const proxy={type:'cyl',x:r.x,z:r.z,r:r.s*.8,y0:r.y-1,y1:r.y+r.s*.55,bot:r.y-1,top:r.y+r.s*.55,walk:true,climbable:true,mantleOnly:true};
    if(!r.physicsId)throw Error('Kael rendered rock registration missing');
    if(d.playerContacts(r.x,r.z,r.y).some(c=>c.collider?.type==='cyl'&&c.collider.mantleOnly&&Math.abs(c.collider.x-r.x)<1e-6&&Math.abs(c.collider.z-r.z)<1e-6))throw Error('retired rock proxy still controls Player');
    d.rocks.last=[Infinity,Infinity];d.rocks.update({x:r.x,z:r.z});
    const mesh=d.rocks.meshes[r.v].m,m=mesh.matrix.clone();let found=false;
    for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,m);if(Math.hypot(m.elements[12]-r.x,m.elements[14]-r.z)<.001){found=true;break;}}
    if(!found)throw Error('Kael rock rendered instance missing');
    mesh.updateWorldMatrix(true,false);m.premultiply(mesh.matrixWorld);
    const triangles=callbacks.renderedCollisionTriangles(mesh.geometry,m);
    if(!triangles.length)throw Error('Empty Kael rock mesh');
    const ground=d.playerTerrain(r.x,r.z);
    const comparison=compareProfiles(createRuntimeCollisionBridge,callbacks,proxy,triangles,ground);
    const expected=createRuntimeCollisionBridge({query:()=>[],local:callbacks.local,inside:callbacks.inside,playerContact:callbacks.playerContact});
    expected.triangleMesh({collisionId:'reference',triangles,support:true,mantle:true});
    const supports=[];
    for(const dx of [-.5,0,.5])for(const dz of [-.5,0,.5]){
      const x=r.x+dx,z=r.z+dz,h=expected.meshSupport(x,z,Infinity);
      if(!h||h.point[1]<d.playerTerrain(x,z)+.01)continue;
      const y=h.point[1],actual=d.playerFloor(x,z,y+.003,0),probe=d.collision.probe(x,z,y);
      if(Math.abs(actual-y)>.003||probe.hit?.instanceId!==r.physicsId)throw Error('Kael rock support does not match rendered triangle '+JSON.stringify({x,z,y,actual,probe}));
      supports.push({x,z,y});
    }
    out.push({variant:r.v,x:r.x,z:r.z,size:r.s,triangles:triangles.length,ground,physicsId:r.physicsId,supports,...comparison});
   }
  }finally{
   d.rocks.last=[Infinity,Infinity];
   d.rocks.update({x:Number.isFinite(original[0])?original[0]:d.camera.position.x,z:Number.isFinite(original[1])?original[1]:d.camera.position.z});
  }
  if(!out.length||!out.some(r=>r.supports.length)||!out.some(r=>r.approaches.some(a=>a.meshDistance!==null)))throw Error('No actual Kael rock comparison samples');
  const cache=d.collision.stats().boundaryIndex;
  if(cache.deferredResident>cache.deferredLimit)throw Error('unbounded rock BVH cache');
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
  const step=i=>{
   // This case measures ordinary wall clearance and backpedaling.
   p.autoTraverseSuppressed=true;
   p.advance(1/60,input,[]);d.avatars.update(1/60,i/60,{swing:null});
  };
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
  if(stats.counts.triangleMesh!==3||!d.scene.getObjectByName('motion-lab-irregular-rock')||!d.scene.getObjectByName('motion-lab-continuous-curve'))throw Error('visible geometry registration');
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
  const rockLandings=[];
  const idle={move:()=>({x:0,y:0,mag:0}),run:()=>false,consumeJump:()=>false};
  for(const [dx,dz] of [[0,0],[-.5,0],[.5,0],[0,-.5],[0,.5]]){
   p.teleport(rock.x+dx,rock.z+dz,0,0,5);
   for(let i=0;i<180;i++)p.advance(1/60,idle,[]);
   const q=d.collision.probe(p.pos.x,p.pos.z,p.pos.y);
   if(!p.onGround||q.hit?.instanceId!==rock.id||Math.abs(q.hit.point[1]-p.pos.y)>1e-5)throw Error('visible rock landing '+JSON.stringify({dx,dz,y:p.pos.y,ground:p.onGround,q}));
   rockLandings.push({dx,dz,y:p.pos.y,ground:p.onGround});
  }
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
  return {supports,rock:{triangles:rock.triangleCount,toi:hit.toi,start,stop,overlap:overlap.length,landings:rockLandings},curveTriangles:curve.triangleCount};
 });
 console.log('T3 visible geometry evidence '+JSON.stringify(geometryEvidence));
 await page.screenshot({path:'test-results/physics-t3-irregular-geometry.png'});
 const mantleEvidence=await page.evaluate(()=>{
  const d=window.__dev,p=d.player,f=d.fixtures.mantle;
  if(!f||!d.scene.getObjectByName('motion-lab-mesh-mantle'))throw Error('missing rendered mantle mesh');
  p.teleport(f.x,f.z+1.56,0,0,0);
  const idle={move:()=>({x:0,y:0,mag:0}),run:()=>false,consumeJump:()=>false};
  p.advance(1/60,{...idle,move:()=>({x:0,y:1,mag:1}),consumeJump:()=>true});
  if(p.traversal?.surface.meshId!==f.id)throw Error('actual mesh mantle not selected');
  const {surface,hands:holds}=p.traversal;
  const across=holds[1].point.clone().sub(holds[0].point);
  if(across.x*surface.nz-across.z*surface.nx<=0)throw Error('Mesh mantle crossed the left and right hand targets');
  const hands=holds.map(h=>h.point.toArray());
  for(let i=0;i<150&&p.traversal;i++){p.advance(1/60,idle);d.avatars.update(1/60,i/60,{swing:null});if(d.playerContacts(p.pos.x,p.pos.z,p.pos.y).length)throw Error('mesh mantle penetration');}
  if(!p.onGround||p.traversal||Math.abs(p.pos.y-1)>1e-5)throw Error('mesh mantle landing');
  return {hands,landing:p.pos.toArray()};
 });
 console.log('T3 actual mesh mantle evidence '+JSON.stringify(mantleEvidence));
 const traversalEvidence=await page.evaluate(async()=>{
  const d=window.__dev,p=d.player,input=d.input,ramp=d.fixtures.ramps.find(r=>r.angle===60);
  const {surfaceHandTarget}=await import(new URL('src/entities/character/avatar-motion.js',location.href).href);
  const profile=d.avatars.profile,Vector3=p.pos.constructor,group=d.avatars.actor.group;
  const T={Vector3,Quaternion:group.quaternion.constructor,Matrix4:group.matrix.constructor};
  const routes=[],keyboardSteering=input.keyboardSteering;
  const contactStats=()=>({planted:0,lip:0,wristGap:0,ankleGap:0,lipGap:0});
  function measureContacts(actor,render,contacts){
   if(!render)return;
   const {action,t}=render;
   const climbing=action.kind==='climb',mantling=action.kind==='mantle'&&t>=.25&&t<=.59;
   if(!climbing&&!mantling)return;
   for(const [i,sideName] of ['left','right'].entries()){
    const hand=action.hands[i],foot=action.feet?.[i];
    if(mantling||i!==action.moving||t>=.56){
     const finger=mantling?new Vector3(-action.surface.nx,0,-action.surface.nz):
      new Vector3(0,1,0).addScaledVector(hand.normal,-hand.normal.y).normalize();
     const palm=hand.point.clone().addScaledVector(hand.normal,mantling?.029:.018);
     if(mantling)palm.addScaledVector(finger,.014);
     const {wrist}=surfaceHandTarget(T,actor,sideName,palm,hand.normal,finger);
     const gap=wrist.distanceTo(actor.B['hand_'+sideName].getWorldPosition(new Vector3()));
     if(mantling){contacts.lip++;contacts.lipGap=Math.max(contacts.lipGap,gap);}
     else{contacts.planted++;contacts.wristGap=Math.max(contacts.wristGap,gap);}
    }
    if(climbing&&(i===action.moving||t>=.95)){
     const finger=new Vector3(0,1,0).addScaledVector(foot.normal,-foot.normal.y).normalize();
     const ankle=foot.point.clone().addScaledVector(foot.normal,.115).addScaledVector(finger,-.026);
     contacts.ankleGap=Math.max(contacts.ankleGap,ankle.distanceTo(actor.B['foot_'+sideName].getWorldPosition(new Vector3())));
    }
   }
  }
  const rock=d.fixtures.rock,rockRoutes=[];
  const mesh=d.scene.getObjectByName('motion-lab-irregular-rock'),vertices=mesh.geometry.attributes.position;
  const inverse=mesh.matrixWorld.clone().invert(),ray=new Vector3(1,.123,.234);
  const triangles=Array.from({length:vertices.count/3},(_,i)=>{
   const a=new Vector3().fromBufferAttribute(vertices,i*3);
   const b=new Vector3().fromBufferAttribute(vertices,i*3+1).sub(a),c=new Vector3().fromBufferAttribute(vertices,i*3+2).sub(a);
   const cross=ray.clone().cross(c);
   return {a,b,c,cross,den:b.dot(cross)};
  });
  // Ray parity against the rendered boulder, independently of the Player capsule.
  function insideRock(world){
   const point=world.clone().applyMatrix4(inverse);
   let hits=0;
   for(const {a,b,c,cross,den} of triangles){
    if(Math.abs(den)<1e-10)continue;
    const delta=point.clone().sub(a),u=delta.dot(cross)/den;
    if(u<0||u>1)continue;
    const q=delta.cross(b),v=ray.dot(q)/den;
    if(v>=0&&u+v<=1&&c.dot(q)/den>1e-8)hits++;
   }
   return hits%2===1;
  }
  const torso=['pelvis','waist','ribcage','neck','head','upper_arm_left','upper_arm_right'];
  input.keyboardSteering=false;input.keys.clear();input.setSprint(false);
  for(const body of ['male','female']){
   d.avatars.setProfile({...profile,body});
   for(const side of [-1,1]){
    p.stamina=100;p.exhausted=false;p.staminaDelay=0;p.moveBasisYaw=null;
    p.teleport(ramp.x+side*(ramp.width/2+.7),ramp.z-ramp.run*.6,side*Math.PI/2,0,0);
    const actor=d.avatars.actor;
    let latch=-1,previous=null,seam=0,jumped=false,landed=false;
    const contacts=contactStats();
    for(let frame=0;frame<930;frame++){
     const lateral=latch>=0&&(frame-latch)%135>=90;
     input.stick.x=lateral?side:0;input.stick.y=lateral?0:1;
     if(!jumped&&!lateral&&p.traversal?.surface.box&&p.pos.y>=ramp.height-1.5){
      input.jumpQueued=true;jumped=true;
     }
     p.advance(1/60,input,[]);
     d.avatars.update(1/60,frame/60,{swing:null});
     const current=p.traversal,render=p.renderTraversal;
     if(latch<0&&current)latch=frame;
     for(const root of [p.pos,p.renderPos])if(d.playerContacts(root.x,root.z,root.y).length)throw Error('Ramp side capsule overlap '+body+' '+side);
     if(current&&current!==previous){
      if(current.kind==='climb'&&current.surface.lower?.boundary&&!previous?.surface.box){
       const {moving,from,to,hands,feet}=current;
       if(!lateral||Math.abs(from.y-to.y)>1e-6||from.distanceTo(to)>.301||
          hands[1-moving]!==previous.hands[1-moving]||feet[moving]!==previous.feet[moving])
        throw Error('Ramp seam replaced planted contacts or exceeded the requested side step');
       seam++;
      }
      previous=current;
     }
     if(p.onGround&&p.pos.y>=ramp.height-.003){landed=true;break;}
     measureContacts(actor,render,contacts);
    }
    const route={body,side,seam,landed,jumped,...contacts};
    if(!landed||!jumped||seam!==1||!contacts.planted||!contacts.lip||
       Math.max(contacts.wristGap,contacts.ankleGap,contacts.lipGap)>.03)
     throw Error('Ramp side traversal or posed contact regression '+JSON.stringify(route));
    routes.push(route);
   }
   input.stick.x=0;input.stick.y=1;
   for(let angle=0;angle<360;angle+=45){
    p.stamina=100;p.exhausted=false;p.staminaDelay=0;p.moveBasisYaw=null;
    const yaw=(90-angle)*Math.PI/180;
    p.teleport(rock.x+Math.sin(yaw)*5,rock.z+Math.cos(yaw)*5,yaw,0,0);
    const actor=d.avatars.actor,contacts=contactStats();
    let landed=false,overlaps=0;
    for(let frame=0;frame<550;frame++){
     p.advance(1/60,input,[]);
     d.avatars.update(1/60,frame/60,{swing:null});
     if(p.onGround&&p.pos.y>=1.7){landed=true;break;}
     if(!p.renderTraversal)continue;
     measureContacts(actor,p.renderTraversal,contacts);
     for(const joint of torso)if(insideRock(actor.B[joint].getWorldPosition(new Vector3())))overlaps++;
    }
    const route={body,angle,landed,overlaps,...contacts};
    if(!landed||overlaps||angle===0&&(!contacts.planted||Math.max(contacts.wristGap,contacts.ankleGap)>.03))
     throw Error('Boulder traversal or posed contact regression '+JSON.stringify(route));
    rockRoutes.push(route);
   }
  }
  input.stick.x=input.stick.y=0;input.jumpQueued=false;input.keyboardSteering=keyboardSteering;
  p.stamina=100;p.exhausted=false;p.staminaDelay=0;
  d.avatars.setProfile(profile);
  return {ramps:routes,rock:rockRoutes};
 });
 console.log('T4 ramp side, jump at lip and boulder posed contact evidence '+JSON.stringify(traversalEvidence));
 await page.evaluate(()=>window.__dev.reset());
 const trials=await page.evaluate(async()=>{
  const d=window.__dev,p=d.player,input=d.input;
  const m=await import(new URL('src/entities/character/motion-experiment.js',location.href).href);
  const key=(type,code)=>window.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true,cancelable:true}));

  // Measure mid-segment edges, away from the joint blend zone, separately
  // for the body's actual skinning and the pants' CPU shader counterpart.
  // Values are observations, not arbitrary acceptance limits.
  function legMeshProbe(actor){
   const pivot=id=>actor.data.bones.find(b=>b.id===id).pivot;
   const min=actor.mesh.geometry.boundingBox.min.y,units=actor.units;
   const sign=Math.sign(pivot('thigh_left')[0]-pivot('thigh_right')[0])||1;
   const pants=actor.model.getObjectByName('clothing:pants.basic-trousers');
   const meshes=[{name:'body',object:actor.mesh,rest:actor.mesh.geometry.attributes.position,body:true}];
   if(pants?.userData.deformGarmentVertex)meshes.push({name:'pants',object:pants,rest:pants.geometry.attributes.aRest,body:false});
   for(const m of meshes){
    const g=m.object.geometry,p=m.rest,index=g.index,geometryRest=g.attributes.position;
    m.groups={};
    for(const side of ['left','right'])for(const part of ['thigh','shin']){
     const top=pivot(part+'_'+side)[1]/1428,bottom=pivot((part==='thigh'?'shin':'foot')+'_'+side)[1]/1428;
     const lo=Math.min(top,bottom)+Math.abs(top-bottom)*.30,hi=Math.max(top,bottom)-Math.abs(top-bottom)*.30;
     const within=i=>{
      if(m.body&&i>=actor.bodyVertexCount)return false;
      const y=m.body?p.getY(i):p.getY(i)/units+min;
      return y>=lo&&y<=hi&&(p.getX(i)*sign>=0)===(side==='left');
     };
     const edges=new Map();
     for(let i=0;i<index.count;i+=3){
      const tri=[index.getX(i),index.getX(i+1),index.getX(i+2)];
      for(let k=0;k<3;k++){
       const a=Math.min(tri[k],tri[(k+1)%3]),b=Math.max(tri[k],tri[(k+1)%3]);
       if(!within(a)||!within(b))continue;
       const l=Math.hypot(geometryRest.getX(a)-geometryRest.getX(b),geometryRest.getY(a)-geometryRest.getY(b),geometryRest.getZ(a)-geometryRest.getZ(b));
       if(l*(m.body?units:1)<.002)continue;
       edges.set(a+':'+b,{a,b,l});
      }
     }
     const all=[...edges.values()],stride=Math.max(1,Math.ceil(all.length/96));
     m.groups[part+'_'+side]=all.filter((_,i)=>i%stride===0);
    }
   }
   const a=actor.group.position.clone(),b=a.clone(),scale=a.clone();
   return ()=>{
    actor.group.updateMatrixWorld(true);
    const out={};
    for(const m of meshes){
     const o=m.object;o.userData.updateGarmentPose?.();o.getWorldScale(scale);
     const point=(i,v)=>m.body?o.localToWorld(o.getVertexPosition(i,v)):o.userData.deformGarmentVertex(i,v);
     out[m.name]={};
     for(const [id,edges] of Object.entries(m.groups)){
      let max=0,sum=0,peak=null;
      for(const edge of edges){
       const ratio=point(edge.a,a).distanceTo(point(edge.b,b))/(edge.l*scale.x),error=Math.abs(ratio-1);
       if(!Number.isFinite(error))throw Error('nonfinite leg mesh edge');
       if(error>max){
        max=error;
        const binding=o.userData.garmentBinding;
        const influences=i=>{
         if(m.body){const g=o.geometry.attributes;return ['X','Y','Z','W'].map(k=>({bone:actor.data.bones[g.skinIndex['get'+k](i)]?.id,weight:g.skinWeight['get'+k](i)})).filter(v=>v.weight>0);}
         if(!binding)return [];
         return Array.from({length:binding.slots},(_,k)=>({bone:actor.data.bones[binding.actual[i*binding.slots+k]]?.id,weight:binding.skinWeight[i*binding.slots+k]})).filter(v=>v.weight>0);
        };
        peak={vertices:[edge.a,edge.b],restLength:edge.l*scale.x,posedLength:ratio*edge.l*scale.x,rest:[edge.a,edge.b].map(i=>[m.rest.getX(i),m.rest.getY(i),m.rest.getZ(i)]),influences:[influences(edge.a),influences(edge.b)]};
       }
       sum+=error;
      }
      out[m.name][id]={samples:edges.length,maxRelativeLengthChange:max,meanRelativeLengthChange:edges.length?sum/edges.length:null,peak};
     }
    }
    return out;
   };
  }

  const out={};input.independentHeading=true;
  const cases=[['idle',[]],['walk',['KeyW']],['run',['KeyW','ShiftLeft']],['backpedal',['KeyS']],['pivot',['KeyA']],['jump',['Space']],['slope',['KeyW']],['stairs',['KeyW']],['blocked',['KeyW']]];
  for(const [name,codes] of cases){
   input.keys.clear();input.setSprint(false);d.reset();
   if(name==='slope'){const f=d.fixtures.curve;p.teleport(f.x+1,f.z,-Math.PI/2,0,.25);}
   if(name==='stairs'){const f=d.fixtures.stairs;p.teleport(f.x,f.z-.5,Math.PI,0,0);}
   if(name==='blocked'){const f=d.fixtures.ramps[0];p.teleport(f.x+f.width/2+.45,f.z-f.run/2,Math.PI/2,0,0);}
   const actor=d.avatars.actor,rig=m.measureRig(actor),frames=[];
   const pose=actor.pose;let authoredKnees=null,authoredLegMesh=null,sampleLegMesh=false;
   const probeLegMesh=['walk','stairs'].includes(name)?legMeshProbe(actor):null;
   actor.pose=function(angles){pose.call(this,angles);authoredKnees=Object.fromEntries(['left','right'].map(side=>[side,this.B['shin_'+side].quaternion.toArray()]));if(sampleLegMesh)authoredLegMesh=probeLegMesh();};
   const step=(i,record)=>{
    p.advance(1/60,input,[]);
    sampleLegMesh=Boolean(probeLegMesh&&record&&i%12===0);
    const before=p.pos.clone();d.avatars.update(1/60,i/60,{swing:null});
    if(before.distanceTo(p.pos)>1e-9)throw Error('avatar changed physics root');
    if(record){
     const hit=d.collision.probe(p.pos.x,p.pos.z,p.pos.y).hit;
     const frame=m.capturePose(actor,m.readMotionState(p,actor,hit),{time:i/60,groundSurface:d.playerFootSurface,ankleRest:rig.ankleRest});
     frame.headWorld=actor.B.head.getWorldQuaternion(actor.B.head.quaternion.clone()).toArray();
     frame.authoredKnees=authoredKnees;
     if(sampleLegMesh)frame.legMesh={authored:authoredLegMesh,postIK:probeLegMesh()};
     frame.kneeAxes=Object.fromEntries(['left','right'].map(side=>[side,actor.data.bones.find(b=>b.id==='shin_'+side).axes[0].d]));
     frames.push(frame);
    }
   };
   for(let i=0;i<60;i++)step(i,false);
   for(let i=60;i<72;i++)step(i,true);
   for(const c of codes)key('keydown',c);
   for(let i=72;i<132;i++)step(i,true);
   for(const c of codes)key('keyup',c);
   for(let i=132;i<192;i++)step(i,true);
   actor.pose=pose;
   out[name]={summary:m.summarizeMotionTrace(frames),quality:m.motionQuality(frames),frames};
  }
  d.reset();return out;
 });
 assert(trials.walk.summary.actions.some(a=>a.action==='walk'));
 assert(trials.run.summary.actions.some(a=>a.action==='run'),'actual sprint state did not activate');
 assert(trials.stairs.frames.some(f=>f.state.root[1]>.5),'actual stair route must ascend');
 assert(trials.run.frames.every(f=>f.headWorld?.length===4&&f.headWorld.every(Number.isFinite)),'actual head quaternion trace');
 assert(trials.backpedal.summary.actions.some(a=>a.action==='backpedal'));
 assert(trials.pivot.quality.pivotFrames>0);
 assert(trials.jump.quality.groundTransitions.some(x=>x.kind==='leave-ground'));
 assert(trials.jump.quality.groundTransitions.some(x=>x.kind==='land'));
 for(const trial of Object.values(trials))assert.equal(trial.quality.frames,132);
 // Isolate the legs instead of treating body/root smoothing as a proxy.
 const stairLegs={};
 for(const side of ['left','right']){
  let maxAnkleStep=0,maxJointStep=0,samples=0,previous=null,peak=null;
  for(const f of trials.stairs.frames){
   if(previous&&f.state.grounded&&previous.state.grounded&&f.state.root[1]>=previous.state.root[1]&&f.state.root[1]>.1){
    const ankle=f.feet.find(q=>q.side===side).ankle,old=previous.feet.find(q=>q.side===side).ankle;
    maxAnkleStep=Math.max(maxAnkleStep,Math.abs(ankle[1]-old[1]));
    for(const id of ['thigh_'+side,'shin_'+side,'foot_'+side]){
     const q=f.joints.find(j=>j.id===id).rotation,p=previous.joints.find(j=>j.id===id).rotation;
     const delta=2*Math.acos(Math.min(1,Math.abs(q.reduce((a,v,i)=>a+v*p[i],0))));
     if(delta>maxJointStep){maxJointStep=delta;peak={joint:id,time:f.time,action:f.state.action,phase:[previous.state.phase,f.state.phase],velocity:f.state.velocity,root:[previous.state.root,f.state.root],body:[previous.bodyRoot,f.bodyRoot],ankle:[old,ankle],surface:[previous.feet.find(q=>q.side===side).surface,f.feet.find(q=>q.side===side).surface],authored:[previous.authoredKnees[side],f.authoredKnees[side]],solved:[p,q]};}
    }
    samples++;
   }
   previous=f;
  }
  assert(samples>0&&Number.isFinite(maxAnkleStep)&&Number.isFinite(maxJointStep),'stair leg trace');
  stairLegs[side]={samples,maxAnkleStep,maxJointStep,peak};
 }
 console.log('T3.5 actual upward stair leg observations '+JSON.stringify(stairLegs));
 const kneeEvidence={};
 for(const name of ['walk','stairs','slope','backpedal']){
  let authored=0,postIK=0,samples=0;
  for(const frame of trials[name].frames){
   if(!frame.state.grounded)continue;
   for(const side of ['left','right']){
    const q=frame.joints.find(j=>j.id==='shin_'+side).rotation,a=frame.authoredKnees[side],axis=frame.kneeAxes[side],n=Math.hypot(...axis);
    const off=v=>Math.hypot(v[1]*axis[2]-v[2]*axis[1],v[2]*axis[0]-v[0]*axis[2],v[0]*axis[1]-v[1]*axis[0])/n;
    authored=Math.max(authored,off(a));postIK=Math.max(postIK,off(q));samples++;
   }
  }
  assert(samples>0&&postIK<1e-5,'ground knee hinge axis '+name+' '+postIK);
  kneeEvidence[name]={samples,authored,postIK};
 }
 console.log('T3.5 actual authored vs post-IK knee hinge evidence '+JSON.stringify(kneeEvidence));
 const legMeshEvidence={};
 for(const name of ['walk','stairs']){
  const evidence=trials[name].frames.filter(f=>f.legMesh).map(f=>f.legMesh);
  assert(evidence.length>0&&evidence.every(f=>f.authored&&f.postIK),'actual skin mesh comparison coverage');
  const summary={};for(const frame of evidence)for(const stage of ['authored','postIK'])for(const [mesh,parts] of Object.entries(frame[stage]))for(const [part,v] of Object.entries(parts)){
   const key=stage+':'+mesh+':'+part,record=summary[key]??(summary[key]={samples:0,maxRelativeLengthChange:0,peakMeanRelativeLengthChange:0});
   record.samples+=v.samples;if(v.maxRelativeLengthChange>record.maxRelativeLengthChange){record.maxRelativeLengthChange=v.maxRelativeLengthChange;record.peak=v.peak;}record.peakMeanRelativeLengthChange=Math.max(record.peakMeanRelativeLengthChange,v.meanRelativeLengthChange??0);
  }
  assert(Object.entries(summary).filter(([key])=>key.includes(':body:')).every(([,v])=>v.samples>0),'actual body mid-segment sample coverage');
  legMeshEvidence[name]=summary;
 }
 console.log('T3.5 body and pants mid-segment deformation observations '+JSON.stringify(legMeshEvidence));
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
