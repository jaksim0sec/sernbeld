import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const game=read('src/gameplay/gameplay.part.js'),render=read('src/render/world-render.part.js'),region=read('src/world/region.part.js');
const part=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i);return s.slice(i,j);};
const T=new Function(read('src/vendor/three-gltf.part.js')+';return three_module_exports;')();
let terrain=()=>0,stairs=()=>null,water=()=>-100;
const env=new Function('Vector3','Vector2','sample','stairSurface','waterLevel','normalAt','World','HALF','GRID_N','CFG','clamp2',
 part(region,'var PLAYER =','var ring =')+part(render,'var CELL =','function occupiedAt')+part(game,'var _n =','var CameraRig =')+part(game,'function maktwoWorldRay','function shiftCameraWithinWorld')+'return {Player,PLAYER,addBox,addCyl,addRoof,playerFloor,playerContacts,playerTerrain,maktwoWorldRay,grid,all,roofGrid,roofSlabHit};'
)(T.Vector3,T.Vector2,(x,z)=>terrain(x,z),(x,z,m,e)=>stairs(x,z,m,e),(x,z)=>water(x,z),(x,z,v)=>v.set(0,1,0),{},0,0,{cell:2.5,seaLevel:0},(x,a,b)=>Math.max(a,Math.min(b,x)));
const {Player,PLAYER,addBox,addCyl,addRoof,playerContacts,grid,all,roofGrid,roofSlabHit}=env;
const clear=()=>{grid.clear();roofGrid.clear();all.length=0;terrain=()=>0;stairs=()=>null;water=()=>-100;};
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
clear();box(1.2,0,.65,1.2,3);p=player();let climbed=false;for(let k=0;k<180;k++){tick(p,input(1,0));climbed||=p.pos.y>.6&&p.onGround;}assert(climbed,'automatic low mantle did not land');
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
clear();terrain=(x,z)=>Math.min(3.1,Math.max(0,x*2));p=player(-.2);let latched=false;for(let k=0;k<360;k++){tick(p,input(1,0));latched||=p.traversal?.kind==='latch';}assert(latched&&p.pos.y>=3.1-.002,'automatic steep slope failed '+JSON.stringify(p.pos));
clear();terrain=()=>-3;water=()=>0;p=player(0,0,-3);tick(p,input(1,0),180);assert(p.swimming&&Math.abs(p.pos.y+1.32)<.08);
clear();p=player();const npc={type:'cyl',x:.8,z:0,r:.27,bot:0,top:1.72};tick(p,input(1,0),80,1/60,[npc]);assert(p.pos.x<.2&&Math.hypot(p.vel.x,p.vel.z)<=PLAYER.walk);
clear();p=player();tick(p,input(1,1),10);p.teleport(50,60,0);assert(p.renderPos.distanceTo(p.pos)===0,'teleport interpolation ghost');
console.log('PASS: fixed-step diagonal movement, wall slide, generic steps, head clearance, jumps, landings, exact treads, slopes, swimming, NPC contact and teleport interpolation');

