// Original optimized trousers, in metre-scale foot-anchored reference space.
const root=new URL('../../../../assets/models/clothing/pants-v1/',import.meta.url);
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const clamp=x=>Math.max(0,Math.min(1,x));
export function decodePants(raw,sex){
 if(!['male','female'].includes(sex)||!Array.isArray(raw?.v)||!Array.isArray(raw?.f)||raw.v.length%3||raw.f.length%3)throw Error('Invalid pants geometry');
 const count=raw.v.length/3;
 if(count!==5471||raw.f.length!==32256||raw.checks?.vertices!==count||raw.checks?.triangles!==raw.f.length/3||raw.v.some(x=>!Number.isFinite(x))||raw.f.some(i=>!Number.isInteger(i)||i<0||i>=count))throw Error('Invalid pants asset');
 const position=Float32Array.from(raw.v),index=Uint16Array.from(raw.f),normal=new Float32Array(position.length),detail=new Float32Array(count*4);
 for(let i=0;i<index.length;i+=3){
  const a=index[i]*3,b=index[i+1]*3,c=index[i+2]*3;
  const ux=position[b]-position[a],uy=position[b+1]-position[a+1],uz=position[b+2]-position[a+2],vx=position[c]-position[a],vy=position[c+1]-position[a+1],vz=position[c+2]-position[a+2];
  const x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx;
  if(Math.hypot(x,y,z)<1e-12)throw Error('Degenerate pants face');
  for(const j of [a,b,c]){normal[j]+=x;normal[j+1]+=y;normal[j+2]+=z;}
 }
 const hem=.112,top=sex==='male'?1.112:1.138,crotch=sex==='male'?.812:.842;
 const gauss=x=>Math.exp(-x*x);
 for(let i=0;i<count;i++){
  const j=i*3,k=i*4,len=Math.hypot(normal[j],normal[j+1],normal[j+2]);
  if(len<1e-12)throw Error('Invalid pants normal');
  normal[j]/=len;normal[j+1]/=len;normal[j+2]/=len;
  const x=position[j],y=position[j+1],z=position[j+2],side=x<0?-1:1;
  const t=clamp((y-hem)/(crotch-hem)),cx=.048+.025*t,cz=-.025+.07*t;
  const th=Math.atan2(Math.abs(x)-cx,z-cz),fade=smooth(0,.045,t)*(1-smooth(.91,1,t));
  const phase=4*th+1.35*Math.sin(t*4.5+side*.4)+.35*Math.cos(3*th);
  const knee=gauss((y-.46-.012*Math.sin(th))/.062),ankle=gauss((y-.16)/.036);
  const kphase=(y-.46+.012*Math.sin(th*2))*Math.PI*2/.042,aphase=(y-.16+.007*Math.cos(th))*Math.PI*2/.033;
  const crease=.0030*fade*knee*Math.cos(kphase)+.0018*fade*ankle*Math.cos(aphase),outerSeam=gauss((th-Math.PI/2)/.055);
  detail[k]=.0017*fade*Math.cos(phase)+crease-.0007*fade*outerSeam;
  detail[k+3]=clamp(.22*fade*gauss((Math.cos(phase)+1)*2.1)+.30*fade*knee*gauss((Math.cos(kphase)+1)*1.9)+.35*fade*ankle*gauss((Math.cos(aphase)+1)*2)+.26*outerSeam*fade+.28*gauss((y-hem-.008)/.004));
 }
 return Object.freeze({position,index,normal,detail,meta:Object.freeze({...raw.checks,sex,hem,top,crotch})});
}
export async function loadPants(sex,fetchImpl=fetch){
 if(!['male','female'].includes(sex))throw Error('Unknown pants body: '+sex);
 const r=await fetchImpl(new URL('pants_'+sex+'.json.gz',root));
 if(!r.ok||!r.body)throw Error('바지 데이터를 불러오지 못했어 ('+r.status+')');
 return decodePants(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json(),sex);
}
let pending;
export function loadDefaultPants(fetchImpl){
 const load=()=>Promise.all(['male','female'].map(async sex=>[sex,await loadPants(sex,fetchImpl??fetch)])).then(Object.fromEntries);
 if(fetchImpl)return load();
 return pending??=load().catch(error=>{pending=null;throw error;});
}
