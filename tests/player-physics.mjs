import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const game=read('src/gameplay/gameplay.part.js'),render=read('src/render/world-render.part.js'),region=read('src/world/region.part.js');
const part=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i);return s.slice(i,j);};
const T=new Function(read('src/vendor/three-gltf.part.js')+';return three_module_exports;')();
let terrain=()=>0,stairs=()=>null,water=()=>-100;
const env=new Function('Vector3','Vector2','sample','stairSurface','waterLevel','normalAt','World','HALF','GRID_N','CFG','clamp2',
 part(region,'var PLAYER =','var ring =')+part(render,'var CELL =','function occupiedAt')+part(game,'var _n =','var CameraRig =')+part(game,'function maktwoWorldRay','function shiftCameraWithinWorld')+'return {Player,PLAYER,addBox,addCyl,playerFloor,playerContacts,playerTerrain,maktwoWorldRay,grid,all};'
)(T.Vector3,T.Vector2,(x,z)=>terrain(x,z),(x,z,m,e)=>stairs(x,z,m,e),(x,z)=>water(x,z),(x,z,v)=>v.set(0,1,0),{},0,0,{cell:2.5,seaLevel:0},(x,a,b)=>Math.max(a,Math.min(b,x)));
const {Player,PLAYER,addBox,playerContacts,grid,all}=env;
const clear=()=>{grid.clear();all.length=0;terrain=()=>0;stairs=()=>null;water=()=>-100;};
function player(x=0,z=0,y=null){const p=new Player();p.teleport(x,z,0,0,y);return p;}
function input(x=0,y=0,run=false){return {jump:false,move(){const n=Math.hypot(x,y);return {x:x/Math.max(1,n),y:y/Math.max(1,n),mag:Math.min(1,n)};},run:()=>run,consumeJump(){const v=this.jump;this.jump=false;return v;}};}
const tick=(p,i,n=1,dt=1/60,near=[])=>{for(let k=0;k<n;k++)p.advance(dt,i,near);};
const box=(x,z,h,w=1,d=1,bot=0,walk=true)=>addBox({cx:x,cz:z,cy:(h+bot)/2,hy:(h-bot)/2,hx:w/2,hz:d/2,walk});
clear();let p=player();tick(p,input(1,1),120);assert(Math.abs(p.pos.x+p.pos.z)<1e-7);assert(Math.hypot(p.vel.x,p.vel.z)<=PLAYER.walk+1e-7);
const slow=player(),fast=player();tick(slow,input(1,1),60,1/30);tick(fast,input(1,1),240,1/120);assert(slow.pos.distanceTo(fast.pos)<1e-6,'frame-rate-dependent movement');
clear();box(1,0,2,.3,10);p=player();const diagonal=input(1,1,true);
let lastZ=0;for(let k=0;k<120;k++){tick(p,diagonal);assert(p.pos.z<=lastZ+1e-7,'zigzag at wall');lastZ=p.pos.z;if(p.pos.z>=-5)assert(p.pos.x<.51,'wall side penetration');assert(!playerContacts(p.pos.x,p.pos.z,p.pos.y).length,'wall penetration');assert(Math.hypot(p.vel.x,p.vel.z)<=PLAYER.run+1e-6,'collision injected speed');}
assert(p.pos.x>1&&p.pos.z<-5.35,'wall slide failed to clear the end');assert(!playerContacts(p.pos.x,p.pos.z,p.pos.y).length);
clear();box(1.2,0,.35,1.2,3,0,false);p=player();let high=0;for(let k=0;k<70;k++){tick(p,input(1,0));high=Math.max(high,p.pos.y);}
assert(high>=.35-1e-6,'generic low obstacle not climbable');assert(p.pos.x>2.2,'stuck on low obstacle');
clear();box(1.2,0,.65,1.2,3);p=player();tick(p,input(1,0),70);assert(p.pos.x<.26&&p.pos.y===0,'high obstacle climbed without jump');
clear();box(1.2,0,.35,1.2,3);box(.9,0,2.1,1.8,3,1.85,false);p=player(-.4);tick(p,input(1,0),70);assert(p.pos.y<.05,'step penetrated ceiling');
clear();p=player();let i=input(1,0,true);i.jump=true;let peak=0;for(let k=0;k<100;k++){tick(p,i);peak=Math.max(peak,p.pos.y);assert(Math.hypot(p.vel.x,p.vel.z)<=PLAYER.run+1e-6);}
assert(peak>.8&&peak<1.1&&p.onGround&&p.pos.y===0,'jump/landing');
clear();box(0,0,2.1,4,4,1.95);p=player(0,0,.0);p.onGround=true;i=input();i.jump=true;tick(p,i,20);assert(p.pos.y<=.23+1e-6,'head passed through ceiling');tick(p,i,60);assert(p.onGround);
clear();box(0,0,1,4,4);p=player(0,0,3);p.onGround=false;tick(p,input(),80);assert(p.onGround&&Math.abs(p.pos.y-1)<1e-6,'descending missed solid top');
clear();box(0,0,1,4,4);p=player(0,0,-.1);p.onGround=false;p.vel.y=5;tick(p,input(),1);assert(p.pos.y<.1,'airborne snapped to upper deck');
clear();stairs=(x,z,m,exact)=>x>=0&&x<3&&Math.abs(z)<1?(exact?Math.floor(x/.5)*.25:Math.floor(x/.5)*.25+.1):null;p=player(-.2);high=0;
for(let k=0;k<100;k++){tick(p,input(1,0));if(p.pos.x>=0&&p.pos.x<3){assert(Math.abs(p.pos.y-Math.floor(p.pos.x/.5)*.25)<1e-6,'feet not on rendered tread');high=Math.max(high,p.pos.y);}}
assert(high>=1.2&&p.pos.x>3);
clear();terrain=(x,z)=>x*.4;p=player();tick(p,input(1,0),60);assert(p.pos.x>1.8&&p.onGround&&Math.abs(p.pos.y-terrain(p.pos.x,0))<1e-6);
clear();terrain=(x,z)=>x>0?x*2:0;p=player(-.2);tick(p,input(1,0),60);assert(p.pos.x<.18,'steep cliff climbed');
clear();terrain=()=>-3;water=()=>0;p=player(0,0,-3);tick(p,input(1,0),180);assert(p.swimming&&Math.abs(p.pos.y+1.32)<.08);
clear();p=player();const npc={type:'cyl',x:.8,z:0,r:.27,bot:0,top:1.72};tick(p,input(1,0),80,1/60,[npc]);assert(p.pos.x<.2&&Math.hypot(p.vel.x,p.vel.z)<=PLAYER.walk);
clear();p=player();tick(p,input(1,1),10);p.teleport(50,60,0);assert(p.renderPos.distanceTo(p.pos)===0,'teleport interpolation ghost');
console.log('PASS: fixed-step diagonal movement, wall slide, generic steps, head clearance, jumps, landings, exact treads, slopes, swimming, NPC contact and teleport interpolation');

