// World collision registration and policy contract. No runtime wiring yet.
export function createWorldCollision({backend=null}={}){
 const entries=new Map(),regions=new Map(),suspended=new Set();
 const id=v=>typeof v==="string"&&v.length>0&&v.length<=256&&!v.includes("\0");
 const vec=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
 const positive=v=>Number.isFinite(v)&&v>0;
 const fail=s=>{throw new TypeError(s)};
 const copy=v=>JSON.parse(JSON.stringify(v));
 const clone=x=>x===null?null:copy(x);
 const purposes={support:"support",footIK:"support",block:"block",headroom:"block",climb:"climb",nav:"nav",camera:"camera",water:"water"};
 const bools=["block","support","mantle","oneWay","nav","camera","water"];
 function policy(p){
  if(!p||!id(p.id)||!bools.every(k=>typeof p[k]==="boolean")||!["none","face","mantleOnly"].includes(p.climb))fail("invalid collision policy");
  if(p.water&&(p.block||p.support||p.mantle||p.oneWay||p.climb!=="none"))fail("water cannot be solid");
  if(p.oneWay&&!p.support)fail("one-way requires support");
  return Object.fromEntries(["id",...bools,"climb"].map(k=>[k,p[k]]));
 }
 function transform(t){
  if(!t||!vec(t.position)||!Number.isFinite(t.yaw)||!vec(t.scale)||!t.scale.every(positive)||Object.keys(t).some(k=>!["position","yaw","scale"].includes(k)))fail("unsupported transform (positive scale and yaw only)");
  return copy(t);
 }
 function normalize(raw){
  if(!raw||!id(raw.id)||!id(raw.regionId)||!["solid","volume","decorative"].includes(raw.physics)||!Array.isArray(raw.shapes))fail("invalid world instance");
  const t=transform(raw.transform),seen=new Set();
  if((raw.physics==="decorative")!==(raw.shapes.length===0))fail("explicit decorative or nonempty shapes required");
  const shapes=raw.shapes.map(s=>{
   if(!s||!id(s.id)||seen.has(s.id)||!vec(s.center)||!["box","cylinder","heightfield","roof","triangleMesh","water"].includes(s.type))fail("invalid or duplicate shape");
   seen.add(s.id);
   const p=policy(s.policy);
   if((raw.physics==="volume")!==p.water||(s.type==="water")!==p.water)fail("inconsistent shape/volume policy");
   const out={id:s.id,type:s.type,center:[...s.center],policy:p,layer:s.layer??1};
   if(!Number.isInteger(out.layer)||out.layer<1||out.layer>0xffffffff)fail("invalid layer");
   if(s.type==="box"||s.type==="water"){
    if(!vec(s.half)||!s.half.every(positive))fail("invalid half extents");
    out.half=[...s.half];
   }else if(s.type==="cylinder"){
    if(!positive(s.radius)||!positive(s.height)||t.scale[0]!==t.scale[2])fail("invalid cylinder or unequal radial scale");
    out.radius=s.radius;out.height=s.height;
   }else{
    // Existing terrain/roof code supplies the exact query adapter, not a guessed box.
    if(!id(s.geometryRef)||!s.bounds||!vec(s.bounds.min)||!vec(s.bounds.max)||s.bounds.min.some((v,i)=>v>=s.bounds.max[i]))fail("invalid analytical geometry reference");
    out.geometryRef=s.geometryRef;out.bounds=copy(s.bounds);
   }
   return out;
  });
  const out={id:raw.id,regionId:raw.regionId,physics:raw.physics,transform:t,shapes};
  if(raw.active!==undefined&&typeof raw.active!=="boolean")fail("invalid active flag");
  return {...out,active:raw.active!==false};
 }
 function worldPoint(t,p){
  const [x,y,z]=p.map((v,i)=>v*t.scale[i]),c=Math.cos(t.yaw),s=Math.sin(t.yaw);
  return [t.position[0]+x*c+z*s,t.position[1]+y,t.position[2]-x*s+z*c];
 }
 function bounds(t,s){
  let lo,hi;
  if(s.half){lo=s.half.map((v,i)=>s.center[i]-v);hi=s.half.map((v,i)=>s.center[i]+v);}
  else if(s.type==="cylinder"){
   const center=worldPoint(t,s.center),r=s.radius*t.scale[0],h=s.height*t.scale[1]/2;
   return {min:[center[0]-r,center[1]-h,center[2]-r],max:[center[0]+r,center[1]+h,center[2]+r]};
  }else{lo=s.bounds.min.map((v,i)=>v+s.center[i]);hi=s.bounds.max.map((v,i)=>v+s.center[i]);}
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const x of [lo[0],hi[0]])for(const y of [lo[1],hi[1]])for(const z of [lo[2],hi[2]]){
   const p=worldPoint(t,[x,y,z]);for(let i=0;i<3;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
  }
  return {min,max};
 }
 const effective=e=>e.active&&!suspended.has(e.regionId);
 const handle=e=>Object.freeze({id:e.id,generation:e.generation});
 let generation=0;
 function requireEntry(h){
  const e=h&&entries.get(h.id);
  if(!e||h.generation!==e.generation)fail("stale collision handle");
  return e;
 }
 function snapshot(e){const {generation:_,...v}=e;return {...copy(v),effectiveActive:effective(e)};}
 function register(raw){
  const e=normalize(raw);
  if(entries.has(e.id))fail("duplicate instance ID");
  e.generation=++generation;e.revision=e.generation;e.shapes=e.shapes.map(s=>({...s,worldBounds:bounds(e.transform,s)}));
  entries.set(e.id,e);if(!regions.has(e.regionId))regions.set(e.regionId,new Set());regions.get(e.regionId).add(e.id);
  return handle(e);
 }
 function updateTransform(h,t){
  const e=requireEntry(h),next=transform(t);
  const n=normalize({...e,transform:next});
  const shapes=n.shapes.map(s=>({...s,worldBounds:bounds(next,s)}));
  e.transform=next;e.shapes=shapes;e.revision=++generation;return snapshot(e);
 }
 function setActive(h,active){const e=requireEntry(h);if(typeof active!=="boolean")fail("invalid active flag");if(e.active!==active){e.active=active;e.revision=++generation;}return snapshot(e);}
 function remove(h){const e=requireEntry(h),set=regions.get(e.regionId);entries.delete(e.id);set.delete(e.id);if(!set.size)regions.delete(e.regionId);return true;}
 function regionState(regionId,active){
  if(!id(regionId))fail("invalid region");
  if(active===!suspended.has(regionId))return false;
  if(active)suspended.delete(regionId);else suspended.add(regionId);
  for(const key of regions.get(regionId)??[])entries.get(key).revision=++generation;
  return true;
 }
 function filterValid(f){
  if(!f||!Object.hasOwn(purposes,f.purpose))fail("explicit query purpose required");
  if(f.regionId!==undefined&&!id(f.regionId))fail("invalid query region");
  if(f.excludeId!==undefined&&!id(f.excludeId))fail("invalid exclusion ID");
  if(f.actorId!==undefined&&!id(f.actorId))fail("invalid actor ID");
  if(f.layerMask!==undefined&&(!Number.isInteger(f.layerMask)||f.layerMask<0||f.layerMask>0xffffffff))fail("invalid layer mask");
 }
 function eligible(e,s,f){
  if(!effective(e)||e.id===f.excludeId||e.id===f.actorId||(f.regionId!==undefined&&e.regionId!==f.regionId)||!((f.layerMask??0xffffffff)&s.layer))return false;
  const v=s.policy[purposes[f.purpose]];
  return typeof v==="boolean"?v:v!=="none";
 }
 function candidate(e,s){return {instanceId:e.id,shapeId:s.id,regionId:e.regionId,revision:e.revision,shape:copy(s),transform:copy(e.transform)};}
 function queryAabb(a,f){
  filterValid(f);if(!a||!vec(a.min)||!vec(a.max)||a.min.some((v,i)=>v>a.max[i]))fail("invalid AABB");
  const out=[],keys=f.regionId===undefined?entries.keys():regions.get(f.regionId)??[];
  // Reference implementation for authoring/debug, NOT the production broadphase.
  for(const key of keys){const e=entries.get(key);for(const s of e.shapes){
   const b=s.worldBounds;
   if(eligible(e,s,f)&&b.min.every((v,i)=>v<=a.max[i]&&b.max[i]>=a.min[i]))out.push(candidate(e,s));
  }}
  return out.sort((a,b)=>a.instanceId<b.instanceId?-1:a.instanceId>b.instanceId?1:a.shapeId<b.shapeId?-1:a.shapeId>b.shapeId?1:0);
 }
 function get(id){const e=entries.get(id);return e?snapshot(e):null;}
 function resolveShape(instanceId,shapeId,revision,f){
  filterValid(f);const e=entries.get(instanceId);if(!e||e.revision!==revision)return null;
  const s=e.shapes.find(s=>s.id===shapeId);return s&&eligible(e,s,f)?candidate(e,s):null;
 }
 function query(method,args,f){
  filterValid(f);
  if(typeof backend?.[method]!=="function")throw new Error("unsupported collision capability: "+method);
  // The adapter receives an identity/policy resolver; it must use it BEFORE
  // selecting a hit. Filtering only the nearest returned hit would hide
  // valid farther surfaces. The caller owns backend result buffers.
  return backend[method](args,f,(instanceId,shapeId,revision)=>resolveShape(instanceId,shapeId,revision===undefined?entries.get(instanceId)?.revision:revision,f));
 }
 return {
  register,get,updateTransform,setActive,remove,
  isEligible:(instanceId,shapeId,f)=>{filterValid(f);const e=entries.get(instanceId),s=e?.shapes.find(s=>s.id===shapeId);return Boolean(s&&eligible(e,s,f));},
  suspendRegion:id=>regionState(id,false),resumeRegion:id=>regionState(id,true),
  queryAabb,resolveShape,
  capabilities:()=>({referenceAabb:true,productionBroadphase:false,...Object.fromEntries(["raycast","overlapBody","sweepBody","sampleSupport","sampleCeiling","sampleSurface","sampleWater"].map(k=>[k,typeof backend?.[k]==="function"]))}),
  raycast:(args,f)=>query("raycast",args,f),
  overlapBody:(args,f)=>query("overlapBody",args,f),
  sweepBody:(args,f)=>query("sweepBody",args,f),
  sampleSupport:(args,f)=>query("sampleSupport",args,f),
  sampleCeiling:(args,f)=>query("sampleCeiling",args,f),
  sampleSurface:(args,f)=>query("sampleSurface",args,f),
  sampleWater:(args,f)=>query("sampleWater",args,f)
 };
}

