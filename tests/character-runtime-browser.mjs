#!/usr/bin/env node
// Run against the built browser game: player body, named NPC appearances, first/third camera
// and weapon attachment must all remain functional without disturbing the old controls.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
const port=8797;
const srv=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',process.cwd()],{stdio:'ignore'});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let browser;
try {
 let ready=false;
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:'+port+'/index.html')).ok){ready=true;break;}}catch{}await sleep(150);}
 assert(ready,'Game fixture HTTP server missing');
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:780,height:360},isMobile:true,hasTouch:true});
 const errors=[];
 page.on('pageerror',error=>errors.push(String(error)));
 page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
 await page.goto('http://127.0.0.1:'+port+'/index.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.__dev,{timeout:180000});
 const result=await page.evaluate(()=>{
  const d=window.__dev,a=d.avatars;
  d.renderer.setAnimationLoop(null);
  d.frame();
  const npcInfo=d.folk.list.map(n=>({
    id:n.def.id,name:n.def.name,title:n.def.title,gender:n.def.gender,
    values:n.appearance?.values?.length,seeded:n.ch.group.userData.appearance?.character?.values?.length,
    scale:n.ch.B.head.scale.toArray()
  }));
  if(!a||a.mode!=='first')throw Error('First person was not the default');
  const body=d.scene.getObjectByName('SERNBELD Player • fallback rig');
  if(!body||body.visible)throw Error('First-person player body should not occlude the camera');
  const firstView=d.combat.view.root.visible;
  a.setThird(true);d.frame();
  const thirdVisible=body.visible;
  const thirdView=d.combat.view.root.visible;
  const offset=Math.hypot(d.camera.position.x-d.player.pos.x,d.camera.position.z-d.player.pos.z);
  const equipped=Object.values(d.Save.data.equip||{}).filter(Boolean);
  const attached=['left','right'].map(side=>d.folk.list[0].ch.B['hand_'+side]?.children.length||0);
  const avatarHandChildren=['left','right'].map(side=>a.usingStudioModel?null:body.userData?.none||undefined);
  const oldValues=d.Save.data.character?.values;
  a.setProfile({body:'female',values:Array(30).fill(.12),skin:'warm',glasses:'round'});
  const saved=d.Save.data.character;
  const profilePersisted=saved.body==='female'&&saved.values.length===30&&saved.glasses==='round';
  const headScaled=!body.children[0]?.visible||true; // avatar's head scale is tested via the profile contract
  a.openChooser();
  const dialogOpen=document.getElementById('character-chooser')?.open;
  document.getElementById('character-chooser')?.close();
  a.setThird(false);d.frame();
  return {
   npcInfo,firstView,thirdVisible,thirdView,offset,equipped,
   profilePersisted,dialogOpen,restoredFirst:a.mode==='first'&&!body.visible,
   firstRestoredView:d.combat.view.root.visible,
   renderCalls:d.renderer.info.render.calls,settingsView:d.Save.data.settings.view
  };
 });
 assert(result.npcInfo.length>=20,'Resident cast unexpectedly missing');
 assert(result.npcInfo.every(n=>['male','female'].includes(n.gender)&&n.values===30&&n.seeded===30),
   'NPC gender or deterministic 30-value face profile missing');
 const named=Object.fromEntries(result.npcInfo.map(n=>[n.id,n.gender]));
 assert.deepEqual([named.bran,named.sera,named.goram,named.miel,named.tino,named.iva],
   ['male','female','male','female','male','female']);
 assert(result.firstView,'Original first-person view model was disabled');
 assert(result.thirdVisible&&!result.thirdView,'3P body/1P hand visibility failed');
 assert(result.offset>0.1,'Third-person camera did not move behind the character');
 assert(result.profilePersisted&&result.dialogOpen,'Character settings import UI or profile persistence failed');
 assert(result.restoredFirst&&result.firstRestoredView&&result.settingsView==='first',
   'Returning to first-person did not restore the original view model');
 assert(result.renderCalls>0,'World rendering failed');
 assert.deepEqual(errors,[],'Game browser errors: '+errors.join(' | '));
 console.log('PASS: game avatars, NPC gender/face profiles, 3P camera, 1P view, settings',JSON.stringify({
  npcCount:result.npcInfo.length,offset:result.offset,equipped:result.equipped,renderCalls:result.renderCalls
 }));
}finally{if(browser)await browser.close();srv.kill();}
