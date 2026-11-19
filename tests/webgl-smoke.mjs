#!/usr/bin/env node
// Browser smoke/regression test: compare unchanged main with current branch.
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const base = process.cwd();
const servers = [];
const sleep = ms => new Promise(r => setTimeout(r,ms));
const startServer = (dir,port) => {
  const p = spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',dir],{stdio:'ignore'});
  servers.push(p);
};
const errSummary = (label,logs) => ({label, errors:logs.filter(x=>x.type==='error').slice(0,12)});
async function waitHTTP(url) {
 for(let i=0;i<100;i++){try {const r=await fetch(url);if(r.ok)return;}catch{}await sleep(150);}
 throw new Error('Local server did not start: '+url);
}
const ports = [8765,8766];
startServer('/tmp/sernbeld-main',ports[0]);
startServer(base,ports[1]);
let browser;
try {
 await Promise.all(ports.map(port=>waitHTTP('http://127.0.0.1:'+port+'/index.html')));
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 await mkdir('test-results',{recursive:true});
 async function capture(label,port){
  const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1,reducedMotion:'reduce'});
  const page=await context.newPage();
  const logs=[];
  page.on('pageerror',e=>logs.push({type:'error',message:String(e)}));
  page.on('console',m=>{if(m.type()==='error')logs.push({type:'error',message:m.text()});});
  page.on('requestfailed',r=>logs.push({type:'error',message:r.url()+' '+r.failure()?.errorText}));
  await page.goto('http://127.0.0.1:'+port+'/index.html',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>!!window.__dev,{timeout:180000});
  await page.evaluate(()=>{window.__dev.renderer.setAnimationLoop(null);window.__dev.frame();});
  const stats=await page.evaluate(()=>{
    const d=window.__dev,gl=d.renderer.getContext(),info=d.renderer.info;
    return {webgl:!!gl,sceneObjects:d.scene.children.length,drawCalls:info.render.calls,triangles:info.render.triangles,player:[d.player.pos.x,d.player.pos.y,d.player.pos.z],canvas:[d.renderer.domElement.width,d.renderer.domElement.height],hasMap:!!d.fullMap,hasCollision:typeof d.collidersAt==='function',iconUses:document.querySelectorAll('svg use').length};
  });
  const path='test-results/'+label+'.png';await page.screenshot({path});
  const lifecycle=label==='refactor' ? await page.evaluate(() => {
    const d=window.__dev, id=d.region.id, c=d.wildlife.list[0];
    const before=d.entities.list({region:id}).length, initial=c.hp;
    if (!before || !c) throw Error('No registered region entities');
    c.hp=Math.max(0,initial-1);
    d.Save.write();
    const key='wildlife:'+id+':'+c.id;
    const saved=d.Save.data.regionEntities?.[id]?.[key]?.hp===c.hp;
    const changed=c.hp;
    d.regions.suspend(id);
    d.frame();
    const paused=!d.regions.isActive(id) && d.entities.list({region:id}).length===0 && !c.m.mesh.visible;
    c.hp=initial;
    d.regions.resume(id);
    d.frame();
    const restored=d.regions.isActive(id) && c.hp===changed && d.entities.list({region:id}).length===before;
    c.hp=initial;
    d.Save.write();
    return {before,saved,paused,restored,after:d.entities.list({region:id}).length};
  }) : null;
  await context.close();
  return {stats,path,logs,lifecycle};
 }
 const results={main:await capture('main',ports[0]),refactor:await capture('refactor',ports[1])};
 const pngA=PNG.sync.read(await readFile(results.main.path));
 const pngB=PNG.sync.read(await readFile(results.refactor.path));
 if(pngA.width!==pngB.width||pngA.height!==pngB.height)throw new Error('Screenshot dimensions differ');
 let sum=0,affected=0;
 for(let i=0;i<pngA.data.length;i+=4){
  const delta=(Math.abs(pngA.data[i]-pngB.data[i])+Math.abs(pngA.data[i+1]-pngB.data[i+1])+Math.abs(pngA.data[i+2]-pngB.data[i+2]))/3;
  sum+=delta;if(delta>40)affected++;
 }
 const pixels=pngA.width*pngA.height;
 const diff={meanAbsoluteDifference:sum/pixels,pixelsChangedOver40:affected/pixels};
 const report={main:results.main.stats,refactor:results.refactor.stats,diff,errors:[errSummary('main',results.main.logs),errSummary('refactor',results.refactor.logs)]};
 await writeFile('test-results/report.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 if (!results.refactor.lifecycle?.saved || !results.refactor.lifecycle?.paused || !results.refactor.lifecycle?.restored)
   throw new Error('Region lifecycle browser regression failed: '+JSON.stringify(results.refactor.lifecycle));
 const a=results.main.stats,b=results.refactor.stats;
 if(!a.webgl||!b.webgl||a.drawCalls<1||b.drawCalls<1)throw new Error('WebGL did not render');
 if(results.refactor.logs.some(x=>x.type==='error'))throw new Error('Refactored page emitted errors');
 if(b.iconUses!==15)throw new Error('Missing external SVG icon uses');
 if(a.sceneObjects!==b.sceneObjects)throw new Error('Scene graph root count changed');
 if(a.drawCalls!==b.drawCalls||a.triangles!==b.triangles)throw new Error('Rendering geometry stats differ');
 // Pixel comparison is informational because world animations and timing may differ.
 console.log('PASS: WebGL initialized, render statistics match, icons linked');
} finally {if(browser)await browser.close();for(const p of servers)p.kill();}
