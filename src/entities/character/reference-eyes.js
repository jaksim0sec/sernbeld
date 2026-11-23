// Contours in the existing face editor's coordinates. Heights use one eye
// width as the unit. Each pair is mirrored about the existing face centre.
const shapes = [
 ['basic','기본형',    .205,.385, .015,-.055],
 ['slit','실눈',       .105,.025,-.135,-.135],
 ['half','반실눈',     .065,.285,-.025,-.035],
 ['round','둥근눈',    .345,.470, .015,-.065],
 ['droop','처진눈',    .175,.355, .035,-.125],
 ['sharp','날카로운눈',.140,.355,-.105, .075],
 ['flat','무표정형',   .085,.390,-.015,-.025],
 ['smile','웃는눈',    .175,0,  -.115,-.115]
];
export const REFERENCE_EYES = Object.freeze(Object.fromEntries(
 shapes.map(([id,label])=>['reference-'+id,label])
));

const width=.236, inner=.094, centreY=-.253;
const material={name:'Reference eye ink',extensions:{KHR_materials_unlit:{}}};
const rgb=hex=>[0,2,4].map(i=>{
 const n=parseInt(hex.slice(i,i+2),16)/255;
 return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;
});
const white=rgb('fff7f5'), softWhite=rgb('f2e6ea'), ink=rgb('49313e'), light=rgb('fff9fb');
const mix=(a,b,t)=>a.map((n,i)=>n+(b[i]-n)*t);
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

// Frontmost triangle on the same undeformed face used by the editor.
// Bin by x so generating the eight eye pairs doesn't scan the whole head.
function depthSampler(positions,indices){
 const bin=x=>Math.floor(x*100);
 const buckets=new Map();
 for(let i=0;i<indices.length;i+=3){
  const [a,b,c]=[indices[i]*3,indices[i+1]*3,indices[i+2]*3];
  const x=positions[a],y=positions[a+1],z=positions[a+2];
  const dx=positions[b]-x,dy=positions[b+1]-y,ex=positions[c]-x,ey=positions[c+1]-y;
  if(Math.min(y,y+dy,y+ey)>-.09||Math.max(y,y+dy,y+ey)<-.38)continue;
  const det=dx*ey-dy*ex;
  if(det<=1e-9)continue;
  const tri={x,y,z,dx,dy,ex,ey,det,dz:positions[b+2]-z,ez:positions[c+2]-z};
  for(let k=bin(Math.min(x,x+dx,x+ex));k<=bin(Math.max(x,x+dx,x+ex));k++){
   if(!buckets.has(k))buckets.set(k,[]);
   buckets.get(k).push(tri);
  }
 }
 return (x,y)=>{
  let z=-Infinity;
  for(const t of buckets.get(bin(x))??[]){
   const px=x-t.x,py=y-t.y;
   const u=(px*t.ey-py*t.ex)/t.det,v=(t.dx*py-t.dy*px)/t.det;
   if(u>=-1e-5&&v>=-1e-5&&u+v<=1.00001)z=Math.max(z,t.z+u*t.dz+v*t.ez);
  }
  if(!Number.isFinite(z))throw new Error('Eye contour lies outside the fitted face');
  return z;
 };
}

function makeMesh(eyeStyle,eyeLayer,depth){
 const points=[],normals=[],colours=[],index=[];
 return {
  strip(side,count,rows,offset,sample){
   const start=points.length/3;
   for(let i=0;i<=count;i++)for(let j=0;j<=rows;j++){
    const [t,y,color]=sample(i/count,j/rows);
    const x=side*(inner+width*t),v=centreY+width*y;
    points.push(x,v,depth(x,v)+offset);
    normals.push(0,0,1);
    colours.push(...color);
    if(i&&j){
     const d=start+i*(rows+1)+j,b=d-rows-1,a=b-1,c=d-1;
     if(side===1)index.push(a,c,b,b,c,d);
     else index.push(a,b,c,b,d,c);
    }
   }
  },
  finish(){
   const base=Float32Array.from(points),baseNormals=Float32Array.from(normals),baseColors=Float32Array.from(colours);
   const count=base.length/3;
   const extra={eyeStyle,eyeLayer,iris:eyeLayer==='iris',referenceIris:eyeLayer==='iris',softInk:eyeLayer==='crease'};
   return {name:eyeStyle+' / '+eyeLayer,key:eyeStyle+':'+eyeLayer,extra,material,
    base,baseNormals,baseColors,colors:baseColors.slice(),fields:null,
    edited:base.slice(),localNormals:baseNormals.slice(),positions:new Float32Array(base.length),normals:new Float32Array(base.length),
    indices:Uint32Array.from(index),skin:false,jointIds:new Uint8Array(count*4),
    weights:Uint8Array.from({length:count*4},(_,i)=>i%4===0?255:0),skins:['head'],gpu:null};
  }
 };
}

