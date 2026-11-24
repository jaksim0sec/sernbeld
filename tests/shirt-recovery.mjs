import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {loadShirtRuntime} from '../src/entities/character/clothing/shirt-source.js';

// Literal-only compressed fixture: change a same-length base64 part, not its length.
const n=3,tri=1,sizes=[9,9,9,12,12,3,9,9,9,9],widths=[4,4,1,4,1,2,2,2,2];let length=0;
const sections=sizes.map((size,i)=>{length=(length+3)&~3;const offset=length;length+=size*widths[i];return {offset,length:size};});
const raw=Buffer.alloc(length);new Uint16Array(raw.buffer,raw.byteOffset+sections[5].offset,3).set([0,1,2]);
const extra=[];let rest=raw.length-15;while(rest>=255){extra.push(255);rest-=255;}extra.push(rest);
const packed=Buffer.concat([Buffer.from([240,...extra]),raw]);const encoded=packed.toString('base64'),parts=[encoded.slice(0,80),encoded.slice(80)];
const hash=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
const meta={version:1,vertices:n,triangles:tri,sections,rawBytes:length,packedBytes:packed.length,parts:['runtime.00.part','runtime.01.part'],partBlobSha1:parts.map(hash)};
const requests=[];
function source({corrupt=false,always=false,oldMeta=false}={}){return async (url,opts)=>{const retry=url.searchParams.has('shirt-recovery');const name=url.pathname.split('/').at(-1);requests.push({name,retry,cache:opts?.cache});if(name==='runtime.json'){const data={...meta};if(oldMeta&&!retry)delete data.partBlobSha1;return new Response(JSON.stringify(data));}const i=meta.parts.indexOf(name);let value=parts[i];if(i===1&&(always||corrupt&&!retry)){value=(value[0]==='A'?'B':'A')+value.slice(1);}return new Response(value);};}
const result=await loadShirtRuntime('male',source({corrupt:true}));assert.deepEqual([...result.index],[0,1,2]);assert.equal(requests.filter(r=>r.name==='runtime.json').length,2,'must retry whole set');assert.equal(requests.filter(r=>r.retry).length,3);assert(requests.filter(r=>r.retry).every(r=>r.cache==='reload'));
requests.length=0;await assert.rejects(loadShirtRuntime('female',source({always:true})),/female.*runtime\.01\.part/);assert.equal(requests.filter(r=>r.name==='runtime.json').length,2);
requests.length=0;await loadShirtRuntime('male',source({oldMeta:true}));assert.equal(requests.filter(r=>r.name==='runtime.json').length,2);
requests.length=0;await loadShirtRuntime('male',source());assert.equal(requests.length,3);assert(requests.every(r=>!r.retry));

// The real worker must not silently replace a recovery fetch with stale bytes.
const handlers={},lookups=[];let network=true;
const root='https://example.test/sernbeld/',canonical=root+'assets/models/clothing/shirt-v1/male/runtime.00.part';
const self={registration:{scope:root},location:{origin:'https://example.test'},addEventListener:(name,fn)=>handlers[name]=fn};
const caches={open:async name=>({match:async(req,opts)=>{lookups.push({name,url:typeof req==='string'?req:req.url,opts});return name.endsWith('-shell')&&req===canonical?new Response('shell'):undefined;},put:async()=>{}})};
vm.runInNewContext(readFileSync('sw.js','utf8'),{self,caches,URL,Response,fetch:async(req,opts)=>{if(!network)throw Error('offline');return new Response(opts.cache);}});
function dispatch(url){let response;handlers.fetch({request:{method:'GET',url,mode:'cors'},respondWith:p=>response=p});return response;}
assert.equal(await (await dispatch(canonical+'?shirt-recovery=1')).text(),'reload');
network=false;lookups.length=0;await assert.rejects(dispatch(canonical+'?shirt-recovery=2'),/offline/);assert.equal(lookups.length,0);
assert.equal(await (await dispatch(canonical+'?shirt-part='+meta.partBlobSha1[0])).text(),'shell');
assert.equal(lookups[0].opts,undefined);assert.equal(lookups.at(-1).url,canonical);

// Production bytes must match their recorded Git blob IDs, without retry.
for(const sex of ['male','female']){
 let attempts=0;
 const actual=await loadShirtRuntime(sex,async url=>{assert(!url.searchParams.has('shirt-recovery'));attempts++;return new Response(readFileSync(url));});
 assert(actual.position.length>0&&actual.index.length>0);assert.equal(attempts,actual.meta.parts.length+1);
}
console.log('PASS shirt integrity, same-length corruption retry, stale metadata, persistent rejection, real assets and offline worker routing');
