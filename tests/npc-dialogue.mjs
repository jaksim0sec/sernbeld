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
  const ids=new Map(['speech','speechName','speechTitle','speechLine','speechOpts','speechDismiss','speechNext'].map(k=>[k,new Node()]));
  const get=k=>ids.get(k);
  const fakeDoc={createElement:tag=>new Node(tag),createElementNS:(_,tag)=>new Node(tag)};
  let scheduled=0;
  const uiSrc=source.slice(source.indexOf('var GameUI = class {'),source.indexOf('var CLOCK_RATE ='));
  const UI=Function('$2','el','document','IS_MOBILE','iconURL','setTimeout','clearTimeout','createDialogueSession',uiSrc+'\nreturn GameUI;')(get,(tag,cls)=>Object.assign(new Node(tag),{className:cls}),fakeDoc,false,id=>'image:'+id,()=>{scheduled++;},()=>{},createDialogueSession);
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
  check(get('speechOpts').children.length===1,'choice rendered');
  const old=get('speechOpts').children[0];
  old.click();old.click();
  check(actions===1&&get('speechLine').textContent==='완료'&&!get('speech').hidden,'choice acts once and follow-up stays open');
  ui.closeSpeech();
  check(get('speech').hidden&&ui.activeSpeaker===null,'explicit close releases session');

  ui.say({id:'bran',name:'브란'},['첫 줄','둘째 줄'],[{id:'confirm',label:'확인',act:()=>{actions++;}}]);
  check(get('speechLine').textContent==='첫 줄','first page displayed');
  check(!get('speechNext').hidden&&get('speechOpts').children.length===0,'no premature response');
  get('speechNext').click();
  check(get('speechLine').textContent==='둘째 줄'&&get('speechNext').hidden,'explicit progression');
  check(get('speechOpts').children.length===1,'choices only at final page');
  const last=get('speechOpts').children[0];last.click();last.click();
  check(actions===2&&get('speech').hidden,'final choice executes once');
  ui.say({id:'bran',name:'브란'},['다음 줄','종료'],[]);
  ui.closeSpeech();get('speechNext').click();
  check(get('speech').hidden&&ui.activeSpeaker===null,'close invalidates page progression');
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
import {createNpcStateStore,selectNpcLine,npcLinePool,runNpcAction,createDialogueSession} from '../src/core/npc-dialogue.js';
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
