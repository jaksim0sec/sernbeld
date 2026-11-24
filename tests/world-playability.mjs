// Numeric integration test: use real generated terrain and colliders in a
// fresh browser, not screenshot comparison or synthetic geometry alone.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
const port=8794,home='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
let browser;
try{
 for(let i=0;i<80;i++){try{if((await fetch(home)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:780,height:360},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')console.log('BROWSER ERROR '+m.text().slice(0,500));});
 await page.goto(home,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.__dev,{},{timeout:180000});
 const result=await page.evaluate(()=>{
  const d=window.__dev,p=d.player,T=d.characterTypes;
  d.renderer.setAnimationLoop(null);
  const input=(x=0,z=0,jump=false)=>({move(){return {x,y:-z,mag:Math.hypot(x,z)}},run:()=>false,consumeJump(){const j=jump;jump=false;return j;}});
  const verify=(name)=>{const floor=d.playerTerrain(p.pos.x,p.pos.z);if(!Number.isFinite(p.pos.y)||p.pos.y<floor-.004)throw Error(name+' fell through actual terrain: '+JSON.stringify({pos:p.pos,floor}));if(d.playerContacts(p.pos.x,p.pos.z,p.pos.y).length)throw Error(name+' penetrated static collider: '+JSON.stringify(p.pos));};
  const places=[];
  for(const name of ['quay','plaza','smithy','monastery','north_gate','pier_a','pier_b']){
   const place=d.region.places[name];if(!place)continue;
   p.teleport(place[0],place[1],0);verify(name+' spawn');
   for(let i=0;i<90;i++){p.advance(1/60,input());verify(name+' idle');}
   places.push({name,pos:p.pos.toArray()});
  }
  const stairResults=[];
  for(const s of d.stairs.filter(s=>s.y1-s.y0>1)){
   const L=Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1]),dx=(s.b[0]-s.a[0])/L,dz=(s.b[1]-s.a[1])/L;
   const mid=(d.stairBounds[0]+d.stairBounds[1])*.5,u=1.5;
   const x=s.a[0]+dx*u+s.n[0]*mid,z=s.a[1]+dz*u+s.n[1]*mid;
   p.teleport(x,z,0,0,d.playerTerrain(x,z));verify('stair spawn');
   const start=p.pos.clone(),move=input(dx,dz);
   for(let i=0;i<120;i++){p.advance(1/60,move);verify('actual stair');}
   stairResults.push({start:s.a,move:Math.hypot(p.pos.x-start.x,p.pos.z-start.z),rise:p.pos.y-start.y});
  }
  // Find an actual open flat segment to exercise movement and landing.
  let clear=null;
  for(const place of Object.values(d.region.places)){
   if(!Array.isArray(place)||place.length<2)continue;
   const [x,z]=place,y=d.playerTerrain(x,z);
   if(y<2)continue;
   if([0,1,2,3,4].every(k=>Math.abs(d.playerTerrain(x+k,z)-y)<.10&&!d.playerContacts(x+k,z,y).length)){clear=[x,z];break;}
  }
  if(!clear)throw Error('No actual flat test segment');
  p.teleport(...clear,0);const start=p.pos.clone(),move=input(1,0,true);let peak=p.pos.y;
  for(let i=0;i<85;i++){p.advance(1/60,move);verify('actual jump');peak=Math.max(peak,p.pos.y);}
  const jump={rise:peak-start.y,travel:p.pos.distanceTo(start),grounded:p.onGround};
  return {places,stairs:stairResults,jump};
 });
 console.log('ACTUAL WORLD '+JSON.stringify(result));
 assert(result.places.length>=5);
 assert(result.stairs.length>=5&&result.stairs.filter(s=>s.move>2&&s.rise>.5).length>=5,'Real stairs are not traversable');
 assert(result.jump.rise>.5&&result.jump.grounded&&result.jump.travel>2,'Real jump/landing failed');
 assert.deepEqual(errors,[]);
 await context.close();
}finally{await browser?.close();server.kill();}
