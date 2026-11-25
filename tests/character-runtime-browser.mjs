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
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({contentType:'text/css',body:''}));
  page.on('pageerror',e=>{errors.push(String(e));console.log('PAGE ERROR',String(e));});
  page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log('CONSOLE ERROR',m.text().slice(0,2500));}});
  try{
   await page.goto('http://127.0.0.1:8797/',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>!!window.__dev,{timeout:180000});
   await page.waitForFunction(()=>!!document.querySelector('iframe')?.contentWindow?.CharacterStudio,{timeout:120000});
   assert(await page.locator('#character-chooser').evaluate(e=>e.open),'First launch did not open character creator');
   const iframe=page.frameLocator('#character-chooser iframe');
   await iframe.getByRole('button',{name:'여성',exact:true}).click();
   await iframe.getByRole('button',{name:'세부 조정',exact:true}).click();
   assert.equal(await iframe.getByRole('button',{name:'기본 설정',exact:true}).getAttribute('aria-pressed'),'true');
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
   await iframe.getByRole('button',{name:'적용하기',exact:true}).click();
   await page.waitForFunction(()=>!__dev.avatars.isOpen);
   for(let i=0;i<5&&await page.locator('#intro').isVisible();i++)await page.locator('#intro').click();
   const stats=await page.evaluate(()=>{
    const d=__dev,a=d.avatars,T=d.characterTypes;d.renderer.setAnimationLoop(null);
    // Find genuine camera clearance: the previous fixed hillside compressed the boom
    // below one metre and hid the very hands/framing that these captures should verify.
    a.setThird(true);
    const places=Object.values(d.region.places).filter(p=>Array.isArray(p)&&p.length>=2);
    const candidates=places.flatMap(([x,z])=>[[x+8,z],[x-8,z],[x,z+8],[x,z-8]]);
    for(let x=-800;x<=800;x+=80)for(let z=-800;z<=800;z+=80)candidates.push([x,z]);
    let clear=false;
    for(const [x,z,yaw=0] of candidates){
     const ground=d.groundAt(x,z,400);
     if(ground<2||[[-4,0],[4,0],[0,-4],[0,4]].some(([dx,dz])=>Math.abs(d.groundAt(x+dx,z+dz,400)-ground)>.2))continue;
     if(d.collidersAt(x,z,4).some(o=>o.top>ground+.2&&o.bot<ground+2))continue;
     d.player.teleport(x,z,yaw,0);d.player.onGround=true;d.player.vel.set(0,0,0);
     d.rig.reset(d.player);d.rig.update(0,d.player);a.update(0,1,d.combat);a.applyThirdCamera(0,d.rig);
     if(d.camera.position.distanceTo(d.player.pos.clone().add(new T.Vector3(0,1.02,0)))>2.9){clear=true;break;}
    }
    if(!clear)throw Error('No unobstructed third-person capture location');
    d.frame();
    const projectedBody=[0,1.76].map(y=>d.player.pos.clone().add(new T.Vector3(0,y,0)).project(d.camera).toArray());
    const root=a.bodyRoot,before=d.camera.position.toArray(),q=d.camera.quaternion.toArray();
    const npc=d.folk.list.map(n=>{const ch=d.folk.ensureActor(n);return {id:n.def.id,gender:n.def.gender,body:ch.profile.body,vertices:ch.mesh.geometry.attributes.position.count,features:ch.mesh.userData.studioFeatures.length,values:ch.profile.values};});
    const equipped=d.inventory.equipped('right');
    if(equipped?.definitionId!=='apprentice_sword')throw Error('Default item not equipped in canonical ledger');
    const grip=a.handWeapons.right;
    if(!grip)throw Error('Canonical equipped sword not mounted on character');
    const palm=grip.userData.grip;
    const handle=new T.Vector3(0,-.08,0).applyMatrix4(grip.matrix);
    const gripError=handle.distanceTo(palm)*a.actor.units;
    // Checking a transform-only handle point used to pass while the fingers
    // visibly missed the shaft. Sample the actual animated digit bones.
    function gripClearance(){
     a.actor.group.updateMatrixWorld(true);grip.updateWorldMatrix(true,false);
     const h=grip.userData.handleY;
     const centre=grip.localToWorld(new T.Vector3(0,h,0));
     const axis=grip.localToWorld(new T.Vector3(0,h+.3,0)).sub(centre).normalize();
     const radial=name=>a.actor.B[name].getWorldPosition(new T.Vector3()).sub(centre).cross(axis).length();
     return {thumb:radial('thumb_right_2'),middle:radial('middle_right_2')};
    }
    const thirdGripClearance=gripClearance();
    const tip=()=>grip.localToWorld(new T.Vector3(0,.7,0)).toArray();
    const idleTip=tip();const bladeRise=idleTip[1]-grip.localToWorld(new T.Vector3(0,-.08,0)).y;
    d.combat.attack();const swing=d.combat.swing;
    const poses=[];
    for(const t of [0,swing.spec.windup*.65,swing.spec.windup,swing.spec.windup+swing.spec.swing*.5,swing.spec.windup+swing.spec.swing,swing.dur*.99]){
     swing.t=t;d.rig.update(0,d.player);d.combat.view.update(0,swing,false,true);a.update(0,1,d.combat);a.applyThirdCamera(0,d.rig);a.updateTrail(d.combat);
     poses.push({t,tip:tip(),camera:d.camera.position.toArray(),q:d.camera.quaternion.toArray(),elbow:a.actor.B.forearm_right.getWorldPosition(new T.Vector3()).toArray()});
    }
    d.combat.swing=null;
    a.setThird(false);d.rig.reset(d.player);d.frame();
    const firstIdle={position:d.camera.position.toArray(),q:d.camera.quaternion.toArray()};
    const firstGripClearance=gripClearance();
    d.combat.attack();d.combat.swing.t=d.combat.swing.spec.windup;d.frame();
    const firstAttack={position:d.camera.position.toArray(),q:d.camera.quaternion.toArray()};
    const firstArmOnly=a.actor.mesh.material.uniforms.uFirst.value===1&&Object.values(d.combat.view.hands).every(h=>!h.g.visible);
    function visibleArmVertices(){
     const mesh=a.actor.mesh,g=mesh.geometry;let count=0;d.camera.updateMatrixWorld(true);mesh.updateWorldMatrix(true,false);
     for(let i=0;i<g.attributes.position.count;i+=5){
      if(g.attributes.aArm.getX(i)<.6)continue;
      const p=mesh.applyBoneTransform(i,new T.Vector3().fromBufferAttribute(g.attributes.position,i)).applyMatrix4(mesh.matrixWorld).project(d.camera);
      if(Math.abs(p.x)<.95&&Math.abs(p.y)<.95&&Math.abs(p.z)<1)count++;
     }
     return count;
    }
    d.combat.swing=null;d.rig.reset(d.player);d.frame();
    const visibleArms=visibleArmVertices();
    const wrist=a.actor.B.hand_right.getWorldPosition(new T.Vector3()).project(d.camera).toArray();
    d.combat.swing=null;a.setThird(true);d.frame();
    return{comparison:undefined,npc,profile:a.profile,created:d.Save.data.characterCreated,before,q,projectedBody,visibleArms,wrist,poses,idleTip,bladeRise,gripError,thirdGripClearance,firstGripClearance,firstIdle,firstAttack,firstArmOnly,rootPosition:root.position.toArray(),playerPosition:d.player.pos.toArray(),calls:d.renderer.info.render.calls};
   });
   await writeFile(`${root}/${label}-metrics.json`,JSON.stringify({...stats,comparison,errors},null,2));
   assert(stats.created&&stats.profile.body==='female'&&stats.profile.eye==='round'&&stats.profile.glasses==='round');
   // The approved Kael population was doubled from 25 to 50; verify count and geometry independently.
   assert.equal(stats.npc.length,50,'Kael must retain its 50 registered residents');
   assert.equal(new Set(stats.npc.map(n=>n.id)).size,stats.npc.length,'NPC IDs must be unique');
   const invalidNpcGeometry=stats.npc.filter(n=>!(n.body===n.gender&&n.features>=10&&n.vertices>20000&&n.vertices<120000));
   assert.deepEqual(invalidNpcGeometry.map(({id,gender,body,features,vertices})=>({id,gender,body,features,vertices})),[],'NPCs must use optimized studio body/face');
   assert(stats.gripError<.0001,'Sword handle misses actual palm: '+stats.gripError);
   for(const [mode,d] of Object.entries({third:stats.thirdGripClearance,first:stats.firstGripClearance})){
    assert(d.thumb>.011&&d.thumb<.026,'Thumb misses sword handle ('+mode+'): '+JSON.stringify(d));
    assert(d.middle>.008&&d.middle<.027,'Fingers miss sword handle ('+mode+'): '+JSON.stringify(d));
   }
   assert(stats.bladeRise>.3,'The sword points into the wrist instead of away from the grip: '+stats.bladeRise);
   assert.deepEqual(stats.rootPosition,stats.playerPosition,'Player body is not attached to the physics actor');
   const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
   assert(stats.poses.some(p=>distance(p.tip,stats.idleTip)>.4),'Sword never made a real sweep: '+JSON.stringify({idleTip:stats.idleTip,poses:stats.poses.map(p=>({t:p.t,tip:p.tip,elbow:p.elbow}))}));
   assert(stats.poses.every(p=>distance(p.camera,stats.before)<.003&&distance(p.q,stats.q)<.00001),'3P camera follows attack recoil');
   assert(distance(stats.firstIdle.q,stats.firstAttack.q)>.01,'Original 1P recoil disappeared');
   assert(stats.firstArmOnly,'1P arms were not rendered from the real character');
   assert(stats.visibleArms>30,'Real skinned arms are outside the first-person viewport: '+JSON.stringify({visible:stats.visibleArms,wrist:stats.wrist,firstIdle:stats.firstIdle,player:stats.playerPosition}));
   assert(stats.wrist.every(v=>Math.abs(v)<1),'Equipped hand is outside the first-person viewport: '+JSON.stringify(stats.wrist));
   assert(stats.projectedBody.every(p=>Math.abs(p[1])<.9),'Third-person framing crops head or feet: '+JSON.stringify(stats.projectedBody));
   await page.screenshot({path:`${root}/${label}-third-person.png`,timeout:90000});
   await page.evaluate(()=>{
    const d=__dev,T=d.characterTypes,a=d.avatars;
    a.setThird(false);d.combat.swing=null;d.rig.reset(d.player);d.frame();
   });
   await page.screenshot({path:`${root}/${label}-first-person.png`,timeout:90000});
   // Front, three-quarter and side views of the actual in-game body with the selected face.
   for(const [angle,name] of [[0,'front'],[.65,'quarter'],[1.45,'side']]){
    await page.evaluate(angle=>{
     const d=__dev,a=d.avatars,T=d.characterTypes;a.setThird(true);a.update(0,1,d.combat);
     const target=d.player.pos.clone().add(new T.Vector3(0,1.4,0));
     const toward=new T.Vector3(Math.sin(angle)*1.7,.2,Math.cos(angle)*1.7).applyQuaternion(a.bodyRoot.quaternion);
     d.camera.position.copy(target).add(toward);d.camera.lookAt(target);d.renderer.render(d.scene,d.camera);
    },angle);
    await page.screenshot({path:`${root}/${label}-${name}.png`,timeout:90000});
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