{
  clear();
  const sprint = input(1, 0, true), walk = input(1, 0), idle = input(0, 0, true);
  const runner = player(), fastFrames = player();
  const max = runner.stamina;
  assert.equal(PLAYER.run,7.5,'sprint is 1.5x previous speed');
  assert.equal(PLAYER.walk,2.6,'walk speed preserved');
  tick(runner, idle, 60);
  tick(runner, walk, 60);
  assert.equal(runner.stamina, max, 'idle or walking drained stamina');

  tick(runner, sprint, 120);
  tick(fastFrames, sprint, 240, 1/120);
  assert(Math.abs(runner.stamina - 75) < 1e-8 && runner.running);
  assert.equal(runner.stamina, fastFrames.stamina, 'stamina drain depends on frame rate');
  tick(runner, sprint, 360);
  assert.equal(runner.stamina, 0);
  assert(runner.exhausted && !runner.running);
  tick(runner, sprint, 108);
  assert(runner.exhausted && !runner.running);
  assert(Math.abs(Math.hypot(runner.vel.x, runner.vel.z) - PLAYER.walk) < 1e-7);
  tick(runner, sprint, 15);
  assert(runner.running && !runner.exhausted);
  const remaining = runner.stamina;
  tick(runner, walk, 30);
  assert.equal(runner.stamina, remaining, 'recovery started before its delay');
  tick(runner, walk, 300);
  assert.equal(runner.stamina, max, 'walking did not restore full stamina');

  clear();
  box(1, 0, 3, .3, 40);
  const blocked = player();
  tick(blocked, walk, 60);
  tick(blocked, sprint, 120);
  assert.equal(blocked.stamina, max, 'pushing straight into a wall drained stamina');

  clear();
  const jumper = player(0, 0, 3);
  tick(jumper, sprint, 12);
  assert(!jumper.onGround && jumper.stamina === max, 'airborne movement drained stamina');

  terrain = () => -3;
  water = () => 0;
  const swimmer = player(0, 0, -3);
  tick(swimmer, input(), 120);
  tick(swimmer, sprint, 120);
  assert(swimmer.swimming && swimmer.stamina === max && swimmer.vel.x > 3.5, 'swimming boost uses sprint stamina');
  swimmer.setMode('fly');
  tick(swimmer, {...sprint, vertical: () => 0}, 60);
  assert.equal(swimmer.stamina, max, 'flight boost drained stamina');
  console.log('PASS: sprint drain, fixed ticks, exhaustion, recovery, wall contact, airborne movement, swimming and flight');
}

