// Deterministic draft meshes, not approved art. Source of the generated GLBs.
export const definitions=[
  {
    "id": "beach-morning-glory",
    "name": "갯나팔꽃",
    "kind": "creeper",
    "height": 0.19,
    "spread": 0.48,
    "leaf": "#507B4A",
    "stem": "#667D49",
    "accent": "#A978C6",
    "habitat": "해안 모래땅",
    "seed": 11
  },
  {
    "id": "purple-bell",
    "name": "자주방울초",
    "kind": "bells",
    "height": 0.36,
    "spread": 0.25,
    "leaf": "#5E8954",
    "stem": "#72925C",
    "accent": "#8E6ABA",
    "habitat": "길가와 초지",
    "seed": 12
  },
  {
    "id": "roadside-mugwort",
    "name": "길뚝쑥",
    "kind": "herb",
    "height": 0.43,
    "spread": 0.3,
    "leaf": "#6B8D6C",
    "stem": "#748D62",
    "accent": "#A3B190",
    "habitat": "길뚝",
    "seed": 13
  },
  {
    "id": "round-clover",
    "name": "둥근토끼풀",
    "kind": "clover",
    "height": 0.15,
    "spread": 0.3,
    "leaf": "#659754",
    "stem": "#7C9B5A",
    "accent": "#F3E9D5",
    "habitat": "풀밭",
    "seed": 14
  },
  {
    "id": "water-reed",
    "name": "물깃갈대",
    "kind": "reed",
    "height": 1.05,
    "spread": 0.45,
    "leaf": "#77965B",
    "stem": "#8B9860",
    "accent": "#C5AB79",
    "habitat": "습지",
    "seed": 15
  },
  {
    "id": "spring-cattail",
    "name": "샘부들",
    "kind": "cattail",
    "height": 0.8,
    "spread": 0.35,
    "leaf": "#658E61",
    "stem": "#7F9C62",
    "accent": "#916D45",
    "habitat": "샘과 물가",
    "seed": 16
  },
  {
    "id": "green-thread-moss",
    "name": "녹실이끼",
    "kind": "moss",
    "height": 0.055,
    "spread": 0.37,
    "leaf": "#789D54",
    "stem": "#526F3B",
    "accent": "#A9B967",
    "habitat": "그늘진 돌",
    "seed": 17
  },
  {
    "id": "shade-fern",
    "name": "그늘고사리",
    "kind": "fern",
    "height": 0.43,
    "spread": 0.55,
    "leaf": "#4F8955",
    "stem": "#789A57",
    "accent": "#93B76A",
    "habitat": "그늘",
    "seed": 18
  },
  {
    "id": "wave-cap-mushroom",
    "name": "물결갓버섯",
    "kind": "mushroom",
    "height": 0.19,
    "spread": 0.29,
    "leaf": "#B28C6E",
    "stem": "#D9C9A7",
    "accent": "#9E795D",
    "habitat": "축축한 그늘",
    "seed": 19
  },
  {
    "id": "stone-sawgrass",
    "name": "돌톱풀",
    "kind": "sawgrass",
    "height": 0.27,
    "spread": 0.36,
    "leaf": "#719376",
    "stem": "#7B9570",
    "accent": "#ADC2A0",
    "habitat": "돌 틈",
    "seed": 20
  }
];
function buildGlb(d){
 const V=(x,y,z)=>[x,y,z],add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>mul(a,1/(Math.hypot(...a)||1));
 let state=d.seed;const rand=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
 const groups=[[],[],[],[]],h=d.height,w=d.spread,TAU=Math.PI*2;
 function tri(g,a,b,c){const n=unit(cross(sub(b,a),sub(c,a)));if(Math.hypot(...n)<.5)return;for(const p of [a,b,c])groups[g].push(...p,...n);}
 function quad(g,a,b,c,e){tri(g,a,b,c);tri(g,a,c,e);}
 function tube(g,points,radii,sides=7){const rings=points.map((p,j)=>{const dir=unit(sub(points[Math.min(j+1,points.length-1)],points[Math.max(j-1,0)])),u=unit(cross(dir,Math.abs(dir[1])>.9?V(1,0,0):V(0,1,0))),v=cross(dir,u);return Array.from({length:sides},(_,i)=>add(p,add(mul(u,Math.cos(i*TAU/sides)*radii[j]),mul(v,Math.sin(i*TAU/sides)*radii[j]))));});for(let j=0;j<rings.length-1;j++)for(let i=0;i<sides;i++)quad(g,rings[j][i],rings[j][(i+1)%sides],rings[j+1][(i+1)%sides],rings[j+1][i]);for(let i=0;i<sides;i++){tri(g,points[0],rings[0][(i+1)%sides],rings[0][i]);tri(g,points.at(-1),rings.at(-1)[i],rings.at(-1)[(i+1)%sides]);}}
 function leaf(g,origin,angle,len,width,rise=.2,serrated=false){const dir=V(Math.cos(angle),0,Math.sin(angle)),side=V(-dir[2],0,dir[0]),rows=[];for(let j=0;j<=8;j++){const t=j/8,c=add(origin,add(mul(dir,len*t),V(0,len*(rise*t+.19*Math.sin(Math.PI*t)),0))),ww=width*Math.pow(Math.sin(Math.PI*t),.8)*(serrated&&j%2===0?.65:1);rows.push([add(c,mul(side,-ww)),add(c,V(0,width*.17*Math.sin(Math.PI*t),0)),add(c,mul(side,ww))]);}for(let j=0;j<8;j++){quad(g,rows[j][0],rows[j+1][0],rows[j+1][1],rows[j][1]);quad(g,rows[j][1],rows[j+1][1],rows[j+1][2],rows[j][2]);}}
 function radial(g,center,rx,ry,rz,steps=12,bands=6,wave=0){const rings=[];for(let j=0;j<=bands;j++){const t=Math.PI*j/bands; rings.push(Array.from({length:steps},(_,i)=>{const a=i*TAU/steps,k=1+wave*Math.cos(a*5);return add(center,V(rx*Math.sin(t)*Math.cos(a)*k,ry*Math.cos(t),rz*Math.sin(t)*Math.sin(a)*k));}));}for(let j=0;j<bands;j++)for(let i=0;i<steps;i++)quad(g,rings[j][i],rings[j+1][i],rings[j+1][(i+1)%steps],rings[j][(i+1)%steps]);}
 function flower(center,size,down=false){const rings=[],sign=down?-1:1;for(let j=0;j<=5;j++){const t=j/5;const r=size*(.15+.85*t*t);rings.push(Array.from({length:20},(_,i)=>{const a=TAU*i/20,petal=1+.13*Math.cos(5*a)*t;return add(center,V(r*petal*Math.cos(a),sign*size*t*.65+size*.09*Math.cos(5*a)*t*t,r*petal*Math.sin(a)));}));}for(let j=0;j<5;j++)for(let i=0;i<20;i++)quad(2,rings[j][i],rings[j+1][i],rings[j+1][(i+1)%20],rings[j][(i+1)%20]);radial(3,add(center,V(0,sign*size*.15,0)),size*.13,size*.12,size*.13,8,4);}
 function stalk(x,z,height,bend){const p=[V(x,0,z),V(x+bend*.25,height*.33,z),V(x+bend*.65,height*.66,z+bend*.15),V(x+bend,height,z+bend*.2)];tube(1,p,[h*.012,h*.01,h*.007,h*.003]);return p;}
 if(d.kind==="creeper"){for(let k=0;k<5;k++){const a=k*TAU/5+rand()*.3,dir=V(Math.cos(a),0,Math.sin(a)),p=[V(0,.012,0),add(mul(dir,w*.17),V(0,h*.13,0)),add(mul(dir,w*.37),V(0,h*.22,0))];tube(1,p,[.005,.004,.003]);for(let j=1;j<3;j++){leaf(0,p[j],a+.9,w*.26,w*.105,.15);leaf(0,p[j],a-.9,w*.25,w*.09,.16);}if(k%2===0){const b=add(p[2],V(0,h*.38,0));tube(1,[p[2],b],[.004,.002]);flower(b,h*.28);}}}
 else if(d.kind==="bells"||d.kind==="herb"){for(let k=0;k<5;k++){const a=k*TAU/5,x=Math.cos(a)*w*.12,z=Math.sin(a)*w*.12,p=stalk(x,z,h*(.65+rand()*.35),Math.cos(a)*w*.19);for(let j=1;j<3;j++){leaf(0,p[j],a+j*1.4,w*.32,w*(d.kind==="herb"?.10:.065),.12,d.kind==="herb");leaf(0,p[j],a+j*1.4+Math.PI,w*.27,w*.07,.2,d.kind==="herb");}if(d.kind==="bells"){for(let j=0;j<2;j++){const c=add(p[3],V(Math.cos(a)*w*.10*j,-h*.03*j,Math.sin(a)*w*.1*j));flower(c,h*.10,true);}}else for(let j=0;j<3;j++)radial(3,add(p[3],V(Math.cos(a+j)*w*.04,-h*.025*j,Math.sin(a+j)*w*.04)),w*.035,h*.035,w*.035,7,4);}}
 else if(d.kind==="clover"){for(let k=0;k<9;k++){const a=k*TAU/9,r=w*(.08+rand()*.24),p=stalk(Math.cos(a)*r,Math.sin(a)*r,h*(.35+rand()*.42),w*.02);for(let j=0;j<3;j++)leaf(0,p[3],a+j*TAU/3,w*.17,w*.075,.08);if(k%4===0){const c=add(p[3],V(0,h*.22,0));tube(1,[p[3],c],[.003,.002]);for(let j=0;j<8;j++){const q=j*TAU/8;radial(2,add(c,V(Math.cos(q)*h*.07,0,Math.sin(q)*h*.07)),h*.07,h*.08,h*.07,7,4);}}}}
 else if(d.kind==="reed"||d.kind==="cattail"){for(let k=0;k<8;k++){const a=k*TAU/8,r=w*(.05+rand()*.22),x=Math.cos(a)*r,z=Math.sin(a)*r,p=stalk(x,z,h*(.65+rand()*.32),Math.cos(a)*w*.13);for(let j=0;j<3;j++)leaf(0,p[j],a+j*.8,w*.65,w*.045,1.25);if(d.kind==="cattail"){const c=add(p[3],V(0,-h*.08,0));radial(2,c,w*.055,h*.095,w*.055,9,6);}else{for(let j=0;j<6;j++){const b=add(p[3],V(Math.cos(a+j)*w*.06,-j*h*.017,Math.sin(a+j)*w*.06));radial(2,b,w*.025,h*.035,w*.025,6,4);}}}}
 else if(d.kind==="moss"){for(let k=0;k<32;k++){const a=rand()*TAU,r=Math.sqrt(rand())*w*.42,rx=w*(.035+rand()*.07),ry=h*(.14+rand()*.3);radial(k%5===0?3:0,V(Math.cos(a)*r,ry,Math.sin(a)*r),rx,ry,rx*.84,8,4,.13);}}
 else if(d.kind==="fern"){for(let k=0;k<7;k++){const a=k*TAU/7,dir=V(Math.cos(a),0,Math.sin(a)),p=[];for(let j=0;j<=8;j++){const t=j/8;p.push(add(mul(dir,w*.48*t),V(0,h*(Math.sin(t*Math.PI*.68)*.85),0)));}tube(1,p,p.map((_,i)=>.006*(1-i/10)),5);for(let j=1;j<8;j++){const width=w*.20*Math.sin(Math.PI*j/8);leaf(0,p[j],a+1.0,width,w*.024,.05,true);leaf(0,p[j],a-1.0,width,w*.024,.05,true);}leaf(3,p[7],a,w*.12,w*.018,.10);}}
 else if(d.kind==="mushroom"){for(let k=0;k<4;k++){const a=k*TAU/4,r=w*(k===0?0:.23),x=Math.cos(a)*r,z=Math.sin(a)*r,H=h*(k===0?1:.57+rand()*.2),c=V(x,H*.75,z);tube(1,[V(x,0,z),V(x+.005,H*.45,z),c],[H*.075,H*.055,H*.044],10);radial(2,c,H*.42,H*.19,H*.42,18,8,.12);radial(3,add(c,V(0,-H*.07,0)),H*.34,H*.035,H*.34,18,4,.08);}}
 else if(d.kind==="sawgrass"){for(let k=0;k<12;k++){const a=k*TAU/12+rand()*.2,r=w*.06*rand();leaf(k%4===0?3:0,V(Math.cos(a)*r,.005,Math.sin(a)*r),a,w*(.34+rand()*.24),w*.044,1.1,true);}}
 const srgb=s=>{const x=parseInt(s,16)/255;return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4);};
 const rgb=hex=>[srgb(hex.slice(1,3)),srgb(hex.slice(3,5)),srgb(hex.slice(5,7)),1];
 const colors=[d.leaf,d.stem,d.accent,d.kind==="mushroom"?"#D4B79A":d.kind==="creeper"||d.kind==="bells"?"#F2D59A":d.accent];
 const chunks=[],views=[],accessors=[],primitives=[],materials=[];let offset=0,triangles=0;const bounds=[ [Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity] ];
 for(let g=0;g<groups.length;g++){const data=groups[g];if(!data.length)continue;const arr=Float32Array.from(data),bytes=new Uint8Array(arr.buffer);const count=arr.length/6;let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<arr.length;i+=6)for(let q=0;q<3;q++){min[q]=Math.min(min[q],arr[i+q]);max[q]=Math.max(max[q],arr[i+q]);bounds[0][q]=Math.min(bounds[0][q],arr[i+q]);bounds[1][q]=Math.max(bounds[1][q],arr[i+q]);}
 const view=views.length;views.push({buffer:0,byteOffset:offset,byteLength:bytes.length,byteStride:24,target:34962});chunks.push(bytes);offset+=bytes.length;
 const p=accessors.length;accessors.push({bufferView:view,byteOffset:0,componentType:5126,count,type:"VEC3",min,max},{bufferView:view,byteOffset:12,componentType:5126,count,type:"VEC3"});const material=materials.length;materials.push({name:["leaf","stem","accent","detail"][g],doubleSided:true,pbrMetallicRoughness:{baseColorFactor:rgb(colors[g]),metallicFactor:0,roughnessFactor:.92}});primitives.push({attributes:{POSITION:p,NORMAL:p+1},material,mode:4});triangles+=count/3;
 }
 const doc={asset:{version:"2.0",generator:"Sernbeld ecology prototype batch v1"},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:d.id}],meshes:[{primitives}],materials,buffers:[{byteLength:offset}],bufferViews:views,accessors};
 const json=JSON.stringify(doc),jlen=(json.length+3)&~3,bytes=new Uint8Array(28+jlen+offset),dv=new DataView(bytes.buffer);dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,bytes.length,true);dv.setUint32(12,jlen,true);dv.setUint32(16,0x4e4f534a,true);bytes.fill(32,20,20+jlen);for(let i=0;i<json.length;i++)bytes[20+i]=json.charCodeAt(i);dv.setUint32(20+jlen,offset,true);dv.setUint32(24+jlen,0x004e4942,true);let pos=28+jlen;for(const c of chunks){bytes.set(c,pos);pos+=c.length;}
 return {bytes,triangles,bounds};
}
function inspectGlb(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(v.getUint32(0,true)!==0x46546c67||v.getUint32(4,true)!==2||v.getUint32(8,true)!==bytes.length)throw Error("invalid GLB");
 const size=v.getUint32(12,true),j=JSON.parse(Array.from(bytes.slice(20,20+size),x=>String.fromCharCode(x)).join(""));const start=28+size;if(v.getUint32(20+size,true)!==bytes.length-start||v.getUint32(24+size,true)!==0x004e4942)throw Error("invalid binary chunk");
 let triangles=0;for(const primitive of j.meshes[0].primitives){const a=j.accessors[primitive.attributes.POSITION],b=j.bufferViews[a.bufferView];if(a.count%3||a.count<=0||b.byteOffset+b.byteLength>j.buffers[0].byteLength)throw Error("invalid accessor");for(let i=0;i<a.count;i++){for(let k=0;k<6;k++)if(!Number.isFinite(v.getFloat32(start+b.byteOffset+i*24+k*4,true)))throw Error("non-finite geometry");}triangles+=a.count/3;}
 return triangles;
}
export {buildGlb,inspectGlb};
