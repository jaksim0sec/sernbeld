import {buildCollar} from './collar.js';

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
 function release(slot){
  const old=equipped.get(slot);if(!old)return false;
  equipped.delete(slot);old.instance.object.removeFromParent();old.instance.dispose();return true;
 }
 return {
  equip(id){
   if(disposed)throw Error('Clothing controller disposed');
   const entry=getClothing(id);if(!entry)throw Error('Unknown clothing: '+id);
   const old=equipped.get(entry.slot);
   if(old?.entry.id===id)return old.instance.object;
   const instance=entry.build(T,actor,fullIndex);
   if(!instance?.object?.isObject3D||typeof instance.dispose!=='function'){instance?.dispose?.();throw Error('Invalid clothing instance: '+id);}
   instance.object.visible=!firstPerson;
   actor.model.add(instance.object);
   release(entry.slot);equipped.set(entry.slot,{entry,instance});
   return instance.object;
  },
  unequip(slot){return release(slot);},
  getEquipped(slot){return equipped.get(slot)?.entry.id??null;},
  snapshot(){return Object.fromEntries([...equipped].map(([slot,v])=>[slot,v.entry.id]));},
  setFirstPerson(on){firstPerson=Boolean(on);for(const {instance} of equipped.values())instance.object.visible=!firstPerson;},
  dispose(){if(disposed)return;disposed=true;for(const slot of [...equipped.keys()])release(slot);}
 };
}

registerClothing({id:'collar.basic',slot:CLOTHING_SLOTS.COLLAR,name:'기본 카라',build:buildCollar});

 // Data-only assets are discoverable separately from equippable definitions.
const referenceAssets=new Map();
export function registerClothingAsset(def){
 if(!def||typeof def.id!=='string'||!def.id||!Object.values(slots).includes(def.slot)||typeof def.manifest!=='string'||def.status!=='reference-only')throw Error('Invalid clothing asset');
 if(referenceAssets.has(def.id)||definitions.has(def.id))throw Error('Duplicate clothing asset: '+def.id);
 const entry=Object.freeze({...def});referenceAssets.set(entry.id,entry);return entry;
}
export function getClothingAsset(id){return referenceAssets.get(id)??null;}
export function listClothingAssets(slot){if(slot!==undefined&&!Object.values(slots).includes(slot))throw Error('Unknown clothing slot: '+slot);return [...referenceAssets.values()].filter(d=>slot===undefined||d.slot===slot);}
registerClothingAsset({id:'top.basic-shirt',slot:CLOTHING_SLOTS.TOP,name:'기본 긴소매 셔츠',status:'reference-only',manifest:'assets/models/clothing/shirt-v1/manifest.json'});