{
  function traverseFixture({height=1.1,depth=1.5,yaw=0,climbable=true,ceiling=false}={}){
    clear();
    const nx=Math.sin(yaw),nz=Math.cos(yaw);
    const solid=addBox({cx:0,cz:0,cy:height/2,hy:height/2,hx:2,hz:depth/2,yaw,climbable});
    if(ceiling)addBox({cx:0,cz:0,cy:height+1.6,hy:.10,hx:2,hz:depth/2,yaw});
    const p=player(nx*(depth/2+.41),nz*(depth/2+.41));
    p.yaw=yaw;
    const move=input(0,1);move.jump=true;
    tick(p,move);
    return {p,move,solid,nx,nz};
  }
  for(const height of [.50,1.08,1.70]){
    const {p,move,solid,nx,nz}=traverseFixture({height,yaw:.43});
    assert.equal(p.traversal?.kind,'mantle');
    const hold=p.traversal.hands.map(h=>h.point.clone());
    assert(hold.every(h=>Math.abs(h.x*nx+h.z*nz-solid.hz)<1e-8&&Math.abs(h.y-height)<1e-8));
    for(let k=0;k<110&&p.traversal;k++){
      tick(p,move);
      assert(!playerContacts(p.pos.x,p.pos.z,p.pos.y).length,'mantle penetrated a solid');
      assert(!playerContacts(p.renderPos.x,p.renderPos.z,p.renderPos.y).length,'mantle presentation penetrated a solid');
    }
    assert(p.onGround&&!p.traversal&&Math.abs(p.pos.y-height)<1e-8,'did not finish on top');
  }

  const tall=traverseFixture({height:3.4,yaw:.61});
  assert.equal(tall.p.traversal?.kind,'latch');
  let climbs=0,last=null;
  for(let k=0;k<450&&tall.p.traversal;k++){
    tick(tall.p,tall.move);
    assert(!playerContacts(tall.p.pos.x,tall.p.pos.z,tall.p.pos.y).length);
    const action=tall.p.traversal;
    if(action?.kind==='climb'&&last!==action){
      assert.equal(action.hands[1-action.moving],last.hands[1-action.moving],'support hand slides');
      assert.equal(action.feet[action.moving],last.feet[action.moving],'support foot slides');
      assert(action.hands.every(h=>Math.abs(h.point.x*tall.nx+h.point.z*tall.nz-tall.solid.hz)<1e-8));
      climbs++;
    }
    last=action;
  }
  assert(climbs>=5&&tall.p.onGround&&Math.abs(tall.p.pos.y-3.4)<1e-8);
  assert(tall.p.stamina<100);

  const dangling=traverseFixture({height:12});
  tick(dangling.p,input(),32);
  const hang=dangling.p.pos.clone();
  tick(dangling.p,input(),45);
  assert(dangling.p.pos.distanceTo(hang)<1e-8,'neutral input should hang');
  const release=input();release.jump=true;tick(dangling.p,release);
  assert.equal(dangling.p.traversal,null);
  assert(dangling.p.vel.z>0);
  const exhausted=traverseFixture({height:12});
  exhausted.p.stamina=.5;
  tick(exhausted.p,exhausted.move,5);
  assert(exhausted.p.exhausted&&!exhausted.p.traversal,'exhaustion must release the wall');

  for(const options of [{depth:.26},{height:1.35,ceiling:true},{climbable:false}]){
    const blocked=traverseFixture(options);
    assert.equal(blocked.p.traversal,null,'invalid support or ceiling accepted');
    assert(blocked.p.vel.y>0,'ordinary jump was lost');
  }

  for(const grade of [1.32,2.2]){
    clear();terrain=x=>Math.min(3.1,Math.max(0,x*grade));p=player(-.04);
    const uphill=input(1,0);uphill.jump=true;tick(p,uphill);
    assert(p.traversal?.kind==='latch'&&p.traversal.tilt>0);
    let finished=false;
    for(let k=0;k<480&&p.traversal;k++){
      tick(p,uphill);
      assert(p.pos.y>=terrain(p.pos.x)-.002);
      if(p.traversal?.kind==='climb')assert(p.traversal.hands.every(h=>Math.abs(h.point.y-terrain(h.point.x))<1e-5));
      finished||=p.traversal?.kind==='crest';
    }
    assert(finished&&p.onGround&&Math.abs(p.pos.y-3.1)<1e-5,'steep heightfield did not reach its crest at grade '+grade);
  }
  console.log('PASS traversal: lip height, rotated wall anchors, planted supports, exhaustion/drop, headroom and steep terrain crest');
}

{
  // Steep ground (>50 deg) is never standing ground: no free hop-climbing,
  // no walking glued down a cliff, and a body on it slides off.
  for(const grade of [1.3,2.5,4]){
    clear();terrain=x=>x>0?x*grade:0;
    for(const tired of [true,false]){
      const p=player(-.3),hop=input(1,0);let peak=0;
      for(let k=0;k<600;k++){
        if(tired){p.stamina=0;p.exhausted=true;}
        if(p.onGround)hop.jump=true;
        tick(p,hop);
        if(!p.traversal)peak=Math.max(peak,p.pos.y);
        else assert(!tired,'exhausted body grabbed a steep face');
      }
      if(tired)assert(peak<1.2,'jump-hopped up a steep slope at grade '+grade);
    }
  }
  for(const grade of [1.3,4]){
    clear();terrain=x=>x>0?-x*grade:0;const p=player(-.3);let air=0;
    for(let k=0;k<40;k++){tick(p,input(1,0));if(p.pos.x>.2&&!p.onGround)air++;}
    assert(air>0&&p.pos.y<-1,'walked glued down a cliff at grade '+grade);
  }
  clear();terrain=x=>x>0?-x*.9:0;let p=player(-.3);
  for(let k=0;k<60;k++){tick(p,input(1,0));assert(p.onGround,'walkable descent left the ground');}
  clear();terrain=x=>Math.max(0,(x+6)*2);p=player(-2,0,8);
  const still=input();still.jump=true;tick(p,still,90);
  assert(p.pos.x<-4.5&&p.pos.y<3&&p.vel.y<=0,'standing on a steep face did not slide');
  assert(!playerContacts(p.pos.x,p.pos.z,p.pos.y).length);
  console.log('PASS steep ground: no hop climbing, cliff edges fall, steep faces slide, gentle descents stay grounded');
}

