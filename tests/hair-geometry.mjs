import * as kit from '../src/entities/character/hair/geometry.js';
import {specimenParts as parts} from '../src/entities/character/hair/specimen.js';
function synthetic(kit,scale=[.085,.12,.095]){
 const p=[],ix=[],n=48,m=24;
 // Non-duplicated rings, poles. Ray tests do not depend on triangle winding.
 p.push(0,scale[1],0);for(let i=1;i<m;i++)for(let j=0;j<n;j++){const v=kit.direction(i*180/m,j*360/n);p.push(...v.map((x,k)=>x*scale[k]));}
 const bottom=p.length/3;p.push(0,-scale[1],0);
 for(let j=0;j<n;j++){ix.push(0,1+j,1+(j+1)%n);for(let i=1;i<m-1;i++){const a=1+(i-1)*n+j,b=1+i*n+j,c=1+(i-1)*n+(j+1)%n,d=1+i*n+(j+1)%n;ix.push(a,b,c,c,b,d);}ix.push(bottom,1+(m-2)*n+(j+1)%n,1+(m-2)*n+j);}
 return kit.surface(Float32Array.from(p),Uint32Array.from(ix),[0,0,0]);
}
function checkGeometry(kit,g,closed=false){const assert=(ok,msg)=>{if(!ok)throw Error(msg);};assert(g.positions.length===g.normals.length&&g.uv.length===g.positions.length/3*2,'attribute sizes');assert([...g.positions,...g.normals,...g.uv].every(Number.isFinite),'finite');assert(g.indices.every(i=>i<g.positions.length/3),'indices');for(let i=0;i<g.normals.length;i+=3)assert(Math.abs(Math.hypot(...g.normals.slice(i,i+3))-1)<1e-5,'normal length');if(closed)assert(kit.signedVolume(g)>0,'inward loft winding');}
function verifySynthetic(kit,parts,synthetic,checkGeometry){
 const assert=(ok,msg)=>{if(!ok)throw Error(msg);};const results=[];
 for(const scale of [[.085,.12,.095],[.075,.108,.09],[.094,.13,.105]]){
  const fit=synthetic(kit,scale),cap=kit.frontFoundation(fit);checkGeometry(kit,cap);assert(kit.compatible(parts,'male')&&kit.compatible(parts,'female'),'compatible');assert(!kit.compatible([parts[0],parts[0]],'male'),'duplicate slot');assert(!kit.compatible([parts[0],{...parts[0],id:'hair-t1-test-middle',slot:'middle',join:'other'}],'female'),'join mismatch');
  const geos=parts.flatMap(p=>kit.makePart(fit,p));const regen=parts.flatMap(p=>kit.makePart(fit,p));
  for(let i=0;i<geos.length;i++){const g=geos[i];checkGeometry(kit,g,true);assert(g.positions.every((v,j)=>v===regen[i].positions[j]),'determinism');const width=(ring,sides=10)=>{const a=(ring*(sides+1))*3,b=(ring*(sides+1)+sides/2)*3;return Math.hypot(...[0,1,2].map(k=>g.positions[a+k]-g.positions[b+k]));};assert(width(22,8)<Math.max(width(8,8),width(12,8))*.25,'taper');}
  const metrics=[cap,...geos].map(g=>kit.penetration(fit,g));assert(metrics.every(m=>m.miss===0&&m.maxMetres<=.001),'synthetic penetration '+JSON.stringify(metrics));results.push({scale,triangles:[cap,...geos].reduce((s,g)=>s+g.indices.length/3,0),maxMm:Math.max(...metrics.map(m=>m.maxMetres))*1000,rootMask:geos.reduce((s,g)=>s+g.rootMask.reduce((x,y)=>x+y,0),0)});
 }return results;
}
if(parts.length!==1||parts[0].slot!=='front')throw Error('T1 front-only scope');
console.log('PASS synthetic geometry',JSON.stringify(verifySynthetic(kit,parts,synthetic,checkGeometry)));
if(process.argv.includes('--synthetic'))process.exit(0);
const {readFileSync}=await import('node:fs');const {gunzipSync}=await import('node:zlib');
const {createStudioGeometry,controls}=await import('../src/entities/character/studio-geometry.js');const {normalizeStudioCharacter}=await import('../src/entities/character/appearance.js');
const factory=createStudioGeometry(JSON.parse(gunzipSync(readFileSync('assets/models/characters/studio-v1.json.gz'))));
let failed=false;
for(const body of ['male','female'])for(const variant of ['default','wide','narrow','high','low','deep','shallow']){
 try{const profile=normalizeStudioCharacter({body,...(variant==='default'?{}:{values:controls.map(c=>({wide:{headWidth:1,temple:1},narrow:{headWidth:-1,temple:-1},high:{headHeight:1,foreheadHeight:1},low:{headHeight:-1,foreheadHeight:-1},deep:{skull:1,forehead:1},shallow:{skull:-1,forehead:-1}}[variant][c.key]??0))})});const fit=kit.studioHead(factory.build(profile).body);const geometries=[kit.frontFoundation(fit),...parts.flatMap(p=>kit.makePart(fit,p))];geometries.forEach((g,i)=>checkGeometry(kit,g,i>0));const metrics=geometries.map(g=>kit.penetration(fit,g));const pass=metrics.every(m=>!m.miss&&m.maxMetres<=.001);failed||=!pass;console.log(pass?'PASS':'FAIL',body,variant,JSON.stringify(metrics));}catch(e){failed=true;console.error('FAIL',body,variant,e.message);}
}if(failed)process.exitCode=1;
