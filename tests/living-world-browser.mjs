// Opt-in real browser smoke/soak, not a production content registration.
// Run: node tests/living-world-browser.mjs --minutes=30
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {completeCharacterCreation} from './character-start.mjs';

const durationArg=process.argv.find(s=>s.startsWith('--minutes='));
const minutes=durationArg?Number(durationArg.split('=')[1]):0.25;
assert(Number.isFinite(minutes)&&minutes>0&&minutes<=60,'invalid soak duration');
const fixture=`
export const livingWorldContent={
 definitions:{
  needs:[{id:'fixture_need',min:0,max:100,initial:80,perTick:0,threshold:60}],
  actions:[{id:'fixture_idle',handlerId:'fixture_idle',duration:10080,interruptPolicy:'pauseable',baseScore:1,needWeights:{}}],
  roles:[{id:'fixture_worker',actionIds:['fixture_idle'],needWeights:{}}],
  profiles:[{id:'goram',regionId:'sernbeld',roleId:'fixture_worker',tags:['fixture_worker']}],
  requestPolicies:[{id:'fixture_supply',needKey:'fixture_need',tags:['fixture_worker'],selector:{definitionId:'wind_blossom'},quantity:1,minimumQuality:60,reward:2,ttlTicks:10080,needDelta:-100,label:'Test-only supply'}]
 },
 handlers:{fixture_idle:{plan:()=>({ok:true,plan:{}})}},
 configureItems(){}
};`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const port=8797,home='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
let browser,context;
try{
 let ready=false;
 for(let i=0;i<80;i++){try{if((await fetch(home)).ok){ready=true;break}}catch{}await sleep(100)}
 assert(ready,'HTTP server unavailable');
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 context=await browser.newContext({viewport:{width:780,height:360},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 // Replace the empty content module in this isolated browser context only.
 await page.route('**/src/core/living-world-content.js',route=>route.fulfill({status:200,contentType:'text/javascript',body:fixture}));
 await page.goto(home,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.__dev,undefined,{timeout:180000});
 await completeCharacterCreation(page);
 await page.waitForFunction(()=>{const r=__dev.folk.living;return r?.managed('goram')&&r.canTalk('goram')&&r.requestChoices('goram').some(c=>c.id==='living.request.accept')},undefined,{timeout:120000});
 const economy=await page.evaluate(()=>{
  const d=__dev,r=d.folk.living;
  d.graphics.set('medium');
  const balance=d.inventory.balance(),count=d.inventory.count('wind_blossom');
  d.inventory.createFor('player:local','wind_blossom',1,80);
  const accepted=r.executeRequest('goram',r.requestChoices('goram').find(c=>c.id==='living.request.accept'));
  const submit=r.requestChoices('goram').find(c=>c.id==='living.request.submit');
  if(!accepted.ok||!submit)throw Error('live request not accepted');
  const result=r.executeRequest('goram',submit);
  if(!result.ok)throw Error('live request not completed: '+JSON.stringify(result));
  return {before:balance,after:d.inventory.balance(),countBefore:count,countAfter:d.inventory.count('wind_blossom'),need:d.Save.data.npcStates.goram.needs.fixture_need};
 });
 assert.equal(economy.after,economy.before+2);
 assert.equal(economy.countAfter,economy.countBefore);
 assert.equal(economy.need,0);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.__dev?.folk?.living?.managed('goram'),undefined,{timeout:180000});
 await completeCharacterCreation(page);
 assert.equal(await page.evaluate(()=>__dev.inventory.balance()),economy.after,'live reward reload');
 assert.equal(await page.evaluate(()=>__dev.Save.data.npcStates.goram.needs.fixture_need),0,'live need reload');
 await page.evaluate(()=>{
  const d=__dev,r=d.folk.living,update=r.update;
  window.__livingSoak={samples:[],errors:[],paused:0};
  r.update=function(...args){
   const start=performance.now(),result=update.apply(this,args),ms=performance.now()-start;
   const state=window.__livingSoak;
   state.samples.push(ms);
   if(!result.ok&&state.errors.length<20)state.errors.push(result.reason);
   return result;
  };
 });
 const end=Date.now()+minutes*60000;
 let cycles=0,talks=0;
 do{
  const step=await page.evaluate(()=>{
   const d=__dev,r=d.folk.living,id=d.region.id;
   // Real lifecycle and runtime talk hold; this does not claim UI reach/choice coverage.
   const held=r.canTalk('goram')&&r.beginTalk('goram');
   if(held&&!r.update(null).ok)throw Error('talk release failed');
   if(!d.regions.suspend(id)||d.regions.isActive(id))throw Error('region suspend failed');
   return {held};
  });
  talks+=Number(step.held);
  await sleep(500);
  await page.evaluate(()=>{
   const d=__dev,id=d.region.id;
   if(!d.regions.resume(id)||!d.regions.isActive(id))throw Error('region resume failed');
   const names=['quay','plaza','smithy','north_gate'];
   const name=names[(window.__livingSoak.cycles??0)%names.length],p=d.region.places[name];
   if(p)d.teleport({x:p[0],z:p[1],lookAt:[p[0],p[1]-10]});
   window.__livingSoak.cycles=(window.__livingSoak.cycles??0)+1;
  });
  await page.keyboard.down('w');
  await sleep(1500);
  await page.keyboard.up('w');
  await sleep(1000);
  const check=await page.evaluate(()=>{
   const d=__dev,s=d.folk.living.snapshot(),queue=s.state.scheduler;
   return {queue:queue.length,unique:new Set(queue.map(j=>j.npcId)).size,paused:queue.filter(j=>j.status==='paused').length,managed:s.managed.length,errors:window.__livingSoak.errors};
  });
  assert.equal(check.queue,check.managed,'one job per managed resident');
  assert.equal(check.unique,check.queue,'duplicate NPC queue entry');
  assert.equal(check.paused,0,'talk hold leak');
  assert.deepEqual(check.errors,[],'runtime update error');
  cycles++;
 }while(Date.now()<end);
 assert(talks>0,'no talk hold exercised');
 const timing=await page.evaluate(()=>{
  const a=window.__livingSoak.samples.sort((x,y)=>x-y);
  return {frames:a.length,p95Ms:a[Math.ceil(a.length*.95)-1]??null,maxMs:a.at(-1)??null};
 });
 assert(timing.frames>0,'no frame updates sampled');
 assert.deepEqual(errors,[],'browser runtime errors');
 console.log('MEASURE living-world real-browser '+JSON.stringify({minutes,cycles,talks,timing,economy,environment:'Chromium software WebGL; update only, not full device CPU'}));
 console.log('PASS living-world browser fixture: live request, economy, reload, lifecycle, talk hold and queue bounds');
}finally{
 await context?.close();await browser?.close();server.kill();
}
