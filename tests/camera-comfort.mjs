import {smoothCameraHeight,solveThirdBoom,solveTraversalCamera,sampleBodySupport,bodySupportCorrection,smoothBodyHeight} from '../src/entities/character/studio-integration.js';
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

{
 const base={feet:{x:0,y:0,z:0},bodyFeet:{x:0,y:-.3,z:0},aimY:-.58,yaw:0,pitch:0,
  near:.2,fov:65,aspect:16/9,height:1.76,previous:3.1,reset:true,dt:1/60,surface:{nx:0,nz:-1}};
 const wall=(o,d,limit)=>d.z>0?Math.max(0,Math.min(limit,(.35-o.z)/d.z)):limit;
 const result=solveTraversalCamera({...base,worldRay:wall});
 if(result.fallback||result.position.z>=0||result.boom<1.65)throw Error('Traversal hid the avatar instead of selecting the open side');
 const corridor=(o,d,limit)=>Math.abs(d.z)<1e-9?limit:Math.max(0,Math.min(limit,((d.z>0?.55:-.55)-o.z)/d.z));
 const side=solveTraversalCamera({...base,worldRay:corridor});
 if(side.fallback||Math.abs(side.position.x)<1.6)throw Error('Traversal failed to find the lateral corridor');
 const free=(_,__,limit)=>limit;
 const recovered=solveTraversalCamera({...base,reset:false,previousView:result,worldRay:free});
 if(recovered.fallback||Math.abs(recovered.yaw-result.yaw)>.6)throw Error('Traversal camera snapped when clearance returned');
 console.log('PASS traversal camera: blocked orbit, lateral corridor, gradual recovery');
}

{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../src/gameplay/gameplay.part.js',import.meta.url),'utf8');
 const followSource=source.slice(source.indexOf('var MovementCameraFollow ='),source.indexOf('var CameraRig ='));
 const MovementCameraFollow=new Function(followSource+';return MovementCameraFollow;')();
 (function(MovementCameraFollow){
 const check=(ok,msg)=>{if(!ok)throw Error(msg);};
 const angle=(x)=>Math.atan2(Math.sin(x),Math.cos(x));
 function fixture(){
  const p={mode:"walk",yaw:0,teleportId:1,onGround:true,vel:{x:0,z:0}};
  const follow=new MovementCameraFollow();
  let x=0,y=1,looking=false;
  const input={move:()=>({x,y,mag:Math.hypot(x,y)}),isLooking:()=>looking};
  const step=(dt=1/60,manual=false,enabled=true)=>{
   follow.prepare(p,input,manual,enabled);
   const basis=p.moveBasisYaw??p.yaw;
   p.vel.x=-Math.sin(basis)*y+Math.cos(basis)*x;
   p.vel.z=-Math.cos(basis)*y-Math.sin(basis)*x;
   if(enabled)follow.update(dt,p);
  };
  return {p,follow,step,move:(a,b)=>{x=a;y=b;},look:v=>looking=v};
 }
 for(const fps of [30,60,120]){
  const f=fixture();f.step(1/fps);f.move(0,-1);
  let max=0;
  for(let i=0;i<fps*2;i++){
   const before=f.p.yaw;f.step(1/fps);max=Math.max(max,Math.abs(f.p.yaw-before));
   check(Math.abs(f.p.vel.x)<1e-8&&f.p.vel.z>.999,"Auto camera bent the held movement vector");
  }
  check(Math.abs(angle(f.p.yaw-Math.PI))<.04,"180 degree reversal did not recenter at "+fps+" fps");
  check(max<=3.2/fps+1e-8,"Camera snapped during reversal");
  f.move(0,0);f.step();check(f.p.moveBasisYaw===null,"Movement basis not released at idle");
  f.move(0,1);f.step();check(f.p.vel.z>.99,"New forward input does not follow recentered camera");
 }
 const manual=fixture();manual.move(0,-1);manual.look(true);
 for(let i=0;i<90;i++)manual.step();
 check(manual.p.yaw===0,"Automatic rotation fought the held look gesture");
 manual.look(false);
 for(let i=0;i<90;i++)manual.step();
 check(manual.p.yaw===0,"Automatic rotation undid deliberate look in same segment");
 manual.move(0,1);manual.step();manual.move(0,-1);
 for(let i=0;i<120;i++)manual.step();
 check(Math.abs(angle(manual.p.yaw-Math.PI))<.04,"New direction failed to release manual suppression");
 const side=fixture();side.move(1,0);
 for(let i=0;i<90;i++)side.step();
 check(side.p.yaw===0,"Ordinary strafe unexpectedly rotated camera");
 const disabled=fixture();disabled.move(0,-1);
 for(let i=0;i<90;i++)disabled.step(1/60,false,false);
 check(disabled.p.yaw===0&&disabled.p.moveBasisYaw===null,"First person or disabled mode modified camera");
 const cut=fixture();cut.move(0,-1);for(let i=0;i<20;i++)cut.step();
 cut.p.traversal={};cut.step();check(cut.p.moveBasisYaw===null,"Traversal retained walking basis");
 console.log('PASS movement camera: reversal 30/60/120fps, straight movement, manual drag, direction change, strafe, disabled and traversal');
 })(MovementCameraFollow);
}

