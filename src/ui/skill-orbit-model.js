// Shared geometry and relative mana distribution for the skill assembly orbit.
// Three slots are the CURRENT engine-supported cap, not a permanent progression rule.
import {MAX_PHYSICAL_ACTIONS} from '../core/skill-engine.js';
export const MAX_SKILL_ACTIONS = MAX_PHYSICAL_ACTIONS;

function allocate(weights, total) {
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  const ratios = weights.map(weight => sum > 0 ? weight / sum : 1 / weights.length);
  const fractions = ratios.map(value => value * total);
  const result = fractions.map(Math.floor);
  let remainder = total - result.reduce((acc, value) => acc + value, 0);
  const priority = fractions.map((value,index)=>({index,fraction:value-result[index]}))
    .sort((a,b)=>b.fraction-a.fraction || a.index-b.index);
  for (let i=0;i<remainder;i++) result[priority[i].index]++;
  return result;
}

export function distributeEvenly(actions) {
  if (!actions.length) return [];
  const shares = allocate(actions.map(()=>1),100);
  return actions.map((action,index)=>({...action,share:shares[index]}));
}
export function normalizeShares(actions) {
  if (!actions.length) return [];
  const shares = allocate(actions.map(action=>Math.max(0,Number(action.share)||0)),100);
  return actions.map((action,index)=>({...action,share:shares[index]}));
}
export function rebalanceShare(actions,index,requested) {
  if (!actions.length || index<0 || index>=actions.length) return actions.map(action=>({...action}));
  if (actions.length === 1) return [{...actions[0],share:100}];
  const target = Math.max(0,Math.min(100,Math.round(Number(requested)||0)));
  const otherIndices=actions.map((_,i)=>i).filter(i=>i!==index);
  const allocated=allocate(otherIndices.map(i=>Math.max(0,Number(actions[i].share)||0)),100-target);
  const result=actions.map(action=>({...action}));
  result[index].share=target;
  otherIndices.forEach((i,k)=>{result[i].share=allocated[k]});
  return result;
}
export function moveAction(actions,from,to) {
  if (from<0 || from>=actions.length || to<0 || to>=MAX_SKILL_ACTIONS) return actions.slice();
  const result=actions.slice();
  const [item]=result.splice(from,1);
  result.splice(Math.min(to,result.length),0,item);
  return result;
}
export function orbitSlots(actions,capacity=MAX_SKILL_ACTIONS) {
  return Array.from({length:capacity},(_,index)=>{
    const action=actions.find(item=>item.slot===index) || null;
    return {index,action,empty:!action};
  });
}
export function moveSlot(actions,from,to) {
  const moved=actions.find(action=>action.slot===from);
  if (!moved || to<0 || to>=MAX_SKILL_ACTIONS) return actions.map(a=>({...a}));
  return actions.map(action=>{
    if(action.slot===from)return {...action,slot:to};
    if(from<to && action.slot>from && action.slot<=to)return {...action,slot:action.slot-1};
    if(to<from && action.slot>=to && action.slot<from)return {...action,slot:action.slot+1};
    return {...action};
  }).sort((a,b)=>a.slot-b.slot);
}
export function makeOrbitGradient(actions,capacity=MAX_SKILL_ACTIONS) {
  const values=Array.from({length:capacity},(_,i)=>Math.max(0,actions.find(action=>action.slot===i)?.share||0));
  const stops=[];
  const count=72;
  for(let i=0;i<=count;i++) {
    const offset=i%count/count*capacity;
    const index=Math.floor(offset)%capacity;
    const next=(index+1)%capacity;
    const fraction=offset-Math.floor(offset);
    const smooth=fraction*fraction*(3-2*fraction);
    const share=values[index]*(1-smooth)+values[next]*smooth;
    const alpha=(0.15+0.40*Math.sqrt(share/100)).toFixed(3);
    stops.push('rgba(113,238,238,'+alpha+') '+(i/count*100).toFixed(3)+'%');
  }
  return 'conic-gradient('+stops.join(',')+')';
}
