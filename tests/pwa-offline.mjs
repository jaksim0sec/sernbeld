#!/usr/bin/env node
// Browser-level PWA assertions: initial full offline install, offline restart,
// and network-first refresh of resources that were already cached.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';

const port = 8796;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',process.cwd()],{stdio:'ignore'});
const probePath='test-results/pwa-probe.txt';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let browser;
let context;
try {
  await mkdir('test-results',{recursive:true});
  await writeFile(probePath,'offline-probe-v1');
  let up=false;
  for(let i=0;i<80;i++){
    try{if((await fetch('http://127.0.0.1:'+port+'/index.html')).ok){up=true;break;}}catch{}
    await sleep(100);
  }
  assert(up,'PWA local HTTP server failed');
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  context=await browser.newContext({viewport:{width:780,height:360},isMobile:true,hasTouch:true,serviceWorkers:'allow'});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  const home='http://127.0.0.1:'+port+'/';
  await page.goto(home,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.__dev,{timeout:180000});
  await page.evaluate(()=>{window.__dev.renderer.setAnimationLoop(null);window.__dev.frame();});
  // Service worker must control the current page after installing ALL game assets.
  await page.waitForFunction(()=>navigator.serviceWorker.controller!==null,{timeout:90000});
  const controller=await page.evaluate(async()=>{
    const reg=await navigator.serviceWorker.ready;
    const expected=['index.html','game.js','pwa.js','manifest.webmanifest','assets/ui-icons.svg',
      'assets/pwa-icon-192.png','assets/pwa-icon-512.png',
      'assets/kael-cutstone-v7.glb.gz','assets/models/characters/female-base-v1.mesh.json',
      'styles/tokens.css','styles/hud.css','styles/menus-and-overlays.css',
      'styles/responsive.css','styles/world-map.css'];
    const cachesFound=await caches.keys();
    const cache=await caches.open(cachesFound.find(k=>k.endsWith('-shell')));
    const missing=[];
    for(const path of expected)if(!(await cache.match(new URL(path,reg.scope).href)))missing.push(path);
    return {scope:reg.scope,controller:navigator.serviceWorker.controller.scriptURL,
      cacheKeys:cachesFound,missing};
  });
  assert.deepEqual(controller.missing,[],'Offline install missing essential game assets');
  // Confirm the installable manifest actually points to decodable, correctly sized PNGs.
  const icons=await page.evaluate(async()=>{
    const response=await fetch('./manifest.webmanifest');
    const manifest=await response.json();
    const sizes=[];
    for(const expected of [192,512]){
      const entry=manifest.icons.find(i=>i.sizes===expected+'x'+expected && i.type==='image/png');
      if(!entry)throw Error('Missing raster app icon '+expected);
      const img=new Image(); img.src=new URL(entry.src,location.href).href;
      await img.decode();
      sizes.push([img.naturalWidth,img.naturalHeight]);
    }
    return {name:manifest.name,display:manifest.display,sizes};
  });
  assert.equal(icons.display,'standalone');
  assert.deepEqual(icons.sizes,[[192,192],[512,512]]);
  const readProbe=()=>page.evaluate(async()=> {
    const response=await fetch('./test-results/pwa-probe.txt');
    return {status:response.status,text:await response.text()};
  });
  assert.deepEqual(await readProbe(),{status:200,text:'offline-probe-v1'});
  await writeFile(probePath,'offline-probe-v2');
  assert.deepEqual(await readProbe(),{status:200,text:'offline-probe-v2'},
    'Network-first service worker served obsolete cached data');
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.__dev,{timeout:120000});
  await page.evaluate(()=>{window.__dev.renderer.setAnimationLoop(null);window.__dev.frame();});
  const offline=await page.evaluate(async()=>{
    const urls=['./game.js','./styles/hud.css','./assets/ui-icons.svg',
      './assets/kael-cutstone-v7.glb.gz','./assets/models/characters/female-base-v1.mesh.json'];
    const checks=[];
    for(const url of urls){
      const response=await fetch(url);
      checks.push({url,status:response.status,bytes:(await response.arrayBuffer()).byteLength});
    }
    return {webgl:!!window.__dev.renderer.getContext(),drawCalls:window.__dev.renderer.info.render.calls,checks};
  });
  assert(offline.webgl&&offline.drawCalls>0,'Offline game WebGL failed');
  assert(offline.checks.every(c=>c.status===200&&c.bytes>100),'Offline required asset missing');
  assert.deepEqual(await readProbe(),{status:200,text:'offline-probe-v2'},
    'Latest successfully fetched resource was not cached offline');
  await context.setOffline(false);
  await unlink(probePath);
  const removed=await readProbe();
  assert.equal(removed.status,404,'Stale cached response concealed a server 404');
  assert.deepEqual(errors,[],'Browser runtime errors: '+errors.join(' | '));
  await page.screenshot({path:'test-results/pwa-offline.png'});
  const report={controller,icons,offline,probe:{old:'offline-probe-v1',onlineNew:'offline-probe-v2',
    offlineCached:'offline-probe-v2',serverDeleted:removed.status},errors};
  await writeFile('test-results/pwa-report.json',JSON.stringify(report,null,2));
  console.log('PASS PWA: complete install, offline WebGL restart, local assets, network-first refresh, no stale 404');
  console.log(JSON.stringify(report,null,2));
}finally{
  if(context)await context.close();
  if(browser)await browser.close();
  server.kill();
  await unlink(probePath).catch(()=>{});
}
