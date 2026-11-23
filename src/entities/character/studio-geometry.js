// Extracted from the supplied neck-seam-fixed Character Studio. Geometry and morph limits are unchanged.
const groups = {
  head:'두상 · 이마 · 관자', eye:'눈자리 · 눈썹뼈', cheek:'광대 · 볼',
  nose:'미간 · 코', mouth:'입 주변 · 인중', jaw:'턱각 · 턱선 · 턱끝'
};
export const controls = [
  ['head','headWidth','전체 너비','좁게','넓게',.10,'두상 전체의 X 폭'],
  ['head','headHeight','전체 높이','낮게','높게',.08,'두상 전체의 Y 길이'],
  ['head','skull','뒤통수 깊이','얕게','깊게',.055,'뒤통수와 정수리 뒤쪽'],
  ['head','forehead','이마 돌출','뒤로','앞으로',.052,'이마 곡면 전체와 미간 위쪽'],
  ['head','foreheadHeight','이마 높이','낮게','높게',.045,'이마 상단과 두상 위쪽'],
  ['head','temple','관자 폭','좁게','넓게',.035,'관자에서 이마 옆면과 광대로 전이'],
  ['eye','brow','눈썹뼈 돌출','뒤로','앞으로',.030,'눈자리 위쪽의 융기'],
  ['eye','socket','눈자리 깊이','얕게','깊게',.023,'눈자리의 오목한 면과 양쪽 테두리'],
  ['eye','eyeHeight','눈자리 위치','아래로','위로',.033,'눈자리와 눈썹뼈·눈 밑의 높이'],
  ['eye','eyeGap','눈자리 간격','가깝게','멀게',.022,'좌우 눈자리 영역을 대칭 이동'],
  ['eye','eyeSpan','눈자리 폭','좁게','넓게',.18,'각 눈자리 중심을 기준으로 가로로 조정'],
  ['eye','eyeTilt','눈 바깥 기울기','낮게','높게',.17,'눈자리 안팎 높이차 조정'],
  ['eye','under','눈 밑 볼륨','낮게','도톰하게',.017,'눈 아래와 앞볼의 연결면'],
  ['cheek','zygoma','광대 폭','좁게','넓게',.041,'바깥 광대와 관자·턱 사이의 옆면'],
  ['cheek','cheek','앞볼 볼륨','납작하게','도톰하게',.042,'광대 아래의 전방 볼륨'],
  ['cheek','cheekLift','볼 위치','낮게','높게',.027,'볼 중심과 주변 곡면을 함께 이동'],
  ['nose','bridge','콧대 돌출','낮게','높게',.034,'코뿌리와 코끝 사이의 콧대'],
  ['nose','bridgeW','콧대 폭','좁게','넓게',.25,'콧대 중앙과 양옆 경사'],
  ['nose','tip','코끝 돌출','뒤로','앞으로',.040,'코끝부터 코밑까지 이어지는 면'],
  ['nose','noseY','코끝 높이','아래로','위로',.025,'코끝과 코밑을 함께 이동'],
  ['nose','wing','코 옆면 너비','좁게','넓게',.23,'코 옆면을 대칭 확대·축소'],
  ['mouth','mouthY','입자리 높이','아래로','위로',.033,'인중 아래와 입 주변 면의 Y 위치'],
  ['mouth','mouthZ','입 주변 돌출','뒤로','앞으로',.026,'입술이 놓일 전체 곡면과 턱 위쪽'],
  ['mouth','mouthW','입 주변 폭','좁게','넓게',.18,'입자리와 좌우 가이드 폭'],
  ['mouth','philtrum','인중 길이','짧게','길게',.023,'코밑 기준으로 입 위 영역 길이 조정'],
  ['jaw','jawWidth','턱각 너비','좁게','넓게',.041,'턱선 바깥과 뒤쪽 연결면'],
  ['jaw','jawY','턱선 높이','아래로','위로',.038,'턱각부터 턱밑까지의 Y 위치'],
  ['jaw','chinY','턱 길이','짧게','길게',.051,'턱끝과 아래턱 전체의 길이'],
  ['jaw','chinZ','턱끝 돌출','뒤로','앞으로',.051,'턱끝 앞면과 턱밑의 전후 위치'],
  ['jaw','chinWidth','턱끝 너비','좁게','넓게',.25,'턱끝 양옆과 아래턱의 폭']
].map(([group,key,label,minus,plus,limit,note])=>({group,key,label,minus,plus,limit,note}));