{
  // A house: solid walls without an explicit climbable flag, a pitched roof
  // that is ground over the walls and a 0.7 m eave overhang around them.
  const wallTop=5,w=6,d=5,rh=2.75,half=d/2+.7;
  const roofAt=z=>wallTop-.25+(rh+.25)*(1-Math.abs(z)/half);
  const house=()=>{
    clear();
    addBox({cx:0,cz:0,cy:wallTop/2,hy:wallTop/2,hx:w/2,hz:d/2,walk:false});
    addRoof({shape:'gable',gable:true,cx:0,cz:0,yaw:0,hx:w/2,hz:d/2,ox:w/2+.7,oz:half,base:wallTop-.25,rise:rh+.25,half,acrossX:false});
  };
  const clean=p=>!playerContacts(p.x,p.z,p.y).length&&!roofSlabHit(p.x,p.z,p.y);
  const climb=(p,move,frames=1500)=>{
    let pull=null;
    for(let k=0;k<frames&&p.traversal!==null||k===0;k++){
      tick(p,move);
      assert(clean(p.pos),'climb passed through the wall or the eave');
      assert(clean(p.renderPos),'climb presentation passed through the wall or the eave');
      if(p.traversal?.pull)pull??=p.traversal;
    }
    return pull;
  };
  house();
  let p=player(0,d/2+.41),move=input(0,1);move.jump=true;tick(p,move);
  assert.equal(p.traversal?.kind,'latch','building wall was not climbable');
  let pull=climb(p,move);
  assert(pull,'no pull-over at the eave');
  for(const h of pull.hands){
    assert(h.point.z>d/2+.6&&h.point.z<half,'palms are not at the eave edge');
    assert(Math.abs(h.point.y-roofAt(h.point.z))<1e-6,'palms are not on the eave surface');
  }
  assert(p.onGround&&Math.abs(p.pos.y-roofAt(p.pos.z))<1e-6,'did not stand on the roof after the pull-over');
  assert(p.stamina>0&&p.stamina<100,'house wall drained no stamina or all of it');
  for(let k=0;k<90;k++){tick(p,input(0,1));assert(p.onGround&&Math.abs(p.pos.y-roofAt(p.pos.z))<1e-6,'roof walk left the surface');}
  // Walking down onto the eave and off its visible edge.
  let fell=null;
  for(let k=0;k<200&&fell===null;k++){tick(p,input(0,-1));if(!p.onGround)fell=p.pos.z;}
  assert(fell>d/2+.55&&fell<half+.05,'left the roof away from the eave edge: '+fell);

  // Gable end: up the gable triangle and over the rake.
  house();
  p=player(w/2+.41,0);p.yaw=Math.PI/2;move=input(0,1);move.jump=true;tick(p,move);
  assert.equal(p.traversal?.kind,'latch');
  pull=climb(p,move);
  assert(pull&&p.onGround&&Math.abs(p.pos.y-roofAt(p.pos.z))<1e-6,'gable end did not finish on the roof');

  // Sideways along a face, stopping at its edge.
  clear();addBox({cx:0,cz:0,cy:4,hy:4,hx:2,hz:1,walk:false});
  p=player(0,1.41);move=input(0,1);move.jump=true;tick(p,move,120);tick(p,input(),40);
  const y0=p.pos.y,side=input(1,0);
  for(let k=0;k<400;k++){p.stamina=100;tick(p,side);assert(clean(p.pos));}
  assert(p.traversal&&Math.abs(p.pos.y-y0)<1e-6&&p.pos.x>1.4&&p.pos.x<2,'sideways climb did not hold height or stop at the edge');
  assert(p.traversal.hands.every(h=>Math.abs(h.point.z-1)<1e-8&&h.point.x<=2+1e-8),'sideways palms left the face');

  // Airborne press against a wall grabs it.
  clear();
  addBox({cx:0,cz:0,cy:5,hy:5,hx:3,hz:2.5,walk:false});
  const air=player(0,2.5+.45,1.2);air.vel.y=-2;air.onGround=false;
  const grab=input(0,1);grab.jump=true;tick(air,grab);
  assert.equal(air.traversal?.kind,'latch','airborne press against a wall did not grab');

  // Awning: free to walk under, grabbed from a jump and stood on.
  clear();
  addBox({cx:0,cz:-2,cy:4,hy:4,hx:4,hz:2,walk:false});
  addRoof({shape:'shed',cx:0,cz:1,yaw:0,ox:2.5,oz:1,z0:-1,z1:1,base:3.3,rise:-.7,thick:.08});
  p=player(0,3.5);tick(p,input(0,1),90);
  assert(p.onGround&&p.pos.y===0&&p.pos.z<.4,'walking under an awning was blocked');
  p=player(0,3);move=input(0,1);move.jump=true;tick(p,move);
  const reach=input(0,1);
  for(let k=0;k<36&&!p.traversal;k++)tick(p,reach);
  assert(p.traversal?.pull,'awning edge was not grabbed from the air with a single jump press');
  for(let k=0;k<200&&p.traversal;k++){tick(p,reach);assert(clean(p.pos));}
  assert(p.onGround&&Math.abs(p.pos.y-(3.3-.7*(p.pos.z-1+1)/2))<1e-6,'did not stand on the awning');

  // A balcony slab blocks the face below it; nothing passes through.
  clear();
  addBox({cx:0,cz:0,cy:4,hy:4,hx:3,hz:1,walk:false});
  addBox({cx:0,cz:1.7,cy:3.525,hy:.125,hx:1.5,hz:.7,walk:true});
  addBox({cx:0,cz:2.35,cy:4.1,hy:.45,hx:1.5,hz:.06,walk:false});
  p=player(0,1.41,0);move=input(0,1);move.jump=true;tick(p,move);
  for(let k=0;k<500;k++){p.stamina=100;tick(p,move);assert(clean(p.pos));}
  assert(p.traversal&&p.pos.y+PLAYER.body<=3.4+1e-6,'climbed through a balcony');
  console.log('PASS building climb: walls, eave and rake pull-over, roof/eave walking, sideways climb, airborne grab, awning ledge, balcony stop');
}

