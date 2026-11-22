#!/usr/bin/env node
// A minimal skinned GLB fixture exercises the *same* GLTFLoader and IndexedDB
// player-model path used when importing the real character studio export.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
function glbFixture(){
 const views=[],accessors=[],chunks=[];let offset=0;
 function write(array,type,componentType,target,normalized=false){
  const buf=Buffer.from(array.buffer,array.byteOffset,array.byteLength);
  while(offset%4){chunks.push(Buffer.alloc(1));offset++;}
  const view=views.length;
  views.push({buffer:0,byteOffset:offset,byteLength:buf.length,...(target?{target}:{})});
  chunks.push(buf);offset+=buf.length;
  accessors.push({bufferView:view,componentType,count:array.length/({SCALAR:1,VEC3:3,VEC4:4,MAT4:16}[type]),type,...(normalized?{normalized:true}:{})});
  return accessors.length-1;
 }
 const p=write(new Float32Array([-.2,0,0,.2,0,0,0,1.7,0]),'VEC3',5126,34962);
 const n=write(new Float32Array([0,0,1,0,0,1,0,0,1]),'VEC3',5126,34962);
 const j=write(new Uint8Array([0,0,0,0,0,0,0,0,0,0,0,0]),'VEC4',5121,34962);
 const w=write(new Uint8Array([255,0,0,0,255,0,0,0,255,0,0,0]),'VEC4',5121,34962,true);
 const i=write(new Uint16Array([0,1,2]),'SCALAR',5123,34963);
 const ids=['pelvis','waist','ribcage','neck','head','upper_arm_left','forearm_left','hand_left',
   'upper_arm_right','forearm_right','hand_right'];
 const inverse=new Float32Array(ids.length*16);
 for(let k=0;k<ids.length;k++)for(let d=0;d<4;d++)inverse[k*16+d*4+d]=1;
 const bind=write(inverse,'MAT4',5126);
 const nodes=[{name:'Fixture root',children:[1,...ids.map((_,k)=>k+2)]},{name:'Fixture body',mesh:0,skin:0},
   ...ids.map(name=>({name}))];
 const json={
  asset:{version:'2.0',generator:'SERNBELD integration smoke fixture'},scene:0,scenes:[{nodes:[0]}],
  buffers:[{byteLength:offset}],bufferViews:views,accessors,
  meshes:[{name:'Fixture rigged triangle',primitives:[{attributes:{POSITION:p,NORMAL:n,JOINTS_0:j,WEIGHTS_0:w},indices:i}]}],
  nodes,skins:[{joints:ids.map((_,k)=>k+2),skeleton:2,inverseBindMatrices:bind}],
  extras:{format:'SERNBELD-Character/1',character:{body:'male',values:Array(30).fill(.15),glasses:'square'}}
 };
 let data=Buffer.from(JSON.stringify(json)),padding=(4-data.length%4)%4;
 if(padding)data=Buffer.concat([data,Buffer.alloc(padding,32)]);
 const binary=Buffer.concat(chunks);
 const out=Buffer.alloc(28+data.length+binary.length),view=new DataView(out.buffer,out.byteOffset,out.byteLength);
 view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,out.length,true);
 view.setUint32(12,data.length,true);view.setUint32(16,0x4e4f534a,true);data.copy(out,20);
 view.setUint32(20+data.length,binary.length,true);
 view.setUint32(24+data.length,0x004e4942,true);binary.copy(out,28+data.length);
 return [...out];
}
const port=8798,srv=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',process.cwd()],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let browser;
try{
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:'+port+'/index.html')).ok){ready=true;break;}}catch{}await sleep(150);}
 assert(ready,'Server unavailable');
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:780,height:360},isMobile:true,hasTouch:true});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:'+port+'/index.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.__dev,{timeout:180000});
 const result=await page.evaluate(async bytes=>{
  const d=window.__dev;d.renderer.setAnimationLoop(null);
  const buffer=Uint8Array.from(bytes).buffer;
  await d.avatars.loadGLB(buffer,true);
  d.avatars.setThird(true);d.frame();
  const root=d.avatars.bodyRoot;
  const weapon=d.avatars.handWeapons.right||d.avatars.handWeapons.left;
  const model={
   name:root.name,visible:root.visible,usingStudio:d.avatars.usingStudioModel,
   gender:d.avatars.profile.body,values:d.avatars.profile.values.length,
   glasses:d.avatars.profile.glasses,bone:weapon?.parent?.name||null,
   hasSkinnedMesh:!!root.getObjectByProperty('isSkinnedMesh',true),
   calls:d.renderer.info.render.calls
  };
  const db=await new Promise((resolve,reject)=>{
   const r=indexedDB.open('sernbeld-character-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
  const saved=await new Promise((resolve,reject)=>{
   const tx=db.transaction('models','readonly'),r=tx.objectStore('models').get('player.glb');
   r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
  db.close();
  d.avatars.setThird(false);d.frame();
  return {model,stored:saved?.byteLength||0,firstRestored:!root.visible&&d.combat.view.root.visible};
 },glbFixture());
 assert(result.model.usingStudio&&result.model.visible&&result.model.hasSkinnedMesh,'Studio GLB not bound to the live player');
 assert.equal(result.model.gender,'male');assert.equal(result.model.values,30);
 assert.equal(result.model.glasses,'square');
 assert(result.model.calls>0,'Imported model did not render');
 assert(result.stored>1000,'Imported studio GLB not stored in IndexedDB');
 assert(result.firstRestored,'Original first-person view failed after importing model');
 assert.deepEqual(errors,[],'GLB import browser errors: '+errors.join(' | '));
 console.log('PASS: skinned studio GLB parsing, 47-style joint names, character extras and local persistence',result);
}finally{if(browser)await browser.close();srv.kill();}
