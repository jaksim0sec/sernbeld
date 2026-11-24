import {compileSkill} from '../core/skill-engine.js';
import {createSkillRunner} from '../core/skill-runner.js';
import {MAX_SKILL_ACTIONS, distributeEvenly, normalizeShares, moveSlot, orbitSlots, makeOrbitGradient} from './skill-orbit-model.js';

const DRAFT_ID='workbench-thrust';
const PREVIEW_ACTOR={stamina:10000,mana:10000,maxMana:10000,physicalControl:3,magicControl:0};
const SPEEDS=[.75,1,1.25];
const REPEATS=[1,2,3];
const ACTION_RUNE='<path d="M8 28 27 9M19 9h8v8M10 22l-3 7 7-3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
const point=(radius,angle)=>[180+radius*Math.cos(angle),180+radius*Math.sin(angle)];
const fresh=()=>({discipline:'physical',manaInjection:0,actions:[]});
const defaultAction=slot=>({action:'thrust',speed:1,repeat:1,power:1,share:100,slot});

function loadDraft(saved) {
  if(saved?.version===2 && Array.isArray(saved.config?.actions))
    return {...saved.config,actions:normalizeShares(saved.config.actions.map((action,index)=>({...action,slot:action.slot??index})).sort((a,b)=>a.slot-b.slot))};
  if(saved?.version===1 && saved.config?.baseAction==='thrust') {
    const c=saved.config;
    return {discipline:'physical',manaInjection:c.manaInjection,actions:[{action:'thrust',speed:c.speed,repeat:c.repeat,power:c.power,share:100,slot:0}]};
  }
  return fresh();
}
function buildGeometry(svg) {
  const ticks=Array.from({length:48},(_,i)=>{
    const angle=i*Math.PI/24;
    return `<path d="M${point(i%4===0?153:157,angle)}L${point(163,angle)}"/>`;
  }).join('');
  const arcs=Array.from({length:4},(_,i)=>{
    const start=i*Math.PI/2-Math.PI/2+.1;
    return `<path d="M${point(171,start)}A171 171 0 0 1 ${point(171,start+1.37)}"/>`;
  }).join('');
  svg.innerHTML=`<g class="skill-heritage-ring"><circle cx="180" cy="180" r="166"/>
    <circle cx="180" cy="180" r="149"/><circle cx="180" cy="180" r="51"/>
    ${ticks}${arcs}
    <path d="M180 34 326 180 180 326 34 180Z"/>
    <path d="M180 70 275 235 85 235Z M180 290 85 125 275 125Z"/></g>
    <circle class="skill-orbit-well" cx="180" cy="180" r="110"/><circle class="skill-orbit-guide" cx="180" cy="180" r="110"/>
    <g class="skill-orbit-direction">${Array.from({length:MAX_SKILL_ACTIONS},(_,i)=>{
      const a=-Math.PI/2+(i+.5)*Math.PI*2/MAX_SKILL_ACTIONS;
      const [x,y]=point(110,a);
      return `<path d="M${x-3} ${y-3}l6 3-6 3" transform="rotate(${a*180/Math.PI+90} ${x} ${y})"/>`;
    }).join('')}</g>`;
}
function rune() {return `<svg viewBox="0 0 36 36" aria-hidden="true">${ACTION_RUNE}</svg>`;}

