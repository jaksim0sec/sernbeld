import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const pwa=readFileSync('pwa.js','utf8'),sw=readFileSync('sw.js','utf8');
// Exercise the actual registration gate, including the first character dialog.
const callbacks=[],timers=[],observers=[];
let done=false,open=true,registered=0;
const loading={classList:{contains:()=>done}},chooser={get open(){return open;}};
const registration={active:null,addEventListener(){}};
const context={window:{isSecureContext:true,addEventListener(){},setInterval(){}},navigator:{onLine:true,serviceWorker:{register(){registered++;return Promise.resolve(registration);},addEventListener(){}}},document:{getElementById:id=>id==='loading'?loading:chooser,addEventListener(){}},MutationObserver:class{constructor(cb){this.cb=cb;observers.push(this);}observe(target){this.target=target;}disconnect(){this.target=null;}},setTimeout:fn=>timers.push(fn),console};
vm.runInNewContext(pwa,context);
assert.equal(registered,0);assert.equal(timers.length,0);
done=true;observers.find(o=>o.target===loading).cb();
assert.equal(registered,0);assert.equal(timers.length,0);
open=false;observers.find(o=>o.target===chooser).cb();
assert.equal(timers.length,1);timers.shift()();assert.equal(registered,1);
await Promise.resolve();await Promise.resolve();
// The worker cannot overwhelm the connection with all assets at once.
let install,active=0,maxActive=0,fetches=0,puts=0,wait;
const worker={registration:{scope:'https://example.test/sernbeld/'},location:{origin:'https://example.test'},addEventListener(type,cb){if(type==='install')install=cb;}};
vm.runInNewContext(sw,{self:worker,URL,caches:{open:async()=>({put:async()=>{puts++;active--;}})},fetch:async()=>{active++;fetches++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,0));return {ok:true,type:'basic'};},Promise,Array});
install({waitUntil:p=>wait=p});await wait;
assert(fetches>40&&fetches===puts);assert(maxActive<=3);
console.log('PASS PWA starts after required creator closes; maximum '+maxActive+' precache downloads');
