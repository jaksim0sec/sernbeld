import {smoothCameraHeight,solveThirdBoom} from '../src/entities/character/studio-integration.js';
function regression(smoothCameraHeight,solveThirdBoom){
 const check=(ok,msg)=>{if(!ok)throw Error(msg)};
 let y=0,max=0,raw=0;
 for(let i=0;i<120;i++){if(i%12===0)raw+=.18;const n=smoothCameraHeight(y,raw,1/60,true);max=Math.max(max,Math.abs(n-y));y=n;}
 check(max<.07,"stair camera still jumps: "+max);
 for(let i=0;i<120;i++)y=smoothCameraHeight(y,raw,1/60,true);
 check(Math.abs(y-raw)<.001,"camera never settles");
 check(smoothCameraHeight(null,50,1/60,true)===50,"teleport smearing");
 for(const fps of [30,60,120]){let a=0;for(let i=0;i<fps;i++)a=smoothCameraHeight(a,.4,1/fps,true);check(Math.abs(a-(.4-.4*Math.exp(-8)))<1e-8,"frame rate dependence");}
 const base={feet:{x:0,y:0,z:0},aimY:0,yaw:0,pitch:0,near:.2,fov:65,aspect:16/9,height:1.76,previous:3.1,reset:false,dt:1/60};
 const wall=z=>(o,d,limit)=>d.z>0?Math.max(0,Math.min(limit,(z-o.z)/d.z)):limit;
 const free=(_,__,limit)=>limit;
 let q=solveThirdBoom({...base,worldRay:free});check(!q.fallback&&Math.abs(q.boom-3.1)<1e-8,"open camera changed");
 q=solveThirdBoom({...base,worldRay:wall(1.6)});check(!q.fallback&&q.boom<1.6&&q.boom>=.85,"wall compression invalid");
 q=solveThirdBoom({...base,worldRay:wall(.35)});check(q.fallback&&q.boom===0,"camera entered body");
 q=solveThirdBoom({...base,previous:0,worldRay:free});check(!q.fallback&&q.boom>=.85&&q.boom<2,"recovery snaps or enters body");
 for(const pitch of [-1.5,-1,-.5,0,.5,1,1.5])for(const aspect of [.6,1.8,2.5]){
  q=solveThirdBoom({...base,pitch,aspect,previous:.1,worldRay:free});
  check(!q.fallback&&Number.isFinite(q.position.y),"steep pitch clearance failed");
  const p=q.position;check(p.y<-.18||p.y>1.98||Math.hypot(p.x,p.z)>=.5,"steep pitch enters body");
 }
 return {maxStairFrameDelta:max,rawStep:.18,checks:"stair, settle, teleport, 30/60/120fps, open boom, wall, fallback, recovery, 21 pitch/aspect cases"};
}
console.log('PASS camera comfort:',JSON.stringify(regression(smoothCameraHeight,solveThirdBoom)));
