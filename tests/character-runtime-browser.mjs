import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const srv=spawn('python3',['-m','http.server','8797','--bind','127.0.0.1'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let browser;
const root='test-results/characters';await mkdir(root,{recursive:true});
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:8797/')).ok)break;}catch{}await sleep(100);}
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const viewport of [{width:780,height:360},{width:390,height:844}]){
  const label=viewport.width>viewport.height?'landscape':'portrait';
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true});const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>{errors.push(String(e));console.log('PAGE ERROR',String(e));});
  page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log('CONSOLE ERROR',m.text().slice(0,2500));}});
  try{
   await page.goto('http://127.0.0.1:8797/',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>!!window.__dev,{timeout:180000});
   await page.waitForFunction(()=>!!document.querySelector('iframe')?.contentWindow?.CharacterStudio,{timeout:120000});
   assert(await page.locator('#character-chooser').evaluate(e=>e.open),'First launch did not open character creator');
   const iframe=page.frameLocator('#character-chooser iframe');
   await iframe.getByRole('button',{name:'여성',exact:true}).click();
   await iframe.getByRole('button',{name:'얼굴 확대',exact:true}).click();
   await page.screenshot({path:`${root}/${label}-creator.png`});
   // Verify the geometry pipeline agrees with the actual original editor, not just profile metadata.
   const comparison=await page.evaluate(()=>{
    const s=document.querySelector('iframe').contentWindow.CharacterStudio,d=__dev;
    s.setWeights(Array.from({length:30},(_,i)=>i===0?.22:i===14?.3:0));s.setStyle('eye','round');s.setStyle('glasses','round');
    const p=s.snapshot(),ref=s.getGeometry(),actual=d.studioFactory.build(p);let error=0;
    for(let i=0;i<ref.body.worldPositions.length;i++)error=Math.max(error,Math.abs(ref.body.worldPositions[i]-actual.body.worldPositions[i]));
    const featureError=ref.features.reduce((max,f,i)=>{
     for(let j=0;j<f.positions.length;j++)max=Math.max(max,Math.abs(f.positions[j]-actual.features[i].positions[j]));return max;
    },0);
    return {error,featureError,features:actual.features.length};
   });
   assert(comparison.error<1e-7&&comparison.featureError<1e-7,'Game geometry differs from original editor: '+JSON.stringify(comparison));
   await iframe.getByRole('button',{name:'이 캐릭터로 시작',exact:true}).click();
   await page.waitForFunction(()=>!__dev.avatars.isOpen);
   for(let i=0;i<5&&await page.locator('#intro').isVisible();i++)await page.locator('#intro').click();
   const stats=await page.evaluate(()=>{
    const d=__dev,a=d.avatars,T=d.characterTypes;d.renderer.setAnimationLoop(null);
    // Stable open ground eliminates unrelated terrace walls from the motion comparison.
    d.player.teleport(-600,-440,0,0);d.player.onGround=true;d.player.vel.set(0,0,0);a.setThird(true);d.rig.reset(d.player);d.frame();
    const root=a.bodyRoot,before=d.camera.position.toArray(),q=d.camera.quaternion.toArray();
    const npc=d.folk.list.map(n=>({id:n.def.id,gender:n.def.gender,body:n.ch.profile.body,vertices:n.ch.mesh.geometry.attributes.position.count,features:n.ch.mesh.userData.studioFeatures.length,values:n.ch.profile.values}));
    const grip=a.handWeapons.right;
    if(!grip)throw Error('Default equipped sword missing');
    const palm=grip.userData.grip;
    const handle=new T.Vector3(0,-.08,0).applyMatrix4(grip.matrix);
    const gripError=handle.distanceTo(palm)*a.actor.units;
    const tip=()=>grip.localToWorld(new T.Vector3(0,.7,0)).toArray();
    const idleTip=tip();d.combat.attack();const swing=d.combat.swing;
    const poses=[];
    for(const t of [0,swing.spec.windup*.65,swing.spec.windup,swing.spec.windup+swing.spec.swing*.5,swing.spec.windup+swing.spec.swing,swing.dur*.99]){
     swing.t=t;d.rig.update(0,d.player);d.combat.view.update(0,swing,false,true);a.update(0,1,d.combat);a.applyThirdCamera(0,d.rig);a.updateTrail(d.combat);
     poses.push({t,tip:tip(),camera:d.camera.position.toArray(),q:d.camera.quaternion.toArray(),elbow:a.actor.B.forearm_right.getWorldPosition(new T.Vector3()).toArray()});
    }
    d.combat.swing=null;
    a.setThird(false);d.rig.reset(d.player);d.frame();
    const firstIdle={position:d.camera.position.toArray(),q:d.camera.quaternion.toArray()};
    d.combat.attack();d.combat.swing.t=d.combat.swing.spec.windup;d.frame();
    const firstAttack={position:d.camera.position.toArray(),q:d.camera.quaternion.toArray()};
    const firstArmOnly=a.actor.mesh.material.uniforms.uFirst.value===1&&Object.values(d.combat.view.hands).every(h=>!h.g.visible);
    d.combat.swing=null;a.setThird(true);d.frame();
    return{comparison:undefined,npc,profile:a.profile,created:d.Save.data.characterCreated,before,q,poses,idleTip,gripError,firstIdle,firstAttack,firstArmOnly,rootPosition:root.position.toArray(),playerPosition:d.player.pos.toArray(),calls:d.renderer.info.render.calls};
   });
   assert(stats.created&&stats.profile.body==='female'&&stats.profile.eye==='round'&&stats.profile.glasses==='round');
   assert(stats.npc.length===25&&stats.npc.every(n=>n.body===n.gender&&n.features>=10&&n.vertices>30000),'NPCs must use actual studio body/face');
   assert(stats.gripError<.0001,'Sword handle misses actual palm: '+stats.gripError);
   assert.deepEqual(stats.rootPosition,stats.playerPosition,'Player body is not attached to the physics actor');
   const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
   assert(stats.poses.some(p=>distance(p.tip,stats.idleTip)>.4),'Sword never made a real sweep');
   assert(stats.poses.every(p=>distance(p.camera,stats.before)<.003&&distance(p.q,stats.q)<.00001),'3P camera follows attack recoil');
   assert(distance(stats.firstIdle.q,stats.firstAttack.q)>.01,'Original 1P recoil disappeared');
   assert(stats.firstArmOnly,'1P arms were not rendered from the real character');
   await page.screenshot({path:`${root}/${label}-third-person.png`});
   await page.evaluate(()=>{
    const d=__dev,T=d.characterTypes,a=d.avatars;
    a.setThird(false);d.combat.swing=null;d.rig.reset(d.player);d.frame();
   });
   await page.screenshot({path:`${root}/${label}-first-person.png`});
   // Front, three-quarter and side views of the actual in-game body with the selected face.
   for(const [angle,name] of [[0,'front'],[.65,'quarter'],[1.45,'side']]){
    await page.evaluate(angle=>{
     const d=__dev,a=d.avatars,T=d.characterTypes;a.setThird(true);a.update(0,1,d.combat);
     const target=d.player.pos.clone().add(new T.Vector3(0,1.4,0));
     const toward=new T.Vector3(Math.sin(angle)*1.7,.2,Math.cos(angle)*1.7).applyQuaternion(a.bodyRoot.quaternion);
     d.camera.position.copy(target).add(toward);d.camera.lookAt(target);d.renderer.render(d.scene,d.camera);
    },angle);
    await page.screenshot({path:`${root}/${label}-${name}.png`});
   }
   await writeFile(`${root}/${label}-metrics.json`,JSON.stringify({...stats,comparison,errors},null,2));
   assert.deepEqual(errors,[],'Browser rendering errors');
   await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__dev,{timeout:180000});
   const reload=await page.evaluate(()=>({open:__dev.avatars.isOpen,profile:__dev.avatars.profile}));
   assert(!reload.open&&reload.profile.body==='female'&&reload.profile.glasses==='round','Character was not restored on reload');
   console.log('PASS',label,JSON.stringify({geometry:comparison,grip:stats.gripError,NPCs:stats.npc.length,calls:stats.calls}));
  }catch(e){await page.screenshot({path:`${root}/${label}-failure.png`}).catch(()=>{});throw e;}
  finally{await context.close();}
 }
}finally{await browser?.close();srv.kill();}