export function createSkillWorkbench({library,canOpen,enter,leave}) {
  const byId=id=>document.getElementById(id);
  const panel=byId('skillWorkbench'), toolbar=byId('skillsBtn'), satellite=byId('skillSatellite');
  const stage=byId('skillStage'), main=byId('skillMain'), core=byId('skillCore');
  const diagram=byId('skillDiagram'), ring=byId('skillManaRing'), slots=byId('skillSlots');
  const mini=byId('skillOptions'), preview=byId('skillPreview'), save=byId('skillSave');
  const status=byId('skillStatus'),close=byId('skillClose');
  let config=fresh(), selected=-1, opener=null, frame=0, hold=null, drag=null, dragFinishedAt=-Infinity;
  let plan=null;
  buildGeometry(diagram);
  const runner=createSkillRunner({spend:()=>true,onStep:(_,index)=>{
    slots.querySelectorAll('.is-firing').forEach(el=>el.classList.remove('is-firing'));
    const actionIndex=plan.steps[index]?.actionIndex??0;
    const slot=config.actions[actionIndex]?.slot??0;
    slots.querySelector(`[data-slot="${slot}"]`)?.classList.add('is-firing');
    status.value=`시험 중 · ${index+1}/${plan.steps.length}회`;
  },onComplete:()=>{
    slots.querySelectorAll('.is-firing').forEach(el=>el.classList.remove('is-firing'));
    preview.disabled=false;
    preview.classList.remove('playing');
    status.value='시험 완료';
  }});

  function cancelPreview() {
    runner.cancel();cancelAnimationFrame(frame);
    preview.classList.remove('playing');
    slots.querySelectorAll('.is-firing').forEach(el=>el.classList.remove('is-firing'));
  }
  function cancelHold() {
    if(hold){clearTimeout(hold.timer);hold=null;}
    if(drag){drag.ghost.remove();slots.querySelectorAll('.is-drag-source,.is-drop-target').forEach(el=>el.classList.remove('is-drag-source','is-drop-target'));drag=null;}
  }
  function renderSlots() {
    slots.replaceChildren(...orbitSlots(config.actions).map(({index,action,empty})=>{
      const button=document.createElement('button');button.type='button';button.className='skill-slot'+(empty?' is-empty':'')+(selected===index?' is-selected':'');
      button.dataset.slot=String(index);
      const [x,y]=point(110,-Math.PI/2+index*Math.PI*2/MAX_SKILL_ACTIONS);
      button.style.left=`${x/360*100}%`;button.style.top=`${y/360*100}%`;
      button.setAttribute('aria-label',empty?`${index+1}번 행동 추가`:`${index+1}번 행동: 찌르기, ${action.share}%`);
      button.setAttribute('aria-pressed',String(selected===index && !empty));
      button.innerHTML=`<span class="skill-slot-face">${empty?'<span class="skill-slot-plus" aria-hidden="true">+</span>':rune()}</span>${empty?'':`<span class="skill-slot-share" aria-hidden="true">${action.share}%</span>`}`;
      button.addEventListener('click',()=>{
        if(performance.now()-dragFinishedAt<450)return;
        if(empty){config.actions=distributeEvenly([...config.actions,defaultAction(index)]).sort((a,b)=>a.slot-b.slot);selected=index;render();}
        else {selected=selected===index?-1:index;render();}
      });
      button.addEventListener('pointerdown',e=>startHold(e,index,button));
      button.addEventListener('pointermove',moveHold);
      button.addEventListener('pointerup',finishHold);
      button.addEventListener('pointercancel',cancelHold);
      button.addEventListener('keydown',e=>{
        if(empty||!e.altKey||!['ArrowLeft','ArrowRight'].includes(e.key))return;
        e.preventDefault();
        const target=Math.max(0,Math.min(MAX_SKILL_ACTIONS-1,index+(e.key==='ArrowRight'?1:-1)));
        config.actions=moveSlot(config.actions,index,target);selected=target;render();
      });
      return button;
    }));
  }
  function startHold(event,index,button){
    if(!config.actions.some(action=>action.slot===index)||event.button>0)return;
    cancelHold();
    hold={pointerId:event.pointerId,index,startX:event.clientX,startY:event.clientY,timer:setTimeout(()=>{
      if(!hold||hold.pointerId!==event.pointerId)return;
      const ghost=button.cloneNode(true);
      ghost.className='skill-slot skill-drag-ghost';ghost.removeAttribute('id');
      stage.append(ghost);drag={index,target:index,ghost};
      button.classList.add('is-drag-source');
      placeGhost(event.clientX,event.clientY);
    },380)};
    button.setPointerCapture?.(event.pointerId);
  }
  function placeGhost(x,y){
    if(!drag)return;
    const box=stage.getBoundingClientRect();
    drag.ghost.style.left=`${x-box.left}px`;
    drag.ghost.style.top=`${y-box.top}px`;
  }
  function moveHold(event){
    if(!hold||event.pointerId!==hold.pointerId)return;
    if(!drag && Math.hypot(event.clientX-hold.startX,event.clientY-hold.startY)>12){cancelHold();return;}
    if(!drag)return;
    event.preventDefault();placeGhost(event.clientX,event.clientY);
    let nearest=drag.index,min=Infinity;
    for(let i=0;i<MAX_SKILL_ACTIONS;i++){
      const rect=slots.querySelector(`[data-slot="${i}"]`).getBoundingClientRect();
      const distance=Math.hypot(event.clientX-(rect.left+rect.width/2),event.clientY-(rect.top+rect.height/2));
      if(distance<min){min=distance;nearest=i;}
    }
    drag.target=nearest;
    slots.querySelectorAll('.is-drop-target').forEach(el=>el.classList.remove('is-drop-target'));
    slots.querySelector(`[data-slot="${nearest}"]`)?.classList.add('is-drop-target');
  }
  function finishHold(event){
    if(!hold||event.pointerId!==hold.pointerId)return;
    if(drag){
      const {index,target}=drag;
      dragFinishedAt=performance.now();
      cancelHold();
      config.actions=moveSlot(config.actions,index,target);
      selected=target;
      render();
    }else cancelHold();
  }
  function renderMini() {
    const action=config.actions.find(item=>item.slot===selected);
    mini.hidden=!action;
    stage.classList.toggle('is-inspecting',Boolean(action));
    if(!action)return;
    mini.innerHTML=`<svg class="skill-mini-lines" viewBox="0 0 240 240" aria-hidden="true"><circle class="skill-mini-guide" cx="120" cy="120" r="104"/><circle class="skill-mini-center-ring" cx="120" cy="120" r="53"/><path class="skill-mini-speed-track" d="M30 68 A104 104 0 0 1 210 68"/><path class="skill-mini-repeat-track" d="M210 172 A104 104 0 0 1 30 172"/></svg>
      <span class="skill-mini-group-label skill-mini-group-label-speed">속도</span><span class="skill-mini-group-label skill-mini-group-label-repeat">반복</span>
      <div class="skill-mini-center">${rune()}<strong>찌르기</strong><small>마력 ${action.share}%</small><small class="skill-mini-summary">×${action.speed} · ${action.repeat}회</small></div>
      <button type="button" class="skill-mini-remove" aria-label="선택한 행동 삭제" title="선택한 행동 삭제"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5h12M8 5V3h4v2M6 6l.6 10h6.8L14 6M9 8v6M11 8v6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg><span>삭제</span></button>`;
    const controls=[...SPEEDS.map((value,i)=>({type:'speed',value,angle:-150+i*60})),...REPEATS.map((value,i)=>({type:'repeat',value,angle:30+i*60}))];
    controls.forEach(({type,value,angle})=>{
      const b=document.createElement('button');b.type='button';
      b.className='skill-mini-choice'+(action[type]===value?' is-active':'');
      const a=angle*Math.PI/180;
      b.style.left=`${50+42*Math.cos(a)}%`;b.style.top=`${50+42*Math.sin(a)}%`;
      b.setAttribute('aria-label',type==='speed'?`속도 ${value}배`:`${value}회 반복`);
      b.setAttribute('aria-pressed',String(action[type]===value));
      b.innerHTML=type==='speed'?`<span class="mini-glyph mini-speed">×${value}</span>`:
        `<span class="mini-glyph mini-repeat">${value}회</span>`;
      b.addEventListener('click',()=>{
        config.actions=config.actions.map(item=>item.slot===selected?{...item,[type]:value}:item);render();
      });
      mini.append(b);
    });
    mini.querySelector('.skill-mini-remove').addEventListener('click',()=>{
      config.actions=normalizeShares(config.actions.filter(item=>item.slot!==selected));
      selected=-1;render();
    });
  }
  function render() {
    cancelPreview();
    plan=config.actions.length?compileSkill(config,PREVIEW_ACTOR):null;
    const manaGradient=makeOrbitGradient(config.actions);
    ring.style.setProperty('--skill-mana-gradient',manaGradient);
    const count=config.actions.length;
    core.querySelector('.skill-core-name').textContent=count?`찌르기 · ${count}동작`:'새 기술';
    core.querySelector('.skill-core-total').textContent=`마나 ${config.manaInjection}`;
    core.querySelector('.skill-core-signature').innerHTML=count?
      `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" opacity=".45"/>${Array.from({length:count},(_,i)=>{const a=-Math.PI/2+i*2*Math.PI/count;const[x,y]=[32+22*Math.cos(a),32+22*Math.sin(a)];return `<circle cx="${x}" cy="${y}" r="3.4" fill="currentColor"/>`;}).join('')}</svg>`:
      '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 15v34M15 32h34" stroke="currentColor" stroke-width="1.6" opacity=".65"/></svg>';
    if(!config.actions.some(a=>a.slot===selected))selected=-1;
    renderSlots();renderMini();
    preview.disabled=save.disabled=!count;
    save.classList.remove('saved','save-error');
    status.value=count?`${count}개 행동 · 총 마나 ${config.manaInjection}`:'행동을 추가할 수 있어';
  }
  function updateSatellite(){
    const record=library.get(DRAFT_ID);
    satellite.textContent=record?'◇':'+';
    satellite.classList.toggle('has-skill',Boolean(record));
    satellite.setAttribute('aria-label',record?'저장한 기술 열기':'기술 만들기');
  }
  function open(event){
    if(!panel.hidden||!canOpen())return;
    opener=event?.currentTarget??toolbar;
    config=loadDraft(library.get(DRAFT_ID));selected=-1;
    enter();panel.hidden=false;document.body.classList.add('skill-editing');
    render();
    (slots.querySelector('.skill-slot')||close).focus({preventScroll:true});
  }
  function dismiss(){
    if(panel.hidden)return;
    cancelHold();cancelPreview();panel.hidden=true;
    document.body.classList.remove('skill-editing');leave();
    opener?.focus({preventScroll:true});
  }
  toolbar.hidden=satellite.hidden=false;updateSatellite();
  toolbar.addEventListener('click',open);satellite.addEventListener('click',open);
  close.addEventListener('click',dismiss);
  save.addEventListener('click',()=>{
    if(!config.actions.length)return;
    try{
      library.put({id:DRAFT_ID,name:'찌르기 기술',discipline:'physical',version:2,config});
      updateSatellite();save.classList.add('saved');status.value='기술을 저장했어';
    }catch{save.classList.add('save-error');status.value='기술을 저장할 수 없어';}
  });
  preview.addEventListener('click',()=>{
    if(!plan||runner.isActive())return;
    cancelPreview();runner.start(plan);
    preview.disabled=true;preview.classList.add('playing');status.value='시험 시작';
    let previous=performance.now();
    const advance=now=>{
      runner.advance(Math.max(0,now-previous)/1000);previous=now;
      if(runner.isActive())frame=requestAnimationFrame(advance);
    };
    frame=requestAnimationFrame(advance);
  });
  return {isOpen:()=>!panel.hidden,open,dismiss};
}