function smooth(lo,hi,value) {
  const t=Math.min(1,Math.max(0,(value-lo)/(hi-lo)));
  return t*t*t*(10+t*(-15+6*t));
}
function region(x,y,z,cx,cy,cz,rx,ry,rz) {
  const squared=((x-cx)/rx)**2+((y-cy)/ry)**2+((z-cz)/rz)**2;
  return Math.max(0,1-squared*.57)**3;
}
function buildFields(vertices, anchors) {
  const a=Object.fromEntries(anchors.filter(p=>p.side===1).map(p=>[p.id,p.p]));
  const fields=controls.map(()=>new Float32Array(vertices.length));
  for(let j=0;j<vertices.length;j+=3){
    const x=vertices[j], y=vertices[j+1], z=vertices[j+2], ax=Math.abs(x), s=Math.sign(x);
    const local=(id,rx,ry,rz)=>region(ax,y,z,...a[id],rx,ry,rz);
    const front=smooth(.07,.30,z);
    const symmetry=s*smooth(0,.10,ax);
    const eye=local('socket',.159,.141,.19)*front*smooth(.010,.092,ax);
    const cheek=local('cheek',.168,.157,.24)*front;
    const outer=local('zygoma',.174,.185,.31);
    const jaw=local('jaw',.206,.182,.39);
    const chin=local('chin',.231,.197,.34);
    const bridge=local('bridge',.107,.146,.163)*front;
    const tip=local('tip',.133,.104,.177)*front;
    const mouth=local('mouth',.225,.137,.24)*front;
    const philtrum=local('base',.112,.127,.18)*front*smooth(-.458,-.538,y);
    const back=(1-smooth(-.43,-.06,z))*smooth(-.54,-.18,y);
    const forehead=local('forehead',.45,.34,.33)*front;
    const temple=local('temple',.15,.21,.45);
    const brow=region(ax,y,z,a.socket[0],a.brow[1]+.004,a.brow[2]-.022,.175,.087,.23)*front;
    const under=local('under',.160,.110,.22)*front;
    const targets=[
      [x,0,0], [0,y+.132,0], [0,0,-back],
      [0,0,forehead], [0,smooth(-.14,.37,y),0], [symmetry*temple,0,0],
      [0,0,brow], [0,0,-eye], [0,eye,0], [symmetry*eye,0,0],
      [s*(ax-a.socket[0])*eye,0,0], [0,(ax-a.socket[0])*eye,0], [.12*symmetry*under,0,under],
      [symmetry*outer,0,.18*outer], [.32*symmetry*cheek,0,cheek], [0,cheek,0],
      [0,0,bridge], [x*bridge,0,0], [0,.08*tip,tip], [0,tip,0], [x*tip,0,0],
      [0,mouth,0], [0,0,mouth], [x*mouth,0,0], [0,-philtrum,0],
      [symmetry*jaw,0,.09*jaw], [0,jaw,0], [0,-chin,0], [0,0,chin], [x*chin,0,0]
    ];
    for(let k=0;k<fields.length;k++)fields[k].set(targets[k],j);
  }
  return fields;
}
function displace(base, output, fields, values, strength=1) {
  output.set(base);
  for(let k=0;k<fields.length;k++){
    const amount=values[k]*controls[k].limit*strength;
    if(!amount)continue;
    const field=fields[k];
    for(let i=0;i<output.length;i++)output[i]+=field[i]*amount;
  }
}
function triangleCross(p, i, ix, out) {
  const a=ix[i]*3,b=ix[i+1]*3,c=ix[i+2]*3;
  const ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2];
  const vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];
  out[0]=uy*vz-uz*vy;out[1]=uz*vx-ux*vz;out[2]=ux*vy-uy*vx;
}
function makeDeformer(base, indices, fields) {
  const rest=new Float64Array(indices.length);
  const cross=[0,0,0];
  for(let i=0;i<indices.length;i+=3){
    triangleCross(base,i,indices,cross);rest.set(cross,i);
  }
  function withinLimit(pose){
    for(let i=0;i<indices.length;i+=3){
      const x=rest[i],y=rest[i+1],z=rest[i+2],squared=x*x+y*y+z*z;
      if(squared<1e-22)continue;
      triangleCross(pose,i,indices,cross);
      const [a,b,c]=cross;
      if(a*x+b*y+c*z<=0||a*a+b*b+c*c<squared*.04)return false;
    }
    return true;
  }
  return (pose,values)=>{
    displace(base,pose,fields,values);
    if(withinLimit(pose))return 1;
    let low=0,high=1;
    for(let i=0;i<8;i++){
      const mid=(low+high)*.5;
      displace(base,pose,fields,values,mid);
      if(withinLimit(pose))low=mid;else high=mid;
    }
    displace(base,pose,fields,values,low);
    return low;
  };
}
function normalsFor(p, indices, normals) {
  normals.fill(0);
  for(let i=0;i<indices.length;i+=3){
    const a=3*indices[i],b=3*indices[i+1],c=3*indices[i+2];
    const ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2];
    const vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];
    const x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx;
    for(const j of [a,b,c]){normals[j]+=x;normals[j+1]+=y;normals[j+2]+=z;}
  }
  for(let j=0;j<normals.length;j+=3){
    const length=Math.hypot(normals[j],normals[j+1],normals[j+2])||1;
    normals[j]/=length;normals[j+1]/=length;normals[j+2]/=length;
  }
  return normals;
}