clear();p=player(0,0,-.1);tick(p,input(),120);assert(p.onGround&&Math.abs(p.pos.y)<1e-6,'feet below terrain must recover instead of falling forever');
clear();box(0,0,2,2,2,0,false);p=player();assert(Math.abs(p.pos.y)<.01&&!playerContacts(p.pos.x,p.pos.z,p.pos.y).length,'spawn inside a nonwalkable building must find a nearby valid position, not its roof');
clear();box(.05,0,2,.016,2,0,false);assert(env.maktwoWorldRay({x:0,y:1,z:0},{x:1,y:0,z:0},1)<.06,'camera ray missed thin wall');
clear();box(2,0,1.07,2,2,1.03,false);assert(env.maktwoWorldRay({x:2,y:2,z:0},{x:0,y:-1,z:0},1.5)<.95,'camera ray missed thin deck');
clear();box(1,0,2,.3,10);const grazing=env.maktwoWorldRay({x:0,y:1,z:0},{x:0,y:0,z:-1},3);assert(grazing===3,'parallel clear ray falsely blocked');
clear();stairs=(x,z,m,e)=>x>=.01&&x<1?.3:null;p=player();for(let j=0;j<12;j++){tick(p,input(1,0));assert(p.renderPos.y>=env.playerTerrain(p.renderPos.x,p.renderPos.z)-.002,'presentation interpolates through a tread');}
clear();terrain=x=>x<0?0:.2;p=player(-.01);for(let j=0;j<12;j++){tick(p,input(1,0));assert(p.pos.y>=terrain(p.pos.x)-.002,'physics went beneath terrain');}
console.log('PASS terrain recovery, safe spawn, thin-wall/deck ray and presentation floor');

