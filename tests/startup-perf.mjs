import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import os from 'node:os';

// Test-only response instrumentation. No source, bundle, asset or SW is rewritten on disk.
const root=process.cwd(), output='test-results/startup-perf';
const port=8798, home='http://127.0.0.1:'+port+'/';
const timeout=420000;
const mark=name=>'performance.mark('+JSON.stringify('perf:'+name)+');';
const helper=String.raw`
function __perfTimed(name,fn){
 const id='perf:'+name+':'+performance.now()+':'+Math.random();
 performance.mark(id+':start');
 const finish=()=>{performance.mark(id+':end');performance.measure('perf:'+name,id+':start',id+':end');performance.clearMarks(id+':start');performance.clearMarks(id+':end');};
 try{const result=fn();if(result&&typeof result.then==='function')return result.then(v=>{finish();return v;},e=>{finish();throw e;});finish();return result;}catch(e){finish();throw e;}
}
`;
function insert(source,anchor,extra,after=false){
 const index=source.indexOf(anchor);
 assert(index>=0&&source.indexOf(anchor,index+anchor.length)<0,'Missing or ambiguous probe: '+anchor);
 const pos=index+(after?anchor.length:0);
 return source.slice(0,pos)+extra+source.slice(pos);
}
function wrap(source,name,label){
 const anchor='export function '+name+'(';
 assert(source.includes(anchor),'Missing function '+name);
 return source.replace(anchor,'function __perfOriginal_'+name+'(')+'\nexport function '+name+'(...args){return __perfTimed('+JSON.stringify(label)+',()=>__perfOriginal_'+name+'(...args));}\n';
}
function instrument(path,source){
 if(path==='game.js'){
  for(const [anchor,label,after] of [
   ['async function boot() {','boot-start',true],
   ['await generateWorld(region, (p, t) => hud.progress(p, t));','terrain-generated',true],
   ['hud.progress(.988,"캐릭터를 준비하는 중");','character-start',true],
   ['studioSource.lod=studioLod;','character-assets-ready',true],
   ['const studioFactory=createStudioGeometry(studioSource);','geometry-factory-ready',true],
   ['folk.settle(clock.hour);','residents-settled',true],
   ['const living=createLivingWorldRuntime(','living-start',false],
   ['if(living.ok){folk.living=living;}','living-ready',false],
   ['let previousView;','player-model-ready',false],
   ['hud.ready(region);','hud-ready',true],
   ['renderer.setAnimationLoop(tick);','loop-start',true]
  ]){
   // settle appears elsewhere; use only the first boot occurrence.
   if(label==='residents-settled'){
    const key='const folk = new Townsfolk(scene, region, makeCharacter);\n  folk.settle(clock.hour);';
    source=insert(source,key,mark(label),true);
   }else source=insert(source,anchor,mark(label),after);
  }
  return source;
 }
 if(path.endsWith('/studio-source.js')){
  for(const [name,label] of [['loadStudioBody','body-load'],['loadStudioSource','source-load'],['loadStudioLod','lod-load'],['loadGarmentBakes','bakes-load']])source=wrap(source,name,label);
  // Preserve internal calls through the wrapper. JSON time includes stream decompression.
  source=source.replaceAll("new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json()","__perfTimed('gzip-json',()=>new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json())");
  return helper+source;
 }
 if(path.endsWith('/studio-geometry.js')){
  source=wrap(source,'createStudioGeometry','geometry-factory');
  source=insert(source,'build(profile){','return __perfTimed("face-geometry",()=>{',true);
  source=insert(source,'cheek:cheekCenter()};','});',true);
  return helper+source;
 }
 if(path.endsWith('/studio-model.js'))return helper+wrap(source,'createStudioModel','model-assembly');
 if(path.endsWith('/garment-binding.js')){
  return helper+wrap(wrap(source,'hydrateGarmentBinding','binding-hydrate'),'bindGarmentGeometry','binding-fallback');
 }
 if(path==='sw.js'){
  return String.raw`
const __perfReport=async(name,url,start,bytes)=>{
 const data={perfSW:true,name,url,start,duration:performance.now()-start,origin:performance.timeOrigin,bytes};
 try{for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))client.postMessage(data);}catch{}
};
const __perfFetch=self.fetch.bind(self);
self.fetch=async(...args)=>{
 const start=performance.now(),url=String(args[0]?.url??args[0]);
 try{const response=await __perfFetch(...args);void __perfReport('fetch',url,start,Number(response.headers.get('content-length'))||null);return response;}
 catch(e){void __perfReport('fetch-error',url,start,null);throw e;}
};
const __perfPut=Cache.prototype.put;
Cache.prototype.put=async function(request,response){
 const start=performance.now(),url=String(request?.url??request),bytes=Number(response.headers.get('content-length'))||null;
 try{return await __perfPut.call(this,request,response);}finally{void __perfReport('cache-put',url,start,bytes);}
};
`+source;
 }
 return source;
}
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.gz':'application/octet-stream','.glb':'model/gltf-binary','.part':'text/plain'};
const patchFiles=['game.js','sw.js','src/entities/character/studio-source.js','src/entities/character/studio-geometry.js','src/entities/character/studio-model.js','src/entities/character/clothing/garment-binding.js'];
const patched=new Map();
for(const path of patchFiles)patched.set(path,Buffer.from(instrument(path,await readFile(resolve(root,path),'utf8'))));
const server=createServer(async(req,res)=>{
 try{
  const name=decodeURIComponent(new URL(req.url,home).pathname).replace(/^\/+/,'')||'index.html';
  const file=resolve(root,name);
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  const body=patched.get(name)??await readFile(file);
  res.writeHead(200,{'Content-Type':types[extname(name)]??'application/octet-stream','Content-Length':body.length,'Cache-Control':'max-age=60'});
  res.end(req.method==='HEAD'?undefined:body);
 }catch{res.writeHead(404).end();}
});
await mkdir(output,{recursive:true});
const meta={sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,cpu:os.cpus()[0]?.model,cores:os.cpus().length,memory:os.totalmem(),platform:os.platform(),network:'loopback; no throttling',viewport:{width:780,height:360},renderer:'headless Chromium SwiftShader',instrumented:true};
const records=[];
let browser;
async function sample(page,label,create){
 const start=Date.now(),errors=[],warnings=[],sw=[];
 const onError=e=>errors.push(String(e));
 const onConsole=m=>{if(m.type()==='warning'||m.type()==='error')warnings.push(m.text().slice(0,1000));};
 page.on('pageerror',onError);page.on('console',onConsole);
 let stage='navigation',failure=null;
 try{
  await page.goto(home,{waitUntil:'domcontentloaded',timeout});
  stage='runtime-ready';
  await page.waitForFunction(()=>!!window.__dev,null,{timeout});
  await page.evaluate(()=>performance.mark('perf:runtime-ready'));
  const chooser=page.locator('#character-chooser');
  assert.equal(await chooser.evaluate(e=>e.open),create,'Unexpected saved character state');
  if(create){
   stage='creator-ready';
   const apply=page.frameLocator('#character-chooser iframe').getByRole('button',{name:'적용하기',exact:true});
   await apply.waitFor({state:'visible',timeout});
   await page.waitForFunction(()=>!!document.querySelector('#character-chooser iframe')?.contentWindow?.CharacterStudio,null,{timeout});
   await page.evaluate(()=>performance.mark('perf:creator-ready'));
   // Save iframe timings before the editor can close or unload.
   const frame=page.frames().find(f=>f.url().includes('/studio.html'));
   if(frame)sw.push({frame:'creator-before-apply',data:await frame.evaluate(()=>window.__startupPerfSnapshot())});
   await page.evaluate(()=>performance.mark('perf:apply-start'));
   stage='apply';
   await apply.click({timeout});
   await page.waitForFunction(()=>!__dev.avatars.isOpen,null,{timeout});
   await page.evaluate(()=>performance.mark('perf:apply-end'));
  }
  stage='first-render';
  for(let i=0;i<5&&await page.locator('#intro').isVisible();i++)await page.locator('#intro').click({timeout});
  await page.waitForFunction(()=>!__dev.avatars.isOpen&&__dev.renderer.info.render.calls>0,null,{timeout});
  await page.evaluate(()=>performance.mark('perf:world-render-observed'));
  stage='sw-control';
  await page.waitForFunction(()=>navigator.serviceWorker.controller!==null,null,{timeout});
  await page.evaluate(()=>performance.mark('perf:sw-controlled'));
  stage='done';
 }catch(error){failure=String(error);}
 finally{
  const frames=[];
  for(const f of page.frames()){
   try{frames.push({url:f.url(),data:await f.evaluate(()=>window.__startupPerfSnapshot?.())});}catch(e){frames.push({url:f.url(),error:String(e)});}
  }
  const state=await page.evaluate(()=>({profile:window.__dev?.avatars.profile,created:window.__dev?.Save.data.characterCreated,residents:window.__dev?.folk.list.length,quality:window.__dev?.graphics.get(),controller:navigator.serviceWorker.controller?.scriptURL})).catch(()=>null);
  const record={label,stage,failure,elapsed:Date.now()-start,errors,warnings,state,frames,creatorSnapshots:sw};
  const summarize=data=>{
   if(!data)return null;
   const resources=data.resources??[],longs=data.longTasks??[],sw=data.serviceWorker??[];
   return {resourceCount:resources.length,transferBytes:resources.reduce((n,x)=>n+(x.transferSize||0),0),encodedBytes:resources.reduce((n,x)=>n+(x.encodedBodySize||0),0),
    longTasks:{count:longs.length,totalMs:longs.reduce((n,x)=>n+x.duration,0),maxMs:Math.max(0,...longs.map(x=>x.duration))},
    slowResources:resources.slice().sort((a,b)=>b.duration-a.duration).slice(0,8).map(x=>({name:x.name,duration:x.duration,transferSize:x.transferSize,encodedBodySize:x.encodedBodySize})),
    serviceWorker:sw.reduce((a,x)=>{const v=a[x.name]??={count:0,ms:0,max:0};v.count++;v.ms+=x.duration;v.max=Math.max(v.max,x.duration);return a;},{})};
  };
  record.summary={main:summarize(frames[0]?.data),creator:summarize(sw.find(x=>x.frame==='creator-before-apply')?.data)};
  records.push(record);
  await writeFile(output+'/report.json',JSON.stringify({meta,records},null,2));
  console.log('STARTUP SAMPLE',JSON.stringify({label,stage,failure,elapsed:record.elapsed,state,summary:record.summary,marks:frames[0]?.data?.marks,measures:frames[0]?.data?.measures?.reduce((a,m)=>{const s=a[m.name]??={count:0,ms:0,max:0};s.count++;s.ms+=m.duration;s.max=Math.max(s.max,m.duration);return a;},{})}));
  page.off('pageerror',onError);page.off('console',onConsole);
 }
 return !failure&&errors.length===0;
}
try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 meta.browser=browser.version();
 const repeats=Number(process.env.PERF_REPEATS??2);
 assert(Number.isInteger(repeats)&&repeats>0);
 for(let i=0;i<repeats;i++){
  const context=await browser.newContext({viewport:meta.viewport,isMobile:true,hasTouch:true,serviceWorkers:'allow'});
  try{
   await context.addInitScript(()=>{
    performance.setResourceTimingBufferSize(2000);
    const longs=[],sw=[];
    try{new PerformanceObserver(list=>longs.push(...list.getEntries().map(e=>e.toJSON()))).observe({type:'longtask',buffered:true});}catch{}
    navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.perfSW)sw.push(e.data);});
    window.__startupPerfSnapshot=()=>({origin:performance.timeOrigin,marks:performance.getEntriesByType('mark').map(e=>e.toJSON()),measures:performance.getEntriesByType('measure').map(e=>e.toJSON()),resources:performance.getEntriesByType('resource').map(e=>e.toJSON()),navigation:performance.getEntriesByType('navigation').map(e=>e.toJSON()),longTasks:longs,serviceWorker:sw});
   });
   // Each navigation gets a fresh page, keeping the same context/cache but excluding
   // previous-page teardown and preventing old runtime writes after save reset.
   const run=async(label,create)=>{
    const page=await context.newPage();
    try{return await sample(page,label,create);}finally{await page.close();}
   };
   if(!await run('cold-online-create-'+i,true))continue;
   if(!await run('warm-online-saved-'+i,false))continue;
   await context.setOffline(true);
   if(!await run('warm-offline-saved-'+i,false))continue;
   await context.addInitScript(()=>{
    if(window.top===window&&location.origin==='http://127.0.0.1:8798')localStorage.clear();
   });
   await run('warm-offline-create-'+i,true);
  }finally{await context.close();}
 }
 assert.equal(records.length,repeats*4,'One or more scenarios could not be reached');
 assert(records.every(r=>r.stage==='done'&&!r.failure&&!r.errors.length&&r.state?.residents===50),'Startup scenario failed; inspect partial report');
}finally{await browser?.close();server.close();}
