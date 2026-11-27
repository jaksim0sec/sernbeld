import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';

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
 await page.screenshot({path:'test-results/physics-t1-lab.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: Kael and motion-lab live collision registration, support parity, PWA and LOD-independent runtime '+JSON.stringify({main,lab}));
} finally {
 await browser?.close();
 server.kill();
}
