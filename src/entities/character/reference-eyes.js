// Contours in the existing face editor's coordinates. Heights use one eye
// width as the unit. Each pair is mirrored about the existing face centre.
const shapes = [
 ['basic','기본형',    .30,.26, .00,-.035],
 ['slit','실눈',       .12,.03,-.14,-.13],
 ['half','반실눈',     .16,.18,-.07,-.07],
 ['round','둥근눈',    .42,.33, .025,-.035],
 ['droop','처진눈',    .24,.23, .03,-.14],
 ['sharp','날카로운눈',.18,.23,-.14, .105],
 ['flat','무표정형',   .17,.27,-.016,-.018],
 ['smile','웃는눈',    .21,0,  -.11,-.11]
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
  const top=t=>corners(t)+rise*arch(t)**(id==='round'?.59:.52);
  const bottom=t=>corners(t)-drop*arch(t)**.48;
  const sclera=makeMesh(style,'sclera',depth),iris=makeMesh(style,'iris',depth);
  const shine=makeMesh(style,'shine',depth),lid=makeMesh(style,'lid',depth),crease=makeMesh(style,'crease',depth);
  const irisX=.405,irisRX=.259,irisRY=.42;
  const irisY=id==='round'?-.012:id==='slit'?-.22:id==='half'?-.13:-.058;
  for(const side of [-1,1]){
   if(!closed){
    sclera.strip(side,36,7,.006,(t,q)=>[t,bottom(t)+(top(t)-bottom(t))*q,mix(white,softWhite,q**5*.6)]);
    iris.strip(side,36,14,.009,(u,q)=>{
     const t=irisX+(u*2-1)*irisRX;
     const radius=irisRY*Math.sqrt(Math.max(0,1-(u*2-1)**2));
     const hi=clamp(irisY+radius,bottom(t),top(t)),lo=clamp(irisY-radius,bottom(t),top(t));
     const y=lo+(hi-lo)*q;
     const tone=.40-.14*clamp((y-(irisY-.08))/.23,0,1);
     return [t,y,[tone,tone,tone]];
    });
    const sx=irisX+side*.105, sy=top(sx)-.103;
    const lightRy=Math.min(.048,Math.max(.023,(top(sx)-bottom(sx))*.19));
    const lightY=clamp(sy,bottom(sx)+lightRy+.008,top(sx)-lightRy-.055);
    shine.strip(side,18,3,.012,(u,q)=>{
     const t=sx+(u*2-1)*.051,half=lightRy*Math.sqrt(Math.max(0,1-(u*2-1)**2));
     return [t,clamp(lightY+(q*2-1)*half,bottom(t),top(t)),light];
    });
   }
   lid.strip(side,40,3,.016,(t,q)=>{
    // Rounded/tapered at both ends. Keep the middle broad and the outer end
    // soft, without the hooked lash tip on the original mesh.
    const thickness=(closed?.133:.158)*arch(t)**.24*(.85+.15*t);
    return [t,top(t)+(q-.61)*thickness,ink];
   });
   crease.strip(side,28,2,.006,(u,q)=>{
    const t=.084+.832*u;
    return [t,top(t)+(.093+.035*arch(t))+(q-.5)*.016*arch(u)**.6,ink];
   });
  }
  const layers=closed?[lid,crease]:[sclera,iris,shine,lid,crease];
  return layers.map(layer=>layer.finish());
 });
}
