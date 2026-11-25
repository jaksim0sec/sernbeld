function checkDialogue(source,html,css,npcLinePool,createDialogueSession) {
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  class Node {
    constructor(tag='div'){this.tagName=tag;this.hidden=true;this.children=[];this.attrs={};this.style={};this.dataset={};this.listeners={};this.textContent='';}
    setAttribute(k,v){this.attrs[k]=String(v);}
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(...nodes){this.children=nodes;}
    addEventListener(k,fn){this.listeners[k]=fn;}
    click(){this.listeners.click?.({stopPropagation(){}});this.onclick?.();}
    focus(){}
  }
  const ids=new Map(['speech','speechName','speechTitle','speechLine','speechOpts','speechDismiss','speechNext','speechText','speechRest','speechAnnouncement'].map(k=>[k,new Node()]));
  const get=k=>ids.get(k);
  const fakeDoc={createElement:tag=>new Node(tag),createElementNS:(_,tag)=>new Node(tag)};
  let scheduled=0;
  const uiSrc=source.slice(source.indexOf('var GameUI = class {'),source.indexOf('var CLOCK_RATE ='));
  const UI=Function('$2','el','document','IS_MOBILE','iconURL','setTimeout','clearTimeout','createDialogueSession','window',uiSrc+'\nreturn GameUI;')(get,(tag,cls)=>Object.assign(new Node(tag),{className:cls}),fakeDoc,false,id=>'image:'+id,()=>{scheduled++;},()=>{},createDialogueSession,{matchMedia:()=>({matches:true})});
  const ui=Object.create(UI.prototype);
  ui.prompt=new Node('button');
  ui.setPrompt({kind:'npc',verb:'대화',label:'브란'});
  check(ui.prompt.children[0]?.tagName==='svg','NPC prompt needs common SVG icon');
  check(ui.prompt.attrs['aria-label']==='대화: 브란','NPC prompt accessible name');
  ui.setPrompt({kind:'item',itemId:'herb',verb:'줍기',label:'약초'});
  check(ui.prompt.children[0]?.tagName==='img'&&ui.prompt.children[0].src==='image:herb','item prompt uses item image');
  ui.setPrompt(null);check(ui.prompt.hidden,'prompt clears');
  let actions=0;
  ui.say({id:'bran',name:'브란',title:'관리인'},'안녕하세요',[{label:'등록',act:()=>{actions++;ui.say({id:'bran',name:'브란'},'완료');}}]);
  check(!get('speech').hidden&&ui.activeSpeaker==='bran','participating session starts');
  check(scheduled===0,'participating conversation must not auto-expire');
  check(get('speechOpts').children.length===2,'choice rendered');
  const old=get('speechOpts').children[0];
  old.click();old.click();
  check(actions===1&&get('speechText').textContent==='완료'&&!get('speech').hidden,'choice acts once and follow-up stays open');
  ui.closeSpeech();
  check(get('speech').hidden&&ui.activeSpeaker===null,'explicit close releases session');

  ui.say({id:'bran',name:'브란'},['첫 줄','둘째 줄'],[{id:'confirm',label:'확인',act:()=>{actions++;}}]);
  check(get('speechText').textContent==='첫 줄','first page displayed');
  check(!get('speechNext').hidden&&get('speechOpts').children.length===1,'no premature response');
  get('speechNext').click();
  check(get('speechText').textContent==='둘째 줄'&&get('speechNext').hidden,'explicit progression');
  check(get('speechOpts').children.length===2,'choices only at final page');
  const last=get('speechOpts').children[0];last.click();last.click();
  check(actions===2&&get('speech').hidden,'final choice executes once');
  ui.say({id:'bran',name:'브란'},['다음 줄','종료'],[]);
  ui.closeSpeech();get('speechNext').click();
  check(get('speech').hidden&&ui.activeSpeaker===null,'close invalidates page progression');
  const graph={id:'fixture.graph',topicId:'fixture.topic',label:'질문',entryNode:'intro',nodes:[
    {id:'intro',type:'speak',pages:['대답 하나','대답 둘'],next:'ask'},
    {id:'ask',type:'choice',choices:[{id:'follow',label:'더 묻기',conditions:[],nextNode:'answer'}]},
    {id:'answer',type:'speak',pages:['마지막 대답'],next:'hub'},{id:'hub',type:'end',mode:'topicHub'}]};
  const choice={template:graph,topicId:graph.topicId,source:'personal',facts:{},eventRef:null,slotBinding:{npc:'bran',player:'player'}};
  graph.nodes[2].speakerSlot='other';
  choice.slotBinding.other='sera';
  ui.dialogueSpeaker=id=>id==='sera'?{id:'sera',name:'세라',title:'길드원'}:null;
  const gs=createTopicSession({id:'bran'},'첫 인사',{initialSpeakerId:'sera',resolve:()=>({topics:[choice],services:[]})});
  ui.say({id:'bran',name:'브란'},'첫 인사',[],gs);
  check(get('speechName').textContent==='세라'&&ui.activeSpeaker==='bran','ambient speaker shown, anchor unchanged');
  const oldTopic=get('speechOpts').children[0];oldTopic.click();oldTopic.click();
  check(ui.speechSession===gs&&ui.activeSpeaker==='bran'&&get('speechText').textContent==='대답 하나','graph UI keeps anchor and rejects duplicate click');
  get('speechNext').click();check(get('speechText').textContent==='대답 둘','graph page progression');
  get('speechOpts').children[0].click();check(get('speechText').textContent==='마지막 대답'&&ui.speechSession===gs,'graph follow-up stays open');
  check(get('speechName').textContent==='세라'&&get('speechTitle').textContent==='길드원'&&ui.activeSpeaker==='bran','branch speaker changes without changing anchor');
  check(get('speechOpts').children.length===2,'topic hub returns');
  ui.closeSpeech();check(gs.status==='closed'&&ui.activeSpeaker===null,'graph close releases anchor');
  const folkSrc=source.slice(source.indexOf('var Townsfolk = class {'),source.indexOf('var turn ='));
  const Folk=Function('npcLinePool',folkSrc+'\nreturn Townsfolk;')(npcLinePool);
  const folk=Object.create(Folk.prototype);
  const n={def:{id:'bran',name:'브란',title:'관리인',lines:{first:'첫 대화',day:['낮 발화'],night:['밤 발화']}},x:0,y:0,z:-2,ch:{group:{visible:true}},hidden:false,lineI:7};
  folk.list=[n];folk.hour=12;
  const player={pos:{x:0,y:0,z:0},yaw:0};
  let labels=folk.labels({},player,10,true);
  check(labels[0]?.utterance==='낮 발화','ambient uses current non-first pool');
  check(n.lineI===7,'ambient cannot consume participation cursor');
  labels=folk.labels({},player,16,true);
  check(!labels[0]?.utterance,'ambient expires');
  labels=folk.labels({},player,17,false);
  check(!labels[0]?.utterance,'ambient suppressed during modal session');
  check(/id="speechOpts"[^>]*>[\s\S]*?class="speech-body"/.test(html),'choices outside dialogue surface');
  check(css.includes('var(--seed-touch)')&&css.includes('.speech-body'),'dialogue uses SEED control sizing');
  return 'PASS: common interaction chip, persistent explicit conversation, one-shot action, ambient lifetime/cursor, separate choice layout';
}
import {readFileSync} from 'node:fs';
import {createNpcStateStore,selectNpcLine,npcLinePool,runNpcAction,createDialogueSession,createTopicSession} from '../src/core/npc-dialogue.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
console.log(checkDialogue(read('src/gameplay/gameplay.part.js'),read('index.html'),read('styles/menus-and-overlays.css'),npcLinePool,createDialogueSession));