{
 // Root height and leg-support correction must share one filter. Use the
 // authored stair profiles, not a synthetic animation or camera trajectory.
 const {readFileSync}=await import('node:fs');
 const terrain=readFileSync(new URL('../src/world/terrain-runtime.part.js',import.meta.url),'utf8');
 const exact=new Function(terrain.slice(terrain.indexOf('var WALL ='),terrain.indexOf('var P ='))+
  terrain.slice(terrain.indexOf('function stairUV('),terrain.indexOf('function stairHeight('))+
  'return {STAIRS,stairSurface,STAIR_MIN_V,STAIR_MAX_V}')();
 const check=(ok,msg)=>{if(!ok)throw Error(msg)};
 let cases=0,walkMax=0;
 for(const s of exact.STAIRS){
  const len=Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1]),dx=(s.b[0]-s.a[0])/len,dz=(s.b[1]-s.a[1])/len;
  if(Math.abs(s.y1-s.y0)<.01)continue;
  const v=(exact.STAIR_MIN_V+exact.STAIR_MAX_V)/2;
  const coord=u=>({x:s.a[0]+dx*u+s.n[0]*v,z:s.a[1]+dz*u+s.n[1]*v});
  const ground=(x,z,y)=>{const h=exact.stairSurface(x,z,0,true);return h!==null&&h<=y+.482?h:null};
  for(const fps of [20,30,60,120])for(const speed of [2.6,7.5])for(const dir of [-1,1]){
   const dt=1/fps,initial=dir>0?.5:len-.5,limit=dir>0?len-.5:.5;
   let prev=null;
   for(let u=initial;dir*(limit-u)>0;u+=dir*speed*dt){
    const p=coord(u),raw=exact.stairSurface(p.x,p.z,0,true);p.y=raw;
    const support=sampleBodySupport(p,raw,dir*dx*speed,dir*dz*speed,ground);
    const a=coord(u+.22*dir),b=coord(u-.22*dir),h1=ground(a.x,a.z,raw)??raw,h2=ground(b.x,b.z,raw)??raw;
    const correction=bodySupportCorrection([h1-support.y-.04,h2-support.y],support.stepped);
    const y=smoothBodyHeight(prev,support.y+correction,dt,true,speed);
    check(Math.abs(y-raw)<.48,'body drifted beyond low-step range');
    if(prev!==null){
     check(Math.abs(y-prev)<=Math.max(2.4,speed*.8+.6)*dt+1e-8,'root height snapped');
     if(fps===60&&speed===2.6)walkMax=Math.max(walkMax,Math.abs(y-prev));
    }
    prev=y;
   }
   cases++;
  }
 }
 for(const fps of [20,30,60,120]){
  let y=0;
  for(let i=0;i<fps;i++)y=smoothBodyHeight(y,.3,1/fps,true,2.6);
  check(Math.abs(y-.3)<.001,'root failed to settle');
 }
 check(smoothBodyHeight(null,80,.05,true)===80,'teleport smeared');
 check(smoothBodyHeight(1,0,.05,false)===0,'airborne root lag');
 check(bodySupportCorrection([.3,0],true)<=.06,'one high foot raised the whole torso');
 const p={x:0,y:0,z:0};
 check(sampleBodySupport(p,0,2.6,0,(x)=>x>0?2:0).y===0,'wall contaminated body support');
 check(sampleBodySupport(p,0,2.6,0,(x)=>x>0?-2:0).y===0,'cliff contaminated body support');
 check(sampleBodySupport(p,0,0,0,()=>.3).y===0,'stationary support anticipated a step');
 check(walkMax<=.045,'60 FPS stair walk exceeded expected root rise');
 console.log('PASS body support:',cases,'authored stair profile cases; 60fps walking max',walkMax,'m/frame');
}
