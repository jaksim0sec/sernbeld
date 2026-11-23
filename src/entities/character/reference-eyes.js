import { REFERENCE_EYE_CONTOURS } from './reference-eye-contours.js';

// Contours in the existing face editor's coordinates. Heights use one eye
// width as the unit. Each pair is mirrored about the existing face centre.
const shapes = [
 ['basic','기본형'],['slit','실눈'],['half','반실눈'],['round','둥근눈'],
 ['droop','처진눈'],['sharp','날카로운눈'],['flat','무표정형'],['smile','웃는눈'],
 ['squint','실눈 · 닫힘'],['closed','감은 눈']
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
const white=rgb('fff7f5');

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
 const points=[],normals=[],colours=[],index=[],tints=[];
 return {
  strip(side,count,rows,offset,sample){
   const start=points.length/3;
   for(let i=0;i<=count;i++)for(let j=0;j<=rows;j++){
    const [t,y,color,tint=0]=sample(i/count,1-j/rows);
    const x=side*(inner+width*t),v=centreY+width*y;
    points.push(x,v,depth(x,v)+offset);
    normals.push(0,0,1);
    colours.push(...color);
    tints.push(tint);
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
   const iris=eyeLayer==='lid'&&!['reference-smile','reference-squint','reference-closed'].includes(eyeStyle);
   const extra={eyeStyle,eyeLayer,iris,referenceIris:iris,softInk:eyeLayer==='crease'};
   return {name:eyeStyle+' / '+eyeLayer,key:eyeStyle+':'+eyeLayer,extra,material,
    base,baseNormals,baseColors,colors:baseColors.slice(),fields:null,
    edited:base.slice(),localNormals:baseNormals.slice(),positions:new Float32Array(base.length),normals:new Float32Array(base.length),
    irisTint:Float32Array.from(tints),indices:Uint32Array.from(index),skin:false,jointIds:new Uint8Array(count*4),
    weights:Uint8Array.from({length:count*4},(_,i)=>i%4===0?255:0),skins:['head'],gpu:null};
  }
 };
}

export function makeReferenceEyes(surface,triangles,legacyFeatures=[]){
 const depth=depthSampler(surface,triangles);
 const linearRGB=rgb=>rgb.map(value=>{
  const n=value/255;
  return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;
 });
 const eyes=REFERENCE_EYE_CONTOURS.flatMap(measured=>{
  const style='reference-'+measured.id,closed=measured.id==='smile';
  const sclera=makeMesh(style,'sclera',depth),lid=makeMesh(style,'lid',depth);
  const count=measured.width-1;
  // The left eye in the sheet runs outer corner -> inner corner.
  // The model's positive-X contour runs inner corner -> outer corner.
  function column(t){
   return measured.columns[Math.round((1-t)*count)];
  }
  for(const side of [-1,1]){
   if(!closed)sclera.strip(side,count,4,.006,(t,q)=>{
    const [top,,bottom]=column(t);
    const y=top+(bottom-top)*q;
    return [t,(measured.topOffset-y)/count,white];
   });
   lid.strip(side,count,measured.rows,.012,(t,q)=>{
    const c=column(t),y=c[0]+(c[1]-c[0])*q;
    const row=Math.round(q*measured.rows);
    const color=c.slice(3+row*3,6+row*3),[r,g,b]=color;
    // Reference iris is cooler than the wine-coloured lid. Keep highlights,
    // lid ink and sclera fixed when the player selects another iris colour.
    const tint=!closed&&r<190&&g<150&&(b-g)/Math.max(1,r-g)>.55?1:0;
    return [t,(measured.topOffset-y)/count,linearRGB(color),tint];
   });
  }
  return (closed?[lid]:[sclera,lid]).map(mesh=>mesh.finish());
 });
 // Recover only the centre curve from the old closed-eye parts. Build a new
 // stroke with the width, depth and ink of the reference set.
 for(const [id,sourceStyle] of [['squint','smiling'],['closed','closed']]){
  const source=legacyFeatures.find(f=>f.extra.eyeStyle===sourceStyle&&f.base[0]>0);
  if(!source)continue;
  const centres=[];
  for(let i=0;i<=48;i++){
   const x=inner+width*i/48,ys=[];
   for(let j=0;j<source.base.length;j+=3)if(Math.abs(source.base[j]-x)<.0045)ys.push(source.base[j+1]);
   centres.push(ys.length?(Math.min(...ys)+Math.max(...ys))/2:NaN);
  }
  if(centres.some(v=>!Number.isFinite(v)))throw Error('Closed-eye centre curve is incomplete');
  const curve=centres.map((v,i)=>(centres[Math.max(0,i-1)]+2*v+centres[Math.min(48,i+1)])/4);
  const mesh=makeMesh('reference-'+id,'lid',depth),ink=rgb('583440');
  for(const side of [-1,1])mesh.strip(side,96,6,.012,(t,q)=>{
   const at=t*48,i=Math.min(47,Math.floor(at)),u=at-i;
   const centre=curve[i]*(1-u)+curve[i+1]*u;
   const edge=Math.min(1,t/.055,(1-t)/.055);
   const rounded=Math.sqrt(Math.max(0,1-(1-edge)**2));
   const thickness=.13*rounded;
   return [t,(centre-centreY)/width+(.5-q)*thickness,ink];
  });
  eyes.push(mesh.finish());
 }
 return eyes;
}
