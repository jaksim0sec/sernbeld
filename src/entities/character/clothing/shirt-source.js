// Compact pre-baked reference shirt. Shared CPU asset; no per-NPC downloads.
const root=new URL('../../../../assets/models/clothing/shirt-v1/',import.meta.url);
function decompressBlock(src,size){
 if(!Number.isSafeInteger(size)||size<1||size>8*1024*1024)throw Error('Invalid shirt runtime size');
 const out=new Uint8Array(size);let i=0,o=0;
 function count(n){if(n===15){let v;do{if(i>=src.length)throw Error('Truncated shirt block');v=src[i++];n+=v;}while(v===255);}return n;}
 while(i<src.length){const token=src[i++],lit=count(token>>>4);if(i+lit>src.length||o+lit>size)throw Error('Bad shirt literal');out.set(src.subarray(i,i+lit),o);i+=lit;o+=lit;if(i===src.length)break;
  if(i+2>src.length)throw Error('Bad shirt offset');const dist=src[i++]|src[i++]<<8,len=count(token&15)+4;if(!dist||dist>o||o+len>size)throw Error('Bad shirt match');for(let k=0;k<len;k++){out[o]=out[o-dist];o++;}
 }
 if(o!==size)throw Error('Bad shirt decoded size');return out;
}
export function decodeShirtRuntime(meta,encoded){
 const n=meta.vertices,tri=meta.triangles;
 if(meta.version!==1||!Number.isInteger(n)||n<1||n>65535||!Number.isInteger(tri)||tri<1||meta.sections?.length!==10)throw Error('Invalid shirt metadata');
 const bin=atob(encoded.trim()),packed=Uint8Array.from(bin,c=>c.charCodeAt(0));
 if(packed.length!==meta.packedBytes)throw Error('Shirt packed size mismatch');
 const raw=decompressBlock(packed,meta.rawBytes),types=[Float32Array,Float32Array,Uint8Array,Float32Array,Uint8Array,Uint16Array,Int16Array,Int16Array,Int16Array,Int16Array],sizes=[n*3,n*3,n*3,n*4,n*4,tri*3,n*3,n*3,n*3,n*3];
 let end=0;
 const arrays=types.map((Type,i)=>{const {offset,length}=meta.sections[i],bytes=length*Type.BYTES_PER_ELEMENT;if(!Number.isInteger(offset)||offset<end||offset%Type.BYTES_PER_ELEMENT||length!==sizes[i]||offset+bytes>raw.length)throw Error('Invalid shirt section '+i);end=offset+bytes;return new Type(raw.buffer,offset,length);});
 const [position,normal,color,detail,influence,index,...corrections]=arrays;
 if(index.some(i=>i>=n)||position.some(v=>!Number.isFinite(v))||normal.some(v=>!Number.isFinite(v))||detail.some(v=>!Number.isFinite(v)))throw Error('Invalid shirt geometry');
 for(let i=0;i<n;i++)if(influence[i*4+2]>1||influence[i*4+3]>3)throw Error('Invalid shirt influence');
 return Object.freeze({meta,position,normal,color,detail,influence,index,corrections});
}
export async function loadShirtRuntime(sex,fetchImpl=fetch){
 if(sex!=='male'&&sex!=='female')throw Error('Unknown shirt body: '+sex);
 const read=async path=>{const r=await fetchImpl(new URL(sex+'/'+path,root));if(!r.ok)throw Error('셔츠 데이터를 불러오지 못했어 ('+r.status+')');return r.text();};
 const meta=JSON.parse(await read('runtime.json'));
 if(!Array.isArray(meta.parts)||!meta.parts.length||meta.parts.length>20||meta.parts.some((s,i)=>s!=='runtime.'+String(i).padStart(2,'0')+'.part'))throw Error('Invalid shirt parts');
 return decodeShirtRuntime(meta,(await Promise.all(meta.parts.map(read))).join(''));
}
let pending;
export function loadDefaultShirts(fetchImpl){
 const load=()=>Promise.all(['male','female'].map(async sex=>[sex,await loadShirtRuntime(sex,fetchImpl??fetch)])).then(Object.fromEntries);
 if(fetchImpl)return load();
 return pending??=load().catch(error=>{pending=null;throw error;});
}
