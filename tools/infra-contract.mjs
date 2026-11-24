function validPath(p){return typeof p==="string"&&p.length>0&&!p.startsWith("/")&&!p.includes("\\")&&!p.split("/").some(s=>!s||s==="."||s==="..")&&!/[\x00-\x1f]/.test(p);}

function checkCatalog(records,exists){
 const errors=[],ids=new Set(),kinds=["asset","garment","npc","item","building","ui","skill","demo","concept"],stages=["PROPOSED","DESIGNED","PROTOTYPED","REGISTERED","INTEGRATED"],states=["PASS","FAIL","PARTIAL","NOT RUN"];
 for(const r of records){
  const id=r?.id??"(missing id)",err=m=>errors.push(id+": "+m);
  if(typeof r?.id!=="string"||!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(id))err("invalid id");
  if(ids.has(id))err("duplicate id");ids.add(id);
  if(!kinds.includes(r?.kind))err("invalid kind");
  if(typeof r?.title!=="string"||!r.title.trim())err("missing title");
  if(!stages.includes(r?.stage))err("invalid stage");
  if(!Array.isArray(r?.source)||(!r.source.length&&r.stage!=="PROPOSED"))err("missing source");
  else for(const p of r.source)if(!validPath(p)||!exists(p))err("missing/invalid source "+p);
  if(["REGISTERED","INTEGRATED"].includes(r?.stage)&&(!validPath(r.runtime)||!exists(r.runtime)))err("missing runtime reference");
  if(typeof r?.approval!=="string"||!r.approval.trim())err("missing approval scope");
  if(!Array.isArray(r?.checks)||!r.checks.length)err("missing validation record");
  else for(const c of r.checks){
   if(typeof c?.criterion!=="string"||!c.criterion.trim()||!states.includes(c.result)||typeof c.evidence!=="string"||!c.evidence.trim())err("invalid validation record");
  }
  if(["asset","building"].includes(r?.kind)&&(!["decorative","walkable","blocking","mixed"].includes(r.collision)||typeof r.units!=="string"||!r.units.trim()||typeof r.pivot!=="string"||!r.pivot.trim()))err("missing world asset contract");
  if(r?.kind==="garment"&&(!["collar","top","vest","pants","shoes","hat"].includes(r.slot)||typeof r.rig!=="string"||!r.rig.trim()||!Array.isArray(r.bodies)||!r.bodies.length||r.bodies.some(b=>!["male","female"].includes(b))))err("missing garment contract");
 }
 return errors;
}

function checkTasks(records,exists){
 const errors=[],ids=new Set(),claims=[];
 for(const r of records){
  const id=r?.id??"(missing id)",err=m=>errors.push(id+": "+m);
  if(!/^[A-Z][A-Z0-9]*-\d{3,}$/.test(id))err("invalid task id");
  if(ids.has(id))err("duplicate task id");ids.add(id);
  if(!["planned","in_progress","blocked","done"].includes(r?.status))err("invalid status");
  if(!/^[0-9a-f]{40}$/.test(r?.baseline??""))err("invalid baseline SHA");
  if(!validPath(r?.detail)||!exists(r.detail))err("missing task detail");
  if(typeof r?.next!=="string"||!r.next.trim())err("missing next action");
  if(!Array.isArray(r?.scope)||!r.scope.length||r.scope.some(p=>!validPath(p)))err("invalid scope");
  else if(["in_progress","blocked"].includes(r.status))for(const p of r.scope)claims.push([id,p]);
  if(!Array.isArray(r?.contracts)||r.contracts.some(p=>!validPath(p)||!exists(p)))err("missing contract");
  if(!Array.isArray(r?.dependencies)||r.dependencies.some(d=>typeof d!=="string"||d===id))err("invalid dependencies");
 }
 for(const r of records)for(const d of r?.dependencies??[])if(!ids.has(d))errors.push(r.id+": unknown dependency "+d);
 for(let i=0;i<claims.length;i++)for(let j=i+1;j<claims.length;j++){const [a,p]=claims[i],[b,q]=claims[j];if(a!==b&&(p===q||p.startsWith(q+"/")||q.startsWith(p+"/")))errors.push("overlapping active scopes: "+a+" "+p+" / "+b+" "+q);}
 return errors;
}

function classifyCheck(label,status,output){
 const diagnostics=String(output).split(/\r?\n/).filter(l=>/^(PARTIAL\b|NOT RUN\b|STRESS TARGET NOT MET\b)/.test(l.trim())).map(l=>l.trim());
 const known=l=>(label==="tests/shirt-runtime.mjs"&&/^STRESS TARGET NOT MET female /.test(l))||(label==="tests/mobile-regression.mjs --current"&&/^PARTIAL (landscape|portrait): Chromium did not dispatch a click for touch close immediately after drag$/.test(l))||(label==="tests/garment-alignment.mjs"&&l==="PARTIAL garment clearance: diagnostic only; complete skin fit is not asserted");
 if(status!==0)return {result:"FAIL",blocking:true,diagnostics};
 if(!diagnostics.length)return {result:"PASS",blocking:false,diagnostics};
 return {result:"PARTIAL",blocking:diagnostics.some(l=>!known(l)),diagnostics};
}

function edgeMetrics(rest,posed,index){
 if(rest.length!==posed.length||rest.length%3||index.length%3)throw Error("invalid geometry arrays");
 const edges=new Set(),ratios=[];let maxExtension=0,maxRatio=0,used=new Set();
 for(const i of index){if(!Number.isInteger(i)||i<0||i>=rest.length/3)throw Error("invalid vertex index");used.add(i);}
 for(const i of used)for(let k=0;k<3;k++)if(!Number.isFinite(rest[i*3+k])||!Number.isFinite(posed[i*3+k]))throw Error("non-finite referenced vertex");
 const length=(a,b,p)=>Math.hypot(p[a*3]-p[b*3],p[a*3+1]-p[b*3+1],p[a*3+2]-p[b*3+2]);
 for(let i=0;i<index.length;i+=3)for(const [a,b] of [[index[i],index[i+1]],[index[i+1],index[i+2]],[index[i+2],index[i]]]){
  const key=Math.min(a,b)+":"+Math.max(a,b);if(edges.has(key))continue;edges.add(key);
  const l=length(a,b,rest);if(l<1e-5)continue;const m=length(a,b,posed);ratios.push(m/l);maxRatio=Math.max(maxRatio,m/l);maxExtension=Math.max(maxExtension,m-l);
 }
 if(!ratios.length)throw Error("no measurable edges");
 ratios.sort((a,b)=>a-b);return {vertices:used.size,edges:ratios.length,p95:ratios[Math.floor((ratios.length-1)*.95)],maxRatio,maxExtension};
}
export {validPath,checkCatalog,checkTasks,classifyCheck,edgeMetrics};