{
  // Cylinders: explicit opt-out; a tapering tower in stacked segments with a
  // gallery ring, and a boulder that is pulled up onto, never climbed.
  clear();
  addCyl({x:0,z:0,r:1,y0:0,y1:6,climbable:false});
  let p=player(0,1.41),move=input(0,1);move.jump=true;tick(p,move);
  assert.equal(p.traversal,null,'non-opted cylinder proxy was climbed');
  clear();
  for(let k=0;k<5;k++)addCyl({x:0,z:0,r:3.3-.16*k,y0:k*4,y1:4+k*4,climbable:true});
  addCyl({x:0,z:0,r:3.5,y0:20,y1:20.5,climbable:true});
  addCyl({x:0,z:0,r:1.8,y0:20.5,y1:23,climbable:false});
  p=player(0,3.3+.41);move=input(0,1);move.jump=true;tick(p,move);
  assert.equal(p.traversal?.kind,'latch');
  const faces=new Set();let pull=null;
  for(let k=0;k<4000&&p.traversal;k++){
    p.stamina=100;tick(p,move);
    assert(!playerContacts(p.pos.x,p.pos.z,p.pos.y).length,'tower climb penetrated a segment');
    const a=p.traversal;
    if(a?.kind==='climb'){
      faces.add(a.surface.box);
      for(const h of a.hands){const r=Math.hypot(h.point.x,h.point.z);assert([3.3,3.14,2.98,2.82,2.66].some(q=>Math.abs(q-r)<1e-6),'palm off the segment face');}
    }
    if(a?.pull)pull??=a;
  }
  assert(faces.size===5&&pull&&p.onGround&&Math.abs(p.pos.y-20.5)<1e-6,'tower did not hand off segments and pull onto the gallery');
  clear();
  addCyl({x:0,z:0,r:1.6,y0:-1,y1:1.1,climbable:true,mantleOnly:true,lipInset:.56});
  p=player(0,1.6+.41);move=input(0,1);move.jump=true;tick(p,move);
  assert.equal(p.traversal?.kind,'mantle');
  assert(p.traversal.hands.every(h=>Math.abs(Math.hypot(h.point.x,h.point.z)-1.04)<.01),'boulder palms not on its crown');
  tick(p,move,120);
  assert(p.onGround&&Math.abs(p.pos.y-1.1)<1e-6);
  clear();
  addCyl({x:0,z:0,r:3.2,y0:-1,y1:2.4,climbable:true,mantleOnly:true});
  p=player(0,3.2+.41);move=input(0,1);move.jump=true;tick(p,move);
  assert(p.traversal===null&&p.vel.y>0,'tall boulder was wall-climbed');
  console.log('PASS cylinders: opt-in, segment hand-off, gallery pull-over, boulder pull-up only');
}

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
  const roofs=[];
  const build=new Function('addBox','terraceAt','C','PAT','icosa','WALL','addRoof',
    section('var box2 =','var off2 =')+
    section('function buildScenicWings(','function buildKaelGardens(')+
    section('function buildKaelGardens(','function buildStairs(')+
    'return {buildScenicWings,buildKaelGardens}');
  const {buildKaelGardens,buildScenicWings}=build(
    collider=>added.push(collider),()=>({y:24}),palette,palette,()=>{},2.6,roof=>roofs.push(roof));
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
  assert.equal(roofs.filter(r=>r.shape==='cone').length,3,'A lookout cone cap is not standing surface');
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

