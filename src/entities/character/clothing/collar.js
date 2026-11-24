// Rear-joined collar from SERNBELD_collar_gesture_viewer.html (2026-11-24).
// Retain the complete fitted geometry and topology, independent of the body mesh.
export function fitCollarSurface(positions, indices, neck, head, bodyHeight) {
  const span=head[1]-neck[1];
  if(!(span>bodyHeight*.012))throw Error('목 관절 범위를 확인할 수 없음');
  const N=192, K=180, TAU=Math.PI*2, mix=(a,b,t)=>a+(b-a)*t;
  const lo=neck[1]-bodyHeight*.045, hi=head[1]+bodyHeight*.009;
  const triangles=[];
  for(let k=0;k<indices.length;k+=3){
    const a=indices[k]*3,b=indices[k+1]*3,c=indices[k+2]*3;
    const ya=positions[a+1],yb=positions[b+1],yc=positions[c+1];
    if(Math.max(ya,yb,yc)<lo||Math.min(ya,yb,yc)>hi)continue;
    if(Math.min(Math.abs(positions[a]),Math.abs(positions[b]),Math.abs(positions[c]))>bodyHeight*.18)continue;
    triangles.push([a,b,c]);
  }
  const grid=[];
  function ray(segs,x,z,dx,dz){
    let best=Infinity;
    for(const [ax,az,bx,bz] of segs){
      const ex=bx-ax,ez=bz-az,den=dx*ez-dz*ex;
      if(Math.abs(den)<1e-12)continue;
      const vx=ax-x,vz=az-z,t=(vx*ez-vz*ex)/den,u=(vx*dz-vz*dx)/den;
      if(t>1e-8&&u>=-1e-7&&u<=1+1e-7&&t<best)best=t;
    }
    return best;
  }
  for(let j=0;j<=K;j++){
    const y=mix(lo,hi,(j+.00013)/K),segments=[];
    for(const tri of triangles){
      const q=[];
      for(let i=0;i<3;i++){
        const a=tri[i],b=tri[(i+1)%3],ay=positions[a+1],by=positions[b+1];
        if((ay<=y&&by>y)||(by<=y&&ay>y)){
          const t=(y-ay)/(by-ay);q.push(mix(positions[a],positions[b],t),mix(positions[a+2],positions[b+2],t));
        }
      }
      if(q.length===4)segments.push(q);
    }
    const t=Math.max(0,Math.min(1,(y-neck[1])/span));
    const x=mix(neck[0],head[0],t),z0=mix(neck[2],head[2],t);
    const crossings=[];
    for(const [ax,az,bx,bz] of segments){
      if((ax<=x&&bx>x)||(bx<=x&&ax>x))crossings.push(mix(az,bz,(x-ax)/(bx-ax)));
    }
    crossings.sort((a,b)=>a-b);
    const uniq=crossings.filter((v,i)=>!i||v-crossings[i-1]>bodyHeight*1e-6);
    let pair=null,score=Infinity;
    for(let i=0;i+1<uniq.length;i+=2){
      const a=uniq[i],b=uniq[i+1],w=b-a;
      if(w<bodyHeight*.022||w>bodyHeight*.25)continue;
      const s=Math.abs((a+b)/2-z0)+(z0<a||z0>b?bodyHeight*.05:0);
      if(s<score){score=s;pair=[a,b];}
    }
    if(!pair){grid.push(null);continue;}
    const z=(pair[0]+pair[1])/2,rs=[];
    for(let i=0;i<N;i++){const a=i/N*TAU;rs.push(ray(segments,x,z,Math.sin(a),Math.cos(a)));}
    if(rs.some(v=>!Number.isFinite(v)||v<bodyHeight*.008||v>bodyHeight*.18)){grid.push(null);continue;}
    const r=rs.reduce((s,v)=>s+v,0)/N;
    grid.push({y,x,z,rs,r,ratio:Math.max(...rs)/Math.min(...rs)});
  }
  const choices=grid.filter(g=>g&&g.y>=neck[1]+span*.20&&g.y<=neck[1]+span*.78&&g.ratio<2.3);
  if(!choices.length)throw Error('유효한 목 단면을 찾지 못함');
  const minR=Math.min(...choices.map(g=>g.r));
  const candidates=choices.filter(g=>g.r<minR*1.13&&g.y>=lo+minR*.85);
  if(!candidates.length)throw Error('카라를 배치할 목 구간 부족');
  const top=candidates.reduce((a,b)=>Math.abs(b.y-(neck[1]+span*.72))<Math.abs(a.y-(neck[1]+span*.72))?b:a);
  const r=top.r, margin=Math.max(r*.065,bodyHeight*.0013)+.0005, bandH=.030;
  function section(y,a){
    if(y<lo||y>hi)return null;
    const f=Math.max(0,Math.min(K-1e-7,(y-lo)/(hi-lo)*K-.00013));
    const j=Math.floor(f),t=f-j,A=grid[j],B=grid[j+1];
    if(!A||!B)return null;
    const af=((a%TAU+TAU)%TAU)/TAU*N,i=Math.floor(af),q=af-i;
    const rad=g=>mix(g.rs[i%N],g.rs[(i+1)%N],q);
    return {x:mix(A.x,B.x,t),z:mix(A.z,B.z,t),r:mix(rad(A),rad(B),t)};
  }
  const S=112,R=14,join=37,vertices=[],faces=[],groups=[];
  const smooth01=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  const start=19*Math.PI/180,baseGap=2.8*Math.PI/180,hemGap=36*Math.PI/180;
  const point=(y,a,extra=0)=>{
    const s=section(y,a);if(!s)throw Error('목 단면이 끊긴 위치에 카라가 도달함');
    return [s.x+Math.sin(a)*(s.r+margin+extra),y,s.z+Math.cos(a)*(s.r+margin+extra)];
  };
  function vertex(p){vertices.push(...p);return vertices.length/3-1;}
  const seam=[];
  for(let i=0;i<=S;i++){const a=mix(start,TAU-start,i/S);seam.push(vertex(point(top.y,a)));}
  function connect(a,b,reverse=false,from=0,to=S){
    for(let i=from;i<to;i++){
      const quad=[a[i],b[i],a[i+1],a[i+1],b[i],b[i+1]];
      if(reverse)for(let k=0;k<6;k+=3)faces.push(quad[k],quad[k+2],quad[k+1]);else faces.push(...quad);
    }
  }
  const bandRows=[seam];
  let prev=seam;
  for(let j=1;j<=R;j++){
    const t=j/R,a0=mix(start,baseGap,t),row=[];
    for(let i=0;i<=S;i++){
      const a=mix(a0,TAU-a0,i/S);const front=Math.max(0,Math.cos(a));
      const drop=bandH+.012*front**2;
      row.push(vertex(point(top.y-drop*t,a)));
    }
    connect(prev,row);prev=row;bandRows.push(row);
  }
  const fullBand=faces.slice();
  const trimmed=[];for(let k=0;k<fullBand.length;k+=6){const i=k/6%S;if(i!==join-1&&i!==S-join)trimmed.push(...fullBand.slice(k,k+6));}
  faces.length=0;faces.push(...trimmed);
  groups.push({start:0,count:faces.length,materialIndex:0});
  prev=seam;
  for(let j=1;j<=R;j++){
    const t=j/R,a0=mix(start,hemGap,t),row=[];
    for(let i=0;i<=S;i++){
      const u=i/S,edge=Math.min(i,S-i),rawA=mix(a0,TAU-a0,u);
      if(edge>=join){row.push(bandRows[j][i]);continue;}
      const sign=rawA<=Math.PI?1:-1,theta=sign===1?rawA:TAU-rawA;
      const warp=theta<Math.PI/2?Math.sin(Math.PI*(theta-a0)/(Math.PI/2-a0))*.16*t:0;
      const a=sign===1?theta-warp:TAU-theta+warp,front=(1+Math.cos(a))*.5;
      const seamA=mix(start,TAU-start,u),base=section(top.y,seamA);
      const forward=Math.max(0,Math.cos(a));
      const drop=Math.min(r*(.32+.48*front),span*.58)+.028*forward**.85;
      let y=top.y-drop*t;
      let s=section(y,a);if(!s)throw Error('외측 카라 단면 부족');
      const halfWidth=Math.max(.069,r*1.71);
      const limit=halfWidth+.005;
      const widthAt=q=>Math.abs(q.x+Math.sin(a)*(q.r+margin+.006*t));
      if(widthAt(s)>limit){
        let lower=y,upper=top.y;
        for(let k=0;k<18;k++){
          const mid=(lower+upper)*.5, q=section(mid,a);
          if(q&&widthAt(q)<=limit)upper=mid;else lower=mid;
        }
        y=upper;s=section(y,a);
      }
      const oldSpread=r*(.35+.22*front)*t;
      const fittedExtra=(.004+.002*Math.sin(Math.PI*t))*t;
      const oldOuter=Math.max(s.r+r*.035*t,base.r+oldSpread);
      const b=Math.min(1,Math.max(0,(Math.cos(a)+.30)/.65));
      const blend=b*b*(3-2*b);
      const outer=mix(oldOuter,s.r+fittedExtra,blend)+margin;
      const fold=smooth01((join-edge)/(join-20));
      const bandA=mix(mix(start,baseGap,t),TAU-mix(start,baseGap,t),u);
      const bandY=top.y-(bandH+.012*Math.max(0,Math.cos(bandA))**2)*t;
      const outA=mix(bandA,a,fold),outY=mix(bandY,y,fold);
      const fitted=section(outY,outA);if(!fitted)throw Error('후면 접합 단면 부족');
      const extra=Math.max(0,outer-s.r-margin)*fold;
      row.push(vertex([fitted.x+Math.sin(outA)*(fitted.r+margin+extra),outY,fitted.z+Math.cos(outA)*(fitted.r+margin+extra)]));
    }
    connect(prev,row,true,0,join);connect(prev,row,true,S-join,S);prev=row;
  }
  groups.push({start:groups[0].count,count:faces.length-groups[0].count,materialIndex:1});
  let clearance=Infinity,degenerate=0;const edges=new Map();
  function measure(x,y,z){
    const c=section(y,0);if(!c)return -Infinity;
    const dx=x-c.x,dz=z-c.z,a=Math.atan2(dx,dz),s=section(y,a);
    return s?Math.hypot(dx,dz)-s.r:-Infinity;
  }
  for(let k=0;k<faces.length;k+=3){
    const ids=faces.slice(k,k+3),p=ids.map(i=>vertices.slice(i*3,i*3+3));
    const u=p[1].map((v,i)=>v-p[0][i]),v=p[2].map((v,i)=>v-p[0][i]);
    if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<1e-12)degenerate++;
    for(let i=0;i<3;i++){
      const a=ids[i],b=ids[(i+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;
      edges.set(key,(edges.get(key)||0)+1);
      clearance=Math.min(clearance,measure(...p[i].map((v,j)=>(v+p[(i+1)%3][j])*.5)));
    }
    clearance=Math.min(clearance,measure(...p[0].map((v,i)=>(v+p[1][i]+p[2][i])/3)));
  }
  const nonManifold=[...edges.values()].filter(n=>n>2).length;
  const backJoinEdges=Array.from({length:R},(_,j)=>[join,S-join].map(i=>{const a=bandRows[j][i],b=bandRows[j+1][i];return edges.get(`${Math.min(a,b)}:${Math.max(a,b)}`)||0;})).flat();
  if(backJoinEdges.some(n=>n!==2))throw Error('뒷목 접합선이 연결되지 않음');
  if(degenerate||nonManifold||clearance<-margin*.20)throw Error(`카라 검증 실패 (간격 ${clearance.toFixed(5)}, 퇴화면 ${degenerate}, 비다양체 ${nonManifold})`);
  const bbox=[0,1,2].map(axis=>{let min=Infinity,max=-Infinity;for(let i=axis;i<vertices.length;i+=3){min=Math.min(min,vertices[i]);max=Math.max(max,vertices[i]);}return [min,max];});
  return {vertices,faces,groups,fullBand,topY:top.y,radius:r,center:[top.x,top.y,top.z],diagnostics:{neckDiameter:2*r,bandHeight:bandH,frontBandHeight:bandH+.012*Math.cos(baseGap)**2,rows:R,segments:S,rearJoinIndex:join,rearJoinEdges:backJoinEdges.length,rearOuterGap:0,rearHemDifference:0,collarWidth:bbox[0][1]-bbox[0][0],collarHeight:bbox[1][1]-bbox[1][0],minSampledSkinGap:clearance,seamVertices:seam.length,triangles:faces.length/3,degenerate,nonManifold}};
}

function transferWeights(positions, vertices, geometry){
 const sourceIndex=geometry.getAttribute('skinIndex'),sourceWeight=geometry.getAttribute('skinWeight'),skin=geometry.getAttribute('aSkin');
 const count=vertices.length/3,indices=new Uint16Array(count*4),weights=new Float32Array(count*4);
 let low=Infinity,high=-Infinity;
 for(let i=1;i<vertices.length;i+=3){low=Math.min(low,vertices[i]);high=Math.max(high,vertices[i]);}
 const candidates=[];
 for(let i=0;i<positions.length/3;i++){
  if(skin&&skin.getX(i)<.5)continue;
  if(positions[i*3+1]<low-.035||positions[i*3+1]>high+.035||Math.abs(positions[i*3])>.15)continue;
  candidates.push(i);
 }
 if(!candidates.length)throw Error('No underlying neck skin weights');
 const nearest=new Int32Array(4),distance=new Float64Array(4);
 for(let i=0;i<count;i++){
  nearest.fill(-1);distance.fill(Infinity);
  const x=vertices[i*3],y=vertices[i*3+1],z=vertices[i*3+2];
  for(const j of candidates){
   const k=j*3,d=(x-positions[k])**2+(y-positions[k+1])**2+(z-positions[k+2])**2;
   if(d>=distance[3])continue;
   let slot=3;while(slot>0&&d<distance[slot-1]){distance[slot]=distance[slot-1];nearest[slot]=nearest[slot-1];slot--;}
   nearest[slot]=j;distance[slot]=d;
  }
  const influence=new Map();
  for(let k=0;k<4;k++){
   if(nearest[k]<0)continue;
   const j=nearest[k]*4,falloff=1/Math.max(1e-8,distance[k]);
   for(let b=0;b<4;b++){
    const bone=sourceIndex.array[j+b],weight=sourceWeight.array[j+b]*falloff;
    if(weight>0)influence.set(bone,(influence.get(bone)||0)+weight);
   }
  }
  const top=[...influence].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=top.reduce((s,p)=>s+p[1],0);
  if(!(sum>0))throw Error('Invalid collar skin weights');
  top.forEach(([bone,w],k)=>{indices[i*4+k]=bone;weights[i*4+k]=w/sum;});
 }
 return {indices,weights};
}

export function buildCollar(T,actor,fullIndex){
 const geometry=actor.mesh.geometry,src=geometry.getAttribute('position').array;
 // Identical foot-anchored 1.76 m frame and neck anchors to the approved gesture viewer.
 const units=actor.units,minY=geometry.boundingBox.min.y;
 const positions=new Float32Array(src.length);
 for(let i=0;i<src.length;i+=3){positions[i]=src[i]*units;positions[i+1]=(src[i+1]-minY)*units;positions[i+2]=src[i+2]*units;}
 const y=actor.profile.body==='female'?1.445:1.475;
 const fit=fitCollarSurface(positions,fullIndex.array,[0,y,.025],[0,y+.045,.025],1.76);
 const {vertices,faces,groups,diagnostics}=fit;
 const {indices,weights}=transferWeights(positions,vertices,geometry);
 const local=new Float32Array(vertices.length),colors=new Float32Array(vertices.length);
 const pale=new T.Color('#e5dfd2'),cloth=new T.Color('#d2c8bb'),S=diagnostics.segments,join=diagnostics.rearJoinIndex;
 for(let i=0;i<vertices.length;i+=3){
  local[i]=vertices[i]/units;local[i+1]=vertices[i+1]/units+minY;local[i+2]=vertices[i+2]/units;
  const j=(i/3)%(S+1),edge=Math.min(j,S-j),t=Math.max(0,Math.min(1,(edge-20)/(join-20))),f=t*t*(3-2*t);
  colors[i]=pale.r+(cloth.r-pale.r)*f;colors[i+1]=pale.g+(cloth.g-pale.g)*f;colors[i+2]=pale.b+(cloth.b-pale.b)*f;
 }
 const g=new T.BufferGeometry();
 g.setAttribute('position',new T.BufferAttribute(local,3));
 g.setAttribute('color',new T.BufferAttribute(colors,3));
 g.setAttribute('skinIndex',new T.BufferAttribute(indices,4));
 g.setAttribute('skinWeight',new T.BufferAttribute(weights,4));
 g.setIndex(new T.BufferAttribute(Uint16Array.from(faces),1));
 for(const part of groups)g.addGroup(part.start,part.count,part.materialIndex);
 g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
 const materials=[new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide}),new T.MeshBasicMaterial({color:cloth,side:T.DoubleSide})];
 const mesh=new T.SkinnedMesh(g,materials);mesh.name='clothing:collar.basic';mesh.frustumCulled=false;
 mesh.bind(actor.skeleton,actor.mesh.bindMatrix);mesh.userData.clothingDiagnostics=diagnostics;
 return {object:mesh,diagnostics,dispose(){g.dispose();for(const m of materials)m.dispose();}};
}
