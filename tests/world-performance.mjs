import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/gameplay/gameplay.part.js',import.meta.url),'utf8');
const part=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const NavGrid=new Function('groundAt','waterLevel','occupiedAt',part('var NavGrid = class','var NAMED =')+'return NavGrid;')(()=>0,()=>0,()=>false);
const nav=new NavGrid(0,0,20,20,2);
const a=nav.path(1,1,17,17), b=nav.path(1.2,1.2,17.3,17.3);
assert(a && b);
assert.equal(nav.pathCache.size,1);
assert.deepEqual(b.at(-1),[17.3,17.3]);
a[0][0]=999;
assert.notEqual(nav.path(1,1,17,17)[0][0],999);
nav.invalidatePaths();assert.equal(nav.pathCache.size,0);
const Geo=new Function(part('var Geo = class','function townMaterial')+'return Geo;')();
Geo.prototype.mesh=function(){return this;};
const city=new Geo();
city.tri([0,0,0],[2,0,0],[0,0,2],[1,0,0],1);
city.tri([100,0,0],[102,0,0],[100,0,2],[0,1,0],2);
const chunks=city.meshChunks(null);
assert.equal(chunks.length,2);
for(const k of ['p','n','c','t'])assert.deepEqual(chunks.flatMap(v=>v[k]),city[k]);
const quality=new Function('IS_MOBILE','CFG',part('var GRAPHICS =','var WIND_HEAD =')+'return {GRAPHICS,graphicsKey};')(true,{dprMax:1.5});
assert.equal(quality.graphicsKey(null),'medium');
assert.equal(quality.graphicsKey('low'),'low');
for(const k of ['dpr','terrainSplit','trees','grass','rocks','npcRange','npcDetail'])assert(quality.GRAPHICS.low[k]<quality.GRAPHICS.high[k]);
for(const preset of [quality.GRAPHICS.medium,quality.GRAPHICS.low]){
 assert.equal(preset.shadowMs,0,'Character shadows must not hold an older pose');
 assert(preset.shadowScale<1,'Reduce shadow map size to offset the higher update rate');
}
const start=source.indexOf('function residentLOD('),end=source.indexOf('var Townsfolk',start);
const residentLOD=new Function('LOD0','LOD1',source.slice(start,end)+'return residentLOD;')(14,38);
for(const preset of Object.values(quality.GRAPHICS)){
 const detail=preset.npcDetail, near=14*detail, far=38*detail;
 assert.equal(residentLOD(near+.5,detail,0),0);
 assert.equal(residentLOD(near-.5,detail,1),1);
 assert.equal(residentLOD(near+1.1,detail,0),1);
 assert.equal(residentLOD(far-.5,detail,2),2);
 assert.equal(residentLOD(far-1.1,detail,2),1);
}
const {Townsfolk}=new Function('SHADOW','residentLOD',part('var Townsfolk = class','  // nearest person in front of the player within reach')+'};return {Townsfolk};')(12,residentLOD);
for(const preset of Object.values(quality.GRAPHICS)){
 const samples=[];
 const entry=[0,'plaza','idle'];
 const resident={def:{id:'performance-resident'},talkT:0,x:10,y:0,z:0,entry,poseOffset:0,ch:{
  group:{position:{set(){}},rotation:{}},setLOD(){},setShadow(){},animate(dt,t){samples.push(t);}
 }};
 const folk={entry:()=>entry,queue:[],list:[resident],quality:preset};
 for(let i=1;i<=60;i++){
  Townsfolk.prototype.update.call(folk,1/60,i/60,12,{pos:{x:0,z:0}},{x:0,y:0,z:0});
 }
 assert.equal(samples.length,60,'A nearby NPC pose updates on every rendered frame');
}
console.log('PASS: graphics presets, spatial geometry preservation, route cache and endpoint isolation');
