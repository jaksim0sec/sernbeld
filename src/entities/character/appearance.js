import { REFERENCE_EYES } from './reference-eyes.js';

// Stable character appearance contracts shared by the studio import and NPC runtime.
// Do not infer a character's gender from their occupation: assigned cast metadata wins.
export const FACE_KEYS = Object.freeze([
 'headWidth','headHeight','skull','forehead','foreheadHeight','temple',
 'brow','socket','eyeHeight','eyeGap','eyeSpan','eyeTilt','under',
 'zygoma','cheek','cheekLift','bridge','bridgeW','tip','noseY','wing',
 'mouthY','mouthZ','mouthW','philtrum','jawWidth','jawY','chinY','chinZ','chinWidth'
]);
export const PALETTES = Object.freeze({
 porcelain:[0.988,0.888,0.838],peach:[0.988,0.847,0.769],
 ivory:[0.969,0.856,0.762],warm:[0.944,0.774,0.641],
 tan:[0.752,0.571,0.441],deep:[0.608,0.442,0.355]
});
const EYES=['neutral','wide','narrow','round','almond','sleepy','sharp','droop','closed','smiling',...Object.keys(REFERENCE_EYES)];
const BROWS=['soft','straight','angled','thick','thin','worried','raised','short'];
const MOUTHS=['closed','smile','parted','frown','smirk','cat','small','surprised','grin'];
const GLASSES=['none','round','square','biground'];
const MUSTACHES=['none','classic','box','pencil'];
const BLUSHES=['none','natural','peach','rose'];
const NAMED=Object.freeze({
 bran:'male',sera:'female',goram:'male',miel:'female',tino:'male',iva:'female'
});
const RESIDENT_NAMES=Object.freeze({
 '오렌':'male','하나':'female','피트':'male','루사':'female','벨':'female',
 '마르코':'male','비비':'female','사샤':'female','토마':'male','에린':'female',
 '노아':'male','카이':'male','렌':'male','유리':'female','도린':'male',
 '페이':'female','실라':'female','보르':'male'
});
function hash(text) {
 let n=2166136261;
 for(let i=0;i<text.length;i++){n=Math.imul(n ^ text.charCodeAt(i),16777619);}
 return n>>>0;
}
function random32(seed){let n=seed>>>0;return ()=>{n=(n+0x6D2B79F5)|0;let t=Math.imul(n^(n>>>15),1|n);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};}
export function normalizeStudioCharacter(data={}) {
 const source=data?.character ?? data;
 if(!source || typeof source!=='object') throw new Error('Invalid character settings');
 const body=source.body==='female'?'female':'male';
 const values=Array.isArray(source.values)&&source.values.length===FACE_KEYS.length?
  source.values.map(v=>Number.isFinite(v)?Math.max(-1,Math.min(1,v)):0):
  FACE_KEYS.map(()=>0);
 const pick=(key,allowed,defaultValue)=>allowed.includes(source[key])?source[key]:defaultValue;
 return {
  body,eye:pick('eye',EYES,'neutral'),brow:pick('brow',BROWS,'soft'),
  mouth:pick('mouth',MOUTHS,'smile'),skin:pick('skin',Object.keys(PALETTES),'peach'),
  iris:/^#[0-9a-f]{6}$/i.test(source.iris||'')?source.iris:'#775e64',
  glasses:pick('glasses',GLASSES,'none'),
  moustache:pick('moustache',MUSTACHES,'none'),blush:pick('blush',BLUSHES,'none'),
  values,pose:source.pose&&typeof source.pose==='object'?source.pose:{}
 };
}
export function resolveNpcAppearance(def) {
 const id=String(def.id??''),name=String(def.name??''),title=String(def.title??'');
 const key=id+'|'+name+'|'+title;
 const seed=hash(key),rnd=random32(seed);
 const gender=def.gender==='male'||def.gender==='female'?def.gender:
  NAMED[id]??RESIDENT_NAMES[name]??(rnd()<.5?'female':'male');
 // Appearance is stable across sessions. Role/title influences the seed, never imposes a gender.
 const values=FACE_KEYS.map((_,i)=>Math.round((rnd()*2-1)*((i===27||i===25)?0.48:0.65)*100)/100);
 const skin=Object.keys(PALETTES)[Math.floor(rnd()*6)];
 const eyes=EYES[Math.floor(rnd()*8)],brow=BROWS[Math.floor(rnd()*BROWS.length)];
 return {
  id,name,title,gender,
  character:normalizeStudioCharacter({
   body:gender,eye:eyes,brow,mouth:MOUTHS[Math.floor(rnd()*6)],skin,
   iris:['#69554d','#9e71a4','#5d8571','#645f75'][Math.floor(rnd()*4)],
   glasses:rnd()<.13?GLASSES[1+Math.floor(rnd()*3)]:'none',
   moustache:gender==='male'&&rnd()<.08?'pencil':'none',
   blush:rnd()<.25?'natural':'none',values,pose:{}
  })
 };
}
export function npcHeadScale(profile) {
 const v=profile?.character?.values??[];
 const get=key=>v[FACE_KEYS.indexOf(key)]||0;
 return [1+.075*get('headWidth')+.04*get('jawWidth'),
         1+.055*get('headHeight')+.04*get('chinY'),
         1+.05*get('skull')+.03*get('tip')];
}
