// Run the same generated-world scenarios in Chromium or with Node alone.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';

function checkWorld(d=window.__dev) {
  const p=d.player,T=d.characterTypes;
  d.renderer?.setAnimationLoop(null);
  const input=(x=0,z=0,jump=false)=>({move(){return {x,y:-z,mag:Math.hypot(x,z)}},run:()=>false,consumeJump(){const j=jump;jump=false;return j;}});
  const verify=(name)=>{const floor=d.playerTerrain(p.pos.x,p.pos.z);if(!Number.isFinite(p.pos.y)||p.pos.y<floor-.004)throw Error(name+' fell through actual terrain: '+JSON.stringify({pos:p.pos,floor}));if(d.playerContacts(p.pos.x,p.pos.z,p.pos.y).length)throw Error(name+' penetrated static collider: '+JSON.stringify(p.pos));};
  const places=[];
  for(const name of ['quay','plaza','smithy','monastery','north_gate','pier_a','pier_b']){
   const place=d.region.places[name];if(!place)continue;
   p.teleport(place[0],place[1],0);verify(name+' spawn');
   for(let i=0;i<90;i++){p.advance(1/60,input());verify(name+' idle');}
   places.push({name,pos:p.pos.toArray()});
  }
  const {stairSeams,material}=d.terrain;
  if(!/\bdiscard\b/.test(material.fragmentShader))throw Error('Terrain must still clip over the stair treads');
  if(/\bdiscard\b/.test(stairSeams.material.fragmentShader)||!stairSeams.material.depthWrite)throw Error('Terrain cut boundaries must write depth without stair clipping');
  const seams=stairSeams.geometry;
  const sp=seams.attributes.position,si=seams.index;
  if(!sp.count||!si.count)throw Error('Missing terrain cut boundary geometry');
  for(let i=0;i<sp.count;i+=4){
   const lo=sp.getY(i),top0=sp.getY(i+3),top1=sp.getY(i+2);
   if(top0<lo-.0001||top1<lo-.0001||Math.abs(sp.getY(i+1)-lo)>.0001)throw Error('Invalid terrain cut boundary');
   for(const j of [i+2,i+3]){
    const x=sp.getX(j),z=sp.getZ(j),top=sp.getY(j);
    if(Math.abs(top-d.terrain.heightfieldTriangle(x,z))>.004)throw Error('Terrain cut boundary does not meet heightfield');
   }
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
  // These three visible surfaces are generated independently of the terrain.
  // Physically walk into each one, then test camera clearance separately.
  const wallResults=[];
  const moveIntoWall=input(0,-1);
  const walls=[
   {name:'retaining wall buttress',x:447.19,z:-448,front:-448.45},
   {name:'terrace building front',x:453.75,z:-445,front:-445.45},
   {name:'stair support',x:438.36,z:-471.85,front:-472.30},
  ];
  for(const {name,x,z,front} of walls){
   const height=d.playerTerrain(x,z);
   p.teleport(x,z,0,0,height);
   verify(name+' spawn');
   if(p.pos.distanceTo(new T.Vector3(x,height,z))>.01)throw Error(name+' start point was relocated');
   const direction=new T.Vector3(0,0,-1);
   const cameraHit=d.maktwoWorldRay(new T.Vector3(x,height+1.5,z),direction,1);
   for(let i=0;i<60;i++){
    p.advance(i%3===0?1/30:1/60,moveIntoWall);
    verify(name);
    if(p.pos.z<front+.34)throw Error(name+' player crossed the rendered face at '+p.pos.toArray());
   }
   if(cameraHit>.46||cameraHit<.4)throw Error(name+' camera ray missed the rendered face: '+cameraHit);
   wallResults.push({name,cameraHit,clearance:p.pos.z-front});
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
  // Chromium only: use the actual Input instance and its window event
  // listeners, not the synthetic move() adapter used by the world scenarios.
  let keyboard=null;
  if(d.input){
   const live=d.input,heading=-Math.PI/2;
   const candidates=[[clear[0]+2,clear[1]],...Object.values(d.region.places).filter(v=>Array.isArray(v)&&v.length>=2)];
   let patch=null;
   for(const [x,z] of candidates){
    const y=d.playerTerrain(x,z);
    if(y<2)continue;
    let open=true;
    for(let dx=-1;dx<=1;dx+=.5)for(let dz=-1;dz<=1;dz+=.5){
     const h=d.playerTerrain(x+dx,z+dz);
     if(Math.abs(h-y)>.10||d.playerContacts(x+dx,z+dz,h).length)open=false;
    }
    if(open){patch=[x,z];break;}
   }
   if(!patch)throw Error('No open flat keyboard test patch');
   const event=(type,code)=>window.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true,cancelable:true}));
   const trial=(codes,frames)=>{
    live.keys.clear();live.stick.x=live.stick.y=0;live.setSprint(false);
    const previousIndependent=live.independentHeading;live.independentHeading=true;
    p.teleport(...patch,heading);
    const origin=p.pos.clone();
    try{
     for(const code of codes)event('keydown',code);
     if(!live.keyboardSteering||!codes.every(code=>live.keys.has(code)))throw Error('Actual keyboard event did not reach Input');
     for(let i=0;i<frames;i++){p.advance(1/60,live);verify('actual keyboard '+codes.join('+'));}
     return {x:p.pos.x-origin.x,z:p.pos.z-origin.z,yaw:p.facingYaw-heading,cameraYaw:p.yaw-heading,running:p.running};
    }finally{
     for(const code of codes)event('keyup',code);
     if(codes.some(code=>live.keys.has(code)))throw Error('Actual keyup did not clear Input');
     live.consumeToggles();live.independentHeading=previousIndependent;
    }
   };
   const forward=trial(['KeyW'],18),back=trial(['KeyS','ShiftLeft'],18);
   const left=trial(['KeyA'],30),right=trial(['KeyD'],30);
   const arcL=trial(['KeyW','KeyA'],18),arcR=trial(['KeyW','KeyD'],18);
   const reverseL=trial(['KeyS','KeyA'],18),reverseR=trial(['KeyS','KeyD'],18);
   if(!(forward.x>.4&&back.x<-.4&&!back.running&&Math.abs(forward.z)+Math.abs(back.z)<.02&&Math.abs(forward.yaw)+Math.abs(back.yaw)<1e-6))throw Error('Keyboard forward/back failed '+JSON.stringify({forward,back}));
   if(!(left.yaw>1.19&&right.yaw< -1.19&&Math.hypot(left.x,left.z,right.x,right.z)<.01))throw Error('Keyboard turn in place failed '+JSON.stringify({left,right}));
   if(!(arcL.x>.3&&arcR.x>.3&&arcL.z<-.05&&arcR.z>.05&&arcL.yaw>.7&&arcR.yaw<-.7&&reverseL.x<-.3&&reverseR.x<-.3&&reverseL.z>.05&&reverseR.z<-.05))throw Error('Keyboard simultaneous forward/reverse turn failed '+JSON.stringify({arcL,arcR,reverseL,reverseR}));
   keyboard={forward,back,left,right,arcL,arcR,reverseL,reverseR};
   if(Object.values(keyboard).some(v=>Math.abs(v.cameraYaw)>1e-8))throw Error('Physical keyboard steering directly rotated the camera');
  }
  const traversals=[];
  // Generated Kael stonework, including a rotated low lip and a high wall.
  for(const [kind,x,z,yaw,top] of [
   ['mantle',318.507047,-523.715800,-2.980830,108.005930],
   ['mantle',282.94,-473.357143,-Math.PI/2,82.323480],
   ['latch',500.528781,-519.345159,3.117788,104.314419]
  ]){
   p.teleport(x,z,yaw,0,d.playerTerrain(x,z));
   const movement=input(0,-1,true);
   p.advance(1/60,movement);
   if(p.traversal?.kind!==kind)throw Error('Expected '+kind+' on generated wall at '+[x,z]);
   const stages=new Set();
   for(let frame=0;frame<390&&p.traversal;frame++){
    stages.add(p.traversal.kind);
    p.advance(1/60,movement);verify(kind+' on generated wall');
   }
   if(!p.onGround||p.traversal||Math.abs(p.pos.y-top)>.005)throw Error('Traversal landing missed generated top');
   traversals.push({kind,top:p.pos.y,stages:[...stages]});
  }
  return {places,stairs:stairResults,walls:wallResults,jump,traversals,keyboard};
}

