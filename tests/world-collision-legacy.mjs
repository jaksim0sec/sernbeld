import {readFileSync} from 'node:fs';
import {createLegacyStaticCollision,sampleHeightfieldTriangle} from '../src/core/world-collision-legacy.js';

function runLegacyTests(source,createLegacyStaticCollision,sampleHeightfieldTriangle){
 const start=source.indexOf("var CELL = 32;"),end=source.indexOf("function playerSafeSpawn(",start);
 if(start<0||end<0)throw Error("legacy source boundary missing");
 const engine=Function(`const PLAYER={radius:.35,body:1.72,step:.48},HALF=2,CFG={cell:2},GRID_N=3,World={H:new Float64Array(9)};
 const clamp2=(x,a,b)=>Math.max(a,Math.min(b,x)),stairSurface=()=>null,sample=()=>-100;
 ${source.slice(start,end)}
 return {addBox,addCyl,query,inside,local,playerContact,playerFloor,playerContacts,heightfieldTriangle,World};`)();
 const world=createLegacyStaticCollision(engine);
 let checks=0;const check=(v,m)=>{if(!v)throw Error(m);checks++},near=(a,b)=>Math.abs(a-b)<1e-8,throws=(f,m)=>{let t=false;try{f()}catch{t=true}check(t,m)};
 const p={radius:.35,height:1.72},filter={regionId:"lab",purpose:"support"};
 const base=engine.addBox({cx:0,cy:1,cz:0,hx:2,hy:1,hz:2,yaw:.6,walk:false});
 const deck=engine.addBox({cx:0,cy:4.1,cz:0,hx:2,hy:.1,hz:2,yaw:.6,walk:true});
 const cyl=engine.addCyl({x:5,z:0,r:1,y0:0,y1:3,walk:false,climbable:true,mantleOnly:true});
 const b=world.registerStatic(base,{instanceId:"lab:base",regionId:"lab"});
 const d=world.registerStatic(deck,{instanceId:"lab:deck",regionId:"lab"});
 world.registerStatic(cyl,{instanceId:"lab:cyl",regionId:"lab"});
 throws(()=>world.registerStatic(base,{instanceId:"dupe",regionId:"lab"}),"duplicate legacy record");
 for(const [x,z,y] of [[0,0,2],[0,0,4.2],[1,1,2],[5,0,3],[5.95,0,3],[6.1,0,3]]){
  const old=engine.playerFloor(x,z,y+.48,p.radius);
  const hit=world.sampleSupport({root:[x,y,z],profile:p,maxRise:.48,maxDrop:Infinity},filter);
  check(hit!==null&&near(hit.point[1],old),"legacy floor parity "+[x,z,y]);
  check(near(hit.separation,y-hit.point[1])&&hit.geometricNormal[1]===1,"support normal/separation");
 }
 check(world.sampleSupport({root:[0,3,0],profile:p,maxRise:.48,maxDrop:.5},filter)===null,"drop window");
 check(world.sampleSupport({root:[0,2,0],profile:p,maxRise:.48}, {...filter,purpose:"nav"})===null,"nav excludes walk=false");
 check(world.sampleSupport({root:[6.1,3,0],profile:{...p,radius:0},maxRise:.48},filter)===null,"zero radius footprint");
 const point=world.sampleSupport({root:[6.1,3,0],profile:p,maxRise:.48},filter).point;
 check(near(point[0],6),"real point on cylinder top");
 for(const [x,y,z] of [[0,.1,0],[5,.2,0],[6.1,.3,0],[0,2,0],[0,2.5,0]]){
  const a=engine.playerContacts(x,z,y,[],p.radius),b=world.overlapBody({root:[x,y,z],profile:p},{...filter,purpose:"block"});
  check(a.length===b.length,"overlap count parity "+[x,y,z]);
  for(const h of b)check(a.some(c=>near(c.depth,-h.separation)&&near(c.nx,h.contactNormal[0])&&near(c.nz,h.contactNormal[2])),"contact parity");
 }
 const shorter=world.overlapBody({root:[0,3,0],profile:{...p,height:.5}},{...filter,purpose:"block"});
 const taller=world.overlapBody({root:[0,3,0],profile:p},{...filter,purpose:"block"});
 check(shorter.length===0&&taller.length===1,"body-specific height");
 const oldRev=world.get(b.id).revision;world.suspendRegion("lab");
 check(world.sampleSupport({root:[0,2,0],profile:p,maxRise:.48},filter)===null,"inactive filter");
 world.resumeRegion("lab");check(world.get(b.id).revision!==oldRev&&world.sampleSupport({root:[0,2,0],profile:p,maxRise:.48},filter)!==null,"resume fresh revision");
 world.remove(d);check(world.sampleSupport({root:[0,4.2,0],profile:p,maxRise:.48},filter).instanceId===b.id,"removed near top does not hide farther support");
 check(engine.playerFloor(0,0,4.7,p.radius)>4,"legacy grid unchanged before authority switch");
 check(world.capabilities().sweepBody&&!world.capabilities().productionBroadphase,"horizontal sweep available; registry broadphase remains reference-only");
 throws(()=>world.sweepBody({root:[0,2,0],profile:p,delta:[0,1,0]},{...filter,purpose:"block"}),"vertical sweep remains unsupported");
 const H=engine.World.H;
 H.set([0,2,4,4,6,8,8,10,12]);
 for(const [x,z] of [[-1.8,-1.6],[-.1,-.3],[-1,-1],[.1,.2],[1.8,1.8]]){
  const hit=sampleHeightfieldTriangle({heights:H,gridN:3,cell:2,half:2,x,z});
  check(near(hit.point[1],engine.heightfieldTriangle(x,z)),"terrain parity");
  check(hit.geometricNormal.every((v,i)=>near(v,[-1,1,-2][i]/Math.sqrt(6))),"coplanar seam");
 }
 H.set([0,0,0,0,4,0,0,0,0]);
 const lo=sampleHeightfieldTriangle({heights:H,gridN:3,cell:2,half:2,x:-1.8,z:-1.8}),hi=sampleHeightfieldTriangle({heights:H,gridN:3,cell:2,half:2,x:-.2,z:-.2});
 check(lo.featureId!==hi.featureId&&lo.geometricNormal[1]===1&&hi.geometricNormal[1]<1,"sharp triangle preserved");
 for(const [x,z] of [[-1,-1],[0,-1],[-1,0],[0,0]]){
  const s=sampleHeightfieldTriangle({heights:H,gridN:3,cell:2,half:2,x,z});
  check(near(s.point[1],engine.heightfieldTriangle(x,z)),"crease height parity");
  check(s.geometricNormal===null&&s.featureId.startsWith("seam:"),"crease must expose ambiguous normal "+[x,z]);
 }
 const left=sampleHeightfieldTriangle({heights:H,gridN:3,cell:2,half:2,x:-1-1e-5,z:-1});
 const right=sampleHeightfieldTriangle({heights:H,gridN:3,cell:2,half:2,x:-1+1e-5,z:-1});
 check(left.geometricNormal!==null&&right.geometricNormal!==null&&left.featureId!==right.featureId,"near crease retains actual face");
 H.set([0,2,4,4,6,8,8,10,12]);
 for(const [x,z] of [[0,-1],[-1,0],[0,0]]){
  const s=sampleHeightfieldTriangle({heights:H,gridN:3,cell:2,half:2,x,z});
  check(s.geometricNormal?.every((v,i)=>near(v,[-1,1,-2][i]/Math.sqrt(6))),"coplanar grid seam retains exact normal");
 }
 check(sampleHeightfieldTriangle({heights:H,gridN:3,cell:2,half:2,x:2,z:0})===null,"outside fallback explicit");
 return checks;
}
const source=readFileSync(new URL('../src/render/world-render.part.js',import.meta.url),'utf8');
console.log('PASS: '+runLegacyTests(source,createLegacyStaticCollision,sampleHeightfieldTriangle)+' legacy collision assertions');
