var shared = {
  uSunDir: { value: new Vector3(0, 1, 0) },
  uTime: { value: 0 },
  uWarm: { value: 0.72 },
  uHazeK: { value: 36e-5 },
  uFogDens: { value: 3e-4 },
  uFogFall: { value: 85e-4 },
  uNoise: { value: null },
  uStroke: { value: null },
  uSunCol: { value: new Vector3(1.12, 1.06, 0.92) },
  uShade: { value: new Vector3(0.46, 0.66, 0.82) },
  uHeight: { value: null },
  uMask: { value: null },
  uBake: { value: null },
  uBakeMode: { value: 0 },
  uSkyTint: { value: new Vector3(1, 1, 1) },
  // time of day (game/clock.js)
  uDay: { value: 1 }
  // 0 normal render, 1 albedo, 2 world normal (impostor baking)
};
var GLSL_WORLD = (
  /* glsl */
  `
const float W_HALF = ${CFG.half.toFixed(1)};
const float W_CELL = ${CFG.cell.toFixed(2)};
const float W_N = ${GRID_N.toFixed(1)};
const float B_CELL = ${CFG.bakeCell.toFixed(1)};
const float B_N = ${(Math.round(CFG.half * 2 / CFG.bakeCell) + 1).toFixed(1)};
vec2 gridUV(vec2 p){ return ((p+W_HALF)/W_CELL+.5)/W_N; }
vec2 bakeUV(vec2 p){ return ((p+W_HALF)/B_CELL+.5)/B_N; }
float inWorld(vec2 p){ vec2 a=step(vec2(-W_HALF),p)*step(p,vec2(W_HALF)); return a.x*a.y; }
`
);
var GLSL_ATMOS = (
  /* glsl */
  `
uniform vec3 uSunDir;
uniform float uTime, uWarm, uHazeK, uFogDens, uFogFall, uDay;
uniform vec3 uSkyTint;
uniform sampler2D uNoise;
vec3 skyRaw(vec3 d);
vec3 skyBase(vec3 d){ return skyRaw(d)*uSkyTint; }
vec3 skyRaw(vec3 d){
  float y=max(d.y,0.0);
  float cosT=clamp(dot(d,uSunDir),-1.,1.);
  float ray=.75*(1.+cosT*cosT);
  float g=.76, mie=(1.-g*g)/pow(max(.05,1.+g*g-2.*g*cosT),1.5);
  float optical=1.0/(.14+y*1.9);
  vec3 scatter=(1.-exp(-vec3(.24,.43,.9)*optical*.88))*ray;
  vec3 col=mix(vec3(.73,.87,.92),vec3(.15,.46,.79),pow(y,.55));
  col+=scatter*vec3(.034,.067,.115);
  col+=vec3(1.,.72,.38)*exp(-y*11.)*(.08+.15*uWarm)*.35;
  col+=mie*vec3(1.,.78,.50)*(.004+.008*uWarm)*exp(-y*.5);
  return col;
}
// vivid anime grade: more chroma in the mid tones, shadows never go muddy
vec3 grade(vec3 c){ float l=dot(c,vec3(.299,.587,.114)); c=mix(vec3(l),c,1.10); return c+vec3(.0,.008,.018)*(1.-smoothstep(.0,.45,l)); }
vec3 hazeColor(vec3 dir){ return skyBase(normalize(vec3(dir.x,max(dir.y,0.0)*0.22+0.015,dir.z))); }
vec3 applyAtmos(vec3 col, vec3 wp){
  vec3 v=wp-cameraPosition; float d=length(v); vec3 dir=v/max(d,1e-3);
  float aerial=1.0-exp(-d*uHazeK);
  float a=uFogDens*exp(-uFogFall*max(cameraPosition.y,0.0));
  float k=dir.y*uFogFall;
  float tt=abs(k)>1e-4?(1.0-exp(-k*d))/k:d;
  float hf=1.0-exp(-a*tt);
  float f=1.0-(1.0-aerial)*(1.0-hf);
  float l=dot(col,vec3(.299,.587,.114));
  col=mix(col,vec3(l),f*0.06);
  col=mix(col,hazeColor(dir),f);
  return grade(col);
}`
);
var GLSL_GRASS = (
  /* glsl */
  `
vec3 grassColor(float nL, float nM, float st, float st2, float y){
  float g=nL*.62+nM*.24+st*.14;
  vec3 c=mix(vec3(.28,.60,.20),vec3(.44,.76,.22),smoothstep(.15,.70,g));
  c=mix(c,vec3(.70,.90,.28),smoothstep(.45,.95,g+st2*.16-.08)*.85);
  c=mix(c,c*vec3(.86,1.,1.08),smoothstep(.4,.7,nL)*.6);
  c+=(st2-.5)*vec3(.05,.06,.025);
  float dry=smoothstep(.60,.95,nM*.7+nL*.3+y*.0018)*.32;
  return mix(c,vec3(.82,.88,.38),dry);
}
float ign(vec2 fc){ return fract(52.9829189*fract(dot(fc,vec2(.06711056,.00583715)))); }   // interleaved gradient noise
`
);
var GLSL_TOON = (
  /* glsl */
  `
uniform vec3 uSunCol, uShade;
vec3 reliefNormal(vec3 n, vec3 p, float h){
  vec3 dx=dFdx(p), dy=dFdy(p);
  vec3 rx=cross(dy,n), ry=cross(n,dx);
  float det=dot(dx,rx);
  vec3 gradient=(dFdx(h)*rx+dFdy(h)*ry)*sign(det);
  return normalize(n*max(abs(det),1e-6)-gradient);
}
vec3 sat3(vec3 c,float s){ float l=dot(c,vec3(.299,.587,.114)); return mix(vec3(l),c,s); }
// soft anime terminator, cool saturated shade, sky fill, warm rim on the light edge
vec3 toonLight(vec3 alb, vec3 N, float sh, float ao, float eN){
  float ndl=dot(N,uSunDir);
  float diffuse=max(ndl,0.);
  float lit=smoothstep(-.07+eN,.38+eN,ndl)*mix(.68,1.,diffuse)*sh;
  vec3 col=mix(sat3(alb*uShade,1.35),alb*uSunCol,lit);
  col+=alb*vec3(.035,.055,.075)*(.45+.55*max(N.y,0.));
  col*=mix(.66,1.,ao);
  col+=vec3(.10,.06,0.)*uWarm*lit*(1.-smoothstep(0.,.6,ndl))*.6;
  return col;
}`
);
function makeLitMaterial({ uniforms = {}, head = "", body, vhead = "", vbody = "", defines = {}, side = FrontSide, bakeable = false }) {
  if (bakeable) defines = { ...defines, BAKEABLE: "" };
  const mat2 = new ShaderMaterial({
    lights: true,
    side,
    defines,
    uniforms: UniformsUtils.merge([UniformsLib.lights, uniforms]),
    vertexShader: (
      /* glsl */
      `
      #include <common>
      #include <shadowmap_pars_vertex>
      #include <skinning_pars_vertex>
      uniform float uTime;
      varying vec3 vWorld; varying vec3 vNrm; varying vec3 vObj;
      ${vhead}
      void main(){
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        ${vbody}
        #include <project_vertex>
        #include <worldpos_vertex>
        #include <shadowmap_vertex>
        vec4 wp=vec4(transformed,1.);
        #ifdef USE_INSTANCING
          wp=instanceMatrix*wp;
        #endif
        wp=modelMatrix*wp; vWorld=wp.xyz; vObj=position;
        vNrm=inverseTransformDirection(transformedNormal,viewMatrix);
      }`
    ),
    fragmentShader: (
      /* glsl */
      `
      #include <common>
      #include <packing>
      #include <lights_pars_begin>
      #include <shadowmap_pars_fragment>
      #include <shadowmask_pars_fragment>
      ${GLSL_WORLD}
      ${GLSL_ATMOS}
      ${GLSL_GRASS}
      ${GLSL_TOON}
      uniform float uBakeMode;
      ${head}
      varying vec3 vWorld; varying vec3 vNrm; varying vec3 vObj;
      void main(){
        vec3 N=normalize(vNrm); vec3 alb=vec3(.7); float ao=1., eN=0., shMul=1.; vec3 extra=vec3(0.);
        ${body}
        #ifdef BAKEABLE
          if(uBakeMode>.5){ gl_FragColor=uBakeMode<1.5?vec4(alb*mix(.62,1.,ao),1.):vec4(N*.5+.5,1.); return; }
        #endif
        vec3 col=toonLight(alb,N,min(getShadowMask(),shMul),ao,eN)+extra;
        col=applyAtmos(col,vWorld);
        gl_FragColor=vec4(clamp(col,0.,1.),1.);
      }`
    )
  });
  bindShared(mat2);
  return mat2;
}
function bindShared(mat2) {
  for (const k in shared) mat2.uniforms[k] = shared[k];
  return mat2;
}
function makeNoiseTexture() {
  const S2 = 256, data = new Uint8Array(S2 * S2 * 4), chans = [[4, 5, N1], [8, 5, N2], [16, 4, N3], [32, 3, N1]];
  for (let c = 0; c < 4; c++) {
    const [base, oct, nz] = chans[c], vals = new Float32Array(S2 * S2);
    for (let y = 0; y < S2; y++) for (let x = 0; x < S2; x++) {
      let s = 0, a = 1, t = 0, p = base;
      for (let o = 0; o < oct; o++) {
        s += a * nz(x / S2 * p, y / S2 * p, p);
        t += a;
        a *= 0.5;
        p *= 2;
      }
      vals[y * S2 + x] = s / t;
    }
    const order = new Uint32Array(S2 * S2);
    for (let i = 0; i < S2 * S2; i++) order[i] = i;
    order.sort((a, b) => vals[a] - vals[b]);
    for (let r = 0; r < S2 * S2; r++) data[order[r] * 4 + c] = Math.round(255 * r / (S2 * S2 - 1));
  }
  return repeatTex(new DataTexture(data, S2, S2, RGBAFormat));
}
function strokeLayer(seed, baseAngle, spread, count) {
  const S2 = 512, cv = document.createElement("canvas");
  cv.width = cv.height = S2;
  const g = cv.getContext("2d");
  g.fillStyle = "rgb(128,128,128)";
  g.fillRect(0, 0, S2, S2);
  const r = mulberry32(seed);
  for (let k = 0; k < count; k++) {
    const x = r() * S2, y = r() * S2, len = 14 + r() * 52, wid = 3 + r() * 11, ang = baseAngle + (r() - 0.5) * spread, v = Math.round(40 + r() * 180);
    for (const ox of [-S2, 0, S2]) for (const oy of [-S2, 0, S2]) {
      const cx = x + ox, cy = y + oy;
      if (cx < -len || cx > S2 + len || cy < -len || cy > S2 + len) continue;
      g.setTransform(Math.cos(ang) * len, Math.sin(ang) * len, -Math.sin(ang) * wid, Math.cos(ang) * wid, cx, cy);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      gr.addColorStop(0, `rgba(${v},${v},${v},0.30)`);
      gr.addColorStop(0.55, `rgba(${v},${v},${v},0.18)`);
      gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = gr;
      g.fillRect(-1, -1, 2, 2);
    }
  }
  return g.getImageData(0, 0, S2, S2).data;
}
function makeStrokeTexture() {
  const S2 = 512, a = strokeLayer(11, -0.55, 0.9, 2400), b = strokeLayer(29, 0.35, 2.4, 2400), out2 = new Uint8Array(S2 * S2 * 4);
  for (let i = 0; i < S2 * S2; i++) {
    out2[i * 4] = a[i * 4];
    out2[i * 4 + 1] = b[i * 4];
    out2[i * 4 + 2] = a[i * 4] + b[i * 4] >> 1;
    out2[i * 4 + 3] = 255;
  }
  return repeatTex(new DataTexture(out2, S2, S2, RGBAFormat));
}
function repeatTex(t) {
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
function makeSoftSpriteTexture() {
  const S2 = 64, cv = document.createElement("canvas");
  cv.width = cv.height = S2;
  const g = cv.getContext("2d"), gr = g.createRadialGradient(S2 / 2, S2 / 2, 0, S2 / 2, S2 / 2, S2 / 2);
  gr.addColorStop(0, "rgba(255,255,255,0.9)");
  gr.addColorStop(0.5, "rgba(255,255,255,0.35)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, S2, S2);
  const t = new CanvasTexture(cv);
  return t;
}
function makeSky() {
  const mat2 = new ShaderMaterial({
    uniforms: { uCloud: { value: 0.52 } },
    vertexShader: (
      /* glsl */
      `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`
    ),
    fragmentShader: (
      /* glsl */
      `
      ${GLSL_ATMOS}
      uniform float uCloud; uniform sampler2D uStroke; varying vec3 vW;
      float cloudShape(vec2 p){
        float a=texture2D(uNoise,p*.026+vec2(.31,.17)).r;
        float b=texture2D(uNoise,p*.047+vec2(.43,.27)).g;
        float c=texture2D(uNoise,p*.11+vec2(.11,.72)).b;
        float e=texture2D(uNoise,p*.27).a;
        return a*.56+b*.26+c*.13+e*.05;
      }
      void main(){
        vec3 d=normalize(vW-cameraPosition);
        vec3 sky=skyBase(d);
        float elev=smoothstep(.028,.16,d.y);
        vec2 plane=d.xz/(.16+max(0.,d.y));
        vec2 wind=vec2(uTime*.012,uTime*.004);
        vec2 p=plane*4.2+vec2(3.9,6.5)+wind;
        float coverage=texture2D(uNoise,p*.009).g;
        float density=cloudShape(p);
        float threshold=mix(.66,.51,uCloud)+(coverage-.5)*.11;
        float alpha=smoothstep(threshold-.025,threshold+.085,density)*elev;
        vec2 sunward=uSunDir.xz/max(.15,length(uSunDir.xz));
        float toSun=cloudShape(p+sunward*.86);
        float light=clamp(.59+(density-toSun)*4.2+.22*uSunDir.y,0.,1.);
        vec3 cloud=mix(vec3(.55,.65,.78),vec3(1.,.985,.95),light)*uSkyTint;
        float rim=smoothstep(.02,.12,density-toSun)*pow(max(dot(d,uSunDir),0.),3.);
        cloud+=vec3(.12,.079,.036)*rim*uWarm*uDay;
        float cirrus=texture2D(uStroke,plane*vec2(.055,.022)+wind*.012).r;
        sky=mix(sky,vec3(.78,.85,.94)*uSkyTint,smoothstep(.62,.83,cirrus)*elev*.34);
        sky=mix(sky,cloud,alpha*.95);
        float sd=dot(d,uSunDir);
        sky+=vec3(1.,.84,.58)*(smoothstep(.99981,.99991,sd)*.78+pow(smoothstep(.993,1.,sd),2.)*.21)*uDay*(1.-alpha*.88);
        sky+=vec3(1.,.82,.54)*pow(max(sd,0.),14.)*(.018+.04*uWarm)*uDay;
        // night: a scatter of stars where the sky is dark
        float st=step(.9965,texture2D(uNoise,d.xz/(d.y+.35)*1.7).a)*smoothstep(.05,.3,d.y)*(1.-uDay)*(1.-alpha);
        sky+=vec3(.9,.95,1.)*st*.8;
        gl_FragColor=vec4(clamp(sky,0.,1.),1.);
      }`
    ),
    side: BackSide,
    depthWrite: false
  });
  bindShared(mat2);
  const m = new Mesh(new SphereGeometry(1e4, 40, 20), mat2);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}
function makeTerrainMaterial({clipStairs = true} = {}) {
  const stairClip=clipStairs ? STAIRS.map(s=>{
    const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],L=Math.hypot(dx,dz);
    const f=v=>Number(v).toFixed(6);
    const steps=Math.max(1,Math.ceil(Math.abs(s.y1-s.y0)/.3));
    // Keep the actual ground below a raised stair. Only remove terrain
    // that would protrude through the authored tread.
    return `{vec2 q=p-vec2(${f(s.a[0])},${f(s.a[1])});float u=dot(q,vec2(${f(dx/L)},${f(dz/L)}));float v=dot(q,vec2(${f(s.n[0])},${f(s.n[1])}));if(u>.002&&u<${f(L-.002)}&&v>${f(STAIR_MIN_V+.002)}&&v<${f(STAIR_MAX_V-.002)}){float k=min(${f(steps-1)},floor(u/${f(L)}*${f(steps)}));float tread=k<.5?${f(s.y0+.06)}:k>${f(steps-1.5)}?${f(s.y1+.06)}:${f(s.y0+.06)}+${f(s.y1-s.y0)}*(k+.5)/${f(steps)};if(vWorld.y>tread-.015)discard;}}`;
  }).join('\n') : '';
  return makeLitMaterial({
    head: (
      /* glsl */
      `uniform sampler2D uStroke, uMask, uBake;`
    ),
    body: (
      /* glsl */
      `
      vec2 p=vWorld.xz; float slope=1.-N.y;
      ${stairClip}
      float nL=texture2D(uNoise,p*0.00055).r;
      float nM=texture2D(uNoise,p*0.0042+.37).g;
      float nS=texture2D(uNoise,p*0.031+.71).b;
      float st=texture2D(uStroke,p*0.011+vec2(nM*.35)).r;
      float st2=texture2D(uStroke,p*0.047+vec2(.3,.6)).g;

      // meadow: shared palette (grass blades use the same), plus near-field micro variation
      vec3 grass=grassColor(nL,nM,st,st2,vWorld.y);
      float near=1.-smoothstep(15.,110.,distance(cameraPosition.xz,p));
      float micro=texture2D(uStroke,p*.23).b, micro2=texture2D(uNoise,p*.9).a;
      grass+=((micro-.5)*vec3(.09,.10,.04)+(micro2-.5)*vec3(.04,.05,.02))*near;

      // cliff rock: triplanar vertical streaks, strata bands, moss on ledges
      vec3 tw=pow(abs(N),vec3(4.)); tw/=(tw.x+tw.y+tw.z);
      float sx=texture2D(uStroke,vec2(vWorld.z*.045,vWorld.y*.0085)).r;
      float sz=texture2D(uStroke,vec2(vWorld.x*.045,vWorld.y*.0085)).r;
      float streak=sx*tw.x+sz*tw.z+st*tw.y;
      float bandN=texture2D(uNoise,vec2(vWorld.x+vWorld.z,vWorld.y*6.)*.004).r;
      float band=smoothstep(.40,.62,fract(vWorld.y*.075+bandN*.9));
      vec3 rock=mix(vec3(.54,.58,.62),vec3(.82,.80,.74),smoothstep(.28,.72,streak));
      rock=mix(rock,vec3(.90,.88,.82),band*.30);
      rock*=.92+.16*nS;
      float moss=(1.-smoothstep(.38,.62,slope))*smoothstep(.25,.6,nM+st*.3);
      rock=mix(rock,vec3(.42,.70,.24),moss*.8);
      float rockMask=smoothstep(.30,.46,slope+(st-.5)*.18+(nS-.5)*.08);
      alb=mix(grass,rock,rockMask);

      float iw=inWorld(p);
      vec4 mk=texture2D(uMask,gridUV(p))*iw;
      vec4 bk=texture2D(uBake,bakeUV(p));

      // flower meadows: individual dots near, averaged tint far
      float fl=mk.b*(1.-rockMask);
      if(fl>.01){
        float f1=texture2D(uNoise,p*1.9).a, f2=texture2D(uStroke,p*.13).g, hue=texture2D(uNoise,p*.021+.5).r;
        vec3 fc=hue<.36?vec3(.97,.63,.80):hue<.70?vec3(.76,.63,.96):vec3(.99,.91,.55);
        float dots=smoothstep(.68,.76,f1*.75+f2*.35)*smoothstep(.15,.55,f2);
        float farF=smoothstep(35.,170.,distance(cameraPosition.xz,p));
        alb=mix(alb,mix(mix(alb,fc,dots),mix(alb,fc,.42),farF),fl);
      }
      // sand: beaches, river banks, shallows
      float sand=mk.g*(1.-rockMask*.7);
      vec3 sandC=mix(vec3(.88,.84,.68),vec3(.96,.92,.78),st2);
      sandC=mix(sandC,vec3(.64,.63,.58),smoothstep(.70,.82,texture2D(uNoise,p*.37).a)*.45);
      alb=mix(alb,sandC,smoothstep(.15,.7,sand));
      alb=mix(alb,vec3(.72,.69,.56)*(.9+.2*nS),(1.-smoothstep(-1.2,.6,vWorld.y))*(1.-rockMask*.5));
      // dirt roads
      float road=smoothstep(.3,.7,mk.r+(st2-.5)*.45+(nS-.5)*.2)*(1.-rockMask*.8);
      vec3 roadC=mix(vec3(.74,.66,.50),vec3(.82,.75,.58),st)*(.94+.1*nS);
      alb=mix(alb,roadC,road);
      // town ground: patches of cobble and packed earth (blockout-level)
      float pav=smoothstep(.5,.9,mk.a)*(1.-rockMask)*smoothstep(.35,.6,nS*.6+st2*.4);
      vec2 tile=fract(p*.55); float joint=step(.07,tile.x)*step(.07,tile.y);
      vec3 pavC=mix(vec3(.68,.65,.58),vec3(.80,.77,.70),texture2D(uNoise,floor(p*.55)*.031).a)*(.93+.07*joint);
      alb=mix(alb,pavC,pav*.8);
      // built terraces of Kael: dressed flagstones everywhere
      float town=step(.95,mk.a);
      vec2 fq=p*vec2(.62,.5);
      fq.x+=mod(floor(fq.y),2.)*.5;
      vec2 flagUv=fract(fq);
      float wornEdge=min(min(flagUv.x,1.-flagUv.x),min(flagUv.y,1.-flagUv.y))+(micro-.5)*.014;
      float jointAA=max(.008,fwidth(wornEdge));
      float slab=smoothstep(.022-jointAA,.048+jointAA,wornEdge);
      float flagTint=texture2D(uNoise,floor(fq)*.037).a;
      vec3 flagC=mix(vec3(.65,.61,.55),vec3(.83,.80,.73),flagTint);
      flagC*=mix(.68,1.,mix(1.,slab,near))*(.92+.13*micro+.055*micro2);
      alb=mix(alb,flagC,town);
      float relief=mix((micro-.5)*.017,(band-.5)*.13+(streak-.5)*.07,rockMask);
      relief=mix(relief,slab*.026+(micro2-.5)*.012,town);
      N=reliefNormal(N,vWorld,relief*near);

      float bSun=mix(1.,bk.r,iw); ao=mix(.92,bk.g,iw);
      shMul=mix(smoothstep(.12,.88,bSun),1.,smoothstep(.35,.7,slope)*.85);
      ao=mix(ao,1.,smoothstep(.3,.7,slope)*.6);
      eN=(st2-.5)*.12;
    `
    )
  });
}
var SPLIT = 0.85;
var ROOT = CFG.half;
var indexAttr = null;
function nodeIndex() {
  if (indexAttr) return indexAttr;
  const V4 = CHUNK_CELLS + 3, idx = new Uint32Array((V4 - 1) * (V4 - 1) * 6);
  let o = 0;
  for (let j = 0; j < V4 - 1; j++) for (let i = 0; i < V4 - 1; i++) {
    const a = j * V4 + i, b = a + V4;
    idx[o++] = a;
    idx[o++] = b;
    idx[o++] = a + 1;
    idx[o++] = a + 1;
    idx[o++] = b;
    idx[o++] = b + 1;
  }
  return indexAttr = new BufferAttribute(idx, 1);
}
function buildNodeGeometry(size, x0, z0) {
  const s = Math.round(size / CFG.chunk), n = CHUNK_CELLS, V4 = n + 3, H = World.H, GN = GRID_N, C2 = CFG.cell;
  const GI0 = Math.round((x0 + CFG.half) / C2), GJ0 = Math.round((z0 + CFG.half) / C2);
  const pos = new Float32Array(V4 * V4 * 3), nor = new Float32Array(V4 * V4 * 3), skirt = 3 + 5 * s;
  for (let vj = 0; vj < V4; vj++) for (let vi = 0; vi < V4; vi++) {
    const gi = Math.min(n, Math.max(0, vi - 1)), gj = Math.min(n, Math.max(0, vj - 1));
    const GI = GI0 + gi * s, GJ = GJ0 + gj * s;
    const edge = vi === 0 || vj === 0 || vi === V4 - 1 || vj === V4 - 1, o = (vj * V4 + vi) * 3;
    pos[o] = -CFG.half + GI * C2;
    pos[o + 2] = -CFG.half + GJ * C2;
    pos[o + 1] = H[GJ * GN + GI] - (edge ? skirt : 0);
    const il = Math.max(0, GI - 1), ir = Math.min(GN - 1, GI + 1), jd = Math.max(0, GJ - 1), ju = Math.min(GN - 1, GJ + 1);
    const nx = (H[GJ * GN + il] - H[GJ * GN + ir]) / ((ir - il) * C2), nz = (H[jd * GN + GI] - H[ju * GN + GI]) / ((ju - jd) * C2);
    const inv = 1 / Math.hypot(nx, 1, nz);
    nor[o] = nx * inv;
    nor[o + 1] = inv;
    nor[o + 2] = nz * inv;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("normal", new BufferAttribute(nor, 3));
  geo.setIndex(nodeIndex());
  geo.computeBoundingSphere();
  return geo;
}
// The terrain cut needs a vertical boundary wherever the original heightfield
// is above a stair. It is terrain geometry, not a new stair wall or collider.
// Split at every tread and heightfield triangle edge, so the seam shares the
// actual rendered terrain surface rather than guessing a wall height.
function buildStairTerrainSeams() {
  const positions=[], indices=[];
  for(const s of STAIRS){
    const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],L=Math.hypot(dx,dz);
    const ux=dx/L,uz=dz/L,[nx,nz]=s.n,steps=Math.max(1,Math.ceil(Math.abs(s.y1-s.y0)/.3));
    const pt=(u,v)=>[s.a[0]+ux*u+nx*v,s.a[1]+uz*u+nz*v];
    const edge=(a,b,ox,oz,tread)=>{
      const vx=b[0]-a[0],vz=b[1]-a[1],ts=[0,1];
      // Terrain triangles meet on grid x, z, and x+z diagonals.
      for(const [start,delta] of [[a[0]+HALF,vx],[a[1]+HALF,vz],[a[0]+a[1]+2*HALF,vx+vz]]){
        if(Math.abs(delta)<1e-9)continue;
        const end=start+delta;
        for(let k=Math.floor(Math.min(start,end)/CFG.cell)+1;k*CFG.cell<Math.max(start,end)-1e-8;k++)
          ts.push((k*CFG.cell-start)/delta);
      }
      ts.sort((a,b)=>a-b);
      for(let i=1;i<ts.length;i++){
        let t0=ts[i-1],t1=ts[i];if(t1-t0<1e-8)continue;
        const mid=(t0+t1)*.5;
        // A connected flight/landing replaces the terrain on both sides.
        if(stairSurface(a[0]+vx*mid+ox*.01,a[1]+vz*mid+oz*.01)!==null)continue;
        const h=t=>heightfieldTriangle(a[0]+vx*t,a[1]+vz*t);
        let h0=h(t0),h1=h(t1),bottom=tread-.015;
        if(h0<=bottom&&h1<=bottom)continue;
        if(h0<bottom){t0+=(t1-t0)*(bottom-h0)/(h1-h0);h0=bottom;}
        if(h1<bottom){t1=t0+(t1-t0)*(bottom-h0)/(h1-h0);h1=bottom;}
        const x0=a[0]+vx*t0,z0=a[1]+vz*t0,x1=a[0]+vx*t1,z1=a[1]+vz*t1;
        const j=positions.length/3;
        positions.push(x0,bottom,z0,x1,bottom,z1,x1,h1,z1,x0,h0,z0);
        // Face the cut (towards the stair), not into the terrain mass.
        if((-vz)*(-ox)+vx*(-oz)>0)indices.push(j,j+1,j+2,j,j+2,j+3);
        else indices.push(j,j+2,j+1,j,j+3,j+2);
      }
    };
    for(let k=0;k<steps;k++){
      const u0=L*k/steps,u1=L*(k+1)/steps;
      const tread=k===0?s.y0+.06:k===steps-1?s.y1+.06:s.y0+(s.y1-s.y0)*(k+.5)/steps+.06;
      edge(pt(u0,STAIR_MIN_V),pt(u1,STAIR_MIN_V),-nx,-nz,tread);
      edge(pt(u0,STAIR_MAX_V),pt(u1,STAIR_MAX_V),nx,nz,tread);
    }
    edge(pt(0,STAIR_MIN_V),pt(0,STAIR_MAX_V),-ux,-uz,s.y0+.06);
    edge(pt(L,STAIR_MIN_V),pt(L,STAIR_MAX_V),ux,uz,s.y1+.06);
  }
  const geo=new BufferGeometry();
  geo.setAttribute("position",new BufferAttribute(new Float32Array(positions),3));
  geo.setIndex(indices);geo.computeVertexNormals();geo.computeBoundingSphere();
  return geo;
}
function stairTerrainIntersects(size,x,z){
  return STAIRS.some(s=>{
    const xs=[s.a[0]+s.n[0]*STAIR_MIN_V,s.a[0]+s.n[0]*STAIR_MAX_V,s.b[0]+s.n[0]*STAIR_MIN_V,s.b[0]+s.n[0]*STAIR_MAX_V];
    const zs=[s.a[1]+s.n[1]*STAIR_MIN_V,s.a[1]+s.n[1]*STAIR_MAX_V,s.b[1]+s.n[1]*STAIR_MIN_V,s.b[1]+s.n[1]*STAIR_MAX_V];
    return x<=Math.max(...xs)&&x+size>=Math.min(...xs)&&z<=Math.max(...zs)&&z+size>=Math.min(...zs);
  });
}
var TerrainLOD = class {
  constructor(scene, material) {
    this.scene = scene;
    this.material = material;
    this.cache = /* @__PURE__ */ new Map();
    this.active = /* @__PURE__ */ new Set();
    this.frame = 0;
    this.last = [Infinity, Infinity, Infinity];
    this.split = SPLIT;
    this.cacheLimit = 140;
    this.heightfieldTriangle=heightfieldTriangle;
    // The cut face must still shade and write depth at the edge of the mask.
    this.stairSeams=new Mesh(buildStairTerrainSeams(),makeTerrainMaterial({clipStairs:false}));
    this.stairSeams.name='terrain-stair-cut-boundaries';
    this.stairSeams.receiveShadow=true;
    this.stairSeams.matrixAutoUpdate=false;
    scene.add(this.stairSeams);
  }
  setQuality(q) {
    this.split = q.terrainSplit;
    this.cacheLimit = q.terrainCache;
    this.last = [Infinity, Infinity, Infinity];
  }
  update(cx, cz, cy) {
    const l = this.last;
    if (Math.hypot(cx - l[0], cz - l[1], cy - l[2]) < 6) return;
    this.last = [cx, cz, cy];
    this.frame++;
    const want = [];
    const visit = (size, x0, z0) => {
      const dx = Math.max(0, Math.abs(cx - (x0 + size / 2)) - size / 2), dz = Math.max(0, Math.abs(cz - (z0 + size / 2)) - size / 2);
      const d = Math.hypot(dx, dz, Math.max(0, cy - 200));
      if (size > CFG.chunk && (d < size * this.split || stairTerrainIntersects(size,x0,z0))) {
        const h = size / 2;
        visit(h, x0, z0);
        visit(h, x0 + h, z0);
        visit(h, x0, z0 + h);
        visit(h, x0 + h, z0 + h);
      } else want.push([size, x0, z0]);
    };
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) visit(ROOT, -CFG.half + i * ROOT, -CFG.half + j * ROOT);
    const next = /* @__PURE__ */ new Set();
    for (const [size, x0, z0] of want) {
      const k = size + ":" + x0 + ":" + z0;
      let m = this.cache.get(k);
      if (!m) {
        m = new Mesh(buildNodeGeometry(size, x0, z0), this.material);
        m.castShadow = m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        this.cache.set(k, m);
      }
      m.userData.used = this.frame;
      next.add(m);
    }
    for (const m of this.active) if (!next.has(m)) this.scene.remove(m);
    for (const m of next) if (!this.active.has(m)) this.scene.add(m);
    this.active = next;
    if (this.cache.size > this.cacheLimit) {
      const old = [...this.cache].filter(([, m]) => !next.has(m)).sort((a, b) => a[1].userData.used - b[1].userData.used);
      for (const [k, m] of old.slice(0, this.cache.size - Math.max(next.size, this.cacheLimit - 30))) {
        m.geometry.dispose();
        this.cache.delete(k);
      }
    }
  }
  get nodeCount() {
    return this.active.size;
  }
};
function makeFarRing(material) {
  const half = [0];
  let x = 0, st = CFG.farCell;
  while (x < CFG.half) {
    x += st;
    half.push(x);
  }
  while (x < CFG.farHalf) {
    st *= 1.12;
    x = Math.min(CFG.farHalf, x + st);
    half.push(x);
  }
  const axis = [...half.slice(1).reverse().map((v) => -v), ...half], V4 = axis.length;
  const pos = new Float32Array(V4 * V4 * 3), nor = new Float32Array(V4 * V4 * 3), idx = [];
  for (let j = 0; j < V4; j++) for (let i = 0; i < V4; i++) {
    const x2 = axis[i], z = axis[j], o = (j * V4 + i) * 3;
    const inside2 = Math.abs(x2) <= CFG.half && Math.abs(z) <= CFG.half;
    const e = Math.max(16, (axis[Math.min(V4 - 1, i + 1)] - axis[Math.max(0, i - 1)]) * 0.4);
    pos[o] = x2;
    pos[o + 2] = z;
    pos[o + 1] = inside2 ? sample(x2, z) - 2 : heightFn(x2, z);
    const nx = heightFn(x2 - e, z) - heightFn(x2 + e, z), nz = heightFn(x2, z - e) - heightFn(x2, z + e);
    const inv = 1 / Math.hypot(nx, 2 * e, nz);
    nor[o] = nx * inv;
    nor[o + 1] = 2 * e * inv;
    nor[o + 2] = nz * inv;
  }
  for (let j = 0; j < V4 - 1; j++) for (let i = 0; i < V4 - 1; i++) {
    if (axis[i] >= -CFG.half && axis[i + 1] <= CFG.half && axis[j] >= -CFG.half && axis[j + 1] <= CFG.half) continue;
    const a = j * V4 + i, b = a + V4;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("normal", new BufferAttribute(nor, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const m = new Mesh(geo, material);
  m.matrixAutoUpdate = false;
  return m;
}
var WATER_COMMON = (
  /* glsl */
  `
  ${GLSL_WORLD}
  ${GLSL_ATMOS}
  uniform sampler2D uHeight, uBake;
  float terrainH(vec2 p){ return inWorld(p)>.5 ? texture2D(uHeight,gridUV(p)).r : -60.; }
  float sunVis(vec2 p){ return inWorld(p)>.5 ? smoothstep(.15,.85,texture2D(uBake,bakeUV(p)).r) : 1.; }
  vec3 waterSurface(vec3 wp, float depth, vec3 shallow, vec3 deep, float waveScale, float flow){
    vec3 V=normalize(cameraPosition-wp);
    float dist=length(cameraPosition-wp);
    vec2 q=wp.xz*.038*waveScale;
    float n1=texture2D(uNoise,q+vec2(uTime*.018,uTime*.009)*flow).g;
    float n2=texture2D(uNoise,q*1.7-vec2(uTime*.014,-uTime*.007)*flow).b;
    vec2 ripples=vec2(dot(q,vec2(.83,.56)),dot(q,vec2(-.56,.83)));
    float r1=texture2D(uNoise,ripples*vec2(2.8,7.2)+vec2(-.04,.025)*uTime*flow).b;
    float r2=texture2D(uNoise,ripples*vec2(5.5,2.2)+vec2(.02,-.04)*uTime*flow).b;
    float near=1.-smoothstep(32.,275.,dist);
    float amp=.23*(1.-smoothstep(160.,1200.,dist)*.78);
    vec2 wave=(vec2(n1,n2)-.5)*amp+(vec2(r1,r2)-.5)*near*.10;
    vec3 N=normalize(vec3(wave.x,1.,wave.y));
    float fres=pow(1.-clamp(dot(N,V),0.,1.),4.5);
    vec3 R=reflect(-V,N); R.y=abs(R.y);
    float sun=sunVis(wp.xz);
    vec3 body=mix(shallow,deep,smoothstep(0.,1.,depth));
    body*=mix(vec3(.67,.80,.9),vec3(1.04,1.01,.96),sun);
    body*=.93+.12*n1+.035*r2*near;
    vec3 col=mix(body,skyBase(R),.12+.73*fres);
    float glint=max(dot(reflect(-uSunDir,N),V),0.);
    float spec=pow(glint,170.)*.92+pow(glint,39.)*.085;
    col+=vec3(1.,.91,.75)*spec*sun*uDay;
    return col;
  }
`
);
function waterMaterial(fragment2, opts = {}) {
  const mat2 = new ShaderMaterial({
    uniforms: {},
    vertexShader: (
      /* glsl */
      `varying vec3 vW; varying vec2 vUv; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vUv=uv; gl_Position=projectionMatrix*viewMatrix*w; }`
    ),
    fragmentShader: fragment2,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    ...opts
  });
  return bindShared(mat2);
}
function makeOcean() {
  const mat2 = waterMaterial(
    /* glsl */
    `
    ${WATER_COMMON}
    varying vec3 vW;
    void main(){
      float depth=-terrainH(vW.xz);
      if(depth<-0.05) discard;
      float dn=smoothstep(0.,26.,depth);
      vec3 shallow=vec3(.22,.79,.74), deep=vec3(.056,.29,.48);
      vec3 col=waterSurface(vW,dn,shallow,mix(vec3(.052,.54,.65),deep,smoothstep(.3,1.,dn)),1.,1.);
      vec2 p=vW.xz;
      float near=1.-smoothstep(35.,225.,distance(cameraPosition,vW));
      float tide=sin(p.x*.21+p.y*.15-uTime*1.05)*.13;
      float n=texture2D(uNoise,p*.075+vec2(uTime*.017,0.)).g;
      float shore=max(0.,depth+tide);
      float foam=(1.-smoothstep(.035,.39+(n-.5)*.48,shore))*smoothstep(.20,.82,n);
      float crest=.5+.5*sin(shore*4.2-uTime*1.18+n*3.);
      float threads=smoothstep(.89,.98,crest)*smoothstep(.34,.73,n)*(1.-smoothstep(.38,2.1,shore));
      vec2 q=p*.21;
      float c1=texture2D(uNoise,q+vec2(uTime*.026,-uTime*.023)).b;
      float c2=texture2D(uNoise,q*1.29-vec2(uTime*.019,uTime*.024)).b;
      float caustic=pow(1.-abs(c1-c2),14.)*(1.-smoothstep(.22,3.2,depth))*near*uDay;
      col+=vec3(.14,.22,.15)*caustic;
      col=mix(col,vec3(.88,.95,.92)*uSkyTint,clamp(foam*.91+threads*.50,0.,1.));
      float a=clamp(.13+smoothstep(0.,1.2,depth)*.67+smoothstep(1.,7.,depth)*.20+foam*.25,0.,1.);
      col=applyAtmos(col,vW);
      gl_FragColor=vec4(clamp(col,0.,1.),a);
    }`
  );
  const geo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const m = new Mesh(geo, mat2);
  m.scale.set(4e4, 1, 4e4);
  m.position.y = CFG.seaLevel;
  m.frustumCulled = false;
  m.renderOrder = 1;
  m.userData.follow = false;
  return m;
}
function makeRivers() {
  const group = new Group(), mists = [];
  const ribbonMat = waterMaterial(
    /* glsl */
    `
    ${WATER_COMMON}
    varying vec3 vW;
    void main(){
      float depth=vW.y-terrainH(vW.xz);
      if(depth<-0.02) discard;
      vec3 col=waterSurface(vW,smoothstep(0.,2.3,depth),vec3(.36,.88,.84),vec3(.06,.52,.74),1.,2.2);
      float n1=texture2D(uNoise,vW.xz*.05+vec2(uTime*.04,0.)).g;
      float foam=1.-smoothstep(0.,.32+n1*.28,depth);
      col=mix(col,vec3(.93,.97,.95),foam*.65);
      float a=clamp(smoothstep(0.,.28,depth)*.86+foam*.2,0.,.94);
      col=applyAtmos(col,vW);
      gl_FragColor=vec4(clamp(col,0.,1.),a);
    }`
  );
  const fallMat = waterMaterial(
    /* glsl */
    `
    ${GLSL_ATMOS}
    uniform sampler2D uStroke;
    varying vec3 vW; varying vec2 vUv;
    void main(){
      float s1=texture2D(uStroke,vec2(vUv.x*1.3,vUv.y*.9-uTime*1.25)).r;
      float s2=texture2D(uNoise,vec2(vUv.x*1.8,vUv.y*.5-uTime*.8)).g;
      float s3=texture2D(uNoise,vec2(vUv.x*4.,vUv.y*1.6-uTime*1.9)).b;
      float streak=s1*.5+s2*.3+s3*.2;
      vec3 col=mix(vec3(.50,.78,.86),vec3(.97,.99,1.),smoothstep(.38,.72,streak));
      float edge=smoothstep(0.,.18,vUv.x)*smoothstep(1.,.82,vUv.x);
      col=applyAtmos(col,vW);
      gl_FragColor=vec4(clamp(col,0.,1.),edge*(.72+.28*s2));
    }`
  );
  const steep = (p, q) => (p[2] - q[2]) / Math.max(Math.hypot(q[0] - p[0], q[1] - p[1]), 0.1) > 0.25;
  for (const r of World.rivers) {
    const pts = r.pts;
    let run = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      if (!steep(pts[i], pts[i + 1])) {
        run.push(pts[i + 1]);
        continue;
      }
      let j = i;
      while (j < pts.length - 1 && steep(pts[j], pts[j + 1])) j++;
      if (run.length > 1) group.add(ribbon(run, r.width, ribbonMat));
      group.add(fallSheet(pts[i], pts[j], r.width, fallMat));
      mists.push(...fallMist(pts[j], r.width, group));
      run = [pts[j]];
      i = j - 1;
    }
    if (run.length > 1) group.add(ribbon(run, r.width, ribbonMat));
  }
  group.userData.update = (t) => {
    for (const s of mists) {
      const k = (Math.sin(t * s.userData.f + s.userData.ph) + 1) * 0.5;
      s.material.opacity = 0.18 + 0.22 * k;
      const sc = s.userData.base * (0.85 + 0.3 * k);
      s.scale.set(sc, sc, 1);
    }
  };
  return group;
}
function ribbon(run, width, mat2) {
  const across = 8, pos = [], idx = [], lim = CFG.half - 40;
  const rows = run.filter((p) => Math.abs(p[0]) < lim && Math.abs(p[1]) < lim);
  for (let r = 0; r < rows.length; r++) {
    const a = rows[Math.max(0, r - 1)], b = rows[Math.min(rows.length - 1, r + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    const hw = width * 1.9;
    for (let c = 0; c <= across; c++) {
      const u = (c / across - 0.5) * 2 * hw;
      pos.push(rows[r][0] - tz * u, rows[r][2], rows[r][1] + tx * u);
    }
  }
  const W = across + 1;
  for (let r = 0; r < rows.length - 1; r++) for (let c = 0; c < across; c++) {
    const a = r * W + c, b = a + W;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const m = new Mesh(geo, mat2);
  m.renderOrder = 2;
  return m;
}
function fallSheet(p, q, width, mat2) {
  const steps = 16, across = 4, pos = [], uv = [], idx = [];
  let tx = q[0] - p[0], tz = q[1] - p[1];
  const tl = Math.hypot(tx, tz) || 1;
  tx /= tl;
  tz /= tl;
  const hw = width * 0.85, H = p[2] - q[2];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps, e = t * t * 0.35 + t * 0.65;
    const x = p[0] + (q[0] - p[0]) * e, z = p[1] + (q[1] - p[1]) * e, y = p[2] - H * t;
    const w = hw * (1 + t * 0.35);
    for (let c = 0; c <= across; c++) {
      const u = (c / across - 0.5) * 2 * w;
      pos.push(x - tz * u, y, z + tx * u);
      uv.push(c / across, t * H / 14);
    }
  }
  const W = across + 1;
  for (let s = 0; s < steps; s++) for (let c = 0; c < across; c++) {
    const a = s * W + c, b = a + W;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const m = new Mesh(geo, mat2);
  m.renderOrder = 3;
  return m;
}
var mistTex = null;
function fallMist(q, width, group) {
  mistTex ?? (mistTex = makeSoftSpriteTexture());
  const out2 = [];
  for (let k = 0; k < 7; k++) {
    const mat2 = new SpriteMaterial({ map: mistTex, transparent: true, depthWrite: false, opacity: 0.3, color: 15924223 });
    const s = new Sprite(mat2);
    const a = k / 7 * Math.PI * 2;
    s.position.set(q[0] + Math.cos(a) * width * 0.9, q[2] + 2 + k % 3 * 2.5, q[1] + Math.sin(a) * width * 0.9);
    s.userData = { base: width * (1.6 + k % 3 * 0.5), f: 0.6 + k * 0.13, ph: k };
    s.renderOrder = 4;
    group.add(s);
    out2.push(s);
  }
  return out2;
}
var CELL = 32;
// Registered runtime metadata is optional in isolated legacy physics tests.
var WorldCollision = null;
var grid = /* @__PURE__ */ new Map();
var all = [];
var stamp = 0;
var key = (i, j) => i * 73856093 ^ j * 19349663;
function insert(o, x, z, r) {
  o._s = 0;
  for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++)
    for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
      const k = key(i, j);
      let b = grid.get(k);
      if (!b) grid.set(k, b = []);
      b.push(o);
    }
  all.push(o);
  return o;
}
function addBox(b) {
  b.type = "box";
  b.cos = Math.cos(b.yaw || 0);
  b.sin = Math.sin(b.yaw || 0);
  b.top = b.cy + b.hy;
  b.bot = b.cy - b.hy;
  b.walk = b.walk !== false;
  const record=insert(b, b.cx, b.cz, Math.hypot(b.hx, b.hz));
  WorldCollision?.primitive(record);
  return record;
}
function addCyl(c) {
  c.type = "cyl";
  c.top = c.y1;
  c.bot = c.y0;
  c.walk = c.walk !== false;
  const record=insert(c, c.x, c.z, c.r);
  WorldCollision?.primitive(record);
  return record;
}
var out = [];
function query(x, z, r) {
  stamp++;
  out.length = 0;
  for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++)
    for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
      const b = grid.get(key(i, j));
      if (!b) continue;
      for (const o of b) if (o._s !== stamp) {
        o._s = stamp;
        out.push(o);
      }
    }
  return out;
}
function local(o, x, z) {
  const dx = x - o.cx, dz = z - o.cz;
  return [dx * o.cos - dz * o.sin, dx * o.sin + dz * o.cos];
}
function inside(o, x, z, m) {
  if (o.type === "cyl") return Math.hypot(x - o.x, z - o.z) <= o.r + m;
  const [lx, lz] = local(o, x, z);
  return Math.abs(lx) <= o.hx + m && Math.abs(lz) <= o.hz + m;
}
function groundAt(x, z, feetY) {
  // Use the continuous stair ramp for foot contact. The rendered stone treads
  // remain discrete; snapping the player to their heights causes visible jolts.
  let tread = stairSurface(x, z);
  if (tread === null) {
    const r = PLAYER.radius * 0.66;
    const contacts = [stairSurface(x + r, z), stairSurface(x - r, z), stairSurface(x, z + r), stairSurface(x, z - r)].filter((h) => h !== null && h <= feetY + PLAYER.step + 0.03);
    if (contacts.length) tread = Math.max(...contacts);
  }
  // Walkable decks above stairs must win only for actors already high enough
  // to step on them. A player below the promenade continues on stair treads.
  let g = tread !== null ? tread : sample(x, z);
  for (const o of query(x, z, 0)) {
    if (!o.walk || o.top > feetY + PLAYER.step || o.top <= g) continue;
    if (inside(o, x, z, 0)) g = o.top;
  }
  return g;
}
// Roofs, cone caps and awnings are thin visual surfaces, not colliders.
// Each record gives its top surface in local coordinates. Over the solid
// footprint below it the surface is player ground sampled at the feet, like
// terrain. The overhang outside the footprint is a one-way support from
// above and a slab that climbing bodies cannot pass through.
//   shape "gable": ridge along local x (or z when acrossX), linear fall
//   shape "cone": radial fall from the centre
//   shape "shed": single slope along local z, from z0 (hi) to z1 (lo)
var roofGrid=new Map();
function addRoof(r) {
  r.cos=Math.cos(r.yaw||0);r.sin=Math.sin(r.yaw||0);
  r.foot??="rect";r.thick??=.3;
  const reach=r.outerR??Math.hypot(r.ox,r.oz);
  for(let i=Math.floor((r.cx-reach)/CELL);i<=Math.floor((r.cx+reach)/CELL);i++)
    for(let j=Math.floor((r.cz-reach)/CELL);j<=Math.floor((r.cz+reach)/CELL);j++){
      const k=key(i,j);let b=roofGrid.get(k);
      if(!b)roofGrid.set(k,b=[]);
      b.push(r);
    }
  WorldCollision?.roof(r);
  return r;
}
// Radius in a faceted cone's own polygon (G.cone: seg corners from rot).
function roofRadial(r,lx,lz) {
  if(!r.seg)return Math.hypot(lx,lz);
  let d=-Infinity;
  for(let i=0;i<r.seg;i++){
    const a=(i+.5)/r.seg*Math.PI*2+(r.rot||0);
    d=Math.max(d,lx*Math.cos(a)+lz*Math.sin(a));
  }
  return d/Math.cos(Math.PI/r.seg);
}
function roofSurfaceLocal(r,lx,lz) {
  if(r.shape==="cone")return r.base+r.rise*(1-roofRadial(r,lx,lz)/r.half);
  if(r.shape==="shed")return r.base+r.rise*(lz-r.z0)/(r.z1-r.z0);
  return r.base+r.rise*(1-Math.abs(r.acrossX?lx:lz)/r.half);
}
function roofInFoot(r,lx,lz) {
  if(!r.hx&&!r.hz&&!r.footR)return false;
  return r.foot==="circle"?Math.hypot(lx,lz)<=r.footR:Math.abs(lx)<=r.hx&&Math.abs(lz)<=r.hz;
}
function roofInOuter(r,lx,lz) {
  return r.outerR?roofRadial(r,lx,lz)<=r.outerR:Math.abs(lx)<=r.ox&&Math.abs(lz)<=r.oz;
}
function roofRecords(x,z) {
  return roofGrid.get(key(Math.floor(x/CELL),Math.floor(z/CELL)));
}
// Ground over a solid footprint.
function roofHeight(x,z) {
  if(WorldCollision?.surfaceAt)return WorldCollision.surfaceAt(x,z,"roof-foot")?.point[1]??-Infinity;
  const b=roofRecords(x,z);
  let h=-Infinity;
  if(!b)return h;
  for(const r of b){
    const [lx,lz]=local(r,x,z);
    if(roofInFoot(r,lx,lz))h=Math.max(h,roofSurfaceLocal(r,lx,lz));
  }
  return h;
}
// Top edge of a G.roof gable triangle, the wall face continuing above the
// wall box at a gable end (gable records only; -Infinity elsewhere).
function roofGableTop(x,z) {
  const b=roofRecords(x,z);
  let h=-Infinity;
  if(!b)return h;
  for(const r of b){
    if(!r.gable)continue;
    const [lx,lz]=local(r,x,z),along=r.acrossX?lz:lx,across=r.acrossX?lx:lz,end=r.acrossX?r.hz:r.hx,side=r.acrossX?r.hx:r.hz;
    if(!roofInFoot(r,lx,lz)||Math.abs(along)<end-.06)continue;
    h=Math.max(h,r.base+.25+(r.rise-.25)*(side-Math.abs(across))/r.half);
  }
  return h;
}
// Highest overhang surface at the point not above maxY (one-way support).
function roofOverhangTop(x,z,maxY=Infinity) {
  if(WorldCollision?.surfaceAt)return WorldCollision.surfaceAt(x,z,"roof-overhang",maxY)?.point[1]??-Infinity;
  const b=roofRecords(x,z);
  let h=-Infinity;
  if(!b)return h;
  for(const r of b){
    const [lx,lz]=local(r,x,z);
    if(roofInFoot(r,lx,lz)||!roofInOuter(r,lx,lz))continue;
    const y=roofSurfaceLocal(r,lx,lz);
    if(y<=maxY+CONTACT_SKIN&&y>h)h=y;
  }
  return h;
}
// Overhang slab {top,bottom} spans at a point.
function roofSlabsAt(x,z,out=[]) {
  out.length=0;
  const b=roofRecords(x,z);
  if(!b)return out;
  for(const r of b){
    const [lx,lz]=local(r,x,z);
    if(roofInFoot(r,lx,lz)||!roofInOuter(r,lx,lz))continue;
    const top=roofSurfaceLocal(r,lx,lz);
    out.push({top,bottom:r.solid?Math.min(r.base,top):top-r.thick,record:r});
  }
  return out;
}
var ROOF_RING=Array.from({length:8},(_,i)=>[Math.cos(i*Math.PI/4),Math.sin(i*Math.PI/4)]);
var _slabs=[];
// A standing body overlaps an overhang slab. Feet on top of a sloped slab
// (within the slope across the body radius) are standing, not overlapping.
function roofSlabHit(x,z,y,radius=PLAYER.radius,height=PLAYER.body) {
  for(let i=-1;i<8;i++){
    const px=i<0?x:x+ROOF_RING[i][0]*radius,pz=i<0?z:z+ROOF_RING[i][1]*radius;
    for(const s of roofSlabsAt(px,pz,_slabs))if(y+.45<s.top&&y+height>s.bottom+CONTACT_SKIN)return true;
  }
  return false;
}
// The visible roof surface: footprint ground or overhang, else terrain.
function roofOrTerrain(x,z) {
  return Math.max(playerTerrain(x,z),roofOverhangTop(x,z));
}
// Player contacts use the rendered stair treads, not the NPC navigation ramp.
// The nearby terrain mesh uses two triangles per grid cell, not a bilinear quad.
function playerTerrain(x,z,maxY=Infinity,supportOnly=false) {
  // Locomotion picks the highest reachable registered tread. If none is
  // reachable, retain the authored flight as the existing rise barrier.
  // Unbounded scenery queries keep their original declaration order.
  // Recovery/presentation must not treat an unreachable upper tread as ground.
  const tread=WorldCollision?.hasSurfaceKind("stair")?(
    WorldCollision.surfaceAt(x,z,"stair",maxY)?.point[1]??
    (Number.isFinite(maxY)&&!supportOnly?WorldCollision.surfaceAt(x,z,"stair")?.point[1]:null)??null
  ):stairSurface(x,z,0,true);
  if(tread!==null)return tread;
  return Math.max(heightfieldTriangle(x,z),roofHeight(x,z));
}
function heightfieldTriangle(x,z){
  if(WorldCollision?.hasSurfaceKind("terrain")){
    const hit=WorldCollision.surfaceAt(x,z,"terrain");
    return hit?hit.point[1]:sample(x,z);
  }
  const gx=(x+HALF)/CFG.cell,gz=(z+HALF)/CFG.cell;
  if(gx<0||gz<0||gx>=GRID_N-1||gz>=GRID_N-1)return sample(x,z);
  const i=Math.floor(gx),j=Math.floor(gz),u=gx-i,v=gz-j,k=j*GRID_N+i,H=World.H;
  const a=H[k],b=H[k+1],c=H[k+GRID_N],d=H[k+GRID_N+1];
  return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
}
// Ground steeper than 50 degrees is not standing ground. It returns the
// uphill direction; solid tops and stair treads are always level supports.
var WALK_GRADE=Math.tan(50*Math.PI/180);
function playerSteepGround(x,z,floor) {
  const e=.04;
  if(!Number.isFinite(floor))return null;
  const roof=Math.max(roofHeight(x,z),roofOverhangTop(x,z,floor));
  const onRoof=Math.abs(floor-roof)<=CONTACT_SKIN;
  if(!onRoof&&Math.abs(floor-playerTerrain(x,z,floor,true))>CONTACT_SKIN)return null;
  const registeredStairs=WorldCollision?.hasSurfaceKind("stair");
  for(const [ox,oz] of [[0,0],[e,0],[-e,0],[0,e],[0,-e]]){
    const tread=registeredStairs?
      WorldCollision.surfaceAt(x+ox,z+oz,"stair",floor+PLAYER.step+CONTACT_SKIN)?.point[1]??null:
      stairSurface(x+ox,z+oz,0,true);
    if(tread!==null&&(!registeredStairs||Math.abs(tread-floor)<=PLAYER.step+CONTACT_SKIN))return null;
  }
  // Prefer the registered exact triangle/ramp normal. Roofs and ambiguous
  // features keep the legacy seam/overhang path until their own migration.
  if(!onRoof&&WorldCollision?.groundSlope){
    const slope=WorldCollision.groundSlope(x,z,floor,50*Math.PI/180);
    if(slope!==undefined)return slope;
  }
  // On a roof sample the continuous roof surface across the wall line.
  const H=onRoof?roofOrTerrain:registeredStairs?(x,z)=>playerTerrain(x,z,floor+PLAYER.step+CONTACT_SKIN,true):playerTerrain;
  const gx=(H(x+e,z)-H(x-e,z))/(2*e),gz=(H(x,z+e)-H(x,z-e))/(2*e),k=Math.hypot(gx,gz);
  return k>WALK_GRADE?{ux:gx/k,uz:gz/k,k}:null;
}
var CONTACT_SKIN=.002;
// Circular horizontal cross-section of a standing capsule/cylinder. Positive
// penetration means overlap; normals always point out of the obstacle.
function playerContact(o,x,z,radius) {
  if(o.type==="cyl"){
    const dx=x-o.x,dz=z-o.z,d=Math.hypot(dx,dz),depth=o.r+radius-d;
    return depth>CONTACT_SKIN?{nx:d>1e-8?dx/d:1,nz:d>1e-8?dz/d:0,depth,collider:o}:null;
  }
  const [lx,lz]=local(o,x,z),qx=clamp2(lx,-o.hx,o.hx),qz=clamp2(lz,-o.hz,o.hz);
  let dx=lx-qx,dz=lz-qz,d=Math.hypot(dx,dz),depth=radius-d;
  if(d>1e-8){if(depth<=CONTACT_SKIN)return null;dx/=d;dz/=d;}
  else{
    const a=o.hx-Math.abs(lx),b=o.hz-Math.abs(lz);
    if(a<b){dx=Math.sign(lx||1);dz=0;depth=radius+a;}
    else{dx=0;dz=Math.sign(lz||1);depth=radius+b;}
  }
  return {nx:dx*o.cos+dz*o.sin,nz:-dx*o.sin+dz*o.cos,depth,collider:o};
}
// The static broad phase is collected once per physics substep. The
// candidate search never repeats the 32m spatial-grid query for every probe.
function playerSweepColliders(x,z,range=PLAYER.radius) {
  const candidates=WorldCollision?.activePrimitives?WorldCollision.activePrimitives(x,z,range):query(x,z,range);
  return candidates.filter(o=>playerContact(o,x,z,range+.004));
}
function playerFloor(x,z,maxY,radius=PLAYER.radius,solids=null) {
  // Support queries must ignore an unreachable upper stair, even though
  // horizontal admission still uses it as an authored rise barrier.
  let h=playerTerrain(x,z,maxY,true);
  if(h>maxY+CONTACT_SKIN)h=-Infinity;
  // Roof eaves and awnings carry feet from above, never block from below.
  h=Math.max(h,roofOverhangTop(x,z,maxY));
  if(WorldCollision?.staticSupport){
    const hit=WorldCollision.staticSupport(x,z,maxY,radius,solids,PLAYER.body);
    if(hit&&hit.point[1]>h)h=hit.point[1];
  }else{
    for(const o of solids??query(x,z,radius)){
      // Legacy extraction stays executable for isolated movement regressions.
      if(o.top>maxY+CONTACT_SKIN||o.top<=h)continue;
      if(radius===0?inside(o,x,z,0):playerContact(o,x,z,radius))h=o.top;
    }
  }
  return h;
}
function playerContacts(x,z,y,nearby=[],radius=PLAYER.radius,solids=null) {
  // T1 common static-overlap authority: retain the existing collision response
  // objects and candidate order while deriving contacts through one registry.
  // Standalone legacy regression fixtures use the exact previous implementation.
  if(WorldCollision?.contacts)return WorldCollision.contacts(x,z,y,nearby,radius,solids,PLAYER.body);
  const contacts=[];
  for(const o of solids??query(x,z,radius)){
    if(o.top<=y+CONTACT_SKIN||o.bot>=y+PLAYER.body-CONTACT_SKIN)continue;
    const c=playerContact(o,x,z,radius);if(c)contacts.push(c);
  }
  for(const o of nearby){
    if(o.top<=y+CONTACT_SKIN||o.bot>=y+PLAYER.body-CONTACT_SKIN)continue;
    const c=playerContact(o,x,z,radius);if(c)contacts.push(c);
  }
  return contacts;
}
function playerCeiling(x,z,y,targetY,solids=null) {
  let top=targetY;
  if(WorldCollision?.staticCeiling){
    const hit=WorldCollision.staticCeiling(x,z,y,targetY,solids,PLAYER.radius,PLAYER.body);
    if(hit)top=Math.min(top,hit.point[1]-PLAYER.body-CONTACT_SKIN);
  }else{
    for(const o of solids??query(x,z,PLAYER.radius)){
      if(o.bot<y+PLAYER.body-CONTACT_SKIN||o.bot>top+PLAYER.body||!playerContact(o,x,z,PLAYER.radius))continue;
      top=Math.min(top,o.bot-PLAYER.body-CONTACT_SKIN);
    }
  }
  // A head rising into an eave or awning stops at its underside.
  for(let i=-1;i<8;i++){
    const px=i<0?x:x+ROOF_RING[i][0]*PLAYER.radius,pz=i<0?z:z+ROOF_RING[i][1]*PLAYER.radius;
    for(const s of roofSlabsAt(px,pz,_slabs)){
      if(s.bottom<y+PLAYER.body-CONTACT_SKIN||s.bottom>top+PLAYER.body)continue;
      top=Math.min(top,s.bottom-PLAYER.body-CONTACT_SKIN);
    }
  }
  return Math.max(y,top);
}
// Restore saves or teleport onto a real walkable surface, not a nearby
// collision proxy's roof. Invalid positions are repaired locally once.
function playerSafeSpawn(x,z,y=null) {
  function probe(px,pz) {
    let h=playerTerrain(px,pz,y==null?Infinity:y+CONTACT_SKIN,y!=null);
    if(y==null){
      for(const o of query(px,pz,0))if(o.walk&&o.type==="box"&&inside(o,px,pz,0)&&o.top>h)h=o.top;
    }else h=Math.max(h,y);
    if(!Number.isFinite(h)||playerContacts(px,pz,h).length)return null;
    return {x:px,z:pz,y:h};
  }
  const direct=probe(x,z);if(direct)return direct;
  for(let r=.25;r<=24;r+=r<3?.25:1){
    const n=Math.max(8,Math.ceil(2*Math.PI*r/.6));
    for(let k=0;k<n;k++){
      const a=k/n*Math.PI*2,point=probe(x+Math.cos(a)*r,z+Math.sin(a)*r);
      if(point)return point;
    }
  }
  // Exceptional malformed world geometry: do not start underground.
  return {x,z,y:Math.max(playerTerrain(x,z,y==null?Infinity:y+CONTACT_SKIN,y!=null),y??-Infinity)};
}
function playerFootSurface(x,z,feetY) {
  const h=playerFloor(x,z,feetY+PLAYER.step,0);
  return Number.isFinite(h)?h:null;
}

function activeBodyCandidates(x,z,range){
  return WorldCollision?.activePrimitives?WorldCollision.activePrimitives(x,z,range):query(x,z,range);
}
function bodyBlockedAt(x, z, feetY, radius = PLAYER.radius, height = PLAYER.body) {
  for (const o of activeBodyCandidates(x, z, radius + 1)) {
    if (o.top <= feetY + 0.025 || o.bot >= feetY + height - 0.025) continue;
    if (o.walk && o.top <= feetY + PLAYER.step + 0.025) continue;
    if (o.type === "cyl") {
      if (Math.hypot(x - o.x, z - o.z) < o.r + radius - 1e-5) return true;
    } else {
      const [lx, lz] = local(o, x, z);
      const dx = Math.max(0, Math.abs(lx) - o.hx), dz = Math.max(0, Math.abs(lz) - o.hz);
      if (dx * dx + dz * dz < radius * radius - 1e-5) return true;
    }
  }
  return false;
}
function pushOut(pos, radius, height) {
  const feet = pos.y;
  for (const o of activeBodyCandidates(pos.x, pos.z, radius + 1)) {
    if (feet >= o.top - 0.03 || feet + height <= o.bot) continue;
    if (o.walk && o.top - feet <= PLAYER.step) continue;
    if (o.type === "cyl") {
      const dx = pos.x - o.x, dz = pos.z - o.z, d2 = Math.hypot(dx, dz), min = o.r + radius;
      if (d2 < min && d2 > 1e-5) {
        pos.x = o.x + dx / d2 * min;
        pos.z = o.z + dz / d2 * min;
      }
      continue;
    }
    const [lx, lz] = local(o, pos.x, pos.z);
    const cxl = Math.max(-o.hx, Math.min(o.hx, lx)), czl = Math.max(-o.hz, Math.min(o.hz, lz));
    let nx = lx - cxl, nz = lz - czl, d = Math.hypot(nx, nz);
    let px2, pz2;
    if (d > 1e-5) {
      if (d >= radius) continue;
      px2 = cxl + nx / d * radius;
      pz2 = czl + nz / d * radius;
    } else {
      const ex = o.hx - Math.abs(lx), ez = o.hz - Math.abs(lz);
      if (ex < ez) {
        px2 = Math.sign(lx || 1) * (o.hx + radius);
        pz2 = lz;
      } else {
        px2 = lx;
        pz2 = Math.sign(lz || 1) * (o.hz + radius);
      }
    }
    pos.x = o.cx + px2 * o.cos + pz2 * o.sin;
    pos.z = o.cz - px2 * o.sin + pz2 * o.cos;
  }
}
function occupiedAt(x, z, g, margin = 0.4) {
  for (const o of activeBodyCandidates(x, z, margin + 1)) {
    if (o.top <= g + PLAYER.step || o.bot >= g + 1.7) continue;
    if (inside(o, x, z, margin)) return true;
  }
  return false;
}
function collidersAt(x, z, margin = 0) {
  return query(x, z, margin + 1).filter((o) => inside(o, x, z, margin)).map((o) => ({ type: o.type, top: +o.top.toFixed(2), bot: +o.bot.toFixed(2), walk: o.walk, c: [o.cx ?? o.x, o.cz ?? o.z].map((v) => +v.toFixed(1)) }));
}
