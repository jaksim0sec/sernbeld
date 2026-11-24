// Fixed editor-only stance. No saved joint angles or gameplay animation constraints.
export function attentionRotations(bones) {
 const identity=[1,0,0,0,1,0,0,0,1];
 const sub=(a,b)=>a.map((v,i)=>v-b[i]);
 const norm=v=>{const n=Math.hypot(...v);if(n<1e-8)throw Error('Invalid arm rig: zero-length segment');return v.map(x=>x/n);};
 const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const rot=(m,[x,y,z])=>[m[0]*x+m[3]*y+m[6]*z,m[1]*x+m[4]*y+m[7]*z,m[2]*x+m[5]*y+m[8]*z];
 const mul=(a,b)=>[0,3,6].flatMap(i=>rot(a,b.slice(i,i+3)));
 const transpose=m=>[m[0],m[3],m[6],m[1],m[4],m[7],m[2],m[5],m[8]];
 const align=(from,to)=>{
  const a=norm(from),b=norm(to),c=Math.max(-1,Math.min(1,dot(a,b)));
  if(c>1-1e-12)return identity;
  const axis=c< -1+1e-12?norm(cross(a,Math.abs(a[0])<.8?[1,0,0]:[0,1,0])):norm(cross(a,b));
  const [x,y,z]=axis,s=Math.sqrt(Math.max(0,1-c*c)),t=1-c;
  return [c+x*x*t,y*x*t+z*s,z*x*t-y*s,x*y*t-z*s,c+y*y*t,z*y*t+x*s,x*z*t+y*s,y*z*t-x*s,c+z*z*t];
 };
 const map=new Map(bones.map(b=>[b.id,b])),result={};
 for(const side of ['left','right']){
  const upper=map.get('upper_arm_'+side),fore=map.get('forearm_'+side),hand=map.get('hand_'+side);
  if(!upper||!fore||!hand)throw Error('Missing arm bones: '+side);
  const upperDirection=sub(fore.pivot,upper.pivot),foreDirection=sub(hand.pivot,fore.pivot);
  const sign=Math.sign(upperDirection[0])||Math.sign(upper.pivot[0])||1;
  const upperWorld=align(upperDirection,[sign*.10,-1,0]);
  const foreWorld=align(rot(upperWorld,foreDirection),[0,-1,0]);
  result[upper.id]=upperWorld;
  result[fore.id]=mul(transpose(upperWorld),mul(foreWorld,upperWorld));
 }
 return result;
}