async function loadWorld() {
 const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const slice=(source,start,end)=>{
  const i=source.indexOf(start),j=source.indexOf(end,i);
  assert(i>=0&&j>i,'Missing runtime section '+start);
  return source.slice(i,j);
 };
 const game=read('src/gameplay/gameplay.part.js');
 const load=new Function('requestAnimationFrame',[
  read('src/vendor/three-gltf.part.js'),
  read('src/world/region.part.js'),
  read('src/world/terrain-patch.part.js'),
  read('src/world/terrain-runtime.part.js'),
  read('src/render/world-render.part.js'),
  slice(game,'var TOWN =','function mat'),
  slice(game,'var C =','function createCutstoneBridge'),
  slice(game,'var _n =','var CameraRig ='),
  slice(game,'var NavGrid = class','var NAMED ='),
  slice(game,'function maktwoWorldRay','function shiftCameraWithinWorld'),
  `return async () => {
    await generateWorld(SERNBELD, () => {});
    buildKael(SERNBELD);
    return {player: new Player(), characterTypes: {Vector3}, playerTerrain,
      playerContacts, maktwoWorldRay, terrain:new TerrainLOD(new Scene(),makeTerrainMaterial()), region: SERNBELD, stairs: STAIRS,
      stairBounds: [STAIR_MIN_V, STAIR_MAX_V]};
  };`
 ].join('\n'));
 return load(queueMicrotask)();
}

async function checkBrowser() {
 const {chromium}=await import('playwright');
 const port=8794,home='http://127.0.0.1:'+port+'/';
 const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
 let browser;
 try {
  for(let i=0;i<80;i++){try{if((await fetch(home)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:780,height:360},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')console.log('BROWSER ERROR '+m.text().slice(0,500));});
  await page.goto(home,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.__dev,{},{timeout:180000});
  const result=await page.evaluate(checkWorld);
  assert.deepEqual(errors,[]);
  return result;
 } finally {
  await browser?.close();
  server.kill();
 }
}

const noBrowser=process.argv.includes('--no-browser');
const result=noBrowser?checkWorld(await loadWorld()):await checkBrowser();
console.log('ACTUAL WORLD '+(noBrowser?'(Node) ':'(Chromium) ')+JSON.stringify(result));
assert(result.places.length>=5);
assert(result.stairs.length>=5&&result.stairs.filter(s=>s.move>2&&s.rise>.5).length>=5,'Real stairs are not traversable');
assert.equal(result.walls.length,3);
if(!noBrowser)assert(result.keyboard,'Actual Chromium keyboard event scenarios did not run');
assert(result.jump.rise>.5&&result.jump.grounded&&result.jump.travel>2,'Real jump/landing failed');

assert(result.traversals.some(x=>x.stages.includes("climb")&&x.stages.includes("mantle")));