export function makeReferenceEyes(surface,triangles){
 const depth=depthSampler(surface,triangles);
 return shapes.flatMap(([id,,rise,drop,innerY,outerY])=>{
  const style='reference-'+id,closed=id==='smile';
  const corners=t=>innerY+(outerY-innerY)*t;
  const arch=t=>Math.max(0,Math.sin(Math.PI*t));
  // Keep a broad, shallow centre and rounded shoulders at the corners.
  const lidArch=t=> {
   const x=t*2-1;
   return Math.max(0,1-x*x)**.57*(1-.08*x);
  };
  const top=t=>corners(t)+rise*lidArch(t);
  const bottom=t=>corners(t)-drop*arch(t)**.57;
  const sclera=makeMesh(style,'sclera',depth),iris=makeMesh(style,'iris',depth);
  const shine=makeMesh(style,'shine',depth),lid=makeMesh(style,'lid',depth),crease=makeMesh(style,'crease',depth);
  const irisX=.415,irisRX=id==='round'?.270:.255;
  const irisRY=id==='round'?.455:id==='half'?.295:.375;
  const irisY=id==='round'?-.015:id==='slit'?-.26:id==='half'?.025:.015;
  const thickness=t=>(closed?.139:id==='slit'?.142:.155)*arch(t)**.10*(.89+.15*t);
  for(const side of [-1,1]){
   if(!closed){
    sclera.strip(side,36,7,.006,(t,q)=>[t,bottom(t)+(top(t)-bottom(t))*q,mix(white,softWhite,q**5*.6)]);
    iris.strip(side,48,16,.009,(u,q)=>{
     const t=irisX+(u*2-1)*irisRX;
     // Broad straight sides and a softly flattened base, like the reference.
     const radius=irisRY*Math.max(0,1-Math.abs(u*2-1)**3.4)**(1/3.4);
     const hi=clamp(irisY+radius,bottom(t),top(t)),lo=clamp(irisY-radius,bottom(t),top(t));
     const y=lo+(hi-lo)*q;
     const tone=.40-.14*clamp((y-(irisY-.08))/.23,0,1);
     return [t,y,[tone,tone,tone]];
    });
    const sx=irisX+side*.115, sy=top(sx)-.125;
    const lightRy=Math.min(.049,Math.max(.021,(top(sx)-bottom(sx))*.18));
    const lightY=clamp(sy,bottom(sx)+lightRy+.008,top(sx)-lightRy-.055);
    shine.strip(side,18,3,.012,(u,q)=>{
     const t=sx+(u*2-1)*.051,half=lightRy*Math.sqrt(Math.max(0,1-(u*2-1)**2));
     return [t,clamp(lightY+(q*2-1)*half,bottom(t),top(t)),light];
    });
   }
   lid.strip(side,48,4,.016,(u,q)=>{
    const t=.035+.93*u;
    return [t,top(t)+(q-.55)*thickness(t),ink];
   });
   for(const edge of [.035,.965]){
    const radius=thickness(edge)/2,centre=top(edge)-.05*thickness(edge);
    lid.strip(side,18,4,.016,(u,q)=>{
     const x=u*2-1,span=radius*Math.sqrt(Math.max(0,1-x*x));
     return [edge+x*radius,centre+(q*2-1)*span,ink];
    });
   }
   crease.strip(side,28,2,.006,(u,q)=>{
    const t=.084+.832*u;
    return [t,top(t)+(.110+.026*arch(t))+(q-.5)*.013*arch(u)**.6,ink];
   });
  }
  const layers=closed?[lid,crease]:[sclera,iris,shine,lid,crease];
  return layers.map(layer=>layer.finish());
 });
}
