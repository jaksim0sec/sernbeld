import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
const port=8795,home='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
let browser;
try{
 for(let i=0;i<80;i++){try{if((await fetch(home)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'allow'});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>{errors.push(String(e));console.log('PAGE ERROR',String(e));});
 page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE ERROR',m.text().slice(0,1500));});
 const start=Date.now();
 await page.goto(home,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.__dev&&document.getElementById('loading').classList.contains('done'),{},{timeout:180000});
 const before=await page.evaluate(()=>({total:__dev.folk.list.length,models:__dev.folk.list.filter(n=>n.ch).length,open:__dev.avatars.isOpen}));
 assert(before.total>0&&before.models===0&&before.open,JSON.stringify(before));
 await page.waitForFunction(()=>!!document.querySelector('#character-chooser iframe')?.contentWindow?.CharacterStudio,{},{timeout:120000});
 const studio=page.frameLocator('#character-chooser iframe');
 await studio.getByRole('button',{name:'적용하기',exact:true}).click({timeout:120000});
 await page.waitForFunction(()=>!__dev.avatars.isOpen,{},{timeout:120000});
 for(let i=0;i<5&&await page.locator('#intro').isVisible();i++)await page.locator('#intro').click({timeout:10000});
 const after=await page.evaluate(()=>({created:__dev.Save.data.characterCreated,loading:document.getElementById('loading').classList.contains('done'),residents:__dev.folk.list.length,modelCount:__dev.folk.list.filter(n=>n.ch).length}));
 assert(after.created&&after.loading,JSON.stringify(after));assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS fresh mobile startup, loading dismissal and mandatory creator application '+(Date.now()-start)+'ms '+JSON.stringify(after));
 await context.close();
}finally{await browser?.close();server.kill();}
