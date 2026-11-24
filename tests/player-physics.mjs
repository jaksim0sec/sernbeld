import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const game=read('src/gameplay/gameplay.part.js'),render=read('src/render/world-render.part.js'),region=read('src/world/region.part.js');
const part=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i);return s.slice(i,j);};
const T=new Function(read('src/vendor/three-gltf.part.js')+';return three_module_exports;')();
let terrain=()=>0,stairs=()=>null,water=()=>-100;
const env=new Function('Vector3','Vector2','sample','stairSurface','waterLevel','normalAt','World','HALF','GRID_N','CFG','clamp2',
 part(region,'var PLAYER =','var ring =')+part(render,'var CELL =','function occupiedAt')+part(game,'var _n =','var CameraRig =')+'return {Player,PLAYER,addBox,addCyl,playerFloor,playerContacts,playerTerrain,grid,all};'
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
let lastZ=0;for(let k=0;k<120;k++){tick(p,diagonal);assert(p.pos.z<=lastZ+1e-7,'zigzag at wall');lastZ=p.pos.z;assert(Math.hypot(p.vel.x,p.vel.z)<=PLAYER.run+1e-6,'collision injected speed');}
assert(p.pos.x<.51&&p.pos.z<-4,'wall sliding failed');assert(!playerContacts(p.pos.x,p.pos.z,p.pos.y).length);
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
