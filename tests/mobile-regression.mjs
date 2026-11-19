#!/usr/bin/env node
// Mobile Chromium regression: main baseline vs structure-only refactor.
// The target is an emulated touch-enabled browser, NOT a physical Android device.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const servers=[],sleep=ms=>new Promise(r=>setTimeout(r,ms));
function serve(dir,port){const p=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',dir],{stdio:'ignore'});servers.push(p);}
async function ready(port){for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:'+port+'/index.html')).ok)return;}catch{}await sleep(150);}throw Error('Server not ready: '+port);}
const ports={main:8781,refactor:8782};
serve('/tmp/sernbeld-main',ports.main);serve(process.cwd(),ports.refactor);
let browser;
const results={};
try {
 await Promise.all(Object.values(ports).map(ready));
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 await mkdir('test-results/mobile',{recursive:true});
 for(const viewport of [{id:'landscape',width:780,height:360},{id:'portrait',width:360,height:780}]){
  results[viewport.id]={};
  for(const label of ['main','refactor']){
   const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'reduce',userAgent:'Mozilla/5.0 (Linux; Android 16; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36'});
   const page=await context.newPage();
   const errors=[],assetResponses=[];
   page.on('pageerror',e=>errors.push('page: '+String(e)));
   page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
   page.on('requestfailed',r=>errors.push('request: '+r.url()+' '+r.failure()?.errorText));
   page.on('response',r=>{if(r.url().includes('ui-icons.svg'))assetResponses.push({status:r.status(),mime:r.headers()['content-type']||''});});
   const url='http://127.0.0.1:'+ports[label]+'/index.html';
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForFunction(()=>!!window.__dev,{timeout:180000});
   await page.evaluate(()=>{window.__dev.renderer.setAnimationLoop(null);window.__dev.frame();});
   for(let n=0;n<5;n++){if(await page.locator('#intro').isVisible())await page.locator('#intro').tap({timeout:8000});else break;}
   assert.equal(await page.locator('#intro').isVisible(),false,label+' intro not dismissed');
   // Compare tangible SVG shapes, not just the existence of <use> tags.
   const icons=await page.evaluate(()=>{
    return ['#bagBtn svg','#tpBtn svg'].map(sel=>{
      const node=document.querySelector(sel),r=node.getBoundingClientRect(),g=node.getBBox();
      return {visible:r.width>0&&r.height>0,geometry:g.width>0&&g.height>0,rect:[Math.round(r.width),Math.round(r.height)]};
    });
   });
   assert(icons.every(i=>i.visible&&i.geometry),'HUD SVG icon is not geometrically rendered');
   if(label==='refactor'){
     assert.equal(assetResponses.length,1,'SVG sprite was not fetched exactly once');
     assert.equal(assetResponses[0].status,200,'External SVG file failed');
     assert(assetResponses[0].mime.includes('svg'),'External SVG MIME is incorrect');
     assert.equal(await page.locator('svg use').count(),15);
   }
   const before=await page.evaluate(()=>({pos:[window.__dev.player.pos.x,window.__dev.player.pos.y,window.__dev.player.pos.z],renderer:window.__dev.renderer.info.render.calls,worldMapCanvas:!!document.querySelector('#worldMapCanvas')}));
   assert(before.renderer>0,'WebGL not rendered');
   await page.locator('#bagBtn').tap({timeout:10000});
   assert.equal(await page.locator('#bag').isVisible(),true,'Bag failed to open');
   const bagState=await page.evaluate(()=>({items:document.querySelectorAll('#bag .grid > *').length,visible:!document.querySelector('#bag').hidden}));
   await page.locator('#bag .close').tap();
   assert.equal(await page.locator('#bag').isVisible(),false,'Bag failed to close');
   await page.locator('#tpBtn').tap();
   assert.equal(await page.locator('#travel').isVisible(),true,'Travel panel failed to open');
   await page.locator('#travel .close').tap();
   await page.locator('#hudMapOpen').tap({timeout:10000});
   assert.equal(await page.locator('#worldMap').isVisible(),true,'World map failed to open');
   const mapState=await page.evaluate(()=>({hasCanvas:document.querySelector('#worldMapCanvas').width>0,waypointCount:document.querySelector('#mapWaypoints').children.length,zoom:window.__dev.fullMap.zoom}));
   await page.locator('#mapZoomIn').tap();
   const zoomAfter=await page.evaluate(()=>window.__dev.fullMap.zoom);
   assert(zoomAfter>mapState.zoom,'Map zoom button failed');
   const mapBox=await page.locator('#worldMapStage').boundingBox();
   if(mapBox&&mapBox.width>100&&mapBox.height>100){
     const x=Math.round(mapBox.x+Math.min(90,mapBox.width*.35)),y=Math.round(mapBox.y+Math.min(90,mapBox.height*.4));
     const cdp=await context.newCDPSession(page);
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
     await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+25,y:y+14,id:1}]});
     await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
     await cdp.detach();
   }
   await page.locator('#mapClose').tap();
   assert.equal(await page.locator('#worldMap').isVisible(),false,'Map failed to close');
   // Real touch sequence on the gameplay canvas to exercise the pointer-based input path.
   const cdp=await context.newCDPSession(page);
   const x=65,y=viewport.height-65;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:3}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+30,y:y-25,id:3}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await cdp.detach();
   await page.evaluate(()=>window.__dev.frame());
   const final=await page.evaluate(()=>({drawCalls:window.__dev.renderer.info.render.calls,gameCanvas:document.querySelector('#view')?.width>0,panelsHidden:['bag','travel','worldMap'].every(id=>document.getElementById(id).hidden)}));
   assert(final.drawCalls>0&&final.gameCanvas&&final.panelsHidden,'Game not restored after menu/touch sequence');
   await page.screenshot({path:'test-results/mobile/'+viewport.id+'-'+label+'.png'});
   results[viewport.id][label]={viewport,icons,before,bagState,mapState,zoomChanged:zoomAfter>mapState.zoom,touchEventsDispatched:true,final,errors,assetResponses};
   assert.equal(errors.length,0,label+' console/network errors: '+errors.join(' | '));
   await context.close();
  }
  const a=results[viewport.id].main,b=results[viewport.id].refactor;
  assert.deepEqual(b.icons,a.icons,'Visible HUD SVG geometry differs');
  assert.deepEqual(b.bagState,a.bagState,'Bag behavior differs');
  assert.deepEqual(b.mapState,a.mapState,'Map state differs');
  assert.equal(b.final.drawCalls,a.final.drawCalls,'Rendering calls differ');
  assert.deepEqual(b.before.pos,a.before.pos,'Player initial position differs');
  console.log('PASS mobile '+viewport.id+': touch, inventory, travel, map/zoom, SVG shape, WebGL');
 }
 await writeFile('test-results/mobile/report.json',JSON.stringify(results,null,2));
}finally{if(browser)await browser.close();for(const p of servers)p.kill();}
