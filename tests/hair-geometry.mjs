import * as kit from '../src/entities/character/hair/geometry.js';
import {flowParts as parts} from '../src/entities/character/hair/specimen.js';
function synthetic(kit,scale=[.085,.12,.095]){
 const p=[],ix=[],n=48,m=24;
 // Non-duplicated rings, poles. Ray tests do not depend on triangle winding.
 p.push(0,scale[1],0);for(let i=1;i<m;i++)for(let j=0;j<n;j++){const v=kit.direction(i*180/m,j*360/n);p.push(...v.map((x,k)=>x*scale[k]));}
 const bottom=p.length/3;p.push(0,-scale[1],0);
 for(let j=0;j<n;j++){ix.push(0,1+j,1+(j+1)%n);for(let i=1;i<m-1;i++){const a=1+(i-1)*n+j,b=1+i*n+j,c=1+(i-1)*n+(j+1)%n,d=1+i*n+(j+1)%n;ix.push(a,b,c,c,b,d);}ix.push(bottom,1+(m-2)*n+(j+1)%n,1+(m-2)*n+j);}
 return kit.surface(Float32Array.from(p),Uint32Array.from(ix),[0,0,0]);
}
function checkGeometry(kit,g,closed=false){const assert=(ok,msg)=>{if(!ok)throw Error(msg);};assert(g.positions.length===g.normals.length&&g.uv.length===g.positions.length/3*2,'attribute sizes');assert([...g.positions,...g.normals,...g.uv].every(Number.isFinite),'finite');assert(g.indices.every(i=>i<g.positions.length/3),'indices');for(let i=0;i<g.normals.length;i+=3)assert(Math.abs(Math.hypot(...g.normals.slice(i,i+3))-1)<1e-5,'normal length');if(closed)assert(kit.signedVolume(g)>0,'inward loft winding');}
function verifyTrace(g){
 const e=g.edgeTrace;if(!e||e.length!==33)throw Error('missing edge trace');
 const span=e[32].left-e[0].left,early=Math.abs(e[16].left-e[0].left)/span,late=(e[32].left-e[24].left)/span;
 if(span<=0||early>.05||late<.65)throw Error('edge curvature not preserved');
 return {early,late,widthMm:Math.max(...e.map(q=>q.right-q.left))*1000};
}
function verifyDetails(kit,fit,parts,checkGeometry){
 const cap=kit.frontFoundation(fit),gs=kit.makePart(fit,parts[0]),again=kit.makePart(fit,parts[0]);checkGeometry(kit,cap);
 if(!kit.compatible(parts,'male')||!kit.compatible(parts,'female')||kit.compatible([parts[0],parts[0]],'male'))throw Error('part compatibility');
 let carved=0;
 const edge=gs.find(g=>g.edgeTrace);verifyTrace(edge);
 gs.forEach((g,i)=>{checkGeometry(kit,g,true);if(!g.positions.every((x,k)=>x===again[i].positions[k]))throw Error('nondeterminism');if(!g.detail)return;
  carved++;
  const edges=new Map();for(let n=0;n<g.indices.length;n+=3){const [a,b,c]=g.indices.slice(n,n+3);for(const [x,y] of [[a,b],[b,c],[c,a]]){const key=Math.min(x,y)+':'+Math.max(x,y),e=edges.get(key)??[0,0];e[0]++;e[1]+=x<y?1:-1;edges.set(key,e);}}
  if([...edges.values()].some(e=>e[0]!==2||e[1]!==0))throw Error('cut mesh not oriented closed manifold '+i);
 });
 const all=[cap,...gs],metrics=all.map(g=>kit.penetration(fit,g));if(metrics.some(m=>m.miss||m.maxMetres>.001))throw Error('penetration '+JSON.stringify(metrics));
 return {triangles:all.reduce((sum,g)=>sum+g.indices.length/3,0),carved,penetrationMm:Math.max(...metrics.map(m=>m.maxMetres))*1000};
}
function sideCoverage(kit,fit,parts){
 const p=[],ix=[];for(const g of [kit.frontFoundation(fit),...parts.flatMap(q=>[...kit.regionFoundations(fit,q),...kit.makePart(fit,q)])]){const off=p.length/3;for(const x of g.positions)p.push(x);for(const i of g.indices)ix.push(i+off);}
 const shell=kit.surface(Float32Array.from(p),Uint32Array.from(ix),fit.center);
 const hit=(theta,phi)=>{const d=kit.direction(theta,phi),a=shell.radius(d),b=fit.radius(d);return a!==null&&b!==null&&a>b+.001;};
 const result=[-1,1].map(sign=>({side:sign,temple:[100,105,110].map(theta=>[65,70,75,80].filter(phi=>hit(theta,sign*phi)).length),upper:[85,90,95].map(theta=>[80,85,90,95,100,105,110].filter(phi=>hit(theta,sign*phi)).length)}));
 return result;
}
function verifySide(kit,fit,parts){const q=sideCoverage(kit,fit,parts);if(q.some(x=>x.temple[0]<2||x.temple[1]<1||x.upper[1]<4))throw Error('side coverage regression '+JSON.stringify(q));return q;}
function verifyFull(kit,fit,parts,checkGeometry){
 const all=[kit.frontFoundation(fit),...kit.makePart(fit,parts[0])],bySlot={front:all.reduce((n,g)=>n+g.indices.length/3,0)};
 if(!kit.compatible(parts,'male')||!kit.compatible(parts,'female'))throw Error('slot mismatch');
 for(const part of parts.slice(1)){const under=kit.regionFoundations(fit,part),locks=kit.makePart(fit,part),again=kit.makePart(fit,part);
  under.forEach(g=>checkGeometry(kit,g));locks.forEach((g,i)=>{checkGeometry(kit,g,true);if(!g.positions.every((x,k)=>x===again[i].positions[k]))throw Error('nondeterminism');});
  const gs=[...under,...locks];all.push(...gs);bySlot[part.slot]=gs.reduce((n,g)=>n+g.indices.length/3,0);}
 const metrics=all.map(g=>kit.penetration(fit,g));if(metrics.some(m=>m.miss||m.maxMetres>.001))throw Error('full intrusion '+JSON.stringify(metrics.filter(m=>m.miss||m.maxMetres>.001)));
 const p=[],ix=[];for(const g of all){const off=p.length/3;for(const x of g.positions)p.push(x);for(const i of g.indices)ix.push(i+off);}
 const shell=kit.surface(Float32Array.from(p),Uint32Array.from(ix),fit.center);
 function cover(theta,phis){let hit=0;for(const phi of phis){const d=kit.direction(theta,phi),a=shell.radius(d),b=fit.radius(d);if(a!==null&&b!==null&&a>b+.0007)hit++;}return {theta,hit,total:phis.length};}
 const circle=Array.from({length:72},(_,i)=>i*5),rear=Array.from({length:21},(_,i)=>130+i*5);
 const coverage=[...([20,45,70,75].map(t=>cover(t,circle))),...([95,105,110].map(t=>cover(t,rear)))];
 if(coverage.some(x=>x.hit!==x.total))throw Error('coverage '+JSON.stringify(coverage));
 return {side:verifySide(kit,fit,parts),bySlot,triangles:all.reduce((n,g)=>n+g.indices.length/3,0),penetrationMm:Math.max(...metrics.map(x=>x.maxMetres))*1000,coverage};
}
if(parts.map(p=>p.slot).join(',')!=='front,middle,back')throw Error('slot scope');
for(const scale of [[.085,.12,.095],[.075,.108,.09],[.094,.13,.105]])console.log('PASS Flow local detail',JSON.stringify({front:verifyDetails(kit,synthetic(kit,scale),parts,checkGeometry),full:verifyFull(kit,synthetic(kit,scale),parts,checkGeometry)}));
if(process.argv.includes('--synthetic'))process.exit(0);
const {readFileSync}=await import('node:fs');const {gunzipSync}=await import('node:zlib');
const {createStudioGeometry,controls}=await import('../src/entities/character/studio-geometry.js');const {normalizeStudioCharacter}=await import('../src/entities/character/appearance.js');
const factory=createStudioGeometry(JSON.parse(gunzipSync(readFileSync('assets/models/characters/studio-v1.json.gz'))));
let failed=false;
for(const body of ['male','female'])for(const variant of ['default','wide','narrow','high','low','deep','shallow']){
 try{const profile=normalizeStudioCharacter({body,...(variant==='default'?{}:{values:controls.map(c=>({wide:{headWidth:1,temple:1},narrow:{headWidth:-1,temple:-1},high:{headHeight:1,foreheadHeight:1},low:{headHeight:-1,foreheadHeight:-1},deep:{skull:1,forehead:1},shallow:{skull:-1,forehead:-1}}[variant][c.key]??0))})});const fit=kit.studioHead(factory.build(profile).body);console.log('PASS',body,variant,JSON.stringify({front:verifyDetails(kit,fit,parts,checkGeometry),full:verifyFull(kit,fit,parts,checkGeometry)}));}catch(e){failed=true;console.error('FAIL',body,variant,e.message);}
}if(failed)process.exitCode=1;
