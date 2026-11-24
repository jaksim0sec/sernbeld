import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const dir=new URL('../assets/models/clothing/shirt-v1/',import.meta.url);
const read=p=>readFileSync(new URL(p,dir),'utf8');
const hash=b=>createHash('sha256').update(b).digest('hex');
export const manifest=JSON.parse(read('manifest.json'));
export function loadShirtReference(sex){
 const info=manifest.bodies[sex];if(!info)throw Error('Unknown shirt preset: '+sex);
 const readPart=p=>read(sex+'/'+p);
 const p=Buffer.from(readPart('positions.f32.b64'),'base64'),f=Buffer.from(readPart('indices.u16.b64'),'base64');
 const rig=info.rigParts.map(readPart).join(''),body=info.bodyParts.map(readPart).join('');
 for(const [data,expected] of [[p,info.positionSha256],[f,info.indexSha256],[rig,info.rigSha256],[body,info.bodySha256]])if(hash(data)!==expected)throw Error('Shirt reference hash mismatch: '+sex);
 if(p.length!==info.vertices*12||f.length!==info.triangles*6)throw Error('Shirt buffer length mismatch: '+sex);
 const v=Array.from({length:p.length/4},(_,i)=>p.readFloatLE(i*4)),ix=Array.from({length:f.length/2},(_,i)=>f.readUInt16LE(i*2));
 if(v.some(x=>!Number.isFinite(x))||ix.some(i=>i>=info.vertices))throw Error('Invalid shirt buffer: '+sex);
 return {shirt:{v,f:ix,...JSON.parse(readPart('meta.json'))},rig,body};
}
export function exportReference(){
 let template=read('reference-template.html');
 for(const sex of Object.keys(manifest.bodies)){
  const {shirt,rig,body}=loadShirtReference(sex);
  for(const [key,value] of [['SHIRT',JSON.stringify(shirt)],['RIG',rig],['DATA',body]]){
   const token='__SHIRT_'+key+'_'+sex.toUpperCase()+'__';
   if(template.split(token).length!==2)throw Error('Invalid reference token: '+token);
   template=template.replace(token,()=>value);
  }
 }
 return template;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const out=process.argv[2]??'SERNBELD_shirt_reference.html';writeFileSync(out,exportReference());console.log(out);
}