function rotate(m,[x,y,z]) {
  return [m[0]*x+m[3]*y+m[6]*z,m[1]*x+m[4]*y+m[7]*z,m[2]*x+m[5]*y+m[8]*z];
}

function multiply(left,right) {
  return [0,3,6].flatMap(start => rotate(left,right.slice(start,start+3)));
}

function turn([x,y,z],degrees) {
  const angle = degrees*Math.PI/180;
  const s = Math.sin(angle), c = Math.cos(angle), t = 1-c;
  return [
    c+x*x*t, y*x*t+z*s, z*x*t-y*s,
    x*y*t-z*s, c+y*y*t, z*y*t+x*s,
    x*z*t+y*s, y*z*t-x*s, c+z*z*t
  ];
}

function worldTransforms(data,pose) {
  const transforms = new Map();
  for (const bone of data.bones) {
    const parent = transforms.get(bone.parent) || {rotation:identity,offset:origin};
    let local = identity;
    bone.axes.forEach((axis,i) => {
      const degrees = pose[bone.id][i];
      if (degrees) local = multiply(local,turn(axis.d,degrees));
    });
    const pivot = bone.pivot.map(value => value/HEIGHT);
    const movedPivot = rotate(local,pivot);
    const displacement = rotate(parent.rotation,pivot.map((value,i) => value-movedPivot[i]));
    transforms.set(bone.id,{
      rotation:multiply(parent.rotation,local),
      offset:parent.offset.map((value,i) => value+displacement[i])
    });
  }
  return transforms;
}


function makeIntegratedFace(data,position,normal,indices) {
  const face=data.face;
  const base=unpack(face.positions,Float32Array), topology=unpack(face.triangles,Uint16Array);
  const fields=buildFields(base,face.anchors);
  const deform=makeDeformer(base,topology,fields);
  const rest=position.slice(face.start*3), edited=base.slice(), n=new Float32Array(position.length);
  const ids=unpack(face.sourceIds,Uint16Array), factors=unpack(face.sourceFactors,Float32Array);
  const radialFreedom=new Float32Array(ids.length/2);
  const [rx,rz]=face.collarRadii;
  for(let i=0;i<radialFreedom.length;i++){
    const r=Math.hypot(rest[i*3]/rx,(rest[i*3+2]-face.collarCenterZ)/rz);
    const y=base[ids[i*2]*3+1];
    const heightBlend=smooth(-.39,-.25,y);
    const radiusBlend=smooth(1.01,1.65,r);
    radialFreedom[i]=1-(1-heightBlend)*(1-radiusBlend);
  }
  // Recompute the shared collar normals with neighboring head and neck faces.
  const affected=new Uint8Array(position.length/3);
  for(let i=face.start;i<affected.length;i++)affected[i]=1;
  face.rimOriginal.forEach(i=>affected[i]=1);
  const adjacent=[];
  for(let i=0;i<data.parts[0].count;i+=3){
    if(affected[indices[i]]||affected[indices[i+1]]||affected[indices[i+2]]) adjacent.push(i);
  }
  const cross=[0,0,0];
  return {
    base,edited,fields,
    values:controls.map(()=>0),strength:1,dirty:true,status:()=>{},
    update(){
      if(!this.dirty)return false;
      this.strength=deform(edited,this.values);
      for(let i=0;i<ids.length;i+=2){
        const a=ids[i]*3,b=ids[i+1]*3,t=factors[i],influence=factors[i+1];
        const k=i/2*3, destination=face.start*3+k;
        for(let axis=0;axis<3;axis++){
          const shift=(edited[a+axis]-base[a+axis])*(1-t)+(edited[b+axis]-base[b+axis])*t;
          position[destination+axis]=rest[k+axis]+shift*influence*face.scale[axis]*(axis===1?1:radialFreedom[i/2]);
        }
      }
      n.fill(0);
      for(const i of adjacent){
        triangleCross(position,i,indices,cross);
        for(let j=0;j<3;j++){
          const a=3*indices[i+j];n[a]+=cross[0];n[a+1]+=cross[1];n[a+2]+=cross[2];
        }
      }
      for(let i=0;i<affected.length;i++){
        if(!affected[i])continue;
        const k=i*3,length=Math.hypot(n[k],n[k+1],n[k+2]);
        if(length)for(let axis=0;axis<3;axis++)normal[k+axis]=Math.round(127*n[k+axis]/length);
      }
      this.dirty=false;this.status();return true;
    }
  };
}