export function legacyCollisionPolicy({id="legacy-solid",walk=true,climbable,shape="box",mantleOnly=false}={}){
 if(!["box","cylinder","roof","heightfield"].includes(shape)||typeof walk!=="boolean"||typeof mantleOnly!=="boolean"||(climbable!==undefined&&typeof climbable!=="boolean"))throw new TypeError("invalid legacy policy");
 const canClimb=shape==="box"?climbable!==false:shape==="cylinder"?climbable===true:false;
 return {id,block:true,support:true,mantle:canClimb,oneWay:false,nav:walk,camera:true,water:false,climb:canClimb?(mantleOnly?"mantleOnly":"face"):"none"};
}

export function classifySupport({geometricNormal,support,footContact,walkMax,slideEnter=walkMax,slideExit=slideEnter,previous="walk"}){
 const n=geometricNormal;
 if(!Array.isArray(n)||n.length!==3||!n.every(Number.isFinite)||Math.abs(Math.hypot(...n)-1)>1e-6||![walkMax,slideEnter,slideExit].every(v=>Number.isFinite(v)&&v>=0&&v<Math.PI/2)||slideExit>slideEnter||walkMax>slideEnter||typeof support!=="boolean"||typeof footContact!=="boolean")throw new TypeError("invalid support query");
 const angle=Math.acos(Math.max(-1,Math.min(1,n[1])));
 if(!support||!footContact||n[1]<=1e-9)return {kind:"unsupported",angle};
 const sliding=previous==="slide"?angle>=slideExit+1e-10:angle>slideEnter+1e-10;
 return {kind:sliding?"slide":angle<=walkMax+1e-10?"walk":"steep",angle};
}

export function slopeGravity(normal,gravity){
 if(!Array.isArray(normal)||normal.length!==3||!normal.every(Number.isFinite)||Math.abs(Math.hypot(...normal)-1)>1e-6||!Number.isFinite(gravity)||gravity<0)throw new TypeError("invalid slope gravity");
 const dot=-gravity*normal[1];
 return [0,-gravity,0].map((v,i)=>v-normal[i]*dot);
}
