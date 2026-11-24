import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {definitions,buildGlb,inspectGlb} from './ecology-prototype-source.mjs';
const root=fileURLToPath(new URL('../assets/models/ecology-prototypes/',import.meta.url));
const check=process.argv.includes('--check');if(!check)mkdirSync(root,{recursive:true});
const ids=new Set();for(const d of definitions){if(ids.has(d.id))throw Error('Duplicate asset '+d.id);ids.add(d.id);const {bytes,triangles,bounds}=buildGlb(d);if(inspectGlb(bytes)!==triangles||bounds[0][1]<-.005||triangles>15000||triangles<30)throw Error('Invalid prototype '+d.id);const target=root+d.id+'.glb';if(check){if(!Buffer.from(bytes).equals(readFileSync(target)))throw Error('Stale '+target);}else writeFileSync(target,bytes);console.log(d.id,triangles+' triangles',bytes.length+' bytes');}
console.log('PASS '+definitions.length+' deterministic GLB prototypes (geometry only)');