{
 const Input=new Function(game.slice(game.indexOf('var LOOK_SENSITIVITY ='),game.indexOf('var _n ='))+';return Input;')();
 const Follow=new Function(game.slice(game.indexOf('var MovementCameraFollow ='),game.indexOf('var CameraRig ='))+';return MovementCameraFollow;')();
 const keyboard=(...codes)=>Object.assign(Object.create(Input.prototype),{keys:new Set(codes),stick:{x:0,y:0},keyboardSteering:true,jumpQueued:false});
 clear();
 const forward=player(),back=player(),left=player(),right=player();
 tick(forward,keyboard('KeyW'),60);tick(back,keyboard('KeyS','ShiftLeft'),60);
 tick(left,keyboard('KeyA'),30);tick(right,keyboard('KeyD'),30);
 assert(forward.pos.z<-2&&Math.abs(forward.pos.x)<1e-8&&forward.yaw===0);
 assert(back.pos.z>2&&Math.abs(back.pos.x)<1e-8&&back.yaw===0&&!back.running);
 assert(Math.hypot(left.pos.x,left.pos.z)<1e-8&&left.yaw>1.19);
 assert(Math.hypot(right.pos.x,right.pos.z)<1e-8&&right.yaw< -1.19);
 const arcL=player(),arcR=player(),arc120=player();
 tick(arcL,keyboard('KeyW','KeyA'),30);tick(arcR,keyboard('KeyW','KeyD'),30);
 tick(arc120,keyboard('KeyW','KeyA'),60,1/120);
 assert(arcL.pos.x<-.2&&arcL.pos.z<-.5&&arcR.pos.x>.2&&arcR.pos.z<-.5);
 assert(Math.abs(arcL.pos.x+arcR.pos.x)<1e-8&&arcL.pos.distanceTo(arc120.pos)<1e-8);
 assert(Math.abs(arcL.yaw-arc120.yaw)<1e-8);
 const before=arcL.yaw;tick(arcL,keyboard('KeyW'),60);assert.equal(arcL.yaw,before);
 const cancelled=player();tick(cancelled,keyboard('KeyW','KeyS','KeyA','KeyD'),60);
 assert.equal(cancelled.yaw,0);assert.equal(cancelled.pos.length(),0);
 const follow=new Follow(),reverse=keyboard('KeyS');
 for(let k=0;k<120;k++){follow.prepare(back,reverse,false,true);tick(back,reverse);follow.update(1/60,back);}
 assert.equal(back.yaw,0);assert.equal(back.moveBasisYaw,null);
 const touch=keyboard();touch.keyboardSteering=false;touch.stick.x=1;
 const mobile=player();tick(mobile,touch,60);assert(mobile.pos.x>2&&mobile.yaw===0);
 const third=(...codes)=>Object.assign(keyboard(...codes),{independentHeading:true});
 const f=new Follow(),actor=player(),turn=third('KeyA');
 const step=(p,i,follow=f,dt=1/60,manual=false)=>{
  follow.prepare(p,i,manual,true);tick(p,i,1,dt);follow.update(dt,p);
 };
 for(let k=0;k<20;k++)step(actor,turn);
 assert(actor.facingYaw>.79&&actor.yaw===0,'small actor rotation dragged camera');
 for(let k=0;k<40;k++){
  const old=actor.yaw;step(actor,turn);
  assert(actor.yaw-old>=-1e-9&&actor.yaw-old<=2.6/60+1e-9,'camera snapped or reversed');
 }
 assert(actor.facingYaw>2.39&&actor.yaw>.1&&actor.yaw<actor.facingYaw-.5,'large rotation did not ease independently');
 const heading=actor.facingYaw,still=third();
 for(let k=0;k<240;k++)step(actor,still);
 assert.equal(actor.facingYaw,heading);
 assert(Math.abs(actor.facingYaw-actor.yaw-30*Math.PI/180)<.015,'camera did not settle with offset');
 const reverseActor=player(),rf=new Follow(),reverseThird=third('KeyS');
 for(let k=0;k<120;k++)step(reverseActor,reverseThird,rf);
 assert(reverseActor.pos.z>4&&reverseActor.yaw===0,'camera reversed during backpedal');
 const manualActor=player(),mf=new Follow(),manualTurn=third('KeyD');
 for(let k=0;k<90;k++)step(manualActor,manualTurn,mf,1/60,true);
 assert(manualActor.yaw===0&&manualActor.facingYaw< -3.5,'manual look was overridden');
 step(manualActor,third(),mf);
 for(let k=0;k<30;k++)step(manualActor,manualTurn,mf);
 assert(manualActor.yaw!==0,'new turn did not restore assist');
 const orbit=player(),of=new Follow(),orbitTurn=third('KeyW','KeyA');
 for(let k=0;k<360;k++){
  const old=orbit.yaw;step(orbit,orbitTurn,of);
  assert(orbit.yaw>=old-1e-8,'continuous turn reversed camera at angle wrap');
 }
 assert(orbit.facingYaw-orbit.yaw<Math.PI,'camera fell more than half a turn behind');
 const free=player(),ff=new Follow(),forwardThird=third('KeyW');
 free.facingYaw=Math.PI/2;free.yaw=0;
 for(let k=0;k<60;k++)step(free,forwardThird,ff);
 assert(free.pos.x< -2&&Math.abs(free.pos.z)<1e-8&&free.yaw===0,'camera orbit changed actor movement');
 console.log('PASS: keyboard forward/backpedal, turn in place, combined steering, cancellation, fixed ticks, independent camera dead zone and easing, manual orbit, continuous rotation, touch vector retained');
}
