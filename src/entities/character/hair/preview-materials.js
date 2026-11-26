// Preview-only materials. The face fragment is the active studio-model.js game
// fragment at 7a5a3c8, unmodified; the static vertex adapter converts
// head-local metres to the original normalized body coordinates.
export const GAME_FACE_FRAGMENT = `
 varying vec3 vNormal,vWorldNormal,vLocal,vColor;
 varying float vSkin,vArm,vCovered;
 uniform vec3 uSkinLight,uSkinShadow,uHeadForward,uCheekCenter,uBlushColor;
 uniform float uBlushStrength,uFirst,uClothCover;
 void main(){
  if(uFirst>.5&&vArm<.5)discard;
  if(uClothCover>.5&&vCovered>.999)discard;
  vec3 wn=normalize(vWorldNormal);
  float neckMask=smoothstep(.22,.31,vLocal.z)*(1.-smoothstep(.24,.36,abs(vLocal.x)))*smoothstep(-.66,-.58,vLocal.y)*(1.-smoothstep(.02,.14,vLocal.y));
  wn=normalize(mix(wn,uHeadForward,neckMask*.38));
  vec3 vn=normalize(mat3(viewMatrix)*wn);
  float tone=smoothstep(.158,.205,dot(vn,normalize(vec3(-.42,.68,.61))));
  vec3 skin=mix(uSkinShadow,uSkinLight,tone);
  float chin=smoothstep(.14,.30,vLocal.z)*(1.-smoothstep(.16,.34,abs(vLocal.x)))*smoothstep(.14,.26,-vLocal.y)*(1.-smoothstep(.30,.46,-vLocal.y));
  float bridge=smoothstep(.18,.30,vLocal.z)*(1.-smoothstep(.24,.42,abs(vLocal.x)))*smoothstep(.34,.46,-vLocal.y)*(1.-smoothstep(.52,.66,-vLocal.y));
  skin=mix(skin,uSkinShadow,.18*chin+.10*bridge);
  vec2 cheek=vec2((abs(vLocal.x)-abs(uCheekCenter.x))/.085,(vLocal.y-uCheekCenter.y)/.065);
  skin=mix(skin,uBlushColor,exp(-dot(cheek,cheek))*smoothstep(.20,.30,vLocal.z)*uBlushStrength);
  gl_FragColor=vec4(mix(vColor,skin,vSkin),1.);
  #include <colorspace_fragment>
 }`;
export function createPreviewFaceMaterial(T,built,fit){
 const {body,palette,blush,cheek}=built;
 return new T.ShaderMaterial({side:T.DoubleSide,uniforms:{
  uSkinLight:{value:new T.Color(palette.light)},uSkinShadow:{value:new T.Color(palette.shadow)},
  uHeadOffset:{value:new T.Vector3(...body.data.headOffset.map(x=>x/1428))},
  uHeadScale:{value:new T.Vector3(...body.data.face.scale.map(x=>x/(32*1428)))},
  uCheekCenter:{value:new T.Vector3(...cheek)},uBlushColor:{value:new T.Color(blush.color)},uBlushStrength:{value:blush.strength},
  uHeadForward:{value:new T.Vector3(0,0,1)},uFirst:{value:0},uClothCover:{value:0},
  uPivot:{value:new T.Vector3(...fit.pivot)},uUnits:{value:fit.units}},
  vertexShader:`
  attribute vec3 color;
  attribute float aSkin;
  varying vec3 vNormal,vWorldNormal,vLocal,vColor;
  varying float vSkin,vArm,vCovered;
  uniform vec3 uPivot,uHeadOffset,uHeadScale;
  uniform float uUnits;
  void main(){
   vNormal=normalize(normalMatrix*normal);
   vWorldNormal=normalize(mat3(modelMatrix)*normal);
   vLocal=(position/uUnits+uPivot-uHeadOffset)/uHeadScale;
   vColor=color;vSkin=aSkin;vArm=0.;vCovered=0.;
   gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
  }`,fragmentShader:GAME_FACE_FRAGMENT});
}
// Two-tone, muted brown, root-to-tip value and broad flow-following satin band.
// Ribbon UV: u around the section, v from root to tip. No extra geometry.
export function createPreviewHairMaterial(T,{foundation=false,wireframe=false}={}){
 return new T.ShaderMaterial({side:T.DoubleSide,wireframe,uniforms:{
  uBase:{value:new T.Color('#9d7963')},uFoundation:{value:foundation?1:0}},
  vertexShader:`
  varying vec3 vN;
  varying vec2 vFlow;
  void main(){vN=normalize(normalMatrix*normal);vFlow=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
  `,fragmentShader:`
  uniform vec3 uBase;
  uniform float uFoundation;
  varying vec3 vN;
  varying vec2 vFlow;
  void main(){
   vec3 n=normalize(vN);
   float d=dot(n,normalize(vec3(-.42,.68,.61)));
   float tone=smoothstep(.12,.25,d);
   vec3 col=uBase*mix(vec3(.62,.56,.52),vec3(1.12,1.10,1.06),tone);
   float root=mix(.83,1.04,smoothstep(.02,.8,vFlow.y));
   float band=exp(-pow((vFlow.y-.38)/.13,2.));
   float filament=.5+.5*cos(6.2831853*(vFlow.x*11.+.12*sin(vFlow.y*5.)));
   float grain=mix(.965,1.035,filament);
   float spec=band*smoothstep(.12,.78,d)*(.10+.04*filament);
   col*=root*mix(grain,1.,uFoundation);
   col+=uBase*spec*(1.-uFoundation*.65);
   gl_FragColor=vec4(col,1.);
   #include <colorspace_fragment>
  }`});
}
