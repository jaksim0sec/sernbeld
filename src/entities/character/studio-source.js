// A single shared, locally served asset. No external model host or manual GLB import.
let pending;
export function loadStudioSource(){
 return pending??=fetch(new URL('../../../assets/models/characters/studio-v1.json.gz',import.meta.url)).then(async r=>{
  if(!r.ok)throw Error('캐릭터 데이터를 불러오지 못했어 ('+r.status+')');
  return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();
 });
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
