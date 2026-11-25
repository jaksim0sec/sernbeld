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
// Import the actual graph runner and its dependency into the isolated DOM.
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const graphModule=moduleUrl(read('src/core/npc-dialogue.js').replace("'./npc-topic.js'",JSON.stringify(moduleUrl(read('src/core/npc-topic.js')))));
const graphTemplate=JSON.parse(read('tests/fixtures/npc-003-topics.json')).templates[0];
const browser=await chromium.launch({headless:true});
try {
  for (const [width,height,touch] of [[390,736,true],[780,360,true],[320,568,true],[1180,700,false]]) {
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch,reducedMotion:'reduce'});
    try {
      const page=await context.newPage();
      await page.setContent('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+styles+'</style><button id="prompt" class="prompt" type="button"></button>'+markup);
      await page.evaluate(async ({uiSource,touch,sessionSource,graphModule,graphTemplate})=>{
        const get=id=>document.getElementById(id);
        const el=(tag,cls)=>Object.assign(document.createElement(tag),{className:cls||''});
        const session=Function('return ('+sessionSource+')')();
        const UI=Function('$2','el','document','IS_MOBILE','iconURL','createDialogueSession',uiSource+'\nreturn GameUI;')(get,el,document,touch,id=>{if(id!=='roadside_mugwort')throw new TypeError("Cannot read properties of undefined (reading 'icon')");return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E';},session);
        const ui=Object.create(UI.prototype);ui.prompt=get('prompt');
        ui.setPrompt({kind:'npc',verb:'대화',label:'브란'});
        window.showDialogue=(count=3,long=false)=>ui.say({id:'bran',name:'브란',title:'항구 관리인'},long?'긴 대화 내용입니다. '.repeat(100):'처음 보는 얼굴이군. 어디서 왔나?',Array.from({length:count},(_,i)=>({label:['이곳에 대해 물어보기','물건 거래하기','의뢰판 보기'][i%3],act:()=>ui.say({id:'bran',name:'브란'},'그렇군. 알겠네.')})));
        window.showPages=()=>ui.say({id:'bran',name:'브란'},['첫 줄','둘째 줄'],[{label:'선택',act:()=>ui.closeSpeech()}]);
        ui.prompt.onclick=()=>window.showDialogue();
        const {createTopicSession}=await import(graphModule);
        const anchor={id:'bran',name:'브란',title:'관리인'};
        const other={id:'other',name:'동료',title:'부두 일꾼'};
        ui.dialogueSpeaker=id=>id===other.id?other:anchor;
        window.showIconChoices=()=>{
          const services=[
            {id:'living.group.reply',itemId:'kael_dock_reply',label:'부두 이야기'},
            {id:'living.request.accept',kind:'item',itemId:'request:1',iconItemId:'roadside_mugwort',label:'납품'},
            {id:'shop.buy',kind:'item',itemId:'roadside_mugwort',label:'구매'}
          ];
          const session=createTopicSession(anchor,'의뢰',{resolve:()=>({topics:[],services})});
          ui.say(anchor,'의뢰',[],session);
        };
        window.showGraph=()=>{
          const named={template:graphTemplate,topicId:graphTemplate.topicId,source:'named',eventRef:null,facts:{},slotBinding:{npc:'bran',player:'player'}};
          const eventTemplate={...graphTemplate,id:'fixture.browser.group',topicId:'fixture.browser.event',source:'event',label:'사건 화제',nodes:graphTemplate.nodes.map(n=>n.id==='answer'?{...n,speakerSlot:'companion',pages:['동료의 사건 답변']}:n)};
          let eventRevision=1,serviceCalls=0;
          const service={id:'buy',label:'거래',quote:'q1'};
          const session=createTopicSession(anchor,'함께 이야기 중',{
            initialSpeakerId:other.id,readContext:()=>({now:1}),
            resolve:()=>({topics:[named,{template:eventTemplate,topicId:eventTemplate.topicId,source:'event',eventRef:{id:'event1',revision:eventRevision},facts:{},slotBinding:{npc:'bran',companion:'other',player:'player'}}],services:[service]}),
            executeService:()=>{serviceCalls++;return {ok:true,text:'거래 완료'};}
          });
          window.changeEventRevision=()=>eventRevision++;
          window.graphState=()=>({same:ui.speechSession===session,anchor:ui.activeSpeaker,status:session.status,serviceCalls});
          ui.say(anchor,'함께 이야기 중',[],session);
        };
      },{uiSource,touch,sessionSource:createDialogueSession.toString(),graphModule,graphTemplate});
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
      // Closing must remain visible and hit-testable even before scrolling long choices.
      for(const scrollTop of [0,50,99999]){
        await page.locator('#speechOpts').evaluate((e,n)=>e.scrollTop=n,scrollTop);
        assert.ok(await page.locator('#speechDismiss').evaluate(e=>{
          const r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();
          return r.top>=p.top-.5&&r.bottom<=p.bottom+.5&&r.height>=44&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
        }),'dismiss stays visible and clickable during overflow');
      }
      await page.locator('#speechOpts').evaluate(e=>e.scrollTop=0);
      await page.locator('#speechDismiss').click();
      assert.equal(await page.locator('#speech').isVisible(),false);
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
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.evaluate(()=>window.showIconChoices());
      assert.equal(await page.locator('#speechOpts button').nth(0).locator('svg').count(),1,'group reply uses SVG');
      assert.equal(await page.locator('#speechOpts button').nth(1).locator('img').count(),1,'request uses item definition image');
      assert.equal(await page.locator('#speechOpts button').nth(2).locator('img').count(),1,'shop uses item image');
      await page.locator('#speechDismiss').click();
      await page.evaluate(()=>window.showGraph());
      const choices=page.locator('#speechOpts button');
      const line=page.locator('#speechLine');
      const speaker=page.locator('#speechName');
      assert.equal(await speaker.textContent(),'동료','joined current speaker displayed');
      assert.equal(await page.locator('#speechTitle').textContent(),'부두 일꾼');
      await page.evaluate(()=>window.staleGraphButton=document.querySelector('#speechOpts button'));
      await choices.first().click();
      assert.equal(await line.textContent(),'첫 인사');
      assert.equal(await speaker.textContent(),'브란');
      await page.evaluate(()=>window.staleGraphButton.click());
      assert.equal(await line.textContent(),'첫 인사','old detached choice cannot advance');
      await page.locator('#speechNext').click();
      assert.equal(await line.textContent(),'항구에 온 걸 환영하네.');
      await choices.first().click();
      assert.equal(await line.textContent(),'이곳은 카엘 항구라네.');
      await choices.nth(1).click();
      assert.equal(await choices.count(),4,'hub retains separate event and service choices');
      await choices.nth(1).click();
      await page.locator('#speechNext').click();
      await choices.first().click();
      assert.equal(await line.textContent(),'동료의 사건 답변');
      assert.equal(await speaker.textContent(),'동료','graph updates speaker without replacing session');
      assert.deepEqual(await page.evaluate(()=>window.graphState()),{same:true,anchor:'bran',status:'active',serviceCalls:0});
      await page.evaluate(()=>window.changeEventRevision());
      await choices.first().click();
      assert.equal(await line.textContent(),'지금은 그 이야기를 계속하기 어려워요.');
      assert.equal(await speaker.textContent(),'브란','stale topic returns to anchor');
      await page.evaluate(()=>window.staleGraphButton=document.querySelectorAll('#speechOpts button')[2]);
      await choices.nth(2).click();
      assert.equal(await line.textContent(),'거래 완료');
      await page.evaluate(()=>window.staleGraphButton.click());
      assert.deepEqual(await page.evaluate(()=>window.graphState()),{same:true,anchor:'bran',status:'active',serviceCalls:1});
      await page.locator('#speechDismiss').click();
      assert.equal(await page.locator('#speech').isVisible(),false);
      assert.deepEqual(await page.evaluate(()=>window.graphState()),{same:false,anchor:null,status:'closed',serviceCalls:1});
      console.log('PASS NPC dialogue DOM and graph '+width+'x'+height);
    } finally {await context.close();}
  }
} finally {await browser.close();}
