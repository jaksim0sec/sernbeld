import {acquireGarmentBinding} from './garment-binding.js';

// The shirt's authored rig supplies semantic constraints; no clothing-specific
// branching is needed inside the generic binder. Other garments can supply
// different groups (e.g. thighs/shins, feet, head) and rigid zones.
const torso=['pelvis','waist','ribcage','neck'];
const chain=side=>['upper_arm_'+side,'forearm_'+side];
const armGroups=['right','left'].map(side=>[...chain(side),'hand_'+side,...['thumb','index','middle','ring','pinky'].flatMap(f=>[0,1,2,3].map(i=>f+'_'+side+'_'+i))]);
function channels(asset,i){const k=i*4;return {side:asset.influence[k+2],shoulder:asset.influence[k]/255,elbow:asset.influence[k+1]/255,kind:asset.influence[k+3]};}
function smooth(a,b,x){const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);}
export const SHIRT_BINDING_POLICY=Object.freeze({
 bakeId:'shirt-v1',
 regions:armGroups,
 guide(i,asset){const c=channels(asset,i);return {region:c.side,amount:c.kind<2?c.shoulder:0};},
 constrain(i,asset,weights,bones){
  const c=channels(asset,i),side=c.side?'left':'right',upper=bones.get('upper_arm_'+side),lower=bones.get('forearm_'+side);
  const ids=torso.map(n=>bones.get(n)).filter(v=>v!==undefined);
  // Keep torso/collar/button weights on the torso chain. Sleeve weights follow
  // authored shoulder/elbow channels; neither hands nor the opposite arm can
  // pull the same connected garment panel. The cuff is an exact rigid anchor.
  const tw=ids.map(id=>Math.max(0,weights[id])),sum=tw.reduce((a,b)=>a+b,0);
  let arm=c.kind<2?c.shoulder:0;
  if(c.kind===1&&c.elbow>.97)arm=1;
  const elbow=c.kind===1?smooth(.04,.97,c.elbow):0;
  weights.fill(0);
  for(let k=0;k<ids.length;k++)weights[ids[k]]=sum>1e-8?(1-arm)*tw[k]/sum:0;
  if(sum<=1e-8)weights[bones.get('ribcage')]=1-arm;
  weights[upper]=arm*(1-elbow);weights[lower]=arm*elbow;
  return c.kind===1&&c.elbow>.97;
 },
 fit(i,asset){return channels(asset,i).kind<2;},
 smoothing:10,
 gradientLimit:16,
 maxInfluences:8,
 attributes:asset=>[['aRest',asset.position,3,false],['aColor',asset.color,3,true],['aDetail',asset.detail,4,false],['aInfluence',asset.influence,4,false]],
 parts:[
  {id:'top',accept:(a,b,c,asset)=>[a,b,c].every(i=>asset.influence[i*4+3]!==2),coverage:(a,b,c,asset)=>Math.max(a,b,c)<asset.meta.shirtVertices,firstPersonCoverage:(a,b,c,asset)=>Math.max(a,b,c)<asset.meta.shirtVertices&&[a,b,c].every(i=>asset.influence[i*4+3]===1||asset.influence[i*4]>=128)},
  {id:'collar',accept:(a,b,c,asset)=>[a,b,c].every(i=>asset.influence[i*4+3]===2)}
 ]
});
export function acquireShirtBinding(T,actor,asset,fullIndex){return acquireGarmentBinding(T,actor,asset,SHIRT_BINDING_POLICY,fullIndex);}