const HEIGHT=1428,UNIT=32*HEIGHT;
const identity=[1,0,0,0,1,0,0,0,1],origin=[0,0,0];
function unpack(encoded,Type){
 const binary=atob(encoded),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return new Type(bytes.buffer);
}
function linear(hex){
 return [1,3,5].map(i=>{const v=parseInt(hex.slice(i,i+2),16)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
}
function srgb(v){return Math.round(255*(v<=.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-.055));}
function ramp(a,b,value){const t=Math.max(0,Math.min(1,(value-a)/(b-a)));return t*t*(3-2*t);}

export function createStudioGeometry(source) {
let state; const bodyCache=new Map();
function palette(){return source.palettes.find(p=>p.id===state.skin);}
function blush(){return source.blushes.find(p=>p.id===state.blush);}
function cheekCenter(){
 const body=getBody(),anchor=anchors.find(a=>a.id==='cheek'&&a.side===1),point=[0,0,0];
 for(let j=0;j<anchor.ids.length;j++)for(let axis=0;axis<3;axis++)point[axis]+=body.editor.edited[anchor.ids[j]*3+axis]*anchor.w[j];
 return point;
}
function blushWeight(point,center=cheekCenter()){
 const squared=((Math.abs(point[0])-Math.abs(center[0]))/.085)**2+((point[1]-center[1])/.065)**2;
 return Math.exp(-squared)*ramp(.20,.30,point[2])*blush().strength;
}
function faceScale(data){return data.face.scale.map(v=>v/UNIT);}
function faceOffset(data){return data.headOffset.map(v=>v/HEIGHT);}

const bytes=unpack(source.faceGlb,Uint8Array),header=new DataView(bytes.buffer);
const jsonLength=header.getUint32(12,true),binOffset=28+jsonLength;
const faceDocument=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+jsonLength)));
function accessor(id){
 const a=faceDocument.accessors[id],v=faceDocument.bufferViews[a.bufferView];
 const columns={SCALAR:1,VEC3:3,VEC4:4}[a.type],Type={5126:Float32Array,5123:Uint16Array,5125:Uint32Array}[a.componentType];
 if(v.byteStride)throw Error('압축된 정점 배열을 읽을 수 없어.');
 return new Type(bytes.buffer,binOffset+(v.byteOffset||0)+(a.byteOffset||0),a.count*columns).slice();
}
const anchors=source.bodies.female.face.anchors;
const featureObjects=faceDocument.meshes.flatMap((mesh,meshIndex)=>mesh.extras.eyeStyle==='common'?[]:mesh.primitives.map((primitive,primitiveIndex)=>{
 const base=accessor(primitive.attributes.POSITION),normals=accessor(primitive.attributes.NORMAL),indices=accessor(primitive.indices);
 const material=faceDocument.materials[primitive.material],extra=mesh.extras;
 // Nose accent: adjust transverse stroke width only. Keep its Y/Z endpoints unchanged.
 if(extra.feature==='nose')for(let k=0;k<base.length;k+=3)base[k]*=1.12;
 const colors=primitive.attributes.COLOR_0===undefined?null:accessor(primitive.attributes.COLOR_0);
 return {name:mesh.name,key:meshIndex+':'+primitiveIndex,extra,material,base,baseNormals:normals,fields:null,
  edited:base.slice(),localNormals:normals.slice(),positions:new Float32Array(base.length),normals:new Float32Array(base.length),
  indices:Uint32Array.from(indices),baseColors:colors,colors:colors?.slice()??null,skin:!!material.extras?.sernbeldSkin,
  jointIds:new Uint8Array(base.length/3*4),weights:Uint8Array.from({length:base.length/3*4},(_,i)=>i%4===0?255:0),
  skins:['head'],gpu:null};
}));
function visible(object){
 const e=object.extra;
 if(e.feature==='nose'||e.feature==='ear')return true;
 if(e.feature==='glasses')return e.variant===state.glasses;
 if(e.feature==='moustache')return e.variant===state.moustache;
 if(e.feature==='brow')return e.variant===state.brow;
 if(e.feature==='mouth')return e.variant===state.mouth;
 return e.eyeStyle===state.eye;
}
function getBody(){
 if(bodyCache.has(state.body))return bodyCache.get(state.body);
 const data=source.bodies[state.body],base=unpack(data.p,Int16Array),fitted=unpack(data.face.fitted,Float32Array);
 const position=new Float32Array(Math.max(base.length,data.face.start*3+fitted.length));
 position.set(base);position.set(fitted,data.face.start*3);
 const packedNormals=unpack(data.n,Int8Array),indices=unpack(data.f,data.indexType==='Uint32Array'?Uint32Array:Uint16Array);
 const joints=unpack(data.wi,Uint8Array),weights=unpack(data.ww,Uint8Array);
 const editor=makeIntegratedFace(data,position,packedNormals,indices);
 const worldPositions=new Float32Array(position.length),normals=new Float32Array(position.length);
 const result={data,position,packedNormals,indices:Uint32Array.from(indices),editor,worldPositions,normals,joints,weights,gpu:null};
 bodyCache.set(state.body,result);return result;
}
function tintIris(object){
 if(!object.baseColors)return null;
 const colors=object.baseColors.slice(),target=linear(state.iris);
 for(let i=0;i<colors.length;i+=3){
  const r=colors[i],g=colors[i+1],b=colors[i+2],mask=ramp(.019,.11,r-g)*ramp(.028,.13,b-g),value=Math.max(r,g,b);
  for(let axis=0;axis<3;axis++)colors[i+axis]=colors[i+axis]*(1-mask)+Math.min(1,target[axis]*value/.37)*mask;
 }
 return colors;
}
function updateGeometry(){
 const body=getBody(),editor=body.editor;
 editor.values=state.values.slice();editor.dirty=true;editor.update();
 for(let i=0;i<body.position.length;i++){body.worldPositions[i]=body.position[i]/UNIT;body.normals[i]=body.packedNormals[i]/127;}
 const scale=faceScale(body.data),offset=faceOffset(body.data);
 for(const object of featureObjects.filter(visible)){
  displace(object.base,object.edited,object.fields??=buildFields(object.base,anchors),state.values,editor.strength);
  if(state.values.some(Boolean))normalsFor(object.edited,object.indices,object.localNormals);
  else object.localNormals.set(object.baseNormals);
  // Keep the large circular lenses truly round for both body presets.
  const objectScale=object.extra.feature==='glasses'&&object.extra.variant==='biground'?[scale[0],scale[0],scale[2]]:scale;
  for(let i=0;i<object.edited.length;i+=3){
   const n=object.localNormals.subarray(i,i+3),length=Math.hypot(n[0]/objectScale[0],n[1]/objectScale[1],n[2]/objectScale[2])||1;
   for(let axis=0;axis<3;axis++){
    object.positions[i+axis]=object.edited[i+axis]*objectScale[axis]+offset[axis];
    object.normals[i+axis]=n[axis]/objectScale[axis]/length;
   }
  }
 }

 
 return body;
}
function updateColors(){
 for(const object of featureObjects.filter(visible)){
  if(object.extra.iris)object.colors=tintIris(object);
  if(object.extra.softInk){
   const skin=linear(palette().light),ink=linear('#8C6D64'),strength=object.extra.feature==='nose'?.23:.23,color=skin.map((v,i)=>v*(1-strength)+ink[i]*strength);
   object.colors=new Float32Array(object.base.length);
   for(let i=0;i<object.colors.length;i+=3)object.colors.set(color,i);
  }
 }

}

return {source,build(profile){state=profile;const body=updateGeometry();updateColors();return {body,features:featureObjects.filter(visible),palette:palette(),blush:blush(),cheek:cheekCenter()};}};
}