{
  // Real Kael geometry regression: visual stone planters, balconies and rails
  // must use the same registered solid shapes as the player's contact solver.
  const section=(start,end)=>{
    const a=game.indexOf(start),b=game.indexOf(end,a);
    assert(a>=0&&b>a,'Kael collision fixture section missing: '+start);
    return game.slice(a,b);
  };
  const added=[],palette=new Proxy({},{get:()=>0});
  const build=new Function('addBox','terraceAt','C','PAT','icosa','WALL',
    section('var box2 =','var off2 =')+
    section('function buildScenicWings(','function buildKaelGardens(')+
    section('function buildKaelGardens(','function buildStairs(')+
    'return {buildScenicWings,buildKaelGardens}');
  const {buildKaelGardens,buildScenicWings}=build(
    collider=>added.push(collider),()=>({y:24}),palette,palette,()=>{},2.6);
  const drawn=()=>({boxes:[],box(...args){this.boxes.push(args);},arch(){},quad(){},cone(){}});
  const registered=(box,walk=false)=>added.some(c=>
    Math.abs(c.cx-box[0])<1e-6&&Math.abs(c.cy-(box[1]+box[4]/2))<1e-6&&
    Math.abs(c.cz-box[2])<1e-6&&Math.abs(c.hx-box[3]/2)<1e-6&&
    Math.abs(c.hy-box[4]/2)<1e-6&&Math.abs(c.hz-box[5]/2)<1e-6&&c.walk===walk);
  const gardens=drawn();buildKaelGardens(gardens,()=>.5);
  assert.equal(gardens.boxes.length,16,'Garden fixture changed');
  assert(gardens.boxes.every(b=>registered(b)),'A visible stone garden bed has no collision');
  const scenery=drawn();buildScenicWings(scenery,()=>.5);
  const decks=scenery.boxes.filter(b=>b[4]===.7&&b[5]===3.9);
  const rails=scenery.boxes.filter(b=>b[3]===.45&&b[4]===1.2&&b[5]===.45);
  const bases=scenery.boxes.filter(b=>b[4]===1.2&&b[3]>7&&b[5]>7);
  assert.equal(decks.length,4);assert.equal(rails.length,16);assert.equal(bases.length,3);
  assert(decks.every(b=>registered(b,true)),'A balcony deck lacks walkable support');
  assert(rails.every(b=>registered(b)),'A balcony rail can be walked through');
  assert(bases.every(b=>registered(b,true)),'A lookout base lacks solid support');
  console.log('PASS: Kael planter, balcony, railing and lookout geometry has matching colliders');
}

