import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const port=8799;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',process.cwd()],{stdio:'ignore'});
let browser;
try {
  let serverReady=false;
  for(let i=0;i<100;i++){
    try{if((await fetch('http://127.0.0.1:'+port+'/tests/character-fixture.html')).ok){serverReady=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  assert(serverReady,'Test HTTP server failed to start');
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:640,height:800},deviceScaleFactor:1});
  const errors=[],requests=[];
  page.on('pageerror',error=>errors.push('page: '+String(error)));
  page.on('console',msg=>{if(msg.type()==='error')errors.push('console: '+msg.text());});
  page.on('requestfailed',req=>errors.push('request: '+req.url()+' '+req.failure()?.errorText));
  page.on('response',response=>{
    if(response.url().includes('female-base-v1.mesh.json'))requests.push({status:response.status(),url:response.url()});
  });
  await page.goto('http://127.0.0.1:'+port+'/tests/character-fixture.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.characterFixture!=null,{timeout:60000});
  const report=await page.evaluate(()=>window.characterFixture);
  console.log(JSON.stringify({report,errors,requests},null,2));
  assert.equal(report.ready,true,report.error||'Character fixture failed');
  assert.equal(report.skinId,'standard-toon-skin-v1');
  assert.equal(report.parts,34);
  assert(report.firstDraw.calls>=34,'Expected separate body and hull passes');
  assert(report.posedDraw.calls>=34,'Posed character did not render');
  assert(report.skinPixels>1000,'Skin rendered no visible colored pixels');
  assert(requests.some(r=>r.status===200),'Packed female mesh fetch failed');
  assert.deepEqual(errors,[],'WebGL shader/asset/browser errors');
  await mkdir('test-results/character',{recursive:true});
  await page.screenshot({path:'test-results/character/standard-skin-female.png'});
  await writeFile('test-results/character/report.json',JSON.stringify({report,errors,requests},null,2));
  console.log('PASS: actual WebGL skin shader, original female mesh and posed joints rendered');
}finally{if(browser)await browser.close();server.kill();}
