function checkDialogue(source,html,css) {
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
  const ids=new Map(['speech','speechName','speechTitle','speechLine','speechOpts','speechDismiss'].map(k=>[k,new Node()]));
  const get=k=>ids.get(k);
  const fakeDoc={createElement:tag=>new Node(tag),createElementNS:(_,tag)=>new Node(tag)};
  let scheduled=0;
  const uiSrc=source.slice(source.indexOf('var GameUI = class {'),source.indexOf('var CLOCK_RATE ='));
  const UI=Function('$2','el','document','IS_MOBILE','iconURL','setTimeout','clearTimeout',uiSrc+'\nreturn GameUI;')(get,(tag,cls)=>Object.assign(new Node(tag),{className:cls}),fakeDoc,false,id=>'image:'+id,()=>{scheduled++;},()=>{});
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
  const folkSrc=source.slice(source.indexOf('var Townsfolk = class {'),source.indexOf('var turn ='));
  const Folk=Function(folkSrc+'\nreturn Townsfolk;')();
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
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
console.log(checkDialogue(read('src/gameplay/gameplay.part.js'),read('index.html'),read('styles/menus-and-overlays.css')));
