// Body data and gameplay clothing have separate lifetimes. The character
// editor needs only the body, not the two sets of runtime garment sidecars.
import {loadDefaultShirts} from './clothing/shirt-source.js';
import {loadDefaultPants} from './clothing/pants-source.js';
let bodyPending,pending,bakePending;
export function loadStudioBody(){
 return bodyPending??=fetch(new URL('../../../assets/models/characters/studio-v1.json.gz',import.meta.url)).then(async r=>{
  if(!r.ok)throw Error('캐릭터 데이터를 불러오지 못했어 ('+r.status+')');
  return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();
 }).catch(error=>{bodyPending=null;throw error;});
}
export function loadGarmentBakes(fetchImpl=fetch){
 return bakePending??=fetchImpl(new URL('../../../assets/models/clothing/runtime-bindings-v1.json.gz',import.meta.url)).then(async r=>{
  if(!r.ok)throw Error('Garment binding HTTP '+r.status);
  const data=await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();
  if(data.version!==2||!data.bodies?.male||!data.bodies?.female||!data.layers?.male||!data.layers?.female)throw Error('Invalid garment bindings');
  return data;
 }).catch(error=>{console.warn('Prebaked clothing unavailable; shared runtime fallback',error);bakePending=null;return null;});
}
export function loadStudioSource(){
 return pending??=Promise.all([loadStudioBody(),loadDefaultShirts(),loadDefaultPants(),loadGarmentBakes()]).then(([body,shirts,pants,bakes])=>{
  const source={...body};Object.defineProperties(source,{defaultShirts:{value:shirts},defaultPants:{value:pants},garmentBakes:{value:bakes?.bodies},garmentLayers:{value:bakes?.layers}});return source;
 }).catch(error=>{pending=null;throw error;});
}
// Optional reduced triangle lists for the game runtime (tools/optimize-characters.mjs).
// The creator keeps the full mesh; a missing sidecar falls back to runtime clustering.
let pendingLod;
export function loadStudioLod(){
 return pendingLod??=fetch(new URL('../../../assets/models/characters/studio-v1.lod.json.gz',import.meta.url)).then(async r=>{
  if(!r.ok)return null;
  const lod=await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();
  return lod?.version===1?lod:null;
 }).catch(()=>null);
}