{
  // All authored Kael flights, including perpendicular side alleys and landings.
  const tr=read('src/world/terrain-runtime.part.js');
  const {STAIRS,v0,v1}=new Function(part(tr,'var S =','var P =')+
    part(tr,'var WALL =','var S =')+
    part(tr,'var STAIR_V =','function stairSurface')+
    'return {STAIRS,v0:STAIR_MIN_V,v1:STAIR_MAX_V};')();
  const palette=new Proxy({},{get:()=>0});
  let faces=0,rails=0;
  const eq=(a,b)=>Math.abs(a-b)<1e-6;
  for(const s of STAIRS){
    clear();
    const [nx,nz]=s.n,L=Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1]);
    const ux=(s.b[0]-s.a[0])/L,uz=(s.b[1]-s.a[1])/L;
    const uv=p=>[(p[0]-s.a[0])*ux+(p[2]-s.a[1])*uz,(p[0]-s.a[0])*nx+(p[2]-s.a[1])*nz];
    const point=(u,v)=>[s.a[0]+ux*u+nx*v,s.a[1]+uz*u+nz*v];
    const quads=[],boxes=[];
    new Function('STAIRS','STAIR_MIN_V','STAIR_MAX_V','groundNoStair','C','PAT','addBox','G',
      part(game,'var box2 =','var off2 =')+
      part(game,'function buildStairs(','var ROOFS =')+'buildStairs(G);'
    )([s],v0,v1,()=>s.y0-8,palette,palette,addBox,{quad(...a){quads.push(a.slice(0,4));},box(...a){boxes.push(a);}});
    const fascia=quads.filter(q=>q.every(p=>eq(uv(p)[1],v1))&&!eq(q[0][1],q[1][1])&&eq(q[1][1],q[2][1]));
    assert.equal(fascia.length,Math.max(1,Math.ceil(Math.abs(s.y1-s.y0)/.3)));
    for(const q of fascia){
      const lo=q[0][1],hi=q[1][1],u=(uv(q[0])[0]+uv(q[3])[0])/2;
      const [x,z]=point(u,v1-.02);
      assert(all.some(o=>eq(o.cx,x)&&eq(o.cz,z)&&eq(o.bot,lo)&&eq(o.top,hi)&&eq(o.hx,Math.abs(uv(q[3])[0]-uv(q[0])[0])/2)&&eq(o.hz,.02)&&!o.walk),'Rendered stair side missing exact solid');
      faces++;
    }
    for(const [x,y,z,w,h,d,yaw] of boxes){
      assert(all.some(o=>eq(o.cx,x)&&eq(o.cz,z)&&eq(o.bot,y)&&eq(o.top,y+h)&&eq(o.hx,w/2)&&eq(o.hz,d/2)&&eq(o.yaw,yaw)&&!o.walk),'Rendered stair box differs from solid');
      if(eq(d,.45))rails++;
    }
    const q=fascia[Math.floor(fascia.length/2)],u=(uv(q[0])[0]+uv(q[3])[0])/2;
    const y=q[1][1]-.8,[x,z]=point(u,v1+1);
    terrain=()=>y;p=player(x,z,y);
    assert(env.maktwoWorldRay({x,y:y+.2,z},{x:-nx,y:0,z:-nz},2)<1.02,'Camera ray passed through stair side');
    for(let k=0;k<60;k++){
      tick(p,input(-nx,nz),1,k%3===0?1/30:1/60);
      assert(uv([p.pos.x,p.pos.y,p.pos.z])[1]>=v1+PLAYER.radius-.004,'Player crossed the visible stair side');
    }
  }
  assert(STAIRS.length>=13&&faces>500&&rails>100);
  console.log('PASS: '+STAIRS.length+' Kael flights/landings, '+faces+' fascia faces, '+rails+' parapets; side approach and camera ray');
}


// Grazing a rotated crate: using the far endpoint normal instead of
// the first blocked probe formerly stalled the player at its rounded corner.
for(const a of [3.04,4.64,6.24,1.44]){
  clear();
  addBox({cx:0,cz:0,cy:1,hy:1,hx:.5,hz:.5,yaw:.3,walk:false});
  const dx=Math.cos(a),dz=Math.sin(a),offset=-.7;
  const sx=-dx*2-dz*offset,sz=-dz*2+dx*offset;
  const walker=player(sx,sz),move=input(dx,-dz,true);
  for(let k=0;k<80;k++){
    tick(walker,move);
    assert(!playerContacts(walker.pos.x,walker.pos.z,walker.pos.y).length,'grazing penetrated crate');
    assert(Math.hypot(walker.vel.x,walker.vel.z)<=PLAYER.run+1e-6,'grazing injected speed');
  }
  const progress=(walker.pos.x-sx)*dx+(walker.pos.z-sz)*dz;
  assert(progress>5,'grazing snagged a rounded corner: '+a+' progress '+progress);
  console.log('PASS corner grazing angle '+a+' progress '+progress.toFixed(3)+'m');
}
