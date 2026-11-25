import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {createDialogueSession} from '../src/core/npc-dialogue.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('src/gameplay/gameplay.part.js');
const uiSource=source.slice(source.indexOf('var GameUI = class {'),source.indexOf('var CLOCK_RATE ='));
const html=read('index.html');
const markup=html.slice(html.indexOf('<section class="speech"'),html.indexOf('</section>',html.indexOf('<section class="speech"'))+10);
const styles=['seed','tokens','hud','menus-and-overlays','responsive'].map(n=>read('styles/'+n+'.css').replace(/^@import[^;]+;/gm,'')).join('\n');
const browser=await chromium.launch({headless:true});
try {
  for (const [width,height,touch] of [[390,736,true],[780,360,true],[320,568,true],[1180,700,false]]) {
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch,reducedMotion:'reduce'});
    try {
      const page=await context.newPage();
      await page.setContent('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+styles+'</style><button id="prompt" class="prompt" type="button"></button>'+markup);
      await page.evaluate(({uiSource,touch,sessionSource})=>{
        const get=id=>document.getElementById(id);
        const el=(tag,cls)=>Object.assign(document.createElement(tag),{className:cls||''});
        const session=Function('return ('+sessionSource+')')();
        const UI=Function('$2','el','document','IS_MOBILE','iconURL','createDialogueSession',uiSource+'\nreturn GameUI;')(get,el,document,touch,()=> 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',session);
        const ui=Object.create(UI.prototype);ui.prompt=get('prompt');
        ui.setPrompt({kind:'npc',verb:'대화',label:'브란'});
        window.showDialogue=(count=3,long=false)=>ui.say({id:'bran',name:'브란',title:'항구 관리인'},long?'긴 대화 내용입니다. '.repeat(100):'처음 보는 얼굴이군. 어디서 왔나?',Array.from({length:count},(_,i)=>({label:['이곳에 대해 물어보기','물건 거래하기','의뢰판 보기'][i%3],act:()=>ui.say({id:'bran',name:'브란'},'그렇군. 알겠네.')})));
        window.showPages=()=>ui.say({id:'bran',name:'브란'},['첫 줄','둘째 줄'],[{label:'선택',act:()=>ui.closeSpeech()}]);
        ui.prompt.onclick=()=>window.showDialogue();
      },{uiSource,touch,sessionSource:createDialogueSession.toString()});
      assert.ok((await page.locator('#prompt').boundingBox()).height>=44);
      await page.locator('#prompt').click();
      const panel=await page.locator('.speech-body').boundingBox(),opts=await page.locator('#speechOpts').boundingBox();
      assert.ok(opts.y+opts.height<=panel.y+1,'choices must be above panel');
      assert.ok(Math.abs(opts.x+opts.width-panel.x-panel.width)<2,'right alignment');
      assert.ok(panel.x>=0&&panel.y>=0&&panel.y+panel.height<=height,'panel within viewport');
      for(const b of await page.locator('#speechOpts button').all())assert.ok((await b.boundingBox()).height>=44);
      await page.locator('#speechOpts button').first().click();
      assert.equal(await page.locator('#speechLine').textContent(),'그렇군. 알겠네.');
      assert.equal(await page.locator('#speechOpts button').count(),1);
      assert.equal(await page.locator('#speechOpts button').last().getAttribute('id'),'speechDismiss');
      await page.locator('#speechDismiss').click();
      assert.equal(await page.locator('#speech').isVisible(),false);
      await page.evaluate(()=>window.showPages());
      assert.equal(await page.locator('#speechLine').textContent(),'첫 줄');
      assert.equal(await page.locator('#speechOpts button').count(),1);
      assert.equal(await page.locator('#speechOpts button').last().getAttribute('id'),'speechDismiss');
      assert.ok((await page.locator('#speechNext').boundingBox()).height>=44);
      await page.locator('#speechNext').click();
      assert.equal(await page.locator('#speechLine').textContent(),'둘째 줄');
      assert.equal(await page.locator('#speechNext').isVisible(),false);
      await page.locator('#speechOpts button').first().click();
      assert.equal(await page.locator('#speech').isVisible(),false);
      await page.evaluate(()=>window.showDialogue(12,true));
      assert.ok(await page.locator('#speechLine').evaluate(e=>e.scrollHeight>e.clientHeight));
      const longPanel=await page.locator('.speech-body').boundingBox();
      assert.ok(Math.abs(longPanel.height-panel.height)<1,'body height must be stable');
      assert.ok(await page.locator('.speech-speaker').evaluate(e=>!e.closest('.speech-body')),'nameplate must be separate');
      assert.equal(await page.locator('#speechOpts button').last().getAttribute('id'),'speechDismiss');
      assert.ok(await page.locator('#speechOpts').evaluate(e=>e.scrollHeight>e.clientHeight));
      await page.emulateMedia({reducedMotion:'no-preference'});
      await page.evaluate(()=>window.showDialogue(3,true));
      assert.ok((await page.locator('#speechRest').textContent()).length>0,'typing should begin hidden');
      await page.locator('#speechLine').click();
      assert.equal(await page.locator('#speechRest').textContent(),'');
      await page.locator('#speechDismiss').click();
      await page.evaluate(()=>window.showPages());
      await page.locator('#speechNext').click();
      await page.locator('#speechLine').click();
      assert.equal(await page.locator('#speechText').textContent(),'둘째 줄');
      assert.equal(await page.locator('#speechAnnouncement').textContent(),'둘째 줄');
      await page.locator('#speechDismiss').click();
      assert.equal(await page.locator('#speech').isVisible(),false);
      console.log('PASS NPC dialogue DOM '+width+'x'+height);
    } finally {await context.close();}
  }
} finally {await browser.close();}
