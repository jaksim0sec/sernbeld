// Render numeric vertex probes through the real Three renderer and the
// production materials. This is not a visual screenshot comparison.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
const port=8793,home='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
let browser;
try{
 for(let i=0;i<80;i++){try{if((await fetch(home)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:780,height:360},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')console.log('RENDER ERROR '+m.text().slice(0,1200));});
 await page.goto(home,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__dev,{},{timeout:180000});
 const result=await page.evaluate(async()=>{
  const d=window.__dev,T=d.characterTypes,r=d.renderer,gl=r.getContext();
  r.setAnimationLoop(null);
  const origin=new T.Vector3(400,25,-400),out=[],stats=a=>{a.sort((a,b)=>a-b);return {n:a.length,p95:a[Math.floor((a.length-1)*.95)],max:a.at(-1)};};
  const scene=new d.scene.constructor();
  const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
  const pose=await import('./src/entities/character/avatar-motion.js');
  const att=await import('./src/entities/character/attention-pose.js');
  const qmat=r=>new T.Matrix4().fromArray([r[0],r[1],r[2],0,r[3],r[4],r[5],0,r[6],r[7],r[8],0,0,0,0,1]);
  function probe(actor,obj,ids,expected,variable){
   const old=obj.geometry,mat=obj.material,vs=mat.vertexShader,fs=mat.fragmentShader,pg=new T.BufferGeometry();
   const count=ids.length,positions=new Float32Array(count*6),indices=new Uint16Array(count*3);
   for(const [name,a] of Object.entries(old.attributes)){
    const v=new a.array.constructor(count*3*a.itemSize);
    for(let i=0;i<count;i++)for(let k=0;k<3;k++)v.set(a.array.subarray(ids[i]*a.itemSize,(ids[i]+1)*a.itemSize),(i*3+k)*a.itemSize);
    pg.setAttribute(name,new T.BufferAttribute(v,a.itemSize,a.normalized));
   }
   for(let i=0;i<count;i++){
    const x=8+i*10,y=12,toX=x=>2*x/width-1,toY=y=>2*y/height-1;
    positions.set([toX(x-4),toY(y-3),toX(x+4),toY(y-3),toX(x),toY(y+5)],i*6);
    indices.set([i*3,i*3+1,i*3+2],i*3);
   }
   pg.setAttribute('aProbe',new T.BufferAttribute(positions,2));pg.setIndex(new T.BufferAttribute(indices,1));
   mat.vertexShader='attribute vec2 aProbe; varying vec3 vProbe; uniform vec3 uProbeOrigin;\n'+vs.replace(/gl_Position\s*=\s*[^;]+;/,'vProbe=(modelMatrix*vec4('+variable+',1.)).xyz-uProbeOrigin; gl_Position=vec4(aProbe,0.,1.);');
   mat.fragmentShader='varying vec3 vProbe;void main(){gl_FragColor=vec4(clamp(vProbe*.25+.5,0.,1.),1.);}';
   mat.uniforms.uProbeOrigin={value:origin};mat.needsUpdate=true;obj.geometry=pg;
   const hide=actor.model.children.filter(x=>x!==obj&&!x.isBone),vis=hide.map(x=>x.visible);
   hide.forEach(x=>x.visible=false);
   const shadow=r.shadowMap.enabled;r.shadowMap.enabled=false;
   try{
    r.setRenderTarget(null);r.clear();r.render(scene,d.camera);
    const error=[],pixels=new Uint8Array(4);
    for(let i=0;i<count;i++){
     gl.readPixels(8+i*10,12,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
     const v=new T.Vector3(...Array.from(pixels.slice(0,3),v=>(v/255-.5)*4)).add(origin);
     error.push(v.distanceTo(expected[i]));
    }
    return stats(error);
   }finally{
    r.shadowMap.enabled=shadow;hide.forEach((x,i)=>x.visible=vis[i]);obj.geometry=old;mat.vertexShader=vs;mat.fragmentShader=fs;delete mat.uniforms.uProbeOrigin;mat.needsUpdate=true;pg.dispose();
   }
  }
  for(const sex of ['male','female']){
   d.avatars.setProfile({body:sex});d.avatars.setThird(true,{persist:false});
   const a=d.avatars.actor,shirt=a.clothing.equip('top.basic-shirt'),parent=a.group.parent;
   scene.add(a.group);a.group.position.copy(origin);a.group.rotation.y=.8;
   const b=shirt.userData.garmentBinding,asset=a.shirtAsset;
   const clothIds=[];for(let i=0;i<b.rest.length/3;i++)if(asset.influence[i*4+3]===1&&asset.influence[i*4+1]>248)clothIds.push(i);
   const bodyIds=[],g=a.mesh.geometry;for(let i=0;i<g.attributes.position.count;i++){const id=g.attributes.skinIndex.getX(i),name=a.bones[id].name;if(/forearm|head|neck/.test(name)&&g.attributes.skinWeight.getX(i)>.85)bodyIds.push(i);}
   const sample=a=>Array.from({length:36},(_,i)=>a[Math.floor(i*(a.length-1)/35)]);
   const ci=sample(clothIds),bi=sample(bodyIds);
   for(const [name,angles] of [['attention',null],['bend',{upper_arm_right:[40,25],forearm_right:[90,0],upper_arm_left:[40,25],forearm_left:[90,0],head:[25,15],neck:[15,5]}],['IK',{}]]){
    a.pose(angles??{});
    if(!angles)for(const [name,m] of Object.entries(att.attentionRotations(a.data.bones)))a.B[name].quaternion.setFromRotationMatrix(qmat(m));
    a.group.updateMatrixWorld(true);
    if(name==='IK'){
     const grip=new T.Vector3(-.22,1.28,.38).applyMatrix4(a.group.matrixWorld),blade=new T.Vector3(.1,.8,.6).transformDirection(a.group.matrixWorld),inward=new T.Vector3(1,0,0).transformDirection(a.group.matrixWorld),pole=new T.Vector3(-1,-.7,-.2).transformDirection(a.group.matrixWorld);
     pose.poseGrip(T,a,'right',grip,blade,inward,pole);
    }
    a.group.updateMatrixWorld(true);shirt.userData.updateGarmentPose();
    const ce=ci.map(i=>shirt.userData.deformGarmentVertex(i));
    const be=bi.map(i=>a.mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(a.mesh.matrixWorld));
    const body=probe(a,a.mesh,bi,be,'transformed'),cloth=probe(a,shirt,ci,ce,'transformed');
    out.push({sex,name,body,cloth});
   }
   parent.add(a.group);
  }
  return out;
 });
 console.log('ACTUAL GPU VERTICES '+JSON.stringify(result));
 assert(result.every(x=>x.body.max<.025&&x.cloth.max<.025),'GPU vertex output diverges from CPU pose');
 assert.deepEqual(errors,[]);await context.close();
}finally{await browser?.close();server.kill();}
