import {buildCollar} from './collar.js';
import {buildShirt,buildShirtCollar} from './shirt.js';

// One independently equipped item per slot. Existing character bodies and appearance remain untouched.
export const CLOTHING_SLOTS=Object.freeze({
  "COLLAR": "collar",
  "TOP": "top",
  "VEST": "vest",
  "PANTS": "pants",
  "SHOES": "shoes",
  "HAT": "hat"
});
const slots=CLOTHING_SLOTS;
const definitions=new Map();

export function registerClothing(def){
 if(!def||typeof def.id!=='string'||!def.id||!Object.values(slots).includes(def.slot)||typeof def.build!=='function')throw Error('Invalid clothing definition');
 if(definitions.has(def.id))throw Error('Duplicate clothing id: '+def.id);
 const entry=Object.freeze({...def});definitions.set(entry.id,entry);return entry;
}

export function getClothing(id){return definitions.get(id)??null;}

export function listClothing(slot){if(slot!==undefined&&!Object.values(slots).includes(slot))throw Error('Unknown clothing slot: '+slot);return [...definitions.values()].filter(d=>slot===undefined||d.slot===slot);}

export function createClothingController(T,actor,fullIndex){
 const equipped=new Map();let firstPerson=false,disposed=false;
 const coverage=new Uint8Array(actor.mesh.geometry.attributes.position.count);
 function syncVisibility(){
  for(const {instance} of equipped.values()){
   if(instance.setFirstPerson)instance.setFirstPerson(firstPerson);else instance.object.visible=!firstPerson;
  }
 }
 function syncCoverage(){
  coverage.fill(0);
  for(const {instance} of equipped.values()){
   if(firstPerson&&!instance.object.visible)continue;
   const mask=firstPerson?(instance.firstPersonCoverage??instance.bodyCoverage):instance.bodyCoverage;
   if(!mask)continue;
   for(let i=0,n=Math.min(mask.length,coverage.length);i<n;i++)coverage[i]=Math.max(coverage[i],mask[i]);
  }
  actor.setClothingCoverage?.(coverage);
 }
 function release(slot){
  const old=equipped.get(slot);if(!old)return false;
  equipped.delete(slot);old.instance.object.removeFromParent();old.instance.dispose();return true;
 }
 function equip(id){
  if(disposed)throw Error('Clothing controller disposed');
  const entry=getClothing(id);if(!entry)throw Error('Unknown clothing: '+id);
  const old=equipped.get(entry.slot);if(old?.entry.id===id)return old.instance.object;
  const instance=entry.build(T,actor,fullIndex);
  if(!instance?.object?.isObject3D||typeof instance.dispose!=='function'||(instance.bodyCoverage&&!(instance.bodyCoverage instanceof Uint8Array))){instance?.dispose?.();throw Error('Invalid clothing instance: '+id);}
  actor.model.add(instance.object);
  release(entry.slot);equipped.set(entry.slot,{entry,instance});syncVisibility();syncCoverage();
  return instance.object;
 }
 return {
  equip,
  equipDefaults(){for(const entry of definitions.values())if(entry.defaultWhen?.(actor)&&!equipped.has(entry.slot))equip(entry.id);},
  unequip(slot){if(!release(slot))return false;syncVisibility();syncCoverage();return true;},
  getEquipped(slot){return equipped.get(slot)?.entry.id??null;},
  snapshot(){return Object.fromEntries([...equipped].map(([slot,v])=>[slot,v.entry.id]));},
  setFirstPerson(on){on=Boolean(on);if(firstPerson===on)return;firstPerson=on;syncVisibility();syncCoverage();},
  dispose(){if(disposed)return;disposed=true;for(const slot of [...equipped.keys()])release(slot);syncCoverage();}
 };
}
// The default collar uses the approved shirt's exact authored collar surface,
// not a second independently overlapping collar. Legacy standalone fitting
// remains available when the shirt asset is absent.
registerClothing({id:'collar.basic',slot:CLOTHING_SLOTS.COLLAR,name:'기본 카라',defaultWhen:actor=>Boolean(actor.shirtAsset),build:(T,actor,fullIndex)=>actor.shirtAsset?buildShirtCollar(T,actor,fullIndex):buildCollar(T,actor,fullIndex)});

 // Source assets remain separately discoverable, including runtime-ready items.
const referenceAssets=new Map();
export function registerClothingAsset(def){
 if(!def||typeof def.id!=='string'||!def.id||!Object.values(slots).includes(def.slot)||typeof def.manifest!=='string'||!['reference-only','runtime'].includes(def.status))throw Error('Invalid clothing asset');
 if(referenceAssets.has(def.id)||definitions.has(def.id))throw Error('Duplicate clothing asset: '+def.id);
 const entry=Object.freeze({...def});referenceAssets.set(entry.id,entry);return entry;
}
export function getClothingAsset(id){return referenceAssets.get(id)??null;}
export function listClothingAssets(slot){if(slot!==undefined&&!Object.values(slots).includes(slot))throw Error('Unknown clothing slot: '+slot);return [...referenceAssets.values()].filter(d=>slot===undefined||d.slot===slot);}
registerClothingAsset({id:'top.basic-shirt',slot:CLOTHING_SLOTS.TOP,name:'기본 긴소매 셔츠',status:'runtime',manifest:'assets/models/clothing/shirt-v1/manifest.json'});
registerClothing({id:'top.basic-shirt',slot:CLOTHING_SLOTS.TOP,name:'기본 긴소매 셔츠',defaultWhen:actor=>Boolean(actor.shirtAsset),build:buildShirt});
