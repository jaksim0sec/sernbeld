#!/usr/bin/env node
// Browser integration: a new player can live freely and v1 saves accept optional custom skills.
import assert from 'node:assert/strict';
import {completeCharacterCreation} from './character-start.mjs';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
const port=8798;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',process.cwd()],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let browser;
try {
  let up=false;
  for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:'+port+'/index.html')).ok){up=true;break}}catch{} await sleep(120)}
  assert(up,'local server did not start');
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:780,height:360}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto('http://127.0.0.1:'+port+'/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.__dev,{timeout:180000});
  await completeCharacterCreation(page);
  await page.evaluate(()=>{window.__dev.renderer.setAnimationLoop(null);window.__dev.frame();});
  const initial=await page.evaluate(()=>({
    guild:window.__dev.Guild.state.registered,
    goal:window.__dev.society.goal(),
    customSkills:window.__dev.skills?.library.list(),
    saveVersion:window.__dev.Save.data.v
  }));
  assert.equal(initial.saveVersion,1);
  assert.equal(initial.guild,false);
  assert(!/견습 등록|숙박비 마련|의뢰판에서 일거리 받기/.test(initial.goal),'starting goal imposes guild/lodging');
  assert.deepEqual(initial.customSkills,[]);
  const intro=[];
  for(let i=0;i<6&&await page.locator('#intro').isVisible();i++){
    intro.push(await page.locator('#introLine').textContent());
    await page.locator('#intro').click();
  }
  assert(intro.length>0,'expected first-time intro');
  assert(!intro.some(line=>/빚 문서|이름부터 올려야|조합에 가입/.test(line)),'intro imposes a mandatory origin');
  const result=await page.evaluate(()=>{
    const d=window.__dev;
    const config={discipline:'physical',baseAction:'thrust',repeat:2,speed:1.25,power:1,manaInjection:4,energyDistribution:'last'};
    const entry={id:'browser-thrust',name:'브라우저 찌르기',discipline:'physical',version:1,config};
    d.skills.library.put(entry);
    const compiled=d.skills.compile(config,{stamina:100,mana:20,maxMana:30,physicalControl:1,magicControl:0});
    return {steps:compiled.steps.length,cost:compiled.cost,stored:d.skills.library.get('browser-thrust'),version:d.Save.data.v};
  });
  assert.equal(result.steps,2);
  assert.equal(result.cost.mana,4);
  assert.equal(result.stored.name,'브라우저 찌르기');
  assert.equal(result.version,1);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.__dev,{timeout:180000});
  const recovered=await page.evaluate(()=>({saved:window.__dev.skills.library.get('browser-thrust'),version:window.__dev.Save.data.v,hasGuild:window.__dev.Guild.state.registered}));
  assert.deepEqual(recovered.saved,result.stored,'custom skill lost after reload');
  assert.equal(recovered.version,1);
  assert.equal(recovered.hasGuild,false);
  assert.deepEqual(errors,[],'browser runtime errors');
  await context.close();
  console.log('PASS browser: free start, v1 save, compiled skill and reload persistence');
} finally {if(browser) await browser.close();server.kill();}
