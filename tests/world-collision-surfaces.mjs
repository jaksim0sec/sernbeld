import {readFileSync} from 'node:fs';
import * as api from '../src/core/world-collision-legacy.js';

function runSurfaceTests(render,terrain,api){
 const start=render.indexOf("var CELL = 32;"),end=render.indexOf("function playerSafeSpawn(",start);
 const a=terrain.indexOf("function stairUV("),b=terrain.indexOf("function stairHeight(",a);
 if(start<0||end<0||a<0||b<0)throw Error("source boundary missing");
 const engine=Function(`const PLAYER={radius:.35,body:1.72,step:.48},HALF=20,CFG={cell:20},GRID_N=3,World={H:new Float64Array(9)},WALL=1,STAIR_W=2,STAIRS=[];
 const clamp2=(x,a,b)=>Math.max(a,Math.min(b,x)),sample=()=>0;
 ${terrain.slice(a,b)}
 ${render.slice(start,end)}
 return {addBox,addCyl,query,inside,local,playerContact,playerFloor,addRoof,roofInFoot,roofInOuter,roofSurfaceLocal,roofHeight,roofOverhangTop,stairUV,stairSurface,STAIRS,STAIR_MIN_V,STAIR_MAX_V};`)();
 const world=api.createLegacyStaticCollision(engine),policy={id:"surface",block:true,support:true,mantle:false,oneWay:false,nav:false,camera:true,water:false,climb:"none"};
 const water={id:"water",block:false,support:false,mantle:false,oneWay:false,nav:false,camera:false,water:true,climb:"none"};
 const tr={position:[0,0,0],yaw:0,scale:[1,1,1]},profile={radius:.35,height:1.72},f={regionId:"lab",purpose:"support"};
 let n=0;const check=(v,m)=>{if(!v)throw Error(m);n++},near=(a,b)=>Math.abs(a-b)<1e-8;
 function register(id,type,bounds,sample){
  return world.registerAnalytical({id,regionId:"lab",physics:"solid",transform:tr,shapes:[{id:"surface",type,center:[0,0,0],geometryRef:id,bounds,policy}]},{sample});
 }
 const roofs=[
  engine.addRoof({shape:"gable",cx:0,cz:0,yaw:.6,hx:2,hz:2,ox:3,oz:3,base:4,rise:2,half:3,acrossX:true}),
  engine.addRoof({shape:"shed",cx:10,cz:0,yaw:.3,ox:3,oz:2,base:5,rise:-1,z0:-2,z1:2}),
  engine.addRoof({shape:"cone",cx:-10,cz:0,yaw:.2,foot:"circle",footR:2,outerR:3,base:4,rise:3,half:3,seg:8,rot:.2})
 ];
 for(let i=0;i<roofs.length;i++){
  const roof=roofs[i];register("roof:"+i,"roof",{min:[roof.cx-5,0,roof.cz-5],max:[roof.cx+5,10,roof.cz+5]},(x,z)=>api.sampleLegacyRoof(roof,x,z,engine));
  for(const [lx,lz] of [[.7,.4],[2.4,.4],[-.7,-.4]]){
   const x=roof.cx+lx*roof.cos+lz*roof.sin,z=roof.cz-lx*roof.sin+lz*roof.cos;
   const s=api.sampleLegacyRoof(roof,x,z,engine);if(!s)continue;
   const old=s.overhang?engine.roofOverhangTop(x,z):engine.roofHeight(x,z);
   check(near(s.point[1],old),"roof height parity");
   const eps=1e-5,lo=api.sampleLegacyRoof(roof,x-eps,z,engine),hi=api.sampleLegacyRoof(roof,x+eps,z,engine);
   if(s.geometricNormal&&lo&&hi)check(Math.abs((hi.point[1]-lo.point[1])/(2*eps)+s.geometricNormal[0]/s.geometricNormal[1])<1e-6,"roof exact normal");
   const hit=world.sampleSupport({root:[x,s.point[1],z],profile,maxRise:.48},f);
   check(hit?.instanceId==="roof:"+i&&near(hit.point[1],s.point[1]),"registered roof support");
  }
 }
 check(api.sampleLegacyRoof(roofs[0],0,0,engine).geometricNormal===null,"ridge has no single normal");
 check(api.sampleLegacyRoof(roofs[2],-10,0,engine).geometricNormal===null,"cone apex has no single normal");
 const stair={a:[0,10],b:[0,16],n:[1,0],y0:0,y1:2.4};engine.STAIRS.push(stair);
 register("stairs","heightfield",{min:[0,-1,10],max:[6,4,16]},(x,z)=>api.sampleLegacyStair(stair,x,z,{stairUV:engine.stairUV,minV:engine.STAIR_MIN_V,maxV:engine.STAIR_MAX_V}));
 for(const z of [10,10.8,13,15.8,16]){
  const s=api.sampleLegacyStair(stair,1,z,{stairUV:engine.stairUV,minV:engine.STAIR_MIN_V,maxV:engine.STAIR_MAX_V});
  check(near(s.point[1],engine.stairSurface(1,z,0,true)),"exact stair parity");
  check(world.sampleSupport({root:[1,s.point[1],z],profile,maxRise:.48},f)?.featureId===s.featureId,"stair ID");
 }
 check(api.sampleLegacyStair(stair,-1,13,{stairUV:engine.stairUV,minV:engine.STAIR_MIN_V,maxV:engine.STAIR_MAX_V})===null,"stair outside");
 const lower=engine.addBox({cx:0,cy:1,cz:0,hx:2,hy:1,hz:2,yaw:0});world.registerStatic(lower,{instanceId:"base",regionId:"lab"});
 check(world.sampleSupport({root:[0,2,0],profile,maxRise:.48},f).instanceId==="base","roof above rise cannot hide valid lower support");
 const waterSpec={contains:(x,z)=>x>=20&&x<=30&&z>=-2&&z<=2,surfaceAt:()=>0,bottomAt:x=>-3*Math.min(1,(30-x)/5)};
 const addWater=(id,priority)=>world.registerAnalytical({id,regionId:"lab",physics:"volume",transform:tr,shapes:[{id:"volume",type:"water",center:[25,-1.5,0],half:[5,1.5,2],policy:water}]},{sample:root=>api.sampleLegacyWater(waterSpec,root),priority});
 addWater("pool",0);const high=addWater("priority",1);
 const wf={regionId:"lab",purpose:"water"},q={root:[24,-1.32,0],profile};
 let w=world.sampleWater(q,wf);check(w.instanceId==="priority"&&near(w.depth,3)&&near(w.feetImmersion,1.32),"water depth/priority");
 world.remove(high);check(world.sampleWater(q,wf).instanceId==="pool","water removal");
 check(world.sampleWater({...q,root:[29,-.2,0]},wf).depth<1.05,"shallow exit");
 check(world.sampleWater({...q,root:[30,0,0]},wf)===null,"dry boundary");
 check(world.sampleWater({...q,root:[19,-1,0]},wf)===null,"outside water");
 check(world.sampleSupport({...q,maxRise:.48},f)===null,"water not support");
 world.suspendRegion("lab");check(world.sampleWater(q,wf)===null&&world.sampleSupport({root:[0,2,0],profile,maxRise:.48},f)===null,"region filters analytical sources");
 return n;
}
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
console.log('PASS: '+runSurfaceTests(read('../src/render/world-render.part.js'),read('../src/world/terrain-runtime.part.js'),api)+' analytical surface assertions');