function checkNpcData(createNpcStateStore,selectNpcLine,npcLinePool,runNpcAction) {
  const equal=(a,b,message)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(message+": "+JSON.stringify(a)+" != "+JSON.stringify(b));};
  const save={data:{v:1,met:{bran:1},inv:{herb:3},money:4,regionEntities:{kael:{"resident:kael:0":{lineI:7}}}}};
  const state=createNpcStateStore(save);
  equal(state.ensure("bran","kael",7).lineI,7,"legacy cursor migration");
  state.recordTalk("bran",{lineI:8,day:2,hour:9});
  state.observe("bran",{region:"kael",activity:"work",position:{x:1,y:2,z:3}});
  state.recordAction("bran",{id:"guild.register",ok:true,day:2,hour:9});
  const copy=state.get("bran");copy.relationships.player.talks=99;copy.resources.money=999;
  equal(state.get("bran").relationships.player.talks,1,"snapshot not mutable");
  equal(state.get("bran").resources,{},"no invented resources");
  save.data=JSON.parse(JSON.stringify(save.data));
  const restored=createNpcStateStore(save);
  equal(restored.ensure("bran","kael",0).lineI,8,"stable record takes precedence over older cursor");
  equal(restored.get("bran").memory.lastAction.id,"guild.register","action remembered on reload");
  equal(restored.get("bran").activity,"work","activity persisted");
  equal(restored.get("bran").position,{x:1,y:2,z:3},"location persisted");
  equal(save.data.met,{bran:1},"old first meeting flag preserved");
  equal(save.data.inv,{herb:3},"existing inventory preserved");
  equal(save.data.money,4,"player money preserved");
  equal(save.data.regionEntities.kael["resident:kael:0"].lineI,7,"legacy region record preserved");
  let rejected=false;try{state.ensure("__proto__","kael",0);}catch{rejected=true;}equal(rejected,true,"invalid ID rejected");
  const def={lines:{first:"hello",day:["one","two"],night:["night"]}};
  equal(selectNpcLine(def,{met:false,cursor:5,hour:22,custom:"custom"}),{text:"hello",first:true,nextCursor:5},"first meeting priority");
  equal(selectNpcLine(def,{met:true,cursor:5,hour:22,custom:"custom"}),{text:"custom",first:false,nextCursor:5},"conditional line priority");
  equal(selectNpcLine(def,{met:true,cursor:5,hour:10}),{text:"two",first:false,nextCursor:6},"day cursor");
  equal(npcLinePool(def,22),["night"],"shared night pool");
  equal(selectNpcLine({lines:{}},{met:true,cursor:0,hour:10}),null,"empty dialogue has no session");
  let effects=0, choices=[{id:"buy",itemId:"herb",label:"herb"}], reachable=true;
  const run=choice=>runNpcAction(choice,{reachable:()=>reachable,choices:()=>choices,execute:()=>{effects++;return true;}});
  equal(run({id:"buy",itemId:"wrong"}),{ok:false,reason:"unavailable"},"unlisted payload rejected");
  reachable=false;equal(run(choices[0]),{ok:false,reason:"unreachable"},"reach revalidated");
  reachable=true;const oldChoice=choices[0];choices=[];equal(run(oldChoice),{ok:false,reason:"unavailable"},"stale condition rejected");
  equal(effects,0,"invalid actions do not mutate");
  choices=[oldChoice];equal(run(oldChoice),{ok:true,reason:"executed"},"current action executes");
  equal(effects,1,"exactly one dispatch");
  equal(runNpcAction(oldChoice,{reachable:()=>true,choices:()=>choices,execute:()=>false}),{ok:false,reason:"rejected"},"domain failure propagated");
  return "PASS: stable NPC state, legacy save compatibility, dialogue selection, action revalidation";
}
function checkNpcRuntime(source,createNpcStateStore,selectNpcLine,npcLinePool,runNpcAction) {
  const check=(v,m)=>{if(!v)throw Error(m);};
  let writes=0,spoken=0;
  const Save={data:{v:1,met:{},equip:{},rival:{done:0}},write(){writes++;}};
  const Guild={state:{registered:false,merit:0,done:0},readyList:()=>[]};
  const state=createNpcStateStore(Save);
  const Folk=Function("Save","selectNpcLine","npcLinePool",source.slice(source.indexOf("var Townsfolk = class {"),source.indexOf("var turn ="))+"return Townsfolk;")(Save,selectNpcLine,npcLinePool);
  const folk=Object.create(Folk.prototype);const def={id:"sera",role:"guild",name:"Sera",lines:{first:"hello",day:["day"]}};
  const n={def,x:0,y:0,z:-2,ch:{group:{visible:true}},lineI:0,hidden:false};
  state.ensure("sera","kael",0);folk.list=[n];folk.state=state;folk.now=()=>({day:1,hour:8});folk.onSay=()=>spoken++;
  const player={pos:{x:0,y:0,z:0},yaw:0,mode:"walk"};const candidate=folk.candidate(player);check(candidate,"NPC in reach");
  player.pos.z=10;candidate.act();check(spoken===0&&!Save.data.met.sera,"stale access cannot start dialogue");
  player.pos.z=0;player.swimming=true;candidate.act();check(spoken===0,"swimming blocks stale interaction");
  player.swimming=false;folk.candidate(player).act();check(spoken===1&&Save.data.met.sera===1,"first interaction retained");
  check(state.get("sera").relationships.player.talks===1,"real NPC records dialogue");
  const Society=Function("Save","Guild","ITEMS","Inventory","INN_PRICE","Wallet","runNpcAction",source.slice(source.indexOf("var Society = class {"),source.indexOf("var ViewModel = class {"))+"return Society;")(Save,Guild,{}, {entries:()=>[]},3,{},runNpcAction);
  const society=Object.create(Society.prototype);society.ui={say(){}};society.clock={day:1,hour:8};society.state=state;society.canInteract=()=>true;
  const stale=society.options(def)[0];Guild.state.registered=true;writes=0;stale.act();
  check(writes===0,"stale guild choice must not write or execute");
  Guild.state.registered=false;society.options(def)[0].act();
  check(Guild.state.registered&&writes>0,"current guild action executes");
  check(state.get("sera").memory.lastAction.id==="guild.register","real action remembered");
  return "PASS: actual Townsfolk access, legacy greeting, Society stale action and state link";
}

