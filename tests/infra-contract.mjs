import assert from 'node:assert/strict';
import {checkCatalog,checkTasks,classifyCheck,edgeMetrics} from '../tools/infra-contract.mjs';
function runTests(assert){
 const files=new Set(["source.glb","src/world.js","docs/contract.md","docs/task.md"]), exists=p=>files.has(p);
 const asset={id:"asset.grass",kind:"asset",title:"Grass",stage:"INTEGRATED",source:["source.glb"],runtime:"src/world.js",approval:"not reviewed",checks:[{criterion:"visual",result:"NOT RUN",evidence:"No browser"}],collision:"decorative",units:"m",pivot:"ground"};
 assert(checkCatalog([asset],exists).length===0,"valid asset");
 assert(checkCatalog([asset,asset],exists).some(e=>e.includes("duplicate")),"duplicate rejected");
 assert(checkCatalog([{...asset,runtime:"missing"}],exists).some(e=>e.includes("runtime")),"missing runtime rejected");
 assert(checkCatalog([{...asset,source:["../source.glb"]}],exists).some(e=>e.includes("source")),"traversal rejected");
 assert(checkCatalog([{...asset,collision:"unknown"}],exists).some(e=>e.includes("world asset")),"collision required");
 assert(checkCatalog([{...asset,kind:"garment"}],exists).some(e=>e.includes("garment")),"garment contract required");
 const t={id:"TEST-001",status:"in_progress",baseline:"a".repeat(40),detail:"docs/task.md",next:"test",scope:["src/world"],contracts:["docs/contract.md"],dependencies:[]};
 assert(checkTasks([t],exists).length===0,"valid task");
 assert(checkTasks([t,{...t,id:"TEST-002",scope:["src/world/road.js"]}],exists).some(e=>e.includes("overlapping")),"nested overlap rejected");
 assert(checkTasks([t,{...t,id:"TEST-002",status:"planned",scope:["src/world/road.js"]}],exists).length===0,"planned not a claim");
 assert(checkTasks([t,{...t,id:"TEST-002",scope:["src/world-other"]}],exists).length===0,"similar prefix is not overlap");
 assert(checkTasks([{...t,dependencies:["TEST-999"]}],exists).some(e=>e.includes("unknown dependency")),"unknown dependency rejected");
 assert(classifyCheck("x",0,"PASS").result==="PASS","pass");
 assert(classifyCheck("x",1,"PASS").blocking,"failure");
 assert(classifyCheck("x",0,"PARTIAL unknown").blocking,"unexpected partial blocks");
 assert(classifyCheck("tests/mobile-regression.mjs --current",0,"PARTIAL portrait: Chromium did not dispatch a click for touch close immediately after drag").result==="PARTIAL","known partial distinct");
 assert(!classifyCheck("tests/shirt-runtime.mjs",0,"STRESS TARGET NOT MET female {}").blocking,"known stress waiver");
 assert(classifyCheck("tests/shirt-runtime.mjs",0,"STRESS TARGET NOT MET male {}").blocking,"new stress blocks");
 const r=[0,0,0,1,0,0,0,1,0],p=[0,0,0,2,0,0,0,2,0];
 const m=edgeMetrics(r,p,[0,1,2]);assert(m.vertices===3&&m.edges===3&&m.p95===2&&m.maxRatio===2,"all edges measured");
 let failed=false;try{edgeMetrics(r,[...p.slice(0,8),NaN],[0,1,2]);}catch{failed=true;}assert(failed,"invalid last vertex detected");
}
runTests(assert);
console.log('PASS infrastructure contract and negative cases');