console.log(checkNpcData(createNpcStateStore,selectNpcLine,npcLinePool,runNpcAction));
console.log(checkNpcRuntime(read('src/gameplay/gameplay.part.js'),createNpcStateStore,selectNpcLine,npcLinePool,runNpcAction));

function checkGraphRunner(){
 const a=(v,m)=>{if(!v)throw Error(m);};
 const fixture=JSON.parse(read('tests/fixtures/npc-003-topics.json')),template=fixture.templates[0];
 const topic={template,topicId:template.topicId,source:template.source,eventRef:null,facts:{},slotBinding:{npc:'bran',player:'player'}};
 let service={id:'buy',itemId:'herb',quote:'q1',label:'거래'},reachable=true,executions=0,records=[];
 const session=createTopicSession({id:'bran'},['one','two'],{reachable:()=>reachable,readContext:()=>({now:9}),resolve:()=>({topics:[topic],services:[service]}),executeService:()=>{executions++;return {ok:true,text:'구매 완료'};},remember:r=>records.push(r)});
 a(session.canAdvance&&!session.choices.length,'legacy pages preserved');
 a(session.advance()&&session.text==='two','legacy second page');
 let token=session.choices[0].token,rev=session.revision;
 a(session.select(0,rev,token)&&session.text==='첫 인사','graph selection');
 a(!session.select(0,rev,token),'old revision rejected');
 a(session.advance()&&session.text==='항구에 온 걸 환영하네.','graph second page');
 a(session.choices.length===2,'graph choices');
 a(session.select(0,session.revision,session.choices[0].token)&&session.text==='이곳은 카엘 항구라네.','first branch');
 a(session.select(1,session.revision,session.choices[1].token)&&session.choices.length===2,'return topic hub');
 a(records.some(r=>r.completed)&&records.some(r=>r.choiceId==='harbor'),'explicit memory callbacks');
 token=session.choices[1].token;rev=session.revision;service={...service,quote:'q2'};
 a(session.select(1,rev,token)&&executions===0,'stale service quote not executed');
 a(session.select(1,session.revision,session.choices[1].token)&&executions===1&&session.text==='구매 완료'&&session.status==='active','service response stays in session');
 reachable=false;a(session.select(0,session.revision,session.choices[0].token)&&session.status==='closed','reach revalidated');
 const save={data:{v:1,met:{bran:1},npcStates:{}},write:()=>true},store=createNpcStateStore(save);store.ensure('bran','kael',7);
 for(let i=0;i<20;i++)a(store.recordTopic('bran',{templateId:'fixture.named.bran',topicId:'fixture.harbor',choiceId:'harbor',tick:i,rememberChoice:true}),'memory write');
 a(store.get('bran').memory.dialogue.choices.length===16&&store.get('bran').lineI===7,'bounded additive memory');
 const before=JSON.stringify(store.get('bran'));save.write=()=>false;
 a(!store.recordTopic('bran',{templateId:'fixture.named.bran',topicId:'fixture.harbor',choiceId:'back',tick:21,rememberChoice:true})&&JSON.stringify(store.get('bran'))===before,'memory write rollback');
 a(save.data.v===1&&save.data.met.bran===1,'save version and met preserved');
 const effectTemplate={...template,id:'fixture.effect',nodes:[{id:'ask',type:'choice',choices:[{id:'act',label:'행동',conditions:[],nextNode:'effect'}]},{id:'effect',type:'effect',action:{handlerId:'buy',argsRefs:{npc:{kind:'slot',id:'npc'}}},outcomes:{ok:'ok',fail:'fail',stale:'stale'}},...['ok','fail','stale'].map(id=>({id,type:'speak',pages:[id],next:'hub'})),{id:'hub',type:'end',mode:'topicHub'}],entryNode:'ask'};
 for(const outcome of ['ok','fail','stale']){
  let calls=0;const et={...topic,template:effectTemplate};
  const s=createTopicSession({id:'bran'},'hello',{resolve:()=>({topics:[et],services:[]}),executeEffect:(id,args)=>{calls++;a(id==='buy'&&args.npc==='bran','effect bound slot');return outcome==='ok'?{ok:true}:{ok:false,reason:outcome};}});
  s.select(0,s.revision,s.choices[0].token);a(calls===0,'topic entry has no effect');
  const rev=s.revision,token=s.choices[0].token;s.select(0,rev,token);s.select(0,rev,token);
  a(calls===1&&s.text===outcome,'effect branch and one-shot '+outcome);
 }
 const evt={...topic,eventRef:{id:'e',revision:1},facts:{amount:2}};let current=evt;
 const es=createTopicSession({id:'bran'},'hello',{resolve:()=>({topics:[current],services:[]})});
 es.select(0,es.revision,es.choices[0].token);current={...evt,eventRef:{id:'e',revision:2}};
 a(es.advance()&&es.text==='지금은 그 이야기를 계속하기 어려워요.','changed event revision abandons stale graph');
 return 'PASS: graph runner, same-session UI, stale input/service, effect outcomes, memory rollback';
}
console.log(checkGraphRunner());
