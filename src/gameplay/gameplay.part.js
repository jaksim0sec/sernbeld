import {loadStudioSource} from './src/entities/character/studio-source.js';
import {createStudioGeometry} from './src/entities/character/studio-geometry.js';
import {createStudioModel} from './src/entities/character/studio-model.js';
import {resolveNpcAppearance} from './src/entities/character/appearance.js';
import {createCharacterRuntime} from './src/entities/character/studio-integration.js';
import {createGameEvents} from './src/core/game-events.js';
import {createEntityRegistry} from './src/core/entity-registry.js';
import {createInventory} from './src/core/inventory.js';
import {createRegionLifecycle} from './src/core/region-lifecycle.js';
import {validateSkill, compileSkill} from './src/core/skill-engine.js';
import {createSkillLibrary} from './src/core/skill-library.js';
var TINT = {
  stone: [0.82, 0.8, 0.75],
  roof: [0.8, 0.47, 0.36],
  wood: [0.62, 0.5, 0.4],
  accent: [0.55, 0.7, 0.92],
  canopy: [0.93, 0.7, 0.82],
  sail: [0.95, 0.93, 0.88]
};
var mats = {};
var TOWN = { houses: [] };
function mat(name) {
  if (mats[name]) return mats[name];
  return mats[name] = makeLitMaterial({
    uniforms: { uTint: { value: new Vector3(...TINT[name]) } },
    head: (
      /* glsl */
      `uniform vec3 uTint;`
    ),
    body: (
      /* glsl */
      `
      vec3 bw=vWorld*.42;
      float hatch=smoothstep(.42,.58,fract(bw.x+bw.y*.8+bw.z*.6));
      alb=uTint*mix(1.,.86,hatch);
      eN=0.;
    `
    )
  });
}
var UP = new Vector3(0, 1, 0);
var _q = new Quaternion();
var _m = new Matrix4();
var _p = new Vector3();
var _s = new Vector3();
var boxGeo = new BoxGeometry(1, 1, 1);
var prismGeo = (() => {
  const v = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5, -0.5, 0, 0.5, 0, 1, 0.5, 0.5, 0, 0.5];
  const tri = [0, 2, 1, 3, 5, 4, 0, 3, 4, 0, 4, 2, 1, 2, 4, 1, 4, 5, 0, 1, 5, 0, 5, 3];
  const pos = [];
  for (const i of tri) pos.push(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
})();
function mesh(geo, m, x, y, z, yaw = 0) {
  const o = new Mesh(geo, m);
  o.position.set(x, y, z);
  o.rotation.y = yaw;
  o.castShadow = o.receiveShadow = true;
  return o;
}
function box(g, tint, x, y0, z, sx, sy, sz, yaw = 0, walk = true, collide = true) {
  const o = mesh(boxGeo, mat(tint), x, y0 + sy / 2, z, yaw);
  o.scale.set(sx, sy, sz);
  g.add(o);
  if (collide) addBox({ cx: x, cy: y0 + sy / 2, cz: z, hx: sx / 2, hy: sy / 2, hz: sz / 2, yaw, walk });
  return o;
}
function cyl(g, tint, x, y0, z, r0, r1, h, collide = true, seg = 16) {
  const o = mesh(new CylinderGeometry(r1, r0, h, seg), mat(tint), x, y0 + h / 2, z);
  g.add(o);
  if (collide) addCyl({ x, z, r: Math.max(r0, r1), y0, y1: y0 + h });
  return o;
}
var off = (x, z, yaw, lx, lz) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
var BUILDERS = {
  windmill(g, L) {
    const y = sample(L.x, L.z) - 0.5;
    cyl(g, "stone", L.x, y, L.z, 4.8, 3.4, 13);
    g.add(mesh(new ConeGeometry(4.2, 4.5, 16), mat("roof"), L.x, y + 15.2, L.z));
    const hub = new Group();
    hub.position.set(L.x, y + 11.5, L.z + 4.2);
    for (let k = 0; k < 4; k++) {
      const arm = new Group();
      arm.rotation.z = k * Math.PI / 2;
      const blade2 = new Mesh(boxGeo, mat("wood"));
      blade2.scale.set(1.6, 11, 0.25);
      blade2.position.y = 6;
      blade2.castShadow = true;
      arm.add(blade2);
      hub.add(arm);
    }
    g.add(hub);
    g.userData.spin = g.userData.spin || [];
    g.userData.spin.push(hub);
  },
  monastery(g, L) {
    const yaw = L.yaw || 0, y = sample(L.x, L.z) - 0.5;
    let [x, z] = off(L.x, L.z, yaw, 0, 0);
    box(g, "stone", x, y, z, 44, 16, 22, yaw);
    const r = mesh(prismGeo, mat("roof"), x, y + 16, z, yaw);
    r.scale.set(23, 8, 45);
    r.rotation.y = yaw + Math.PI / 2;
    g.add(r);
    [x, z] = off(L.x, L.z, yaw, 18, -15);
    box(g, "stone", x, y, z, 9, 30, 9, yaw);
    g.add(mesh(new ConeGeometry(6.4, 15, 4), mat("accent"), x, y + 37.5, z, yaw + Math.PI / 4));
    [x, z] = off(L.x, L.z, yaw, -4, 28);
    cyl(g, "stone", x, y, z, 3.4, 3.4, 1.3);
    for (const s of [-1, 1]) {
      [x, z] = off(L.x, L.z, yaw, s * 20, 30);
      box(g, "stone", x, y, z, 3, 6, 18, yaw);
    }
  },
  gazebo(g, L) {
    const y = sample(L.x, L.z);
    cyl(g, "stone", L.x, y - 0.6, L.z, 7.5, 7.5, 1.2, true, 24);
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      cyl(g, "stone", L.x + Math.cos(a) * 6.2, y + 0.6, L.z + Math.sin(a) * 6.2, 0.4, 0.4, 5.2, true, 8);
    }
    g.add(mesh(new SphereGeometry(7.4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat("accent"), L.x, y + 5.6, L.z));
  },
  shrine(g, L) {
    const y = sample(L.x, L.z);
    cyl(g, "stone", L.x, y - 0.8, L.z, 13, 13, 1.6, true, 28);
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * Math.PI * 2 + Math.PI / 4;
      box(g, "stone", L.x + Math.cos(a) * 9.5, y + 0.8, L.z + Math.sin(a) * 9.5, 1.6, 10, 1.6);
    }
    const ring2 = mesh(new TorusGeometry(7, 0.55, 8, 40), mat("accent"), L.x, y + 10, L.z);
    g.add(ring2);
    const cr = mesh(new OctahedronGeometry(2.4), mat("accent"), L.x, y + 10, L.z);
    cr.scale.y = 1.6;
    cr.userData.dynamic = true;
    g.add(cr);
    g.userData.spin = g.userData.spin || [];
    g.userData.spin.push(cr);
  },
  bridge(g, L) {
    const [ax, az] = L.a, [bx, bz] = L.b, dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), yaw = Math.atan2(-dz, dx);
    const cx = (ax + bx) / 2, cz = (az + bz) / 2, W = L.width;
    box(g, "stone", cx, L.y - 2, cz, len, 2, W, yaw);
    for (const s of [-1, 1]) {
      const [x, z] = off(cx, cz, yaw, 0, s * (W / 2 - 0.25));
      box(g, "stone", x, L.y, z, len, 1.1, 0.5, yaw, false);
    }
    for (let t = 0.12; t < 0.9; t += 0.19) {
      const x = ax + dx * t, z = az + dz * t, gy = sample(x, z);
      if (L.y - gy > 18) cyl(g, "stone", x, gy - 2, z, 3.2, 2.4, L.y - 2 - gy + 2, true, 10);
    }
    for (const [ex, ez] of [[ax, az], [bx, bz]]) for (const s of [-1, 1]) {
      const [x, z] = off(ex, ez, yaw, 0, s * (W / 2 + 2.6));
      box(g, "accent", x, sample(x, z) - 1, z, 4.2, 16, 4.2, yaw);
    }
  },
  pier(g, L) {
    const [bx, bz] = L.b, len0 = Math.hypot(bx - L.a[0], bz - L.a[1]);
    const ux = (bx - L.a[0]) / len0, uz = (bz - L.a[1]) / len0, ax = L.a[0] - ux * 10, az = L.a[1] - uz * 10;
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), yaw = Math.atan2(-dz, dx);
    box(g, "wood", (ax + bx) / 2, -4, (az + bz) / 2, len, 7, 5, yaw);
  },
  ship(g, L) {
    const yaw = L.yaw || 0;
    box(g, "wood", L.x, -2, L.z, 26, 6, 8, yaw);
    const [mx, mz] = off(L.x, L.z, yaw, 2, 0);
    cyl(g, "wood", mx, 4, mz, 0.35, 0.3, 18, true, 8);
    const sail = mesh(new PlaneGeometry(10, 11), mat("sail"), mx, 13, mz, yaw);
    sail.material.side = DoubleSide;
    g.add(sail);
  },
  arch(g, L) {
    const yaw = L.yaw || 0, y = sample(L.x, L.z) - 0.6;
    for (const s of [-1, 1]) {
      const [x, z] = off(L.x, L.z, yaw, s * 4.6, 0);
      box(g, "stone", x, y, z, 1.9, 9.5, 1.9, yaw);
    }
    box(g, "stone", L.x, y + 9.5, L.z, 11.4, 1.7, 2.1, yaw);
  },
  building(g, L) {
    const y = sample(L.x, L.z) - 0.5;
    box(g, L.tint === "accent" ? "stone" : L.tint, L.x, y, L.z, L.w, L.h, L.d, L.yaw, false);
    const r = mesh(prismGeo, mat("roof"), L.x, y + L.h, L.z, L.yaw);
    r.scale.set(L.w + 1.4, L.d * 0.55, L.d + 1.4);
    r.rotation.y = L.yaw + Math.PI / 2;
    g.add(r);
    const [dx, dz] = off(L.x, L.z, L.yaw, 0, L.d / 2 + 0.3);
    box(g, L.tint === "accent" ? "accent" : "wood", dx, y, dz, 3, 3.6, 0.6, L.yaw, false);
    const [sx, sz] = off(L.x, L.z, L.yaw, L.w * 0.3, L.d / 2 + 0.6);
    box(g, "accent", sx, y + 3.2, sz, 2.4, 1.2, 0.2, L.yaw, false, false);
  },
  board(g, L) {
    const y = sample(L.x, L.z) - 0.2;
    for (const s of [-1, 1]) {
      const [px2, pz2] = off(L.x, L.z, L.yaw, s * 1.4, 0);
      box(g, "wood", px2, y, pz2, 0.18, 2.6, 0.18, L.yaw, false);
    }
    box(g, "wood", L.x, y + 1, L.z, 3, 1.5, 0.12, L.yaw, false);
    box(g, "sail", L.x, y + 1.15, L.z, 2.6, 1.15, 0.16, L.yaw, false, false);
  },
  stall(g, L) {
    const y = sample(L.x, L.z) - 0.2;
    box(g, "wood", L.x, y, L.z, 4, 1.1, 2, L.yaw, false);
    for (const s of [-1, 1]) for (const t of [-1, 1]) {
      const [px2, pz2] = off(L.x, L.z, L.yaw, s * 1.9, t * 0.9);
      box(g, "wood", px2, y, pz2, 0.15, 2.6, 0.15, L.yaw, false, false);
    }
    const a = mesh(prismGeo, mat("roof"), L.x, y + 2.5, L.z, L.yaw);
    a.scale.set(2.6, 0.7, 4.4);
    a.rotation.y = L.yaw + Math.PI / 2;
    g.add(a);
  },
  town(g, L) {
    const R = World.region, padIdx = R.pads.findIndex((p) => p.id === L.pad), pf = World.F.pads[padIdx].f, pad = R.pads[padIdx];
    const rnd = mulberry32(L.seed || 1), xs = pad.poly.map((p) => p[0]), zs = pad.poly.map((p) => p[1]);
    const houses = [], gridYaw = 0.3;
    for (let x = Math.min(...xs); x < Math.max(...xs); x += 21) for (let z = Math.min(...zs); z < Math.max(...zs); z += 21) {
      const px2 = x + (rnd() - 0.5) * 8, pz2 = z + (rnd() - 0.5) * 8;
      if (pf.sample(px2, pz2) < 9) continue;
      const rf = World.F.road;
      rf.sample(px2, pz2);
      if (rf.d < rf.b * 0.5 + 7) continue;
      if (Math.hypot(px2 - L.plaza[0], pz2 - L.plaza[1]) < L.plazaR) continue;
      if (World.F.coast.sample(px2, pz2) < 26) continue;
      if (R.landmarks.some((b) => (b.kind === "building" || b.kind === "stall") && Math.hypot(px2 - b.x, pz2 - b.z) < (b.w ? Math.max(b.w, b.d) * 0.75 + 9 : 9))) continue;
      const gy = sample(px2, pz2);
      if (Math.abs(gy - pad.h) > 2.5) continue;
      if (rnd() < 0.18) continue;
      houses.push({ x: px2, z: pz2, y: gy - 0.4, w: 8 + rnd() * 6, d: 7 + rnd() * 5, h: 5 + rnd() * 5, yaw: gridYaw + (rnd() < 0.5 ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.12 });
    }
    const walls = new InstancedMesh(boxGeo, mat("stone"), houses.length), roofs = new InstancedMesh(prismGeo, mat("roof"), houses.length);
    houses.forEach((hs, i) => {
      _q.setFromAxisAngle(UP, hs.yaw);
      walls.setMatrixAt(i, _m.compose(_p.set(hs.x, hs.y + hs.h / 2, hs.z), _q, _s.set(hs.w, hs.h, hs.d)));
      roofs.setMatrixAt(i, _m.compose(_p.set(hs.x, hs.y + hs.h, hs.z), _q, _s.set(hs.w + 1, hs.w * 0.42, hs.d + 1)));
      addBox({ cx: hs.x, cy: hs.y + hs.h / 2, cz: hs.z, hx: hs.w / 2, hy: hs.h / 2 + hs.w * 0.2, hz: hs.d / 2, yaw: hs.yaw, walk: false });
    });
    for (const im of [walls, roofs]) {
      im.castShadow = im.receiveShadow = true;
      im.computeBoundingSphere();
      g.add(im);
    }
    const py2 = sample(L.plaza[0], L.plaza[1]);
    cyl(g, "stone", L.plaza[0], py2 - 0.3, L.plaza[1], 4.5, 4.5, 1.1, true, 20);
    cyl(g, "accent", L.plaza[0], py2 + 0.8, L.plaza[1], 0.8, 0.6, 3.2, true, 10);
    TOWN.houses = houses.map((h) => ({ ...h, door: off(h.x, h.z, h.yaw, 0, h.d / 2 + 1.2) }));
  }
};
function mergeStatic(g) {
  const byMat = /* @__PURE__ */ new Map();
  g.updateMatrixWorld(true);
  for (const o of [...g.children]) {
    if (!o.isMesh || o.isInstancedMesh || o.userData.dynamic) continue;
    const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(geo);
    g.remove(o);
  }
  for (const [m, geos] of byMat) {
    const n = geos.reduce((a, q) => a + q.attributes.position.count, 0);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    let o = 0;
    for (const q of geos) {
      pos.set(q.attributes.position.array, o);
      nor.set(q.attributes.normal.array, o);
      o += q.attributes.position.array.length;
      q.dispose();
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setAttribute("normal", new BufferAttribute(nor, 3));
    geo.computeBoundingSphere();
    const merged = new Mesh(geo, m);
    merged.castShadow = merged.receiveShadow = true;
    merged.matrixAutoUpdate = false;
    g.add(merged);
  }
}
function buildBlockout(region) {
  const g = new Group();
  g.name = "blockout";
  for (const L of region.landmarks) BUILDERS[L.kind]?.(g, L);
  mergeStatic(g);
  g.userData.update = (t) => {
    for (const s of g.userData.spin || []) s.rotation[s.isGroup ? "z" : "y"] = t * (s.isGroup ? 0.6 : 0.5);
  };
  return g;
}
function buildWaypoints(region) {
  const g = new Group(), list = [];
  const gemMat = () => new ShaderMaterial({
    uniforms: { uOn: { value: 0 } },
    vertexShader: (
      /* glsl */
      `varying vec3 vN, vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`
    ),
    fragmentShader: (
      /* glsl */
      `uniform float uOn; varying vec3 vN, vW; void main(){ vec3 V=normalize(cameraPosition-vW); float f=pow(1.-abs(dot(normalize(vN),V)),2.);
      vec3 on=mix(vec3(.45,.86,1.),vec3(1.),f*.8), off=mix(vec3(.36,.44,.52),vec3(.72,.80,.86),f*.7); gl_FragColor=vec4(mix(off,on,uOn),1.); }`
    )
  });
  const beamMat = new MeshBasicMaterial({ color: 10479871, transparent: true, opacity: 0.35, depthWrite: false, blending: AdditiveBlending });
  const gemGeo = new OctahedronGeometry(0.75), beamGeo = new CylinderGeometry(0.07, 0.07, 9, 6, 1, true);
  for (const w of region.waypoints) {
    const y = groundAt(w.x, w.z, 1e4);
    const m = new Mesh(gemGeo, gemMat());
    m.position.set(w.x, y + 2.4, w.z);
    m.scale.y = 1.5;
    const b = new Mesh(beamGeo, beamMat);
    b.position.set(w.x, y + 4.5, w.z);
    b.visible = false;
    m.userData.dynamic = b.userData.dynamic = true;
    cyl(g, "stone", w.x, y - 0.4, w.z, 1.5, 1.8, 0.8, true, 8);
    g.add(m, b);
    list.push({ ...w, y, mesh: m, beam: b, on: false });
  }
  mergeStatic(g);
  g.userData.update = (t) => {
    for (const w of list) {
      w.mesh.rotation.y = t * (w.on ? 0.8 : 0.25);
      w.mesh.position.y = w.y + 2.4 + (w.on ? Math.sin(t * 1.6 + w.x) * 0.15 : 0);
    }
  };
  g.userData.setOn = (name, on) => {
    const w = list.find((v) => v.name === name);
    if (w) {
      w.on = on;
      w.mesh.material.uniforms.uOn.value = on ? 1 : 0;
      w.beam.visible = on;
    }
  };
  g.userData.list = list;
  return g;
}
var C = {
  stone: [0.77, 0.81, 0.81],
  stoneL: [0.91, 0.92, 0.89],
  stoneD: [0.62, 0.69, 0.71],
  cap: [0.96, 0.95, 0.9],
  plaster: [0.96, 0.95, 0.89],
  plaster2: [0.99, 0.97, 0.92],
  plaster3: [0.91, 0.91, 0.85],
  wood: [0.49, 0.38, 0.31],
  woodL: [0.67, 0.56, 0.44],
  deck: [0.7, 0.55, 0.39],
  roof: [0.67, 0.31, 0.25],
  roof2: [0.77, 0.4, 0.29],
  roof3: [0.51, 0.27, 0.25],
  slate: [0.34, 0.45, 0.57],
  dark: [0.17, 0.15, 0.17],
  glass: [0.26, 0.36, 0.46],
  frame: [0.97, 0.95, 0.9],
  green: [0.45, 0.7, 0.36],
  greenD: [0.32, 0.55, 0.3],
  lav: [0.74, 0.68, 0.96],
  pink: [0.96, 0.66, 0.78],
  blue: [0.24, 0.42, 0.74],
  white: [0.97, 0.96, 0.93],
  gold: [0.93, 0.78, 0.42],
  red: [0.8, 0.3, 0.26],
  water: [0.45, 0.78, 0.88],
  sail: [0.97, 0.95, 0.89],
  light: [1, 0.93, 0.66],
  awn: [[0.86, 0.32, 0.28], [0.27, 0.48, 0.8], [0.95, 0.78, 0.36], [0.45, 0.7, 0.4]]
};
var PAT = { plain: 0, stone: 1, roof: 2, timber: 3, plank: 4, cobble: 5 };
var Geo = class {
  constructor() {
    this.p = [];
    this.n = [];
    this.c = [];
    this.t = [];
  }
  tri(a, b, c, col, pat) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    for (const v of [a, b, c]) {
      this.p.push(v[0], v[1], v[2]);
      this.n.push(nx, ny, nz);
      this.c.push(col[0], col[1], col[2]);
      this.t.push(pat);
    }
  }
  quad(a, b, c, d, col, pat) {
    this.tri(a, b, c, col, pat);
    this.tri(a, c, d, col, pat);
  }
  // box: centre x,z, bottom y0, size sx (local x) sy sz (local z), yaw; faces: skip bottom unless asked
  box(x, y0, z, sx, sy, sz, yaw, col, pat = 0, opt = {}) {
    const c = Math.cos(yaw), s = Math.sin(yaw), hx = sx / 2, hz = sz / 2, y1 = y0 + sy;
    const P2 = (lx, y, lz) => [x + lx * c + lz * s, y, z - lx * s + lz * c];
    const v = [P2(-hx, y0, -hz), P2(hx, y0, -hz), P2(hx, y0, hz), P2(-hx, y0, hz), P2(-hx, y1, -hz), P2(hx, y1, -hz), P2(hx, y1, hz), P2(-hx, y1, hz)];
    const top = opt.topCol || col;
    if (opt.top !== false) this.quad(v[4], v[7], v[6], v[5], top, opt.topPat ?? pat);
    this.quad(v[3], v[2], v[6], v[7], col, pat);
    this.quad(v[1], v[0], v[4], v[5], col, pat);
    this.quad(v[2], v[1], v[5], v[6], col, pat);
    this.quad(v[0], v[3], v[7], v[4], col, pat);
    if (opt.bottom) this.quad(v[0], v[1], v[2], v[3], col, pat);
  }
  cyl(x, y0, z, r0, r1, h, seg, col, pat = 0, cap = true) {
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      const b0 = [x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0], b1 = [x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0];
      const t0 = [x + Math.cos(a0) * r1, y0 + h, z + Math.sin(a0) * r1], t1 = [x + Math.cos(a1) * r1, y0 + h, z + Math.sin(a1) * r1];
      this.quad(b0, t0, t1, b1, col, pat);
      if (cap && r1 > 0.01) this.tri([x, y0 + h, z], t1, t0, col, pat);
    }
  }
  cone(x, y0, z, r, h, seg, col, pat = 0, rot = 0) {
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2 + rot, a1 = (i + 1) / seg * Math.PI * 2 + rot;
      this.tri([x + Math.cos(a0) * r, y0, z + Math.sin(a0) * r], [x, y0 + h, z], [x + Math.cos(a1) * r, y0, z + Math.sin(a1) * r], col, pat);
    }
  }
  // flat quad on a vertical face: centre (cx,cz) on the face, facing direction yaw, local u right
  panel(cx, y0, cz, yaw, w, h, col, out2 = 0.04, pat = 0) {
    const c = Math.cos(yaw), s = Math.sin(yaw), fx = s * out2, fz = c * out2, rx = c * w / 2, rz = -s * w / 2;
    this.quad([cx - rx + fx, y0, cz - rz + fz], [cx + rx + fx, y0, cz + rz + fz], [cx + rx + fx, y0 + h, cz + rz + fz], [cx - rx + fx, y0 + h, cz - rz + fz], col, pat);
  }
  arch(cx, y0, cz, yaw, w, h, col, out2 = 0.05) {
    const r = w / 2, rh = h - r;
    this.panel(cx, y0, cz, yaw, w, rh, col, out2);
    const c = Math.cos(yaw), s = Math.sin(yaw), fx = s * out2, fz = c * out2, n = 8;
    const ctr = [cx + fx, y0 + rh, cz + fz];
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI, a1 = (i + 1) / n * Math.PI;
      const p = (a) => [ctr[0] + Math.cos(a) * r * c, ctr[1] + Math.sin(a) * r, ctr[2] - Math.cos(a) * r * s];
      this.tri(ctr, p(a0), p(a1), col, 0);
    }
  }
  // gable roof: ridge along local x, overhang o, pitch height rh
  roof(x, y, z, w, d, rh, yaw, col, wallCol) {
    const c = Math.cos(yaw), s = Math.sin(yaw), o = 0.7, hx = w / 2 + o, hz = d / 2 + o;
    const P2 = (lx, yy, lz) => [x + lx * c + lz * s, yy, z - lx * s + lz * c];
    const y0 = y - 0.25;
    this.quad(P2(-hx, y0, hz), P2(hx, y0, hz), P2(hx, y + rh, 0), P2(-hx, y + rh, 0), col, PAT.roof);
    this.quad(P2(hx, y0, -hz), P2(-hx, y0, -hz), P2(-hx, y + rh, 0), P2(hx, y + rh, 0), col, PAT.roof);
    this.quad(P2(-hx, y0 - 0.25, hz), P2(-hx, y0, hz), P2(hx, y0, hz), P2(hx, y0 - 0.25, hz), C.wood, 0);
    this.quad(P2(hx, y0 - 0.25, -hz), P2(hx, y0, -hz), P2(-hx, y0, -hz), P2(-hx, y0 - 0.25, -hz), C.wood, 0);
    const gx = w / 2, gz = d / 2;
    this.tri(P2(gx, y, gz), P2(gx, y, -gz), P2(gx, y + rh * (gz / hz), 0), wallCol, PAT.timber);
    this.tri(P2(-gx, y, -gz), P2(-gx, y, gz), P2(-gx, y + rh * (gz / hz), 0), wallCol, PAT.timber);
    this.quad(P2(-hx, y0, hz), P2(-hx, y + rh, 0), P2(hx, y + rh, 0), P2(hx, y0, hz), C.woodL, 0);
    this.quad(P2(hx, y0, -hz), P2(hx, y + rh, 0), P2(-hx, y + rh, 0), P2(-hx, y0, -hz), C.woodL, 0);
  }
  mesh(mat2) {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new Float32BufferAttribute(this.n, 3));
    g.setAttribute("aCol", new Float32BufferAttribute(this.c, 3));
    g.setAttribute("aPat", new Float32BufferAttribute(this.t, 1));
    g.computeBoundingSphere();
    const m = new Mesh(g, mat2);
    m.castShadow = m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    return m;
  }
};
function townMaterial(side = FrontSide) {
  return makeLitMaterial({
    side,
    vhead: (
      /* glsl */
      `attribute vec3 aCol; attribute float aPat; varying vec3 vCol; varying float vPat;`
    ),
    vbody: (
      /* glsl */
      `vCol=aCol; vPat=aPat;`
    ),
    head: (
      /* glsl */
      `varying vec3 vCol; varying float vPat;
      float kh(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float blockFace(vec2 uv,vec2 width){
        vec2 edge=min(uv,1.-uv);
        vec2 aa=min(vec2(.09),fwidth(uv))*0.6;
        vec2 face=smoothstep(width-aa,width+vec2(.023)+aa,edge);
        return face.x*face.y;
      }`
    ),
    body: (
      /* glsl */
      `
      if(!gl_FrontFacing) N=-N;
      vec3 c=vCol; vec3 w=vWorld; float pt=floor(vPat+.5);
      vec2 tangent=vec2(-N.z,N.x);
      tangent=length(tangent)>.02?normalize(tangent):vec2(1.,0.);
      vec2 plane=abs(N.y)>.96?w.xz:vec2(dot(w.xz,tangent),w.y);
      float detail=1.-smoothstep(22.,125.,distance(cameraPosition,w));
      float grain=texture2D(uNoise,plane*vec2(.27,.39)).a;
      float stain=texture2D(uNoise,plane*vec2(.035,.018)).g;
      float relief=0.;
      if(pt==1.){                                   // cut limestone and recessed mortar
        vec2 q=plane/vec2(2.78,1.28);
        q.x+=mod(floor(q.y),2.)*.5;
        vec2 f=fract(q)+(grain-.5)*.018, id=floor(q);
        float face=blockFace(f,vec2(.018,.028));
        float tint=kh(id), chips=smoothstep(.71,.94,grain);
        vec3 stone=c*(.9+.15*tint)*mix(vec3(.92,.95,1.),vec3(1.05,1.01,.93),tint);
        stone*=.91+.095*grain+.105*stain;
        stone-=vec3(.043,.053,.06)*chips*detail;
        c=mix(stone*vec3(.69,.70,.68),stone,mix(.84,face,.75+.25*detail));
        ao*=mix(.90,1.,face);
        relief=face*.041+(grain-.5)*.019;
      } else if(pt==2.){                            // overlapping terracotta tiles
        vec2 q=vec2(dot(w.xz,tangent)/.55,w.y/.31);
        q.x+=mod(floor(q.y),2.)*.5;
        vec2 f=fract(q);
        float face=blockFace(f,vec2(.032,.018));
        float roll=sin(f.x*3.141593);
        float tile=kh(floor(q));
        c*=mix(.88,1.13,tile)*(.94+.10*stain);
        c*=mix(1.,(.76+.23*roll)*(.85+.19*face)+.06*smoothstep(.1,.38,f.y),.37+.63*detail);
        relief=(roll*.034+f.y*.032)*face;
      } else if(pt==3.){                            // lime plaster and timber
        float fy=fract(w.y/3.1), fx=fract(plane.x/2.7);
        float hb=1.-smoothstep(.048,.072,fy);
        float vb=(1.-smoothstep(.046,.076,fx))*smoothstep(.07,.10,fy);
        float br=(1.-smoothstep(.019,.037,abs(fx-fy)))*step(.5,mod(floor(plane.x/2.7),2.));
        float beams=clamp(hb+vb+br,0.,1.);
        float plaster=.94+stain*.09+(grain-.5)*detail*.09;
        float wood=texture2D(uNoise,plane*vec2(.036,.61)).b;
        c=mix(c*plaster,vec3(.43,.30,.22)*(.83+.29*wood),beams*.92);
        relief=beams*.034+grain*.012;
      } else if(pt==4.){                            // deck boards with directional grain
        vec2 q=vec2(plane.x/.35,plane.y/3.4);
        q.y+=mod(floor(q.x),3.)*.33;
        float face=blockFace(fract(q),vec2(.025,.009));
        float wood=texture2D(uNoise,plane*vec2(.84,.042)).b;
        c*=mix(.70,1.,face)*(.89+.14*kh(floor(q)))*(.94+.13*wood);
        relief=face*.014+(wood-.5)*.012;
      } else if(pt==5.){                            // worn paving
        vec2 q=w.xz/vec2(.8,.6);
        q.x+=mod(floor(q.y),2.)*.5;
        float face=blockFace(fract(q)+(grain-.5)*.031,vec2(.028,.04));
        c*=mix(.71,1.,mix(.82,face,.44+.56*detail))*(.92+.13*kh(floor(q)))*(.95+.085*grain);
        relief=face*.034+(grain-.5)*.014;
      }
      N=reliefNormal(N,w,relief*detail);
      alb=c; eN=0.;
    `
    )
  });
}
var box2 = (G, x, y0, z, sx, sy, sz, yaw, col, pat, walk = false, collide = true, opt) => {
  G.box(x, y0, z, sx, sy, sz, yaw, col, pat, opt);
  if (collide) addBox({ cx: x, cy: y0 + sy / 2, cz: z, hx: sx / 2, hy: sy / 2, hz: sz / 2, yaw, walk });
};
var off2 = (x, z, yaw, lx, lz) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
var groundNoStair = (x, z) => terraceAt(x, z)?.y ?? sample(x, z);
function buildWalls(G) {
  const higher = (t, x, z) => TERRACES.some((o) => o !== t && o.y > t.y + 0.5 && inPoly(o.poly, x, z));
  const inStair = (x, z) => STAIRS.some((s) => {
    const [u, v, L] = stairUV(s, x, z);
    const clearance = 2.35;
    return u >= -clearance && u <= L + clearance && v >= STAIR_MIN_V - clearance && v <= STAIR_MAX_V + clearance;
  });
  for (const t of TERRACES) {
    const P2 = t.poly;
    let area2 = 0;
    for (let i = 0; i < P2.length; i++) {
      const a = P2[i], b = P2[(i + 1) % P2.length];
      area2 += a[0] * b[1] - b[0] * a[1];
    }
    const sgn = area2 > 0 ? -1 : 1;
    for (let i = 0; i < P2.length; i++) {
      const a = P2[i], b = P2[(i + 1) % P2.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
      const ux = dx / L, uz = dz / L, nx = -uz * sgn, nz = ux * sgn, yaw = Math.atan2(nx, nz);
      const n = Math.max(1, Math.round(L / 4)), seg = L / n, ht = WALL * Math.max(Math.abs(nx), Math.abs(nz)) + 2.5 * Math.min(Math.abs(nx), Math.abs(nz)) + 0.05;
      let lastBase = null;
      for (let k = 0; k < n; k++) {
        const cu = (k + 0.5) * seg, cx = a[0] + ux * cu, cz = a[1] + uz * cu;
        const ox = cx + nx * (ht + 1.2), oz = cz + nz * (ht + 1.2);
        if (inStair(cx, cz) || inStair(ox, oz) || inStair(cx - nx * ht, cz - nz * ht)) continue;
        if (higher(t, ox, oz)) continue;
        const outs = [1.2, 3, 6].map((e) => groundNoStair(cx + nx * (ht + e), cz + nz * (ht + e)));
        const oLow = Math.min(...outs), oHigh = Math.max(sample(cx + nx * (ht + 2), cz + nz * (ht + 2)), sample(cx + nx * (ht + 4), cz + nz * (ht + 4)));
        const len = seg + 0.02;
        if (oLow < t.y - 1) {
          const base = oLow - 2, top = t.y + 0.06;
          box2(G, cx, base, cz, len, top - base, ht * 2, yaw, C.stone, PAT.stone, true, true, { topCol: C.cap, topPat: PAT.cobble });
          const [fx, fz] = [cx + nx * (ht + 0.15), cz + nz * (ht + 0.15)];
          G.box(fx, t.y - 0.7, fz, len, 0.55, 0.32, yaw, C.stoneL, 0);
          const sh = stairHeight(ox, oz), open = sh !== null && sh > t.y - 1.2 || t.y < 5 && oLow < 0.5;
          if (!open) {
            const [px2, pz2] = [cx + nx * (ht - 0.25), cz + nz * (ht - 0.25)];
            box2(G, px2, top, pz2, len, 1.05, 0.5, yaw, C.stoneL, PAT.stone, false, true, { topCol: C.cap });
          }
          const tall = t.y - oLow;
          if (tall > 7 && k % 3 === 1) {
            const [bx, bz] = [cx + nx * (ht + 0.45), cz + nz * (ht + 0.45)];
            G.box(bx, base, bz, 1.6, t.y - 1.4 - base, 0.9, yaw, C.stoneD, PAT.stone);
          }
          const foot = terraceAt(cx + nx * (ht + 3), cz + nz * (ht + 3));
          if (foot && tall > 12 && k % 3 === 0 && !inStair(cx + nx * (ht + 3), cz + nz * (ht + 3))) {
            const [ax, az] = [cx + nx * ht, cz + nz * ht];
            G.arch(ax, foot.y, az, yaw, 3, 4.4, C.dark, 0.04);
            G.arch(ax, foot.y - 0.01, az, yaw, 3.6, 4.9, C.stoneL, 0.02);
          }
          lastBase = base;
        } else if (oHigh > t.y + 1.5 && !inStair(ox, oz)) {
          const top = oHigh + 0.4, base = t.y - 0.6;
          box2(G, cx, base, cz, len, top - base, ht * 2, yaw, C.stoneD, PAT.stone, true, true, { topCol: C.stone });
          G.box(cx - nx * (ht + 0.1), t.y + 3, cz - nz * (ht + 0.1), len, 0.4, 0.3, yaw, C.stoneL, 0);
        }
      }
    }
  }
}
function buildTerraceFrontages(G) {
  const rows = [
    { z: -412, y0: 3.2, y1: 24, sections: [[286, 345], [450, 490]] },
    { z: -452, y0: 24, y1: 50, sections: [[307, 341], [451, 491]] },
    { z: -484, y0: 50, y1: 78, sections: [[334, 343], [449, 487]] }
  ];
  const roofColors = [C.roof, C.roof2, C.slate, C.roof3];
  for (let ri = 0; ri < rows.length; ri++) {
    const R = rows[ri], wallFront = R.z + WALL + 0.15;
    for (const [a, b] of R.sections) {
      const bays = Math.max(1, Math.round((b - a) / 12.5));
      const span = (b - a) / bays;
      for (let i = 0; i < bays; i++) {
        const x = a + (i + 0.5) * span, variation = (i * 7 + ri * 3) % 5;
        const w = Math.min(11.2, span - 0.8), depth = 4.4 + variation % 2 * 0.7;
        const y = R.y0 + 0.3;
        const h = Math.min(R.y1 - R.y0 - 5.4, 10.4 + variation % 3 * 1.8);
        const z = wallFront + 1.25;
        const plaster = [C.plaster, C.plaster2, C.plaster3][variation % 3];
        G.box(x, y, z, w, h, depth, 0, plaster, PAT.timber);
        G.roof(x, y + h, z, w, depth, 2.1 + variation * 0.23, 0, roofColors[variation % 4], plaster);
        const face = z + depth * 0.5 + 0.06;
        if ((variation + i) % 3 === 0) {
          G.arch(x, y + 0.2, face, 0, 3.1, 4.9, C.wood, 0.08);
          G.arch(x, y + 0.18, face, 0, 3.65, 5.3, C.stoneL, 0.045);
        } else {
          G.panel(x, y + 1.5, face, 0, 2, 2.9, C.frame, 0.06);
          G.panel(x, y + 1.7, face, 0, 1.52, 2.48, C.glass, 0.09);
        }
        for (const side of [-1, 1]) {
          const wx = x + side * w * 0.28;
          G.arch(wx, y + h - 4, face, 0, 1.52, 2.95, C.frame, 0.065);
          G.arch(wx, y + h - 3.78, face, 0, 1.18, 2.48, C.glass, 0.1);
        }
        G.box(x, y + h * 0.51, face + 0.5, w + 0.45, 0.34, 1.5, 0, C.cap, PAT.stone);
        for (const side of [-1, 1]) {
          const fx = x + side * (w * 0.5 - 0.65);
          G.box(fx, y, face - 0.3, 0.48, h, 0.48, 0, C.stoneL, PAT.stone);
        }
        if (variation % 2 === 0) {
          const bx = x + w * 0.25, by = y + h * 0.53, bz = face + 0.75;
          G.box(bx, by, bz, 2.7, 0.48, 1.05, 0, C.stoneL, PAT.stone);
          icosa(G, bx - 0.55, by + 0.9, bz, 0.72, C.green);
          icosa(G, bx + 0.38, by + 1.05, bz, 0.8, C.greenD);
          icosa(G, bx, by + 1.42, bz, 0.3, variation % 4 === 0 ? C.pink : C.lav);
        }
      }
    }
    for (const [a, b] of R.sections) {
      const cx = (a + b) / 2;
      G.box(cx, R.y1 - 1.2, wallFront + 0.2, b - a, 0.48, 1.8, 0, C.cap, PAT.stone);
      G.box(cx, R.y1 - 3.4, wallFront + 0.08, b - a, 0.28, 0.8, 0, C.stoneL, PAT.stone);
    }
  }
}
function buildScenicWings(G, rnd) {
  const lookout = [
    { x: 510, z: -514, h: 21, w: 6.5, roof: C.slate },
    { x: 532, z: -443, h: 22, w: 6.2, roof: C.roof3 },
    { x: 266, z: -448, h: 17, w: 5.6, roof: C.roof2 }
  ];
  for (const b of lookout) {
    const t = terraceAt(b.x, b.z);
    if (!t) continue;
    const y = t.y;
    G.box(b.x, y - 0.55, b.z, b.w + 2, 1.2, b.w + 2, 0, C.stoneL, PAT.stone);
    box2(G, b.x, y, b.z, b.w, b.h, b.w, 0, C.stoneL, PAT.stone);
    G.cone(b.x, y + b.h, b.z, b.w * 0.75, 7.5, 8, b.roof, PAT.roof, Math.PI / 8);
    for (const a of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
      const fx = b.x + Math.sin(a) * (b.w / 2 + 0.055), fz = b.z + Math.cos(a) * (b.w / 2 + 0.055);
      G.arch(fx, y + b.h - 7, fz, a, 1.65, 3.2, C.frame, 0.025);
      G.arch(fx, y + b.h - 6.85, fz, a, 1.27, 2.78, C.glass, 0.09);
    }
  }
  const niches = [
    [291, -450, 24, 12],
    [485, -450, 24, 14],
    [306, -483, 50, 11],
    [485, -483, 50, 13],
    [344, -511, 78, 10],
    [490, -510, 78, 13]
  ];
  for (let i = 0; i < niches.length; i++) {
    const [x, z, y, w] = niches[i], face = z + WALL + 0.4;
    G.box(x, y - 7, face, w, 0.65, 2.1, 0, C.cap, PAT.stone);
    G.arch(x, y - 6.2, face + 0.15, 0, Math.min(4.1, w * 0.55), 5.6, C.stoneD, 0.08);
    G.arch(x, y - 6.35, face + 0.22, 0, Math.min(3.4, w * 0.44), 5.15, C.dark, 0.11);
    for (const sd of [-1, 1]) {
      G.box(x + sd * (w * 0.43), y - 7, face, 1.05, 6.2, 1.2, 0, C.stoneL, PAT.stone);
      icosa(G, x + sd * (w * 0.36), y + 1.7, face + 0.8, 1.15, i % 2 ? C.greenD : C.green);
    }
  }
  for (const [x, z, y, w] of [[301, -413, 24, 12], [476, -413, 24, 15], [308, -453, 50, 10], [467, -453, 50, 11]]) {
    G.box(x, y - 0.65, z + 3.4, w, 0.7, 3.9, 0, C.stoneL, PAT.stone);
    for (let j = 0; j < 4; j++) {
      const fx = x - w * 0.38 + j * w * 0.25;
      G.box(fx, y + 0.2, z + 5.15, 0.45, 1.2, 0.45, 0, C.stoneL, PAT.stone);
    }
    for (let j = 0; j < 3; j++) {
      const fx = x + (j - 1) * w * 0.28;
      icosa(G, fx, y + 1.6, z + 4.1, 1, j % 2 ? C.greenD : C.green);
      icosa(G, fx, y + 2.18, z + 4.1, 0.3, C.lav);
    }
  }
}
function buildKaelGardens(G, rnd) {
  const gardens = [
    [318, -451, 1.25],
    [338, -451, 0.8],
    [455, -451, 1.25],
    [486, -451, 1.05],
    [315, -483, 1.15],
    [332, -483, 0.95],
    [461, -483, 0.95],
    [485, -483, 1.2],
    [337, -506, 1.15],
    [361, -507, 0.95],
    [447, -505, 1],
    [474, -506, 1.05],
    [289, -412, 1],
    [314, -412, 0.85],
    [477, -412, 1],
    [492, -412, 0.8]
  ];
  for (const [x, z, s] of gardens) {
    const t = terraceAt(x, z);
    if (!t) continue;
    const y = t.y + 0.25;
    G.box(x, y, z, 4.2 * s, 0.65, 2.9 * s, 0, C.stoneL, PAT.stone);
    for (let i = 0; i < 4; i++) {
      const ax = x + (rnd() - 0.5) * 3 * s, az = z + (rnd() - 0.5) * 1.8 * s;
      icosa(G, ax, y + 0.6 + i % 2 * 0.35, az, (0.65 + rnd() * 0.3) * s, i % 3 === 0 ? C.greenD : C.green);
    }
    for (let i = 0; i < 3; i++) {
      const ax = x + (rnd() - 0.5) * 3 * s, az = z + (rnd() - 0.5) * 1.6 * s;
      icosa(G, ax, y + 1.35, az, 0.22 * s, i % 2 ? C.lav : C.pink);
    }
  }
  for (const [z, low, high, xs] of [
    [-412, 3.2, 24, [284, 333, 453, 484]],
    [-452, 24, 50, [305, 334, 454, 482]],
    [-484, 50, 78, [333, 455, 482]]
  ]) {
    for (let k = 0; k < xs.length; k++) {
      const x = xs[k], zz = z + WALL + 2.85;
      for (let j = 0; j < 5; j++) {
        const yy = low + 3 + j * 3.1, px2 = x + Math.sin(k * 2.7 + j * 0.9) * 1.1;
        if (yy > high - 1.7) break;
        icosa(G, px2, yy, zz, 0.95 + j % 2 * 0.22, j % 3 === 0 ? C.greenD : C.green);
      }
    }
  }
}
function buildStairs(G) {
  for (const s of STAIRS) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, [nx, nz] = s.n;
    const yaw = Math.atan2(nx, nz), rise = s.y1 - s.y0, floor = Math.min(s.y0, s.y1) - 30;
    const steps = Math.max(1, Math.ceil(Math.abs(rise) / 0.3)), du = L / steps, v0 = STAIR_MIN_V, v1 = STAIR_MAX_V;
    const P2 = (u, y, v) => [s.a[0] + ux * u + nx * v, y, s.a[1] + uz * u + nz * v];
    let prev = null;
    for (let k = 0; k < steps; k++) {
      const u0 = k * du, u1 = (k + 1) * du, top = k === 0 ? s.y0 + 0.06 : k === steps - 1 ? s.y1 + 0.06 : s.y0 + rise * (k + 0.5) / steps + 0.06;
      const q = P2(u0 + du / 2, 0, v1 + 3), base = groundNoStair(q[0], q[2]) - 1.5;
      const col = k % 2 ? C.stoneL : C.cap;
      G.quad(P2(u0, top, v0), P2(u0, top, v1), P2(u1, top, v1), P2(u1, top, v0), col, 0);
      if (prev !== null && Math.abs(top - prev) > 0.01) {
        const lo = Math.min(top, prev), hi = Math.max(top, prev), uu = u0;
        G.quad(P2(uu, lo, v0), P2(uu, hi, v0), P2(uu, hi, v1), P2(uu, lo, v1), C.stoneD, 0);
      }
      const underside = Math.max(base, top - 1.15);
      G.quad(P2(u0, underside, v1), P2(u0, top, v1), P2(u1, top, v1), P2(u1, underside, v1), C.stoneL, PAT.stone);
      if (k % Math.max(5, Math.ceil(steps / 7)) === 0 && top - base > 3) {
        const supp = P2(u0 + du * 0.5, 0, v1 - 0.25);
        G.box(supp[0], base, supp[2], 1.55, top - base - 0.2, 1.5, yaw, C.stoneL, PAT.stone);
      }
      if (k === 0) G.quad(P2(0, base, v0), P2(0, top, v0), P2(0, top, v1), P2(0, base, v1), C.stone, PAT.stone);
      if (k === steps - 1) G.quad(P2(L, base, v1), P2(L, top, v1), P2(L, top, v0), P2(L, base, v0), C.stone, PAT.stone);
      prev = top;
    }
    const vb = STAIR_MAX_V + 0.12, n = Math.max(1, Math.ceil(L / 3));
    for (let k = 0; k < n; k++) {
      const u0 = k * L / n, u1 = (k + 1) * L / n, um = (u0 + u1) / 2;
      const cx = s.a[0] + ux * um + nx * vb, cz = s.a[1] + uz * um + nz * vb, y = s.y0 + rise * um / L;
      const y0 = Math.min(s.y0 + rise * u0 / L, s.y0 + rise * u1 / L);
      G.box(cx, y0 - 0.2, cz, L / n + 0.05, Math.abs(rise) / n + 1.1, 0.45, yaw, C.cap, PAT.stone, { topCol: C.cap });
      addBox({ cx, cy: y + 0.2, cz, hx: L / n / 2, hy: 1.4, hz: 0.25, yaw, walk: false });
    }
  }
}
var ROOFS = [C.roof, C.roof2, C.roof3];
var WALLS = [C.plaster, C.plaster2, C.plaster3];
function windows(G, x, y0, z, yaw, w, d, h, rnd, faces = [0, 1, 2, 3], skipDoor = true) {
  const rows = h > 13 ? [1.65, 4.8, 8, 11.2] : h > 10 ? [1.65, 4.8, 8] : h > 6.5 ? [1.6, 4.6] : [1.6];
  for (const f of faces) {
    const fy = yaw + f * Math.PI / 2, span = f % 2 ? d : w, depth = f % 2 ? w : d;
    const [fx, fz] = off2(x, z, fy, 0, depth / 2);
    const nWin = Math.max(1, Math.floor(span / 3.2));
    for (const ry of rows) {
      if (ry + 2.2 > h) continue;
      for (let i = 0; i < nWin; i++) {
        const lu = (i + 0.5) * span / nWin - span / 2;
        if (skipDoor && f === 0 && ry < 3 && Math.abs(lu) < 1.8) continue;
        const [wx, wz] = [fx + lu * Math.cos(fy), fz - lu * Math.sin(fy)];
        G.panel(wx, y0 + ry - 0.15, wz, fy, 1.5, 1.95, C.frame, 0.03);
        G.panel(wx, y0 + ry, wz, fy, 1.15, 1.6, C.glass, 0.06);
        if (rnd() < 0.35) {
          const [bx, bz] = [wx + Math.sin(fy) * 0.25, wz + Math.cos(fy) * 0.25];
          G.box(bx, y0 + ry - 0.4, bz, 1.4, 0.35, 0.4, fy, C.wood, 0);
          G.box(bx, y0 + ry - 0.05, bz, 1.3, 0.25, 0.35, fy, rnd() < 0.5 ? C.pink : C.lav, 0);
        }
      }
    }
  }
}
function door(G, x, y0, z, yaw, d, w = 1.7, h = 2.5) {
  const [dx, dz] = off2(x, z, yaw, 0, d / 2);
  G.arch(dx, y0, dz, yaw, w + 0.5, h + 0.35, C.stoneL, 0.03);
  G.arch(dx, y0, dz, yaw, w, h, C.wood, 0.06);
}
function house(G, B2, rnd, opt = {}) {
  const y = B2.y ?? terraceAt(B2.x, B2.z)?.y ?? sample(B2.x, B2.z), { x, z, yaw, w, d, h } = B2;
  const wall = opt.wall || WALLS[Math.floor(rnd() * 3)], roofC = opt.roof || ROOFS[Math.floor(rnd() * 3)];
  G.box(x, y - 0.6, z, w + 0.4, 1.5, d + 0.4, yaw, C.stone, PAT.stone);
  G.box(x, y + 0.9, z, w, h - 0.9, d, yaw, wall, opt.pat ?? PAT.timber, { top: false });
  addBox({ cx: x, cy: y + h / 2, cz: z, hx: w / 2, hy: h / 2 + 1, hz: d / 2, yaw, walk: false });
  const rh = Math.min(w, d) * (opt.pitch ?? 0.55);
  if (w >= d) G.roof(x, y + h, z, w, d, rh, yaw, roofC, wall);
  else G.roof(x, y + h, z, d, w, rh, yaw + Math.PI / 2, roofC, wall);
  if (w >= 11.5 && d >= 8 && h >= 9 && !opt.noDormers) {
    const count = w >= 18 ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const localX = count === 1 ? 0 : (k ? 0.27 : -0.27) * w;
      const [dx, dz] = off2(x, z, yaw, localX, d * 0.14);
      const dy = y + h + rh * 0.45;
      G.box(dx, dy, dz, 2.45, 2.25, 2.35, yaw, wall, PAT.timber);
      G.roof(dx, dy + 2.25, dz, 3.15, 2.85, 1.65, yaw, roofC, wall);
      const [fx, fz] = off2(dx, dz, yaw, 0, 1.19);
      G.panel(fx, dy + 0.7, fz, yaw, 1.35, 1.45, C.frame, 0.035);
      G.panel(fx, dy + 0.83, fz, yaw, 0.97, 1.12, C.glass, 0.06);
    }
  }
  if (!opt.noChimney && rnd() < 0.7) {
    const [cx, cz] = off2(x, z, yaw, w * 0.28 * (rnd() < 0.5 ? -1 : 1), -d * 0.15);
    G.box(cx, y + h, cz, 1, rh * 0.8 + 1.4, 1, yaw, C.stone, PAT.stone);
  }
  windows(G, x, y, z, yaw, w, d, h, rnd);
  door(G, x, y, z, yaw, d);
  if (B2.shop) {
    const [ax, az] = off2(x, z, yaw, 0, d / 2 + 1), col = C.awn[Math.floor(rnd() * 4)];
    const c = Math.cos(yaw), s = Math.sin(yaw), hw = w * 0.42;
    const P2 = (lx, yy, lz) => [ax + lx * c + lz * s, yy, az - lx * s + lz * c];
    G.quad(P2(-hw, y + 3.3, -1), P2(-hw, y + 2.6, 1), P2(hw, y + 2.6, 1), P2(hw, y + 3.3, -1), col, 0);
    G.quad(P2(hw, y + 3.3, -1), P2(hw, y + 2.6, 1), P2(-hw, y + 2.6, 1), P2(-hw, y + 3.3, -1), col, 0);
  }
  if (B2.balcony) {
    const [bx, bz] = off2(x, z, yaw, 0, d / 2 + 0.7);
    G.box(bx, y + 3.4, bz, w * 0.6, 0.25, 1.4, yaw, C.woodL, PAT.plank);
    const [rx, rz] = off2(x, z, yaw, 0, d / 2 + 1.35);
    G.box(rx, y + 3.65, rz, w * 0.6, 0.9, 0.12, yaw, C.wood, PAT.plank);
  }
  return { x, z, yaw, door: off2(x, z, yaw, 0, d / 2 + 1.6) };
}
function banner(G, x, y, z, yaw, h = 4.5, col = C.blue) {
  const c = Math.cos(yaw), s = Math.sin(yaw), w = 1.4;
  for (const sd of [1, -1]) {
    const fy = sd > 0 ? yaw : yaw + Math.PI;
    G.panel(x + s * 0.02 * sd, y - h, z + c * 0.02 * sd, fy, w, h, col, 0);
    G.panel(x + s * 0.04 * sd, y - h * 0.55, z + c * 0.04 * sd, fy, 0.5, 0.7, C.white, 0);
  }
  G.box(x, y, z, w + 0.4, 0.15, 0.15, yaw, C.gold, 0);
}
function tree(G, x, y, z, s, rnd) {
  G.box(x, y - 0.3, z, 2.2, 0.8, 2.2, 0, C.stone, PAT.stone);
  G.cyl(x, y + 0.5, z, 0.22 * s, 0.16 * s, 2.6 * s, 6, C.wood);
  for (let k = 0; k < 3; k++) {
    const a = rnd() * 6.28, r = (0.6 + rnd() * 0.5) * s;
    icosa(G, x + Math.cos(a) * r * 0.6, y + (2.8 + k * 0.7) * s, z + Math.sin(a) * r * 0.6, (1.3 - k * 0.2) * s, k % 2 ? C.green : C.greenD);
  }
  addCyl({ x, z, r: 0.5 * s, y0: y, y1: y + 3 * s });
}
var ICO = (() => {
  const t = (1 + Math.sqrt(5)) / 2, v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((p) => {
    const l = Math.hypot(...p);
    return p.map((q) => q / l);
  });
  const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  return { v, f };
})();
function icosa(G, x, y, z, r, col) {
  for (const [a, b, c] of ICO.f) {
    const P2 = (i) => [x + ICO.v[i][0] * r, y + ICO.v[i][1] * r * 0.85, z + ICO.v[i][2] * r];
    G.tri(P2(a), P2(b), P2(c), col, 0);
  }
}
var SPECIAL = {
  guild(G, B2, rnd) {
    const r = house(G, B2, rnd, { wall: C.plaster2, roof: C.roof, noChimney: true });
    const y = terraceAt(B2.x, B2.z).y;
    const [tx, tz] = off2(B2.x, B2.z, B2.yaw, 0, B2.d / 2 - 2.5);
    G.box(tx, y, tz, 6, B2.h + 6, 5, B2.yaw, C.stoneL, PAT.stone);
    G.cone(tx, y + B2.h + 6, tz, 4.4, 6.5, 4, C.slate, PAT.roof, Math.PI / 4 + B2.yaw);
    for (const sd of [-1, 1]) {
      const [bx, bz] = off2(B2.x, B2.z, B2.yaw, sd * 4.2, B2.d / 2 + 0.25);
      banner(G, bx, y + 8.8, bz, B2.yaw, 5.5);
    }
    const [sx, sz] = off2(B2.x, B2.z, B2.yaw, 0, B2.d / 2 + 0.2);
    G.panel(sx, y + 6.4, sz, B2.yaw, 4.6, 1.3, C.wood, 0.08);
    G.panel(sx, y + 6.55, sz, B2.yaw, 4.1, 1, C.gold, 0.1);
    return r;
  },
  inn(G, B2, rnd) {
    const r = house(G, B2, rnd, { wall: C.plaster, roof: C.roof2, balcony: true });
    const y = terraceAt(B2.x, B2.z).y;
    const [sx, sz] = off2(B2.x, B2.z, B2.yaw, B2.w * 0.32, B2.d / 2 + 1);
    G.box(sx, y + 3.4, sz, 0.15, 0.15, 1.8, B2.yaw, C.wood, 0);
    G.panel(sx, y + 2, sz + 0, B2.yaw + Math.PI / 2, 1.2, 1.2, C.woodL, 0);
    G.panel(sx, y + 2, sz, B2.yaw - Math.PI / 2, 1.2, 1.2, C.woodL, 0);
    const [bx, bz] = off2(B2.x, B2.z, B2.yaw, 0, B2.d / 2 + 0.7);
    G.box(bx, y + 3.6, bz, B2.w * 0.7, 0.25, 1.4, B2.yaw, C.woodL, PAT.plank);
    return r;
  },
  smithy(G, B2, rnd) {
    const r = house(G, B2, rnd, { wall: C.stoneL, pat: PAT.stone, roof: C.roof3, noChimney: true });
    const y = terraceAt(B2.x, B2.z).y, [cx, cz] = off2(B2.x, B2.z, B2.yaw, -B2.w * 0.3, -B2.d * 0.1);
    G.box(cx, y + B2.h, cz, 2, 5.5, 2, B2.yaw, C.stoneD, PAT.stone);
    const [ax, az] = off2(B2.x, B2.z, B2.yaw, B2.w * 0.25, B2.d / 2 + 2.2);
    box2(G, ax, y, az, 1.2, 0.8, 0.6, B2.yaw, C.dark, 0);
    G.box(ax, y + 0.8, az, 1.5, 0.25, 0.5, B2.yaw, C.dark, 0);
    return r;
  },
  office(G, B2, rnd) {
    const r = house(G, B2, rnd, { wall: C.stoneL, pat: PAT.stone, roof: C.slate });
    const y = terraceAt(B2.x, B2.z).y, [bx, bz] = off2(B2.x, B2.z, B2.yaw, -B2.w / 2 + 1.5, B2.d / 2 + 0.25);
    banner(G, bx, y + 7.5, bz, B2.yaw, 4.5);
    return r;
  },
  warehouse(G, B2, rnd) {
    const y = terraceAt(B2.x, B2.z).y;
    box2(G, B2.x, y - 0.5, B2.z, B2.w, B2.h + 0.5, B2.d, B2.yaw, C.stone, PAT.stone);
    G.roof(B2.x, y + B2.h, B2.z, B2.w, B2.d, B2.d * 0.4, B2.yaw, ROOFS[Math.floor(rnd() * 3)], C.stone);
    const [dx, dz] = off2(B2.x, B2.z, B2.yaw, 0, B2.d / 2);
    G.arch(dx, y, dz, B2.yaw, 5, 5.6, C.wood, 0.05);
    for (let k = 0; k < 3; k++) {
      const [cx, cz] = off2(B2.x, B2.z, B2.yaw, -B2.w / 2 + 1.5 + k * 1.4, B2.d / 2 + 1.5);
      box2(G, cx, y, cz, 1.2, 1.1, 1.2, B2.yaw + k, C.woodL, PAT.plank);
    }
    return null;
  },
  shipyard(G, B2, rnd) {
    const y = terraceAt(B2.x, B2.z).y, { x, z, w, d, h, yaw } = B2;
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
      const [px2, pz2] = off2(x, z, yaw, sx * (w / 2 - 0.5), -d / 2 + 2 + k * (d - 4) / 3);
      box2(G, px2, y, pz2, 0.7, h, 0.7, yaw, C.wood, PAT.plank);
    }
    G.roof(x, y + h, z, d, w, w * 0.32, yaw + Math.PI / 2, C.roof3, C.woodL);
    G.box(x, y, z + 2, 1, 1.4, d - 6, yaw, C.wood, PAT.plank);
    for (let k = 0; k < 9; k++) {
      const lz = -d / 2 + 5 + k * (d - 10) / 8, bw = 3 + Math.sin(k / 8 * Math.PI) * 4.5;
      for (const sx of [-1, 1]) {
        const [rx, rz] = off2(x, z + 2, yaw, sx * bw / 2, lz);
        G.box(rx, y + 1, rz, 0.35, 4.5 - Math.abs(4 - k) * 0.25, 0.35, yaw, C.woodL, 0);
      }
    }
    const [cx, cz] = off2(x, z, yaw, w / 2 + 3, d / 2 + 6);
    box2(G, cx, y, cz, 1, 14, 1, yaw, C.wood, PAT.plank);
    G.box(cx, y + 13, cz + 3, 0.6, 0.6, 9, yaw, C.wood, 0);
    for (let k = 0; k < 6; k++) {
      const [lx, lz] = off2(x, z, yaw, -w / 2 + 2 + k * 1.2, d / 2 + 1);
      box2(G, lx, y, lz, 1, 0.5 + k % 3 * 0.5, 4, yaw, C.woodL, PAT.plank);
    }
    return null;
  },
  monastery(G, B2, rnd) {
    const y = terraceAt(B2.x, B2.z).y, { x, z, w, d, h, yaw } = B2;
    box2(G, x, y - 0.6, z, w, h + 0.6, d, yaw, C.stoneL, PAT.stone);
    G.roof(x, y + h, z, w, d, d * 0.75, yaw, C.slate, C.stoneL);
    for (let k = -3; k <= 3; k++) {
      if (!k) continue;
      const [wx, wz] = off2(x, z, yaw, k * w / 8, d / 2);
      G.arch(wx, y + 5, wz, yaw, 1.8, 6.5, C.glass, 0.05);
    }
    const [gx, gz] = off2(x, z, yaw, 0, d / 2);
    G.arch(gx, y, gz, yaw, 4.2, 6.5, C.wood, 0.06);
    G.arch(gx, y - 0.01, gz, yaw, 5.4, 7.6, C.cap, 0.03);
    for (const sd of [-1, 1]) {
      const [tx, tz] = off2(x, z, yaw, sd * (w / 2 - 4), d / 2 + 1);
      box2(G, tx, y - 0.6, tz, 8, h + 15, 8, yaw, C.stoneL, PAT.stone);
      G.box(tx, y + h + 14.4, tz, 9, 1, 9, yaw, C.cap, 0);
      G.cone(tx, y + h + 15.4, tz, 5.6, 17, 8, C.slate, PAT.roof, Math.PI / 8);
      for (let f = 0; f < 4; f++) {
        const fy = yaw + f * Math.PI / 2, [ax2, az2] = off2(tx, tz, fy, 0, 4);
        G.arch(ax2, y + h + 7, az2, fy, 1.8, 4.6, C.dark, 0.05);
      }
      banner(G, ...off2(tx, tz, yaw, 0, 4.1).flatMap((v, i) => i ? [v] : [v, y + h + 3]), yaw, 6);
    }
    const [ax, az] = off2(x, z, yaw, 0, -d / 2 - 2);
    G.cyl(ax, y - 0.6, az, 6, 6, h + 4, 12, C.stoneL, PAT.stone);
    G.cone(ax, y + h + 3.4, az, 7, 7, 12, C.slate, PAT.roof);
    addCyl({ x: ax, z: az, r: 6, y0: y - 0.6, y1: y + h + 4 });
    return null;
  }
};
function stall(G, S2, y) {
  const { x, z, yaw } = S2, col = C.awn[S2.c % 4];
  box2(G, x, y, z, 4, 1, 2, yaw, C.woodL, PAT.plank);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const [px2, pz2] = off2(x, z, yaw, sx * 1.9, sz * 0.9);
    G.box(px2, y, pz2, 0.14, 2.7, 0.14, yaw, C.wood, 0);
  }
  const c = Math.cos(yaw), s = Math.sin(yaw), P2 = (lx, yy, lz) => [x + lx * c + lz * s, yy, z - lx * s + lz * c];
  for (const [a, b, cc, dd] of [[P2(-2.3, 2.6, 1.4), P2(2.3, 2.6, 1.4), P2(2.3, 3.2, -1.2), P2(-2.3, 3.2, -1.2)]]) {
    G.quad(a, b, cc, dd, col, 0);
    G.quad(dd, cc, b, a, col, 0);
  }
  for (let k = 0; k < 3; k++) {
    const [gx, gz] = off2(x, z, yaw, -1.2 + k * 1.2, 0);
    G.box(gx, y + 1, gz, 0.9, 0.3, 0.7, yaw + k * 0.3, [C.red, C.gold, C.green][k], 0);
  }
}
function pier(G, Pr) {
  const [ax, az] = Pr.a, [bx, bz] = Pr.b, L = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az), cx = (ax + bx) / 2, cz = (az + bz) / 2;
  box2(G, cx, 2.6, cz, 5, 0.62, L, yaw, C.deck, PAT.plank, true, true, { topPat: PAT.plank });
  for (let t = 0; t <= L; t += 6) for (const sd of [-1, 1]) {
    const [px2, pz2] = off2(ax, az, yaw, sd * 2.3, t);
    G.cyl(px2, -8, pz2, 0.3, 0.3, 11.6, 6, C.wood);
    if (t % 12 === 0) {
      G.cyl(px2, 3.2, pz2, 0.28, 0.28, 0.7, 6, C.dark);
      addCyl({ x: px2, z: pz2, r: 0.3, y0: 3.2, y1: 3.9 });
    }
  }
}
function ship(G, S2) {
  const { x, z, yaw } = S2, y = -1.2;
  const c = Math.cos(yaw), s = Math.sin(yaw), P2 = (lx, yy, lz) => [x + lx * c + lz * s, yy, z - lx * s + lz * c];
  const rib = (t) => {
    const L = 13;
    const lz = -L + t * 2 * L, wdt = 4.2 * Math.sin(Math.min(1, t * 1.15) * Math.PI) ** 0.6 + 0.2;
    return [lz, wdt];
  };
  const N = 12;
  for (let i = 0; i < N; i++) {
    const [z0, w0] = rib(i / N), [z1, w1] = rib((i + 1) / N);
    for (const sd of [-1, 1]) {
      const q = [P2(sd * w0, y + 4.6, z0), P2(sd * w1, y + 4.6, z1), P2(sd * w1 * 0.6, y, z1), P2(sd * w0 * 0.6, y, z0)];
      if (sd > 0) G.quad(q[0], q[1], q[2], q[3], C.wood, PAT.plank);
      else G.quad(q[1], q[0], q[3], q[2], C.wood, PAT.plank);
      const r = [P2(sd * w0, y + 4.6, z0), P2(sd * w1, y + 4.6, z1), P2(sd * w1, y + 5.2, z1), P2(sd * w0, y + 5.2, z0)];
      if (sd > 0) G.quad(r[1], r[0], r[3], r[2], C.red, 0);
      else G.quad(r[0], r[1], r[2], r[3], C.red, 0);
    }
    G.quad(P2(-w0, y + 4.3, z0), P2(-w1, y + 4.3, z1), P2(w1, y + 4.3, z1), P2(w0, y + 4.3, z0), C.deck, PAT.plank);
  }
  addBox({ cx: x, cy: y + 2.15, cz: z, hx: 4.2, hy: 2.15, hz: 13, yaw, walk: true });
  for (const [mz, mh] of [[3, 17], [-5, 13]]) {
    const [mx, mzz] = off2(x, z, yaw, 0, mz);
    G.cyl(mx, y + 4.3, mzz, 0.32, 0.24, mh, 8, C.wood);
    const sw = mh * 0.42;
    for (const sd of [1, -1]) G.panel(mx, y + 7, mzz, yaw + (sd > 0 ? 0 : Math.PI), sw * 1.4, mh * 0.6, C.sail, 0.25, 0);
    G.box(mx, y + 4.3 + mh, mzz, 0.1, 0.1, 0.1, yaw, C.red, 0);
  }
}
function lighthouse(G, L) {
  const y = terraceAt(L.x, L.z)?.y ?? 3.2;
  G.cyl(L.x, y - 0.4, L.z, 4.6, 4.4, 2.2, 14, C.stone, PAT.stone);
  G.cyl(L.x, y + 1.8, L.z, 3.4, 2.6, 20, 14, C.white, 0);
  for (const hy of [7, 14]) G.cyl(L.x, y + 1.8 + hy, L.z, 3.4 - hy * 0.04 + 0.06, 3.4 - (hy + 1.6) * 0.04 + 0.06, 1.6, 14, C.red, 0);
  G.cyl(L.x, y + 21.8, L.z, 3.6, 3.6, 0.5, 14, C.stoneD, 0);
  G.cyl(L.x, y + 22.3, L.z, 1.8, 1.8, 2.6, 10, C.light, 0);
  G.cone(L.x, y + 24.9, L.z, 2.6, 3.4, 10, C.red, PAT.roof);
  const [dx, dz] = off2(L.x, L.z, 0.6, 0, 3);
  G.arch(dx, y + 1.8, dz, 0.6, 1.4, 2.4, C.wood, 0.05);
  addCyl({ x: L.x, z: L.z, r: 4.4, y0: y - 0.4, y1: y + 25 });
}
function fountain(G, F) {
  const y = terraceAt(F.x, F.z).y;
  G.cyl(F.x, y - 0.2, F.z, 6, 6, 0.9, 24, C.stoneL, PAT.stone, false);
  G.cyl(F.x, y - 0.2, F.z, 5.4, 5.4, 0.9, 24, C.stoneL, PAT.stone, false);
  for (let i = 0; i < 24; i++) {
    const a0 = i / 24 * Math.PI * 2, a1 = (i + 1) / 24 * Math.PI * 2, R = (r, a) => [F.x + Math.cos(a) * r, y + 0.7, F.z + Math.sin(a) * r];
    G.quad(R(5.4, a0), R(5.4, a1), R(6, a1), R(6, a0), C.cap, 0);
  }
  G.cyl(F.x, y + 0.45, F.z, 5.4, 5.4, 0.01, 24, C.water, 0);
  G.cyl(F.x, y + 0.6, F.z, 1.2, 0.9, 2.4, 10, C.stoneL, 0);
  G.cyl(F.x, y + 2.9, F.z, 2.6, 2.2, 0.4, 14, C.stoneL, 0);
  G.cyl(F.x, y + 3.25, F.z, 2.1, 2.1, 0.04, 14, C.water, 0);
  G.cyl(F.x, y + 3.3, F.z, 0.5, 0.25, 2.2, 8, C.cap, 0);
  addCyl({ x: F.x, z: F.z, r: 6, y0: y - 0.2, y1: y + 0.7 });
  addCyl({ x: F.x, z: F.z, r: 1.2, y0: y, y1: y + 5 });
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4, bx = F.x + Math.cos(a) * 9, bz = F.z + Math.sin(a) * 9;
    box2(G, bx, y, bz, 2.6, 0.45, 0.6, Math.atan2(Math.cos(a), -Math.sin(a)), C.woodL, PAT.plank);
  }
}
function lamp(G, x, y, z) {
  G.cyl(x, y, z, 0.12, 0.09, 3.6, 6, C.dark);
  G.box(x, y + 3.5, z, 0.55, 0.6, 0.55, 0, C.light, 0, { topCol: C.dark });
  addCyl({ x, z, r: 0.2, y0: y, y1: y + 4 });
}
function registerCutstoneBridgeCollision(Lm) {
  const [ax, az] = Lm.a, [bx, bz] = Lm.b, dx = bx - ax, dz = bz - az;
  const length = Math.hypot(dx, dz), yaw = Math.atan2(-dz, dx);
  const cx = (ax + bx) * 0.5, cz = (az + bz) * 0.5, top = Lm.y + 0.1;
  addBox({ cx, cz, cy: top - 0.09, hx: length * 0.5, hy: 0.09, hz: 3.55, yaw, walk: true });
  for (const s of [-1, 1]) {
    const [x, z] = off2(cx, cz, yaw, 0, s * 4.44);
    addBox({ cx: x, cz: z, cy: top + 0.4, hx: length * 0.5, hy: 0.4, hz: 0.24, yaw, walk: false });
  }
  const segments = 14;
  for (let k = 0; k <= segments; k += 2) {
    const t = k / segments, x = ax + dx * t, z = az + dz * t;
    for (const side of [-1, 1]) {
      const [px2, pz2] = off2(x, z, yaw, 0, side * 4.42), ground = sample(px2, pz2);
      if (ground < Lm.y - 9) addCyl({ x: px2, z: pz2, r: 1.18, y0: ground - 0.6, y1: Lm.y - 6.15, walk: false });
    }
  }
}
// Walkable paving is constructed from the same 2 m graph used by residents.
// The shallow surface conforms to the existing heightfield/wooden piers, and
// stops at stairs or sharp ground changes instead of floating across cliffs.
function buildKaelRoads(G, region) {
  const nav = new NavGrid(BOUNDS.x0, BOUNDS.z0, BOUNDS.x1, BOUNDS.z1, 2);
  World.kaelNav = nav;
  World.kaelPaths = [];
  for (const road of region.kaelRoads || []) {
    const a = region.places[road.from], b = region.places[road.to];
    if (!a || !b) throw new Error("Unknown Kael road endpoint: " + road.id);
    const found = nav.path(a[0], a[1], b[0], b[1]);
    if (!found) {
      World.kaelPaths.push({ id: road.id, from: road.from, to: road.to, width: road.width, pts: [], pavedSegments: 0, reachable: false });
      continue;
    }
    // NPC navigation retains exact destinations, but paving must end on
    // passable cells: an anchor can sit inside a decorative prop or stall.
    const end = nav.nearestOpen(nav.idx(b[0], b[1]));
    const pts = found.slice(0, -1);
    if (end >= 0) pts.push(nav.center(end));
    const clean = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.15);
    let painted = 0;
    const ground = (x, z) => groundAt(x, z, 400);
    for (let j = 1; j < clean.length; j++) {
      const a0 = clean[j - 1], b0 = clean[j];
      const dx = b0[0] - a0[0], dz = b0[1] - a0[1], length = Math.hypot(dx, dz);
      if (length < 0.1) continue;
      const nx = -dz / length, nz = dx / length, count = Math.ceil(length / 1.35);
      for (let k = 0; k < count; k++) {
        const t0 = k / count, t1 = (k + 1) / count;
        const ax = a0[0] + dx * t0, az = a0[1] + dz * t0;
        const bx = a0[0] + dx * t1, bz = a0[1] + dz * t1;
        const cx = (ax + bx) / 2, cz = (az + bz) / 2;
        // The authored stair treads already have a stone surface and collision.
        if (stairSurface(cx, cz, 0.5) !== null || stairSurface(ax, az, 0.5) !== null || stairSurface(bx, bz, 0.5) !== null) continue;
        for (const width of [road.width, road.width * 0.7, 1.1]) {
          const half = width / 2;
          const corners = [
            [ax - nx * half, az - nz * half],
            [ax + nx * half, az + nz * half],
            [bx + nx * half, bz + nz * half],
            [bx - nx * half, bz - nz * half]
          ];
          const heights = corners.map(([x, z]) => ground(x, z));
          const mid = ground(cx, cz);
          if (Math.max(...heights, mid) - Math.min(...heights, mid) > 0.46) continue;
          if (corners.some(([x, z], i) => occupiedAt(x, z, heights[i], 0.1))) continue;
          // Counterclockwise winding gives the paving an upward-facing normal.
          G.quad(
            [corners[0][0], heights[0] + 0.055, corners[0][1]],
            [corners[1][0], heights[1] + 0.055, corners[1][1]],
            [corners[2][0], heights[2] + 0.055, corners[2][1]],
            [corners[3][0], heights[3] + 0.055, corners[3][1]],
            C.stoneL, PAT.cobble
          );
          painted++;
          break;
        }
      }
    }
    World.kaelPaths.push({ id: road.id, from: road.from, to: road.to, width: road.width, pts: clean, pavedSegments: painted, reachable: true });
  }
}
// The monastery's eastern tower blocks the 78 m terrace. Preserve the
// building and existing flights: this slim stone promenade follows the high
// side of the stair cut to connect the monastery forecourt to its east lane.
// It is walkable at the top level; the lower staircase remains clear below.
function buildUpperPromenade(G) {
  box2(G, 410, 77.76, -485.15, 22, 0.32, 2.4, 0,
    C.stoneL, PAT.cobble, true, true,
    { topCol: C.cap, topPat: PAT.cobble });
}
function buildKael(region) {
  const G = new Geo(), rnd = mulberry32(42), homes = [];
  buildWalls(G);
  buildTerraceFrontages(G);
  buildStairs(G);
  buildUpperPromenade(G);
  buildScenicWings(G, rnd);
  for (const B2 of [...BUILDINGS, ...SKYLINE_BUILDINGS]) {
    const r = (SPECIAL[B2.type] || house)(G, B2, rnd, {});
    if (r && B2.home) homes.push(r);
  }
  buildKaelGardens(G, rnd);
  const market = terraceAt(300, -420).y, harbor = 3.2;
  for (const S2 of STALLS) stall(G, S2, terraceAt(S2.x, S2.z)?.y ?? market);
  for (const Pr of PIERS) pier(G, Pr);
  ship(G, SHIP);
  lighthouse(G, LIGHTHOUSE);
  fountain(G, FOUNTAIN);
  {
    const y = terraceAt(BOARD.x, BOARD.z).y;
    for (const sd of [-1, 1]) {
      const [px2, pz2] = off2(BOARD.x, BOARD.z, BOARD.yaw, sd * 1.5, 0);
      G.box(px2, y, pz2, 0.2, 2.8, 0.2, BOARD.yaw, C.wood, 0);
    }
    box2(G, BOARD.x, y + 1, BOARD.z, 3.2, 1.6, 0.14, BOARD.yaw, C.wood, PAT.plank);
    G.box(BOARD.x, y + 1.15, BOARD.z, 2.8, 1.25, 0.18, BOARD.yaw, C.sail, 0);
    G.roof(BOARD.x, y + 2.7, BOARD.z, 3.4, 0.9, 0.5, BOARD.yaw, C.roof, C.woodL);
  }
  {
    const y = terraceAt(VIEWPOINT.x, VIEWPOINT.z).y;
    G.cyl(VIEWPOINT.x, y, VIEWPOINT.z, 1.6, 1.6, 1.2, 8, C.stoneL, PAT.stone);
    G.cyl(VIEWPOINT.x, y + 1.2, VIEWPOINT.z, 0.5, 0.35, 3.2, 8, C.cap, 0);
    icosa(G, VIEWPOINT.x, y + 4.8, VIEWPOINT.z, 0.9, C.lav);
    addCyl({ x: VIEWPOINT.x, z: VIEWPOINT.z, r: 1.6, y0: y, y1: y + 5 });
    for (const sd of [-1, 1]) box2(G, VIEWPOINT.x + sd * 6, y, VIEWPOINT.z + 4, 2.6, 0.45, 0.6, 0, C.woodL, PAT.plank);
  }
  const plant = [[365, -434], [427, -432], [374, -438], [422, -438], [360, -418], [434, -418], [470, -446], [292, -414], [323, -477], [410, -470], [492, -475], [334, -488], [442, -490], [318, -380], [490, -400], [250, -400], [470, -414]];
  for (const [x, z] of plant) {
    const t = terraceAt(x, z);
    if (t) tree(G, x, t.y + 0.4, z, 1 + rnd() * 0.4, rnd);
  }
  for (const [x, z] of [[380, -440], [414, -440], [380, -418], [414, -418], [340, -390], [430, -390], [470, -385], [300, -386], [404, -472], [390, -472], [380, -492], [404, -492]]) {
    const t = terraceAt(x, z);
    if (t) lamp(G, x, t.y, z);
  }
  for (let x = 306; x < 494; x += 9) {
    if (x > 382 && x < 412) continue;
    G.box(x, 50, -456.8, 3.2, 0.45, 0.9, 0, C.stone, 0);
    G.box(x, 50.45, -456.8, 3, 0.3, 0.8, 0, rnd() < 0.5 ? C.lav : C.pink, 0);
  }
  for (const [x, z, y] of [[330, -409.2, 23.6], [452, -409.2, 23.6], [325, -449.2, 49.6], [470, -449.2, 49.6], [338, -481.2, 77.6], [470, -481.2, 77.6]]) banner(G, x, y, z, 0, 6);
  const lm = region.landmarks.find((l) => l.kind === "arcade");
  if (lm) registerCutstoneBridgeCollision(lm);
  buildKaelRoads(G, region);
  const g = new Group();
  g.name = "kael";
  g.add(G.mesh(townMaterial(DoubleSide)));
  TOWN.houses = homes;
  return g;
}
function createCutstoneBridge(scene, Lm) {
  if (!Lm) return { update() {
  }, ready: () => false };
  const T2 = three_module_exports, [ax, az] = Lm.a, [bx, bz] = Lm.b, dx = bx - ax, dz = bz - az;
  const length = Math.hypot(dx, dz), N = 14, span = length / N, yaw = Math.atan2(-dz, dx);
  const pale = new T2.MeshStandardMaterial({ color: 14998992, roughness: 0.96 });
  const shadow = new T2.MeshStandardMaterial({ color: 12104873, roughness: 0.96 });
  const root = new T2.Group();
  root.name = "Kael_Cutstone_V7_Arcade";
  scene.add(root);
  const dgeo = new T2.BoxGeometry(span + 0.012, 0.16, 7.1);
  const rgeo = new T2.BoxGeometry(span + 0.012, 0.82, 0.48);
  const pgeo = new T2.BoxGeometry(0.65, 4.8, 0.75);
  const dmesh = new T2.InstancedMesh(dgeo, pale, N);
  const rmesh = new T2.InstancedMesh(rgeo, pale, N * 2);
  const pmesh = new T2.InstancedMesh(pgeo, shadow, N * 4);
  dmesh.name = "Cutstone_far_decks";
  rmesh.name = "Cutstone_far_rails";
  pmesh.name = "Cutstone_far_arches";
  for (const mesh2 of [dmesh, rmesh, pmesh]) {
    mesh2.instanceMatrix.setUsage(T2.DynamicDrawUsage);
    mesh2.frustumCulled = false;
    root.add(mesh2);
  }
  const q = new T2.Quaternion().setFromAxisAngle(new T2.Vector3(0, 1, 0), yaw);
  const mat2 = new T2.Matrix4(), temp = new T2.Vector3(), vscale = new T2.Vector3(), marks = [], detail = [];
  const coords = (i) => [ax + dx * (i + 0.5) / N, az + dz * (i + 0.5) / N];
  const place = (mesh2, j, x, y, z, visible) => {
    temp.set(x, y, z);
    vscale.setScalar(visible ? 1 : 1e-5);
    mat2.compose(temp, q, vscale);
    mesh2.setMatrixAt(j, mat2);
  };
  function fallback(i, visible) {
    const [x, z] = coords(i);
    place(dmesh, i, x, Lm.y + 0.02, z, visible);
    for (let a = 0; a < 2; a++) {
      const [wx, wz] = off2(x, z, yaw, 0, (a ? 1 : -1) * 4.44);
      place(rmesh, i * 2 + a, wx, Lm.y + 0.51, wz, visible);
    }
    let idx = i * 4;
    for (const sx of [-span * 0.43, span * 0.43]) for (const sz of [-4.25, 4.25]) {
      const [wx, wz] = off2(x, z, yaw, sx, sz);
      place(pmesh, idx++, wx, Lm.y - 2.42, wz, visible);
    }
  }
  for (let i = 0; i < N; i++) {
    fallback(i, true);
    const [x, z] = coords(i);
    marks.push({ x, z });
  }
  for (const mesh2 of [dmesh, rmesh, pmesh]) mesh2.instanceMatrix.needsUpdate = true;
  const pierGeo = new T2.CylinderGeometry(1.35, 1.85, 1, 8, 1);
  const pier2 = new T2.InstancedMesh(pierGeo, shadow, 2 * Math.ceil((N + 1) / 2));
  let pi = 0;
  for (let k = 0; k <= N; k += 2) {
    const x = ax + dx * k / N, z = az + dz * k / N, upper = Lm.y - 6.15;
    for (const side of [-1, 1]) {
      const [px2, pz2] = off2(x, z, yaw, 0, side * 4.42), ground = sample(px2, pz2);
      if (upper - ground < 3) continue;
      const h = upper - ground + 0.6;
      mat2.compose(new T2.Vector3(px2, ground - 0.6 + h * 0.5, pz2), new T2.Quaternion(), new T2.Vector3(1, h, 1));
      pier2.setMatrixAt(pi++, mat2);
    }
  }
  pier2.count = pi;
  pier2.instanceMatrix.needsUpdate = true;
  pier2.frustumCulled = false;
  pier2.name = "Cutstone_permanent_piers";
  root.add(pier2);
  let loading2 = false, loaded = false, lastCheck = -1e6;
  async function loadDetailed() {
    if (loading2 || loaded) return;
    loading2 = true;
    try {
      if (typeof DecompressionStream === "undefined") throw Error("compressed GLB unsupported");
      const response = await fetch(new URL("./assets/kael-cutstone-v7.glb.gz", import.meta.url));
      if (!response.ok) throw Error(`compressed GLB fetch failed: ${response.status}`);
      const ab = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
      const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(ab, "", resolve, reject));
      for (let i = 0; i < N; i++) {
        const [x, z] = coords(i), g = new T2.Group();
        g.name = "Cutstone_V7_span_" + i;
        g.position.set(x, Lm.y - 6.65, z);
        g.rotation.y = yaw;
        gltf.scene.traverse((obj) => {
          if (!obj.isMesh) return;
          const mesh2 = obj.clone();
          mesh2.geometry.computeBoundingBox();
          const bb = mesh2.geometry.boundingBox;
          mesh2.scale.set(span / (bb.max.x - bb.min.x), 1, 7.1 / 2.9177);
          mesh2.castShadow = false;
          mesh2.receiveShadow = true;
          g.add(mesh2);
        });
        g.visible = false;
        root.add(g);
        detail.push(g);
      }
      loaded = true;
      lastCheck = -1e6;
    } catch (err) {
      console.warn("V7 model load failed, playable bridge remains:", err);
    }
  }
  return {
    ready: () => loaded,
    update(px2, pz2, now) {
      if (now - lastCheck < 400) return;
      lastCheck = now;
      if (!loading2 && marks.some((p) => Math.hypot(p.x - px2, p.z - pz2) < 340)) void loadDetailed();
      if (!loaded) return;
      let changed = false;
      for (let i = 0; i < N; i++) {
        const near = Math.hypot(marks[i].x - px2, marks[i].z - pz2) < 49;
        if (detail[i].visible !== near) {
          detail[i].visible = near;
          fallback(i, !near);
          changed = true;
        }
      }
      if (changed) for (const mesh2 of [dmesh, rmesh, pmesh]) mesh2.instanceMatrix.needsUpdate = true;
    }
  };
}
var SunShadow = class {
  constructor(scene, sunDir) {
    this.dir = sunDir;
    const L = this.light = new DirectionalLight(16777215, 1);
    L.castShadow = true;
    L.shadow.mapSize.set(CFG.shadowSize, CFG.shadowSize);
    const E = CFG.shadowExtent, sc = L.shadow.camera;
    sc.left = -E;
    sc.right = E;
    sc.top = E;
    sc.bottom = -E;
    sc.near = 1;
    sc.far = 1050;
    L.shadow.bias = -22e-5;
    L.shadow.normalBias = IS_MOBILE ? 0.26 : 0.16;
    scene.add(L, L.target);
    this.right = new Vector3().crossVectors(new Vector3(0, 1, 0), sunDir).normalize();
    this.up = new Vector3().crossVectors(sunDir, this.right).normalize();
    this.c = new Vector3();
  }
  update(x, z, yaw) {
    const E = CFG.shadowExtent, c = this.c;
    c.set(x - Math.sin(yaw) * E * 0.55, 0, z - Math.cos(yaw) * E * 0.55);
    c.y = sample(c.x, c.z);
    const texel = 2 * E / CFG.shadowSize;
    const a = Math.round(c.dot(this.right) / texel) * texel, b = Math.round(c.dot(this.up) / texel) * texel, d = c.dot(this.dir);
    const t = this.light.target.position;
    t.copy(this.right).multiplyScalar(a).addScaledVector(this.up, b).addScaledVector(this.dir, d);
    this.light.position.copy(t).addScaledVector(this.dir, 700);
    this.light.target.updateMatrixWorld();
  }
};
var TREE_KINDS = { broad: 0, conifer: 1 };
var TREE_VARIANTS = 3;
var CLEAR = { great_tree: 60, windmill: 26, monastery: 70, gazebo: 22, shrine: 30, arch: 9, ship: 0, pier: 0 };
function exclusions(R) {
  const ex = [];
  for (const L of R.landmarks) {
    if (L.kind === "bridge" || L.kind === "arcade") for (let t = 0; t <= 1; t += 0.05) ex.push([L.a[0] + (L.b[0] - L.a[0]) * t, L.a[1] + (L.b[1] - L.a[1]) * t, 14]);
    else if (CLEAR[L.kind]) ex.push([L.x, L.z, CLEAR[L.kind]]);
  }
  for (const w of R.waypoints) ex.push([w.x, w.z, 7]);
  return ex;
}
function edgeness(x, z, h) {
  let m = 0;
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
    m = Math.max(m, Math.abs(sample(x + c * 16, z + s * 16) - h), Math.abs(sample(x + c * 34, z + s * 34) - h) * 0.8);
  }
  return sstep(7, 24, m);
}
function scatterVegetation(R) {
  const rnd = mulberry32(20261118), ex = exclusions(R), mk = [0, 0, 0, 0], n = new Vector3();
  const trees = [], rocks = [];
  const lim = CFG.half - 10, rv = World.F.river;
  const excluded = (x, z) => x > BOUNDS.x0 && x < BOUNDS.x1 && z > BOUNDS.z0 && z < BOUNDS.z1 || ex.some(([ex_, ez, r]) => (x - ex_) ** 2 + (z - ez) ** 2 < r * r);
  const nearRiver = (x, z, k) => rv.near(x, z) && rv.sample(x, z) < rv.b * k;
  const step = 7;
  for (let z = -lim; z < lim; z += step) for (let x = -lim; x < lim; x += step) {
    const px2 = x + (rnd() - 0.5) * step * 0.9, pz2 = z + (rnd() - 0.5) * step * 0.9, r1 = rnd(), r2 = rnd(), r3 = rnd();
    const h = sample(px2, pz2);
    if (h < 3) continue;
    normalAt(px2, pz2, n);
    if (n.y < 0.86) continue;
    maskAt(px2, pz2, mk);
    if (mk[0] > 0.08 || mk[1] > 0.15 || mk[3] > 0.15) continue;
    if (nearRiver(px2, pz2, 2.4) || excluded(px2, pz2)) continue;
    const clump = sstep(0.04, 0.32, fbm(N2, px2 * 36e-4, pz2 * 36e-4, 3));
    const edge = edgeness(px2, pz2, h);
    let dens = 0.015 + 0.38 * clump + 0.3 * edge;
    if (mk[2] > 0.3) dens *= 0.12;
    if (r1 > dens) continue;
    const coniferP = 0.18 + 0.55 * sstep(30, 100, h) + 0.25 * fbm(N1, px2 * 6e-3, pz2 * 6e-3, 2);
    const kind = r2 < coniferP ? TREE_KINDS.conifer : TREE_KINDS.broad;
    trees.push({
      x: px2,
      y: h - 0.15,
      z: pz2,
      kind,
      v: kind * TREE_VARIANTS + Math.floor(r3 * TREE_VARIANTS),
      s: kind === TREE_KINDS.conifer ? 0.8 + rnd() * 0.5 : 0.8 + rnd() * 0.45,
      rot: rnd() * Math.PI * 2,
      hue: rnd()
    });
  }
  const rstep = 8;
  for (let z = -lim; z < lim; z += rstep) for (let x = -lim; x < lim; x += rstep) {
    const px2 = x + (rnd() - 0.5) * rstep, pz2 = z + (rnd() - 0.5) * rstep, r1 = rnd();
    const h = sample(px2, pz2);
    if (h < -0.6) continue;
    normalAt(px2, pz2, n);
    maskAt(px2, pz2, mk);
    if (mk[0] > 0.3 || mk[3] > 0.3 || excluded(px2, pz2)) continue;
    let s = 0;
    if (mk[1] > 0.4 && h < 5) {
      if (r1 < 0.28) s = 0.18 + rnd() * 0.35;
    } else if (nearRiver(px2, pz2, 3) && !nearRiver(px2, pz2, 0.9)) {
      if (r1 < 0.3) s = 0.3 + rnd() * 0.7;
    } else if (n.y > 0.55 && n.y < 0.93 && edgeness(px2, pz2, h) > 0.4) {
      if (r1 < 0.32) s = 0.7 + rnd() * 1.8;
    } else if (n.y > 0.9 && r1 < 0.012) s = 0.5 + rnd() * 1;
    if (!s) continue;
    rocks.push({ x: px2, y: h - 0.22 * s, z: pz2, s, v: Math.floor(rnd() * 4), rot: rnd() * Math.PI * 2, tilt: (rnd() - 0.5) * 0.4 });
  }
  return { trees, rocks };
}
var GATHER = {
  flower_pink: { item: "wind_blossom", mesh: "flower", tint: [0.97, 0.63, 0.8], respawn: 600 },
  flower_lilac: { item: "mist_star", mesh: "flower", tint: [0.76, 0.63, 0.96], respawn: 900 },
  flower_yellow: { item: "sunpetal", mesh: "flower", tint: [0.99, 0.88, 0.48], respawn: 600 },
  herb: { item: "field_herb", mesh: "herb", tint: [0.5, 0.74, 0.36], respawn: 600 },
  mushroom: { item: "pine_cap", mesh: "mushroom", tint: [0.85, 0.52, 0.33], respawn: 900 },
  pebble: { item: "river_pebble", mesh: "pebble", tint: [0.8, 0.78, 0.71], respawn: 600 },
  crystal: { item: "clear_crystal", mesh: "crystal", tint: [0.62, 0.9, 1], respawn: 1800 },
  petal: { item: "aether_petal", mesh: "petal", tint: [1, 0.78, 0.88], respawn: 1200 }
};
function noiseAt(tex, u, v, ch) {
  const S2 = tex.image.width, d = tex.image.data;
  const x = (u % 1 + 1) % 1 * S2, y = (v % 1 + 1) % 1 * S2;
  const i = Math.floor(x) % S2, j = Math.floor(y) % S2;
  return d[(j * S2 + i) * 4 + ch] / 255;
}
function edgeness2(x, z, h) {
  let m = 0;
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4;
    m = Math.max(m, Math.abs(sample(x + Math.cos(a) * 14, z + Math.sin(a) * 14) - h));
  }
  return sstep(6, 20, m);
}
function scatterGatherables(R, trees, noiseTex) {
  const r = mulberry32(777), nodes = [], mk = [0, 0, 0, 0], n = new Vector3(), lim = CFG.half - 20, rv = World.F.river;
  const push = (type, x, z) => {
    const y = sample(x, z);
    nodes.push({ id: `${type}:${nodes.length}`, type, x, y, z, rot: r() * Math.PI * 2, s: 0.85 + r() * 0.3 });
  };
  const okGround = (x, z) => {
    const h = sample(x, z);
    if (h < 0.8) return false;
    maskAt(x, z, mk);
    if (mk[0] > 0.2 || mk[3] > 0.3) return false;
    if (rv.near(x, z) && rv.sample(x, z) < rv.b * 1.1) return false;
    return true;
  };
  for (let z = -lim; z < lim; z += 9) for (let x = -lim; x < lim; x += 9) {
    const px2 = x + (r() - 0.5) * 8, pz2 = z + (r() - 0.5) * 8, roll = r();
    if (!okGround(px2, pz2)) continue;
    const h = sample(px2, pz2);
    normalAt(px2, pz2, n);
    maskAt(px2, pz2, mk);
    if (mk[2] > 0.5 && n.y > 0.85) {
      if (roll < 0.1) {
        const hue = noiseAt(noiseTex, px2 * 0.021 + 0.5, pz2 * 0.021 + 0.5, 0);
        push(hue < 0.36 ? "flower_pink" : hue < 0.7 ? "flower_lilac" : "flower_yellow", px2, pz2);
      }
    } else if (mk[1] > 0.5 && h < 4.5) {
      if (roll < 0.1) push("pebble", px2, pz2);
    } else if (rv.near(px2, pz2) && rv.sample(px2, pz2) < rv.b * 2.6) {
      if (roll < 0.22) push("pebble", px2, pz2);
    } else if (n.y > 0.88 && roll < 0.035 && sstep(0.15, 0.45, fbm(N3, px2 * 4e-3, pz2 * 4e-3, 2) + 0.2) > 0.5) {
      push("herb", px2, pz2);
    } else if (n.y > 0.6 && n.y < 0.9 && roll < 0.05 && edgeness2(px2, pz2, h) > 0.6) {
      push("crystal", px2, pz2);
    }
  }
  for (const t of trees) {
    if (t.kind !== 1 || r() > 0.045) continue;
    const a = r() * Math.PI * 2, d = 1.6 + r() * 1.6, x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
    if (okGround(x, z)) push("mushroom", x, z);
  }
  const gt = R.landmarks.find((l) => l.kind === "great_tree");
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * Math.PI * 2 + r() * 0.5, d = 9 + r() * 18, x = gt.x + Math.cos(a) * d, z = gt.z + Math.sin(a) * d;
    if (okGround(x, z)) push("petal", x, z);
  }
  return nodes;
}
function isAvailable(node, picked, now = Date.now()) {
  const t = picked[node.id];
  return !t || now - t > GATHER[node.type].respawn * 1e3;
}
var LEAF_CELL = { broad: [0, 0.5], needle: [0.5, 0.5], blossom: [0, 0], small: [0.5, 0] };
function leafShape(g, x, y, len, wid, ang, lum) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  const gr = g.createLinearGradient(0, -wid, 0, wid);
  gr.addColorStop(0, `rgb(${lum},${lum},${lum})`);
  gr.addColorStop(1, `rgb(${lum * 0.72 | 0},${lum * 0.72 | 0},${lum * 0.72 | 0})`);
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.45, -wid, len, 0);
  g.quadraticCurveTo(len * 0.45, wid, 0, 0);
  g.fill();
  g.restore();
}
function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}
function makeLeafAtlas() {
  const S2 = 512, C2 = 256;
  const [cv, g] = canvas(S2, S2);
  const [pv, pg] = canvas(S2, S2);
  const r = mulberry32(5);
  const cell = (u0, v0) => [u0 * S2, (1 - v0 - 0.5) * S2];
  {
    const [ox, oy] = cell(...LEAF_CELL.broad);
    for (let k = 0; k < 95; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 96, x = ox + C2 / 2 + Math.cos(a) * d, y = oy + C2 / 2 + Math.sin(a) * d;
      leafShape(g, x, y, 20 + r() * 18, 7 + r() * 6, a + (r() - 0.5) * 1.4, 150 + r() * 105 | 0);
    }
  }
  {
    const [ox, oy] = cell(...LEAF_CELL.small);
    for (let k = 0; k < 170; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 100, x = ox + C2 / 2 + Math.cos(a) * d, y = oy + C2 / 2 + Math.sin(a) * d;
      leafShape(g, x, y, 13 + r() * 10, 5 + r() * 3, a + (r() - 0.5) * 1.6, 140 + r() * 115 | 0);
    }
  }
  {
    const [ox, oy] = cell(...LEAF_CELL.needle);
    g.lineCap = "round";
    for (let k = 0; k < 520; k++) {
      const t = r(), y = oy + C2 * (1 - t) - 4, half = (1 - t * 0.85) * 104, side = r() < 0.5 ? -1 : 1;
      const x0 = ox + C2 / 2 + (r() - 0.5) * 8, len = 16 + r() * half * 0.9;
      const lum = 120 + r() * 120 | 0;
      g.strokeStyle = `rgb(${lum},${lum},${lum})`;
      g.lineWidth = 2 + r() * 2.5;
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(x0 + side * len, y - len * (0.25 + r() * 0.3));
      g.stroke();
    }
  }
  {
    const [ox, oy] = cell(...LEAF_CELL.blossom);
    for (let k = 0; k < 30; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 96;
      leafShape(g, ox + C2 / 2 + Math.cos(a) * d, oy + C2 / 2 + Math.sin(a) * d, 18 + r() * 10, 6 + r() * 4, a, 110 + r() * 60 | 0);
    }
    for (let k = 0; k < 120; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 100, x = ox + C2 / 2 + Math.cos(a) * d, y = oy + C2 / 2 + Math.sin(a) * d;
      const pr = 5 + r() * 5, lum = 200 + r() * 55 | 0, rot = r() * 6;
      for (const ctx of [g, pg]) {
        ctx.fillStyle = ctx === g ? `rgb(${lum},${lum},${lum})` : "#fff";
        for (let p = 0; p < 5; p++) {
          const pa = rot + p / 5 * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(pa) * pr * 0.7, y + Math.sin(pa) * pr * 0.7, pr * 0.62, pr * 0.42, pa, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      g.fillStyle = "rgb(255,235,170)";
      g.beginPath();
      g.arc(x, y, pr * 0.25, 0, Math.PI * 2);
      g.fill();
    }
  }
  return toTexture(g, pg, S2, S2, true);
}
function makeGrassAtlas() {
  const W = 512, H = 256, [cv, g] = canvas(W, H), [pv, pg] = canvas(W, H), r = mulberry32(17);
  for (let cellI = 0; cellI < 2; cellI++) {
    const ox = cellI * 256;
    for (let k = 0; k < 26; k++) {
      const x = ox + 20 + r() * 216, h = (0.45 + r() * 0.55) * (H - 12), bend = (r() - 0.5) * 70, w = 5 + r() * 6;
      const lum = 150 + r() * 105 | 0;
      const gr = g.createLinearGradient(0, H, 0, H - h);
      gr.addColorStop(0, `rgb(${lum * 0.55 | 0},${lum * 0.55 | 0},${lum * 0.55 | 0})`);
      gr.addColorStop(1, `rgb(${lum},${lum},${lum})`);
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(x - w / 2, H);
      g.quadraticCurveTo(x - w / 2 + bend * 0.4, H - h * 0.55, x + bend, H - h);
      g.quadraticCurveTo(x + w / 2 + bend * 0.4, H - h * 0.55, x + w / 2, H);
      g.closePath();
      g.fill();
      if (cellI === 1 && k % 4 === 0) {
        const fx = x + bend, fy = H - h, pr = 7 + r() * 5;
        for (const ctx of [g, pg]) {
          ctx.fillStyle = ctx === g ? "rgb(255,255,255)" : "#fff";
          for (let p = 0; p < 5; p++) {
            const pa = p / 5 * Math.PI * 2;
            ctx.beginPath();
            ctx.ellipse(fx + Math.cos(pa) * pr * 0.6, fy + Math.sin(pa) * pr * 0.6, pr * 0.55, pr * 0.38, pa, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        g.fillStyle = "rgb(255,230,150)";
        g.beginPath();
        g.arc(fx, fy, pr * 0.28, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  return toTexture(g, pg, W, H, false);
}
function toTexture(g, pg, W, H, mip) {
  const a = g.getImageData(0, 0, W, H).data, p = pg.getImageData(0, 0, W, H).data, out2 = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const si = ((H - 1 - y) * W + x) * 4, di = (y * W + x) * 4;
    out2[di] = a[si + 3] > 8 ? a[si] : 170;
    out2[di + 1] = p[si + 3];
    out2[di + 2] = 0;
    out2[di + 3] = a[si + 3];
  }
  const t = new DataTexture(out2, W, H, RGBAFormat);
  t.magFilter = LinearFilter;
  t.minFilter = mip ? LinearMipmapLinearFilter : LinearMipmapNearestFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
var V3 = Vector3;
var UP2 = new V3(0, 1, 0);
var Mesher = class {
  constructor() {
    this.p = [];
    this.n = [];
    this.uv = [];
    this.a = [];
    this.i = [];
  }
  get count() {
    return this.p.length / 3;
  }
  v(p, n, u, v, a = [1, 0, 0]) {
    this.p.push(p.x, p.y, p.z);
    this.n.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.a.push(a[0], a[1], a[2]);
    return this.count - 1;
  }
  tri(a, b, c) {
    this.i.push(a, b, c);
  }
  geometry() {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new Float32BufferAttribute(this.n, 3));
    g.setAttribute("uv", new Float32BufferAttribute(this.uv, 2));
    g.setAttribute("aLeaf", new Float32BufferAttribute(this.a, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
};
function tube(m, P2, R, sides, flare = null) {
  let nrm = Math.abs(P2[1].clone().sub(P2[0]).normalize().y) < 0.95 ? new V3(0, 1, 0) : new V3(1, 0, 0);
  const rings = [];
  let vAcc = 0;
  for (let i = 0; i < P2.length; i++) {
    const T2 = (i < P2.length - 1 ? P2[i + 1].clone().sub(P2[i]) : P2[i].clone().sub(P2[i - 1])).normalize();
    nrm.sub(T2.clone().multiplyScalar(nrm.dot(T2))).normalize();
    const bin = new V3().crossVectors(T2, nrm);
    if (i > 0) vAcc += P2[i].distanceTo(P2[i - 1]);
    const ring2 = [];
    for (let s = 0; s <= sides; s++) {
      const a = s / sides * Math.PI * 2, dir = nrm.clone().multiplyScalar(Math.cos(a)).addScaledVector(bin, Math.sin(a));
      const r = R[i] * (flare ? flare(i, a) : 1);
      ring2.push(m.v(P2[i].clone().addScaledVector(dir, r), dir, s / sides, vAcc / (R[0] * 6.283), [0.85, 0, P2[i].y]));
    }
    rings.push(ring2);
  }
  for (let i = 0; i < rings.length - 1; i++) for (let s = 0; s < sides; s++) {
    const a = rings[i][s], b = rings[i][s + 1], c = rings[i + 1][s], d = rings[i + 1][s + 1];
    m.tri(a, b, c);
    m.tri(b, d, c);
  }
}
function branchPath(r, start, dir, len, n, upBias) {
  const pts = [start.clone()], d = dir.clone().normalize(), p = start.clone();
  for (let i = 1; i < n; i++) {
    d.addScaledVector(UP2, upBias).add(new V3((r() - 0.5) * 0.25, (r() - 0.5) * 0.1, (r() - 0.5) * 0.25)).normalize();
    p.addScaledVector(d, len / (n - 1));
    pts.push(p.clone());
  }
  return pts;
}
function cardBasis(n, ang) {
  const t1 = (Math.abs(n.y) < 0.95 ? new V3(0, 1, 0) : new V3(1, 0, 0)).cross(n).normalize();
  const t2 = new V3().crossVectors(n, t1);
  const c = Math.cos(ang), s = Math.sin(ang);
  return [t1.clone().multiplyScalar(c).addScaledVector(t2, s), t2.clone().multiplyScalar(c).addScaledVector(t1, -s)];
}
function foliage(m, r, clusters, cell, cardsPer, sizeK) {
  const C2 = new V3(), mn = new V3(1e9, 1e9, 1e9), mx = new V3(-1e9, -1e9, -1e9);
  for (const c of clusters) {
    C2.add(c.c);
    mn.min(c.c.clone().subScalar(c.r));
    mx.max(c.c.clone().addScalar(c.r));
  }
  C2.divideScalar(clusters.length);
  const Rad = mx.clone().sub(mn).multiplyScalar(0.5).max(new V3(0.5, 0.5, 0.5));
  C2.copy(mn).add(mx).multiplyScalar(0.5);
  for (const cl of clusters) {
    const tone = r();
    for (let k = 0; k < cardsPer; k++) {
      const u = new V3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
      const pos = cl.c.clone().addScaledVector(u, cl.r * (0.3 + 0.5 * r()));
      const outward = pos.clone().sub(C2).divide(Rad).normalize();
      const n = u.clone().multiplyScalar(0.6).addScaledVector(outward, 0.8).add(new V3(0, 0.25, 0)).normalize();
      const [t1, t2] = cardBasis(n, r() * Math.PI * 2), size = cl.r * sizeK * (0.85 + r() * 0.35);
      const ids = [];
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const p = pos.clone().addScaledVector(t1, cx * size / 2).addScaledVector(t2, cy * size / 2);
        const d = p.clone().sub(C2).divide(Rad), dl = Math.min(1.2, d.length());
        const N = d.clone().normalize().multiplyScalar(0.82).addScaledVector(n, 0.18).normalize();
        const ao = Math.min(1, 0.28 + 0.72 * dl) * (0.72 + 0.28 * Math.min(1, Math.max(0, d.y * 0.5 + 0.5)));
        ids.push(m.v(p, N, cell[0] + (cx + 1) * 0.25, cell[1] + (cy + 1) * 0.25, [ao, tone, p.y]));
      }
      m.tri(ids[0], ids[1], ids[2]);
      m.tri(ids[0], ids[2], ids[3]);
    }
  }
}
function generateBroadleaf(seed, P2) {
  const r = mulberry32(seed), bark = new Mesher(), leaf = new Mesher(), H = P2.H, r0 = P2.trunkR ?? H * 0.034;
  const top = new V3((r() - 0.5) * H * 0.08, H * P2.split, (r() - 0.5) * H * 0.08);
  const ctrl = new V3((r() - 0.5) * H * 0.12, H * P2.split * 0.5, (r() - 0.5) * H * 0.12);
  const trunk = [], tr = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5, a = new V3(0, -0.5, 0).lerp(ctrl, t), b = ctrl.clone().lerp(top, t);
    trunk.push(a.lerp(b, t));
    tr.push(r0 * (1 - t * 0.35));
  }
  tube(bark, trunk, tr, P2.sides ?? 7, (i, a) => i === 0 ? 1.5 + 0.22 * Math.sin(a * 5 + seed) : i === 1 ? 1.12 : 1);
  const clusters = [];
  for (let k = 0; k < P2.limbs; k++) {
    const a = k / P2.limbs * Math.PI * 2 + r() * 0.7;
    const dir = new V3(Math.cos(a) * P2.spread, 1, Math.sin(a) * P2.spread);
    const len = H * (0.36 + r() * 0.14);
    const pts = branchPath(r, top, dir, len, 5, P2.upBias ?? 0.22);
    tube(bark, pts, pts.map((_, i) => r0 * (0.62 - i * 0.11)), 5);
    clusters.push({ c: pts[4], r: P2.rc * (1 + r() * 0.3) }, { c: pts[2].clone().add(new V3(0, P2.rc * 0.4, 0)), r: P2.rc * 0.8 });
    for (let s = 0; s < P2.sub; s++) {
      const from = pts[2 + s], sa = a + (s ? 1 : -1) * (0.8 + r() * 0.5);
      const sp = branchPath(r, from, new V3(Math.cos(sa), 0.7, Math.sin(sa)), len * 0.5, 4, 0.25);
      tube(bark, sp, sp.map((_, i) => r0 * (0.3 - i * 0.07)), 4);
      clusters.push({ c: sp[3], r: P2.rc * (0.85 + r() * 0.25) });
    }
  }
  clusters.push({ c: top.clone().add(new V3(0, H * 0.3, 0)), r: P2.rc * 1.2 });
  foliage(leaf, r, clusters, LEAF_CELL[P2.cell], P2.cards, P2.sizeK ?? 1.3);
  return finish(bark, leaf);
}
function generateConifer(seed, P2) {
  const r = mulberry32(seed), bark = new Mesher(), leaf = new Mesher(), H = P2.H, lean = new V3((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4);
  const axis = (y) => new V3(lean.x * y / H, y, lean.z * y / H);
  const trunk = [0, 0.3, 0.6, 0.85, 1.02].map((t) => axis(-0.4 + t * (H + 0.4)));
  tube(bark, trunk, trunk.map((_, i) => H * 0.024 * (1 - i * 0.2)), 6, (i, a) => i === 0 ? 1.35 + 0.15 * Math.sin(a * 4) : 1);
  for (let L = 0; L < P2.levels; L++) {
    const t = L / (P2.levels - 1), y = H * (0.2 + 0.74 * t), R = P2.Rmax * Math.pow(1 - t, 0.85) + 0.45;
    const count = Math.max(3, P2.per - Math.floor(t * 2.5));
    for (let c = 0; c < count * 1.5; c++) {
      const inner = c >= count;
      const ang = L * 2.39996 + (inner ? (c - count + 0.5) * 2 : c) / count * Math.PI * 2 + r() * 0.35, dir = new V3(Math.cos(ang), 0, Math.sin(ang));
      const perp = new V3(-dir.z, 0, dir.x), beta = (c % 2 ? 0.55 : -0.55) + (r() - 0.5) * 0.3;
      const lat = perp.clone().multiplyScalar(Math.cos(beta)).addScaledVector(UP2, Math.sin(beta));
      const Rk = inner ? R * 0.6 : R;
      const droop = inner ? -0.25 : 0.3 + 0.25 * r(), base = axis(y + (inner ? R * 0.15 : 0)), w = Rk * 1.2, rows = [];
      for (const s of [0, 0.5, 1]) {
        const ctr = base.clone().addScaledVector(dir, Rk * s).addScaledVector(UP2, Rk * (0.18 * s - droop * s * s));
        const N = dir.clone().multiplyScalar(0.9 + 0.3 * s).addScaledVector(UP2, 0.65).normalize();
        const ao = (0.35 + 0.6 * s) * (0.72 + 0.28 * t);
        rows.push([-1, 1].map((side) => leaf.v(
          ctr.clone().addScaledVector(lat, side * w / 2),
          N,
          LEAF_CELL.needle[0] + (side + 1) * 0.25,
          LEAF_CELL.needle[1] + s * 0.5,
          [ao, r(), ctr.y]
        )));
      }
      for (let k = 0; k < 2; k++) {
        const [a, b] = rows[k], [c2, d] = rows[k + 1];
        leaf.tri(a, b, d);
        leaf.tri(a, d, c2);
      }
    }
  }
  for (let k = 0; k < 2; k++) {
    const dir = new V3(Math.cos(k * Math.PI / 2), 0, Math.sin(k * Math.PI / 2)), base = axis(H * 0.88), hgt = H * 0.2;
    const ids = [];
    for (const [sx, sy] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
      ids.push(leaf.v(
        base.clone().addScaledVector(dir, sx * 0.55).addScaledVector(UP2, sy * hgt),
        new V3(dir.z, 0.6, -dir.x).normalize(),
        LEAF_CELL.needle[0] + (sx + 1) * 0.25,
        LEAF_CELL.needle[1] + sy * 0.5,
        [0.95, r(), H]
      ));
    }
    leaf.tri(ids[0], ids[1], ids[2]);
    leaf.tri(ids[0], ids[2], ids[3]);
  }
  return finish(bark, leaf);
}
function generateGreatTree(seed) {
  const r = mulberry32(seed), bark = new Mesher(), leaf = new Mesher(), H = 34, r0 = 2.9;
  const trunk = [], tr = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, tw = t * 2.4;
    trunk.push(new V3(Math.sin(tw) * 0.9 * t, -0.6 + t * H * 0.38, Math.cos(tw) * 0.6 * t - 0.6 * t));
    tr.push(r0 * (1 - t * 0.38));
  }
  tube(bark, trunk, tr, 12, (i, a) => i === 0 ? 1.7 + 0.35 * Math.max(0, Math.sin(a * 6)) : i === 1 ? 1.25 + 0.15 * Math.sin(a * 6) : 1);
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * Math.PI * 2 + r() * 0.4, d = new V3(Math.cos(a), 0, Math.sin(a));
    const pts = [0, 0.33, 0.66, 1].map((t) => d.clone().multiplyScalar(r0 * 0.7 + t * (5 + r() * 2)).add(new V3(0, 1.4 - t * 2.1 - t * t * 0.4, 0)));
    tube(bark, pts, [0.95, 0.7, 0.45, 0.22], 6);
  }
  const top = trunk[trunk.length - 1], clusters = [];
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * Math.PI * 2 + r() * 0.5, len = H * (0.5 + r() * 0.12);
    const pts = branchPath(r, top, new V3(Math.cos(a) * 2, 0.85, Math.sin(a) * 2), len, 6, 0.08);
    tube(bark, pts, pts.map((_, i) => r0 * (0.55 - i * 0.085)), 7);
    for (const i of [2, 3, 4, 5]) clusters.push({ c: pts[i].clone().add(new V3(0, 2.2, 0)), r: 4.2 + r() * 1.4 });
    for (let s = 0; s < 2; s++) {
      const sa = a + (s ? 0.9 : -0.9), sp = branchPath(r, pts[3], new V3(Math.cos(sa), 0.5, Math.sin(sa)), len * 0.45, 4, 0.15);
      tube(bark, sp, sp.map((_, i) => r0 * (0.24 - i * 0.05)), 5);
      clusters.push({ c: sp[3].clone().add(new V3(0, 1.5, 0)), r: 3.8 + r() * 1.2 });
    }
  }
  for (let k = 0; k < 6; k++) clusters.push({ c: top.clone().add(new V3((r() - 0.5) * 12, 8 + r() * 4, (r() - 0.5) * 12)), r: 5 + r() * 1.5 });
  foliage(leaf, r, clusters, LEAF_CELL.blossom, 15, 1.35);
  return finish(bark, leaf);
}
function finish(bark, leaf) {
  const b = bark.geometry(), l = leaf.geometry();
  const box3 = l.boundingBox.clone().union(b.boundingBox);
  return { bark: b, leaves: l, height: box3.max.y, radius: Math.max(-box3.min.x, box3.max.x, -box3.min.z, box3.max.z) };
}
var VARIANTS = [
  { kind: "broad", seed: 11, P: { H: 8.5, split: 0.4, limbs: 3, spread: 1, sub: 1, rc: 2.5, cards: 11, cell: "broad", upBias: 0.3 }, leaf: [[0.26, 0.58, 0.16], [0.46, 0.78, 0.22]] },
  { kind: "broad", seed: 23, P: { H: 10, split: 0.36, limbs: 4, spread: 1.15, sub: 1, rc: 2.6, cards: 10, cell: "small", upBias: 0.3 }, leaf: [[0.32, 0.64, 0.18], [0.56, 0.84, 0.26]] },
  { kind: "broad", seed: 37, P: { H: 7, split: 0.42, limbs: 3, spread: 0.9, sub: 1, rc: 2.2, cards: 11, cell: "broad", upBias: 0.3 }, leaf: [[0.24, 0.54, 0.18], [0.4, 0.72, 0.22]] },
  { kind: "conifer", seed: 41, P: { H: 13, Rmax: 3.6, levels: 10, per: 7 }, leaf: [[0.1, 0.42, 0.3], [0.2, 0.56, 0.32]] },
  { kind: "conifer", seed: 53, P: { H: 16, Rmax: 4, levels: 11, per: 7 }, leaf: [[0.12, 0.45, 0.3], [0.22, 0.6, 0.33]] },
  { kind: "conifer", seed: 67, P: { H: 10.5, Rmax: 3.2, levels: 9, per: 6 }, leaf: [[0.14, 0.48, 0.28], [0.26, 0.62, 0.3]] }
];
function buildVariant(V4) {
  return V4.kind === "broad" ? generateBroadleaf(V4.seed, V4.P) : generateConifer(V4.seed, V4.P);
}
var Grid2D = class {
  constructor(items, cell) {
    this.cell = cell;
    this.map = /* @__PURE__ */ new Map();
    for (const it of items) {
      const k = this.key(Math.floor(it.x / cell), Math.floor(it.z / cell));
      let b = this.map.get(k);
      if (!b) this.map.set(k, b = []);
      b.push(it);
    }
  }
  key(i, j) {
    return i * 100003 + j;
  }
  query(x, z, r, cb) {
    const c = this.cell, r2 = r * r;
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++)
      for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) {
        const b = this.map.get(this.key(i, j));
        if (!b) continue;
        for (const it of b) if ((it.x - x) ** 2 + (it.z - z) ** 2 < r2) cb(it);
      }
  }
};
var NEAR = IS_MOBILE ? 80 : 115;
var FADE = 16;
var WIND_HEAD = (
  /* glsl */
  `
  attribute vec3 aLeaf; varying vec3 vLeaf; varying vec2 vLUv; varying vec3 vITint; uniform float uWindAmp, uFlutter;`
);
var WIND_BODY = (
  /* glsl */
  `
  vLeaf=aLeaf; vLUv=uv;
  #ifdef USE_INSTANCING_COLOR
    vITint=instanceColor;
  #else
    vITint=vec3(1.);
  #endif
  vec3 wb=(modelMatrix*vec4(0.,0.,0.,1.)).xyz;
  #ifdef USE_INSTANCING
    wb=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
  #endif
  float hk=clamp(aLeaf.z/14.,0.,1.6); hk*=hk;
  float sw=sin(uTime*1.1+wb.x*.07+wb.z*.05)*.6+sin(uTime*2.3+wb.x*.21)*.25;
  transformed.xz+=vec2(sw,sw*.6)*uWindAmp*hk;
  transformed+=objectNormal*sin(uTime*4.7+aLeaf.y*31.+wb.x*.3)*uFlutter*hk;
`
);
var FADE_GLSL = (
  /* glsl */
  `
  if(uBakeMode<.5 && ign(gl_FragCoord.xy)<smoothstep(uFade.x,uFade.y,distance(cameraPosition.xz,vWorld.xz))) discard;`
);
function makeBarkMaterial(tint, fade = [1e6, 1e6 + 1]) {
  return makeLitMaterial({
    bakeable: true,
    uniforms: { uTint: { value: new Vector3(...tint) }, uFade: { value: new Vector2(...fade) }, uWindAmp: { value: 0.12 }, uFlutter: { value: 0 } },
    vhead: WIND_HEAD,
    vbody: WIND_BODY,
    head: (
      /* glsl */
      `uniform sampler2D uStroke; uniform vec3 uTint; uniform vec2 uFade; varying vec3 vLeaf; varying vec2 vLUv; varying vec3 vITint;`
    ),
    body: (
      /* glsl */
      `
      ${FADE_GLSL}
      float st=texture2D(uStroke,vec2(vObj.x+vObj.z,vObj.y*.22)*.7).r;
      float st2=texture2D(uStroke,vLUv*vec2(1.,3.)).g;
      alb=uTint*(.70+.45*st)*(.9+.2*st2); ao=.78; eN=(st-.5)*.2;
    `
    )
  });
}
function makeLeafMaterial(leafTex, tints, { fade = [1e6, 1e6 + 1], petal = null, wind = 0.16 } = {}) {
  return makeLitMaterial({
    bakeable: true,
    side: DoubleSide,
    uniforms: {
      uLeafTex: { value: leafTex },
      uTint: { value: new Vector3(...tints[0]) },
      uTint2: { value: new Vector3(...tints[1]) },
      uPetal: { value: new Vector4(...petal ?? [0, 0, 0, 0]) },
      uFade: { value: new Vector2(...fade) },
      uWindAmp: { value: wind },
      uFlutter: { value: 0.05 }
    },
    vhead: WIND_HEAD,
    vbody: WIND_BODY,
    head: (
      /* glsl */
      `uniform sampler2D uLeafTex; uniform vec3 uTint, uTint2; uniform vec4 uPetal; uniform vec2 uFade; varying vec3 vLeaf; varying vec2 vLUv; varying vec3 vITint;`
    ),
    body: (
      /* glsl */
      `
      vec4 tx=texture2D(uLeafTex,vLUv); if(tx.a<.5) discard;
      ${FADE_GLSL}
      vec3 base=mix(uTint,uTint2,vLeaf.y)*vITint;
      base=mix(base,uPetal.rgb,tx.g*uPetal.a);
      alb=base*(.6+.55*tx.r);
      ao=vLeaf.x; eN=(tx.r-.5)*.35;
      vec3 V=normalize(cameraPosition-vWorld);
      extra=alb*vec3(.5,.42,.16)*pow(max(dot(-V,uSunDir),0.),3.)*.55*uWarm*(1.-ao*.5);
    `
    )
  });
}
function leafDepthMaterial(leafTex) {
  return new MeshDepthMaterial({ depthPacking: RGBADepthPacking, map: leafTex, alphaTest: 0.5 });
}
var COLS = 4;
var ROWS = 2;
var CW = 256;
var CH = 384;
var YOFF = -0.4;
function bakeImpostors(renderer, parts) {
  const W = COLS * CW, H = ROWS * CH;
  const make = () => {
    const rt = new WebGLRenderTarget(W, H);
    rt.texture.generateMipmaps = true;
    rt.texture.minFilter = LinearMipmapLinearFilter;
    rt.texture.magFilter = LinearFilter;
    return rt;
  };
  const alb = make(), nrm = make(), scene = new Scene(), cam = new OrthographicCamera();
  const prevColor = renderer.getClearColor(new Color()), prevAlpha = renderer.getClearAlpha(), prevAuto = renderer.autoClear;
  const cells = [];
  renderer.autoClear = false;
  for (const [rt, mode, clear] of [[alb, 1, 7313994], [nrm, 2, 8421631]]) {
    shared.uBakeMode.value = mode;
    rt.scissorTest = false;
    rt.viewport.set(0, 0, W, H);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(clear, 0);
    renderer.clear();
    parts.forEach((p, i) => {
      const cx = i % COLS, cy = Math.floor(i / COLS), fw = Math.max(2 * p.radius, (p.height - YOFF) / 1.5) * 1.06, fh = fw * 1.5;
      rt.viewport.set(cx * CW, cy * CH, CW, CH);
      rt.scissor.set(cx * CW, cy * CH, CW, CH);
      rt.scissorTest = true;
      renderer.setRenderTarget(rt);
      cam.left = -fw / 2;
      cam.right = fw / 2;
      cam.bottom = YOFF;
      cam.top = YOFF + fh;
      cam.near = 0.1;
      cam.far = 200;
      cam.position.set(0, 0, 80);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      const a = new Mesh(p.bark, p.barkMat), b = new Mesh(p.leaves, p.leafMat);
      scene.add(a, b);
      renderer.render(scene, cam);
      scene.remove(a, b);
      cells[i] = new Vector4(cx / COLS, cy / ROWS, fw, fh);
    });
  }
  shared.uBakeMode.value = 0;
  renderer.setRenderTarget(null);
  renderer.setClearColor(prevColor, prevAlpha);
  renderer.autoClear = prevAuto;
  return { alb: alb.texture, nrm: nrm.texture, cells };
}
function impostorMaterial(bake) {
  const mat2 = new ShaderMaterial({
    uniforms: {
      uAlb: { value: bake.alb },
      uNrm: { value: bake.nrm },
      uCell: { value: bake.cells },
      uCellUV: { value: new Vector2(1 / COLS, 1 / ROWS) },
      uFade: { value: new Vector2(NEAR - FADE, NEAR) }
    },
    vertexShader: (
      /* glsl */
      `
      attribute vec4 iPos; attribute vec4 iData;
      uniform vec4 uCell[${VARIANTS.length}]; uniform vec2 uCellUV;
      varying vec2 vUv; varying vec3 vW, vRight, vToCam, vBase; varying float vHue, vD;
      void main(){
        vec4 c=uCell[int(iData.x+.5)];
        vec3 toCam=cameraPosition-iPos.xyz; toCam.y=0.; vD=length(toCam); toCam/=max(vD,1e-3);
        vec3 right=vec3(toCam.z,0.,-toCam.x);
        float s=iPos.w;
        vec3 wp=iPos.xyz+right*position.x*c.z*s+vec3(0.,(position.y*c.w+${YOFF.toFixed(2)})*s,0.);
        vUv=vec2(c.x+(position.x+.5)*uCellUV.x,c.y+position.y*uCellUV.y);
        vW=wp; vRight=right; vToCam=toCam; vBase=iPos.xyz; vHue=iData.y;
        gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);
      }`
    ),
    fragmentShader: (
      /* glsl */
      `
      ${GLSL_WORLD}
      ${GLSL_ATMOS}
      ${GLSL_GRASS}
      ${GLSL_TOON}
      uniform sampler2D uAlb, uNrm, uBake; uniform vec2 uFade;
      varying vec2 vUv; varying vec3 vW, vRight, vToCam, vBase; varying float vHue, vD;
      void main(){
        vec4 a=texture2D(uAlb,vUv); if(a.a<.45) discard;
        if(ign(gl_FragCoord.xy)>smoothstep(uFade.x,uFade.y,vD)) discard;
        vec3 n=texture2D(uNrm,vUv).xyz*2.-1.;
        vec3 N=normalize(vRight*n.x+vec3(0.,1.,0.)*n.y+vToCam*n.z);
        vec3 alb=a.rgb*mix(vec3(.92,1.,.95),vec3(1.06,1.,.9),vHue);
        float sh=inWorld(vBase.xz)>.5?smoothstep(.12,.88,texture2D(uBake,bakeUV(vBase.xz)).r):1.;
        vec3 col=toonLight(alb,N,sh,1.,0.);
        col=applyAtmos(col,vW);
        gl_FragColor=vec4(clamp(col,0.,1.),1.);
      }`
    )
  });
  return bindShared(mat2);
}
var _m2 = new Matrix4();
var _q2 = new Quaternion();
var _p2 = new Vector3();
var _s2 = new Vector3();
var _c = new Color();
var UP3 = new Vector3(0, 1, 0);
var Forest = class {
  constructor(scene, renderer, trees, leafTex) {
    this.trees = trees;
    this.grid = new Grid2D(trees, 64);
    const fade = [NEAR - FADE, NEAR];
    const barkTint = { broad: [0.46, 0.37, 0.31], conifer: [0.4, 0.32, 0.28] };
    this.parts = VARIANTS.map((V4) => {
      const g = buildVariant(V4);
      return { ...g, barkMat: makeBarkMaterial(barkTint[V4.kind], fade), leafMat: makeLeafMaterial(leafTex, V4.leaf, { fade, wind: V4.kind === "conifer" ? 0.1 : 0.16 }) };
    });
    this.bake = bakeImpostors(renderer, this.parts);
    const cap = IS_MOBILE ? 160 : 300, depth = leafDepthMaterial(leafTex);
    this.near = this.parts.map((p) => {
      const bark = new InstancedMesh(p.bark, p.barkMat, cap), leaves = new InstancedMesh(p.leaves, p.leafMat, cap);
      for (const m of [bark, leaves]) {
        m.castShadow = m.receiveShadow = true;
        m.frustumCulled = false;
        m.count = 0;
        scene.add(m);
      }
      leaves.customDepthMaterial = depth;
      leaves.setColorAt(0, _c.setRGB(1, 1, 1));
      return { bark, leaves, cap };
    });
    const quad = new PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const geo = new InstancedBufferGeometry().copy(quad);
    geo.instanceCount = trees.length;
    const iPos = new Float32Array(trees.length * 4), iData = new Float32Array(trees.length * 4);
    trees.forEach((t, i) => {
      iPos.set([t.x, t.y, t.z, t.s], i * 4);
      iData.set([t.v, t.hue, 0, 0], i * 4);
    });
    geo.setAttribute("iPos", new InstancedBufferAttribute(iPos, 4));
    geo.setAttribute("iData", new InstancedBufferAttribute(iData, 4));
    this.impostors = new Mesh(geo, impostorMaterial(this.bake));
    this.impostors.frustumCulled = false;
    scene.add(this.impostors);
    for (const t of trees) addCyl({ x: t.x, z: t.z, r: (t.kind === 1 ? 0.26 : 0.34) * t.s + 0.1, y0: t.y - 1, y1: t.y + 5 });
    this.last = [Infinity, Infinity];
  }
  update(cam) {
    if (Math.hypot(cam.x - this.last[0], cam.z - this.last[1]) < 10) return;
    this.last = [cam.x, cam.z];
    for (const n of this.near) n.bark.count = n.leaves.count = 0;
    this.grid.query(cam.x, cam.z, NEAR + 6, (t) => {
      const n = this.near[t.v];
      if (n.bark.count >= n.cap) return;
      const i = n.bark.count++;
      n.leaves.count++;
      _q2.setFromAxisAngle(UP3, t.rot);
      _m2.compose(_p2.set(t.x, t.y, t.z), _q2, _s2.set(t.s, t.s, t.s));
      n.bark.setMatrixAt(i, _m2);
      n.leaves.setMatrixAt(i, _m2);
      const k = 0.92 + t.hue * 0.14;
      n.leaves.setColorAt(i, _c.setRGB(k * (0.97 + t.hue * 0.05), k, k * (1.03 - t.hue * 0.08)));
    });
    for (const n of this.near) {
      n.bark.instanceMatrix.needsUpdate = n.leaves.instanceMatrix.needsUpdate = true;
      if (n.leaves.instanceColor) n.leaves.instanceColor.needsUpdate = true;
    }
  }
  get nearCount() {
    return this.near.reduce((a, n) => a + n.bark.count, 0);
  }
};
function buildGreatTree(L, leafTex) {
  const group = new Group(), g = generateGreatTree(2026), y = sample(L.x, L.z) - 0.5;
  const bark = new Mesh(g.bark, makeBarkMaterial([0.62, 0.52, 0.46]));
  bark.material.uniforms.uWindAmp.value = 0.03;
  const leaves = new Mesh(g.leaves, makeLeafMaterial(leafTex, [[1, 0.74, 0.82], [0.96, 0.6, 0.74]], { petal: [1, 0.86, 0.93, 0.55], wind: 0.05 }));
  leaves.customDepthMaterial = leafDepthMaterial(leafTex);
  for (const m of [bark, leaves]) {
    m.position.set(L.x, y, L.z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  addCyl({ x: L.x, z: L.z, r: 4.3, y0: y - 1, y1: y + 14 });
  const N = 320, pos = new Float32Array(N * 3), seed = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 34;
    pos.set([L.x + Math.cos(a) * r, y, L.z + Math.sin(a) * r], i * 3);
    seed.set([Math.random() * 32 + 2, Math.random() * 6.28, 0.5 + Math.random(), Math.random()], i * 4);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new BufferAttribute(seed, 4));
  const mat2 = bindShared(new ShaderMaterial({
    uniforms: { uScale: { value: 600 } },
    vertexShader: (
      /* glsl */
      `
      attribute vec4 aSeed; uniform float uTime, uScale; varying float vA; varying vec3 vW;
      void main(){
        float t=uTime*.55*aSeed.z+aSeed.w*30.;
        float h=mod(aSeed.x-t*1.4,34.);
        vec3 p=position+vec3(sin(t*.9+aSeed.y)*2.5,h,cos(t*.7+aSeed.y)*1.8);
        vW=p; vA=smoothstep(0.,2.,h)*smoothstep(34.,27.,h);
        vec4 mv=viewMatrix*vec4(p,1.);
        gl_PointSize=uScale*.16/max(-mv.z,.1);
        gl_Position=projectionMatrix*mv;
      }`
    ),
    fragmentShader: (
      /* glsl */
      `
      ${GLSL_ATMOS}
      varying float vA; varying vec3 vW;
      void main(){
        vec2 q=gl_PointCoord*2.-1.; float d=dot(q*vec2(1.,1.7),q*vec2(1.,1.7)); if(d>1.) discard;
        vec3 c=applyAtmos(vec3(1.,.80,.90)*(1.-d*.2),vW);
        gl_FragColor=vec4(c,vA*.9);
      }`
    ),
    transparent: true,
    depthWrite: false
  }));
  const petals = new Points(geo, mat2);
  petals.frustumCulled = false;
  group.add(petals);
  group.userData.setViewport = (h, proj11) => {
    mat2.uniforms.uScale.value = h * proj11 * 0.5;
  };
  return group;
}
function cardGeometry() {
  const pos = [], uv = [], idx = [];
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI / 3, c = Math.cos(a), s = Math.sin(a), b = pos.length / 3;
    for (const [x, y] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]]) {
      pos.push(c * x, y, s * x);
      uv.push(x + 0.5, y);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new InstancedBufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
function grassMaterial(tex) {
  const mat2 = new ShaderMaterial({
    lights: true,
    side: DoubleSide,
    uniforms: UniformsUtils.merge([UniformsLib.lights, {
      uGrassTex: { value: tex },
      uCell: { value: 1 },
      uSide: { value: 1 },
      uRadius: { value: 1 },
      uInner: { value: 0 },
      uOrigin: { value: new Vector2() }
    }]),
    vertexShader: (
      /* glsl */
      `
      #include <common>
      #include <shadowmap_pars_vertex>
      ${GLSL_WORLD}
      ${GLSL_GRASS}
      uniform sampler2D uHeight, uMask, uNoise, uStroke;
      uniform float uTime, uCell, uSide, uRadius, uInner; uniform vec2 uOrigin;
      varying vec2 vUv; varying vec3 vWorld, vCol, vN, vFlowerCol; varying float vY, vFlower;
      float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      void main(){
        float id=float(gl_InstanceID);
        vec2 cell=uOrigin+vec2(mod(id,uSide),floor(id/uSide))-floor(uSide*.5);
        float h1=h21(cell), h2=h21(cell+17.31), h3=h21(cell+41.7), h4=h21(cell+5.13);
        vec2 p=(cell+vec2(h1,h2))*uCell;
        float d=distance(p,cameraPosition.xz);
        vec2 guv=gridUV(p);
        vec4 mk=texture2D(uMask,guv);
        float hg=texture2D(uHeight,guv).r;
        float hx=texture2D(uHeight,gridUV(p+vec2(2.5,0.))).r, hz=texture2D(uHeight,gridUV(p+vec2(0.,2.5))).r;
        vec3 N=normalize(vec3(hg-hx,2.5,hg-hz));
        float patchN=texture2D(uNoise,p*.013).g;
        float cover=(1.-clamp(max(max(mk.r*1.5,mk.g*1.4),mk.a*1.1),0.,1.))*smoothstep(.70,.84,N.y)*smoothstep(.5,1.4,hg)*inWorld(p);
        cover*=smoothstep(.05,.4,patchN+.18);
        if(d>uRadius||d<uInner||h3>cover){ gl_Position=vec4(2.,2.,2.,1.); return; }
        float fl=step(h4,mk.b*.6);
        float sc=mix(.55,1.1,h4)*(.65+.55*patchN)*(1.-smoothstep(uRadius*.72,uRadius,d));
        float ca=cos(h1*6.2832), sa=sin(h1*6.2832);
        vec3 lp=position; lp.xz=vec2(ca*lp.x-sa*lp.z,sa*lp.x+ca*lp.z);
        lp.xz*=.85*sc; lp.y*=(fl>.5?.62:.5)*sc*(.8+.5*h2);
        float gust=sin(uTime*.9+p.x*.08+p.y*.05)*.6+sin(uTime*2.1+p.x*.3-p.y*.2)*.25;
        lp.xz+=vec2(.13,.09)*gust*position.y*position.y*sc;
        vec3 wp=vec3(p.x,hg-.03,p.y)+lp;
        float nL=texture2D(uNoise,p*0.00055).r, nM=texture2D(uNoise,p*0.0042+.37).g;
        float st=texture2D(uStroke,p*0.011+vec2(nM*.35)).r, st2=texture2D(uStroke,p*0.047+vec2(.3,.6)).g;
        vCol=grassColor(nL,nM,st,st2,hg)*mix(.92,1.1,h2);
        float hue=texture2D(uNoise,p*.021+.5).r;
        vFlowerCol=hue<.36?vec3(.97,.63,.80):hue<.70?vec3(.76,.63,.96):vec3(.99,.91,.55);
        vFlower=fl; vUv=vec2(uv.x*.5+fl*.5,uv.y); vY=uv.y; vN=N; vWorld=wp;
        vec4 worldPosition=vec4(wp,1.);
        vec3 transformedNormal=(viewMatrix*vec4(N,0.)).xyz;
        #include <shadowmap_vertex>
        gl_Position=projectionMatrix*viewMatrix*worldPosition;
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
      uniform sampler2D uGrassTex, uBake;
      varying vec2 vUv; varying vec3 vWorld, vCol, vN, vFlowerCol; varying float vY, vFlower;
      void main(){
        vec4 tx=texture2D(uGrassTex,vUv); if(tx.a<.45) discard;
        vec3 alb=vCol*mix(.55,1.12,vY)*(.82+.3*tx.r);
        alb=mix(alb,vFlowerCol*(.85+.25*tx.r),tx.g*vFlower);
        vec3 N=normalize(mix(vN,vec3(0.,1.,0.),.5));
        float bs=smoothstep(.12,.88,texture2D(uBake,bakeUV(vWorld.xz)).r);
        vec3 col=toonLight(alb,N,min(getShadowMask(),bs),mix(.62,1.,vY),0.);
        col=applyAtmos(col,vWorld);
        gl_FragColor=vec4(clamp(col,0.,1.),1.);
      }`
    )
  });
  return bindShared(mat2);
}
var Grass = class {
  constructor(scene, tex) {
    const rings = IS_MOBILE ? [[0.62, 0, 13], [1.25, 13, 28]] : [[0.45, 0, 15], [0.95, 15, 42]];
    this.rings = rings.map(([cell, inner, radius]) => {
      const side = Math.ceil(2 * radius / cell) + 2, geo = cardGeometry(), mat2 = grassMaterial(tex);
      geo.instanceCount = side * side;
      Object.assign(mat2.uniforms, { uCell: { value: cell }, uSide: { value: side }, uRadius: { value: radius }, uInner: { value: inner }, uOrigin: { value: new Vector2() } });
      const m = new Mesh(geo, mat2);
      m.frustumCulled = false;
      m.receiveShadow = true;
      m.renderOrder = 0;
      scene.add(m);
      return { m, cell };
    });
  }
  update(cam) {
    for (const r of this.rings) r.m.material.uniforms.uOrigin.value.set(Math.floor(cam.x / r.cell), Math.floor(cam.z / r.cell));
  }
};
var RANGE = IS_MOBILE ? 140 : 200;
function rockGeometry(seed) {
  const r = mulberry32(seed), g = new IcosahedronGeometry(1, 1), p = g.attributes.position, v = new Vector3();
  const planes = Array.from({ length: 4 }, () => [new Vector3(r() * 2 - 1, r() * 1.4 - 0.2, r() * 2 - 1).normalize(), 0.55 + r() * 0.3]);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.multiplyScalar(1 + 0.22 * N1(v.x * 1.6 + seed, v.z * 1.6 + v.y) + 0.1 * N2(v.y * 3 + seed, v.x * 3));
    for (const [n, o] of planes) {
      const d = v.dot(n);
      if (d > o) v.addScaledVector(n, o - d);
    }
    if (v.y < -0.35) v.y = -0.35;
    v.y *= 0.62;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
function rockMaterial() {
  return makeLitMaterial({
    head: (
      /* glsl */
      `uniform sampler2D uStroke;`
    ),
    body: (
      /* glsl */
      `
      float st=texture2D(uStroke,vObj.xz*.35+vObj.y*.21).r, nn=texture2D(uNoise,vObj.xy*.2+vObj.z*.13).b;
      alb=mix(vec3(.50,.50,.47),vec3(.75,.70,.59),smoothstep(.3,.7,st*.6+nn*.4));
      float moss=smoothstep(.45,.85,N.y)*smoothstep(.4,.7,nn+.2);
      alb=mix(alb,vec3(.42,.58,.32),moss*.75);
      ao=.68+.32*smoothstep(-.3,.5,vObj.y); eN=(st-.5)*.2;
      if(ign(gl_FragCoord.xy)<smoothstep(${(RANGE - 25).toFixed(1)},${RANGE.toFixed(1)},distance(cameraPosition.xz,vWorld.xz))) discard;
    `
    )
  });
}
var _m32 = new Matrix4();
var _q3 = new Quaternion();
var _e = new Euler();
var _p3 = new Vector3();
var _s3 = new Vector3();
var Rocks = class {
  constructor(scene, rocks) {
    this.grid = new Grid2D(rocks, 64);
    const mat2 = rockMaterial(), cap = IS_MOBILE ? 500 : 900;
    this.meshes = [0, 1, 2, 3].map((k) => {
      const m = new InstancedMesh(rockGeometry(101 + k * 17), mat2, cap);
      m.castShadow = m.receiveShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
      return { m, cap };
    });
    for (const r of rocks) if (r.s > 0.8) addCyl({ x: r.x, z: r.z, r: r.s * 0.8, y0: r.y - 1, y1: r.y + r.s * 0.55 });
    this.last = [Infinity, Infinity];
  }
  update(cam) {
    if (Math.hypot(cam.x - this.last[0], cam.z - this.last[1]) < 12) return;
    this.last = [cam.x, cam.z];
    for (const o of this.meshes) o.m.count = 0;
    this.grid.query(cam.x, cam.z, RANGE, (r) => {
      if (r.s < 0.6 && (r.x - cam.x) ** 2 + (r.z - cam.z) ** 2 > 70 * 70) return;
      const o = this.meshes[r.v];
      if (o.m.count >= o.cap) return;
      _q3.setFromEuler(_e.set(r.tilt, r.rot, r.tilt * 0.6));
      o.m.setMatrixAt(o.m.count++, _m32.compose(_p3.set(r.x, r.y, r.z), _q3, _s3.set(r.s * 1.15, r.s, r.s)));
    });
    for (const o of this.meshes) o.m.instanceMatrix.needsUpdate = true;
  }
};
var RANGE2 = 90;
var B = class {
  constructor() {
    this.p = [];
    this.n = [];
    this.c = [];
    this.t = [];
  }
  tri(a, b, c, col, tint = 0, nrm = null) {
    const N = nrm || new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize();
    for (const v of [a, b, c]) {
      this.p.push(v.x, v.y, v.z);
      this.n.push(N.x, N.y, N.z);
      this.c.push(...col);
      this.t.push(tint);
    }
  }
  quad(a, b, c, d, col, tint = 0, nrm = null) {
    this.tri(a, b, c, col, tint, nrm);
    this.tri(a, c, d, col, tint, nrm);
  }
  geo() {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new Float32BufferAttribute(this.n, 3));
    g.setAttribute("aCol", new Float32BufferAttribute(this.c, 3));
    g.setAttribute("aTint", new Float32BufferAttribute(this.t, 1));
    g.computeBoundingSphere();
    return g;
  }
};
var V = (x, y, z) => new Vector3(x, y, z);
var STEM = [0.36, 0.58, 0.28];
var LEAF = [0.42, 0.66, 0.3];
function flowerGeo() {
  const b = new B(), r = mulberry32(3);
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + r(), lean = 0.06 + r() * 0.08, h = 0.32 + r() * 0.16;
    const top = V(Math.cos(a) * lean, h, Math.sin(a) * lean), side = V(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(0.012);
    b.quad(V(0, 0, 0).sub(side), V(0, 0, 0).add(side), top.clone().add(side), top.clone().sub(side), STEM, 0, V(Math.cos(a), 0.3, Math.sin(a)).normalize());
    for (let p = 0; p < 5; p++) {
      const pa = p / 5 * Math.PI * 2 + a, d = V(Math.cos(pa), 0, Math.sin(pa)), s = V(-d.z, 0, d.x);
      const base = top.clone().add(V(0, 5e-3, 0)), tip = top.clone().addScaledVector(d, 0.075).add(V(0, 0.025, 0));
      const mid = top.clone().addScaledVector(d, 0.045).add(V(0, 0.012, 0));
      b.tri(base, mid.clone().addScaledVector(s, 0.032), tip, [1, 1, 1], 1, V(d.x * 0.3, 1, d.z * 0.3).normalize());
      b.tri(base, tip, mid.clone().addScaledVector(s, -0.032), [1, 1, 1], 1, V(d.x * 0.3, 1, d.z * 0.3).normalize());
    }
    const c = top.clone().add(V(0, 0.018, 0)), cs = 0.016;
    b.quad(c.clone().add(V(-cs, 0, -cs)), c.clone().add(V(cs, 0, -cs)), c.clone().add(V(cs, 0, cs)), c.clone().add(V(-cs, 0, cs)), [1, 0.9, 0.6], 0, V(0, 1, 0));
  }
  for (let k = 0; k < 4; k++) {
    const a = k * 1.57 + 0.4, d = V(Math.cos(a), 0, Math.sin(a)), s = V(-d.z, 0, d.x);
    b.quad(V(0, 0.01, 0), d.clone().multiplyScalar(0.08).addScaledVector(s, 0.04).add(V(0, 0.05, 0)), d.clone().multiplyScalar(0.17).add(V(0, 0.03, 0)), d.clone().multiplyScalar(0.08).addScaledVector(s, -0.04).add(V(0, 0.05, 0)), LEAF, 0, V(0, 1, 0));
  }
  return b.geo();
}
function herbGeo() {
  const b = new B();
  for (let k = 0; k < 8; k++) {
    const a = k * 0.785 + k % 2 * 0.3, d = V(Math.cos(a), 0, Math.sin(a)), s = V(-d.z, 0, d.x), L = k % 2 ? 0.26 : 0.32;
    const tip = d.clone().multiplyScalar(L).add(V(0, 0.16 + k % 3 * 0.04, 0));
    const m1 = d.clone().multiplyScalar(L * 0.45).add(V(0, 0.14, 0));
    const col = k % 2 ? [0.44, 0.7, 0.32] : [0.52, 0.78, 0.36];
    b.quad(V(0, 0.02, 0), m1.clone().addScaledVector(s, 0.06), tip, m1.clone().addScaledVector(s, -0.06), col, 1, V(d.x * 0.4, 1, d.z * 0.4).normalize());
  }
  return b.geo();
}
function lathe(b, prof, col, tint, x, z, sc, seg = 10) {
  for (let i = 0; i < prof.length - 1; i++) for (let s = 0; s < seg; s++) {
    const a0 = s / seg * Math.PI * 2, a1 = (s + 1) / seg * Math.PI * 2;
    const P2 = (pr, a) => V(x + Math.cos(a) * pr[0] * sc, pr[1] * sc, z + Math.sin(a) * pr[0] * sc);
    b.quad(P2(prof[i], a0), P2(prof[i], a1), P2(prof[i + 1], a1), P2(prof[i + 1], a0), col, tint);
  }
}
function mushroomGeo() {
  const b = new B();
  for (const [x, z, s] of [[0, 0, 1], [0.09, 0.05, 0.7], [-0.06, 0.08, 0.55]]) {
    lathe(b, [[0.022, 0], [0.026, 0.06], [0.02, 0.11]], [0.93, 0.88, 0.78], 0, x, z, s, 8);
    lathe(b, [[0.02, 0.1], [0.07, 0.105], [0.085, 0.12], [0.07, 0.155], [0.035, 0.175], [0, 0.18]], [1, 1, 1], 1, x, z, s, 12);
  }
  return b.geo();
}
function pebbleGeo() {
  const b = new B(), r = mulberry32(9);
  for (const [x, z, s] of [[0, 0, 0.09], [0.1, 0.06, 0.06], [-0.07, 0.07, 0.05]]) {
    const g = new IcosahedronGeometry(s, 0), p = g.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      const t = [0, 1, 2].map((k) => V(p.getX(i + k) + x, p.getY(i + k) * 0.6 + s * 0.35, p.getZ(i + k) + z));
      b.tri(t[0], t[1], t[2], [1, 1, 1], 1);
    }
    r();
  }
  return b.geo();
}
function crystalGeo() {
  const b = new B(), r = mulberry32(21);
  for (let k = 0; k < 5; k++) {
    const a = k * 1.3, lean = V(Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35).normalize(), base = V(Math.cos(a) * 0.08, -0.05, Math.sin(a) * 0.08);
    const h = 0.35 + r() * 0.4, w = 0.06 + r() * 0.04, up = lean.clone().multiplyScalar(h), tip = base.clone().add(lean.clone().multiplyScalar(h + w * 2.2));
    const t1 = new Vector3(1, 0, 0).cross(lean).normalize(), t2 = lean.clone().cross(t1);
    const ring2 = (i) => {
      const q = i / 6 * Math.PI * 2;
      return t1.clone().multiplyScalar(Math.cos(q) * w).addScaledVector(t2, Math.sin(q) * w);
    };
    for (let i = 0; i < 6; i++) {
      const a0 = ring2(i), a1 = ring2(i + 1);
      b.quad(base.clone().add(a0), base.clone().add(a1), base.clone().add(up).add(a1), base.clone().add(up).add(a0), [1, 1, 1], 1);
      b.tri(base.clone().add(up).add(a0), base.clone().add(up).add(a1), tip, [1.15, 1.15, 1.15], 1);
    }
  }
  return b.geo();
}
function petalGeo() {
  const b = new B();
  for (const [a, y] of [[0, 0.5], [2.2, 0.62]]) {
    const d = V(Math.cos(a), 0, Math.sin(a)), s = V(-d.z, 0, d.x);
    const c = V(0, y, 0), tip = c.clone().addScaledVector(d, 0.09).add(V(0, 0.02, 0)), back = c.clone().addScaledVector(d, -0.05);
    b.quad(back, c.clone().addScaledVector(s, 0.05).add(V(0, 0.015, 0)), tip, c.clone().addScaledVector(s, -0.05).add(V(0, 0.015, 0)), [1, 1, 1], 1, V(0, 1, 0));
  }
  return b.geo();
}
var GEO = { flower: flowerGeo, herb: herbGeo, mushroom: mushroomGeo, pebble: pebbleGeo, crystal: crystalGeo, petal: petalGeo };
function propMaterial(tint, glow) {
  return makeLitMaterial({
    side: DoubleSide,
    uniforms: { uTint: { value: new Vector3(...tint) }, uGlow: { value: glow } },
    vhead: (
      /* glsl */
      `attribute vec3 aCol; attribute float aTint; varying vec3 vCol; varying float vTnt;`
    ),
    vbody: (
      /* glsl */
      `vCol=aCol; vTnt=aTint;`
    ),
    head: (
      /* glsl */
      `uniform vec3 uTint; uniform float uGlow; varying vec3 vCol; varying float vTnt;`
    ),
    body: (
      /* glsl */
      `
      alb=vCol*mix(vec3(1.),uTint,vTnt);
      vec3 V=normalize(cameraPosition-vWorld);
      float rim=pow(1.-abs(dot(N,V)),2.);
      extra=uTint*(uGlow*(.35+.25*sin(uTime*2.+vWorld.x))+rim*.12*vTnt);
      ao=.9;
    `
    )
  });
}
var _m4 = new Matrix4();
var _q4 = new Quaternion();
var _p4 = new Vector3();
var _s4 = new Vector3();
var UP4 = new Vector3(0, 1, 0);
var Gatherables = class {
  constructor(scene, nodes, save) {
    this.nodes = nodes;
    this.save = save;
    this.grid = new Grid2D(nodes, 48);
    this.meshes = {};
    for (const [type, def] of Object.entries(GATHER)) {
      const m = new InstancedMesh(GEO[def.mesh](), propMaterial(def.tint, def.mesh === "crystal" ? 0.5 : def.mesh === "petal" ? 0.35 : 0), 160);
      m.castShadow = false;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
      this.meshes[type] = m;
    }
    const N = 200, geo = new BufferGeometry();
    this.spark = new Float32Array(N * 4);
    geo.setAttribute("position", new BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute("aSeed", new BufferAttribute(new Float32Array(N), 1));
    const mat2 = bindShared(new ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: (
        /* glsl */
        `attribute float aSeed; uniform float uTime, uScale; varying float vA; varying vec3 vW;
        void main(){ vec3 p=position+vec3(0.,.55+.08*sin(uTime*1.7+aSeed*9.),0.); vW=p;
          float tw=pow(.5+.5*sin(uTime*2.6+aSeed*31.),3.); vA=tw;
          vec4 mv=viewMatrix*vec4(p,1.); gl_PointSize=uScale*(.10+.10*tw)/max(-mv.z,.1); gl_Position=projectionMatrix*mv; }`
      ),
      fragmentShader: (
        /* glsl */
        `varying float vA; void main(){ vec2 q=abs(gl_PointCoord*2.-1.); float s=max(1.-(q.x*6.+q.y),0.)+max(1.-(q.y*6.+q.x),0.)+max(1.-length(q)*2.2,0.);
        gl_FragColor=vec4(vec3(1.,.97,.86),clamp(s,0.,1.)*vA); }`
      ),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending
    }));
    this.points = new Points(geo, mat2);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.near = [];
    this.last = [Infinity, Infinity];
  }
  setViewport(h, p11) {
    this.points.material.uniforms.uScale.value = h * p11 * 0.5;
  }
  refresh() {
    this.last = [Infinity, Infinity];
  }
  update(cam) {
    if (Math.hypot(cam.x - this.last[0], cam.z - this.last[1]) < 8) return;
    this.last = [cam.x, cam.z];
    for (const m of Object.values(this.meshes)) m.count = 0;
    const picked = this.save.data.picked, now = Date.now(), near = this.near = [];
    const pos = this.points.geometry.attributes.position, seed = this.points.geometry.attributes.aSeed;
    this.grid.query(cam.x, cam.z, RANGE2, (n) => {
      if (!isAvailable(n, picked, now)) return;
      const m = this.meshes[n.type];
      if (m.count >= 160) return;
      _q4.setFromAxisAngle(UP4, n.rot);
      m.setMatrixAt(m.count++, _m4.compose(_p4.set(n.x, n.y - 0.02, n.z), _q4, _s4.setScalar(n.s * (n.type === "crystal" ? 1.4 : 1.6))));
      near.push(n);
    });
    let k = 0;
    for (const n of near) {
      if (k >= 200) break;
      if ((n.x - cam.x) ** 2 + (n.z - cam.z) ** 2 > 45 * 45) continue;
      pos.setXYZ(k, n.x, n.y, n.z);
      seed.setX(k, (n.x * 7.13 + n.z * 3.7) % 1);
      k++;
    }
    this.points.geometry.setDrawRange(0, k);
    pos.needsUpdate = seed.needsUpdate = true;
    for (const m of Object.values(this.meshes)) m.instanceMatrix.needsUpdate = true;
  }
  // nearest available node within reach of (x,z)
  pick(x, z, reach, now = Date.now()) {
    let best = null, bd = reach * reach;
    for (const n of this.near) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd && isAvailable(n, this.save.data.picked, now)) {
        bd = d;
        best = n;
      }
    }
    return best;
  }
};
var LOOK_SENSITIVITY = 23e-4;
var LOOK_FRAME_LIMIT = 180 * LOOK_SENSITIVITY;
var Input = class {
  constructor(canvas2, { stickEl, jumpEl, atkEl, onAnyInput } = {}) {
    this.attackQueued = false;
    this.keys = /* @__PURE__ */ new Set();
    this.stick = { x: 0, y: 0 };
    this.lookX = 0;
    this.lookY = 0;
    this.jumpQueued = false;
    this.toggles = [];
    this.touchActive = false;
    const touches = /* @__PURE__ */ new Map();
    addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === "Space") this.jumpQueued = true;
      if (e.code === "KeyJ" || e.code === "KeyK") this.attackQueued = true;
      this.toggles.push(e.code);
      onAnyInput?.();
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => {
      this.keys.clear();
      this.stick.x = this.stick.y = 0;
    });
    canvas2.addEventListener("pointerdown", (e) => {
      canvas2.setPointerCapture(e.pointerId);
      const touch = e.pointerType === "touch";
      if (touch) this.touchActive = true;
      const moveSide = touch && e.clientX < innerWidth * 0.5 && ![...touches.values()].some((t) => t.kind === "move");
      touches.set(e.pointerId, { kind: moveSide ? "move" : "look", x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, touch, t0: performance.now(), travel: 0 });
      if (moveSide && stickEl) {
        stickEl.style.display = "block";
        stickEl.style.left = e.clientX + "px";
        stickEl.style.top = e.clientY + "px";
        stickEl.firstElementChild.style.transform = "";
      }
      onAnyInput?.();
    });
    canvas2.addEventListener("pointermove", (e) => {
      const t = touches.get(e.pointerId);
      if (!t) return;
      t.travel += Math.abs(e.clientX - t.x) + Math.abs(e.clientY - t.y);
      if (t.kind === "look") {
        const gain = t.touch ? clamp2(1750 / Math.max(240, innerWidth), 2.8, 5.6) : 1;
        this.lookX += clamp2(e.clientX - t.x, -48, 48) * gain * LOOK_SENSITIVITY;
        this.lookY += clamp2(e.clientY - t.y, -48, 48) * gain * LOOK_SENSITIVITY;
      } else {
        let dx = e.clientX - t.x0, dy = e.clientY - t.y0;
        const l = Math.hypot(dx, dy), R = 52;
        if (l > R) {
          dx *= R / l;
          dy *= R / l;
        }
        this.stick.x = dx / R;
        this.stick.y = -dy / R;
        if (stickEl) stickEl.firstElementChild.style.transform = `translate(${dx}px,${dy}px)`;
      }
      t.x = e.clientX;
      t.y = e.clientY;
    });
    const end = (e) => {
      const t = touches.get(e.pointerId);
      if (!t) return;
      if (t.kind === "move") {
        this.stick.x = this.stick.y = 0;
        if (stickEl) stickEl.style.display = "none";
      }
      if (!t.touch && e.type === "pointerup" && t.travel < 6 && performance.now() - t.t0 < 350) this.attackQueued = true;
      touches.delete(e.pointerId);
    };
    canvas2.addEventListener("pointerup", end);
    canvas2.addEventListener("pointercancel", end);
    jumpEl?.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.jumpQueued = true;
    });
    atkEl?.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.attackQueued = true;
    });
  }
  // forward (y) / strafe (x), magnitude <= 1
  move() {
    const k = this.keys;
    let x = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0) + this.stick.x;
    let y = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) + this.stick.y;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    return { x, y, mag: Math.min(1, l) };
  }
  run() {
    return this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || Math.hypot(this.stick.x, this.stick.y) > 0.93;
  }
  vertical() {
    const k = this.keys;
    return (k.has("Space") || k.has("KeyE") ? 1 : 0) - (k.has("KeyC") || k.has("KeyQ") ? 1 : 0);
  }
  consumeLook() {
    this.lookX = clamp2(this.lookX, -LOOK_FRAME_LIMIT, LOOK_FRAME_LIMIT);
    this.lookY = clamp2(this.lookY, -LOOK_FRAME_LIMIT, LOOK_FRAME_LIMIT);
    const r = { dx: this.lookX, dy: this.lookY };
    this.lookX = this.lookY = 0;
    return r;
  }
  consumeAttack() {
    const a = this.attackQueued;
    this.attackQueued = false;
    return a;
  }
  consumeJump() {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }
  consumeToggles() {
    const t = this.toggles;
    this.toggles = [];
    return t;
  }
};
var _n = new Vector3();
var COS_SLIDE = Math.cos(50 * Math.PI / 180);
var SWIM_IN = 1.3;
var SWIM_OUT = 1.05;
var FLOAT = 1.32;
var BOUND = 1500;
var Player = class {
  constructor() {
    this.pos = new Vector3();
    this.vel = new Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.teleportId = 0;
    this.mode = "walk";
    this.onGround = false;
    this.swimming = false;
    this.landImpact = 0;
    this.running = false;
    this.wish = new Vector2();
  }
  teleport(x, z, yaw, pitch = 0, y = null) {
    this.pos.set(x, y ?? groundAt(x, z, 1e4), z);
    this.vel.set(0, 0, 0);
    this.wish.set(0, 0);
    this.yaw = yaw;
    this.pitch = pitch;
    this.onGround = y == null;
    this.swimming = false;
    this.running = false;
    this.landImpact = 0;
    this.teleportId++;
  }
  // look is applied once per frame; physics may run in several sub-steps
  look(input) {
    const { dx, dy } = input.consumeLook();
    this.yaw -= dx;
    this.pitch = clamp2(this.pitch - dy, -1.53, 1.53);
  }
  update(dt, input) {
    if (this.mode === "fly") this.fly(dt, input);
    else this.walk(dt, input);
  }
  walk(dt, input) {
    dt = clamp2(dt, 0, 0.08);
    if (!dt) return;
    const mv = input.move(), sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    this.running = input.run() && mv.mag > 0.1;
    const sp = this.swimming ? this.running ? 3.6 : 2.6 : this.running ? PLAYER.run : PLAYER.walk;
    const tx = (-sy * mv.y + cy * mv.x) * sp, tz = (-cy * mv.y - sy * mv.x) * sp;
    const k = 1 - Math.exp(-dt * (this.swimming ? 4 : this.onGround ? 12 : 2.5));
    this.wish.x = this.vel.x + (tx - this.vel.x) * k;
    this.wish.y = this.vel.z + (tz - this.vel.z) * k;
    const jump = input.consumeJump();
    if (jump && this.onGround && !this.swimming) {
      this.vel.y = PLAYER.jump;
      this.onGround = false;
    }
    if (!this.swimming) this.vel.y -= PLAYER.gravity * dt;
    const x0 = this.pos.x, z0 = this.pos.z;
    const dx = this.wish.x * dt, dz = this.wish.y * dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz, this.vel.y * dt) / 0.18));
    for (let i = 0; i < steps; i++) this.tryMove(dx / steps, dz / steps);
    const oldFeet = this.pos.y;
    const g = groundAt(this.pos.x, this.pos.z, oldFeet), water = waterLevel(this.pos.x, this.pos.z, g);
    const depth = water - g;
    if (!this.swimming && depth > SWIM_IN && this.pos.y <= water - FLOAT + 0.05) this.swimming = true;
    if (this.swimming && depth < SWIM_OUT) this.swimming = false;
    if (this.swimming) {
      const target = water - FLOAT + Math.sin(performance.now() * 21e-4) * 0.04;
      this.vel.y += ((target - this.pos.y) * 6 - this.vel.y) * (1 - Math.exp(-dt * 8));
      if (jump) this.vel.y = 2.2;
      this.pos.y += this.vel.y * dt;
      this.pos.y = Math.max(this.pos.y, g);
      this.onGround = false;
    } else {
      this.pos.y += this.vel.y * dt;
      if (this.pos.y <= g) {
        if (!this.onGround && this.vel.y < -4) this.landImpact = Math.min(1, -this.vel.y / 16);
        this.pos.y = g;
        this.vel.y = 0;
        this.onGround = true;
      } else if (this.onGround && this.vel.y <= 0 && this.pos.y - g < 0.45) {
        this.pos.y = g;
        this.vel.y = 0;
      } else this.onGround = false;
      if (this.onGround && Math.abs(g - sample(this.pos.x, this.pos.z)) < 0.05) {
        normalAt(this.pos.x, this.pos.z, _n);
        if (_n.y < COS_SLIDE) {
          this.pos.x += _n.x * 3 * dt;
          this.pos.z += _n.z * 3 * dt;
        }
      }
    }
    const px2 = this.pos.x, pz2 = this.pos.z;
    pushOut(this.pos, PLAYER.radius, PLAYER.body);
    if (this.blocked(this.pos.x, this.pos.z)) {
      this.pos.x = px2;
      this.pos.z = pz2;
    }
    this.pos.x = clamp2(this.pos.x, -BOUND, BOUND);
    this.pos.z = clamp2(this.pos.z, -BOUND, BOUND);
    this.vel.x = (this.pos.x - x0) / dt;
    this.vel.z = (this.pos.z - z0) / dt;
  }
  blocked(x, z) {
    const g = groundAt(x, z, this.pos.y);
    if (this.swimming) {
      const w = waterLevel(x, z, g);
      if (g - w > 0.45 && g - this.pos.y > PLAYER.step + FLOAT) return true;
    } else {
      if (this.onGround && g - this.pos.y > PLAYER.step + 0.025) return true;
      if (!this.onGround && g - this.pos.y > 0.05) return true;
      if (this.onGround && g > this.pos.y + 0.025 && bodyBlockedAt(x, z, g)) return true;
    }
    return bodyBlockedAt(x, z, this.pos.y);
  }
  tryMove(dx, dz) {
    const p = this.pos;
    if (!this.blocked(p.x + dx, p.z + dz)) {
      p.x += dx;
      p.z += dz;
      return;
    }
    let moved = false;
    if (dx && !this.blocked(p.x + dx, p.z)) {
      p.x += dx;
      moved = true;
    }
    if (dz && !this.blocked(p.x, p.z + dz)) {
      p.z += dz;
      moved = true;
    }
    if (moved) return;
    const ex = p.x + dx, ez = p.z + dz, e = 1;
    const gx = sample(ex + e, ez) - sample(ex - e, ez), gz = sample(ex, ez + e) - sample(ex, ez - e), gl = Math.hypot(gx, gz);
    if (gl > 1e-3) {
      const tx = -gz / gl, tz = gx / gl, k = dx * tx + dz * tz;
      if (Math.abs(k) > 1e-4 && !this.blocked(p.x + tx * k, p.z + tz * k)) {
        p.x += tx * k;
        p.z += tz * k;
      }
    }
  }
  fly(dt, input) {
    const mv = input.move(), u = input.vertical();
    const agl = Math.max(0, this.pos.y - sample(this.pos.x, this.pos.z));
    const speed = (9 + agl * 0.55) * (input.run() ? 3 : 1);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch), sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const tx = (-sy * cp * mv.y + cy * mv.x) * speed, ty = (sp * mv.y + u) * speed, tz = (-cy * cp * mv.y - sy * mv.x) * speed;
    const a = 1 - Math.exp(-dt * 5);
    this.vel.x += (tx - this.vel.x) * a;
    this.vel.y += (ty - this.vel.y) * a;
    this.vel.z += (tz - this.vel.z) * a;
    this.pos.addScaledVector(this.vel, dt);
    this.pos.x = clamp2(this.pos.x, -4e3, 4e3);
    this.pos.z = clamp2(this.pos.z, -4e3, 4e3);
    this.pos.y = clamp2(this.pos.y, Math.max(CFG.seaLevel + 1, sample(this.pos.x, this.pos.z) + 1.4), 1500);
    input.consumeJump();
  }
  setMode(m) {
    this.mode = m;
    this.vel.set(0, 0, 0);
    this.landImpact = 0;
    this.running = false;
    if (m === "walk") {
      this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 1);
      this.onGround = true;
      this.swimming = false;
    } else this.pos.y += PLAYER.height;
  }
};
var CameraRig = class {
  constructor(camera) {
    this.cam = camera;
    this.baseFov = this.fov = camera.fov;
    this.motion = 1;
    this.mode = null;
    this.lastTeleport = -1;
    this.dipV = 0;
  }
  setBaseFov(fov2) {
    this.baseFov = fov2;
  }
  reset(p) {
    this.mode = p.mode;
    this.lastTeleport = p.teleportId;
    this.yaw = p.yaw;
    this.pitch = p.pitch;
    this.turnRate = 0;
    this.feetY = p.pos.y;
    this.speed = Math.hypot(p.vel.x, p.vel.z);
    this.phase = this.breath = this.gait = this.runBlend = 0;
    this.roll = this.lean = this.strafe = this.dip = this.dipV = 0;
    this.fov = this.baseFov;
  }
  update(dt, p) {
    const cam = this.cam;
    const cut = this.mode !== p.mode || this.lastTeleport !== p.teleportId;
    if (cut) this.reset(p);
    const previousYaw = this.yaw;
    const deltaYaw = p.yaw - previousYaw;
    const lookDecay = Math.exp(-dt * (p.mode === "fly" ? 32 : 42));
    this.yaw = p.yaw - clamp2(deltaYaw * lookDecay, -0.032, 0.032);
    this.pitch = p.pitch - clamp2((p.pitch - this.pitch) * lookDecay, -0.025, 0.025);
    const turnTarget = clamp2((this.yaw - previousYaw) / Math.max(dt, 1e-3), -5, 5);
    this.turnRate += (turnTarget - this.turnRate) * (1 - Math.exp(-dt * 14));
    const sinYaw = Math.sin(this.yaw), cosYaw = Math.cos(this.yaw);
    const strafeTarget = clamp2((p.vel.x * cosYaw - p.vel.z * sinYaw) / PLAYER.run, -1, 1);
    this.strafe += (strafeTarget - this.strafe) * (1 - Math.exp(-dt * 12));
    const strafe = this.strafe;
    const turnBank = clamp2(-this.turnRate * 7e-3, -0.03, 0.03);
    const motion = this.motion;
    if (p.mode === "fly") {
      this.roll += (turnBank - strafe * 0.037 - this.roll) * (1 - Math.exp(-dt * 7));
      cam.position.copy(p.pos);
      cam.rotation.set(this.pitch, this.yaw, this.roll * motion);
      this.setFov(dt, this.baseFov);
      return;
    }
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const acceleration = clamp2((speed - this.speed) * 2.2, -1, 1);
    this.speed += (speed - this.speed) * (1 - Math.exp(-dt * 10));
    this.lean += (acceleration * 0.023 - this.lean) * (1 - Math.exp(-dt * 9));
    this.runBlend += ((p.running && p.onGround ? 1 : 0) - this.runBlend) * (1 - Math.exp(-dt * 6));
    const grounded = p.onGround && !p.swimming;
    const gaitTarget = grounded ? clamp2((speed - 0.16) / 2.8, 0, 1) : 0;
    this.gait += (gaitTarget - this.gait) * (1 - Math.exp(-dt * (grounded ? 11 : 18)));
    if (grounded) {
      const strideLength = 3.8 + this.runBlend * 1.35;
      this.phase = (this.phase + this.speed * dt * (2 * Math.PI / strideLength)) % (2 * Math.PI);
    }
    this.breath = (this.breath + dt * (p.swimming ? 3.1 : 1.85)) % (2 * Math.PI);
    const side = Math.sin(this.phase);
    const footfall = -0.84 * Math.cos(2 * this.phase) - 0.16 * Math.cos(4 * this.phase);
    const breath = Math.sin(this.breath) * (1 - this.gait);
    const bob = footfall * (0.024 + 0.022 * this.runBlend) * this.gait + breath * (p.swimming ? 0.013 : 4e-3);
    const sway = side * (0.018 + 0.013 * this.runBlend) * this.gait - strafe * 0.02;
    const nod = Math.sin(2 * this.phase + 0.6) * (8e-3 + 9e-3 * this.runBlend) * this.gait;
    const rollTarget = turnBank - strafe * 0.024 + side * (0.012 + 9e-3 * this.runBlend) * this.gait;
    this.roll += (rollTarget - this.roll) * (1 - Math.exp(-dt * 10));
    this.dipV = Math.max(-2.5, this.dipV - p.landImpact * 2.1);
    p.landImpact = 0;
    const spring = 11;
    const springDecay = Math.exp(-spring * dt);
    const springTerm = this.dipV + spring * this.dip;
    this.dip = (this.dip + springTerm * dt) * springDecay;
    this.dipV = (this.dipV - spring * springTerm * dt) * springDecay;
    const ramp = grounded ? stairSurface(p.pos.x, p.pos.z) : null;
    const heightTarget = ramp === null ? p.pos.y : clamp2(ramp + 0.06, p.pos.y - 0.22, p.pos.y + 0.22);
    const heightDecay = Math.exp(-dt * (grounded ? 25 : 42));
    this.feetY = cut ? p.pos.y : heightTarget + (this.feetY - heightTarget) * heightDecay;
    const heightOffset = clamp2(this.feetY - p.pos.y, -0.28, 0.28);
    cam.position.set(p.pos.x, p.pos.y + PLAYER.height, p.pos.z);
    const forward = 0.06 + this.lean * 0.48 * motion;
    shiftCameraWithinWorld(
      cam,
      cosYaw * sway * motion - sinYaw * forward,
      heightOffset + (bob + this.dip) * motion,
      -sinYaw * sway * motion - cosYaw * forward
    );
    cam.rotation.set(
      clamp2(this.pitch + (nod - this.lean + this.dip * 0.28) * motion, -1.55, 1.55),
      this.yaw,
      this.roll * motion
    );
    this.setFov(dt, this.baseFov + this.runBlend * 2.4 * motion);
  }
  setFov(dt, target) {
    this.fov += (target - this.fov) * (1 - Math.exp(-dt * 6));
    if (Math.abs(this.cam.fov - this.fov) > 0.015) {
      this.cam.fov = this.fov;
      this.cam.updateProjectionMatrix();
    }
  }
};
var KEY = "sernbeld.save.v1";
var fresh = () => ({
  v: 1,
  pos: null,
  yaw: 0,
  inv: {},
  uniqueItems: [],
  nextItemSerial: 1,
  customSkills: [],
  mastery: {physicalControl: 0, magicControl: 0},
  vitals: {stamina: 30, mana: 20, maxMana: 30},
  waypoints: [],
  picked: {},
  playtime: 0,
  met: {},
  clock: { day: 1, hour: 8 },
  money: 4,
  guild: { registered: false, merit: 0, done: 0 },
  requests: [],
  board: null,
  rival: { done: 2, day: 1 },
  settings: { motion: 1 },
  intro: false
});
var Save = {
  data: fresh(),
  load() {
    try {
      const s = localStorage.getItem(KEY);
      if (s) {
        const d = JSON.parse(s);
        if (d.v === 1) this.data = { ...fresh(), ...d };
      }
    } catch {
    }
    return this.data;
  },
  write() {
    try {
      this.beforeWrite?.();
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
    }
  },
  reset() {
    this.data = fresh();
    try {
      localStorage.removeItem(KEY);
    } catch {
    }
  }
};
var Wallet = {
  get() {
    return Save.data.money;
  },
  add(n) {
    Save.data.money += n;
    return Save.data.money;
  },
  spend(n) {
    if (Save.data.money < n) return false;
    Save.data.money -= n;
    return true;
  }
};
var GameEvents = createGameEvents();
var WorldEntities = createEntityRegistry();
var Inventory = createInventory(Save, GameEvents);
var SkillLibrary = createSkillLibrary(Save, GameEvents);
var WorldRegions = createRegionLifecycle({registry: WorldEntities, save: Save, events: GameEvents});
Save.beforeWrite = () => WorldRegions.checkpointActive();
var DISCOVER_R = 7;
var REACH = 2.6;
var Explore = class {
  constructor({ region, player, gatherables, waypoints, ui, teleport }) {
    Object.assign(this, { region, player, gatherables, waypoints, ui, teleport });
    for (const n of Save.data.waypoints) waypoints.userData.setOn(n, true);
    this.candidate = null;
    this.providers = [];
  }
  update() {
    if (!WorldRegions.isActive(this.region.id)) { this.candidate = null; this.ui.setPrompt(null); return; }
    const p = this.player.pos;
    for (const w of this.region.waypoints) {
      if (Save.data.waypoints.includes(w.name)) continue;
      if ((w.x - p.x) ** 2 + (w.z - p.z) ** 2 < DISCOVER_R ** 2 && Math.abs(p.y - this.waypoints.userData.list.find((v) => v.name === w.name).y) < 6) {
        Save.data.waypoints.push(w.name);
        this.waypoints.userData.setOn(w.name, true);
        this.ui.discover(w.name);
        Save.write();
      }
    }
    let c = null;
    if (this.player.mode === "walk" && !this.player.swimming) {
      const n = this.gatherables.pick(p.x, p.z, REACH);
      if (n) c = { dist: Math.hypot(n.x - p.x, n.z - p.z), verb: "\uC90D\uAE30", label: this.itemName(n), act: () => this.gather(n) };
      else {
        const w = this.waypoints.userData.list.find((v) => v.on && (v.x - p.x) ** 2 + (v.z - p.z) ** 2 < 9);
        if (w) c = { dist: 3, verb: "\uC774\uB3D9\uD558\uAE30", label: w.name, act: () => this.ui.toggleTravel() };
      }
      for (const prov of this.providers) {
        const o = prov(this.player);
        if (o && (!c || o.dist < c.dist + 0.6)) c = o;
      }
    }
    this.candidate = c;
    this.ui.setPrompt(c);
  }
  interact() {
    if (WorldRegions.isActive(this.region.id)) this.candidate?.act();
  }
  itemName(n) {
    return this.ui.itemName(GATHER[n.type].item);
  }
  gather(n) {
    const def = GATHER[n.type], amount = n.type.startsWith("flower") ? 2 : 1;
    Save.data.picked[n.id] = Date.now();
    const total = Inventory.add(def.item, amount);
    this.gatherables.refresh();
    this.ui.pickup(def.item, amount, total);
    Save.write();
    GameEvents.emit('world.gathered', {nodeId: n.id, itemId: def.item, quantity: amount});
  }
  travelTo(name) {
    const w = this.waypoints.userData.list.find((v) => v.name === name);
    if (!w) return;
    this.teleport({ x: w.x + 3, z: w.z + 3, lookAt: [w.x, w.z] });
  }
};
var $ = (id) => document.getElementById(id);
var Hud = class {
  constructor() {
    this.el = { perf: $("perf"), fps: $("fps"), tris: $("tris"), calls: $("calls"), pos: $("pos"), hint: $("hint"), jump: $("jump"), stick: $("stick") };
    this.el.perf.addEventListener("click", () => this.el.perf.classList.toggle("min"));
    if (IS_MOBILE) this.el.jump.hidden = false;
    this.frames = 0;
    this.acc = 0;
  }
  progress(p, text) {
    $("loadBar").style.width = Math.round(p * 100) + "%";
    if (text) $("loadText").textContent = text;
  }
  ready(region) {
    $("loading").classList.add("done");
    $("toastTitle").textContent = region.name;
    $("toastSub").textContent = region.subtitle;
    const t = $("toast");
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 3800);
    this.el.hint.textContent = IS_MOBILE ? "\uC67C\uCABD\uC744 \uB04C\uC5B4 \uAC77\uAE30, \uC624\uB978\uCABD\uC744 \uB04C\uC5B4 \uB458\uB7EC\uBCF4\uAE30. \uBC18\uC9DD\uC774\uB294 \uAC83\uC740 \uC8FC\uC6B8 \uC218 \uC788\uC5B4\uC694" : "\uB4DC\uB798\uADF8\uB85C \uB458\uB7EC\uBCF4\uAE30 \xB7 \uD074\uB9AD \uACF5\uACA9 \xB7 WASD \uAC77\uAE30 \xB7 Shift \uB2EC\uB9AC\uAE30 \xB7 Space \uC810\uD504 \xB7 E \uC0C1\uD638\uC791\uC6A9 \xB7 I \uAC00\uBC29 \xB7 M \uC774\uB3D9";
    this.hintTimer = setTimeout(() => this.hideHint(), 8e3);
  }
  hideHint() {
    clearTimeout(this.hintTimer);
    this.el.hint.classList.add("gone");
  }
  error(msg) {
    const e = $("err");
    e.textContent = msg;
    e.style.display = "block";
  }
  tick(dt, info, p) {
    this.frames++;
    this.acc += dt;
    if (this.acc < 0.6) return;
    this.el.fps.textContent = Math.round(this.frames / this.acc) + " fps";
    this.el.tris.textContent = Math.round(info.triangles / 1e3) + "K \uC0BC\uAC01\uD615";
    this.el.calls.textContent = info.calls + " \uB4DC\uB85C\uC6B0\uCF5C";
    this.el.pos.textContent = `${Math.round(p.x)}, ${Math.round(p.z)} \xB7 ${Math.round(p.y)}m`;
    this.frames = 0;
    this.acc = 0;
  }
};
var RARITY = {
  common: { name: "\uC77C\uBC18", color: "#cfd8d3", order: 0 },
  uncommon: { name: "\uACE0\uAE09", color: "#86d68f", order: 1 },
  rare: { name: "\uD76C\uADC0", color: "#74b9ff", order: 2 },
  epic: { name: "\uC601\uC6C5", color: "#c592ff", order: 3 },
  legendary: { name: "\uC804\uC124", color: "#ffc664", order: 4 }
};
var ITEMS = {
  wind_blossom: { name: "\uBC14\uB78C\uAF43", value: 1, kind: "material", rarity: "common", icon: { shape: "flower", color: "#f5a6c9" }, desc: "\uC5D0\uD14C\uB974 \uB4E4\uD310 \uC5B4\uB514\uC11C\uB098 \uD53C\uB294 \uBD84\uD64D \uAF43. \uBC14\uB78C\uC774 \uC9C0\uB098\uAC00\uBA74 \uD5A5\uC774 \uC9D9\uC5B4\uC9C4\uB2E4." },
  mist_star: { name: "\uBCC4\uC548\uAC1C\uAF43", value: 2, kind: "material", rarity: "uncommon", icon: { shape: "flower", color: "#b9a4f4" }, desc: "\uBCF4\uB78F\uBE5B \uAF43\uC78E \uB05D\uC5D0 \uC774\uC2AC\uC774 \uB9FA\uD600 \uBCC4\uCC98\uB7FC \uBC18\uC9DD\uC778\uB2E4." },
  sunpetal: { name: "\uD587\uC0B4\uAF43", value: 1, kind: "material", rarity: "common", icon: { shape: "flower", color: "#ffe08a" }, desc: "\uD574\uAC00 \uB4DC\uB294 \uCABD\uC73C\uB85C\uB9CC \uACE0\uAC1C\uB97C \uB4DC\uB294 \uB178\uB780 \uAF43." },
  field_herb: { name: "\uB4E4\uD310 \uC57D\uCD08", value: 1, kind: "material", rarity: "common", icon: { shape: "leaf", color: "#8fd06a" }, desc: "\uC78E\uC744 \uBE44\uBE44\uBA74 \uC309\uC2F8\uB984\uD55C \uD5A5\uC774 \uB09C\uB2E4. \uC0C1\uCC98\uB97C \uB36E\uB294 \uB370 \uC4F4\uB2E4." },
  pine_cap: { name: "\uC194\uADF8\uB298 \uBC84\uC12F", value: 2, kind: "material", rarity: "uncommon", icon: { shape: "mushroom", color: "#d98c5c" }, desc: "\uCE68\uC5FD\uC218 \uADF8\uB298\uC5D0\uC11C\uB9CC \uC790\uB780\uB2E4. \uAC13\uC774 \uB2E8\uB2E8\uD560\uC218\uB85D \uB9DB\uC774 \uAE4A\uB2E4." },
  river_pebble: { name: "\uBB3C\uACB0 \uC870\uC57D\uB3CC", value: 1, kind: "material", rarity: "common", icon: { shape: "pebble", color: "#c2beb0" }, desc: "\uBB3C\uC0B4\uC5D0 \uB2F3\uC544 \uC190\uC5D0 \uAF2D \uB9DE\uB294 \uB3CC. \uC544\uC774\uB4E4\uC774 \uBB3C\uC218\uC81C\uBE44\uB97C \uB72C\uB2E4." },
  clear_crystal: { name: "\uB9D1\uC740 \uACB0\uC815", value: 6, kind: "material", rarity: "rare", icon: { shape: "crystal", color: "#9fe8ff" }, desc: "\uC808\uBCBD \uD2C8\uC5D0\uC11C \uC790\uB77C\uB294 \uACB0\uC815. \uC548\uCABD\uC5D0 \uC544\uC8FC \uC791\uC740 \uBC14\uB78C\uC774 \uAC07\uD600 \uC788\uB2E4." },
  aether_petal: { name: "\uC5D0\uD14C\uB974 \uAF43\uC78E", value: 15, kind: "material", rarity: "epic", icon: { shape: "petal", color: "#ffc4de" }, desc: "\uB300\uC218\uC5D0\uC11C \uB5A8\uC5B4\uC9C4 \uAF43\uC78E. \uBA70\uCE60\uC774 \uC9C0\uB098\uB3C4 \uC2DC\uB4E4\uC9C0 \uC54A\uB294\uB2E4." },
  wool: { name: "\uC591\uD138", value: 1, kind: "material", rarity: "common", icon: { shape: "wool", color: "#f3ecdc" }, desc: "\uC19C\uD138\uC591\uC5D0\uAC8C\uC11C \uC5BB\uC740 \uD138. \uBC14\uB2F7\uBC14\uB78C\uC5D0\uB3C4 \uC816\uC9C0 \uC54A\uB294\uB2E4." },
  mutton: { name: "\uC591\uACE0\uAE30", value: 1, kind: "material", rarity: "common", icon: { shape: "meat", color: "#d9826e" }, desc: "\uC5EC\uAD00\uC5D0\uC11C \uC5B8\uC81C\uB098 \uC0AC\uB4E4\uC778\uB2E4." },
  dog_hide: { name: "\uAC08\uAE30 \uAC00\uC8FD", value: 3, kind: "material", rarity: "uncommon", icon: { shape: "hide", color: "#b39470" }, desc: "\uAC08\uAE30\uB4E4\uAC1C\uC758 \uAC70\uCE5C \uAC00\uC8FD. \uB300\uC7A5\uAC04\uC5D0\uC11C \uC190\uC7A1\uC774\uB97C \uAC10\uB294 \uB370 \uC4F4\uB2E4." },
  dog_fang: { name: "\uB4E4\uAC1C \uC1A1\uACF3\uB2C8", value: 4, kind: "material", rarity: "rare", icon: { shape: "fang", color: "#f2ead8" }, desc: "\uBB34\uB9AC\uC758 \uC6B0\uB450\uBA38\uB9AC\uC77C\uC218\uB85D \uAE38\uB2E4. \uBD80\uC801\uC73C\uB85C \uC4F0\uB294 \uC0AC\uB78C\uB3C4 \uC788\uB2E4." },
  // weapons: dmg per hit, rate = swings per second, reach in metres
  apprentice_dagger: { name: "\uACAC\uC2B5 \uB2E8\uAC80", value: 8, price: 8, kind: "weapon", model: "dagger", rarity: "common", dmg: 9, rate: 2.4, reach: 1.7, icon: { shape: "dagger", color: "#cfd6dc" }, desc: "\uAC00\uBCCD\uACE0 \uBE60\uB974\uB2E4. \uC591\uC190\uC5D0 \uD558\uB098\uC529 \uC950\uBA74 \uC274 \uD2C8\uC774 \uC5C6\uB2E4." },
  apprentice_sword: { name: "\uACAC\uC2B5 \uAC80", value: 15, price: 15, kind: "weapon", model: "sword", rarity: "common", dmg: 14, rate: 1.6, reach: 2.1, icon: { shape: "sword", color: "#d8dee4" }, desc: "\uC870\uD569 \uACAC\uC2B5\uB4E4\uC774 \uCC98\uC74C \uB4DC\uB294 \uAC80. \uACE0\uB78C\uC758 \uB9DD\uCE58 \uC790\uAD6D\uC774 \uB0A8\uC544 \uC788\uB2E4." },
  woodcutter_axe: { name: "\uB098\uBB34\uAFBC \uC190\uB3C4\uB07C", value: 12, price: 12, kind: "weapon", model: "axe", rarity: "common", dmg: 18, rate: 1.1, reach: 1.9, icon: { shape: "axe", color: "#c9b08a" }, desc: "\uBB34\uAC81\uACE0 \uB290\uB9AC\uC9C0\uB9CC \uD55C \uBC88 \uB4E4\uC5B4\uAC00\uBA74 \uAE4A\uB2E4." }
};
var FISTS = { name: "\uB9E8\uC190", dmg: 4, rate: 2.2, reach: 1.4, model: null };
var cache = /* @__PURE__ */ new Map();
var shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, n >> 8 & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return `rgb(${c.join(",")})`;
};
var DRAW = {
  flower(g, c) {
    g.strokeStyle = "#5f9a4c";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(32, 58);
    g.quadraticCurveTo(30, 44, 32, 34);
    g.stroke();
    g.fillStyle = "#76b25a";
    g.beginPath();
    g.ellipse(25, 47, 8, 3.5, -0.6, 0, 7);
    g.fill();
    for (let p = 0; p < 5; p++) {
      const a = p / 5 * Math.PI * 2 - Math.PI / 2;
      g.fillStyle = p % 2 ? c : shade(c, 0.9);
      g.beginPath();
      g.ellipse(32 + Math.cos(a) * 9, 24 + Math.sin(a) * 9, 9, 6, a, 0, 7);
      g.fill();
    }
    g.fillStyle = "#ffe9a8";
    g.beginPath();
    g.arc(32, 24, 4.5, 0, 7);
    g.fill();
  },
  leaf(g, c) {
    for (const [a, s] of [[-0.7, 1], [0.6, 0.9], [-0.05, 1.15]]) {
      g.save();
      g.translate(32, 54);
      g.rotate(a);
      g.fillStyle = s > 1 ? c : shade(c, 0.85);
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(14 * s, -22 * s, 0, -42 * s);
      g.quadraticCurveTo(-14 * s, -22 * s, 0, 0);
      g.fill();
      g.strokeStyle = shade(c, 0.65);
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, -2);
      g.lineTo(0, -38 * s);
      g.stroke();
      g.restore();
    }
  },
  mushroom(g, c) {
    g.fillStyle = "#efe3cc";
    g.beginPath();
    g.moveTo(27, 56);
    g.quadraticCurveTo(26, 40, 29, 32);
    g.lineTo(37, 32);
    g.quadraticCurveTo(40, 42, 38, 56);
    g.closePath();
    g.fill();
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(32, 30, 20, 13, 0, Math.PI, 0);
    g.closePath();
    g.fill();
    g.fillStyle = "rgba(255,245,220,.75)";
    for (const [x, y, r] of [[24, 24, 2.6], [36, 21, 2.2], [41, 27, 1.8]]) {
      g.beginPath();
      g.arc(x, y, r, 0, 7);
      g.fill();
    }
  },
  pebble(g, c) {
    g.fillStyle = shade(c, 0.8);
    g.beginPath();
    g.ellipse(36, 42, 18, 11, 0.2, 0, 7);
    g.fill();
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(27, 34, 15, 10, -0.3, 0, 7);
    g.fill();
    g.fillStyle = "rgba(255,255,255,.55)";
    g.beginPath();
    g.ellipse(23, 30, 6, 3, -0.3, 0, 7);
    g.fill();
  },
  crystal(g, c) {
    for (const [x, h, w, a] of [[22, 30, 7, -0.25], [40, 26, 7, 0.3], [31, 40, 9, 0]]) {
      g.save();
      g.translate(x, 56);
      g.rotate(a);
      g.fillStyle = shade(c, 0.75);
      g.beginPath();
      g.moveTo(-w, 0);
      g.lineTo(-w, -h);
      g.lineTo(0, -h - w * 1.4);
      g.lineTo(0, 0);
      g.fill();
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -h - w * 1.4);
      g.lineTo(w, -h);
      g.lineTo(w, 0);
      g.fill();
      g.restore();
    }
  },
  petal(g, c) {
    g.save();
    g.translate(32, 34);
    g.rotate(-0.5);
    const gr = g.createLinearGradient(0, -22, 0, 22);
    gr.addColorStop(0, "#fff3f8");
    gr.addColorStop(1, c);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, 22);
    g.bezierCurveTo(-22, 6, -12, -20, -3, -22);
    g.lineTo(0, -15);
    g.lineTo(3, -22);
    g.bezierCurveTo(12, -20, 22, 6, 0, 22);
    g.fill();
    g.restore();
    g.fillStyle = "rgba(255,255,255,.9)";
    g.beginPath();
    g.arc(46, 16, 2, 0, 7);
    g.fill();
    g.beginPath();
    g.arc(17, 48, 1.5, 0, 7);
    g.fill();
  }
};
Object.assign(DRAW, {
  wool(g, c) {
    g.fillStyle = c;
    for (const [x, y, r] of [[24, 36, 13], [38, 32, 14], [32, 24, 11], [44, 42, 10], [22, 46, 9]]) {
      g.beginPath();
      g.arc(x, y, r, 0, 7);
      g.fill();
    }
    g.fillStyle = "rgba(0,0,0,.08)";
    g.beginPath();
    g.arc(40, 44, 9, 0, 7);
    g.fill();
  },
  meat(g, c) {
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(30, 34, 18, 13, -0.4, 0, 7);
    g.fill();
    g.fillStyle = "#f4e6d8";
    g.beginPath();
    g.ellipse(45, 46, 6, 4, -0.4, 0, 7);
    g.fill();
    g.fillStyle = "rgba(255,255,255,.35)";
    g.beginPath();
    g.ellipse(26, 30, 7, 3, -0.4, 0, 7);
    g.fill();
  },
  hide(g, c) {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(14, 18);
    g.quadraticCurveTo(32, 10, 50, 18);
    g.lineTo(54, 46);
    g.quadraticCurveTo(32, 56, 10, 46);
    g.closePath();
    g.fill();
    g.strokeStyle = shade(c, 0.7);
    g.lineWidth = 2;
    g.stroke();
  },
  fang(g, c) {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(24, 12);
    g.quadraticCurveTo(44, 16, 42, 30);
    g.quadraticCurveTo(38, 46, 30, 56);
    g.quadraticCurveTo(28, 34, 22, 20);
    g.closePath();
    g.fill();
    g.strokeStyle = shade(c, 0.7);
    g.lineWidth = 1.5;
    g.stroke();
  },
  dagger(g, c) {
    g.save();
    g.translate(32, 32);
    g.rotate(-0.78);
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(0, -26);
    g.lineTo(5, -4);
    g.lineTo(-5, -4);
    g.fill();
    g.fillStyle = "#8a6b4a";
    g.fillRect(-9, -4, 18, 4);
    g.fillStyle = "#5a4433";
    g.fillRect(-3, 0, 6, 16);
    g.restore();
  },
  sword(g, c) {
    g.save();
    g.translate(32, 32);
    g.rotate(-0.78);
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(0, -30);
    g.lineTo(4, -24);
    g.lineTo(4, 4);
    g.lineTo(-4, 4);
    g.lineTo(-4, -24);
    g.fill();
    g.fillStyle = "#9a7a4e";
    g.fillRect(-11, 4, 22, 4);
    g.fillStyle = "#5a4433";
    g.fillRect(-3, 8, 6, 14);
    g.restore();
  },
  axe(g, c) {
    g.save();
    g.translate(32, 32);
    g.rotate(-0.6);
    g.fillStyle = "#6a5038";
    g.fillRect(-2.5, -24, 5, 50);
    g.fillStyle = "#c8ccd0";
    g.beginPath();
    g.moveTo(2, -22);
    g.quadraticCurveTo(22, -24, 20, -8);
    g.quadraticCurveTo(12, -10, 2, -8);
    g.fill();
    g.restore();
  }
});
function iconURL(id) {
  if (cache.has(id)) return cache.get(id);
  const it = ITEMS[id], cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d");
  (DRAW[it.icon.shape] || DRAW.pebble)(g, it.icon.color);
  const url = cv.toDataURL();
  cache.set(id, url);
  return url;
}
var REQUEST_TEMPLATES = [
  { id: "herb_monastery", title: "\uC218\uB3C4\uC6D0 \uC0C1\uCC98\uC57D \uC7AC\uB8CC", giver: "\uC5D0\uB2E4 \uC218\uB140", item: "field_herb", qty: [3, 5], risk: 1, desc: "\uB4E4\uD310 \uC57D\uCD08\uAC00 \uB5A8\uC5B4\uC84C\uC2B5\uB2C8\uB2E4. \uD759\uC740 \uD138\uC5B4\uC11C \uC8FC\uC138\uC694." },
  { id: "mush_inn", title: "\uC5EC\uAD00 \uC800\uB141 \uAD6D\uAC70\uB9AC", giver: "\uBBF8\uC5D8", item: "pine_cap", qty: [2, 4], risk: 1, desc: "\uCE68\uC5FD\uC218 \uADF8\uB298\uC5D0\uC11C \uB098\uB294 \uBC84\uC12F\uC774\uC694. \uB3C5\uBC84\uC12F \uC11E\uC774\uBA74 \uB3C8 \uBABB \uC918\uC694." },
  { id: "blossom_market", title: "\uC7A5\uB0A0 \uAF43\uB2E4\uBC1C", giver: "\uD56D\uAD6C \uC0C1\uD68C", item: "wind_blossom", qty: [6, 10], risk: 1, desc: "\uC5D0\uD14C\uB974 \uB4E4\uD310 \uBC14\uB78C\uAF43. \uC904\uAE30\uC9F8\uB85C." },
  { id: "dye_lilac", title: "\uBCF4\uB77C \uC5FC\uB8CC \uC6D0\uB8CC", giver: "\uD56D\uAD6C \uC0C1\uD68C", item: "mist_star", qty: [4, 6], risk: 1, desc: "\uBCC4\uC548\uAC1C\uAF43\uB9CC \uC4F0\uC785\uB2C8\uB2E4. \uC2DC\uB4E4\uAE30 \uC804\uC5D0." },
  { id: "sun_tea", title: "\uD587\uC0B4\uAF43 \uCC28", giver: "\uB178 \uB8E8\uD39C", item: "sunpetal", qty: [5, 8], risk: 1, desc: "\uD48D\uCC28 \uC9D1 \uD560\uBA48\uC774 \uCC3E\uB294 \uCC28 \uC7AC\uB8CC." },
  { id: "pebble_wall", title: "\uBD80\uB463\uAC00 \uBC30\uC218\uB85C \uC790\uAC08", giver: "\uBE0C\uB780", item: "river_pebble", qty: [5, 8], risk: 1, desc: "\uBB3C\uAE38\uC5D0 \uAE54 \uB9E4\uB048\uD55C \uB3CC. \uD574\uBCC0\uC774\uB098 \uAC15\uAC00." },
  { id: "crystal_survey", title: "\uC808\uBCBD \uACB0\uC815 \uD45C\uBCF8", giver: "\uCE74\uC2A4\uD154 \uBC15\uC0AC", item: "clear_crystal", qty: [1, 2], risk: 2, desc: "\uC808\uBCBD \uBC11\uC5D0\uC11C \uC790\uB77C\uB294 \uACB0\uC815. \uB099\uC11D \uC870\uC2EC. \uAE68\uC9C4 \uAC74 \uC548 \uBC1B\uC2B5\uB2C8\uB2E4." },
  { id: "aether_sample", title: "\uB300\uC218 \uAF43\uC78E \uD45C\uBCF8", giver: "\uCE74\uC2A4\uD154 \uBC15\uC0AC", item: "aether_petal", qty: [1, 1], risk: 3, desc: "\uC5D0\uD14C\uB974 \uB300\uC218 \uC544\uB798. \uD559\uD68C\uC5D0 \uC815\uC2DD \uD45C\uBCF8\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uB4E4\uAC1C \uCD9C\uBAB0 \uC9C0\uC5ED." },
];
var OBSOLETE_ANIMAL_TEMPLATES = new Set(["hunt_dogs", "wool_bundle", "hide_smith"]);
function discardLegacyAnimalTasks(data) {
  const obsolete = q => !!q?.hunt || OBSOLETE_ANIMAL_TEMPLATES.has(q?.tpl) ||
    q?.item === "wool" || q?.item === "dog_hide";
  let changed = false;
  if (Array.isArray(data.requests)) {
    const kept = data.requests.filter(q => !obsolete(q));
    if (kept.length !== data.requests.length) { data.requests = kept; changed = true; }
  }
  if (Array.isArray(data.board?.list)) {
    const kept = data.board.list.filter(q => !obsolete(q));
    if (kept.length !== data.board.list.length) { data.board.list = kept; changed = true; }
  }
  if (data.regionEntities && typeof data.regionEntities === "object" && !Array.isArray(data.regionEntities)) {
    for (const region of Object.keys(data.regionEntities)) {
      const states = data.regionEntities[region];
      if (!states || typeof states !== "object" || Array.isArray(states)) continue;
      for (const id of Object.keys(states)) {
        if (id.startsWith("wildlife:")) { delete states[id]; changed = true; }
      }
      if (!Object.keys(states).length) delete data.regionEntities[region];
    }
    if (!Object.keys(data.regionEntities).length) delete data.regionEntities;
  }
  return changed;
}
var RISK = { 1: { name: "\uB0AE\uC74C", mult: 1 }, 2: { name: "\uBCF4\uD1B5", mult: 1.6 }, 3: { name: "\uB192\uC74C", mult: 2.4 } };
var el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
var $2 = (id) => document.getElementById(id);
var GameUI = class {
  constructor() {
    this.prompt = $2("prompt");
    this.toasts = $2("toasts");
    this.banner = $2("banner");
    this.bag = $2("bag");
    this.travel = $2("travel");
    this.boardP = $2("board");
    this.prompt.addEventListener("click", () => this.onInteract?.());
    $2("bagBtn").addEventListener("click", () => this.toggleBag());
    $2("tpBtn").addEventListener("click", () => this.toggleTravel());
    for (const p of [this.bag, this.travel, this.boardP]) p.querySelector(".close").addEventListener("click", () => this.close(p));
    this.selected = null;
    for (const button of document.querySelectorAll("[data-ui-panel]")) button.addEventListener("click", () => {
      const target = button.dataset.uiPanel;
      if (target === "bag" && this.bag.hidden) this.toggleBag();
      else if (target === "travel" && this.travel.hidden) this.toggleTravel();
    });
    for (const button of this.bag.querySelectorAll("[data-ui-filter]")) button.addEventListener("click", () => {
      this.bag.dataset.filter = button.dataset.uiFilter;
      for (const other of this.bag.querySelectorAll("[data-ui-filter]")) other.setAttribute("aria-pressed", String(other === button));
      this.selected = null;
      this.renderBag();
    });
  }
  // --- prompt ---------------------------------------------------------------
  setPrompt(c) {
    if (!c) {
      this.prompt.hidden = true;
      this.promptKey = null;
      return;
    }
    const key2 = c.verb + c.label;
    if (key2 === this.promptKey) return;
    this.promptKey = key2;
    this.prompt.hidden = false;
    this.prompt.innerHTML = `${IS_MOBILE ? "" : "<kbd>E</kbd>"}<span class="verb">${c.verb}</span><span class="what">${c.label}</span>`;
  }
  // --- toasts ---------------------------------------------------------------
  pickup(id, n, total) {
    const it = ITEMS[id], t = el("div", "toast-item");
    t.style.setProperty("--rar", RARITY[it.rarity].color);
    t.innerHTML = `<img alt="" src="${iconURL(id)}"><span><b>${it.name}</b> \xD7${n}</span><em>${total}</em>`;
    this.toasts.prepend(t);
    while (this.toasts.children.length > 4) this.toasts.lastChild.remove();
    setTimeout(() => t.classList.add("out"), 2200);
    setTimeout(() => t.remove(), 2900);
    if (!this.bag.hidden) this.renderBag();
  }
  discover(name) {
    this.banner.innerHTML = `<small>\uC6E8\uC774\uD3EC\uC778\uD2B8 \uD65C\uC131\uD654</small><b>${name}</b>`;
    this.banner.classList.remove("show");
    void this.banner.offsetWidth;
    this.banner.classList.add("show");
  }
  // --- panels ---------------------------------------------------------------
  close(p) {
    p.hidden = true;
  }
  toggleBag() {
    this.travel.hidden = true;
    this.boardP.hidden = true;
    this.bag.hidden = !this.bag.hidden;
    if (!this.bag.hidden) this.renderBag();
  }
  toggleTravel() {
    this.bag.hidden = true;
    this.boardP.hidden = true;
    this.travel.hidden = !this.travel.hidden;
    if (!this.travel.hidden) this.renderTravel?.();
  }
  renderBag() {
    $2("bagMoney").textContent = `\uC740\uD654 ${Wallet.get()}`;
    const grid2 = this.bag.querySelector(".grid"), info = this.bag.querySelector(".info");
    const items = Inventory.entries().filter(([id]) => (this.bag.dataset.filter || "all") === "all" || ITEMS[id]?.kind === this.bag.dataset.filter).sort((a, b) => RARITY[ITEMS[b[0]].rarity].order - RARITY[ITEMS[a[0]].rarity].order || ITEMS[a[0]].name.localeCompare(ITEMS[b[0]].name));
    if (this.selected && !items.some(([id]) => id === this.selected)) this.selected = null;
    grid2.replaceChildren(...items.map(([id, n]) => {
      const b = el("button", "slot");
      b.type = "button";
      b.style.setProperty("--rar", RARITY[ITEMS[id].rarity].color);
      b.setAttribute("aria-pressed", String(id === this.selected));
      b.innerHTML = `<img alt="${ITEMS[id].name}" src="${iconURL(id)}"><span>${n}</span>`;
      b.addEventListener("click", () => {
        this.selected = id;
        this.renderBag();
      });
      return b;
    }));
    for (let k = items.length; k < Math.max(12, Math.ceil(items.length / 4) * 4); k++) grid2.append(el("div", "slot empty"));
    const it = this.selected && ITEMS[this.selected];
    const stats = it?.kind === "weapon" ? ` \xB7 \uC704\uB825 ${it.dmg} \xB7 \uBE60\uB974\uAE30 ${it.rate} \xB7 \uAC70\uB9AC ${it.reach}m` : "";
    info.innerHTML = it ? `<h3 style="--rar:${RARITY[it.rarity].color}">${it.name}</h3><p class="rar" style="--rar:${RARITY[it.rarity].color}">${RARITY[it.rarity].name} \xB7 ${it.kind === "weapon" ? "\uBB34\uAE30" : "\uC7AC\uB8CC"}${stats}</p><p>${it.desc}</p>` : items.length ? '<p class="muted">\uBB3C\uAC74\uC744 \uB20C\uB7EC \uC0B4\uD3B4\uBCF4\uC138\uC694.</p>' : '<p class="muted">\uC544\uC9C1 \uBE44\uC5B4 \uC788\uC5B4\uC694. \uBC18\uC9DD\uC774\uB294 \uAC83\uC744 \uCC3E\uC544 \uC8FC\uC6CC \uBCF4\uC138\uC694.</p>';
    if (it) {
      const heading = info.querySelector("h3"), rarity = info.querySelector(".rar");
      if (heading && rarity) {
        const hero = el("div", "ui-item-hero");
        const picture = document.createElement("img");
        picture.src = iconURL(this.selected);
        picture.alt = "";
        const meta = el("div", "ui-item-hero-text");
        meta.append(heading, rarity);
        hero.append(picture, meta);
        info.prepend(hero);
      }
    }
    if (it?.kind === "weapon" && Inventory.count(this.selected) && this.onEquip) {
      const E = Save.data.equip ?? {}, row = el("div", "equip"), id = this.selected;
      for (const [hand, label] of [["right", "\uC624\uB978\uC190"], ["left", "\uC67C\uC190"]]) {
        const b = el("button", "", label);
        b.type = "button";
        b.setAttribute("aria-pressed", String(E[hand] === id));
        b.addEventListener("click", () => {
          this.onEquip(id, hand);
          this.renderBag();
        });
        row.append(b);
      }
      if (E.right === id || E.left === id) {
        const b = el("button", "", "\uB0B4\uB824\uB193\uAE30");
        b.type = "button";
        b.addEventListener("click", () => {
          this.onUnequip(id);
          this.renderBag();
        });
        row.append(b);
      }
      info.append(row);
    }
  }
  itemName(id) {
    return ITEMS[id].name;
  }
  // --- people -----------------------------------------------------------------
  say(def, line, options = []) {
    const sp = $2("speech");
    $2("speechName").textContent = def.name;
    $2("speechTitle").textContent = def.title ?? "";
    $2("speechLine").textContent = line;
    const box3 = $2("speechOpts");
    box3.replaceChildren(...options.map((o) => {
      const b = el("button", "", o.label);
      b.type = "button";
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        sp.hidden = true;
        o.act();
      });
      return b;
    }));
    sp.hidden = false;
    sp.onclick = () => {
      sp.hidden = true;
    };
    clearTimeout(this.sayT);
    this.sayT = setTimeout(() => {
      sp.hidden = true;
    }, (options.length ? 9e3 : 2600) + line.length * 70);
  }
  openBoard(list, accept) {
    this.bag.hidden = true;
    this.travel.hidden = true;
    this.boardP.hidden = false;
    $2("boardMoney").textContent = `\uC740\uD654 ${Wallet.get()}`;
    const mine = new Set(this.activeIds?.() ?? []);
    this.boardP.querySelector(".body").replaceChildren(...list.map((q) => {
      const it = ITEMS[q.item], ico = q.item, d = el("article", "req"), rk = ["", "#9fd8a4", "#ffd27a", "#ff9a8a"][q.risk];
      d.innerHTML = `<h3>${q.title}<span class="risk" style="--rk:${rk}">\uC704\uD5D8 ${RISK[q.risk].name} ${"\u25C6".repeat(q.risk)}${"\u25C7".repeat(3 - q.risk)}</span></h3>
        <p>${q.giver} \u2014 ${q.desc}</p>
        <div class="row"><img alt="" src="${iconURL(ico)}">${it.name} \xD7${q.qty}<span class="pay">\uC740\uD654 ${q.reward}</span></div>`;
      const b = el("button", "", mine.has(q.id) ? "\uBC1B\uC740 \uC758\uB8B0" : "\uBC1B\uAE30");
      b.type = "button";
      b.disabled = mine.has(q.id) || mine.size >= 3;
      b.addEventListener("click", () => accept(q));
      d.querySelector(".row").append(b);
      return d;
    }), el("p", "muted", "\uC758\uB8B0\uB294 \uB3D9\uC2DC\uC5D0 \uC14B\uAE4C\uC9C0. \uBCF4\uC218\uB294 \uC138\uB77C\uC5D0\uAC8C \uBCF4\uACE0\uD558\uBA74 \uBC1B\uC2B5\uB2C8\uB2E4. \uD310\uC740 \uB9E4\uC77C \uC544\uCE68 \uBC14\uB01D\uB2C8\uB2E4."));
  }
  hurt(frac, hit) {
    const hp = $2("hp");
    if (!hp.children.length) for (let i = 0; i < 5; i++) hp.append(el("i"));
    [...hp.children].forEach((e, i) => e.style.setProperty("--f", `${Math.max(0, Math.min(1, frac * 5 - i)) * 100}%`));
    hp.classList.toggle("full", frac >= 0.999);
    if (hit > 0) {
      const v = $2("vig");
      v.style.transition = "none";
      v.style.opacity = String(Math.min(1, 0.35 + hit * 3));
      requestAnimationFrame(() => {
        v.style.transition = "opacity .7s";
        v.style.opacity = String(frac < 0.3 ? 0.35 : 0);
      });
    }
  }
  setGoal(text) {
    if (text !== this.goalText) {
      this.goalText = text;
      $2("goal").textContent = text;
    }
  }
  fade(mid, text) {
    const f = $2("fade");
    $2("fadeText").textContent = text ?? "";
    f.hidden = false;
    requestAnimationFrame(() => f.classList.add("on"));
    setTimeout(() => {
      mid();
      setTimeout(() => {
        f.classList.remove("on");
        setTimeout(() => {
          f.hidden = true;
        }, 900);
      }, 900);
    }, 1e3);
  }
  intro(lines, done) {
    const box3 = $2("intro"), p = $2("introLine");
    let i = 0;
    const show = () => {
      if (i >= lines.length) {
        box3.hidden = true;
        box3.onclick = null;
        done();
        return;
      }
      p.textContent = lines[i++];
      p.style.animation = "none";
      void p.offsetWidth;
      p.style.animation = "";
    };
    box3.hidden = false;
    box3.onclick = show;
    show();
  }
  setClock(text) {
    if (text !== this.clockText) {
      this.clockText = text;
      $2("clock").textContent = text;
    }
  }
  setLabels(list, camera) {
    const box3 = $2("labels"), seen = /* @__PURE__ */ new Set(), v = this._v ?? (this._v = { x: 0, y: 0, z: 0 });
    this._labels ?? (this._labels = /* @__PURE__ */ new Map());
    for (const L of list) {
      const p = camera.position, e = camera.matrixWorldInverse.elements, P2 = camera.projectionMatrix.elements;
      const vx = e[0] * L.x + e[4] * L.y + e[8] * L.z + e[12], vy = e[1] * L.x + e[5] * L.y + e[9] * L.z + e[13], vz = e[2] * L.x + e[6] * L.y + e[10] * L.z + e[14];
      if (vz > -0.5) continue;
      const cx = (P2[0] * vx + P2[8] * vz) / -vz, cy = (P2[5] * vy + P2[9] * vz) / -vz;
      let el2 = this._labels.get(L.id);
      if (!el2) {
        el2 = document.createElement("div");
        el2.innerHTML = `${L.name}<small>${L.title}</small>`;
        box3.append(el2);
        this._labels.set(L.id, el2);
      }
      el2.style.left = (cx * 0.5 + 0.5) * innerWidth + "px";
      el2.style.top = (-cy * 0.5 + 0.5) * innerHeight + "px";
      el2.style.opacity = String(Math.min(1, (11 - L.d) / 3));
      seen.add(L.id);
    }
    for (const [id, el2] of this._labels) if (!seen.has(id)) {
      el2.remove();
      this._labels.delete(id);
    }
  }
  setTravel(render) {
    this.renderTravel = () => render(this.travel.querySelector(".body"));
  }
};
var CLOCK_RATE = 60;
var PHASES = [
  // hour, sun colour, shade, sky tint, warm, day
  [0, [0.34, 0.4, 0.6], [0.2, 0.27, 0.45], [0.16, 0.22, 0.4], 0.1, 0],
  [4.5, [0.34, 0.4, 0.6], [0.2, 0.27, 0.45], [0.16, 0.22, 0.4], 0.1, 0],
  [6, [1.08, 0.84, 0.7], [0.44, 0.52, 0.72], [0.82, 0.7, 0.72], 1, 0.7],
  [8, [1.1, 1.08, 1.02], [0.47, 0.67, 0.83], [0.99, 1.01, 1.03], 0.47, 1],
  [12, [1.11, 1.1, 1.05], [0.47, 0.68, 0.83], [0.99, 1.01, 1.03], 0.4, 1],
  [16, [1.1, 1.08, 1.02], [0.48, 0.66, 0.82], [0.99, 1, 1.02], 0.47, 1],
  [18.3, [1.15, 0.78, 0.55], [0.4, 0.4, 0.6], [0.92, 0.7, 0.62], 1, 0.75],
  [19.6, [0.7, 0.55, 0.62], [0.28, 0.3, 0.52], [0.45, 0.4, 0.58], 0.7, 0.3],
  [21, [0.34, 0.4, 0.6], [0.2, 0.27, 0.45], [0.16, 0.22, 0.4], 0.1, 0],
  [24, [0.34, 0.4, 0.6], [0.2, 0.27, 0.45], [0.16, 0.22, 0.4], 0.1, 0]
];
var lerp3 = (a, b, t, out2) => out2.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
var GameClock = class {
  constructor(day = 1, hour = 8) {
    this.day = day;
    this.hour = hour;
    this.paused = false;
  }
  update(dt) {
    if (this.paused) return;
    this.hour += dt / CLOCK_RATE;
    if (this.hour >= 24) {
      this.hour -= 24;
      this.day++;
    }
    this.apply();
  }
  apply() {
    let i = 0;
    while (PHASES[i + 1][0] <= this.hour) i++;
    const a = PHASES[i], b = PHASES[i + 1], t = (this.hour - a[0]) / (b[0] - a[0]);
    lerp3(a[1], b[1], t, shared.uSunCol.value);
    lerp3(a[2], b[2], t, shared.uShade.value);
    lerp3(a[3], b[3], t, shared.uSkyTint.value);
    shared.uWarm.value = a[4] + (b[4] - a[4]) * t;
    shared.uDay.value = a[5] + (b[5] - a[5]) * t;
  }
  get label() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    const part = h < 5 ? "\uC0C8\uBCBD" : h < 11 ? "\uC544\uCE68" : h < 14 ? "\uB0AE" : h < 18 ? "\uC624\uD6C4" : h < 21 ? "\uC800\uB141" : "\uBC24";
    return `${this.day}\uC77C\uCC28 ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} \xB7 ${part}`;
  }
};
var MANNEQUIN = { "note": "Generated by tools/build_mannequin.py from the provided human model. Positions int16 /10000 m, feet at y=0, facing +z.", "bones": [{ "id": "pelvis", "parent": null, "pivot": [0, 1.0018, 0.0323] }, { "id": "waist", "parent": "pelvis", "pivot": [0, 1.2028, 0.0574] }, { "id": "ribcage", "parent": "waist", "pivot": [0, 1.3586, 0.0659] }, { "id": "neck", "parent": "ribcage", "pivot": [0, 1.5811, 0.0194] }, { "id": "head", "parent": "neck", "pivot": [0, 1.6604, 0.0194] }, { "id": "upper_arm_left", "parent": "ribcage", "pivot": [0.1649, 1.5341, 0.0145] }, { "id": "forearm_left", "parent": "upper_arm_left", "pivot": [0.1979, 1.1637, 0.0274] }, { "id": "hand_left", "parent": "forearm_left", "pivot": [0.2339, 0.8713, 0.058] }, { "id": "thumb_left_0", "parent": "hand_left", "pivot": [0.2203, 0.8235, 0.0788] }, { "id": "thumb_left_1", "parent": "thumb_left_0", "pivot": [0.2065, 0.8014, 0.0891] }, { "id": "thumb_left_2", "parent": "thumb_left_1", "pivot": [0.1989, 0.7713, 0.0976] }, { "id": "index_left_0", "parent": "hand_left", "pivot": [0.22, 0.7796, 0.0926] }, { "id": "index_left_1", "parent": "index_left_0", "pivot": [0.216, 0.7344, 0.1027] }, { "id": "index_left_2", "parent": "index_left_1", "pivot": [0.2044, 0.7011, 0.1074] }, { "id": "middle_left_0", "parent": "hand_left", "pivot": [0.2357, 0.7724, 0.0746] }, { "id": "middle_left_1", "parent": "middle_left_0", "pivot": [0.2312, 0.7237, 0.0792] }, { "id": "middle_left_2", "parent": "middle_left_1", "pivot": [0.2195, 0.6887, 0.0821] }, { "id": "ring_left_0", "parent": "hand_left", "pivot": [0.2507, 0.7745, 0.0549] }, { "id": "ring_left_1", "parent": "ring_left_0", "pivot": [0.2445, 0.7261, 0.0559] }, { "id": "ring_left_2", "parent": "ring_left_1", "pivot": [0.2312, 0.6932, 0.0552] }, { "id": "pinky_left_0", "parent": "hand_left", "pivot": [0.2629, 0.7824, 0.0353] }, { "id": "pinky_left_1", "parent": "pinky_left_0", "pivot": [0.2595, 0.741, 0.031] }, { "id": "pinky_left_2", "parent": "pinky_left_1", "pivot": [0.2468, 0.7135, 0.0304] }, { "id": "thigh_left", "parent": "pelvis", "pivot": [0.0945, 0.9733, 0.0274] }, { "id": "shin_left", "parent": "thigh_left", "pivot": [0.066, 0.4485, 0.0226] }, { "id": "foot_left", "parent": "shin_left", "pivot": [0.051, -0.0563, -0.0193] }, { "id": "upper_arm_right", "parent": "ribcage", "pivot": [-0.1649, 1.5341, 0.0145] }, { "id": "forearm_right", "parent": "upper_arm_right", "pivot": [-0.1979, 1.1637, 0.0274] }, { "id": "hand_right", "parent": "forearm_right", "pivot": [-0.2339, 0.8713, 0.058] }, { "id": "thumb_right_0", "parent": "hand_right", "pivot": [-0.2203, 0.8235, 0.0788] }, { "id": "thumb_right_1", "parent": "thumb_right_0", "pivot": [-0.2065, 0.8014, 0.0891] }, { "id": "thumb_right_2", "parent": "thumb_right_1", "pivot": [-0.1989, 0.7713, 0.0976] }, { "id": "index_right_0", "parent": "hand_right", "pivot": [-0.22, 0.7796, 0.0926] }, { "id": "index_right_1", "parent": "index_right_0", "pivot": [-0.216, 0.7344, 0.1027] }, { "id": "index_right_2", "parent": "index_right_1", "pivot": [-0.2044, 0.7011, 0.1074] }, { "id": "middle_right_0", "parent": "hand_right", "pivot": [-0.2357, 0.7724, 0.0746] }, { "id": "middle_right_1", "parent": "middle_right_0", "pivot": [-0.2312, 0.7237, 0.0792] }, { "id": "middle_right_2", "parent": "middle_right_1", "pivot": [-0.2195, 0.6887, 0.0821] }, { "id": "ring_right_0", "parent": "hand_right", "pivot": [-0.2507, 0.7745, 0.0549] }, { "id": "ring_right_1", "parent": "ring_right_0", "pivot": [-0.2445, 0.7261, 0.0559] }, { "id": "ring_right_2", "parent": "ring_right_1", "pivot": [-0.2312, 0.6932, 0.0552] }, { "id": "pinky_right_0", "parent": "hand_right", "pivot": [-0.2629, 0.7824, 0.0353] }, { "id": "pinky_right_1", "parent": "pinky_right_0", "pivot": [-0.2595, 0.741, 0.031] }, { "id": "pinky_right_2", "parent": "pinky_right_1", "pivot": [-0.2468, 0.7135, 0.0304] }, { "id": "thigh_right", "parent": "pelvis", "pivot": [-0.0945, 0.9733, 0.0274] }, { "id": "shin_right", "parent": "thigh_right", "pivot": [-0.066, 0.4485, 0.0226] }, { "id": "foot_right", "parent": "shin_right", "pivot": [-0.051, -0.0563, -0.0193] }], "lod": [{ "p": "vP7xAboEov3JAX0F7/z1AmwA3fw4AlQAuv4WAMEE9PxRAV8A1f0TALAFO/2lAFIAyv2jAeYFXf2AA0EBD/0PA0cBxf90AdYDx/wqAl4BmP7FAXkFj/+RAN4Dzv3+Aa4EzP6cAdAFzfxBAV0BO/3YA0QAxv4mALAFIv2PACwBdv/zAcYDwvwpAiUCL/3TAiMCxP4gALkDGv1uAP0BkP9JAZYFsvxEASYCz/5BAsMDhv+UAKEFgPxeATMDmfw4AcACX//PAYwE6f0QALMD6vx8APIChP9yAMoE3P07AvgD7PxBAvQCzP9AAcUE0/4DAzIC8/xcAJYDqf8GAlkB0/0JAKECaf/6Ak4B6/wFAt0DR/97AGoB1/2tAukCQv/AAzYArv4XAPUBtP1+Ak4Dm/8wAWgBj/86AngAvv4cAMMCd/8IA2sAyf0aAygCJP9wAzkBA/96AhMDR/+/AG8AbPxeAd8Dv/0OACwCe/9gAV4Arv60AsgCefzVAMADdv+QAPsCdv1NA7UBZ/wvAXkFH/3jAakEvf9QARQDb/yxAHkFrfy2AacEvv6qAzsB0/5VADsAfP8mAvMC9f2GBBgA6/xFAL8EsP0ZBJAA+/0PAD0BMP3EAVMFP//UAhcCbfyqALUE4f5iA58BWvw3AdUEmf8tAjECuf4fADwB6fxoALMF0/4IBJIAtP9YAV0Ctf50BBkA4f0vAEYA3v3GAy8B1/x0AakFdv+gAC0CNP0zARcGO/2PABoGMf+SABYGO/8XAR0Gnf6DAFkGqf4tAVYG8f1FAUsG1v1qAEAG6v33EMIBkf/KEH4A/v6PFAAAkv/cEYAA5P29EfABDf8xEoQBPP+7E7oBSP8sDWAASP+iEPgAG//2ErABd/53EcEBaf+ADlwA4f6eFIkBO/9JFM4BZP3/BScAWv+tEQIBd/9jD2cAtv4sExMCXf9KEhcBUv0vBxoA0v12DR4BvP7SD0AB9f6GDKEAhv5UEvAB6v5JDcMA0v1vDP4AzP6EEF4BWv8VE1QBYP9UFEoBSP3fCEwA6f1DD2kBYf6jFAYC6f6GEX4B1f2SDlEBxP5LFDACRP1KCCUA2v1dEKIBcP6DDOwAl/9MEmYA8vz1CmEArf14EiIClf9OE2wAJv2WCVIAzP37D5IBm/6XDfoA7P1BE1cC2/1FFHwCpv5+DhgBbP9rFFMAvP2jFDUC9vyqC4cAv/4wDyEBDf1YEvABzPy7EIAB0P2zCs0A0f5eBmEAsPyCDcYACP0nExgC6vvBEVEAZ/xTD/IA0vx5DJ8ALv8LBQ4AGf0jEIMB0f2hCa4AnP4qB3YAvPyiEZ4Byf5bCGQAOP9tBSYA9vxQFCgC5/u6D1MAZv7UCKEA4vveEHEAQP2iFP8BKf17DQMBxv1fB3oAMfxSDn8Av/6uCYMAy/1qBn0Axf7qCosAYP1PDOoAC/wOD24AQ/zCESQBWfy/D/sAs/6eC6kAcPy9DEcA0/3mCJwA+fwlD0ABAv57C+MA/PxbDiEBOfyrEAQB2P0nCIgAUvxaDVEAa/xYFFoB+f3mBE4AO/8CCxQATf/TCxIAV/xdEkkBrfyOFCgAUfxEE1AB5/1RBV0AT/xKFHUAuf7jBFMARv30ELsBC/ynEpoAsf5eBWsAK/+KCAgALP2+EdkBGfxCE20Ar/yYFF8BPfzNFVgB3/wQFWYBKfymFlUB5/xPFF0BffyAFHoAF/x+F0ABX/wOFXMA4/wmFVcAQPzTFWEA8PwvFGgAMvyRFmYAefyKFAoBY/wXFT4BH/yRF3EAj/zKF5sCffxJFecBOf1OFaYCqvysFU8CnPyEFmoCX/yDFgYCEf1+FMsBFv2qFtYCdvzzFRAC8/wYFScCNv2yFb4C/vyiF/ACT/yOFx0C4P1uFPwB1v29FhADVf9wFGsA3/35FC4C2/3XFe8Cgf/8FHUAsv9vF0MBtf/MFVEB2/2qFzUDHf+EFo4Cq/+yFlQBIv+bFXsCk/5DFbMCRv9zFDoBuv7BFcEC0/4HFToCqP+BF3IAhv8GFUcBtv68FtsCjv50FOYB2v07FcICtP/CFXQAq/6gFwMDpv/BFnQAXf8wFQMC1v45FFsBBf5yFS0A6v3rE4oAzv4qFWsBMv5/FeYAMv+aF50Cxv1kFV4Bx/4QFGkAeP+FFyUCvf5WFWkA5P0FFFkBaf/JFiUCYf+5FSwCv/2AFZoAJf8QHD0Dqf8SGycCI/0HHlUE2vslITYEev9TIF4Asvp5JGIAIf0cIroDy/r6JI8A1ftAIEAEdP3YIBgC6/puJWcBn//sGTwCgP6tHX4A4ftbHxkEyPy2IicEg/+CHo0AqP86GQ8CWf+aHOYCz/4gIP0CkfxLI/wDd/9DH3EAiP96GDgCU//NHfgCE/yAHgMErPqTJEUBwf9eIOEAq/wyHkME2/rzJBAAAv64HRcANf+VGMgCmf/YHS0CDvyOI7kD7PpKJWUATv9GGcQCIvzXIukDxPr/JAwB8f73H00CoP+LHCgCV/8vGtYCr//IHh4B+v6YH/IBzPulJG0DqP9GHB0CW/89G+MCG/wyIhYEv/9nH1wBFP1jIY4Dx/6KGB4Di/w3G3gDnv95GkwAqvtRI4kDfvzIHlQE9/z6G+QDtf+MHEEB+P7xH5oBXvxmH2YEyPpzJAECtP5dGUwDw//nH/EBo/8nG3UAk/vJIooDrf/qHTYB/fzDHBEE0v6cHhwBRvwzIH0Et/96GHUApP8zHzYCWPudJPgC+P5LGkcDi/scIrADN/4UHjgAzvyEHSoEWfwRIYAEtP9aGWMAbfv/JOwC//4wG1oDov+OHhMC6P5OH2MB/vzLIWIEgv+GHFYAb/sRIcgD+fo4JQMCbf+vHvQCIPydHc4DH/+bG0EDff0EGWwD9vwNIYwEb//HHVMAxf8pG0IBb/tFIMsDfv9YH+8CQv2eGXwDQPysHKwD9vqoJFgC/vw4IJIE6v2EGFwDjv8zIBYDDP/lHGADgPuDH7QD8/xYH30EH/1OGpUDxv+NGEUBhv5YHo0Aq/85HMAA/vzAHmwEI//4HV0DWvzuG4kDy/+BGVYBk/vBHpoD7/woG68DTPyBHo0ACvtCICED3P0WIYYEQf9YH8ED6/wvGTUD3/vFHFIDzfqkHxYCDvxVGRUCnPv5G28A3P1BIIQEbPvcIT8CAvsTIRkDDv16GCADN/9/HnEDuPtqHVoDl/7RG7YDNvzSGEsC4P1SGYIDFvwXH8QAc/vEHG4A3v1gH20Ez/0fGqkDzPsCGy4Cnv60Hd4D/Pv/GyMDs/rzIBsC2/rnI24CWftvHh0D9vsWGigCqfsgG1ABZPu3HTsApP6xHMEDTv87IPID2P3wGtADEvtbH+MC2PzSGVED3/qeIo0CufpFIBsCw/2jHmQEafwpGgYDf/vbG1cBZf6YGX4D2v3jG/cD5fo/HzgCJvuqIgoD8vvDHu8Az/p+IKACsP5LIGYE2vtnHxMBMPwbGwgDwPuWG30Cnv7mIHoE0/oHIasCufr4IQ0CBvuAHkECOPunIwMDEPsWIgMDt/qmIxoCx/sDIDMBnvsRIQAClP4QG6QD2P3JHBgEdPx9GKQCR/u9HEgBlfuKIM0Br/22IWoEvvrZIiMC5P2GHTIExfwwHjAAhP5lGpMDH/uZHTkBX/58H1YEpftuG8QAY/xOGb8CDPyMGGoAq/obIkYB+/pYHmIB6fytHRkA7PryIUAAMP6gHkcEi/v8GyUC/PtlGWoAK/+qIGIELvtcH0UBNf6XIKID0vpgIMUA2vpjIiwAofs+IIIBvPs9IXECKfwgIvMCofq+IkkBl/x/IWkDKfu8HT0C7fstGmMAj/qeI00Bm/vfIJwB1fq3ILIA4/0VIaED1vsFG2EAWvvEHDICDvxrJJ0DO/txHl4AxfoDIp4A8f2mIY8DzP34HU4E0vueGxwAAvxkGE4Bxv5OHygElPu+HNYCxf6cHvQDJvx0IQYDwvvqIXECBPtUH5oAbvuyHfkCyfqdH2gB8vwoImQD6vtWGUYBzvs+GjoBqvtLHMQCqftKG94BtPrNImMAgf4qIZMDCfsqIG4AvPpJIC4BY/zdHXAArPoFIWEBa/0ZHxkCFvsqIUkAm/qjI3IAn/4/IMEDNfjVHAYBNPjcHMcAm/ijHBAB4PhGHA0Bf/itHMoAGvgUHcIA7feOHcEAH/gXHRsB/PeQHRoBTPhOHdQAWPgdHcYAU/hRHQoBX/ghHRQB0vf6Hb4A7ff8HTAByvdAHgkBufdYHrwA6fgXHJAB8vhiHJgBS/nFG6MBY/mxG+EB7fgUHOcBefmAG9cB8fhlHOQBl/i6HIgBd/hNHYQBl/hXHI0BL/gQHdABIvhLHdkBIPhLHZEBNPgCHZUBi/hTHfMBnvjJHO8BjvhZHMwBF/ikHeoBd/i0HYEBivigHQACGvi0HYABc/nRG8sCuPlaG34CB/kDHGcCDPkJHLkCbfnNG2gCzflOG74CzfjPHEwCPPlSHNgCoPhAHTwC8PhFHFkCN/moHLoCMvmzHGoC/fg9HMACPflIHFMC3vhEHcoC3PjPHMcCyvi8HbwCoviZHUACDPksHmUC5vgkHsECJfrYG04D/vljHGoDJfrfG4wD0fklHJgDvvmBHJoDy/kTHDgDrfl6HDgDHvmGHXgDg/nmHJADWflvHYkDcvlzHRwDdvnlHCgDCvltHSQDGfkmHTkDRfkqHnQDG/nLHXUDUPncHXwDZfngHQwD/fjWHRUD+vg6Hv0CbPlmHikDvflyHhkD2PmjHQ4DHfqXHSMDGfpmHikDB/o7HwkDCvrhHu8Cv/naHhYD3/lbHy0D7vnWH/kCpPdqHxoBoviDHvYCTvkBITYCv/hfHy8Dx/doHkkBpPlFIBsCq/hIIBADk/lcHxwC9PcXIVUBH/jsHRkCu/gJIcYCSfmkHnICw/i9IS0C3vc7ICoBBPlcITcCdPm6Ht0C2Pc/H8UAbvlPHz4DyPfEHrkABvijIX0BE/kiH8UBnPkvIAUD5/hmHhMCUPnYIMcCnPhGICEBmvjkHQMCL/j1IKgC/vefISICpfggIUcBI/hSILYCKvhEH7wCgPh3HksBs/haH0UBMfiGHp8C6vdSHhACNflGIKsByPdKHxQCCPgQHl4Bqvi9IWoBxPdTIBUCMvmvH7AB4vcvISgClPi0KWsA2/n3Ji0Ab/jBKGMApPkyJkYAovmYKgQCf/lVJW0Abvj9J0IAbfmNJKYAjfilKVABM/hhJQkChfgMJy4Aq/hAJjYAUPixKFkBJPiPJA8Cv/hnJVQAN/itJvMB7vkoJTkBB/lXKssBN/g0Jv4Btfl2JC8BrviTJHsAv/ldJmQCtvi4KA0CFPh6JEIB6fhgJacCgPkvJ4AC5PiQKfEB4/idJLMCM/jtJ7QAGfhHJVQBPPhkKL8AFvhMJkwBrPmMJC4CGvgdJ0UBq/jvJzUCx/loJUECPPnrKj4A5viqKksBAvlEJp4CPPjzJM4AVflcJaICkPnOKF4CjvhrJmACSfmzJKUCt/gwJ1cCNviMJckAg/m2KTQCL/gFKFkBLfmzJpoCY/igJHICKPhbJr8AOPh0KBEB4vivKmwAUfksJp4CWPnhKoUBM/j+Jp0Ad/hHJWsCp/kBKGsCtfhtIuQBUvjyI4gCtvj4IT0CPPm9I6ECI/nTIp0CNPgJIpQBUvnQIisCufhyIfoBfvmqIygCq/g2Iq0CMfkIIvwBx/iwI7wCHPjpImUBrvjSIr8CF/iwIz0BqvhzIZEBffm6I0YBp/i9I6oAM/gIIgECyfg1I9EAQPnpIlcBE/inIx0CK/kBIpMBGfinIjMCXPhkI9wAQ/nXI8kArPiqIjkBtvj/IVwBS/qwKQkCUvrGKPcBNPr4JwoCpPqwKm8B4/p3KpkALPoRJ/UBGfpIJu8B5fqDKhIBr/q4Kk8ACPqTJdIBNPpMJl0BcfrbKFUAs/q+KVkAU/oTJ0oB5voWKgwBD/qPJWQBP/rvJ2IAn/rjKFoBDvpfJqUAKfoZJ4YA5PoCKscAwfq1KWYBe/r3J1UBP/qiKuoBb/kvM/gB2vlNNp0Bx/lcMq0CovkENDYCx/l3MbkCufnWNCQC0fl4MLkC1PmwNQgCVfk2MDMCZflaMTUChvlTMlYC3PnGM5cC2Pk5M6QCMfmeMZQBWPkbNGoAHvlRMdMAJ/lwMLIBH/k3MGMAR/kRM3QAmvmdNWcAs/khNXcAOPlRMlEB9PlrNsQBHvk3MSwBW/kFNFcBNfl8MVQASfkvM0YBGfmFMGABL/meMDgArvnUNTQBQ/luMlYAbfnLNEMBgvshM2cAYPuLMEsBfvv4M24AavtsMU4BbPqfNg8Cc/tLMkMBfPodNRcBZfvuNGgA2Po0NpcCT/qKNX8BWPuWMH4AcfslM0kBBPtwNhECZPtmMVgAZPsFNEYBTvv0ND0BuvpSNqYCdvtNMmoAavr/NGQANft7NZEBrPrfNNsC/vo/MsYCLPv+MywCOPsnMzgCnfqdNbkCFPvCNf4B8PrMMKECt/oNM/kCpfrvM+4C+fp3McACFvvhNCMCPftpMSoC5vq3NKgCrvo4MvYCJPuRMDcC2PoQNpgC+PojM8ECYfqUMM0CcvrnNfABQvtJMiwCCvr7NJICufqDMecC8/r1M7ECZvraLssCU/plKxgC/voALiMCY/qgL80CKfrVKtkBqPoKLXQCJ/vRLw8CVvoDLtcCIfugLvABnvpELFMCzvrqLYACJPpELKoCNfosLckCzPqfL5EC7PoDLQEC5fpdLN4BzPp3LowCZfqwKmEA/vr8LZUAdPptK3cA2vqaK3EB7vpQLD4BcPpGLFkACvvCLmoACvsaLVkBPfu+L44AiPo1LTAAa/quKksBwvpSLhwAjPpfK1EBKfsMLkUBPPvOLj8BWPvoL00B6foTLbUA6/gaLlkBevmIK0EBRfnlLToA/PhaK4sAgvmMKmAB9vjRKoEANvkUMBYA8vgALa0AEPm3L2gB9vgoLKYAPfm7LjcA/fj9LkkB7vhmK0UBivmPK2QACPnxLaAA+PjRKjwBfvmEKncAaPkYLR4AEvnNL6UA1PgsLU8BDPnrLqIAivk1LC8AxPgkLE0BsPkdLcUCmvk+LKsC9vihKwICPvkOLncCzvnEK5sCSPnkLlsC6fgdLBIC9fgQLRUCWfnkL0ACj/nNKtoB1/muL8YCDPkFLhsCiPlgKx4CxPnOLsoCO/lALHwCBPl+Lt8BsvnvLdUCHPlWL+IBNvksLX4C3ADpAGb+oAAlAqn9vQJ8BGn/MgJDAHj/ygB0BKT+RQGBAJX+owAIA8v96gLrA5X/ngDsA3v+KQH2A679ugBzAan9TQGRBAb+rwBGAaX++QJMAUX/LQG6BJf+tQKzAFP/PAKsBLH/8gBFA3T9fgAXA5H+VAGuALb9HwPyAmX/uADGA/j9HgMQAk3/ggAnApn+7wADAbD9sAK1ALP+3AC4AFP/IQLPBJP+oQBHAUf/+wJDAY3+OAGoBKP/LAM0ArL+dgBDAkj/tAJ9BCf+FwKUAMP9fAAhA3L/MQMRA5z+jALmAHD92ALuA+j9SwFWAGz/+gIOA7L9EgPiA5H+ngDlA2b/EQMbArH9wQKbBLP+0ABmBIL/NQJlAKP+SgLeA4v92wJDAaf9mgLHAPP9JwKSBPH9zgIjAlv9qwLpAlr9/QGGA1r9rQJmAVX9LwIGA0P9CQIWAiD9JQI/ATf99wHBAFj9MgH9Ak39VwEoAi39QgFFAUT9ZQHLAF39zwBKAl/9xACyAWr9mQGZA2L9IAJbBY3/KALsCbf9xQO8EPf9KQI3DTn9kwCkC5z/LwRYDrP++wLiDz39HAK6Cpr9OwQFD6n+4QPGD+r9VAFhBb/+QgJyDFr94AK+EFr9KgKtC3j9OgIGDwz91gOpDM3+tQAhCt//tgL+CCL+QwHNBJf+HwOnCZD+rgNvERr+TgLEBJb/lAJPCCj+GAIsDhz9YAPBCqP+ogDFCqP//gNkDcX+IgLAEEb9sQDdB43/2AIVCKD+/ALQCvr9pAMGDQz+LwJBBhT+IQLsDx39mQMpFMf/yAJ4DUT9+QLJCKP+SQEjBSf+pAN8DEX+DQRdEbL+3AIGCgj+qwAUCYv/swBRBcv+NgJTBwv+swJ0Bav/vAIZBrn+zgMID8n9vgBvBq//LwS4D3r+DAMqDkX9LgJCCPD9PAFMBRT+mgIcBZ3/vwNhE4X/cgIzEV/9yQDuBO7+tgAZB3H/0gIqB9L+NAS7EMz+OwIbCdj9CgMJDzH9BgRkEo//uAM+Dsf9FwOuC+D9VAFUBhT+DQPhCJf/3AA5CkH+oAHsEGX9qgArCd/+LASOEZf/qwBQBYX/rgJnBeX+9QEgBSv+wQAnCKv+7QI/CKr/bQEDBwD+cQHdD0X9wQAsB8L+AgJYBRL+ZAEzCPr92AJDB63/RwTqEJ3/xgNxEs7+0AClCyT+2AJDBnH/vwBYBtv+QQSSD9H/TQTNDjP/YgH3CPD9mAIcBRD/vQDvBJT/gQNtEwz/jQFuDUn9RATTDpz/UQFqBZz/6wC2CEz+RwHwCeb9IAJMBbb+3gDnB2r+rAHCDFf9hwMyEkb+dQGbCrv9mgCoC6f+MQRMDoz/TgSXEHz/KQLbBLD+8AAoB2L+NgGeC8T9XwOGCpP/RgEAD0798wNJDaj/qgDQCqz+YQEBDkr99ABHBmD+0gO8DK//uAC6CZr+OwF+BKD/OwO3CYn/WAF4DIX9SwAnD8D+MAFtFGP/mQC7D/z9CQFADZj99AJwEvz9VQAfDq3+kwOMC5P/JwI/FNb+tADKEAr++wA5Doj9YQA6DcD+cAOjCl7/DQKDE2X+fwB+DJr+4gAID5X9yADeDOn9cgBkEcD+8ADiD5r91gIxFPn+tgBFFLP/JgJoEs39pwBeDQL+JQHTEKD9CgIYEyr+awB6EpP/TQO+EmD+nQA4Dvr9ZAC9EJj+BANmE5j+TQGnEcb9hQBiE53/nQAdD+79aQCuD1X+KAMIDYz9agFyEgH+lwEPEzr+UgC1EYv/EQNKDLD9NgNoFIT/yQCAExj/PwCbD4//twB4Eq7+QADNEIz/KwKuEYb9SQBZDoD/nAO4C8f+KQPqEIL9UgBfD+j/XwEoFPL+CwOvEbb9QAFXE5L+aQCcDF3/+QCpEm3+aQAwDbH/jgPJFcr/iwOVFq3/mAOWF6v/hAMiFdj/oQC3Fq//2wKjFgP/vgLzFf7+nQCxFZz/NAHtFIH/qQBwF6H/0gKWF/P+UwFdFLL/GwILFfT+/gCjFjr/JAK+Fd7++QDBFTT/HgK6Ftf+ogAVFa3/vAIgFQ3/BAFdFzP/HALAF8z+vgCYFPr/TwGuFQD/aAGsFvn+4wJtFK//CwP3FI3/awFfF/P+NwPFFVb/OwOcFkj/LAILFYX/cAEVFQT/HAJPFJH/QAN6Fz//TwFcH3//EQKcHuv+hgEsHAb/YAOoGEP/wAM7JcD+6gOaJNH+CQP5IQv/VAOsGTj/OAJWHwL/JwF6HoX/ZwJaHfr/ZQHVIG//WANiGj7/CQOxI7v+WgIFICP/hAGiHAz/XgMKGzv/SAE6IJH/mgHbHRD/CQO+IuX+CQNoH//+LALmIQf/YQGWGO3++QKGHtb+zQCdHvn/XAEzGfX+bAF3Gg3/ogJ1ISP/LQLHItn+bwSWJAX/zwCTIPT/lwFgG/7+cARNJQr/2gLxHxz/TAKaI7P+PAWAJMv/uAJhHfv/rgHpIRP/QwKxGMT+6ABpGUj/9wIEHOX+JAJmGcr+8ACaGDP/GQExG1D/JwNYIDb/7QRCJXz/CAJSGt/+oAFpIvn+0QCyHeH//AK1Hc3+BAFdGlH/EgMdITr/8gSUJGT/CQOmHN3+yQDsHNP/JQIsG9/+PAOWISf/oABOGaL/7wKBGff+xwGGHy//nwGDHhn/KwLtG9T++wAlHHr/+wKFGPv+mgCIGKP/7wIuG/v+FAKWHNP+rgAvG8r/LgGzHW7/HgIJITf/GwK/Hdj+2gI/Gvj+oABzGsn/GwHDHGn/JwJNIDT/gwQSIdP/+gPdIUv/dAQ9IM7/LASSIjT/cgQnH8P/agScHsP/HQSXHmr/3gSlI17/ywTQIoL/4AN3H0v/jgO5HQH/2wM3IGf/pwTrIa//nQPUHB7/5AMFIXb/cwJuJJj+1APeG4b/QgWyI8n/jANfHxn/ngOQHgn/NwUHI+H/gATcIxv/9AP4HGf/KQR4HZH/fgOnGGb/EwMPJZv+ZgSsHdv/tANWGav/lAMeIh3/FQOZJKL+ZwQHHf//6QOlI+n+tQNOGqX/5gPmIgj/0AMoG63/9QaHKtz/LAftJ+n/GQe2KeH/FQezKNX/Cwf4JvP/+gVBKP3/6wXWKOX/2wakJvj/mQYUJ/D/xgW2KcT/mgYHKM3/cwbQKLv/eAbBKZ7/bAa7Kqb/qAWmKsP/dwUkNb//cAYkMpT/qATUNQv/7ATKNAf/wAW/NVP/GgXMMwf/XgZ+MID/HQUBMyD/XQZbMYH/iAVmNvr+WwbvNI7/PAUjMi//NwbINZz/ZwY+M4j/nAVtMEr/fAUbMTf/bQYhNJX/BgZwNRj/qwRlMsf/HAazNBb/qgVHMhH/+ATEMK7/twVoMSD/GQY4NBT/vgSVMdn/DgZAMxb/iwTsNJP/iAXTNfn+pgXSNN3+igSbNWL/lwQnM7j/kgXlM+P+iQQMNJz/lwUNMwL/tARtNvr+CAXFL+P/rQXZLrH/kwXAL3v/OQY6Le//aQbMKt7/1QXfLeD/aQYwK9H/OwbuLrP/4AUoLfL/cQbHL6f/wgXiKuX/xwU6K+H/XwYULu3/Uf5iOxMAZfwIQEIBFP4PO1EB9P5yQV0E+/z2QG0Amf9WOvACQP2IQZ0AuP5JPkEFWwDRO/X+wf7pQI0En/2RO0cBov7SOlsAUvwfP0oB2v1QPsUEg/xyPqgAAv6oPI4Eo/4WQNEEqPwgPyQA+/7OPDUF0v5oOmIA/fyaPEgB1/17PakEn/5NPw0FqfxuPT8BifycQHsBjP+SOkUDy/6APUIFtPwbQEYAT/4hPhMFh/zEPWkBvvz6QEIBf/zjP50ALv4qO6cA4gHfO8P/L/62QGAE5/5BQpoDd/wgP5cADgH4OxD/cf6qOkIB1v2wO2gAs/xBPkoAMP2qQUsBNf2nPHUA0/76PjoFjP5oOkgB5P0nP7UEaPxPPlUBa/5tPRQFhf/vQSUE2fx/PXoA7/0FQHsEo/6BPPMEcf0pPSkETgGkO3n/lf9dQrIDf/6pOisCMv2lQRkCGP2ZPAgDhvzAPQkCxvz9QCQCnf17PAMEyPx+PQkDEgECO9P/lfxxQHMCWf4qQT8EhPzNP8oCIP4qO/ECgv8iP04F3QBoOvv/Tf8xPCAFs/5oOicCqPw7Pi4DtP2eOw8DrP7RQe8DZvxPPiwCefwUP9oClf+NQXAEBP9oOqsCewBwOz3/p/wrP0oDnv2AOzIClf0lQCwEfvxlPscCUvwmPyoCuvwZQBYDDf4POyICaPwCQCICfv9IPnAFawDgOpH/jP/oQL4Ekf+bPEsFB/3rQAADCf6aQbADbABoOr//pvxbPSQCi/ycQOgBgf8TQAQFrv7JOvwChP95PW8F0P32QPcDQ/+UPyEF8PyaPCoCUv2IQc0CI/39P8YDZQHfQWD/4wHXQAL/Sv3nOyECBf0cP+EDKQIgP8D+x/4YO8MDf/8FQz4Cff1CQW8DE/5KQoYAV/3KQJwDw/8hQ/QBGgIEQNn+wf3TQREDev55OxIEtP7LQkMBiP+yO9gEk/0IQi4CqAATQjX/Kf2BPd4DHQJQPsX+g//CQgQDj/84O2cETf3APLID+v1lQlIBAv1NPt4D8f3JO9ID1wHSPA3/mgFAPDL/sP6YQmwAWP34O9UCoALhPiT/BgKMPeL+jAImPi7/XQCEPS3+uQLZQM//xP7DO5gEZwD3QH7+CAG+Pz7+Xv0IPNwAiv0IQiwBXwC6QeL+GAEgPy/+ggFQPmH+tv5+QgQDQgGlPMj+Uv3IPlIEhf1DPDMAZgBQPg3++AIlP5D/awJlPVD/YQB4Qp3/AP5iQh0CUgFyPXn+jQBoQE/+iP/ZQmgALwKQPI7/5wL6P5n/IP5HQs4C7QCpPUD+XQD1Pyr+BAKwQbX/SgHvQLr+IAGYQQD/Xv1MPlgEO/70O18ESQICQW7/sP3fQVoATf30O10B6wJVPpr/ZwAgPwr+xP8iQ3kBegJSQED/pgL0POL/agCUPIv+igEgP17+EwFQPjP+jf/jOuEDu/7EQjICxAKOPbD/rwAsPVH+IADBQqQAVgEXQHP+Pf4NORMBuv4FOmIAbP5ZOVcAe/95OGMCDQFLOAn/lv8YOqsC4f2COGUA+gFfOKX/hf4DOlABO/7sOJEAh/9eOVECXf5ZOVsBef/XOXQCYgBkOP7+Mv5rODoBv/5QOfoB+gDdOen/zv4MOhcCLQFAOb//qwCQOCb/H/5hONkBbAAHOrX/bABROXn/rP56OB8CagGEOGr/S/03OCoBXf1FOI0ABvzZNP8DQQJIMuf+gAD1N7X+BgMCOKT/kf9gN+ECFwPANaH+AAPSNLf++/+pNgICQfysNdgD1wHXNUT++QIFNOT+//sTMxMEXACuNlf+BAKCMev+8PsCNBAEqwJeM+D+GAPLNz7/jQCiN5D+wQEsNUL+FPwzMu4DgP8ROIUCUwEIONz+TQLVNGr+WQK3NVv+TAIeOGH/tgKOMhX/Af3uNRsEEQI8M6f+ZwG1Nlj+JAIMNIH+N/yOMdoDRQGUN5X+9fxMMtcEXfz5M24EYgAEOKwAXQBBMoP+AQMZMmT/B/7dNioDCf1lNrkDaPwMM4EEwP1eN9ICNQKZNmf+UgHVMor+RAC4NT3+cAD4NDz+ifwHNU4EZAH3M13+9/yHMcMEwAGMNwj/OgB1MZL+DQOkMYP/nfvuNJQDr/5WN9cCBP3yNIwEhfyWMVgETwEiMqH+iv7cNiQDHf1jNWkE2/0JOCgCoPtUM4gDGQMtMzb/kwAxM2v+0/2/N4QCCANfN93+RgG1NTr+d/xENqEDDP0bM+sEmfskNJUDLQHSNED+agD1M1L+Z/xlMmoEEf3pM9AEAgOnNqH++/4oNrUD2v3aNM0EXftvN2EAmfo0N10BEPuvNbsCLgTdNF3/2PsWMTYBBv31N+kBuPuSNjkBCPvfNMgCCPugNlYAKwSiNWL/6P1PMlEFf/uKMQsCzv1qNX4ECvyxNWAAFPsTNMYCC/3GN0kCvwNJN/3+if1LMyIFwv4jM2cFVPxHN8IC5P2TMUkFzPr8NAICUfszMjYCIwQvM8T/j/vjN3oAMvs0M8cCtfq9NRsCEgRwNvz+x/3wMw0FWQRkMuv/lf/ANQoEzv64MzgFJwT+M5f/tPtHNbsAEPyQNgUDG/scMy8CNAReMuD/5Pt3MU4Aj/5+NV0E6fzUNl0DdwQCNMn/wv45MoMFbvo9N3UAef0ZMiMFtASfNvv+XgU3N5L/VPuKN1UBBP1ENwwD9voKNDYCZgQfM9n/yAWVNlb/EPvLNi8BywQqNwn/CPyRNzQCo/7WNNEEHvr0NkYA6P2BNooDZvtnMscCCf6jMy8F4fqzNFcCov4ANBUFavztN8EBovvYMaMCUwOlNav/lwTxNLT/r/5/MXsFMQTDMfv/7v0cM0YF6fsLMg0A0fzdNawBgfvdN+EAgP1wMRwFAPv8M0MBoftiMYIAkv9pNVsEUv+JNtsAAQNrN8v/sP9HMo8F9fwsOGwAIfshM1MBnv/dNL4EofvzMNcAxfsDMh4DCAGZNkkA2vs/N7gBlv9VNCAFSvuJNXkBsgWsNWL/1vr+NdUA4fuUMekCv/3+NRIEbvoINWcAhPtIMlwA+vrUNC4BdAUqNcb/gP+bMY0FGvz+Ny8B2QT/NRf/zwP1N+X/DP0gOGEBjvqfNv0BA/x4N2cACwTcNRH/Kv9cNo4DhPtOMVYBOfv7M2kA1vvzNUMDU/ydNmwAqfomN9UBlfvsMCQBngPmNCL/yftRMQ0CWvshM2YAn/8VM3oFDv2tNfwA+gOeNpH//PqjNXAArP/eM0YFFwSRN5//wP7qNfYD9vv5N3cAIPvzNGYAW/tdNqQCtfoPNVIBTvtIMk8BtvnZNScB9fk/NXMAp/mhNWYA2PmJNoIA3PldNoUB/QHiMAv/KgIgMQr/mvxoMDgEV/yNMNIDVfwlMfQDDf2PMLAE+wKsMLH/mABdMO3++PweMbMEcgANMan++gIfMYv/aAIcMSr/TgHIMOH+RgKGME7/XAENMcz+6v0YMUIFmvzeMAMAEP6eMDwFEfyHMEMBuf6PMF8Ftf1pMBAFr/4XMXEFef0IMQ4FPPwtMXQAUPyiMIkA/PsUMRUDkf+kMHUFFPyHMP0Cfv8dMYgF/PuAMAwC5/sSMSMCOvzNLiICgvw9K9cCFfzSLzoCi/w4LcsCYfzpLTACjvwfLNACfPzRLQEDoPw+LDUDiv91K84EefxYLCwCmfwKLRsDh/9hLkQFfPwILSECfP3oK0MEjP+BLk0FQfyxLxIDc/1vKy0Ejf9TLQ0FoPx4K0EDtP/6L10FU/y8LvsCa/xuKyQCeP9aLO0Emv5mK6sEbfzgL5wAh/zyLGcB3P2wLbcEn/ywLegAgvzuLrMAf/w7LGsB6fxjK1MA8/5dLjEFtv48LegExv3nLtsE9fxcLGAAdPxSK00Bwv5zLNcE0P23L+wEEP0ULVsAvf7eLz4FNvzVLy4Bqv72LQ4FlPyiK/EA3vz3LXUAT/z0Lj8B5/1IK28Eb/z1LWAB4/zbLjoAj/weK8sAoPw5LOQAY/6FLxgF1P05LH8EvfzZLzAApPz3LP0Axv0lLYoEIALELcv/wQI+K/L/cf2RLQcAJALDL33/sQLbK/z/RgESMCP/Uf2LLVcEMQLILqj/KAJbK6f/GQINLdH/tgLaLuj/J/3NLn8ENgJKLML/dADnLxX/xwK4L9L/Iv3ML4oEdgCuLXL/9/wNLdIDRQFyK2H/DP1aLOYD+/xZK8oDeABiLzT/d/zjLp4DYAEbLZj/bPzcL4sDdgC3Lkj/WAFRLHT/QAHmLYL/VwBSKzz/s/y0L/8DsPyXLucDbQG5L0b/4fyoLd0DhgANLXT/YgHqLmX/gwBLLFT/PQH3P7T9iP6bO+4E0ALNQKf/hABLPZD9xf5sQg4DZgE3P4/9nP33QTcBaQCuPPr9awCZQZH+yP7sOo0EV/0IPLwASgNEP3n/If9sOlYEX/1DP3MEcQFvPI/+PAHRQCX+hv+pQkoAJwMDQJX/cwKNPGr/agB2Qrj/X/3jP2AEFv5NQisCcAEgQXr+fQAXQIv9EQKUQY7/TAFxPbr9Lf45QsoCTv3wOzMBPANFPqL/oP//OfUDyv3jQXUA7v7eO0AFZP2NPnUEbAIpQW//Af7WO5wEPgGUQdT+QwHZPBD+qP6XQigCawFLPo39pgLTPKX/FABUQTz+RQA0PG/+av2xPVoEdwDwQAD+TACbQqIA9gKBPa7/Vv3aOygC1AJOPsP+7QF5PRD+FgLRQLr+YQEEQob/Bf36P9cDuAH0PDb+xAFxQQX/Bv9NOsQD/PxOP/IDlP/LO2UFGv42QrEApv/YQh4Crv6kOvcDGwJfPvX9qwKGPeH+n/6WQj4B1P3VQRIDYwL9P3j+Qf24QL4DPf1wPdgD+gHcPxH+rP38QS0CfwAmQj3/if/XOtwEYf2YPKkDtwJ1QCP/gv+lQg0DjQJbPl3+IAImP/39r/85OnwEvALVP8n+Vf4cQkoDLwLGPND+Bf1VPuQDqP29O+0DAP5JQmIB4AInP8T+Y/38OxwDWwJVPYP+Fv4kO9sDrf5xQmcAOf2NQSoCRf2WPAYDnf+iQDUFcv6VOjoCn/9cQqkDbQGSO3D/HQHgOtj/9PxzPfoCfP1lPAYEyfztQCgCFwEDOtn/hPzoP8gC4v0jOwoDmf82P3oFa/xgPggCkv8RQGMFc/xAP8wCpP7fQekDGwF8OcT/s/w0PgsD3v4NOvgBif19O/ACh/yRPtkCT/wqPxgCQgBVOzP/5P5SOg4DiP1lOycCmfxqPzsDoP+SQZgEe/8GQf4EiP9RPnIF7v0COyYCbPwKQCoCdQDdOor/ufwvQCcDdgD6OZb/xPx/PTAC+/2QQcADBf3qQAoDnf+EPG4FUgB0OYL/K/2HPBICTf15QcACs/0LQQMElv9vPV8FWP68OhwD6vzbQGwAefyYPXYAawAYP0X9rP/2OR8DYPwEQEkB+/31Ok0B2P5+QXcE0f1MPsoERPwzP0MBaAC4P2L9i/65Ok0AewOsPtn/bADLO9P+if13O1IBq/7qQNQEVf1zQXEAvP5QPkoFAP2UPE0B6/6PPEcFjv4ROl8AZf76PxsF1P2MPKEEdPw3Pn0A1P6GPT8Fdf57OT4Ao/w1QEsAAwGEPl39j/ycQFkBs/xNPTwB3/1uPb0E/v5CQpcDBQEOP2D9+v24QIoECgLjO6X/d/zpP5gAGP4RO4QAVf40Ph8FxfzuQD0BgPytPf8ALv2HQVUBsv2mO1YAnfwWPhUAY/6BOjMBYPw3P3sAXwC5PV79MAH+O+H+bfwtPiMB1v09P9oEbP5EPRUFjf94OUkCh/4pOlgBeAMEP9X/sP46P00FFv2iPHsAaABhPkL9jv/kOUQCcf6LPBUF1v0JQLwEyPxKPUAAzP76P0QFXv5zOWYBiP/+QSAERgMUKVb/pADgKHX+uv6oI44ENP2uKHgEPAFHJtH+aQClKb3+9QKtKY//YgEDJ9P+ZP29KWwEvv60Io4EQAGSJLT+g/xuKnsDXgAVKHb+wf4IInkEeADzKiz/Af3gJ4AErP8tIekDWQFvJa/+7P5QIWoEKf7RIloEC/1QJnIEWgHgKIj+KQL0KUz/aQBUJg3//PyrKvMDXwGsKeP+Fv6oI14E9fwoJ4UEiAAyJ+H+awCTJAr/UgH5Kkv/Hv4MIlcEQf3HJU8EQgHeJ5H+cwBYJQn/bwGXKj//nvwBKD4ELvw/JtkDjP9RIXgECQMfJ6j+JQK4KJT+DQM5JqD+KQKEKQH/LvwgJ90DUfybJLoDHAAhJSf/AwOBJZT+3vzNKQkEGQFKKhb/MQKCKn3/GwB0JCr/H/xSJaMD1vzNKDwEPwICKHr+B/1LJREER/zYKLIDgP+qI7AEyQJDKRv/HgJOJpz+8wLMKNv+MwIeJ6L+cvycKakDfv/NIrYEw/0YIukDDP11JPIDYv0tKlUEHgMIKKD+tP2ZIzUEgQBpKgr/CQKOJJb+1QJvKtb/t/4HIYMDu/2uIjkETvzZJ/UDofweJjUEOgJWJY7+gf/zIbwElv8eIWAAMPyeKQoDp/viJ6YAlf8XJ/wEs/0wJTUEvwA0Idr/APvHJT4B+fvRKOUCu/+CIMEABQF2IiT/xf17JCoETf1fIj4EevyJKrIAvgG9I7D+dQS9JRT/gQNsKB//jv83JtsE2P7vIP8CyvvrJ/4CT/sbJ0EBlAPUJ+T+2/2HKoIEWwTxJRv/Cf2bIwQEvf83JbAEhP98JJ4EUwDKIZ8ALP27IiwEKPtyJkEBB/ujJW4AaP/QKesEKwCZI0b/ffsCKFYBAP98IAwCwAMaJ/T+rQAcITsAz/slJywD9v7EIHACNQDBIpL/8AM/Juj+iP/WKP0EUfybKkwBzvtHJmsD2f+GIF8B3wOnJcj+0vvMKB0CevsfJ3sAfP/nJwcFtvuMJUYDzfx9KjQAPftBJlsA0v6DKsgEEfypKRkC4f/tIVkAbwAXIrT/PASeJjL/sAASIyL/RfyDKiECiv66Kc4E6f08JpgEqvvyJuICw/9dIEcClfznKUIAsQDBI//+hfveJxwCLQQVJ4D/9P+XIcwC3/85ITYClvtlJvYCA/4YJ8sEyP7kKOYEw/s8JxkAHPy0KTkBov7yJ+0EgvuXJe4C2PvtKEEB2P17JVcEjP+bKt0E4P3OKLME4v4cJ+oEQwHbIvX+zwSzJXH/kwPnKKz/1/sRKD4ANQG0I83+sP44Jr0E4v3pKZkEJfuoJT4Cpf5CJYIE8v+uIUECXwERIhn/SvygKYcAv/8GIRoDQPtyJiQCXQS+JsL/zP3wJ8UEb/saJ1MC6APXJ3n/X/yBKvQCvP5yJHoElQQ5JoP/+fvgKIgAsP+ZINgCDANpJvYAzAGBJFQEVgCAKuAE2v7fIUX/CAPKJ30EtQOrKhoCF/4oJ/H/qPsYJhb/KwH1IAIDNgKVJVUEm/u5JQv/DwCXIcQCIgAJIR0C4wO5KTwBDv27KZf/rQLvKVQEMwI1JpAEWf+9IwT/UwTvJ54AJwTtKDMBr/w2KXz/OQBUICsCBwWkJWcBQf8GIxz/EALzJsUE3gK5KG8EQwF/KsQEVgCIINACwAK7JU0EIAQMKDAAwgRBJlcA9/24KAoADwCuITMCFQLwJ8wEPwAMIRQDggQSJ28AMQLFKK8EBgMLJ4cEDAHFIGwCFgOKKuUDrwOcKXMAAgGFIBMCAANHJm4ELALlKZQE9wSoJXEA+wPWKHIA7f4dIZP/ngOJKvcCEv/vJxYACgDDITQBzgOlKQMDawBuJKAELgKGKoQEWAPHKBgEjgNvKrUACATSKOgCXwBZJbQEfASWJfkCOAHtJ/IEIAPEKQgE+/x4JZb+dwRSJucCdABqJuMEJgQVKAADQgBtINMAUQHRKOAEUAIaJSwEBv0wJp3+cAThJyMCZ/zkJ/L+eAAtJ/wEZAT/JqMCQ/87Idj/QwJuJCUEAP0fJ6j+OP7sI6n+agAdIVwANwG+KdkEYgNMKDMEpAQLJycCTfwcJ/D+Zvs0Joz/kP8XIrL/PwPiJTgEPwRMJwQDNgF7JH4EHADxIV4ARQFKJYgEdAO0I+gDJvxQJuH+vwR1JigCRgQ9KGIC9fz3J5f+pPvaJpP/rP4jIhn/QQSmJiwDMf1dKsn/tQOFKlEBaAAHKAkFVQFMJsIEJACNIHABJwTqKB8C9/yiKMn+LvyiJcn+3QSnJTUCvv6iI8z+/QJ6JPMDvv/DIof/VQDsKP0ENgSSJV4DKfukJXn/tf7QIvX+HgAXIUAB6wO1KR0COf1GKRT/AQNUJRMEYwExJ+QEYgDVKe0E0f+OI0X/TgEDInMEvv5jJbT+1wM4JtID4/98JCv/1wLCIioE6v8lJSf/6v2DKnD/tP6JJLL+xgMKJ+oD+wKnIwIE4f39J3z+rAOvJL0DoAISInoDRwGyIo0EvP4XJ8/+0f2+KJT+fABLIXkE0f5KJtT+t/1rKfr+QAGnI5AExQNfJcQDfgDxIbsEs/7mJ47+vgPVKLADUgK9IzAEmv61KkL/+P2SJJb+SgKpIjgEif9jKgf/kwO4KZgD6/1UJZH+PAORKkMAgf6vKeb+3P0wJpj+gQDCIrgErv7TKIT+2P0LJ6P+GAFWIWsExgPXJ90DegCiI7EERQITIt8Dfv/qKiz/VQAxIfADi//pJ4r+1/5PKhr/SQPsKRgAev/aKdX+gwMnKoQDpv/eKHb+j/9jJQn/UQERIY0D4gERIlYEjf+PJAn/0AG1IlgEcv8KJ/L+u/3YKUP/k/8sJgz/8gGNI10EWgHbQfAD5f5oOb7/uAGEOQAB2/z/P43/nAMTQFYBiQOhPXoApgLzP1MEGwJ1PK8EHQEOOv0Buvw2P23/uQMtPz0B8v70OdH/JgJWPbcEpwI5P24Ei//fO8L+EQICO1sB4/7fOtb/igMwPnoAqwILPL8ApP+/P2L9Mv3VQK//cQOZQD4BJgI5Ps4Eqf6OO2T/eAJ7O1MBagD/OfMCjf8cP0b9kQGWOicCMgI7P9QEcADzQS8EgAOlPf4AC/1+PbL/jf9VPkX9dgDiOUMChQPcP3cAbgGOOhUDHAL1P80EnAMqP2kAV/3jPJ3/HwB8OVECAgK5QIsEfQHoO9IAwP+xPV/9kwM2PiIBx/xKPpH/6QEXO3wAifwpP+H/owKSPm4ETQKgO1wADgFIOgIDBv9WPmD9/wEFO/8CKwFuPT8FnwF2OXIAbgABQGcFuwLAQLsDtAF8PyYFKQFwPEMFcQEfOmIATf2KPe7+dwKIOwIDdQFDQBoFZgBUP3oFdgGzOloAhAPeP7YCSAFmPkoF/QJaP/sDWgHsQNAEKQF3QX4EaQBVQrADiwM8P9MCpgLLOzYCjwNJPgcCLf1GPsT+9QILQNoDhQJtPAgEZACmQDQFjgByPVwFhgGePBoFowL0O+ICKv0jP7b+swMiPxQCegN2PqcCUwB6OTMA/wGSQcIDNAHtP0gFQf3bP9D+lAMLQCcCTgIIQQUEcgCVPGoFnAFfPRIFPwEwP1IF8gJVPvUD2AAaOskAXv2MQBf/dAOOQO4BngKWPLEDcwAVQfYE5P+3O+X/agBPPnMFAADOOu3/v/9UOzP/+v4aP2P9vgJYPdUDYgCMQZ0EFgFEQogDEgICOyICnAHmPR0F5ACHQDEFygFHQqsAyf60QBL+lP9VPp3/jv2DP1T+RgDaQh4Clv5uPI7+PALHQRQDmv3fP2z+g/4XP5T9agB6PWwASwFsQv8CbADTO2YFQgPfQB8C5P3YQMb+QAHuOokEaQGkO/sEygKKQSECNv53QRH/ugKUPBEDtP7sP7X9JgBKOysF3v3APMT+1wKRPCECswJyQdMCXgLAO98D0f5IQs7/6gFVQmcBPQOCPTICnf1aPYn+jv5KPo797AEpO+ADXQGUQjECTQAtOnUE/ALwQP4CcQCmQgwDJwHkOz0F0gD6P74AfADQOtgElADIQX0AxP7gPAj+V/8gQj//kf4RQW3+tv5sPbv9WgPyPZECev1pPlD+u/4wP8z+SANHPUQBbwB9QmcAWQNMQFcAcgCvQl8AIAKGPAUBZwGzOuoD7gFLQjACnf/GPOT9f/+gQZn+qgJ+QYwABAFXOs4DDgPkQGcAh/9APZL9UwIDQj8Bm/4EQoj/UwDbQmUBawNwQN4ATAF1QmkAPQNJPUUAjP8DQQz+xQC0QcwAbP9LPGb+7QKnPHsAZQMcPhgA1QFKO1MENgCUQXgAXgD9OesD3wE2QrkCKALkQVoArwAPQWkAAgLVO5gEgP8XQI393f4YMBv/iP+5Lkj/mf9vLzD/jQP4LpEDiAPcL6YDm/+7LW//ZANnKxoDkv9eLFL/mf8WLXT/YAMXLToDkf+BK0T/YQMwLDED4f2yL4D/r/5GLHP/8wIELWAAyf3DLqz/GANSLG4As/4ULZX/IQNiK10ATf+6LRAAtv5wK2L/1f8RLUsAnf7VLmf/SwOjL0cAlP/uLxL/dAJRLQEA1/5ZLPX/MAO+LlgArv65L0D/EQP0LWEATf5fK8L/tv7SLYj/QQIEL9wEfwM0LXgBmAPBL64AMwLJL/YEXf2DLP//fQNMLFcBiQPTLtUAV/10K+z/igNgK0UBKwIVLscE1APOL1IBJ/2pL+H/wwENMDcF4ALKL4kELQJRLIMEsgPpLkcBUv2kLun/1wK/LnoEJAIwLZcEjgMwLjABlgKcLXAEHgJXK20EwwO8LhYCKwFELNMEUAHhL0sFgwNJK7kC5QOoL0kCWwEzLeQE9gJoK9YDDQHwLloF7QJLLO0D/gBSLjEFdQMmLcUCTQFqK68E9AIKLe8DmQPCLSwCdANvLL8CdQCSLR4FZAB6LPQEhwMALgQDkQDJL2QFhwNbLDQCfAKGKzYEZAA6LQgFhAMPLS8CegCELk0FKAOpLdEDnwF5Lx4FvwPjLxsDSgOvLvMDYAAlLjoFsgPOLvQCbgB8K9AETAO/LwsEigE4Lg0FlANpKxMCZANxMDIE8AMNMUgD7wOUMP8CaQAcMYsFkACaMHgFSwEbMXUFBASEMPYBWwGNMGMFHgQbMUcC8wIcMcAEEQIRMUcFHv0KMXv/9gKOMKkE8gGiMD8F9wOdMDwBBv2HMLz/vQM2MWQAVQJtMA4FtAO6MIYAaAIdMSIFpP8kMaD+S/4gMDz/of+dMNH+XgNgMCQAoP22MEn/+P3PMBf/E/4UMfT+ngOWMMoDlQMWMQIEy/4PMcL+sP6nMO7+5flTNrP/yPnWNaz/awCGMY8FK/1rM/f+q/uKMu//jPoqNcb/kgUINWcA0gRGM8cCcQTjN3oATwLvNSMEEwRjNykBzfzHN0X/SwHBMzgFE/0fNNX+uQQ3MjYC9QOYNk8B6AQQNMwCTABHNBYFAwDCNTsAQwEYM2kFPAQkMi8DiwSFMQsC6/zcNML+1PoPNwr/IgSeMeQC5ASpNlkAawDTNNQEAAXpNMUC5ASxNcECjwBmNWoE8gBjNocDUgBMMo8F+vysNZr+nwRpN1wAh/qLNgH/Cv39N43/7AP9NyMBA/zENRH/AQXaNTIC+wN3N2MAVP/sN0QAQgGHMYAFVgDgMz8FJwTdNVkDSQX4NFoBaPvxNLb/CwY/NXMAIAPWNR8EWQaeNWkArQOdNmwAXwWXNV8BdfudNWj/PwRjMRgCYwAfM3cFbPzVNB//HgWoNHgCSAEUNBcFGf8oNxoABP+lNhoAowRoMrkCEAUANDECWgHcNNAEYv1rMg7/m/sqM9j//wP9N3IAQQE+MoMFQQKDN+MAbgGYNtUAYQF1NWAE7gQeMzECjfsANMT/BAOIMb4EVwDRNf0DgQJbMyMFFwTGNcQBiQRFMl8A8/x7MYz/MAQVMS8BGQKGMU0Fg//eNAwA1v+bNUoATQIMNBIFOQXqNBUCBQN0NqoDLgZ6NmMAIgLRNNQE4wQ7N+YBM/xFN/z+TvujNpb/XgWMNn4B9gOxNWAAXQEcM7EAKQVmNNUBoQNJN8cCZgTzMMkAcfttN37/cQU9N08B1wSQNhsC/ft6Nvn+CgNBMtQEIwI8MlIFwAD+M3kATARHNbsA3wOdNgoDQgJqNYAEZwRZMYEA/vxAMlz/rwRENqgC4gT2NGcAKAR9MUsAAgK6MzEFRgHyNfADFQFLMr8ADwMJNNAEDP2MNpn+kPr/NRb/zfxKM0T/EwIVM0gF+AIeM+0E/QOKNzIC2fxjN+b++AS4NXEAegJnMR8FcwTiMCcB5AJ4NW0EsQQgM2YAEwTJNR8BhwIUMiQF6QXkNjgAuAFxNqsA9AMhMhcAwgNVMTgB0AT9M2kAlPozN5v/nQU2N3kAFgPPNKIEVwJkNrQD2f2RNmP+qgPZM3EEgP/GMZH+Rf/END7+lQMKM4MEc/+vNTr+0v1xN6n+EwPAN0kC4QL7N+sB5v32NwX/+gHONjgDnP4tNkP+hv9pMoD+gwPvNF4EMQJTN9gCzf9bNEb+yf+mN8b/fgOOMVEEVf/gM1X+ZP8tM2z+nf6wNlf+AQNONwUDigNYNo8D/QLdNlkDDwEHODQBnANWMmIEZgHKN5ACrv+YN4z+Mf6aNUH+7gPmNAQEp/7tM17+0P2XMf7+qv+dNlT+mf4UM4P+vwO0NeQDQP77NEb+BgQpMwkEowDeNjAD8f1JMtL+bP6bNEv+n//wN7H+SwETOGYCGQT3MwYEPABRN+sCCAMtOHMAqf4KNT3+z/0XM7n+XAQuNKMD3/5vMav+8AM7MuQDWwRdM4sD2P0CNIT+wf6+NTr+eACgNrEAvf3sNGX+t/3PNVj+UwFhN88C7QEhOPUAmgAGOIkCvgODMeUDtP5JMpz+XAQHNYUDZf+YOCn/2gBgOO4AmQFcOWcATQEHOm4AmQBUOYMAbwAFOn4AMwJ0OF4AfQAlOrMCc/5ZOOb/dwBwOGcCLwELOhkCxgH0OB8B2P5JOcD/OAFMOQACC//UOeD/JQJyOEcBn/6JOGr/swI9OI8Ah/9bOPr+WwF6OB0CiADWOXUCwwENOaIAcABUOVQCV/9oQFT+bwDdQnMAZQCcQl8AfwJSPCwATQMrQFIAdwFuOxEEBQFrPXgAAgJgQhoCNgEbO8wDgv9LPhD+NwCZPFgAWQMgPyQAuAKIQYwAlP+7QeT+if/xQH3+dAIMQkUBof7qQWj/CQPtQGkAjv+MPS3+HQN7PWMAhv1SQD//Xf4yPEL/RQGgQnAAR/86PU/+kAAFQzUBzQKpPHkAcQDlOuYDOwAiQ3gBjv+aPIj+5AFDQtICmf8gPwj+YwCoQYMAVANFPlgAkf/8Py3+zQEIPGoEnQACQWgAUwLgQWEAqf57PXn+XQNBPiQD2P0gP8H+kgJCQVoDPAAhQ/UB5AFNQn4A4v34P9r+YwNwQI0Cu/6aPM/+OALbQRADgQAEQ0UCPAP0QDYCE/7MQAP/DAAIPCgFTgF+QgAD7P4aPy7+PAN3PfYCgP40PmX+Bv+zPzf+zQKlQSEC6gKTPPcCOgHEO5kE2f5ZQsT/BQJlQkYBBwLEO9YDKf7jPAP/DgORPBsCsgJ+QdQCof4bQHf+9gLxQAEDSgHCQi8Cf/4uP1v+3/5nPjX+XQNkPS0C+v2FPeX+WgC/QVgAaAA4O2kEQQMZQCADdwDCQgcD2v1VPsz+9P7TPUL+XQMdP0MDsf73QMD+bACtO9cEa/8TQjD/ZQFQPwoFtwLEQI8DHgF6PUoFswAxPCAF2gEoO/YCQgEVQNsEYgAmP04FegPEPSACSQKcOxIDDwHlPDYFMgFoOmsAhwJTPUIERgHgQI4E9wIgP+cDLAFJPksFYgHUOl8AgwPTP7ICoAFiOwEAZQKCPAQE3AL3P8gDswLiOxUCiwMeP9ACmQNPPiwCWwBdQrUDBQF2QV4EvQCUPyIF/wGUQa4DrwMePxwCqwIAPNwCgANxPtcCXQGDPPQEYAB5PXMF+QJJPuIDUwBoOmIAJAHzPj4FYwATQAcFNALzQPQDlgFrPRMFaQCaPEsFlgMKQCsCZQBHPnIFHADNOg4AZgDtQL0EsgGZO4wBcAIiQCsEugK/PKMDdQObQOcBmgFKPh8F8wEPOyECFgFFQpYDYQCNQXAEd/9sO0L/3AKDPdQDSwFoOigC/QGlPI0EdACSOkYDngMIQF4BG/0EQJr/VwHKQfQDIAKBPbMEoQE/QTcEmQIGP1wEsAMfP0kBDv0gP4b/JP9oOvr/hAN5PrwAmQIIPMMA8AEUO08B8/4CO8//jv/RO/j+ggGrOjMCZQBdOvkCqv6nO3z/XAKOOzkBdgOcQHsBPf3HQM7/KwJHPr8EhQPiP60ASQHIOgUDNf2FPb//eAPCPWsBdQD0QSEEHwIqP7QEYf3uPNv/iAMgP5cABgILQH8ElgKePmsE1AEuO6MAGgDuO3EA3wGrQF0EH/1QPoz/lQNIPkgB9ABoOrQCKgKyO2UA/wYDLvwB4ga4L8MB8gbXLt4B/waVKwUCCgcXLRUCHwcuLAACCAfMKjABAAfZLa4AFQdvK0oBOwc8LEUB+AbALqoALAcdLTsB7ga7L5wA/wbNKmYABgdWK5IAHAfdLVwBCge1LkQBBwchLKEA9Aa0L0cBBgfvLJkAbgVeK0UBYAXaLRwAdQaLK10AlQWuKk8BfwaJKmcAFQVyLNUBrAYALSwAdgZDLCkADgUeLfcBRgWOLgEAhQaGK1kBjwVvK4AAuwbzLTwAgwaMKmAB+wQDLhQCnwWnKnUAbAUmLTsA8wTgLicCyAZXLycAvQbgLioA0gTeLwkCkQVILFkAPQaxL7sCwwUdLcECcQbQKt4B2AQLLjAB1AVSLKoCSQaqLskCdAZcKx8CQgXZLZECUAbbLdYCqwTeL0UBMQU7L4wCwwYRLHoCFwUwLaoAwwTdLnAB1gYULXACMwW7L5AC3gXPKtgB/wQKLpYAJAWcK18BXwYQLb8CpwWXL8wCxQbqLXgCpAVpKxECuAXXLtYCYwZBLK0C+AQSLTUBYAVYLFICtAb6LlwCuATbL7EALQbKK5wCggUILsICEwVKLFIB9ASsLnoAqAbuLz0CSQUnLWoC/ARyNhICoQaGMCoCmwRhMWEApAQGNEgBRAVbMvkCpwSkMHkAkgZcMUMCnAQjM0gBSgV5MeUCywR7NZEBlAYTMi8CLAUENYcChAWKMMMCkQXiNQICFwYnM7YCswT1ND0BkARLMmsAXAWpNbkCiAT3M2kAagbHMlsCmARpMU8BWAb1MzoCiwQfM2gAoQSLMEkBJgZNNp4BaQXdNMYCOAZFMrACSwbZNCACLAaTMcICUgUKNPQClgRGMkYBmwTuNGgAJAVQNqACXQUUM/ACJwanNRgCIQabMMICpgYMNE4B4ASFMDIC0waNMXkAJQURNp4CEQZSNtYBugYgMz8B0gZ2MDkAxQRoMSsCHAWNNJ4CwQRIMiwCUAbVNTUBEAX8M7MCwAZeMmcAlgX/NGQAMQVnNqoCigbsNFsBDAUbM7cChwWnNhoC0QaWMY0B0QQqMzgCqgYSNHkAAgVAMsgC3gawMIwBuQYeM4AA2QT6My4CsQWKNX8BZwadNWkACwVqMb8C7wTaNB8C7ATDNf0BFwXOMKYCVAYYNX8AyQY4MlkBhAUdNRcB7gY9MDUB5AYeMScB4gbjMJUA4gZIMdIAmQafIyUBwAblImAB1Ab3IZ8BwwbcI8EA0waGI6kCsgbKIjQCgwafIykC0gYBIv0BOQZEJmECrgXwKP4BHQUCKhUBYwYiJ3UCrgW3KQQCXAZ6JDUCzwbrKmoAXgW7Kl8BygXsJwcCLgZWJSwCHQUDKrsAgwbWKF0C4gU7JuABvwZlJacCsQaNJKIC0QXwJusBaQbJKTMCoQbKJpYC+QWiJd0BbQYKKHECVQWvKjgAvgYrJqECngbhKoIBqwUVJ1kBUgWqKVoAJwbnJjEAgAXeKHUAbQYzJjkA2AUcJkUBgQZ6JWUAvAXuJ2gA9wVvJWwBdgadKvoBGgWKKqgAmAaPJJ4ARQWuKXIBzQURJ50A7QVUJrMAYwXPKFMBvQWdKvIBJgaQJwYAhQUOKGABFQY5JRABQAZ9JFkBHAV2Kg8BkgfSKHMA1gdcJr4AaAfNKWoA1wcvJ7wA1Af8Jz8BzQdSJdUAmgcJKEsA7Qc2JlMBqAe5KGkBZQc0JkMAvQeOKLsAdAcUJykA6AcCJ0gBbQe1KVgBVgeEJIMA6geIJEEB9QZsKsgB5wdTJU4Bywf9J7MATwdRJWIAzwdcJ7sBHQeyKeQBHQeUJLUCJgdzJaECzwdMJu4BNwesKCQCGAewKkEB/gYWJqECbQfrJyAC1gdJJfMB4wd+JP0B6wbGJpcCUgcjJ1ICgAdlJlUCkAdpJV4CIgeuKm8AmAeXJHwCsQfMI4wCSQdrIuwBUAf6IUICWAdyIfoB5QenIykCVQc0IqkC4gfFIkUCSQfZIsEC0gcKIvwBMwe+I7wC5wfkInIBTwehI7IAUgdyIZUB7AemI0YBywcFIpIBTQenIjsBUQdKI+MATwf+IVsB2gdDILsC6AYDH9cBAAihISAC9wZyHh0C2QfiIKUC/QZcIVgCywevHq8C6Qd3H6wCNQhHHxoCUgdEIBQDVgcAIccCHAhfHgoCOAfAIScCWgd4HvICIAgmIScCMgg5ICcC/AcPHm0BSQdMHysDVAfAIWwBQghtHkgBXwhoHxUBHwg+ICUB4gfrHRkCFggYIV4BegeAHksB9QekIXgBMgjAHrUAJgg4H8IAXgd4HzEBcwfhHQ0C2AfZH9sATgc9IDQBXwcdIUQB2QaWH68BywYeIKoBuAbhIMMCaQY0IAUDoAZeH0gDlQavHtsCtQa4HmQCcQZeHxoCVgZDICICrAb6ICwC+QVEHwYD9QXcHvACEwbSH/wCLgZUHy0DRQbQHgkD5gVoHiMDRAZwHhUDKQanHQsD5AWXHSADBQfgHREDBwc+Hv0C4wYUHnEDvQbeHX4DugYtHnMDkgZrHiYDlAbcHRgDnQZxHYcDgQbwHJADjgbfHCADkAZhHRUD9gZvHS8D6QYsHS0D5gaIHXQDNQYhHJQDQAaAHJUD3AXeG4wD2QXQG04DPQYUHDoDTAZ8HDIDEQciHrsC9wYpHmMCTweZHTkCMwe2HbwCBgdIHVoCNQfQHEoCEAdEHFkCAgdDHMMCJgfUHMUCEwdLHcACuQZWHMgCxgagHLgCxganHHMCwQZSHFYCLQZNG7sCmAbTG2gCSwZaG3wCiQbRG8sC9QYDHLUC9wb/G2oCjwe2HXsB5we2HYEB6AekHe0BdQecHf8BagdRHNEBeAdOHfoBXAfEHO4B3AdGHdkBzgcVHdkBzgcHHZUB2AdJHYgBagdVHIsBbwe5HIcBfQdUHYUBtQa+G6MBhgaAG9UBngaxG+UBEwcQHOYBFAdoHOYBHAcSHI4BFQdkHI0BPwhTHroAPAg8HhUBFAj4HSgBMQj6HcAADgiKHb4AqwdLHQ8B5QcWHcEAoAcjHRYBtQdIHdAAAAiSHRwBsgcaHb0A6wcUHQ0BYwedHBUBygfbHMcAIAdHHAwBzAfaHAsBgQeuHMoApAGbGYED2QStIgkDmQPcHW8ASQTSGloBNwUGIpQARAM5HksEGAU2H0ACUwFGIGcEeQS6G0kBMQQyGkwBAAKdIZYD9ARWHjsCxgSlIwgDSwRhHAEAbwHvIHsEYALcHU8EOAWkH2sBuwTGHFgBCARyId4CQgTwIXUCSgW0InMAcwEIG6YDRAVMICgBYwQUIQ0CGARaGUAB5wQkIg8D6QSuHVoBUQQ/G8YALwSVGyMAbgSFIMwBVQUDIW0BBQTJGHIBYwWoI2kAeQEyGosDnwGOH1YE5wJnIZQDYwTZG4QAVQUZIkEBLQQKG2cAygCLIFcEAgVGIAcD6gIqIs0DAARhJJQDGQQoJXEDRARLIYEC0AP6IQgDxwFyHjwEZQHTG7QD/AQSIR4DywC5IGUEigTUIT0CGAQ8Gm4AHQIUIaYDPwO7IiYE+wNfGUkAMgVjINAAGwXbI4ACrwRgHgcDYwXUIlABVQGxHdMDkQTIHHYAcQWkI04BJAVnIogC+AOFGIsAMwUhIb0AUAGwHLYDyAGZIKYD7QSHH/gCXQREGzIBrQS+HWAAbgTwHOkCygR/HmUAMwV9IJgCDQMXIYoEoQNMGbkCMQFLHyMEiwSkHf8CTAGeHv0DPwQSID0BFwLpG/cDnAJuGXwD/QRVH5oACAM+IJQERQX/IRgCMAUMIaQCeANIGLACJQReHxUBRgWXIyQCYgK0IWsEvwMRGxoD8gQ4IGgARwS7G4UChQEzIZkD+wJgH34E5AI0Go8DXgRoG9sBCQKGHS4EWgRTHMACpQMVGu4C5gQmIUQASgXtIgcC7wKTHmkECQS1HuoAXQE8IMQDJAK7HBYEEwMhG60DDwXpITkAFQRGGh4CBgVjHkkBIQI3IIIEwgBZH80DKgJfGYYD/gILHOsDNAW0Hx0CKgIYIYUENQQiG0MC/AOrGwgD1gRfH1gBeQTwGwQCIgIMG9QDEQOyHAkE1wSfHSICKAKlHl8EfQQ6IHEBTwUTIQkC0wN3GBQC6AMQH8MApQTNHD8C/AKLHTgEtwOCHpAAGgI5Gq4DKgJlH28EKwSRHDEDswA2IPkDRwU5IBACaATlIKEB/gLJIWQE6QNlGTQCnACHHgQDdQONG5IDHQKIGFsDewCFHGIAGgVBJXYAigBYHwwDEQEJIEACOwApG0gBkwC7HU4AVgAzHLoAOwCHGE0BzQOvHKEDfAAoIDADCgGfH/oBNQB/GVIBeQO/IWEENQM1HjMA8AOzHccDSQCLHEcBEANcGUADsQMSIXwEYgB3GkcAOAVoJAgCyANAIHgEUgDTHTsBVwAiG4wA+wKdGCUDGgVuJTIBNgDlH8UBhgGvHYEAkwNwH2sE0AEaHjwAVwBTHyoCTgCKGGEANgEpIAkDPQCHGywBYgCZHioCSQBeGW8ANgPhGU8DdwO1HlMESAQDJUoDUgWRJFEBXwDOHQ4CwgCiGL8C5wMiIhgE7AC3G04D+AQ/JSsCNwAfIDABlwQgIb4DFgK4HRYAYACPHCYCtwCDGdQCEQWtJEkCkgRpIM4DMgMaImQDlQLsICsCPQX6JBQBRwSoJFwDUgC+HhsB7wDdHFwDrABCGt0ChgSyH7oD5QPcIuMDhgFYHoUAcwSyHo0DQQBpH2EBnwIuHywC8gOeI7gDqAAmG+cCTADsG+wBRgGJGCIDXASMI3oDggBgIGQACgH/H6QBVAAWGx4C7gNqHvkDSAWbJGgABAO0HRkAxACqGxoDUAFlGU8DDARCHyIEKQX1JDsAaATJIo4DXAAdGjMCsQCnHPgCPQT5HyAEOwF7HggBrAStJO8CZABjGTQCeAB0HpUACwFLGkgDpwCeHegCcQCSGDACJQQYIToElwBPH1cA0wT9JJ4CCgH7Gl4DIAFCH1kBdQQgIq4DjgCUFzMCFgIBFFABKwMfFV8AVwHOFcsCRQEEFTYCGgM0FFoAQAJfFWwBRgG0FtoCXQF3FN4BPAKAFZUAlQDKFh8CSgGZF/0CmgC8FSMCJgMJFWUBpwAuFQUCJQLtE4gABQJ1FT8ACgNDFE8BSwKBFeYA3QBmFoYC0QCrF6MCYAFOFbUCOgEPFG8AswB8FDoB0wKGFOMB5ALYFt8CJwFMFW4AEQMYFSQCeAAOFUABWACRF2cAzALKFcICCAOxF/ACTQCyFWoAWgC8Fm8AIQJAFcYCHwLfFfACMgL2FCwCrgBlFHoAPgEtFGkBYAM6F5ICTgB6F0QBDQLJFhMDPQJrFPgBgAD8FGIAOQElFXEBsQF9FcoAwwJIFaQCSQDAFVABSAPhFWgCNgKqFzYDUwDDFkoBrgObFyoCngPbFeIBlQOxFiUChANRFesBoQMcFUgB3wOFF3QAfAORFDUBzwOpFmIAwAPVFWQA6QOeF1oBngMBFX0AgQN0FIwA3QO0FigByAPkFUcBCQFBDboASQGKEGoBdAEuEuMBawDBEG8ATwGbDzwBLgGXDLkARQLkEMIBvQCKD8UAPwE/Ew4CRAFJFDgCbwDUEXUAJwGLEYoBggGjFAUCJQKSEeUBwACcEAIBtgAlDVsAagNGEp0BeAFcDfsAtgFODPEALwEZDxABxABZFMkBVAOXFFUBkgBDD3UAsQDKERkB2wKjEdQBiQBtDkkAYQFVDhYBJAOiDLUAAgMREHEBJgJ+DSABpAAeE1AB5AJFEysCPgOWEHUBPwJjDPwASwOADckAAgN1Eu4BswBDEjIBcQOpCxMAswKiFO4BQwI6D2oBpABXFFUBBANEFC4CSwJKDkMB4gCQFCEAPwOLEZsBLgJyEiACaQA8E2cAqQJQDOgAwAHOEK8BbgBOEoAAAgJCE1gCDgFMEqcB6AKGDf8AIQLyD5ABEwNaDhsBOAJaFHcC9gCcFH4BAwMVD0IBDQKkFCQCjABVFHkAlwF3EccBJAKZCswAIgSXDzoAygACBQoArgJQBx4AGwTJEHIANAKcCbAAtQI2CCsAMQJZC9gAygKqCCgAEgSxEW4AhgP9DvcAzQB8BS0AkAPWDFMATgHfBFUA3AKgCVIAPAI3B3gAuQO4EBUB5wLVCn4AoAN/DXIALQJnBn0ADALhCKQA0QNUDnoADAOUC4IA5wMHD4gAtwPhES4BPgI3CIEASAFrBWkAdQN0FLsBDgKbC+gAFgLuBEIAsQN+EksBTgEhB2kAzQAYCyMArQNAE1ABRgF4BnIA0ADCCRMAnANKFEwBgwEICZ4ADgJZBXAASgFdCG4AvgDTCyYAOwHpCpAA+gNsEowA3AAwBg0A6ANHE1UATgG9CYwAsgNPFHYAmwKjBRYA2QDQBwkAOQGlC50AygAeARoG2QByAAwGWwE+AU8GVwF+AE0GFwJAAUsGGwJiAEAGwgKZABsG0QIsARsGeACLAMsDKAL+Aa4EMwBuAdADpwLCAXsFIANuAbQFkADwAdsDDANQAKUFHwLKAYQFPgEfAM4D8wLgAaAEOAITAJoFPgE4AuIDIwNKAMUEUQKgAecFYwOuAZ4EHwIPAMkDPgHHAWIFpwDSAYsEAQJMAtMDNABFAcAERgEiALIFZQCJANIEQgGsAbwFeQNOASQDSwHwAb0E/wJPAL4DeQO6AVcDgwCOAKwFdwBLAZwFOgEYAN8EAgMTAtADjAANA3IAlwNLAdkD8ABLA5cBEwN1ABEDfQPNAJIDJgIYAy8CcgAgAmMAZQM1AbAChwBLAWMALgILACQCagFlBD4AFwM0Av0CzACHA+QAdwPAAbcDtgDCAHMAMwETBIYAmQKiAtcCNQEmAEIB0gLWAiUCmgD5AkoBCQIGAK4CXQA+AlcBOgM1Ai4CKQK7AtICPwMxAc8BYAA/AWwBSgJ6AlkDPgFLAEQAPwGrA0ABpQCZAF4B4gJjAB4CwQDFAzkAbQAyAjUCNwM4AjIB8QILA1QBOAEdAOECvADLAhgClgOxALoEVwG0As4CbQDDAHMCyQJyAD8BxQLOA1IApgNJAbYEMwNNAUcBKQI0ADgALQF+AiMDSgB1AVkCJwK5Az8BJAMyAnAAgQJVA68BSQAuAd8CCAMPA3UAkwCAAOgCMQEEAzICmwMjAXYFsQKIAxcByAKoAF0AIQJwBDUAPAEdAPUBhQOwAJEFQgIlBIgADgIQACwBDgNdAUwAgwAhAuoCpPncLs//mfm5L6T/vPn3LeT/wPkULfT/m/nOKuD/kvkyK9X/9/q6L+f/HfocLfX/N/ovK9v/OfrcKuH/YPrgL2r/XPrULrj/Uvr+Lej/avrONNv+gvrUNfT+cPo4M/j+HvolNif/bPrTM+r+Hfv2NAj/Z/plMg//W/vNNQ3/+PqAMx////pQNAn/UPqCMR//dfudNWP/dfvpNJP/mPr3MTP/ffv2M6b/nPo2MTf/SvttNvr+WPpmMET/cvs1M7v/P/q7NVb/ifokNb//U/tLMs3/fPprNvj+PPugMc7/DftbMM//pPneNIn/yvnGNZn/m/kuM4b/lvkwNIv/k/kkMpL/zvlsME7/mvlLMYL/+vmgMhv//PloNRX/5fnUNBj/6PkpNBT/5vn3MiT/TPqyKdP/DvraKN7/V/qoKsD/ivmqKqT/CfmnKuj/6fj2J9//8/jNKNL/KPmcJvn/7fjGKdz/WfkDJ+7/efndJ9f/hfnRKLb/i/msKaD/7PgXJ/L/IvupI13/JvzWIgj//PxvHwH/OvwHG6b/J/ykI+T+NPvZIoH//Px+Htf+Sfw3Gqj/Uvx4GaD/bvwuIhr/XPx8GKT/I/0DICD/R/2SHfn/YvsBIqH/0/tyHZX/svyEGDX/gfsZIc7/vfqmI8v/9vz1IQ3/m/2DJJb+KPzdHFH/xfoYI+H/mfxTGUb/g/s/INf/X/y0Hgv/r/xBGjf/iftTH8r/EP2dI7v+rPwIGzP/iPtiHtr/MPzUG4T/7fzZIuD+bfxFHxb/n/uhHdT/gPzGHAv/Af2BGQH/FPwBIXv/sPvsHOH/Z/zmHQj/Kf13GOn+Gfw0IG3/I/0oG/X+APxDH1n/9ftZHlv/Df1RGgH/8/wAHO3++Pt7Iiz/pPvRIwv/yvxGIDb/9vyhHdD+CP0aITf/C/zUIUz//vykHNj+Xv9TGZ//rP6PGPP+Yv+YGJ7/2/34G9T+O/6aHzP/rf5IGfv+f/5yGgT/hfuTJAv/2P25HdX+VP85G83/4v1HIDT/5P2QHNH+kf5CGxL/ifs/JRH/Tv9wGq//5v0AITf/v/5pH4v//P1jGcn+eP4nHAX/Hv6IISf/2f20GMP+wP6BHm7/P/9nHfD/kP79IGT/0f0yG9/+cv6dHAX/tP5CIIv/Pv/VHNv/dv7PHRr/xf1LGtz+zvz+JJ/+Kf9XH/n/Kf+BHur/7P4zHGX/Af2MJKH+0P3uIQX/wf2uI7D+3f6WHXX/1v3EItr+5f7MHGz/Mf9SIP3/xfpvJL//Wf7iIRT/1v1YHwb/Ef8WGTn/6v1qHub+DP94GDD/FPyOJNL+Cf8oG27/F/tRJXn/Wv6NIu/++P6GGlL/C/upJGz/oP2WHfj/h/34Hxz/IfwhJcz+DP+SFkP/Dv+qFTn/Cf9tFz3/4P1JFJn/3f36FHv/zv7uFIT/tv5mFKj/yf3AFtf+7f0AFtr+6/28F8z+Xf8PFbf/k/4VFQb/Kf+IFOX/vP6wFQb/Yv+8FrX/nv6lFvz+Yf+1FZj/XP+HF6f/1P0XFfH+nP5uF/f+Qf0pFQ3/Ov0tF/T+F/0RFhH/JP2KF/n+u/zJFWP/f/wjFdP/ufybFlP/tPx5F0r/YPxpF7//Hv1sFK3/c/yGFrH/9Pz2FJL/efzFFb//N/yBDLP+0vxfFHH/ff77D0L9Z/yjERj+4v1ZDTf9Cf2FDIz99f3QCbf9gf5MB/r94P1XBYb/gv6WEF392P2eDFP9BfxXDcv+cf+gC4j/4P20Cpr9qf5oBhP+xPz3DJ790vtfDq3+lP4ACeT9+f32Dg79Wv/VCr//Ofy7EPn9s/viDkT/1/2XC339df0MBlf+yP0qDhv9uP5ECAj+wfvgDrX+tf2/BJr/LPzKD979W//9CYn/5v1OBgr+t/6xCtP9QfxsE5P/kvzTD3H9IfzwDtj9svuWEHj/Rv97Baf+T//bCLP/wvupD7D+2P3PEEn9//tsEnP/wP5oBaD/wf1MBwz+Tf8FCJP/w/4OCu/9PPxGDtb94fzjEHz9ef5TDU790f3MDxn90fvfENH+9P1aEWr9vf50BJr/XvwgDf79Qf8KB7D/wP1LCPv9oP5BDkb9Bv9mBlj+dvyEDBf+z/6tC8P9+ftJEZr+Rv9fBo//o/4QD0H9Of/5BOb+z/38CN399fx4EaP9afwrFMj/FP9WB2P+TfxWEp/+rP5TBcD+Rf/9B8P+7/xtEgn+u/vvELn/dvwwE+/+W/9jBYn/Dv4iBR7+Sf8GCbj+Ov3tEin+3fvBEXz/O/94BsX+QP/wBJb/+/1MBRD+uP7EBJf+Q/8FB+P+Nf+oCyr+nP4fBSj+BfxbDZz/Zf+mC53+O/yJDLn/KP0tFPL+3P1PBbX+wvsMD8P/4P3eBKr+/PxsE5n+Pf8cCm/+tP5qBRD+0vtKDpH/Xf/JCsH+r/9GDrX+Uf+WEAL+DP0/CIz/ivz2Cpz/7PwPCaP/T/1rBfH+4v0+FNf+X//FD/T9r/8OD57+lv5mEv790/18E2D+O/+HES/+Zf0mBeL+jP9pDNb+KP2GBoD/nv89Dbr+H/1yB4b/Z/ycC3n/UP8lDfz9yv1pEs39oP4sFPP+e/9/EZ3+6/0YEyz+T/+3DBb+Vf8oFLL/cv9oE4j/w/zRCaD/pP+4D3j+9/7dEnn+X//9Duz9Wf8bDuv9m/9LEoj/pvxzCq7/qP5jE43+nv/UEK3+sf+FEZj/O/2xEEz9+f4/DZv97/5lFGn/Ef3XDzb9j/wkD2X9qP6XDIL9Wv9gEsL+/v5PD3r9pvyxCpr+wv/BEJL/TP2MCDz+xPzQCc/+3f2PEX39Mf82E+n+R/0SCSD+7/4KDnr9uv+RD8D/wf7yEJj9NP3pCQH+Bf30CJj+Sf2DBaH/cf2FFEX/wP/nDlH/NP2HDUP9Bv/tD5T9sv8fDnz/Ef3HCvL9Iv04CJ/+efwfC/r+l/8aDar//vz8DjD95vycC+n9Nv1FB6v+afyrC7/+sf6QEcD9Yf0gBan/lP+0DHn/RP1DBqz+7vw3DkX9Uv9PAaD+sv5UAHL/uf2xBJ7/gf83AqP+gv8TA43+Pf/QA+z90P6kBJz/V/8QA8D9x/1KAHj/ZP/aA3v+Yf8eArH9Nv9xBJ/+P/9dAbP94/5uA279OP9hBGL/2f66BJ3+1f1iAKP+Y//mA2f/xf3rA479Af8CAYT9k/6fAM390v2aBPz9Yf9JAUz/sf54AJ7+y/3MBJf+Lv3EAmX9MP/KAFX/P/01Alb9H//iAGf+uP6IBP39hv8CA3n/0/2bAML9Pv1kAWD9iP8WAkT/yP7pA5/92/0JA0L9M/2RBK7+7vw3Arn96vzbA5v++/0hAiL9Af0EA7r93f1EATb9dv56A1j94/2+AGD9I/1HAav9oP4wAir9Bv1AAZf+Vv2uAK7+0/76Ak79LP3hA9n9j/6+AGD9z/wVA5n+TP2BBCz+5/2GA1z90/wjAqb+w/5NAUL9Mv8YAl79Sv2yAGP/CP1RAUr/4PwvAlL/NP+RAWj95PwdA13/B/3pA2T/Sf17BHj/", "n": "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", "j": "Li4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0sAAIBLCwsLCwAAgEsLCwsLCwsLCwAAgEsLCwsLCwsLCwAAgEsLCwsLAACASwsLCwsLCwsLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwsLCwsAAIBLAACASwsLCwsAAIBLAACASwAAgEsLCwsLAACASwsLCwsLCwsLAACASwsLCwsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLCwsLCwAAgEsLCwsLAACASwsLCwsAAIBLCwsLCwAAgEsAAIBLAACASwAAgEsAAIBLCwsLCwsLCwsLCwsLCwsLCwsLCwsAAIBLCwsLCwsLCwsAAIBLCwsLCwsLCwsAAIBLAACASwsLCwsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAAAACwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAAAsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAAAsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAAAACwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAAALAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgErKhwdKyocHSscHR4rHB0eKxwdHiorHB0qHB0eKiscHSocHR4qKxwdKiscHSorHB0qKxwdKSocHSkcKh0pHCodKRwdHigcHR4oJxwdKBwdHigcHR4oHB0eKBwdHignHB0nKBwdJyYcHScoHB0nJhwdJyYcHSYnHB0nHB0eJyYcHScoHB0nKBwdJhwnHSYnHB0mHCcdJiccHSUcHR4lHB0eJRwdHiUkHB0lHB0eJRwdHiQcHR4kJRwdIyQcHSQlHB0kJRwdJBwdHiQlHB0kJRwdJCMcHSQlHB0jJBwdIyQcHSMcHR4jHB0eIhwdHiIcHR4iHB0eIhwdHiIcHR4iHB0eIhwdHiAhHB0hIhwdIRwdHiEcHR4hIhwdISAcHSEcHR4gHB0eICEcHSAhHB0gIRwdICEcHSAcHR4gHB0eHxwdHh8cHR4fHB0eHxwdHh4fHB0eHxwdHh8cHR4fHB0eHB0fHB0eHxwgHR4cHR4fHCAdHhwdHh8cHR4fHB0eHxweHR8cHR4fHCMdHhwdHh8cIx0eHB0eHxwdHh8cHR4fHCAdHhwpHR4cIB0eHCkdHhwdHh8cHR4fHB4dHxwjHR4cHR4fHB0eHxwjHR4cHR4fHB0eHxwdHh8cHR4fHB0eHxwmHR4cHR4fHB0eHxwdHh8cHR4fHB0eHxwmHR4cHR4fHB0eHxwdHh8cHR4fGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcXFxcXAAIBFwACARcXFxcXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXFxcXFwACARcAAgEXFxcXFxcXFxcAAgEXAAIBFwACARcXFxcXAAIBFxcXFxcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACAQYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAMCBAADBAIAAwQCAAMCAQADAgEAAwQCAAMCAQADAgEAAwQCAAMCAQADBAIAAwQCAAMEAgADAgEAAwIBAAMEAgADBAIAAwQCAAMEAgADAgEAAwIBAAMEAgADBAIAAwIBAAMCAQADAgEAAwIBAAIAAQMCAQADAgMBAAIDAQACAwEAAgABAwIAAQMCAAEDAgABAwIAAQMCAAEDAgEAAwIDAQACAQADAgABAwIBAAMCAwEAAgMBAAIAAQMCAQADAgMBAAIDAQACAAEDAgABAwIDAQACAQADAgABAwIBAAMCAwEAAgABAwIBAAMCAwEAAgEAAwIAAQMCAwEAAgEAAwIBAAMCAwEAAgABAwIBAAMCAwEAAgMBAAIBAAMCAAEDAgABAwIAAQMCAQADAgEAAwIDAQACAQADAgEAAwIAAQMCAwEAAgABAwIBAAMCAQADAgMBAAIAAQMCAwEAAgEAAwIBAAMCAQADAgMBAAIDAQACAAEDAgABAwIBAAMCAAEDAgABAwIAAQMCAQADAgABAwIDAQACAAEDAgABAwICAgICAgICAgABAwIAAQMCAQADAgMBAAICAgICAAEDAgMBAAICAgICAQADAgEAAwIAAQMCAgICAgABAwIDAQACAwEAAgEAAwIBAAMCAwEAAgEAAwIAAQMCAQADAgEAAwICAgICAQADAgICAgIDAQACAAEDAgEAAwIAAQMCAQADAgABAwICAgICAAEDAgEAAwIBAAMCAQADAgABAwIDAQACAAEDAgEAAwICAgICAQADAgICAgICAgICAgICAgMBAAIAAQMCAQADAgICAgICAgICAgICAgMBAAIAAQMCAgICAgABAwIBAAMCAQADAgABAwIAAQMCAwEAAgEAAwICAgICAgICAgEAAwIBAAMCAQADAgEAAwICAgICAgICAgEAAwIAAQMCAQADAgABAwICAgICAgICAgEAAwIDAQACAQADAgABAwIBAAMCAQADAgICAgICAgICAAEDAgICAgICAgICAAEDAgEAAwIAAQMCAgICAgEAAwICAgICAgICAgEAAwIDAQACAgICAgMBAAIDAQACAgICAgICAgIAAQMCAAEDAgEAAwIAAQMCAAEDAgICAgICAgICAQADAgABAwIBAAMCAQADAgEAAwICAgICAgICAgABAwIBAAMCAgICAgABAwIDAQACAgICAgABAwICAgICAQADAgICAgICAgICAgICAgICAgICAgIBAgADAQIAAwECAAMBAgADAQIAAwECAAMBAgADAQIAAwECAAMBAgADAQIAAwECAAMBAgADAQIAAwECAAMBAgADAQIAAwECAAMBAgADAQIAAwECAAMBAgADAQIAAwECAAMBAgADAQIAAwECAAMBAgADAQIAAwECAAMBAgADAQACAwEAAgMBAgADAQACAwEAAgMBAAIDAQACAwEAAgMBAAIDAQACAwEAAgMBAAIDAQACAwEAAgMBAAIDAQIAAwEAAgMBAAIDAQACAwECAAMBAAIDAQACAwEAAgMBAAIDAQIAAwEAAgMBAAIDAQACAwECAAMBAAIDAQACAwEAAgMBAAIDAQIAAwEAAgMBAAIDAQACAwECAAMBAAIDAQIAAwECAAMBAAIDAQACAwEAAgMBAAIDAQACAwEAAgMBAAIDAQACAwEAAgMBAgADAQACAwECAAMBAAIDAQACAwEAAgMBAAIDAQACAwECAAMBAAIDAQIAAwEAAgMBAgADAQACAwEAAgMBAgADAQIAAwEAAgMBAgADAQIAAwECAAMBAAIDAQACAwEAAgMBAAIDAQACAwECAAMBAgADAQACAwECAAMBAAIDAQACAwEAAgMBAAIDAQIAAwECAAMBAgADAQACAwEAAgMBAgADAQACAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQIDAAECAwAsAAAAAQAAABcCAQABAgMAAQIDABcCAQABAgMAAAAAABcCAQABAgMAAQIDACwCAQABAgMALAAAACwCAQAXAgEALAIBAAECAwAsAAAAAQIDAAECAwAXAgEAAQIDAAECAwABAgMALAAAABcCAQAXAgEAAQIDACwCAQAsAAAAAQIDABcCAQABAgMALAAAACwAAAAsAgEAFwIBAAECAwAXAgEAAQIDACwAAAAsAgEAFwIBABcCAQABAgMAAQIDAAECAwAXAgEALAIBAAECAwABAgMALAAAAAEAAAAsAAAAAQIDABcCAQABAgMAFwIBAAECAwAAAAAALAIBACwCAQABAgMAFwIBAAECAwABAgMAFwIBAAECAwAsAgEALAIBACwAAAAsAgEAFwIBAAECAwAsAgEAAQIDACwCAQAsAAAALAAAABcCAQAsAgEAAQIDACwCAQAXAgEALAAAACwCAQABAgMAFwIBABcCAQAXAgEALAAAACwCAQAsAAAALAIBABcCAQABAgMAFwIBACwCAQAsAAAAFywAACwCAQAsAgEALAIBACwCAQABAgMAAQIDACwCAQAsAgEAFwIBABcCAQAsAAAALAIBAAECAwAXAgEAAQIDAAECAwAsAAAALAIBABcCAQABAgMALAIBAAAAAAAsAAAAAQIDACwCAQABAgMAAQIDACwCAQAXAgEAFwIBABcCAQABAgMAAQIDACwAAAAsAAAALAIBAAECAwAXAgEALAIBABcCAQAsAgEALAIBACwCAQAsAAAAAQIDACwCAQABAgMAAAAAACwCAQABAgMALAAAAAECAwABAAAALAAAABcCAQAXAgEAAQIDACwCAQAXAgEALAAAAAECAwAsAgEALAAAACwXAQAXAgEAAQIDACwCAQAsAgEAFwIBAAAAAAAsAgEAFwIBAAECAwAsAAAAFwIBAAECAwAsAgEAFwIBABcAAAABAgMALAIBABcAAAABAgMAFwIBACwCAQAXAgEAFwAAACwCAQAXAgEAFwIBAAECAwABAgMAAQIDABcAAAAsAgEAFwIBAAEXAgABAgMAFwIBABcCAQAsAgEAFwAAAAEAAAABAgMAFwIBABcAAAAXAgEAFwIBABcCAQAXAgEAFwAAABcCAQAXAgEAAQAAABcAAAAXAgEAAQIDAAECAwAXAgEAFwAAAAECAwAXAgEAFwIBACwCAQABAgMAFwIBABcCAQABAgMAFwAAAAECAwABAAAAAQIDABcAAAAXAAAAFwIBAAAAAAABAgMALAIBABcAAAAXAAAAFwAAABcCAQABAAAAFwAAACwCAQAXAgEALAIBABcAAAAXAgEALAIBABcCAQAsAgEALAIBABcCAQABAgMAFwAAABcCAQAsAgEALAIBAAECAwAXAgEAFwAAAAECAwAXAgEAFwAAABcCAQAsAgEAFwIBABcCAQAsAgEALAIBACwCAQAXAAAAAQIDAAECAwAAAAAAFwAAABcCAQABAgMAAQIDACwCAQAXAgEALAIBABcCAQABAgMAAQIDABcAAAAsAgEALAIBABcCAQABAgMAAQIDABcCAQAXAAAAAQIDAAECAwAXAgEALAIBABcAAAAsAgEAFwIBACwCAQABAgMALAIBABcAAAAXAgEAAQIDABcCAQAXAgEAFwIBACwCAQABAgMAFwIBACwCAQABAgMAAQIDABcAAAABAgMAAQIDABcAAAAXAgEAAQIDACwCAQAXAgEAAQIDAAECAwAsAgEAAQIDAAECAwAsAgEAAQIDAAECAwAsAgEAFwIBABcAAAAXAAAAFwIBAAECAwAXAgEAAQIDAAECAwABAgMAAQIDAAECAwABAgMALAIBABcCAQAXAgEALAIBABcCAQAsAgEAAQIDACwCAQABAgMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQIAAwEAAgMBAgADAQIAAwECAAMBAAIDAQACAwEAAgMBAAIDAQACAwEAAgMBAAIDAQIAAwEAAgMBAAIDAQACAwEAAgMBAAIDAQACAwEAAgMBAAIDAQACAwECAAMBAgADAQIAAwEAAgMBAAIDAQACAwECAAMBAAIDAQACAwEAAgMBAgADAQACAwECAAMBAgADAQACAwEAAgMBAgADAQACAwEAAgMBAAIDAQIAAwECAAMBAgADAQIAAwEAAgMBAgADAQACAwEAAgMBAAIDAQACAwEAAgMBAAIDAQIAAwEAAgMBAgADAQACAwECAAMBAAIDAQACAwECAAMBAAIDAQACAwEAAgMBAAIDAQACAwEAAgMBAAIDAQACAwEAAgMBAAIDAQIAAwEAAgMBAAIDAQACAwEAAgMBAAIDAQACAwECAAMBAgADAQIAAwEAAgMBAgADAQACAwECAAMBAAIDAQACAwECAAMBAgADAQIAAwECAAMBAgADAQIAAwECAAMBAgADAQIAAwECAAMBAgADAQIAAwECAAMBAgADAQIAAwECAAMBAgADAQIAAwECAAMBAgADAQIAAwECAAMBAgADAQIAAwECAAMBAgADAQIAAwECAAMBAgADAQIAAwECAAMCAgICAgICAgIBAAMCAQADAgEAAwICAgICAgICAgEAAwICAgICAAEDAgICAgIDAQACAAEDAgABAwIBAAMCAgICAgABAwIAAQMCAgICAgEAAwIBAAMCAQADAgABAwICAgICAQADAgMBAAIAAQMCAAEDAgABAwIAAQMCAAEDAgEAAwIAAQMCAgICAgICAgIDAQACAwEAAgABAwICAgICAgICAgICAgIBAAMCAAEDAgABAwICAgICAgICAgICAgIAAQMCAgICAgICAgICAgICAgICAgEAAwIBAAMCAAEDAgABAwIAAQMCAgICAgICAgIBAAMCAAEDAgABAwIBAAMCAQADAgMBAAIBAAMCAgICAgICAgIAAQMCAQADAgABAwIBAAMCAAEDAgEAAwICAgICAQADAgEAAwIBAAMCAQADAgICAgICAgICAQADAgABAwIAAQMCAgICAgABAwICAgICAwEAAgICAgICAgICAgICAgABAwIAAQMCAwEAAgEAAwICAgICAgICAgICAgIDAQACAQADAgEAAwIAAQMCAgICAgABAwIAAQMCAQADAgEAAwIAAQMCAgICAgEAAwIBAAMCAAEDAgEAAwIAAQMCAwEAAgICAgIBAAMCAQADAgEAAwIDAQACAwEAAgABAwIBAAMCAQADAgABAwIBAAMCAgICAgEAAwICAgICAgICAgEAAwIBAAMCAAEDAgICAgICAgICAAEDAgABAwIDAQACAQADAgEAAwIAAQMCAQADAgABAwIDAQACAwEAAgMBAAIDAQACAwEAAgABAwIBAAMCAAEDAgMBAAIAAQMCAwEAAgEAAwIAAQMCAQADAgMBAAIDAQACAAEDAgMBAAIDAQACAQADAgMBAAIDAQACAAEDAgABAwIAAQMCAQADAgMBAAIBAAMCAAEDAgABAwIBAAMCAwEAAgEAAwIAAQMCAwEAAgMBAAIBAAMCAwEAAgMBAAIAAQMCAQADAgABAwIBAAMCAQADAgEAAwIBAAMCAAEDAgMBAAIAAQMCAAEDAgMBAAIDAQACAwEAAgEAAwIBAAMCAAEDAwIBAAMCAQADBAIAAwQCAAMEAgADBAIAAwIBAAMEAgADAgEAAwIBAAMEAgADAgQAAwQCAAMEAgADBAIAAwIBAAMCAQADAgEAAwIBAAMCAQADBAIAAwIEAAMEAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAAAABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYHCAkKBwgJCgcICQoHDggJBwgJCgcICQoHCAkKBwgJCgcICQoHCAkKBwgJCgcOCAkHCAkKBwsICQcICQoHCAkKBxEICQcLCAkHCAkKBxEICQcICQoHCAkKBw4ICQcICQoHEQgJBwgJCgcUCAkHFAgJBwgJCgcOCAkHCAkKBwgJCgcICQoHCAkKBwgJCgcICQoHCAkKBwsICQcLCAkHCwgJBwkICgcICQoHCAkKCQoHCAkKBwgJBwgKCQoHCAkKBwgKBwgJCgcICQoHCAkKBwgJCwwHCAsHCAkLBwgJCwwHCAsHCAkLBwgJCwwHCAwHCAkMDQcIDA0HCAwLBwgMBwgJDAcICQwLBwgNBwgJDQwHCA0HCAkNBwgJDQcICQ0HCAkOBwgJDgcICQ4PBwgODwcIDw4HCA8HCAkPEAcIDxAHCA8QBwgPDgcIDxAHCA8QBwgPEAcIDxAHCBAHCAkQBwgJEAcICRAHCAkQDwcIEA8HCBEHCAkREgcIEQcSCBEHEggSEwcIEhEHCBITBwgSEQcIEhEHCBIHCAkSEQcIEhMHCBIHCAkSEQcIEwcICRMHCAkTBwgJEwcICRMSBwgTBwgJExIHCBQHCAkUBxUIFAcVCBQVBwgVBwgJFRYHCBUWBwgVFgcIFRYHCBUHCAkVFgcIFRYHCBYHCAkWFQcIFgcICRYVBwgWBwgJFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAAAXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAAAXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwAAABcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAAAXAAIBFwACARcAAgEXAAAAFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcXFxcXFxcXFwACARcXFxcXFxcXFxcXFxcAAgEXFxcXFxcXFxcAAgEXAAIBFwACARcXFxcXAAIBFxcXFxcXFxcXFxcXFxcXFxcAAgEXAAIBFwACARcXFxcXFxcXFxcXFxcAAgEXFxcXFxcXFxcXFxcXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFxcXFxcXFxcXFxcXFwACARcAAgEXAAIBFxcXFxcXFxcXFxcXFxcXFxcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcXFxcXAAIBFxcXFxcAAgEXAAIBFwACARcXFxcXFxcXFwACARcAAgEYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhobGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGywAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsLCwsLCwsLCwsLCwsLCwsLAACASwAAgEsAAIBLAACASwAAgEsLCwsLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwsLCwsAAIBLCwsLCwAAgEtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLg==", "w": "/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD+AQAAkW4AALpFAACAfwAAnWIAAP8AAAC9QgAAh3gAAP8AAAD/AAAA/wAAAI5xAAD8AwAA/wAAAP8AAAC+QQAAkm0AAPEOAAD/AAAA/wAAAP8AAAC0SwAAgn0AAP8AAACfYAAA/wAAAP8AAAD/AAAAzjEAAIJ9AAD/AAAA9gkAAJ1iAAC/QAAA/wAAAP8AAADnGAAA0ywAAKNcAAD/AAAA/wAAAN0iAADRLgAA2SYAAP8AAAD/AAAA/wAAAOoVAAD/AAAA/wAAAP8AAACuUQAA/wAAALVKAAD/AAAAkm0AAP8AAAD5BgAA/gEAAP8AAAD7BAAA/wAAAP8AAADWKQAAnmEAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAJ9gAAD/AAAA7xAAAOYZAACdYgAA/wAAAP8AAACDfAAA/wAAAP8AAAD/AAAA/wAAAM4xAAD/AAAA/wAAAP8AAADYJwAA/wAAAP8AAACzTAAA/wAAAP8AAACCfQAA/wAAAP8AAAD/AAAA/wAAAP8AAAD8AwAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAAn2AAAO4RAAD/AAAA/wAAAP8AAAD/AAAA/wAAAOAfAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA1ikAAP8AAAD/AAAA/wAAAP8AAAD/AAAAmmUAAP8AAAD/AAAA/wAAAP4BAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA+QYAAP8AAAD/AAAAlWoAAP8AAAD/AAAA/wAAAJVqAAD/AAAA/wAAAP8AAADcIwAA/wAAANkmAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAAkG8AAPEOAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAACLdAAA/wAAAN4hAAD/AAAA/gEAAP8AAAD9AgAA0ywAAP0CAADrFAAA/wAAAP8AAADVKgAA/wAAAP8AAADdIgAA/wAAAP8AAACYZwAA/wAAAP8AAACEewAA/wAAAP8AAAD/AAAA+gUAAP8AAAD/AAAA7BMAAP0CAAD/AAAA/wAAAP8AAACMcwAA/wAAAP8AAAD/AAAA/wAAAPsEAACAfwAA/wAAAP8AAAD/AAAA/wAAAPsEAAD/AAAA3iEAANYpAACZZgAAyjUAAP8AAAD/AAAA/wAAAI5xAAD/AAAAi3QAAP8AAAD2CQAAol0AAPwDAACYZwAAoV4AAIB5BgCJdgAAyzQAAP8AAADRLgAA/wAAAP8AAAD/AAAA/wAAAMM8AADwDwAApFsAALtEAADcIwAAj3AAAH+AAAD/AAAAyjUAAPwDAACgXwAAm2QAAMk2AACdYQEA4BgHAP8AAAD/AAAA/wAAAMc4AAD/AAAA/wAAAP8AAACVagAAf4AAAIF+AADZJgAA/wAAAIh3AAClWgAAyDcAAPINAACXaAAAukUAALJNAACFegAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAH+AAACOcQAA/wAAAP8AAADoFwAA2SYAAP8AAAD/AAAAg3wAAIJ9AADCPQAAlmkAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAALlGAACJdgAAfn4DAKZUBQB1Sz8A/wAAAJ9gAAD/AAAA2yQAAP8AAADKLQgA/wAAAOAfAAD/AAAA+AcAAP8AAADJNgAA/wAAAP8AAAD/AAAAi3QAALRLAAC8QwAA5BsAAP8AAAD/AAAAxCMYAJplAAD/AAAA/wAAAJNsAAD/AAAA/wAAAP8AAAD/AAAA/wAAAOwTAAD/AAAA/wAAAP8AAAD/AAAA/wAAAMg3AAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD9AgAA/wAAAP8AAAD/AAAAgX4AAJ5hAAD+AQAA/wAAAP8AAAD/AAAA/wAAAKJdAAD/AAAAxDsAAPsEAAD/AAAA/wAAANcoAAD/AAAA+gUAAP8AAADvEAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD4BwAA7BMAAKJdAACKdQAA/wAAAIJ9AAD/AAAArVIAAK9QAAD/AAAAlmkAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAACQbwAA/wAAAIF+AAD/AAAA/wAAAP8AAAD/AAAAoF8AAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAPoFAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD1CgAA/wAAAP8AAAD/AAAA/wAAAPgHAAD/AAAA/wAAAP8AAAD7BAAA/wAAAP8AAAD/AAAA3yAAAPsEAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAACNcgAA/wAAAN8gAAD/AAAA/wAAAPAPAADSLQAA/wAAAP8AAAD/AAAAjXIAAP8AAAD/AAAA/gEAAJ9gAAD/AAAA3yAAAP8AAAD3CAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA+wQAAP8AAAD/AAAAkmQJAP8AAAD/AAAA/wAAAP8AAAD/AAAA+wQAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAACLaQsA/wAAAP8AAAD/AAAA/wAAAP8AAACuSwYA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA+wQAAP8AAAD/AAAA/wAAAP8AAAD/AAAA3CADAP8AAAD/AAAA/wAAAP8AAAD/AAAAi2kLAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAADcIAMA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA+wQAAP8AAAD/AAAA/wAAAPsEAAD/AAAAi2oKAP8AAACLagoA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAAkWQKAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD7BAAA/wAAAP8AAAD7BAAA/wAAAP8AAAD/AAAA/wAAAItqCgD/AAAA/wAAAP8AAADvDwEA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD7BAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/AMAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAPENAQD/AAAA/wAAAP8AAAD/AAAA/wAAAOgVAgCEbQ4AzR4UAKhXAACJdgAAf3ULALRLAACbZAAAhG0OAN8gAADDKxEAzx4SAJhaDQCjXAAAgX4AAM4eEwChTw8Ahm0MAM4eEwCoVwAAiXYAAIZtDADOHhMAhnkAALVKAACAfwAAh3gAAP8AAAC7RAAAn2AAAI9wAADtEgAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA6hUAAPUKAACjXAAA/wAAAPMMAACxTgAAsU4AAP8AAAC3SAAAkG8AAJFuAAD/AAAA/wAAAIR7AADVKgAA/wAAAPMMAAD3CAAA/wAAAI5xAAC8QwAA1CsAAP8AAAClWgAAs0wAALNMAAD7BAAA/wAAAPINAADrFAAA/AMAAOUaAAD/AAAA/wAAAP8AAAD+AQAAlmkAALJNAACPcAAAnGMAAP8AAADsEwAA/wAAAJxjAADSLQAA+AcAAP8AAAClWgAA+AcAAPYJAAD4BwAAtEsAAL5BAAD/AAAA/wAAAPcIAAD/AAAA/wAAAP8AAADTLAAA/wAAAPYJAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAACCfQAAnGMAAP8AAAD/AAAA3yAAAP8AAADEOwAAwD8AAP8AAAD/AAAA/wAAALFOAADZJgAA9AsAAPQLAADfIAAAm2QAAP8AAADPMAAA+gUAAP8AAAD5BgAA/wAAAP4BAAD/AAAA9QoAAP8AAAD9AgAA/wAAAP8AAAD/AAAA/gEAAPoFAACGeQAA/wAAAPkGAAD/AAAA2yQAAP8AAADDPAAA/wAAAP8AAAD/AAAA8Q4AAP8AAAD9AgAA/wAAAP8AAAD/AAAAxzgAAP8AAAD/AAAA/wAAANolAAD9AgAA/wAAAP8AAACgXwAAvUIAAP8AAAD/AAAAjnEAAPgHAADyDQAAukUAAP8AAAD/AAAAhHsAAP8AAADTLAAA/wAAAP8AAAD/AAAAyzQAAIB/AAD+AQAA/wAAAOYZAACtUgAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAAkW4AAP8AAAD/AAAA5hkAAP8AAAD/AAAAlWoAAJVqAAD/AAAAplkAAIB/AAD/AAAA/wAAAP8AAAD/AAAA2iUAAP8AAAD/AAAA/wAAAP8AAADiHQAA/wAAAKJdAAD2CQAA6hUAAP8AAAD/AAAA/wAAAP4BAAD/AAAA/wAAAIB/AAD/AAAA/wAAAP8AAAD5BgAA/wAAAP8AAAD/AAAA/wAAAP8AAACYZwAAh3gAALRLAAC7RAAAg3wAAJ9gAACRbgAAxjkAAIF+AACMcwAAg3wAAIh3AACmWQAAmWYAAIxzAACOcQAAmWYAAKJdAAC/QAAAkm0AAMY5AACDfAAAjXIAAIF+AADGOQAAi3QAAJhnAADDPAAAgX4AALVKAACHeAAA/wAAAKBfAADXKAAA/gEAAP8AAADiHQAA/wAAAMo1AACUawAA5xgAAP8AAAD/AAAA/QIAAMQ7AAD/AAAAzjEAAKJdAAD/AAAAq1QAAMo1AAD/AAAAuEcAAOQbAACwTwAAyjUAAP0CAAD/AAAA/wAAAP0CAADoFwAAu0QAAP8AAAD7BAAA9gkAAO4RAACEewAA4xwAANYpAAD5BgAA4B8AANskAAD/AAAAr1AAAP8AAAD/AAAAinUAAP8AAAD/AAAAinUAAOUaAADtEgAA3SIAANcoAAD1CgAA/AMAAP8AAACCfQAA/wAAANMsAAC/QAAAyzQAAP8AAAD+AQAAi3QAAPMMAAD1CgAA/gEAAOwTAADTLAAAzDMAAMo1AAD/AAAA+AcAAJFuAADsEwAAmmUAAOsUAAD9AgAA+wQAANYpAAD/AAAA5BsAAP8AAACdYgAA1ygAAP4BAADUKwAA/wAAAP8AAAD8AwAA6BcAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD6BQAA/wAAAP8AAAD/AAAApFsAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAADyDQAA/wAAALdIAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD3CAAA/wAAAJJtAAD/AAAA/wAAAP8AAAD/AAAA8A8AAP8AAAD/AAAA/wAAAP8AAAD/AAAA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/wAAAP8AAADYJwAA/wAAAP8AAAD/AAAA/wAAAP8AAADLKwkA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAPUKAAD/AAAA/wAAAP8AAAD/AAAAmmUAAP8AAAD/AAAA/wAAAP8AAACxTgAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAPINAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAACAfwAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAAnWIAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAAyjUAAP8AAADvEAAA9gkAAMs0AAD/AAAAn2AAAOkWAAD8AwAA+wQAAKNcAADMMwAA6BcAAOoVAAD/AAAA/wAAANskAAD9AgAAmGcAAP8AAAC2SQAA/AMAAP4BAADVKgAA1ikAAP4BAADZJgAA/wAAANEuAAD/AAAAtkkAAP8AAADxDgAA/wAAAMk2AADUKwAA5xgAANUqAAD8AwAAsE8AALhHAAD/AAAAzDMAANMsAADNMgAAyjUAAOMcAAD4BwAA/wAAAP8AAAD+AQAA/wAAAP8AAACGeQAA/AMAAOgXAADKNQAAjnEAAO8QAAD/AAAAjHMAAP0CAADfIAAA/wAAAP8AAAC0SwAA/wAAAP8AAADUKwAA/wAAAOMcAAD/AAAA1ikAAM4xAACrVAAA/wAAAP8AAAD/AAAA/wAAAOkWAADPMAAA/gEAAP8AAAD2CQAAplkAANAvAAD/AAAAplkAAKRbAACMcwAAnWIAAIt0AACYZwAAhHsAALhHAACUawAAhnkAAIR7AACPcAAAjXIAAJplAACUawAAuEcAAMQ7AACAfwAAnmEAAJRrAACIdwAAhnkAAMg3AACnWAAAn2AAAMY5AACnWAAAinUAAJdoAACJdgAAiXYAALBPAAD/AAAA/wAAAKBfAAD1CgAA+AcAAP8AAAD/AAAA/AMAAP8AAAD/AAAA/wAAALBPAAD/AAAA/wAAAPsEAAD/AAAA/wAAAP8AAAD/AAAA+QYAANAvAADwDwAA/wAAAP8AAACjXAAA5BsAAP8AAAD/AAAA/wAAAP8AAAD/AAAA2CcAAP8AAAD/AAAA/wAAAIZ5AACjXAAA/wAAAP8AAAD/AAAA/wAAAJ5hAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAArFMAAO0SAAD/AAAA/wAAAP8AAAD/AAAA/wAAANcoAAD/AAAA/wAAAM0yAAD9AgAAlWoAAMs0AAD/AAAA/wAAAP8AAAD9AgAA/wAAAKNcAAD/AAAA8A8AAP8AAADpFgAAnGMAAKtUAACnWAAA/wAAAP8AAAD9AgAA/wAAAP8AAAD/AAAA/wAAAP8AAADqFQAA/wAAAP8AAAD/AAAA/wAAAP8AAADrFAAA3iEAAP8AAAD/AAAA/wAAAPYJAADOMQAA0C8AAP8AAAD/AAAA/wAAAP8AAADmGQAAr1AAAP8AAAD/AAAAuUYAAPwDAAD/AAAA+QYAAP8AAADxDgAA/wAAAPQLAADdIgAA7RIAAPEOAADGOQAA/wAAAIh3AADeIQAA/wAAAPUKAAD/AAAAuUYAAP8AAAD/AAAA3iEAAN4hAAD/AAAA/wAAAP8AAAD/AAAA/wAAAPsEAAD8AwAApVoAAP8AAADpFgAA/wAAAKtUAAC6RQAAoV4AAIl2AAD1CgAA/wAAAMk2AAD/AAAA6xQAAP8AAAC4RwAAlmkAAP8AAADtEgAA8wwAAOcYAAD/AAAA/QIAAKVaAADTLAAArlEAAMk2AAD/AAAA/wAAAP8AAACMcwAA/gEAAPINAAD/AAAA/wAAAPYJAAD5BgAAvEMAAP8AAACjXAAAmmUAAPwDAADwDwAAgn0AAP8AAADyDQAA/wAAAJ9gAAC9QgAA9gkAAP4BAAD/AAAA9gkAAP8AAAD/AAAA6RYAAI5xAACWaQAAplkAAMM8AAD/AAAAsE8AAI1yAADNHhQAhm0MAM4eEwCFbQ0AjXIAAHx5CgCCfQAAhHsAAH50DQDnFgIAzh4TAMAsEwChTw8AhnkAALNMAACBfgAApFsAAIZ5AACaWQwA5hcCALM6EgD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAPsEAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAPENAQD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/AMAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAPsEAAD/AAAA/wAAAP8AAAD/AAAA/wAAAItqCgD/AAAA/wAAAP8AAAD/AAAA+wQAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAAi2oKAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD7BAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA+wQAAP8AAAD/AAAA/wAAAP8AAACRYwsA/wAAALNFBwD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAItqCgD/AAAA/wAAAPsEAAD7BAAA/wAAANwgAwCaXAkA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA8A4BAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA+wQAAP8AAAD/AAAA/wAAAP8AAACRZAoA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAACdYgAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAOoVAAD/AAAAi3QAAP8AAAD/AAAAukUAANQrAAD/AAAA+AcAAP8AAAD/AAAAn2AAAP8AAAD1CgAA/wAAAIJ9AADHOAAA/wAAAJFuAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAAwzwAAIB/AADhHgAAxDsAANwiAQD/AAAAxToAAIt0AAB2UTgAlWoAAH9/AQD/AAAA/wAAAP8AAAD/AAAAukUAAP8AAAD/AAAAmmUAAP8AAAD/AAAAt0gAAP8AAACZZgAAhnkAAPsEAAD/AAAA/wAAANwjAAD/AAAA+gUAAP8AAAD/AAAA/wAAAP8AAACLdAAAl2gAAKNcAACPcAAAzjEAAP8AAACNcgAAmmUAAOcYAAC8QwAAplkAANItAADCPQAAs0wAAP8AAAD/AAAA/wAAAP8AAACOcQAA9gkAAKtUAAC1SgAA0CgHAJNsAACLdAAAxToAAPwDAACgXwAA8g0AAP8AAACGeQAAukUAAP8AAADRLgAA/wAAAP8AAAD/AAAA/wAAAJJtAAD/AAAAm2QAAPoFAACIdQIAgHkGAMo1AAD/AAAA/gEAAIV6AACVagAA/wAAAP8AAACZZgAAlWoAAP8AAADZJgAA/wAAAIN8AAD/AAAA/wAAAPkGAAD/AAAA/wAAAP8AAAD/AAAA/wAAAOwTAAD/AAAA/wAAAIN8AAD/AAAA0ywAAP8AAACVagAA/wAAAP8AAAD/AAAA9AsAAP4BAAD7BAAA/wAAAP8AAAD+AQAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAADaJQAA/wAAAP8AAADXKAAA/wAAAP8AAAD/AAAAoF8AAP8AAACDfAAAl2gAAIF+AAD+AQAA7BMAAP8AAAD/AAAA/wAAAIF+AAD/AAAA/wAAANwjAACzTAAA/wAAAP8AAADPMAAA/wAAAPgHAAD/AAAA/wAAANskAAD+AQAA/wAAAP8AAAD/AAAA3CMAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAPgHAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA1ikAAJtkAAD/AAAA/wAAAP8AAACAfwAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAPMMAAD/AAAA/wAAANQrAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP0CAAD2CQAA/wAAAP8AAAD/AAAAzzAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAJ5hAAD/AAAA/wAAAOsUAAD/AAAA/wAAAP8AAAD/AAAA/wAAAId4AADhHgAAvUIAAP8AAAD/AAAA/wAAAP8AAAD/AAAAtEsAANUqAAD/AAAA7xAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAL5BAAD/AAAA/gEAAP8AAAD/AAAAhXoAAJplAAD/AAAA/wAAAP8AAADuEQAA/wAAAL1CAAD/AAAA/wAAAP8AAAD/AAAA/wAAAJZpAACzTAAA/wAAAP8AAAD/AAAA/wAAAJ1iAACBfgAA/wAAAP8AAAD/AAAA/wAAAKhXAAD/AAAA6xQAAL1CAACfYAAAqFcAAOgXAAD/AAAA/wAAAP8AAAD4BwAA/wAAAP8AAACuUQAA/AMAAMg3AAD/AAAA/wAAAP8AAADpFgAAhnkAAKJdAAD/AAAA/wAAALBPAAD/AAAA/wAAAP8AAAD/AAAAn2AAAPgHAAD/AAAA/wAAAP8AAAD8AwAAt0gAAP8AAAD6BQAA/wAAAP8AAAD/AAAA/wAAAPcIAACdYgAA/wAAAOcYAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAOAfAAD7BAAA/gEAAP8AAADYJwAA/gEAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/QIAAP8AAAD/AAAA/wAAAP8AAAD/AAAA6xQAAPkGAACEewAA/wAAAPEOAAD/AAAA/wAAAP8AAAD/AAAA/wAAAL1CAAD/AAAA/wAAAP8AAADuEQAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD9AgAA4B8AAP8AAAD/AAAA+gUAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAPwDAAD/AAAA/wAAAMA/AAD/AAAA/wAAAOUaAAD/AAAA/wAAAIt0AAD/AAAAxDsAAOkWAAD/AAAA/wAAAK1SAAD/AAAA/wAAAP8AAACHeAAA/wAAAP8AAACcYwAA/wAAAP8AAAD/AAAAjXIAAP0CAAD/AAAA/wAAAJFuAADAPwAAkW4AAP8AAACmWQAA/wAAAJVqAADLNAAAj3AAAP8AAAD/AAAA/wAAAP8AAACsUwAA/wAAAIxzAACCfQAA/wAAAJ9gAAD/AAAA+gUAAI9wAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAA==", "b": "Li4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0sLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwrKysrKyoqKioqKioqKSkpKSgoKCgoKCgnJycnJycnJycnJiYmJiUlJSUlJSQkJCQkJCQkJCQjIyMjIiIiIiIiIiEhISEhISEgICAgICAgHx8fHx4eHh4eHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFwYGBgYGBgYGBgYGBgYGBgUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHCQkJCQkKCgoKCwsLCwsLCwwMDAwMDAwNDQ0NDQ0ODg4ODw8PDw8PDw8PDxAQEBAQEBERERESEhISEhISEhISExMTExMTExQUFBQVFRUVFRUVFRYWFhYWFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhobGxsbGxsbGxsbGxsbGywsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLg==", "f": "DAs9CyILLQsCC8cKqQqyCgwLsAqyCqkKsgo4CwwLqAo4C7IK7QomCzoL7Qo6C0ULJgsTCzoLEwtFCzoLAgv7CiYLxwoCCyYL+woTCyYLxwomC+0K/wozC9EKpAoMC+cK5woMC/8K/woMCyIL/woiCzMLpgqsCqkKpgqpCqQKpAqpCgwLsAqrCqgKsAqoCrIKsAqpCqwKygrRCjMLygozCywLDwvKCiwL9grKChML9goTC/sKRQsTCw8LEwvKCg8LMwsHCw8LDwsHCy8LRQsPCy8LLAszCw8LIAZyC4ELjguBC3ALgQtyC38LkgubC5gLjguYC5sLMAaBC44LIAaBCzAGBAaOC5sLkwqHCosKkwqKCo4KiwqHClAKXAp6CmgKYgptCnoKbQp2CnoKaAqKCpMKjgqaCkoKUAqYCpUKUAqOCpgKUAqVCokKmAqOCkoKSgqcCpgKUAqHCo4KkwqOCocKWgp6ClwKmAtwC18LmAtfC4YLgQthC3ALgQt/C2ELYQtfC3ALYQt/C18LjgtwC5gLfAtRC1ULfAstC1ELVQpaClwKfwt8C1ULZApiCloKVQpkCloKWgpiCnoKBgstC9wKIwZsC3ILIwYGC2wLcgtsC38LbAsGC9wKbAt8C38LbAvcCnwLfAvcCi0L2ArPCsoKzwroCsoK2Ar2CvsK2AbzCugK2ArKCvYKeQp7CmcKiQp7CnkKiQp4CnsKewp4CmcK6ArzCtEK6ArRCsoKhQaxBgYLsQbYCgYLBgvYCtsKzwroCtgK2woCCy0L2Ar7CgILBgvbCi0L2wrYCgILtwbPCtgK3AboCs8KdAqfCqsKagp0CqsKagqrCrAKeAp0CmcKZwp0CmoKdAqcCp8KpgpzCqwKcwpqCqwKagqwCqwKeQpnCnAKfwpqCnMKeQpnCp0KlgpnCmoKmAqcCnQKiQqVCngKlQqYCngKmAp0CngKXAteCyULggqGCpkKjAqSCpkKjQqCCpIKkgqCCpkKggqECoYKggqdCoQK7QoRC0YLXgsRC10LGQeSCpkKXwt/C1cLVQtXC38LXwtVC1cLXwtXC1wLVwtVC1wLgAtfC08LUQteC1ULVQteC1wLUQtGC14LLQvHClELxwpGC1ELXgtGCxELXwtcC04LTwtfC04L4gpPCzULTwtOCzULTgtcCxsLTgsbCzUL7QpGC8cKnQp/CoQKowqmCqQKogqjCqQKogqkCsAKhAp/Co8KwArnCv8KwAr/Ct0K3QrRCvMK3Qr/CtEKwAqkCucKfwpzCqYKAweiCsAKAwejCqIKtAbACt0KmQqUCqMKeQqdCoIKnQqWCn8KnQpnCpYKlgpqCn8KjAqUCpkKGweZCqMKlAqPCqMKmQqECpQKhgqECpkKlAqECo8KowqPCn8Kowp/CqYK2AbdCvMKGQsuC/0KLgvCCv0KLguMBqsGQQuMBi4LCAsgC+MKCAsBCyALjAawBkELjAawBqsGsAbDBqsGqwbDBi4LLgvDBsIKwgrDBv0K1wbjBrYGwwbjBtcGwwawBuMGzwbjBrAGDQsjC+sK/QrDBtcGuAbUBrAG1AbPBrAG1gr5CtIK1grSCngLlwq6CksKnApLCroKoQqgCroKoAqCC7oKugqCC7sK1gp4C4IL+QrFCngL1gqCC6AK+Qp4C9IKigp9CpoKigqaCo4KgQqhCpcKlwqhCroKoQrWCqAKfQqBCpoKmgqBCpcKmgqXCkoKlwpLCkoKSgpLCpwKGwsUCzULNQsbCyULNQslCykLaQp2Cm0KaQpxCnYKrQoLC6UKcQqtCqUKaAp6CooKegp9CooKdgp9CnoKdgpxCn0KfQpxCoEKcQqlCoEK8gr5CtYK8grTCvkK0wrMCvkKpwryCtYKCwtBC9MKpQryCqcKpQqnCqEKgQqlCqEKpwrWCqEKCwvyCqUKCwvTCvIKIQtLCzQLIQszCyILNAszCyELRQtUC2kLZAsvC0gLLws0C0gLSwtICzQLRQtpC+0KaQtUC2QLZAtUC0ULYAtLCyELawtLC3gLeAtLC2ALqAoFCzgLggt4C2ALWAuCCwULBQuCC2ALBQtgCyELOAsFCwwLDAsFCz0LPQshCyILBQshCz0LZAtFCy8LSAtxC2QLawtxC0gLawtIC0sLMws0CwcLLwsHCzQLXgtdCyULGwtcCyULXQtpCyULJQtpC+kK7QpdCxEL7QppC10L6QppC2QLzgrZCnYL2QraCoQLzgp2C8UKFAsfCwELNQspCx8LNQsfCxQLAAs1CxQL2golC+kKJQvaCikLnwq6CqsKugq7CqsKqwq7CqgKuwoFC6gKnAq6Cp8KggsFC7sKxQpxC3kLxQp2C3ELeAvFCmsLxQp5C2sLzgp2C3EL2QqEC3YLFAsBC/cKeQtxC2sLdgtkC3EL2gpkC4QL6QpkC9oKdguEC2QLCQ7dDdINCwnuCPoI7ghACfoITAlACe4IQAkfCfoICwkfCeEICwn6CB8JNgkaCR8Jjw66DrIOsg7dDQkOQwkUCboOFAmyDroOQwkYCRQJrQ7dDaIOCQ4oDnEOiQ5DCboOGAlDCTUJCQ5xDo8OFAkYCVQJlA78DWYJ+w2UDmYJog7dDZQO+w2iDpQOgw78DZQOlA7dDbIOgw6UDrIOgw6yDkgJFAlICbIOVAkYCToJgw5ICVQJgw5UCfwNFAlUCUgJrQ7SDd0NGgkvCR8JHwkvCSIJNQkqCSIJEgkaCTYJQAkSCTYJHwkiCSoJGAk1CSIJQAk2CR8J2wjhCCoJ4QgfCSoJGAkiCS8JGAkvCToJGgl4CS8JeAlaCS8JLwlaCToJVAk6CVoJ6AhMCe4ITAkSCUAJPAngCOgIPAmeCuAIngqACuAIgApSCk0KgAoKCeAI6AjgCEwJ4AgKCUwJaQlvCRYJTQoKCYAKiwqACpAKgAqeCpAKiwpSCoAKEQlvCjwJbwqeCjwJbAqQCp4KbwpsCp4KYQpsCmUKWQplCm8KZQpsCm8KJA41Dg8O2wgqCTUJDg4oDjUOJA4PDgMONQ7SDQ8ONQ4oDtINKA4JDtIN8QhDCYQO8QjbCEMJQwmJDoQOiQ6PDoQOjw6yDgkOiQ66Do8OQwnbCDUJhA5xDg4OhA6PDnEODg5xDigOTAkNCRIJaQkSCQ0JCglNCgIJAglNCoMKAgmBCQoJCglvCQ0JCgmBCW8JgQkCCW8JAgkWCW8J9g1NDu8NTQ72DSQOaQkNCW8J9g0LDiQOCw41DiQODg41DgsOeAkaCWkJaQkaCRIJTAkKCQ0JOwYxBkwGRgY3BlMGUwY3Bh0GUwYdBvcGXAY4BiUGKAY4BiMGLQY7BjgGXAYjBjgGOAY7BkwGHgYxBjsGMwYhBjIGNwY5BisGLgYlBjIGHQYrBjUGSgY5BjcGOQYuBjIGRwYjBlwGJQYzBjIGJQZFBjMGZwsoBkcGRwYoBiMGKAYtBjgGYgstBigGbwseBi0GlwsOBh4GVgtIBmEGSAZgBmEGSAZHBlwGXAYuBmAGSgZgBi4GSgYuBjkGXAYlBi4GRgZKBjcGLQYeBjsGHgYOBjEGDgYFBjEGRgZZBkoGWQZhBkoGYQZgBkoGSAZcBmAGIQZkBoIGIQbNBiIGMwZkBiEGtQryBvAG8gb1BvAGtQrwBkwHWAdeB2EHXwpUB0kKXwpMB1QHSApUB1gHWAdhB08HVAdeB1gHTAdeB1QHMQY+BkwGRQZMBmQGTAZbBmQGOAZFBiUGOAZMBkUGRQZkBjMGTAY+BlsGMgYhBiIGMgYiBjkGOQYiBiYGOQYmBisGHQY3BisGKwYmBlgGTgkuCQUJng5dCTMJRQkzCV0JRQldCU4JWwmZDjMJng4zCZkOBg6ZDlsJVgkGDlsJRQlOCR0J9whOCQUJ9wgFCesIWgnfCAAJmQ6tDqIOmQ6iDp4OeAkQCSkJWgl4Cd8IeAlpCRAJPwZZBkYGTQY/BvIG8gY/BlMG8gZTBvcG9wZTBvUGPwZGBlMGWgthBlkGWgtZBj8G+w2eDqIOswpNBvIGSQs/Bk0G/A1UCWYJRQlbCTMJTglUCQUJVAkACQUJVAlaCQAJ9AgQCRYJTgldCWYJTglmCVQJeAkpCd8IXQn7DZ4O+w1mCV0JFgkQCWkJKQn0CN8IEAn0CCkJ3AgkCTIJMgkkCR0JPgkyCesI6wjzCD4JMgkdCesIMAncCDIJMAllCYsJiwlqCdwIMAmLCdwIZQmHCYsJUgmHCV8JUgmFCYcJhwmFCW0JhQl6CW0JiwmHCW0JHQnkCOsIagltCVsJbQlWCVsJ3AhqCSQJHAn8CP8IHAkVCfwIHAn/CCgJ/wgGCSgJHQkkCUUJaglbCSQJJAlbCUUJ5AhOCesI5AgdCU4J6whOCfcIiwltCWoJRwk9CRwJPQkhCRUJIQlPCRUJfgqICoIKPQkVCRwJdwgZCSEJowg9CUcJKAlHCRwJIQk+CU8JEwkOCTIJEwkyCRkJGQkyCT4JGQk+CSEJDgkwCTIJEAfdCJsK3QgoCfUIUAkoCd0ImwrdCPUImwr1CIgKjQqICn4KmwqICo0KjQp+CoIKUAlHCSgJXwmHCWUJFQlPCfwIPgnzCE8JTwnzCPwIAgnqCBYJAgkGCeoIBgkPCXwK9QgoCQYJiAp8CoIKdQqCCnwKdQp5CoIK9AgWCeoIdQqFCnkKdQp8CpEKdQqRCoUKhQqJCnkK9Qh8CogK9QgGCXwK9Aj/CN8IfAoPCQIJDwkGCQIJfAoCCYMKfAqDCpEKgwqFCpEKBQkACfMI/AjzCAAJ6wgFCfMI/AgACd8I9AjqCAYJBgn/CPQI/wj8CN8IiwapBkALqQYrC0ALdwaTBoIGdwabBpMGQAZYBn4G8wapBu8GQAZ+BosG8wZABosG8waLBqkGqQaLBisLiwZACysLJwtBCwsLJws5C0ELJwscCzkLJwsLCysL7wYrC7YK7wapBisLtgorC7EKKwuvCrEKsQorC60KrQorCwsLaQq2CrEKaQqxCq0KaQqtCnEKZAZbBoIGWwZ3BoIGIgbNBtUGJgYiBtUGIQaCBs0G4go1C8gK4grICgALyAo1CwALWwbdBncGJgZ+BlgGJgbVBocGJgaHBn4G1QbNBmoG1QZqBocGzQZwBmoGmwZ3Bt0GmwbdBrMGyQb+Ct0GlguAC3MLlAtfC4ALcwuAC/4KiwuUC4ALiwuAC5YL/gqAC+IKlAuGC18LlAuNC4ALgAtPC+IKDwaWC3MLCAYPBjQGCAaLCw8GNAYPBnMLiwuWCw8GWwY+BiwGGQYIBjQGNAYsBj4GNAYfBiwGWwYsBt0GiwuQC5QLlguLC3MLLAYfBt0GHwbJBt0GNAZzCx8GHwZzC/4KHwb+CskGGQY0Bj4GGQaLCwgGEwaHCxkGGQaaC4sLGQaHC5oLMQYZBj4GkguYC4kLiQuUC5ALiQuYC5QLmAuGC5QLQgdGB2EHmguQC4sLTwpPB2AHTApYB08HTwdaB2AHYQdaB08HWQdgB1YHYAdaB1YH8Ab1BkQHXgdCB2EH8gb3BvUG8AZEB0wH9QZeB0QHXgdMB0QHDgYXBhQGBQYOBhQGFAYXBhkGGQYXBhMGFAYZBgUGMQYFBhkGVgdaBz8HWgdGBz8HVgc/B0gHWgdhB0YHlwsXBg4GSQdNB2IKTQdeCmIKSAc/B2AKQgdNB0YHTQdJB0YHSAdgClUKSwdIB1UKYApkClUKYAo/B2QKSQdiCmQKYgppCm0KXgppCmIKXgq2CmkK7wZeCk0H7wa2Cl4KKwZYBjUGQgf2Bk0H9AZABvYG9gZABvMG9AYdBkAGHQY1BkAGNQZYBkAG6gYdBvQG9wbpBvUG9wYpBukGKQbqBukG9Qb2Bl4H9QbpBvYGHQYpBvcG9gbzBu8G6gb2BukG6gb0BvYG6gYpBh0GXgf2BkIHPwdGB0kHSQdkCj8H9gbvBk0H8wZOBu8GQAZOBvMGGgsQC/oKGQv6CgMLGQsjC/oKLgsZC8wKzAoZCwML+goQC/UKzArFCvkKIwvqChoL6goQCxoLIwsaC/oK6grwCggL6goICxAL9QoQC9kKEAsIC9oKEAvaCtkKCAvkCtoK9QrZCs4KzAoDC8UKAwvOCsUK+gr1Cs4KAwv6Cs4KOwsZCwkLOwtCCxkLQgsjCxkLQQsuC8wKQQvMCtMKIwsNC+oKKgs3Cw0LQgsqCw0LQgsNCyMLNwsOC/AKNwvwCg0LDQvwCuoKpgaTBroGpga6BjcLNwu6BtcKNwsqC6cGpgY3C6cGugbfCtcKugazBt8KswbdBuUK3wqzBuUKyAaTBqYGugabBrMGbQbZBssGaAaVBm0GlQbTBrsG0wZoBssGlQZoBtMGywZoBm0GFAv3CgALHgsACwELAQsAC/cKFwsBCwgL8AoXCwgL+AoACxcLFwsACx4LFwseCwEL1wr4Cg4LNwvXCg4LDgv4CvAK8Ar4ChcLkwabBroG3wr+CuUK5QrdBv4K1wrfCvgK/griCgAL3wr+CgAL3woAC/gK8QoWCwELCAvxCgELAQsdC/cKAQsWCx0L2wZvBhYL8QrbBhYL6wrbBvEK5AofCykL5AopC9oKCAsBCx8LCAsfC+QK3wZnBswGzAbHBt8GzAaVBscGZwaVBswGbwbZBm0G2wbZBr8GvwbZBm8G2wa/Bm8GlQazBscGbwaaBmcGFgtvBmcGbwZtBpoGmgaVBmcGbQaVBpoGAAvMBt8GAAtnBswGAAsdC2cG6wrgBtsGFgtnBh0L4waKBrYG4wZ9BooGzwZyBn0GzwZ9BuMG4AbZBtsGxAbZBuAGxAbiBtkGfQagBooGlwavBrYGigaXBrYGigagBoAG6woEC+AGDQvxCg4LDgsIC+MKDgvxCggLDQvrCvEKIwsZCwQLGQv9CgQLBAvrCiML1wYEC/0K1wa2Bq8G1wavBtAGrwbEBuAG0AavBuAG1wbQBgQLBAvQBuAGJwsJCy4LCQsZCy4LJwsuC0ELagZwBqcGzQaTBsgGcAbNBqYGzQbIBqYGmAY7CwkLjwZCCzsLmAaPBjsLjwanBkILpwYqC0ILhwZqBo8GjwZqBqcGpwZwBqYGfgaHBpgGmAaHBo8GogasBnwGgQZ8BqwGogZuBqwGrAZuBmkGigaABpcGgQbLBtkGogavBpcGogbEBq8G4gZ8BtkGfAaBBtkGxAZ8BuIGogZ8BsQGlwaABnUGogaXBm4GlwZ1Bm4GiwaYBoQGqQaLBoQGzQaCBpMGmAaLBn4GJwuEBgkLqQYnCysLqQaEBicLhAaYBgkLrAZpBrIGsgZpBuEGgQayBssGrAayBoEGaghBCH4IQQjXCH4IfgjXCMAIKggvCFYIOwivCLkIOwi5CEIIQgjTCDYIQQgpCNcIwAjXCMwIwAjMCK8IrwjJCLkIrwjMCMkIOggwCCkI0wi9CLoIyQjDCLkIuQjDCL0IiQgfBzUHiQinCB8HygiuCIkIiQiuCKcINQcfBzsH0wi5CL0IVghoCD8IVggvCGgIaAjKCIkIPwhoCIkIPwiJCDUHPwg1BxgHQgi5CNMIKgjKCC8INgjCCCoINgjTCMIIPwgYB1MHKgjCCMoIGAc1BxUHFQc1BzsHUgcVBzsHUgc7Bz4HUwcYBxUHUwcVB1IHaAgvCMoIwgiuCMoI0wi6CMIIwgi6CK4Ibwg6CGoIagg6CEEIiwhvCGoIiwiPCG8IOggpCEEIOghvCEYIZghGCG8IRgg0CDoINAgwCDoIfgh4CF0IXQh4CMAIRwhdCMAIeAh+CMAIRwivCDsIRwjACK8IiwhqCGcIZwhqCH4ITQhiCXMI1wiNCMwIKQhfCI0Icwh0CWUIZQh0CV8IXwh0CXkJzAiMCMkIzAiNCIwIyQiECMMIyQiMCIQIOQhzCDQIMAhfCCkINAhzCDAIMAhzCGUI1wgpCI0IMAhlCF8IOQhNCHMIQAGfCE0BTQGfCLEInwiXCLEIlwi3CLEINwjQCNoIsQi3CNoItwjQCNoIlwjNCLcIjgj7CM0IGgdTBw8HDwdQBxIHDwdSB1AHDwdTB1IHtwjNCNAI0Ai3CDcIEQcNBxIHJQcUByEHJQcRBxQHEQcSBxQHDQcPBxIHOQchBz0HOQc9ByoHOQclByEH0Ah8CTcINwh8CU0IzQi2CNAItgjNCOYItgjmCNAI0AjmCP0IMAs2C00LfQvLCtQKMAsVCzYLbQt6C3ULfgtjC30LfQtqC3oLfQtjC2oLegtqC24LfgtSC2MLfQt6C8sKegtlC2gLwQp1C/wKdQttC/wKbQt1C4MLywp6C3ULywp1C8EKfQveCn4LZgttC7wKfQvUCt4KMAt+C94KegtoC3UL3grjCjALUgtMC3sLewtSC1sLTQtXC1sLUgtbC3wLagtjC3QLagt0C24LYwtSC3sLYwt7C3QLaAtlC1oLZQtZC1oLZQt0C0oLdAt7C0wLdAtMC0oLSgtWC1kLSgtMC0gGWQthBloLWQtWC2EGSgtIBlYLTAtHBkgGUgt8C0wLWwtnC3wLTQtQC18LUAtfC4YLTQtfC1cLXwuGC5cLZQtKC1kLdQtoC4MLfgswC0cLfgtHC1ILRwtbC1ILRwtNC1sLRwswC00LdwtJC7MKswryBrUKSQtTCz8GUwtaCz8GswpJC00GegtuC2ULZQtuC3QLaAtaC1MLbQuDC3cLbQt3C7wKaAtTC4MLdwuDC0kLdwu1CrwKdwuzCrUKgwtTC0kLWwtiC2cLUAuNC5ULTwpgB2IHTwpMCk8HUAuVC18LXwuVC4YLZgpPClgKZgpMCk8KSApMCmYKBwYKBgMGlwuGC4ULlQuFC4YLlQuJC4ULlQuRC4kLZgpYCloKjQsHBpULlQsDBpELlQsHBgMGYwpICl0Kdwu9CrwKvQq1CkcKRwq1Cl8KvQpjCrQKvQpHCmMKYwpHCl8KYwpfCkkKUwpjCl0KXQpICmYKtQpMB18KvAq1Cr0KZgpWCl0KZgpaClYKXApaClgKSApYB0wKYwpJCkgKSQpUB0gKBwYBBgoGAQYPBgwGFQYYBg8GhQuJC5cLlwuJCxcGBwYPBgEGDAYPBhgGDAYYBhAGPAckByAHPAc3ByQHJAc3BzMHuAq0ClMKUwq0CmMKPAdyCjcHdwo3B3IKrgpyCjwHrgpTCnIKdwpaCkEHdwpWCloKUwpWCnIKtwq4ClMKdwozBzcHbwuXCx4GYgtvCy0GCgtmC7cKKAv8CmYLwQr8CigLZgv8Cm0LCgsoC2YLCguqCq4KVwtfC28LTAt8C2cLTAtnC0cGZwtiCygGWwtXC2ILVwtvC2ILXwuXC28LZgu4CrcKbQu5CmYLZgu9CrkKZgu8Cr0KuQq9CrgKuAq9CrQKUwquCrcKqgq3Cq4KCgu3CqoKZgu5CrgKxwbKBt8G3wbKBrUGtQbKBhoG4Qq1Bo0LgAvhCo0LtQYHBo0LGgbKBg8GygZWBg8GBwa1BhsGxwakBsoGygZsBlYGGwYPBgcGGwa1Bg8GtQYaBg8GLgczB0EHUwpdClYKLgdBB1wKdwpBBzMHXApBB1oKywrBCjILywoyCxkLKAsyC8EKNgsAC8kKVgp3CnIKYQpcClgKTQvJClAL4QqAC1AL5grfBrUGgAuNC1ALAAvmCuEKAAvhCskKNgvJCk0LyQrhClAL5gq1BuEKjAbUBrAGjAbPBtQGQQurBowGjAZrBs8GGQsyCygLqwYKC4wGjAYKC64KGQsoCy4LLgsoCwoLLgsKC6sGIAckBzQHjAYBBwAHjAYBB/sGAQcwB/sGMAcBByAH+QY8BwEHjAb5BgEH+QauCjwHjAauCvkGAQc8ByAHjAb7BmsGvQijCJwIhAh3CMMIwwh3CKMIvQicCLoIkgi6CJwIHgebCo0KwQhQCd0IwQjdCBAHEAebCh4HHgeNChkHvQjDCKMIhAgZCXcIkghQCcEIdwghCaMIowghCT0JnAijCEcJkgicCEcJkghHCVAJjAgTCYQIrgi6CJIIjQhfCA4JpwjBCBAHpwiSCMEILAceBygHrgiSCKcIOwcfBz4HHwcoBz4HHwcsBygHHwenCBAHHwcQBx4HLAcfBx4HIAsVCzAL9woVCyAL4wogCzALQQsuC6sGAQv3CiAL1ArjCt4KywojC9QK4wrUCvQK9wodCwAL9woACxULDQv0CiMLDQvjCvQK1AojC/QK5goAC98GAAs2CxULywoZCyML4woNCw4LswacBscGlQacBrMGOAcrByYH6QilCDsJsgjPCIAIgAgmB6UIgAg4ByYHgAgrBzgHCwn6CNkI2QjPCPoI+gjvCEEJdgjZCMcIdgi/CNkIQQnvCOkIdgiUCL8I+gjPCLII2Qi/CLwIzwjZCLwIzwi8CJ0IzwidCIAI6QiyCKUIsgiACKUIQQnpCE0J7wj6COkI+giyCOkIVRBGEFIQSRBGEFUQGxB1EHcQFxB1EBsQRhAbEFIQGxB3EFIQogiUCHYIpggzAZEIMwEYARoBMwEaAZEIfhBzEC4BcxAYAS4BfhAuAXsQcxABAhgBLgEYATMBLgEzAXsQLAl7EDMBLAkzAaYI/AHMAf4BzAHnAf4BAQL5Ad8BIhAlEAACLBAAAiUQGhD5ASoQJhD5AQECJhAqEPkBIhAAAs8BIAlBCTcJ1wHPAfkBJhABAnMQ+QHPAecBGhDPAfkBGhAiEM8BpgiiCCwJLAmiCOEI4QiiCLsIMwEdAXoINgErAR0BpgiHCKIIhwiUCKIIuwgLCeEICwnHCPoIuwiiCMcIogh2CMcIuwjHCAsJxwjZCPoI+QHbAd8B+QHnAdsB5wHMAdsBAALhAecB+wHhAQACzwEAAucB4QH+AecBGAErATYBGgE2ATMBMwF6CJEINgEdATMBkQh6CKYIpgiQCIcIegiQCKYIRRBUECAQGAE2ARoBGAEBAt8BGAHfASsBXxBqEG8QbxBqEGAQYBBqECIBXxBaEGoQWhAiAWoQWhBpECIBZBByEFoQZBAjCXIQcRBvEF8QcRBvEGAQcRBgEGUQagFgEGUQaRAXAScBchB0CBcBchAjCXQIaRAnASIBaRBaEBcBWhByEBcBYBAiAWoBZBBUEGEQUhB3EGYQdxBfEGYQdRBaEF8QdRBUEE4QdxB1EF8QdRBOEFoQThBkEFoQThBUEGQQdRCAEFQQRRBHEFQQFxCAEHUQFxAgEIAQIBBUEIAQVRBSEGMQYxBSEGYQcRBjEGYQYRAJCWQQbxBxEGYQZhBfEG8QPxAtEEAQNxA7EC0QNxAtEEkQRhBJEDsQLBA9ED8QQBAtEDsQFxBFECAQNRAXEBsQRhA7EBsQPRBFEBcQPxAXEDUQPRA5EEUQOxAtEBsQNRAbEC0QLxAsED8QPRAlEDkQLBAlED0QPxA1EC0QPxA9EBcQNxApEDsQKRAjEEAQQBA7ECkQ5gHxATIQ+wHWAeEB8QH8AfsB/AHWAfsB1gH+AeEB1gH8Af4BMhA2EJ8BMhCfAeYBSRAtEDsQLxAyEPEBLxDxAfsBLxD7ASwQLBD7AQACNhAyECMQPxBAEC8QLxBAECMQLxAjEDIQNBAZEDAQeRBsEBkQQgk0CR4JgRBCCRcJFwlCCR4JNAklCR4JeRBoEGwQGRBsEDAQgRAXCWgQSBAeECcQSBAnEEcQHhAWECcQFhA0ECcQGRA0EBYQOAksCeEIeRCBEGgQSBBDEB4QQxAWEB4QKwk3CSUJKwkgCTcJCwn6CCAJIAn6CEEJKwnhCCAJ4QgLCSAJaBAXCWwQRRA5EEcQSBBHEDkQNAkrCSUJJhAaECoQURBXEIEQQglXEOUIgRBXEEIJNAlCCeUINAnlCOIIFRAaECYQcxB+EBUQFRBEEBkQFRAZEBoQGhAWEEMQVxB7EOUI5Qh7ECwJ5QgsCeIIfhB7EFcQ4ggsCTQJRBBREHkQURCBEHkQRBB5EBkQGRAWEBoQfhBREBUQURB+EFcQFRBREEQQGhBIECIQGhBDEEgQLAnbCDQJNAnbCCsJLAnhCNsI2wjhCCsJIhBIECUQSBA5ECUQexBJCSwJJhBzEBUQcxB7EH4QcAFkAcsIKwFkAR0BZAHLCB0BHQHLCHoIkAh6CNEIegjLCNEIkAjRCNQIugGbAUsB3wFLASsBiwGlAcMBiwHDAbYBugGlAbgBKwFLAWQB3wG6AUsBSwFwAWQBcAFWAcsI0QjLCLgISwGbAXABugG4AZsBmwG4AXABtgHMAf4BwwGlAboB3wHbAcMBzAG2AdsB3wHDAboB2wG2AcMBhwjUCLQIuAieCFIIVgFaCEwIpAhMCJ4InghMCFIIkAjUCIcIVgFMCKQIhwi0CJQIXQFWAaQIvghdAaQIvgieCLgIVgG4ATIBuAFFATIBVgEyATwBVgE8AVoIPAEyAeUBPAHlAVoIvgikCJ4ItAjUCIYI0QiwCNQItAiGCKEIoQiGCHsI1AiwCIYIsAiYCIYIlAi0CKEIlAihCL8IuAiwCNEIcAG4AVYBywhWAb4IVgFdAb4IpQGtAbgBrQFPAbgBuAFPAUUBywi+CLgIJgEhAYsIIQGPCIsIWwgqCFYIWwg2CCoIZwh+CF0IcQhdCDsIXQhHCDsIXghWCGQIcAhLCF4IcQg7CEIIcAhCCDYIcAg2CEsISwhbCF4ISwg2CFsIXghbCFYITAhCCFIIUghCCHAIoQh7CHUInQitCCsHrQgdBysHKwcdByUHHQcRByUHqAh1CK0IrQh1CNYIHQetCAkHhghwCHsIcAheCHsIewheCHUIXghkCHUIhghSCHAIvwihCKgIvwioCLwIoQh1CKgIuAiYCLAIuAhSCJgImAhSCIYIgAidCCsHJgcrBzIHJgcyBzkHKwclBzIHMgclBzkHvAioCK0IvAitCJ0IrQjWCAkHNQEmATIBMgEmAYsINQEhASYBMgHlAVMI5QFTCFoIUwhdCFoITAhaCHEIUwhnCF0IWghdCHEIMgGLCGcITAhxCEIIMgFnCFMIDQcaBw8H1gh1CGQIZAgyCNYICQcaBw0HMghkCFYIMghWCD8I1ggyCAkHMgg/CAkHCQc/CBoHGgc/CFMHHQcJBw0HHQcNBxEHTwE1AUUBRQE1ATIBUwljCYMJYwmKCYMJRAlZCewIWQlTCYMJWQmDCYYJ7AhZCYYJYRDeCAkJQQlkCWEJQQlNCWQJYQl1CVwJaAlcCXUJXAloCWAJNwlhCVwJNwlBCWEJSglECfIIRAlRCfIIRAnsCFEJYQlyCXUJYQlkCXIJVQmTCFEJVQmDCVcJVwmDCUkIhglVCewI7AhVCVEJhgmDCVUJaAl9CWAJYAl9CYgJigmICT4IYAmKCWMJYAmICYoJZBAJCSMJCQktCSMJ8ghRCUYJOQlKCUYJOQlGCd4ISgnyCEYJ3ghGCS0J3ggtCQkJRglRCZoIJxBtEEcQRxBtEFkQNBBtECcQNBBwEG0QMBBwEDQQMBBuEHAQFwkeCXMJFwlwCWwJFwlzCXAJKBBsCW4QMBBsEG4QbBAXCWwJbBAoEG4QbBBsCSgQFwF0CCcBLAGfCEABIgFAAToBJwEXAXwIFwF0CHwIIgEnAUABJwEsAUABJwF8CCwBfAh0CCwBLAF0CJ8IXRB0EFkQWRDeCGEQdBDeCFkQdBA5Cd4IVBBZEGEQWQlwCVMJcwljCVMJVBBHEFkQcwl2CWAJdglcCWAJHgklCXMJJQl2CXMJJQlcCXYJJQk3CVwJWRBtEF0QbRB0EF0QbhBECUoJbRBwEHwQbRB8EHQQcBBKCXwQcBBuEEoJcwlgCWMJcAlzCVMJbhAmCUQJbAlZCSYJJglZCUQJdBB8EEoJdBBKCTkJiAl9CUMIbAlwCVkJbAkmCW4QVApOClEKbglRCnsJewlRClsHewlbB24JWwpUClEKgAluCWsIYQpYClQKUQpOClsHTgpPCmIHYQpUClsKTgpUClgKTgpYCk8KJgc5ByoHOwkmB24KOwllClgJOwluCmUKJgcqB24KbgoqB2EKYQprClwKZQphClsKawouB1wKKgcuB2sKbgphCmUKKgdrCmEKdQmACYIJggmACSwITQmJCWQJTQnpCIkJaAl1CX0JfQl1CYIJfQmCCTMIiQlYCWsJWAllCmsJpQgmBzsJiQnpCDsJiQk7CVgJZAmJCXIJiQlrCXIJcglrCX4JqQgMCY4IdAipCI4Inwh0CJcIdAiOCJcIdQlyCYAJgAlyCW4Jcgl+CW4JZQpbCmsJfglrCXsJfgl7CW4JawlbClEKawlRCnsJlwiOCM0ILQkxCakIIwktCakIIwmpCHQILQlGCZoI6gTrBPwESwdVClcKQwdXClkKQAdZCnEJWAhHB20IRwdAB20ISwdDB0AHQAdDB1kKSwdXCkMHQAdxCW0IUQgtCGIITwhRCGIIYggtCGAIPQgtCFEIWQdWB0gHWQdIB0sHSgg9CEAIUQhACD0ISghYCD0ISghRB1gIUQdHB1gIRwdLB0AHPQhYCC0IWAhtCC0I/AT4BOsE8gTvBPgE+ATuBOsExgTwBO4E8gT4BPwE/AT7BPIE6wTuBOkE+AT3BO4E7gTwBPcE8ATnBO4E6wTpBOoE7gTnBOkE8ATzBOcEzwT4BO8EzwTvBPIErgS7BMYEzwTLBPgEywSxBPgEsQT3BPgEsQSuBPcErgTGBO4ErgTuBPcEYgiDCGkI6AQGBe0EBgXsBO0EBAXsBAYFBAX6BOwEiAjVCJYIlgjVCLUIiAhpCIMIiAiDCNUIgwjGCNUI5gTzBM0E8ATGBPMETgiWCJsITghpCJYIaQiICJYImwirCNgI8wTxBOUE5wTzBOUE7AT2BO0EggjFCMcEggjYCMUIngSgCLoEoAibCIIIBAWfBLcEtwTOBPoEBAW3BPoEnwS6BLcEoAibCJ4EnwSeBLoE6ATtBOYEugSCCMcE5gTxBPMEtwS6BMcE5gTtBPEE+gTOBOwEzQTzBMYEtwTHBM4EoAiCCLoEmwiKCIIImwjYCIoIigjYCIIIKw4RDggO5w1MDiIO5w0iDisOCA7nDSsOpwQEBa0ErQQEBQYFCA4RDu8NCA7vDecN6QQiDhgO6QTnBCsO6QQrDiIO/wQYDhYOFg4YDiIO/ATqBP8E/wTqBBgO6gTpBBgOUAhOCJsIVQhQCKAIVQigCJ4EpwSfBAQFUAibCKAIAQUGBegEAQXoBOYEAgWfBKcEAgWeBJ8EoAStBAEFVQj+BAIFzQSgBNIE0gSgBAEF0gQBBc0EAQXmBM0ErQQGBQEF/gSeBAIF/gRVCJ4Eig5LCRsJuQ4bCaMOuQ6KDhsJuQ6cDooOow4bCScJGwlLCScJuQ6jDicJtA6cDrkOtA6VDpwOSwmKDj8Jig6cDj8J0ATKBN4E0ATeBOME3gTKBKMEJwl5CLgEow4nCbgEow6rBLkOqwS4BHkItA6jBMoEsgSaBKMEsgSjBLQOsgS5DpoEow64BKsEuQ6rBJoEswisCJMIkwisCJoIUQmTCJoIyAjECLMIxAisCLMIzgh9CMQISQg+CCsISQgrCDgISQg4CDEIswhECDEIswgxCMgIRAhJCDEIYw7KBNAEYw60DsoEsgS0DrkOVQlZCJMILQmqCDEJXAhPCGIIXAhiCGkIqgh5CCcJqggnCTEJLQmaCKoILghICGMIYwhICFwIYQgrCC4I5ATfBMYE3wTNBMYEYQhjCFAIYQguCGMISAg8CE8ISAhPCFwIXAhpCE4IPAhACE8IQAhRCE8IYwhOCFAIXAhOCGMITgpiB1sHNQhbB2sIWwdiB1EHgAlrCCwILAhrCEAIbglbB2sIVwhFCEoIUQdKCEUIYgdgB1kHWQdLB1EHUQdLB0cHWwdRB0oIawhXCEAIVwhKCEAIawhbB0oIDAlLCfsIawhKCFcIYgdZB1EHSwkMCTEJMQknCUsJqQgxCQwJPghDCC4IPgguCCsIQwhICC4IggkoCDMIfQkzCEMIMwhICEMIyAiBCMQIgQi8BLYExAiBCLYEvwSvBM4Izgi/BI4IxAi2BMkEggksCCgIMwgoCEgIKAg8CEgILAhACCgIKAhACDwIVwlJCFQIgwk+CEkIgwmKCT4IswhZCEQIWQhECJMIVQlXCVkIVwlUCFkIWQhUCEkIkwhZCLMIWQhJCEQIzgiOCH0IjgiXCKoIqgiXCHkIqwR5CJcIiAlDCD4IxAiaCKwImgiOCKoIxAh9CJoImgh9CI4IjgilBJcIbAj0BLwErwS1BN8EtQTNBN8ErwSgBLUEtQSgBM0ErwS2BK0ErwStBKAElwiOCN8ElwjfBKUEvwTfBI4IqwSlBN8EbAgCBfQEbAhyCAIFvAT0BKcE9AQCBacEcghVCAIFcghQCFUIcghhCFAIyAgxCIEIbAiBCDEIKwhhCDgIzgjECL8ExAjJBL8EvwTJBK8EvwSvBN8EyQS2BK8EbAgxCDgItgS8BK0EvASnBK0EbAg4CHIIgQhsCLwEOAhhCHII+wj9COYI+wjmCM0I0Aj9CHwJ5wj9CPsISwnnCPsIjggMCfsIbApcCmgKWQpXCmEKYQpcCmwKbApoCpMKbAqTCpAKkwqLCpAKVwpVClwKVwpcCmEKWQphCmUKhQqDClIKUgqDCk0KUgqLClAKUAqJClIKUgqJCoUKTQh8CWIJZwlfCXQJdAlfCXkJeQlfCWUJjAgOCRMJhAgTCRkJXwh5CQ4JjQgOCYwIeQllCQ4JDgllCTAJZwlSCV8JcwhnCXQJcwhiCWcJYglSCWcJYgl3CVIJBwn5CNsIpw4ODvENpw6EDg4Opw6TDoQO8Qh2Dl8O8QiTDnYO8QiEDpMOBwnxCF8Okw5fDnYOBwnbCPEIpw5fDpMOrA5fDqcO9gS9BPENvQSnDvENxwRfDqcO5Q3xDQsO1Q3lDfYN5Q0LDvYN8Q0ODgsO1Q32De8NKw40DhEONA7VDREOEQ7VDe8N+AgICe0I+AjtCP4I7QgLCf4ICAnuCO0I1Qj4CLUItQj+CNIItQjSCNgI+QjSCP4ItQj4CP4I+QjhCNsI/ggLCeEI7ggLCe0I+Qj+COEIlgi1CJsImwi1CKsIqwi1CNgIzgTHBL0EzgSnDr0EYggtCCcIYggnCIMIJwgtCMYILQgDCcYI7QT2BPkExQjYCMcEzgS9BPYE7ATOBPYE7QQ7DvEE7QT5BDsO+QTlDTsO+QT2BOUN9gTxDeUN5QQ0DisO5QTxBDQO2AjSCPkI8QQ7DjQO2AhfDscE2AgHCV8O2Aj5CAcJzgTHBKcO5wTlBCsONA47DtUN5Q3VDTsOfwkRCQMJcQkRCX8JWQoRCXEJWQpvChEJgwgnCMYIxggICdUI1QgICfgILQh/CQMJLQhtCH8JbQhxCX8JAwkRCegICAnoCO4IEQk8CegIxggDCQgJCAkDCegInA7wCD8JSwk/CecIPwnwCOcIdw7wCJwO9gj9CPAI8Aj9COcIVwYqBl8GbgZfBk8GdQZfBioGXwYcBk8GXwYqBhwGJwYqBlcGaQZPBhwGaQYcBiQGbgZPBmkGoAYnBlcGiQaOBnoG0QYkBokGJAZdBokGiQZdBkIGaQbRBokGaQYkBtEG4QaJBpwGnAaJBnoGoAZXBoAGgAZXBl8GbgZ1Bl8GgAZfBnUGJAY2Bl0GQwY8Bl4G7AbuBvEG8QbuBksG7QZSBjoG7QbsBvEGLwY6BlIGNgZCBl0GJwZiBkMGLwZiBicGYgY8BkMGUgZLBjwG7AbrBu4G7QbxBlIGUgbxBksGLwZSBmIGUgY8BmIGVwdcB+wG7AZcB+sGFwdXBwQHBAdXB+wGAgc6BsAGuQYvBqAGAgfsBjoGOgbsBu0GoAYvBicGpQa5BqAGuQbABjoGuQY6Bi8GFwccB1cHVwccB1UHVwdVB1wHCgcXBwQHAgcEB+wGDAccBwgHCgcIBxwHCgccBxcHywayBrsGlQa7BpwGaQaJBuEGxwacBqQGsgbhBrsGuwbhBpwGHAcSB10HCwcSBw4HDAcOBxwHDgcSBxwHEgdQB18HEgdfB10HNgcUBwwHFAcLBwwHFAcSBwsHDAcLBw4HnAaWBnYGdgZWBmwGnAZ6BpYGnAZ2BmwGHAddB1UHVQddB1wHpAacBmwGygakBmwGIQc2Bz0HNgcjBz0HJAczBzQHIQcUBzYHMwcjBzYHMwc2BzQHKgc9By4HPQcjBzMHLgc9BzMHSQZjBlEGYwZeBoMGXgaqBngGHAZjBkkGPAaSBnEGPAZxBl4GXgZxBqoGKgY9BhwGJwZDBioGPQYqBkMG8QauBksGPAZLBq4GPAauBpIGrgZ7BpIGJAYcBkkGNgYkBlEGNgZRBlUGJAZJBlEGHAY9BmMGPQZeBmMGPQZeBioGPQZDBl4GzwZrBnIGawbWBnIGywa7BtMGawYGBwcHawYHB9YGawb7BgYHMAcIBwoHMAc0BwgH+wYKBwYHNAc2BwgHNgcMBwgHMAcKB/sGBgcEBwcHBwcCB8AGBwcEBwIHBgcKBwQHfQalBqAG1gbABnIGpQbABrkGpQZyBsAGfQZyBqUGMAcgBzQH1gYHB8AGAwYKBgEG3ASpBOAEqQTeBKwEmwSiBLEEogSuBLEEqATkBMYEmwSxBOAEsQTLBOAEogS7BK4EogSoBLsEqATGBLsEmwSiBOAEogTkBKgEqwSiBNUEqwTkBKIEqwTfBOQE1gSbBOAE1gSaBJsEmgSrBNUEogSbBJoEogSaBNUE4ATLBM8E3ATgBM8EqQSsBOAE3gSjBNYE3gTWBKwEmgTWBKMErATWBOAE4wTeBKkEpQSrBJcILQf6Bv0GLQf8Bv0G/Qb8BvoGLQcvB/wG/Qb6BvgGcQaoBpAGewaoBnEGcQaQBnkGcQZ5BqoG+gb8Bv4G+Ab6Bv4G+AaoBnsG+Ab+BqgG8QbuBv8G7gb9Bv8GPgciBykHKQciBy0HkgZ7BnEGrgb4BnsG8Qb/Bq4G/wb4Bq4G/wb9BvgGgwajBmYGowadBmYGoQZ5BqMGgwahBqMGoQaqBnkGqgahBoMGXgZ4BoMGgwZ4BqoGMQc6By0HLQc6By8HMQcvBzoHMQcoBycHIgcxBy0HKAcZBzEHMQcnBy8HHgcZBygHowZ5BoYGPgcoByIHIgcoBzEHNgZVBnMGVQZRBmYGUQZjBoMGZgadBo0GUQaDBmYGwQaNBt4GVQZmBnMGNgZzBsEGwQZzBo0GcwZmBo0GwQafBkIGjgafBkEGwQbeBp8GFQZWBhgGjgZCBp8GQgY2BsEGjgZBBkQGjgZEBpYGVgZMBj4GVgZaBkwGUAZMBloGTAZQBjAGGAZWBj4GVgZ2BloGRAZQBloGDwZWBhUGlgZaBnYGlgZEBloGiQZCBo4GegaOBpYGTAYwBj4GXAdOB+sG6wZOB+4GUAdFB18HXwdFB0oHXwdKB10HXQdKB04HIgcpB0oHSgcpBy0HTgdKBy0HTgf9Bu4GTgctB/0GUgc+B1AHUAc+B0UHPgciB0UHRQciB0oHUAYgBjAGBAYwBo4LCwYEBpsL3gaFBmUGRAZUBlAGEAYEBgsGPgYwBhgGGAYEBhAGRAZBBlQGGAYwBgQGZQaFBs4GIwbOBoUGIwaFBgYLXAddB04HQQbeBmUGQQafBt4GQQZlBlQGVAYjBlAGVAbOBiMGVAZlBs4GMQcZBycHUAYjBiAGIAYjBnILGQcWBxMHGQeZChYHEwcWBwMHFgeZChsHFgcbBwMHLwcDB/wGLwcbBwMHEwcDBxsH/AYDBwUHtAbYBpAGxga0BpAG2AZ5BpAGJwcZBxYHJwcWBy8HLwcWBxsHFgcTBxsHGwejCgMHAwfGBgUHAwfACsYGxgbACrQG/gYFB8YGqAbGBpAGGQeNCpIK/gb8BqgG/AYFB/4G/gbGBqgG3AZ5BtgGtwajBtwG3AaGBnkGowaGBtwG3AbYBugKjQaxBt4GjQa3BrEGjQadBrcGnQajBrcG3gaxBoUG2Aa0Bt0KsQa3BoUGtwa8Bs8KvAbcBs8KsQa3BtgKvAa3BtwG0g3+DeQN5A3+DZIO0g2tDv4NrQ6ZDv4NmQ6RDv4N/g2RDpIOmQ4GDpEOBg76DZEOkQ76DZIOBg5WCfoNVgleCfoN+g1eCZIOVgltCXoJVgl6CV4JXgl6CZIOhQnbDXoJegnbDZIOhQlSCdsNUgkFDtsN2w0FDpIOUgktDgUOBQ4tDpIOUgl3CS0OdwliCS0OYgmECS0OLQ6ECZIOYgl8CYQJfAnjCIQJhAnjCJIOfAn9COMI/QgBCeMI4wgBCZIO/Qj2CAEJ9gjwCAEJ8AgECQEJAQkECZIO8Ah3DgQJdw6cDmEOdw5hDgQJBAlhDpIOnA6kDmEOYQ6kDpIOnA6VDrwOnA68DqQOpA68DpIOlQ60DrwOtA5jDrwOYw6xDrwOvA6xDpIOYw6aDrEOsQ6aDpIOYw7QBJoO0ATjBJoO4wR6DpoOmg56DpIO4wSpBHoOqQSMDnoOeg6MDpIOqQTcBIwO3ATPBKgO3ASoDowOjA6oDpIOzwRrDqgOqA5rDpIOzwTyBGsO8gT7BGsO+wRSDmsOaw5SDpIO+wT8BFIO/AT/BFIO/wQWDk8O/wRPDlIOUg5PDpIOFg4YDk8OGA4nDk8OTw4nDpIOGA4iDicOIg4fDicOJw4fDpIOIg5MDh8OHw5MDpIO5w1YDkwOTA5YDpIO5w3vDVgO7w3oDVgOWA7oDZIO7w1NDugNTQ4kDugNJA4DDugN6A0DDpIOJA4DDuQNAw7kDZIOAw4PDuQNDw7SDeQNNAjiAegB6AHiARwBNAj6AeIB4gH6ARwBNAg5CPoBOQhNCPoBTQhuCPoB+gFuCBwBTQg3CG4INwiFCG4IbgiFCBwBNwjQCIUI0AiZCIUIhQiZCBwB0AjaCJkI2gixCJkIsQiVCJkImQiVCBwBsQhNAZUITQFAATcBTQE3AZUIlQg3ARwBQAFJATcBNwFJARwBQAE6AWABQAFgAUkBSQFgARwBOgEiAWABIgFqAWABagFSAWABYAFSARwBagF5AVIBUgF5ARwBagFgEHkBYBBlEHkBZRBxEHkBcRBZAXkBeQFZARwBcRAvAVkBWQEvARwBcRBjEC8BYxBVEC8BVRB/EC8BLwF/EBwBVRBJECEQVRAhEH8QfxAhEBwBSRDOASEQIRDOARwBSRDFAc4BzgHFARwBSRA3EMUBNxApEMUBKRCBAcUBxQGBARwBKRAjEIEBIxA2EIEBNhCfAZMBNhCTAYEBgQGTARwBnwHmAZMB5gGxAZMBkwGxARwB5gHxAbEB8QG7AbEBsQG7ARwB8QH8AdgB8QHYAbsBuwHYARwB/AHgAdgB2AHgARwB/AH+AeAB/gG8AeAB4AG8ARwB/gG2AbwBtgGLAbwBvAGLARwBtgGLAfABiwHwARwBiwGlAfABpQGtAfABrQHaAfAB8AHaARwBrQFPAdoBTwE1AdoBNQH0AdoB2gH0ARwBNQEhAfQBIQGPCPQBjwgZAfQB9AEZARwBjwhvCGYIjwhmCBkBGQFmCBwBZgjoARwBZghGCOgBRgg0COgBAQYMBgMGmguHC4kLmguJC5ALiQuKC48LiQuPC5ILkguPC5kLkguZC5sLmwuZCw0GmwsNBgsGCwYNBhIGCwYSBhAGEAYSBgkGEAYJBgwGDAYJBgIGDAYCBgMGAwYCBpELkQsCBpMLkQuTC4oLkQuKC4kLiQuKCxYGiQsWBhcGFwYWBhEGFwYRBhMGEwYRBogLEwaIC4cLhwuIC4oLhwuKC4kLmQuMCwYGmQsGBg0GjwuMC5kLjAs1DEwFjAtMBQYGBgZMBQ0GDQYGBhIGAgaKC5MLEQYWBogLigsPDCMMigsjDI8LjwsjDEoMjwtKDDUMjws1DIwLBgZMBZQFBgaUBRIGEgaUBY0FEgaNBQkGCQaNBXMFCQZzBQIGAgZzBVoFAgZaBS4MAgYuDIoLigsuDA8MigsPDKQFigukBRYGFgakBYsFFgaLBfgLFgb4C4gLiAv4Cw8MiAsPDIoLDwwXDDQMDww0DCMMIww0DDwMIww8DEoMSgw8DCUMSgwlDDUMNQwlDGAFNQxgBUwFTAVgBagFTAWoBZQFlAWoBY0FjQWoBX4FjQV+BXMFcwV+BW0FcwVtBVIFcwVSBVoFWgVSBTIMWgUyDC4MLgwyDBcMLgwXDA8MDwwXDJ8FDwyfBaQFpAWfBYUFpAWFBYsFiwWFBf0LiwX9C/gL+Av9CxcM+AsXDA8MJQw8DLYLJQy2C/sFJQz7BWAFYAX7BagFFwweDDQMPAykC7YL+wW0BagFfgWcBUkFfgVJBW0FFwwxDB4MHgzyCzQMNAzyCzwMqAWJBX4FfgWJBZwFbQVJBWcFbQVnBVIF/QtFDDEM/QsxDBcMPAzyC6QLtgukC+ULtgvlC8QFtgvEBfsF+wXEBbQFqAW0BYkFHgwZDPYLHgz2C/IL8gv2C9kL8gvZC6QLpAvZC6ELpAuhC9YLpAvWC+wLpAvsC+UL5QvsC74F5Qu+BcQFxAW+BdIFxAXSBbQFtAXSBbwFtAW8BcgFtAXIBYkFiQXIBY8FiQWPBZcFiQWXBZwFnAWXBVEFnAVRBUkFSQVRBW4FSQVuBWcFZwVuBVIFUgVuBUcFUgVHBTYMUgU2DDIMMgw2DCEMMgwhDBcMFwwhDJUFFwyVBZ8FnwWVBXwFnwV8BYUFhQV8Bf8LhQX/C/0L/Qv/C0sM/QtLDEUMRQxLDDcMRQw3DDEMMQw3DBkMMQwZDB4MRwVuBTYMIQwzDE8FIQxPBZUFfAVoBf8L/wtoBUsMoQvZC9YLlwWxBVEFbgVGDDYMNgwzDCEMlQVPBXwFNwwCDBkMGQwCDAoMGQwKDPYL0gXvBbwFvAXvBcgFjwXMBbEFjwWxBZcFsQXyBVEFNgwZDDMMTwVsBXwFNwxGDAIM2Qu+C9YL7AvOC74F8gXVBVEFUQXVBW4FSwwwDEYMSwxGDDcMAgzbC9ULAgzVCwoMCgzVC/YL9gvVCwAM9gsADNkL2QsADCQM2QskDL4LvgskDAwMvgsMDNYL1gsMDPEL1gvxC+wL7AvxCxQM7AsUDM4LzgsUDKEFzguhBb4FvgWhBYwFvgWMBXoFvgV6BdIF0gV6BVYF0gVWBe8F7wVWBcgFyAVWBYMFyAWDBYAFyAWABY8FjwWABcwFzAWABawFzAWsBbEFsQWsBVsFsQVbBfIF8gVbBXEF8gVxBdUF1QVxBW4FbgVxBd0FbgXdBaYLbgWmC0YMRgymC7ELRgyxCzYMNgyxC8kLNgzJCxkMGQzJCzMMMwzJC7gLMwy4C/gFMwz4BU8FTwX4BdsFTwXbBWwFbAXbBcoFbAXKBXwFfAXKBeYFfAXmBWgFaAXmBUsMSwzmBZ8LSwyfC7ULSwy1CzAMMAy1C6YLMAymC0YMRgymC9sLRgzbCwIM1QsbDAAMDAwUDPELjAWhBXoFgwXFBYAFsQumC8kLoQVZBXoF3QVxBaYL2wXJBcoFygXJBeYFDAz3CxQMpgvaC8kL5gW1C58LcQVBDKYL5gX3BbUL2wviC9EL2wvRC9UL1QvRCyIM1QsiDBsMGwwiDAAMAAwiDPkLAAz5CykMAAwpDCQMJAwpDBMMJAwTDAwMDAwTDPALDAzwC/cL9wvwCw0M9wsNDBQMFAwNDKkFFAypBaEFoQWpBWEFoQVhBVkFWQVhBXYFWQV2BXoFegV2BVwFegVcBVYFVgVcBXsFVgV7BYMFgwV7BcEFgwXBBcUFxQXBBYQFxQWEBYAFgAWEBaUFgAWlBawFrAWlBV4FrAVeBVsFWwVeBXgFWwV4BXEFcQV4BT0McQU9DEEMQQw9DKILQQyiC6YLpguiC+MLpgvjC9oL2gvjC8EL2gvBC8kLyQvBC7MLyQuzC7gLuAuzC64LuAuuC9AFuAvQBfgF+AXQBf4F+AX+BeMF+AXjBdsF2wXjBc4F2wXOBckFyQXOBeAFyQXgBeYF5gXgBf0F5gX9BfcF9wX9Ba8L9wWvC7ULtQuvC6ILtQuiC6YLpguiC+ILpgviC9sLXAXBBXsF/gXQBeMFwQuuC7ML0AXpBeMF+QsiDCkMpQWBBWQFpQVkBV4Fogs+DPULogv1C+IL4gv1C9ELhAWBBaUFwQvpC64L9QsEDMIL9QvCC9EL0QvCCw4M0QsODCIMIgwODDoMIgw6DCkMKQw6DB0MKQwdDBMMEwwdDPwLEwz8C/AL8Av8CxYM8AsWDA0MDQwWDJ4FDQyeBakFqQWeBU4FqQVOBWEFYQVOBWMFYQVjBXYFdgVjBVQFdgVUBVwFXAVUBe4FXAXuBccFXAXHBcEFwQXHBY4FwQWOBYQFhAWOBZkFhAWZBZEFhAWRBYEFgQWRBXUFgQV1BWQFZAV1BV4FXgV1BW8FXgVvBXgFeAVvBUgMeAVIDD0MPQxIDKILogtIDOgLogvoC+ML4wvoC9IL4wvSC8ELwQvSC+ELwQvhC+kL6QvhC6UL6QulC64LrgulC94FrgveBdAF0AXeBfoF0AX6BekF6QX6BeMF4wX6BdkF4wXZBcIF4wXCBc4FzgXCBc8FzgXPBeAF4AXPBfMF4AXzBf0F/QXzBbwL/QW8C68Lrwu8C0kMrwtJDKILogtJDD4MPgxJDAQMPgwEDPULBAwLDMILdQVVBW8FvAsvDEkMTgVUBWMFwgXzBc8FDgxEDDoMBAwJDAMMBAwDDAsMCwwDDOoLCwzqC8ILwgvqC/sLwgv7Cw4MDgz7CysMDgwrDEQMRAwrDEAMRAxADDoMOgxADO4LOgzuCx0MHQzuCxAMHQwQDPwL/AsQDPQL/Av0CxYMFgz0C4oFFgyKBZ4FngWKBXIFngVyBU4FTgVyBV0FTgVdBXQFTgV0BVQFVAV0BdwFVAXcBe4F7gXcBbIF7gWyBccFxwWyBZYFxwWWBY4FjgWWBZIFjgWSBZkFmQWSBZoFmQWaBZEFkQWaBVMFkQVTBXUFdQVTBWsFdQVrBVUFVQVrBVgFVQVYBW8FbwVYBS0MbwUtDEgMSAwtDMMLSAzDC+gL6AvDC+AL6AvgC9IL0gvgC9AL0gvQC+EL4QvQC7oL4Qu6C6ULpQu6C/QFpQv0Bd4F3gX0BdgF3gXYBfoF+gXYBfkF+gX5BdkF2QX5BbMF2QWzBcIFwgWzBc0FwgXNBfMF8wXNBd8F8wXfBacL8wWnC7wLvAunC0IMvAtCDC8MLwxCDCwMLwwsDEkMSQwsDAkMSQwJDAQMdAWyBdwFswXfBc0FKwz7C0AMEAzuC/QLigVdBXIFCQwmDBUMCQwVDP4LCQz+CwMMAwz+C+YLAwzmC+oL6gvmCwEM6gsBDPsL+wsBDEMM+wtDDEAM7gsHDPQLigWrBV0FdAV5BZgFdAWYBa4FdAWuBbIFsgWuBZsFsgWbBZYFlgWbBYgFlgWIBZIFkgWIBZ0FkgWdBZoFmgWdBUgFmgVIBVMFUwVIBWYFUwVmBWsFawVmBWIFawViBVgFWAViBScMWAUnDC0MLQwnDMcLLQzHC8MLwwvHC90LwwvdC+AL4AvdC9ML4AvTC9AL0AvTC70L0Au9C7oLugu9C+oFugvqBfQF9AXqBdQF9AXUBdgF2AXUBQAG2AUABvkF+QUABroF+QW6BbMFswW6BecFswXnBd8F3wXnBaAL3wWgC6cLpwugCzsMpws7DEIMQgw7DCYMQgwmDCwMLAwmDAkMAQwaDEMMQAxDDPMLQAzzC+4L7gvzCxEM7gsRDAcMBwwRDPQL9AsRDKcF9AunBYoFigWnBasFqwWnBVcFqwVXBV0FXQVXBXQFdAVXBXkF0wvdC70LJwywC8cL6gUABtQFugX2BecF/gsVDOYLiAWbBZ0F3QucC70L6gXkBQAGFQzIC+YLmwWGBZ0FSAViBWYFOwygCyYMJgw4DBwMJgwcDBUMFQwcDMwLFQzMC8gLyAvMC94LyAveC+YL5gveC+8L5gvvCwEMAQzvCxIMAQwSDBoMGgwSDEMMQwwSDEcMQwxHDPoLQwz6C/ML8wv6CxgM8wsYDBEMEQwYDKAFEQygBacFpwWgBVAFpwVQBVcFVwVQBWkFVwVpBXkFeQVpBaoFeQWqBZgFmAWqBbgFmAW4Ba4FrgW4BaIFrgWiBZsFmwWiBYIFmwWCBYYFhgWCBZ0FnQWCBaYFnQWmBV8FnQVfBUgFSAVfBWUFSAVlBUsFSAVLBWIFYgVLBTkMYgU5DCcMJww5DL8LJwy/C7ALsAu/C80LsAvNC8cLxwvNC+sLxwvrC90L3QvrC6oL3QuqC5wLnAuqC70LvQuqC9MFvQvTBeoF6gXTBeQF5AXTBewF5AXsBQAGAAbsBbAFAAawBboFugWwBfAFugXwBfYF9gXwBdEF9gXRBecF5wXRBa0L5wWtC6ALoAutC78LoAu/CyYMJgy/CzgMOAy/C8wLOAzMCxwMpgWCBWUFpgVlBV8FRwwSDPoL7wveCxIMUAWHBWkFaQWHBaoF3gvECxIMEgwqDPoLqgW2BbgFuAW2BaIFSwW/CzkMzQu/C+sLvwu7C9QLvwvUC8wLzAvUC9wLzAvcC94L3gvcC8oL3gvKC8QLxAvKCwgMxAsIDBIMEgwIDCgMEgwoDCoMKgwoDPoL+gsoDAYM+gsGDCAM+gsgDBgMGAwgDJMFGAyTBaAFoAWTBUoFoAVKBVAFUAVKBZAFUAWQBYcFhwWQBaMFhwWjBaoFqgWjBbsFqgW7BbYFtgW7BaIFogW7Ba0FogWtBX8FogV/BYIFggV/BXAFggVwBWUFZQVwBU0FZQVNBUsFSwVNBfEFSwXxBbsLSwW7C78Lvwu7C+QLvwvkC+sL6wvkC6kL6wupC6oLqgupC9cFqgvXBdMF0wXXBe0F0wXtBewF7AXtBa8F7AWvBbAFsAWvBesFsAXrBfAF8AXrBcAL8AXAC9EF0QXAC6gL0QWoC60LrQuoC7sLrQu7C78LuwusC+QL3AvUC8oLBgwoDD8MBgw/DCAMkwV3BZAFkwWQBUoF1AvkC8oLIAw/DHcFIAx3BZMFrQW7Bb8FrQW/BX8FcAXWBfEFcAXxBU0F5AusC6kLqAvAC6sLqAurC7sLuwurC+QLuwvkC9QLCAzKCygMowWQBbsFfwW/BdYFfwXWBXAFrAvtC6kL1wXABe0F7QXABa8FqwvYC6MLqwujC+QL5AujC8oLygujC7kLygu5C88LygvPCygMKAzPCx8MKAwfDAUMKAwFDD8MPwwFDH0FPwx9BXcFdwV9BZAFkAV9BWoFkAVqBdoFkAXaBbsFuwXaBegFuwXoBeIFuwXiBb8FvwXiBcYFvwXGBdYF1gXGBbcF1gW3BfEF8QW3BcsF8QXLBbsLuwvLBdcLuwvXC6wLrAvXC54LrAueC+0L7QueC6kLqQueC+EFqQvhBdcF1wXhBcAFwAXhBf8FwAX/Ba8FrwX/BesF6wX/BcYL6wXGC8ALwAvGC9gLwAvYC6sL/wWyC8YLowvfC7kLuQvfC88LHwzPC+cLHwznCwUMfQXDBWoFagXDBdoF6AXaBfwF6AX8BeIFxgW9BcsFxgXLBbcFxguyC54LxgueC9gL2AueC6MLowueC98LBQznC8MFBQzDBX0F4gX8Bb0F4gW9BcYFywXlBdcL1wvlBZ4L4QWdC/8F/wWdC7ILzwvfC8sLzwvLC+cL2gXDBfwFngvlBZ0LngudC+EFngu0C8sLngvLC98L5wvLC7UF5wu1BcMFwwW1BfwF/AW1Bb0FvQW1Bf8FvQX/BcsFywX/BeUFnQu0C7ILsgu0C54LtAu3C8ULtAvFC8sLywvFC7kFywu5BbUFtQW5BfUFtQX1Bf8F/wX1BeUF5QX1BbcL5QW3C50LnQu3C7QLxQu3C7kFuQW3C/UF0g3qDQ8OAw4PDuoN+Q0lDgEO6g0BDiUOAQ7qDYsOiw7qDb0OkA4BDosOvQ7SDa0O6g3SDb0OIw5vDhoOeQ6rDnIOkA64DnIOqw6mDpgOpg6rDnkOqw6YDrAOqw6wDnIOmA6QDrAOsA6QDnIOTQ4kDiUOGQ5NDiUOJA7qDSUOJA4DDuoN7w1NDucNcg64Dm8OuA6HDm8OBg6HDpkOhw5qDm8O+g2HDgYOGg5vDlkOWQ5vDmoO+g1qDocOWQ5qDvoNiw6HDrgOkA6LDrgOvQ6HDosOvQ6tDpkOvQ6ZDocOQw4pDoUJhQkpDnoJWQ5WCW0JWQ76DVYJPg4aDkMOQw5ZDikOQw4aDlkOKQ5tCXoJKQ5ZDm0JdwnfDVIJQw6FCVIJPg5DDt8N3w1DDlIJRg7hDUIO4Q1XDkIORg5CDtcN1w1CDlcO5w1XDuEN5w1NDlcOFw5QDh0OUA5KDh0OSg7rDdwNSg7cDQoO3A0UDgoOPQ7cDesNPQ5GDtwN3A1GDtcNVw5NDhkOMg4XDlUOFw4dDgoOFw4dDlUOSg4KDh0O3A3XDRQO1w35DRQO1w1XDvkNVw4ZDvkNXA4qDmYOKg5FDmYORQ5VDmYOZg5VDmwOVQ4dDmwOOg5BDkkOXA5mDkEORA5FDioORQ4yDlUO4g3rDUoO4g1KDlAORw7iDVAORw5QDiwOLA5QDjIOUA4XDjIOFQ4wDtQNRA7UDTAOFQ7ZDTAOMA7ZDUcO2Q3iDUcORA4wDkcO1g2CDjYOUQ7WDTYOIw5yDm8ONg6CDi4OLg6CDnkOLg5yDiMOLg55DnIOCg4UDpgOFA75DZgOkA75DQEO+Q2QDpgOmw4KDpgOGQ4lDvkNHQ4KDmwOCg6bDmwObA6bDqYOmw6YDqYOSQ6mDlEOQQ5mDkkOSQ5mDmwOSQ5sDqYO1g1RDoIOUQ6mDoIOpg55DoIOOg5cDkEO9A7zDtkO9A7yDvMO9Q70DtkO9A71DvIO/g7yDvUObg4bDjMOJg51Dt0OJg4bDnUOdQ4bDm4Obg4zDioOWg4zDhsOWg48DioOWg4qDjMO3A7dDtcORA5HDiwOPA5EDioORA4sDjIORA4yDkUOOg4qDlwObg6BDi8OLw6BDjoObg46DoEObg4qDjoO2g3UDUQO8Q4bDiYO7g7lDtcO7g7zDuUO8w7xDuUO1w7lDt0O5Q7xDiYO5Q4mDt0O8Q5ODhsO/g7zDvIO/g79DvMO/Q76DvEO/Q7xDvMO7A7ZDtwO3A7ZDu4O3A7uDtcO2Q7zDu4OTg5aDvEOWg4bDk4O+g7wDU4O+g5ODvEOTg7wDVoO6Q1aDvAN2g08DukN6Q08DloO2g1EDjwOAAUFBQcOewQABfYO9g4ABRAOEA4ABQcO9g4HDhAOBw4FBQQOegR7BPgO+A57BPYOwA7LDtkO+w71DssOyw71DtkOBQX3DQQOwA77DssOmQR7BHoEkgSUBHkElAR6BHkElQSZBHoElASVBHoEkgR5BHwEegT4DnkEnQR7BJkEnQT9BHsEnQQFBf0EewT9BAAF/QQFBQAFkgT7DsAOkgR8BPsOfAR5BPsOeQT4DvkO+w55BPkO9QT7BAcFqgQHBQUF+wTeDfUE9w3sDRUO9w0VDtQN+wT8BP8E7Q3eDQ0O7Q0NDvUN+wQNDt4N+wQDBQ0OBQUHBfcNBwXtDfcNBwX1BO0N9QTeDe0N7Q31DfcN9g76Dv0O+Q74Dv0O+A72Dv0O9g4QDvoO+w75Dv4O+w7+DvUO+Q79Dv4OBw4EDukNEA4HDukNBA7aDekNBA73DdoN2g33DdQN+g7pDfAN+g4QDukNmQTZBJ0E2QThBNQE2QTUBKEE1ASmBKEE1AThBKYE2QShBJ0EiwSUBJIElAR+BJUEfgSZBJUEfgSDBJkEgwTZBJkEnQShBAUF8gT7BPUE8gT1BMIEwgT1BNsEqgTbBPUEqgT1BAcFzwTyBMIE4QSqBKYEoQSmBAUFpgSqBAUF4QTbBKoEFg49DusNGA5GDj0OFg4YDj0OIg5GDhgOIg7nDUYORg7nDeENDQ4YDhYO+wT/BAMF/wQWDgMFDQ4DBRYO9Q0NDuINDQ4WDuIN4g0WDusN9w31DewN7A31DRUOFQ71DdkN9Q3iDdkNfg5iDm0OlQ60DmMOYw5zDpUOgQSWBMAOlgSSBMAOgQTZDsIOgQTADtkOxQTjBNgE3QTQBNgE2ATQBOME4gTdBMwEzATdBMUExQTdBNgEdA5kDl4OdA5tDmQOdA5iDm0OZA5tDl4OXg5zDmMOXg5tDnMOfA6ADtMEgA5wDtME0wRwDuIEgAR9BIYEiASKBIAEiASABIYEggR8DtoEggTbDnwOfA7TBNoEjASCBNoExATaBNMEwQTTBMwE0wTiBMwEhgR9BIIEgASKBN4OgATeDn0E3g7fDn0EigSBBOkO3g6KBOkO3w7bDn0EfQTbDoIEgA5pDnQOaQ5iDnQO2w7mDnwO5g5lDnwOfA5pDoAOfA5lDmkOgA50DnAOXg5jDtAEgQTCDukO6Q7qDtoO2g7qDswO6Q7CDuoO4gRwDt0EcA50Dt0E3QR0Dl4O3QReDtAE2w7fDvAO2w7wDuYO3g7wDt8O6Q7aDt4O3g7aDu0O3g7tDvAOLg4jDj4OPg4jDhoOSw42Di4OVA4uDj4OSw4uDlQOEg45DgwOOQ4xDgwOAA4gDjkOAA45DhIO/w0xDksOMQ7gDUsOHA7zDdgNDA7/DR4ODA4xDv8N/w1UDh4OHg7zDRwOHg5UDvMNVg74DWIJVg4CDvgNVg44DtgNVg7YDfgNHA7YDTgO+A0CDmIJ+A3YDWIJUQ42DuANOg5BDkgOSA5BDiAOIA5BDkkOIA5JDjkOOQ5JDlEOOQ5RDjEOMQ5RDuAN4A02DksO/w1LDlQO8w1UDtgNVA4+DtgN2A0+Dt8N2A3fDWIJ3w13CWIJ8A7IDuYO5g7IDr4O5g63DmUO5g6+DrcOaQ5lDrMOZQ63DrMOaQ6zDq4OaQ6uDqUO7Q7KDvAO2g7KDu0O2g7MDsoO8A7KDsgO0w7gDuEOwQ7nDsUOwQ7hDucOyQ7FDucOyQ7nDu8O5g3yDVMOqg7RDfIN0Q1TDvINXQ5ADtEN0Q1ADlMOqg5dDtEN5g1TDkgOyQ7vDqEO7w5dDqEOoQ5dDqoOWw4eDj8OHg4cDj8Otg4eDlsOwg7gDtMOwg7iDuAOuw7mDQAOuw4ADhIOrw4eDrYO0w7hDsEOwg7ZDuIO4A7iDtkO4A7ZDuwO5g1IDiAO5g0gDgAOXQ51Dm4OXQ5uDiEOQA4hDi8Obg4vDiEOQA4vDlMOUw4vDkgOLw46DkgOPw4cDjgOPw44DlYOVg5iCXwJ4A7cDuEO3A7XDuEO4Q7XDucO5w7XDu8O7A7cDuAO3Q51Du8OXQ7vDnUOXQ4hDkAO7w7XDt0Olg4SDgwOhg6hDqoOhg6qDo4Olw6ODrUOjg6qDrUOlw61Dp8OtQ67Dp8Ocw5tDoUOaQ6lDmIOYg6lDqAOYg6gDm0ObQ6gDo0OtQ7yDeYNbQ6NDoUOoA6lDo0Oqg7yDbUOtQ7mDbsOzA7CDsoOyg7CDsEOyg7BDtEOwg7TDsEOsw6ODpcOvg6GDrcOsw63Do4Otw6GDo4Osw6lDq4Oyg7RDsgOsw6XDq4Org6XDp8O6g7CDswOvg7SDoYO0g6hDoYO0Q7FDsgOvg7IDtIOxQ7JDsgOyA6hDtIOyA7JDqEOwQ7FDtEOWw4/DmAO9ghnDv0Inw6IDqkOqQ6IDq8Onw67DogOiA67DhIOiA6WDq8Orw4MDh4OiA4SDpYOrw6WDgwOZw5WDnwJ/QhnDnwJYA5WDmcOYA4/DlYOlQ57DpwOew53DpwOdw57DvAIjQ62DlsOrg6fDqUOpQ6vDo0OpQ6fDq8OjQ5bDoUOjQ6vDrYOcw5/DpUOcw6FDn8OlQ5/DnsOnw6pDq8OYA5nDvYIew5gDvYIew72CPAIfw6FDlsOfw5gDnsOfw5bDmAOgwTUBNkEjQTDBMAEwwTRBMgEwwTIBOEEjQTABIMEwATUBIMEwATDBNQE1ATDBOEEyATbBOEEiwR+BH8EiwR/BJQEfwR+BJQEfwSJBH4EiQSDBH4EfgSDBNkEnASpBNwEnATcBNcEyATXBNEEtAS5BMgEyAS5BNEEuQScBNcEuQTXBNEEsASzBMMEsATDBI0EswTIBMMEswS0BMgEwwTIBMAEhQSJBIcEkwSwBI0EhwSJBH8EiQSNBIMEhQSHBIsEhwR/BIsEhQSLBJIElgSFBJIE0QTXBMIEzwTCBNcEzwTXBNwE0QTCBNsEyATRBNsE4wSpBJwEhQSWBIEEhwSQBIkEkASTBIkEiQSTBI0EgQSXBIUElwSPBJAElwSHBIUElwSQBIcEgQSPBJcEjwSGBJAEgQSKBIgEgQSIBI8EjwSIBIYEjASGBIIEkASGBIwEzAS0BLMEzATFBLQEjASwBJMEtATFBJwEtAScBLkExQTjBJwEwQTMBLMEkASMBJMEkwSwBJAEjATaBMQExATTBMEEjATEBLAExASzBLAExATBBLME0g2tDuMNrQ7+DeMN4w3+DZ0O/g2RDp0OmQ70DZEOkQ70DZ0OmQ4GDvQNBg5WCfQNVgltCfQNbQkFDvQN9A0FDp0ObQl6CQUOegmFCQUOhQlSCQUOUgkTDgUOBQ4TDp0OUgl3CTgOUgk4DhMOEw44Dp0OdwliCTgOYgl8CTgOfAl9DjgOOA59Dp0OfAn9CH0O/QhhDn0OfQ5hDp0O/Qj2CGEO9gjwCGEO8AhoDmEOYQ5oDp0O8Ah3DmgOdw6cDmgOnA68DmgOaA68Dp0OlQ6xDrwOvA6xDp0OlQ60DrEOtA5jDrEOYw54DrEOsQ54Dp0OYw7QBHgO0ATjBHgO4wSMDngOeA6MDp0O4wSpBIwO3ASkBIwOjA6kBJ0O3ATPBL4E3AS+BKQEpAS+BJ0OzwSoDr4EvgSoDp0OzwTyBKgO8gT7BKgO+wTTDagOqA7TDZ0O+wT8BNMN/AT/BNMN/wRSDtMN0w1SDp0O/wQWDlIOFg4YDlIOGA43DlIOUg43Dp0OGA4nDjcONw4nDp0OIg5MDicOTA7nDUYOTA5GDicOJw5GDp0ORg5MDp0O5w3vDUwO7w3uDUwOTA7uDZ0O7w3oDe4N7g3oDZ0OAw4PDugNDw7SDf0NDw79DegN6A39DZ0O0g3jDf0N/Q3jDZ0OLhAxEEEQmRA8EJcQOQg0CLQBgwGKAbQBgwG0AUYIRgi0ATQIwgFGCGYIwgGDAUYIRghvCMIBigGDAXEBYQFpAcIBgwHCAWkBYQHCAY8IcQGDAWkBjwjCAW8IYQF/CI8IsAG0AYoBtAFNCDkISAExATgBawE4ARQBawFIATgBFAE4AT0BSAFQATEBOQEUAT4BPgEUASQBOAEkARQBQgFXAUwBNAFXAUwBNAE5AVcBVwE5AT4BTAFXAcYBVQFAAU0BMQFfAWUBbQFfAVUBXwFtAWUBUAE6AV8BOAExASQBJAExASkBUAFfATEBOgFAAVUBOgFVAV8BCgENASgBCgEoATABKAE0ATABKAEjATQBHgEUASMBNAEjATkBIwEeATkB8gAoAQ0B8gB4ASgBfgEjAXgBKAF4ASMBHgEUATkBfgEeASMBfgFrARQBfgEUAR4BAgFCAUwBAgEwAUIBMAFMAUIBMAE0AUwBsQjaCHMBKQFlAY4BZQFtAYQBZQGEAY4BbQGhAYQBbQFzAaEBUQGrAb4BogFHAYABogGrAUcBUQFHAasBUQG+ARUBvgHEARUB2gjQCHMBcwE3CKEB0Ag3CHMBxgFXAb0BVwE+AV4B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/AHUAfMB8QHNAdQB8QHmAc0B8QHUAfwBiQHJAakBwAGUAakByQHjAZ4BnwGUAeYBlAHHAeYBwAHHAZQBiQHjAckBiQGpAZQBIxA6EDYQnwE2EJQBNhA6EJQBLhAcEBgQ9gGeAeMBlAEzEOoBiQGUAeoBGBDjATMQMxDjAeoBiQHqAeMBMxCUAToQmgG5AbYBmgG1AbkBuQGlAYsBuQGLAbYBggGMAbUBtQGMAbkB/gH8AZoBtgH+AZoBrwG1AZoBjAFjAbkBbAFjAYwBpQG5Aa0BYwFYAbkBWAGtAbkBswGZAfcBlwGZAbMBlwGyAZkB9wGZAe0B7QGZAYYBpAGFAYABhQF3AYABdwGFAaQBpAFuAXcB9gGXAZ4BngGXAfgBsgF9AZkBhgGZAW8BmQF9AW8BqAGAAbIBsgGAAUMBsgFDAX0BjwGGAWYBqAGkAYABhgFvAWYB4wDmAOoA6ADmAOMA6ADpAOYA6ADhAOkA6wC/AZEB6wDfAL8BvwHfAI0B3wDqAI0B5wDjAOQA5ADjAOsA6wDjAOoA6wDqAN8A6ADjAOIAhQGkAagBvwGNAcoBfQFDAYABjQGFAcoBygGFAagBUwFKAXYBLQF7AUYBRgF7AUoBSgF7AXYBUwF2AXEBWgFRARUBWgEtAWYBZgEtASoBKgEtAUYBLQFaARUBLQEVAXsBUwFxAVsBdQEgAWwBbAEWAWMBbAEgARsBbAEbARYBfQGAAW8BbwGAAUcBKgEgAXUBbwFRAWYBRwFRAW8BUQFaAWYBIAFTARsBIAEqAUoBGwFTARYBIAFKAVMBKgFGAUoBYQEhARkBYQGPCCEBNQE/ASEBWwFhAT8BcQFpAVsBWwFpAWEBPwFhARkBPwEZASEB0gD7AOgA6AD7AO8AAAHvAPgA7wD7APgA6ADvAAAB6AAAAeEAUwFbARYBFgFbAT8BPwFPAVgBTwE/ATUBrQFYAU8BYwEWAVgBWAEWAT8BTgFiAXoBTgF6AWsBawF6AUgBYgFqAVABYgFIAXoBYgFQAUgBIgFQAWoBOgFQASIBpgGCAa8BpgGsAYIBxwHAAeQBwAGpAeQBxwHkAd0BpgGvAZoBngH4AdEBngHRAakBtwGsAYcBrAG3AaMBhwGsAaYBrAGjAYIB5AHRAe0B0QH3Ae0BxwHdAbcB3QGcAbcBrwGCAbUB+AGXAdEB5AGpAdEB3QHkAfIBlwGzAdEB0QGzAfcBzQG3AawB/AGmAZoBxwG3Ac0B1AHNAawBrAGHAfMB8wGHAaYB1AGsAfMB8wGmAfwBnQGyAZcB6wCRAYgBkQHKAYgBkQG/AcoBiAGoAZ0BnQGoAbIBiAHKAagBiAHWAJEB6wHWAPUB1gDrAJEB9QHWAIgB4ADoAOIA4ADiAOcA5wDiAOMA3QDnANEA3QDgAOcA0QDnAOQA0gDoAN0A3QDoAOAAhgGPAfIB3QHyAZwBtwGcAaMBowGcAYIB8gHtAYYBowF1AYIB8gHkAe0B0wDrANYA0QDkANMA0wDkAOsA9gGdAZcB9gH1AZ0B9QGIAZ0BowGcAXUBggFsAYwBggF1AWwBjwGcAfIBjwFmAZwBdQGcAX8BnAFmAX8BfwEqAXUBfwFmASoBNAjVAeIB4gHVAf8BNAgCAtUB1QECAv8BNAg5CAICOQhNCAICTQg3CAICNwglAQICAgIlAf8BNwjQCCUB0Ag3ASUBJQE3Af8B0AjaCDcB2gixCDcBsQg7ATcBNwE7Af8BsQhNATsBTQFAATsBQAFgATsBOwFgAf8BOgFSAWABYAFSAf8BOgEiAVIBIgFqAVIBUgF5Af8BagEfAXkBeQEfAf8BagFgEB8BYBBlEB8BZRBxEB8BcRAvAR8BHwEvAf8BLwF/EP8BfxAhEP8BIRDOAf8BSRA3EM4BNxApEM4BKRD9Ac4BzgH9Af8BKRAjEP0BIxA2EP0BNhCBAf0B/QGBAf8BNhCfAYEBnwHmAYEB5gGuAYEBgQGuAf8B5gGxAa4BrgGxAf8B8QHUAbEBsQHUAf8B/AHYAdQB1AHYAf8B/AH+AdgB/gHBAdgB2AHBAf8B/gG8AcEBwQG8Af8BtgGLAdkBtgHZAbwBvAHZAf8BiwGlAdkBpQGtAdkBrQHvAdkB2QHvAf8BrQFPAe8BTwE1Ae8BNQHcAe8B7wHcAf8BNQFBAdwB3AFBAf8BNQEhAUEBIQGPCEEBjwhvCEEBbwjiAUEBQQHiAf8BbwhmCOIBZghGCOIBRgg0COIBFAUWBRUFFgUUBREFFAUVBQgFCAUKBRQFCwUUBQoFEwURBRQFCwUTBRQFCwUSBRMFDgURBRMFEwUSBQ4FCwUJBRIFEgUJBQwFEgUMBRAFCAUVBTsNOw0KBQgFFgURBQMNCwUKBRgNBQ0RBQ4FGA0JBQsFDQUOBRMFEwUTDQ0FEw0TBRIFEw0SBRAFCQUjDQwFEAUMBQ8FCgU7DRoNFgUDDf8MCgUaDRgNAw0RBQUNCQ0OBQ0FCQUYDR4NCQUeDSMNCQ0NBRMNBA0TDRAFBA0QBQYNDAUjDSENEAUPBQYNDwUMBSENDwUhDQYNOw0VBfEMBQ0OBQkNCQ0TDQQNIQ0IDQYNIQ0rDQgNFgX/DPIMBA0PDQkNCA0rDSYN9Qz/DAMNIw0eDRsNBA0QDQ8NCA0mDQ0N8QwVBRYF9QwMDf8MHg0YDSoNHg0qDRsNIQ0jDRsNGw0ZDSENEA0EDQYNDQ0mDUgNGA0iDSoNGQ0rDSEN/wwMDRcNEA0GDQgNSA3mDA0N8gzxDBYFFw3yDP8MGg07DSUNCQ0UDQUNKw0ZDR0NCA0VDRANKw0dDSYNFQ0IDQ0NJw1KDSYNAQ07DfEMMg0lDTsN9QwXDQwN7QwXDfUMDg31DAMNGA0aDSUNEQ0DDQUNKg0YDRwNKg0cDRsNAg0JDQ8NGQ0bDR8NEA0HDQ8NHQ0ZDSkNBw0QDRUNJg0dDScNKQ0nDR0NDQ0WDRUNSA0mDUoN4wwNDeYMTQ3mDEgN4wzmDE0NTQ1MDUgNMg07DQENDg3tDPUMIA0YDSUNDg0DDRENHA0YDSANEQ0FDRQNGw0cDSQNHw0bDSQNAg0PDQcNKQ0ZDR8NFg0NDeMMSg1NDUgNFA0JDQIN5AzjDE0NTA3kDE0NCg0HDRUNTQ1KDUwNRw1MDUoNAQ3xDPIMDg0XDe0MTA1ODeQMTg1MDUcNSw1ODUcNDg3yDBcNTg3lDOQMHw0kDTANKA0tDTINJQ0yDS0NLQ0gDSUNIA00DRwNJA0cDSwN9wwCDQcNCg0VDRYNSg1BDUcNCw0BDfIMMg0BDQsNKA0yDQsNEQ3sDA4NAg3zDBQN+gzzDAINCg39DAcNFg30DAoNKQ02DScNJw02DUoNQw1LDUcNSw1FDU4NTg3qDOUMEg0LDfIM7wwSDfIM7wzyDA4NDg3sDO8MMQ0gDS0NIA0xDTQN7AwRDRQN8wzsDBQNHA00DTgNOA0sDRwNJA0sDTAN9wz6DAINHw0wDTUNKQ0fDTUN/Qz3DAcNNg0pDTUN9Az9DAoN8Az0DBYNFg3pDPAMSg02DUENFg3jDOgM5AzoDOMMSw1DDUUN6AzkDOoM5AzlDOoMLQ0oDQsNFg3oDOkMQw1HDUEN+wwtDQsNOA0wDSwNPw1ODUUN6gxODT8NNA05DTgNOA05DTAN9Az3DP0M+wwLDRIN7wz7DBINLQ37DDEN+gz3DOsMNQ0wDToN7wzsDPYM8wz6DO4M+gzrDO4MOQ06DTAN6wz3DPQM9gz7DO8MMQ37DPYM/gz2DOwM/gzsDPMM8wzuDP4MNQ06DTwNNQ08DTYNNA0xDfYMNA32DP4MNA3+DDgNNg08DUEN6AzqDD8NOA3+DO4MNw04De4M/AzuDP4MOQ0vDTgNOg05DS8NPQ1BDTwNPw3qDEINAA3uDPwMAA03De4MMw04DTcNOQ04DTMN6wwADe4MMw03DQANLw05DTMN+AwADesM6wz0DPgM+Qz4DPQMPA06DS8N+Qz0DPAMLg08DS8NPQ08DUYN5wz5DOkM8AzpDPkMRg1EDT0N6QzoDOcMPQ1EDUENRA1DDUENRQ1DDUIN6Aw/DUQNRQ1CDT8N+AwzDQAN+AwvDTMNLg0vDfgM+QwuDfgMRg08DS4N5wxGDfkM5wxEDUYNRA3nDOgMQw1EDUINPw1CDUQNRg0uDfkMRAVFBUAFQAU+BUQFQAVFBWIMWgxABWIMRQVvDGsMRQVEBW8MWgxZDEAFWQw+BUAFPgVZDGQMbwxEBT4FPgVkDG8MawxiDEUFYAxiDGsMYAxrDG8MWQxSDGQMagxiDGAMWgxiDGoMWgxSDFkMUgxaDFQMYAxvDGMMbQxkDFIMYwxvDG0MbwxkDG0MVAxaDGoMjAxqDGAMfAxUDGoMUgxUDGoMUgxqDG0MhgxjDG0MagyMDHwMfAx4DGoMjAxgDGMMeAxtDGoMYwyGDIwMbQx4DIYMhgx8DIwMhgx4DHwMTA0+DT8NTg1MDT8NTg0/DUsN6gzlDD8N5QxODT8NQA1JDU4NPw1ODUkNPw0+DU4NRQ1LDT8NQA1FDT8NQA1ODUUN6gw/DUANPw1JDUANxg3QDcoNxg3NDdANxg3KDcQNyA3EDcoNbQ1kDWoNbQ1rDWQNbQ1qDWMNZA1jDWoNag1jDWkNZw1qDWkNwA1pDcENyg3HDcgNyg3QDccNbg1kDWsNaw1tDWMNYw1qDWsNww3ADcINxA3JDcINxg3EDcsNzQ3LDc8Nxg3LDc0Nag1nDWsNwQ1pDWINwA3BDcINwg3DDcQNxQ3JDcQNxQ3EDcgNyw3EDckNxQ3IDccNzA3HDdANzQ3MDdANzA3QDc4NaQ1jDWINzQ3PDcwNbw1mDW4NZg1kDW4NYg1nDWkNYQ1oDW8NyQ3FDccNyw3JDccNzA3LDccNzw3LDcwNaA1mDW8NYg3BDcINYg3CDV8NXw2sDWINZw1iDasNrA2rDWINqw2sDbgNrA21DbgNtw24DbUNtQ20DbcNUQ1oDWENtw22Db4Nvw23Db4NcQ1vDW4NYg1jDVoNeA1xDW4Naw1xDW4Nrg2rDbgNaA1RDWYNWw1hDW8Nbw1UDVsNcQ14DW8NYw1kDV4NcA1xDWsNXw1iDVoNUQ1hDVsNXQ1mDVENZA1mDV0NZw2rDWwNtg23Da8NeA15DW8NVw1jDV4NcQ1wDXcNcA1rDXcNaw1QDXcNUA1rDWcNZw1SDVANWg1lDV8NrA1fDWUNtQ2sDbINtA21DbMNtw20DbENvA23Db4Nvg22Da8Nvg2vDbwNXg1kDV0NcQ13DXgNWg1jDVcNrg24DbcNsA2uDbcNtw2xDbANtA2zDbENsQ23DbwNuw2+DbkNeQ1UDW8NrA1lDa0Nrg1sDasNsg2sDa0NtQ2yDbMNvQ2xDbwNvA2+DbsNvg28DbkNuw25DbwNsQ2vDbcNUA1SDXcNZw1sDVINdg13DVINbA2uDZkNsg2tDbANvA2vDbENUg1sDZgNsA2tDa4Nsw2yDbANsQ2zDbANbA2ZDZgNrQ1lDa4NmQ2cDZsNmA2ZDVINrg1lDWwNbA1lDZkNnA2dDaMNow2dDaQNpA2dDaYNpg2dDaoNWg1XDVUNmQ1lDVoNUQ1bDV0NUg2YDXYNXQ1bDVkNWw1ZDVQNcg1UDXkNVA1yDVkNcw14DXcNdA1zDXcNmQ1aDVwNmw2ZDZ8NUw1dDVkNXQ1TDV4NeA1yDXkNVw1eDVYNUg11DXYNmQ2XDZgNnw2ZDZoNpA2mDaMNXg1TDU8Ncw1yDXgNVg1eDU8Ndg11DXcNUg1cDXUNmA2XDVINmQ1cDZoNmg2XDZkNoA2ZDZsNnA2gDZsNnw2cDZsNnA2eDZ0Npg2qDagNfQ10DXcNeg19DXcNdQ19DXcNdQ12DYgNlw1cDVINmQ2gDZoNoA2fDZoNnw2gDZwNow2fDZwNng2cDZ8NqA2jDaYNqg2dDZ4Nqg2eDakNqQ2oDaoNpg2oDacNpQ2mDacNfg19DXUNWg1VDVwNiA11DVwNiA1cDYQNXA2XDYQNoQ2iDaMNoQ2jDagNpQ2nDagNpg2lDagNWA1PDVMNVQ1XDVYNfg11DYANow2iDZ8NUw1ZDVgNcw10DX0Nlw2aDVwNiA2EDYkNqA2iDaENVQ1WDWANfQ1+DXoNiQ2EDYMNVg1PDWANfA1zDX0Neg18DX0New1+DYANgA2BDX8Nfw2BDYINVQ1gDVwNew16DX4Nfw17DYANdQ2IDYANnw2iDZ4Njg2JDYMNjg2NDYkNoQ2eDaINqA2eDaENqQ2eDagNcg1YDVkNYA1PDVgNeg17DX8Ncw1YDXINjQ2ODYwNjA2ODY8NdA1YDXMNYA1YDXQNfg2IDXUNgA2IDX4Nlg2VDZQNdQ10DX0Neg2ADX0NgA16DX8NdQ1gDXQNdQ1cDWANhQ2DDYQNfg19DYANhA1cDXUNiA2EDXUNgg2ADX8Ngg2BDYANig2JDY0NjA2ODYsNiw2NDYwNhw2EDYgNhA2HDYUNiA2JDYcNhQ2GDYMNiQ2KDYYNjg2DDZANlg2MDYsNlQ2WDZINkw2WDZQNlQ2TDZQNhg2HDYgNhg2FDYcNhw2JDYYNgw2GDZANjg2QDYoNiw2ODYoNiw2KDY0Niw2SDYwNkg2WDYwNkQ2VDZINkg2WDZMNig2QDYYNkw2VDZENkQ2SDZMN7QPSA9oDCATaA9ID2gMIBP0D2gP9A+MD7QPnA9IDGATaAzkEGATtA9oDOQTaA+MDOQTjAzwE7wPjA/0DPATjAygE4wPvA88DKATjA88DGATnA+0DLwQoBM8DzwPvA9cDLwTPA9cDAgTYA+cDDwTnAxgE2APSA+cD7wP9A2QEQgQoBC8E1wPvA2gEZARoBO8DaATZA9cD1wPZAy8EDwQYBFkECATSA/oDCAT6AwoECAQKBP0DOQQ8BEwEPARGBEwERgQ8BCgEKARCBEYEZAQLBGgEQgQvBNkDQgTZAzcEYARuBOcDDwRgBOcDbgQCBOcDbgTYAwIEbgR0BNgDdARxBNgDcQTSA9gDVAQYBDkEUQQ5BEwECgRkBP0DCwTTA2gEaATTA9kDNwTZAzEE2QPTAzEEVwTnA24EYAQPBFkEVARZBBgEzgPSA3EE+gPSA84DUQRUBDkERgRdBEwERwR0BG4EVwRuBGAE+gPOA9UDYgRUBFEEXQRRBEwERgRCBDcEaAQLBOoD0wMLBM0D6gPNAwsEMQTTA80DMQTNAywEVwRHBG4EdATOA3EEYgRRBF0EWARdBEYEUgRYBEYERgQ3BFIELAQkBDEELATNAyQEzQMHBCQEZQRXBGAEdATgA84DSwRZBFQEVARiBEUEWARiBF0EZAQKBOsDaARkBOsD6gMHBM0DJAQbBCwEJAQHBP4DGwQkBP4DSwRUBEUE9AMHBOoDGwT+A/cDWgRXBGUENwQfBFIELAQ3BDEEBwT0A90D3QP+AwcEGwT3AxcEFwT3A+wDFwQMBBsEFwTsAwwE7AP3AxoEDATsAxoE/wMMBBoEWgRHBFcEYARZBEsEHwRYBFIEaATrAwsE4gP+A90DTwRHBFoEZgRaBGUEdQRmBGUERwQwBOADdARHBOADXQRYBEgEMgRYBB8ECwTrA/IDDgQfBDcEDgQ3BCwE/gPiA/cD8QP/AxoEGgQUBPEDTwRfBEcERwRcBDAESwRsBGAEWAQyBFAE8gNwBAsEHwQ7BDIE6gMLBOQD9APqA98DKwQOBCwEKwQsBCQEGwQrBCQEDAQ2BBsE3gPxAxQEXARHBF8EdwR1BGUEYAR3BGUEdwRgBGwEzgMGBNUDRQReBEsEXgRFBGMEYgRjBEUE/AP6A9UDYgRDBGMEYgRdBEMEXQRIBEME+gPUA9ED0QMKBPoD6wMKBOYDTQRIBFgE8gPrA+YDcATkAwsEOwQfBA4E5APfA+oD3QP0A98D8APdA98D6QPiA90D9wPiA+kDGwQ2BCsEDAT/Az0E/wP2Az0E7AMtBBoEFAQaBDUEdQRPBGYETwRaBGYE4AMwBB4EbARLBFME4APzA84DXgRTBEsEBgT8A9UD+gP8A9QDCgTRA+YDUARNBFgE8gPmA9sD8gPbA3AEPwQ7BA4EDgQVBD8EFQQOBCsE3QPwA+kDKwQuBBUELgQrBDYE9wPpAwUEDAQ9BDYE7AP3AwUEBQT5A+wDPQT2A9YD+QMtBOwD9gP/A/EDMARcBB4EBgTOA/MDPQTWAyEELQQ1BBoEFAQ1BN4DTwRzBEoESgRfBE8E4AMeBPMDPwQVBBAELgQ2BBUENgQZBBUEIQQ2BD0EIQTWA/YDAwT2A/ED8QPeAwMEcwRPBHUEVQRfBEoEXwQeBFwEQwReBGMEOwQQBD8EIQQZBDYELQT5AxMEEwQ1BC0E3gM1BOEDHgRfBCcEdwRsBGoE/AMGBNQDdQR3BGoEWwRsBFMEbQReBEMEMgRNBFAE5ANwBDgENQQTBCUE4QM1BCUEJwQBBB4EBgTzAxEEbQRTBF4EQQTfA+QD8APfA0EE6QPwAw0EBAQVBBkEIQQEBBkEAwTeAyYESQ/eA+EDSgRzBEQEdQREBHMEdQRqBEQEXwRVBGkEJwRfBGkE8wMeBAkE0QPUAyME0QMjBDME5gPRAzME0AN2BE0E0ANNBDIEOARwBEkEQQTkAzgE8ANBBA0EJQQTBPgD9gMDBCYEaQRKBEQEVQRKBGkEYQRqBGwEZwRTBG0E1AM0BCME5gMzBDoEeARIBE0EeARNBHYEcATbA0kE5QPQAzIE5QMyBDsE9QM7BBAE6AP1AxAE6AMQBBUE6QMNBBYE6AMVBAQEEwT5AyAE3gNABCYEagRWBEQE1AMGBDQEbwRtBEMEbwRDBEgEbwRIBHgE5gM6BD4E2wPmAz4EOARJBE4E5QM7BPUDBQTpAxYEBQQWBBwE+QMFBCAE+wMhBPYDEgT7A/YDEwQgBPgDJwTuAwEEaQTuAycEYQRsBFsEBgQRBB0ENAQGBB0EbwRrBG0EIwQpBDME2wM+BEkEOAROBEEEBQQcBCAE+wMEBCEEJgQSBPYDVgRqBGEEAQQJBB4EUwRhBFsE8wMJBBEEJQT4AwAE4QMlBAAEUwRnBGEEKQQjBDQEWwRhBGcE+wPoAwQESQ/hA1kPKQQ0BCIEBAT1A+gDKg9pBEQENAQdBCIEeAR2BNADQATeA0kPOg9WBGEECQ9nBG0EPgQ6BEkE9QPcA+UDIAQcBPgDWQ8ABPgDAARZD+EDag8BBO4DLQ9hBFsEbwRyBGsEJgQ+DxIEKg9EBFYEAQRoDwkECQRoDxEECQ9bBGcEIgQdBEAPbQRrBHIEcgRvBBUPGA8VD28EKQRTDzMEeAQYD28EXw/lA9wD9QNfD9wDbA/1A+gD+wNsD+gDRw9nD/sDRw/7AxIEWQ/4A2sPJgRABEkPKg9WBDoPaQQqDzcPag/uA2kEEQRoD2YPCQ8wD1sEEQRFD0APEQRADx0EcgQCD20EcgQVDwIPKQQiBFMPUQ86BDMESQQ+BCQP0APlA1wPOARJBCQPOAQkD0EEQQRNDw0EYw9fD/UDSg9EDw0EFgQNBEQPYw/1A2wPHAQWBD8PbA/7A1sPWw/7A2cP+AMcBD8PPg9HDxIEAQRqD2gPOg9hBC0PUw8iBD0PMwRTD1EPGA94BA4PPgQ6BE4PSA8+BE4P0AMOD3gEPgRIDyQPZA8OD9ADZA/QA1wPTQ9BBCQP5QNfD1wPSg8NBE0PQg8WBEQPFgRCDz8PWw9nD14Paw/4Az8PYg9ZD2sPSQ8+DyYEMA8tD1sEEQRmD0UPAg8JD20EQA89DyIEOgRRD04PJA9ID1IPUg9NDyQPYw9sD1sPTw9rDz8PZw9WD14PRw9WD2cPSQ9HDz4PCw9pBDcPbQ8OD2QPXA9tD2QPXA9lD20PaQ9lD1wPUg9KD00PaQ9cD18PaQ9fD2MPVQ9LD0IPSw8/D0IPPw9LD08Paw9PD2IPag9pBBQPVQ9ED0oPQg9ED1UPRw9JD1YPJw8qDzoPXg9jD1sPTw9iD0sPNw8qDycPYA9qDxQPPQ9AD1MPBA8OD20PYw9hD2kPDg8VDxgPTg8aD0gPUg9IDxoPSg9BD1UPUA9VD0EPTw9LD1UPXQ9FD2YPQA9FD1QPDg8ED/8ObQ//DgQPTQ9SDxoPSg9ND0EPYw9QD2EPYw9VD1APWw9VD2MPSw9VD1sPSw9bD14PTw9LD14PVg9PD14PYg9PD1YPYg9WD0kPWQ9iD0kPZg9oD10PRQ9mD1QPUw9AD0wPGg9ODyEPTQ88D0EPYQ9BD2kPUA9BD2EPaA9qD2APHQ8tDzAPBg8CDxUPAg8GDw0PEg8GDxUPEg8VDw4P/w4SDw4PIQ9RDzUPTg9RDyEP/w4EDxAPIQ8zDxoPTQ9SD0MPTQ9DDzwPZQ88D0MPaQ88D2UPQQ88D2kPFA9pBCUPaA9gD10PCQ8WDyMPCQ8jDzAPFg8JDwIPUQ9TD0YPUQ9GDzUPMw8hDzUPGg8zD1IPbQ8QDwQPEA9tD0MPUg8uD0MPPA9YD0MPQw9tD2UPHQ8nDy0PWg9UD2YPAg8NDxYPDQ8GDwAPAw8GDxIPGQ8SD/8OEA8ZD/8OIA8uDzMPUg8zDy4PQw8RDxAPQw8gDxEPQw9YDyAPQw8uDyAPJw86Dy0PQA9UD0wPAw8ADwYPRg9TD0wPGw9GD0wPNQ9GDzgPEQ8cDxAPIA8zDxwPIA8cDxEPWA8gDxwPJQ9pBAsPIw8dDzAPXQ9aD2YPRg8bDzgPHA8ZDxAPKQ8zDzUPHA8zDykPDQ8KDxYPHA8pDxkPAA8KDw0PHw8bD0wPGQ8pDxIPKQ81DzgPCg8jDxYPKw9MD1QPKQ8mDxIPKQ84DyYPKw8fD0wPJg84DxsPJg8DDxIPJg80DwMPHQ8jDwcPXQ9UD1oPMg8jDwoPVA8PDysPAw80DwAPNA8mDxsPOQ8lDwsPKA8UDyUPYA8UDygPXQ9gD1oPVA9dDw8PGw8fDysPMg8HDyMPCg8BDzIPGw8rDxcPNA8vDwAPNA8bDwUPJw8IDzcPVw9gDygPKA9dD2APHg8PD10PIg8rDw8PKw8iDxcPAA87DwoPLw87DwAPLw8MDzsPNA8MDy8PNA8FDwwPGw8XDwUPCw83DwgPEw8IDycPCA8nDx0PHg8iDw8PMg8BDwcPAQ8KDzsPAQ87DwwPBQ8XDwwPBw8IDx0PHg9dDygPNg8oDyUPIg8XDx4PAQ8sDwcPDA8iDywPAQ8MDywPDA8XDyIPNg8lDzkPOQ8LDwgPHg8sDyIPBw8sDzEPNg85DwgPMQ8sDx4PHg8oDzYPBw8xDwgPMQ8eDzYPMQ82DwgPxgPCA8cDwgPDA8cDxQPBA8YDwQPCA8YDwQO9A8IDwgO9A8ADwgPAA8MDywPBA8UDywO/A8EDvgO9A8EDxQPGA8kDyQPGA8cDxAPHA8MDxwPEA8gDywO5A78DvwO5A8EDkwPLA8UDuQOyA8EDkwPFA5sDvgPBA7IDsgO9A74DyQPKA4sDxwPKA8kDtQO6A70DxwOUA8oDugPAA70DugPDA8ADwwO6A68DwwOsA8QDwwOvA6wDyAPEA50DywOTA7kDkAObA8UDkAPJA4sDyQOQA8UDsgO1A70DygOUA4sDogPHA50DxwPIA50DrAOdA8QDuQOTA7wDkwObA5ADsgO5A7ADlAPHA6IDugOsA68DvAOwA7kDkwOQA58DkwOVA7wDugO7A6wDsAO8A6sDmAOTA58DnwOQA5IDsAOzA7IDsgOzA64DugOjA7sDnQOsA48DpQO8A5UDkwOYA5UDmAOfA44DoQOQA4sDlAOhA4sDqQO6A7UDugOpA6cDuwO4A6wDoQOcA5ADtQOyA6kDlgOhA5QDigOWA5QDogOKA5QDowO6A6cDogOdA48DuAO7A6MDuAOPA6wDlQOYA6UDqwO8A7YDkgOQA5wDsgOuA6kDogOPA4oDsAOrA7YDswOwA7YDkgOOA58DtgO8A6UDigOPA5YDrQOSA5wDmQOjA6cDtAOOA5IDtAOSA60DmQOnA5cDmgO2A6UDqQOuA54DqgOcA6EDqQOgA6cDqAOlA5gDqAOYA44DtgOMA5EDtgORA7MDswORA64DrgORA54DpwOgA5cDlgOmA6EDpgOWA6QDjwOkA5YDsQOPA7gDmgOlA6gDjgO3A6gDtwOOA7QDrQOcA6oDqQOeA6ADqgOhA6YDjwOxA6QDsQO4A40DjAO2A5oDjQO4A5kDmQO4A6MDmw+tA6oDmw+qA50PnQ+qA6YDoAOeA8UPlwOgA9MPsQONA8EPtA+oA7cDpAOjD6YDkQOMA5oDtA+kD6gDjAORA74PlQ+0A60DsA+jD6QDsQOwD6QDmQPND40DtA+3A7QDzQ+ZA5cD0w/ND5cDwQ+NA80PsA+xA8EPnw+oA6QP0Q++D5oDvg+RA5oDyA+RA74PngORA8gPnQ+mA6MPmgOoA58Pnw/OD5oDlQ+tA5sPoAPFD9MP0Q+aA84PlQ+0D7QDngPID8UPzg+fD9EP0Q+fD6QPmw+oD5UPtA+hD6QPyA++D7cP0w/FD8APzA+3D74PlQ+oD7QPrg+bD50PzA/RD8QPzA++D9EPpA+hD6gPoQ+0D6gPxQ/ID7YPqg+oD5sPzQ/TD8APow+yD50PsA+yD6MPzQ+9D8EPsA/BD9IP0Q+kD7EPxQ+2D8APsg+uD50PvQ/ND8APqg+bD64P0g/BD70P0Q+xD8QPqA+xD6QPtg/ID7cPsg+wD6YPpg+wD9IPtw/MD8QPvQ/AD60Plw+xD6gPtg+3D6sPrQ/AD7YPrQ+zD70Pzw+mD9IPtw/ED8YP0g+9D7MPzw/SD54Pmg/GD8QPww+qD64Pyg+xD5cPsg+mD88Ppw+3D8YPtQ+qD8MPrQ+2D6sPvA+uD7IPng/SD7MPuQ+XD6gPuQ+oD7UPqw+3D6cPtQ+oD6oPsQ+aD8QPpw/GD5oPyg+aD7EPyg+XD7kPrQ+YD7MPyQ+yD88PrQ+rD5wPww+uD8cPvA/HD64Psg/JD7wP1A+1D8MPyg+5D9QPuA/PD54PrA+nD5oP1A+5D7UPmA+tD5wPmA+zD70Png+zD5gPmg/KD7sPuw+sD5oP1A/CD8oPwg+7D8oPpw+gD6sPqw+gD5wPpw+sD6UPoA+nD6UPyQ/PD7gPuA+eD6kPxw/UD8MPyQ/HD7wPqQ+eD5gPrw+lD6wPjw+eD5gPnA+gD40Puw/CD6wPjQ+WD5wPoA+lD68PjQ+gD5APjQ+ZD5wPmA+cD5kPuA+pD34Prw+sD4gP1A/HD3gPfg+pD4UPwg+BD7sPoA+iD5APiA+sD8IPdg/HD8kPwg/UD3sPeA97D9QPhQ+pD5gPlA+gD68Plg+ND5APmQ+ND5YPmA+ZD48PuA92D8kPgQ+ID8IPew+BD8IPog+gD5QPiQ/HD3YPiA+UD68Plg+QD6IPdg+4D34PiQ94D8cPiw92D8kPhQ+YD48Pug+PD5kPiQ97D3gPjw+CD5gPfw+UD4gPjg+BD3sPmQ+WD7oPjw+6D4IPiw92D34PhQ+PD4IPiA+BD3cPlA+/D6IPdg+LD4kPfw+ID3cPhA+/D5QPog+/D5YPhA+UD38Piw9+D5MPgA+FD4IPjg93D4EPiQ+HD3sPig9+D4UPug+WD78Pkw9+D4oPig+FD4APhw+OD3sPiQ+SD4cPeg+ED38Peg+/D4QPvw/LD7oPyw+/D3oPkg+JD4sPfA+CD7oPdw+OD30Phg99D44PeQ93D30PeQ9/D3cPhg+OD4cPeg9/D3kPkQ+SD4sPfA+6D9APkg+GD4cPkQ+LD4oPiw+TD4oPug/LD9APgA+CD3wPhg+SD4wPgw95D30Phg+MD30Peg95D4MPfQ+MD3IPyw96D9APgw99D3IPcA9yD4wPkg9wD4wPkg9uD3APeg98D9APbw+RD4oPfA90D4APcg96D4MPkg+RD24PfA96D3QPbw+KD3EPcQ+KD4APcw9xD4APeg9yD3UPeg91D3QPgA90D3MPcQ9uD5EPcQ+RD28PdA91D3IPcQ9wD24PdA9yD3MPcw9yD3EPcQ9yD3APgQSWBJgEgQSYBIQEmASWBJIEkgSRBJgEgQTYDpYEgQSEBOkOhASOBOkOkQSSBMMOhATjDo4EmASRBMMOzg6WBNgOgQTpDtgOjgTjDukOkgTADsMO+w7DDsAOkQTDDvwOhASYBM0Ozg7ADpYEww77DvwOhATUDuMO1A6EBM0OzQ6YBMMOwA7ODscOzg7YDusOxw7ODusO2A7pDtoO2g7pDuMOwA7HDtAO1A7kDuMOzw7NDsMO0A7HDusO6w7YDuoO4w7VDtoOzw7DDvwOxA7ADtAOvw7UDs0O0A7rDsQO6g7EDusOyw7ADsQO2A7aDuoO+w71DvcO/A77DvcOzw78DvcO5A7VDuMO5A7UDr8OzQ7PDr8O9w71DssOzw73DssO6g7aDtUOxg7qDtUOxg7VDuQOzw7oDr8O2Q7LDsQOwg7qDtoO6A7kDr8OxA7qDuIOxg7CDuoO2Q7WDssO1g7PDssO6A7PDtYO4g7qDsIOxA7iDtkO5A7oDsYO1g7ZDugOxg7iDsIOxg7oDuIO6A7ZDuIONQTWAy0E1gM1BN4D1gPeA/YD3gMDBPYDKgQtBNYDEgT2AwMEzAM1BC0EzAMtBCoE1gP2AxIEEgQqBNYDEgQDBCYENQTMA+EDQAQDBN4D3gPhA0AEQAQmBAMEJgQqBBIEYg/MAyoEQAQ+DyYEWQ/MA2IP4QPMA1kPSQ8qBCYESQ9WDyoEQAThA0kPYg8qBFYPSQ8+D0AEYg9WD1kPSQ9ZD1YPChAJEBMQChATEA8QBxATEAkQExANEA8QExASEA0QExAHEBIQDRASEBEQChAPEAsQCBASEAcQDBANEBEQCBAREBIQDBAREBQQFBAREBAQChALELkCChC5AqkC4wIJEAoQhQK5AgsQCxAPEIUCBxAJEOMCCBAHEOYCiwINEAwQ5gLrAggQ6wIREAgQFBAQEA4QBxDjAucChQIPEA0Q5gIHEOcChwKFAg0QhwINEIsCjwKLAgwQ6wKGAhEQjwIMEBQQEBAREIgChgKIAhEQFBCQAo8CkAIUEA4QkAIOEIgCDhAQEIgCkAKIApMC4wLfAucC6wLuAoYCigKTAogC7QKGAu4CiAKGAu0CkwKKApkCChCpArsCiwKPArwCkAK8Ao8CmQKKAowChwKLAqECoQKLArwCjALQApkC5wLfAu8CtwK8ApACkAKyArcCkAKTArICuwKpArkC4wIKELsCowKHAqEC6wLmAvECmQKyApMC2ALQAowCqgK5AoUC7wLfAukCjQKFAocCpgKhArwCpAKmArwC6ALuAusCpAK8ArcCigKIApUCrAKyApkCmQLNAqwCmQLQAs0C0ALZAtIC0ALYAtkC4wLiAt8CqgKFAo0C6QLfAuIC5wLvAvACkQKNAocC7ALmAucCkQKHArgChwKjArgCuAKjAqEC6wLxAugCpAK3ArIClQKIAu0CogKyAqwCjAKKApgCigKVApgC2AKMApgC0ALXAs0C2QLXAtACuwK5AqoC8ALvAukC5wLwAuwCtAK4AqECtAKhAqYC7gLoAuUC7QLuAuUCpAKyAqIClQLtAuoCrAKcAqICnAKsAs0C2AKYAs8C1wLZAs0CzwLZAtgC4wLeAuIC5gLsAvEC7QLlAuoC2QLPAtMC2QLLAs0C3gLjArsC8ALpAuICtAKRArgC8ALiAt4C2QLaAssCywLaAsQC2QLVAtoC1QLZAtMCmAKVAuoC8gLeArsClgKqAo0C2wLwAt4CmwKNApEC6gLlAuQC1AKcAs0CzwKYAscC2gLVAskCqgKJArsCjQKbAp8C8QLsAtwCpwKRArQCpwKbApEC8QLcAt0C6ALxAt0C5QLoAuAC5QLhAuQClQLqAuQCkgKiApwCmAKVAqUCmAKlAscC1gLNAssC0wLPAsUC1QLTAskC2gLRAsQC8gK7AokCiQKqApYC2wLeAvICnwKWAo0C2wLcAvAC3ALsAvACsQK0AqYC4ALoAt0CpgKUArEClwKmAqQC5QLgAuECpAKOApcCjgKkAqICkgKOAqICpQKVAuQC1AKSApwC1gLLAsQC0QLWAsQC0wLFAskCwQLRAtoCpwK0ArEClAKmApcCpQLkAqgC1ALNAtYCxQLPAscC2gLJAsECswKJApYClgKfArMCpwKxAq8CrwKxApQC5ALhAqgC2wLyAokC2wLdAtwCrwKUApcC4QKaAqgC2wKJArMCswKfApsC4QLgApoCrwKXAr0CvQKXAo4CvQKOArYCkgK2Ao4C2wKzAq4CrgKzApsC3ALbAq4CvgLcAq4C3QLcAr4C4ALdAp4CmgLgAp4CpwKuApsCmgLdAr4CngLdApoCtgKSAr0CrgKnAr4CmgK+Ap4CkgLAArYCwAKSAtQCngK+AqcCsQKeAqcCsAKlAqgC1ALMAsAC1ALWAswC0QLIAtYC0QLBAsgCtQKeArECqwK1ArECugKeArUCsQKvAqsCmgKeAroCugK1AqsCnQKvAr0CnQKrAq8CqAKaAroCrQKoAroCvQKgAp0CsAKoAq0CvQK2AqACtgLKAqACwALKArYCxwKlArACwgLHArACygLAAswCxQLHAsICwwLFAsIC1gLIAswCzALFAsMCyQLFAswCzALIAsECyQLMAsECrQK6AqsCnQKtAqsCoAKwAp0CsAKtAp0CoALKArACygLCArACzALCAsoCwwLCAswC2g/dD9kP3g/ZD90P2Q/eD08D2g9tA1ED2g9RA90PbQPaD2MD2g9lA2MD2g/ZD2UDUQNPA90P3g/dD08DZQPZD3AD2Q9PA3ADUQNZA08DYQNtA2MDUQNtA2EDbwNjA2UDWQNRA1sDWwNRA2EDbwNlA3ADZANwA1kDWQNwA08DYQNjA2wDbANjA28DZANvA3ADgwNbA2EDgwM/A1sDgwNhA2wDgAODA28DgwNsA28DgANvA2QDPwNZA1sDPwNCA1kDQgNkA1kDQgOAA2QDgANCA4MDQgM/A4MDwQLEAtoCvwLZAtoCvwLaAsEC2QLBAtoC0QLEAsECwQLaAsYC2gLOAsYCzgLaAsECwQLZAr8CxgLOAsECCAINAgcCCAIHAgQCCQIMAggCCAIMAg0CEwISAm0CWwJoAmsCWwJ7AmsCbQJfAmsCegJrAnsCegJtAmsCEwISAhACDwINAgwCDQIFAgcCaAJzAlsCWwJzAnsCWwJrAl8CXwJtAhICEQIQAgkCDAIJAg4CBwIDAgQCbQJ6Al8CEgIRAhACCwIRAgkCCwIOAgkCCAILAgkCDgIPAgwCDQIPAgUCCgIIAgQCAwIHAgUCBQIHAgYCYwJ3AmgCdwJzAmgCEgJfAnoCCgILAggCAwIKAgQCEgJfAhECbgKBAmMCYwKBAncCCgIOAgsCCgIPAg4CCgIFAg8CAwIFAgoCEQJfAoACegKAAl8CegIoAoACJgIoAnoCJgIcAigCKAIcAiACIAIcAiECHAImAhsCHAIbAiECdwJdAnMCHQIbAhQCKAJfAoACFAIbAhUCewJzAoMCegJ0AiYChAJuAmMCfgJgAnMCdgJuAoQCdwKBAmkChAJjAmgCcwJdAn4CaAKCAoQCfwJbAl8CfQJfAoACaQKBAmcCggJoAlsCfwKCAlsCgwJzAmACYAJ+AoMCYgJ7AoMCcQJ7Am8CegJ7AnECJgIcAiICGwIcAiICdgKBAm4CaQJdAncCgwJ+AmICewJiAm8CgAIlAmQCgAIoAiUCJgJ0AicCJgInAiICIAIlAigCHwIgAiECHgIfAiECIwIbAiICHQIjAhsCFQIbAiMCFQIjAhoCGAIdAhQCFgIXAhQCXQJgAn4CYAJiAn4CcQJvAmICcQJ6AmYCZAJ9AoACIwIeAiECIwIhAhsCJAIjAh0CGAIkAh0CFAIVAhgCegJxAnQCGgIjAhgCGAIVAhoCFwIUAhgCfwJfAn0CHwIlAiACZwKBAnYCcQJiAmYCOgInAnQCHwIiAiUCIgIfAh4CGAIjAiQCdAJxAjoCJQIiAicCIwIiAh4CJwJkAiUCdAJkAicCOgIxAi8COwI6AnECcQJmAjsCdAJkAjoCLwI2AjICeAKCAn8CeQJ9AnwCLwI0AjYCMgI2AisCNgItAisCfQJkAnQCLQI2AjQCZQJdAmkCeQJ/An0ChAKCAngCdgKEAmcCZQJnAoQCaQJyAl0CeQJ4An8CYgJgAnACYgJwAmwCYgJqAmYCOQJxAn0COQJ9AnQCOgI5AnQCLwI6AjcCaQJnAmUCZQJyAmkCdQKEAngCYgJsAlkCZgJiAmwCcQJ8An0CcQJmAlACNAIvAjcCdQJlAoQCbAJqAmYCZgJqAlACOwJxAlwCUAJcAnECNwI6AjkCNAI3AjMCMgI4Ai8CNQIyAisCKwIsAjICcQJcAnwCPAJcAlACPAI7AlwCPAI6AjsCOgI8AjkCLwI5AjoCLQI0AjMCLAI1AjICKwItAiwCLQIpAiwCKQIuAi0CKgItAi4CWQJYAmwCWAJqAmwCagJYAlICXAJxAjkCNwI5Ai8CNwIvAjgCMwI3AjgCOAIyAjUCKQItAjMCKgIpAi0CLgIpAioCcgJgAl0CbAJZAlYCUAJqAlECeAJ5Al4CcAJaAlkCbAJwAlkCOQI8AlwCOAI5AjcCdQJhAmUCdQJ4AmECeQJcAl4CeQJ8AlwCVwJSAlgCUAJRAk8CcgJwAmACeAJeAmECVwJYAlkCTwJRAk4CVQJTAlICVgJXAlkCUgJXAlUCUQJqAlICUwJVAlQCNQIzAjgCNQIwAjMCKQIzAjACTwJOAkkCTgJHAkkCKQIwAjUCKQI1AiwCVwJWAlUCcgJlAmECSAJJAkcCcAJyAmECSAJKAkkCYQJsAnACXgJsAmECUQJYAmoCUgJYAlECWAJSAlYCVgJSAlUCQgJDAj0CXAJsAl4CXAJqAmwCWAJWAlkCUgJYAlkCUQJqAlwCUAJRAlwCSwJOAlECVAJVAlICUwJUAlICRwJOAk0CRgJJAkoCSAJGAkoCQwI+Aj0CSwJRAlACUAJPAksCTgJLAk0CTwJMAk0CSQJEAk8CSQJEAkYCRwJGAkgCSAJFAkECQwJIAkECRQJIAkMCTQJLAk8CRAJMAk8CRwJNAkYCRQJGAkgCQgJBAkMCQwJBAj4CPQI+AkECQgI/AkACPQI/AkICTQJMAkQCTQJEAkYCQwJBAkUCQQJCAkACPQJBAkACQAI/Aj0CKxHTEEYR0xC1EEYRRhG1ELsQThFGEbsQyhClENMQ0xClEOAQtRDTEOAQuxC1ENoQtRDgENoQThG7ED8R2hDSELsQPxG7EKcQ0hCnELsQKBHKECsRyhDTECsRpxCtED8RpxDSEK0QrBClEMoQKxFGESwR2hA3EdIQNxEpEdIQThE/EbIQshA/EagQKREtEdIQqBA/Ea0QrRDSEC0RrRAtEbkQNBHVEMoQ0RDjECgR4xDKECgRyhA0ETkRyhA5EawQ0RAoESsRQBHgEKUQQBEvEeAQxBArESwRNxHaEOAQRhFOEdAQqBCtELkQNBHKEOMQNBFKETkRrBA5EaUQ0RArEcQQxBAsEb8QLBHFEL8QxRAsEUYR0BDFEEYRLxE3EeAQThGyENAQRxGyEKgQLRHdEMIQqBC5EEcRuRAtEcIQuRDCELAQpRA5EUARIRE3ES8RIREiETcRIhEpETcRshBCEagQQhGyEEcRuRCwEEcRsBDCEM8QzxCpELAQFxFKETQR4xAXETQRvxC3EMQQxBC3ENEQIREvEUARQhFHEbAQQhGwEKkQtBCpEM8QFxHjEOkQDRFKERcRtxDjENEQ0BCyENcQKRHdEC0RQhFHEagQwhDdEM8QqRCwEOIQtBDiEKkQBRELEUARQBELESERFhEpESIRshDcENcQKREWERsRGxHdECkRQhHiEDoRQhGpEOIQ4hCpENkQ4hC0ELwQvBDZEOIQphDjELcQShEFETkRQBE5EQURRxHcELIQvBC0EM8Q2RC8EKoQ2RCqEM0Q9hDdEBsRzxDCELQQqhC8ELEQzRCqEMEQqhCxEMEQwRCxEAERwRABEfMQDREXERoR4xCmEOkQNhE6EeIQzRDBEPMQDhEaERcR7xAXEekQShEPEQUR3RD2EMIQNhHZEDIR2RA2EeIQ9xDtEPMQ9xDzEAER7xAOERcRJRENERoR/xDvEOkQphDmEOkQShENES4RShEuEQ8RDxEZEQURBREZESYRrhDQENcQFhEiERMR1xCjEK4QExEbERYR9hAbEfkQwhD2EM8QNhE7EToRNhEyETsRMhHZEEMR/hDzEO0Q7RD3EP4Q7xD/EA4RDhElERoRJREgEQ0RtxDeEKYQCxEFESYRxRC9EL8QxRDQEL0QsxDQEK4QBBETESIRoxDXENwQSRHcEEcR9hD5EAMRMBFHEUIRzxD2EAMRAxEAEc8QQhE6ETsRzxDuELwQ7hDlELwQQxHZEM0QsRC8ENsQ5RDbELwQwRC6EM0QwRD8ELoQ/BDBEPMQ/BDzEP4Q5hCmEN4QtxDUEN4Q1BC3EL8QvRDJEL8QsxC9ENAQIhEhEQwRIhEMEQQRSRGjENwQExH5EBsRRxEwEUkRQhEzETARQhE7ETMR7hDPEAARQxE7ETIRSBFDEc0QARGxENsQARHbEMcQ/hD3EPQQ9xABEfQQChEOEf8Q6RDmEP8QLhENESARDxEuERkRCxEmER8R1BC/EMkQCxEfESERHxEMESEROxFDETMR5RDuEOgQSBFNEUMRTRFIEc0QTRHNELoQuhD8EE0RARHHEOEQ4RD0EAERChElEQ4RIBE1ES4R3hDUEOYQExEREfkQAxHuEAAR9RDxEOUQ2xDlEPEQ2xDxEMcQChEYESUR+xAKEf8Q5RDoEPUQCRFNEfwQNREgESURHxEmEQwR9RDoEPEQCRH8EBAREBH8EP4Q/hD0EPIQ/xDmEOsQRBFJETARJREqETURwxDrEOYQAhGzEK4QMBEzEUQRSBEUEUMRvhAQEf4Q8hD0EOEQ+xD/EKQQuBC9ELMQExEEEUERFRGjEEkRFRFJEUQROxFDEQYRxxDxEN8QxxDsEOEQChH7EKQQJREYESoRpBD/EOsQLhE1ER0RLhEjERkRyxDmEN4Q1BDwEN4Q1BDJEMYQDBEmETERxhDJEL0QBBEMETERBBExET4RrhCjEBURERFMEa8Q+RAREa8Q+RCvEAMRCBEzETsRBhFDERQRFBFIERIREhFIEU0RxxDfEOwQ/hDyEL4QChGkED0RKhEYEQoR8BDLEN4QJhEZESMRJhEjEScRxhC9ELgQBBE+EUERERETEUwRMxEVEUQRHhEVETMRCBEeETMR7hADEcAQ7hDAEOgQBhEIETsR9RDoEM4Q8RD1EN8QEhFNEQkREBG+EAkRKhEKET0RKhEcETURpBDrEMMQJhEnETERAhG4ELMQ+BACEa4QExFBEUURTBETEUUR+hCuEBURAxGvEMAQ6BDAEM4Q9RDOEN8QPBESEQkRvhA8EQkRHBEdETURwxDmEMsQ8BDUEOoQ+hD4EK4QBxEVER4R7BDyEOEQpBAqET0R5BCkEMMQLhEdESMRxhDqENQQ3xDOENgQ/RC4EAIRJBEHER4RvhBLETwRKhGkENAAPhExETgRrxBMEUURthDAEK8QHREcESMRPhE4EUERzhDAEMgQthDIEMAQHBEqEZQAMREnESMR6hDGELgQ/RDqELgQBhEUERIRIxEdEY0AzwDDEMsQngDwEOoQQRE4EXQABxEkERURpwDyEOwQvhDyEMkAwQC+EMkApBDkEMgA8BDPAMsQIxGKACcRMRF0ADgRtADqEP0QAhG0AP0QQRFvAEUR+hC/APgQrxBFEcMAuAD6EBURiwAVESQRHhGLACQRdwAUERIRdwASETwR7BDfEKcAxwA8Eb4QHRGUAI0AQRF0AG8AAhGvALQAvwACEfgQuAC/APoQrxDDAMIAthCvEMIAwBC2EMIAjgAeEQgRzhDAEM0AhwAIEQYRdwCHAAYRzhDNAKQAdwAGERQR2BDOEKQAmwDfEKQA2BCkAN8QPBFyAHcA8hCnAKEAKhHQAGYAxQDQAKQQwxDIAOQQHREcEZQAngDPAPAQqwCeAOoQqwDqELQAdAAxEWUAvwCvAAIRwwBFEWsAlgC4ABURiwCWABURjgCLAB4RwBDCAM0AhwCOAAgRpgCkAM0A3xCbAKcAxwByADwRwQDHAL4Q8hChAMkAyADFAKQQKhFmAJQAyADDEM8AIxGNAIoAJxGKAGcAMREnEWcAqQCrALQARRFvAGsAlgCgALgAsgDCAMMAwgCyALAAzQDCALAAzQCwAKYAgQCOAIcAmwCkAKYAyQChAKcAMRFnAGUAoAC/ALgAwwC3ALIArgCHAHcAsQCuAHcAsQB3AHIAxwCxAHIAmwDMAKcAywDPAJ4AwwBrALcAhwC+AIEAvgCHAK4ArgCxAL4AcABmANAAlABmAHAAgQC+ALkAzADJAKcAegC3AGsAjgC5AKMAuQCOAIEAbwB0AGsAjgCjAIsAqgCmALAAwADFAMgAxADLAJ4AbwB8AGsAegBrAHwAvwCgAJwApgCqALkAvgCmALkAvgCkAKYApAC+AK4ApACuALEAsQCbAKQAzACbALEAxwDMALEAyQDHAMEAjQCUAIAAcwBlAGcAvQCrALQAbAB0AGUAlwBvAHQAnACvAL8AlgCLAKAAowCWAIsAsACyALcAmgCWAKMAuQCaAKMAqgCwAKMAuQCqAKMAyQDMAMcAjQB/AIoAZwCKAHYAeQCXAHQAbwCXAHwAegB8ALcAmgCyALcAowCyAJoAsACyAKMA0ADFAMAAywDGAM8AcwBnAHYAtQCeAKsAqwC9ALUAnwC2ALQAkwB8AJcArwCcALwAfACTAJAArQC8AJwAoACtAJwArQCgAJYAiQB8AJAAtwB8AIkAuwC3AIkAmgCzAJYAmgC3ALsAgACUAHAAzwDAAMgAfwCNAIAAxADGAMsAigB/AHYAxgDEAJ4AtQDGAJ4AcwBsAGUAeQB0AGwAtgC9ALQAtAC6AJ8AugC0AK8AvAC6AK8AlgCzAK0AmgB9ALMAmgC7AH0AxgDAAM8AvACtAHgAswB4AK0AfQCJAJAAfQB4ALMAiQB9ALsAcADQAKwAxADAAMYAeQBsAH4AnwC9ALYAeACQAJMAfQCQAHgAxADGALUAcwCEAGwAfgBsAIQAvQCfAJkAugCZAJ8AkwCFAHgAdgCEAHMAhQCTAIIAkwCXAIIAeACFALwAdgBpAIQAtQC9AKUAvQCZAKUAugCiAJkAhQCCALoAvACFALoAfgCEAHkAeQCCAJcAggCPALoAbQB2AH8AdgBtAGkApQDEALUAggB5AIgAjwCCAIgAugCPAKIA0ADAAKgAgABqAH8AxgDEAJ0AeQCEAG4AfgB5AG4AeQB+AGQAiAB5AGQAjwCIAKIAcACGAIAAbQB/AGoAxAClAJ0AhABpAHsApQCZAM4AogDKAJkAogCIAMoAiABkAI8AagCAAHEAagCGAG0AaQBtAHUAdQB7AGkAzgCYAKUAhAB7AG4AygDOAJkAfgBuAGQAiABkAMoAgwBwAKwAcQCAAIYAhgBqAHEAdQBtAIYAmACdAKUAZABuAGgAZABoAM4AygBkAM4ArADQAKgAhgBwAIMAqADAAMYAqADGAJ0AmACdAM4AaABuAHsAaACMAM4AzgCMAJgAlQCDAKwAmACMAJ0AaAB7AJEAaACMAJEAqACVAKwAkgCDAJUAhgCDAJIAkQB7AHUAkgCVAKgAjACRAJ0AdQCGAJIAkQB1AJIAqACdAJIAnQCRAJIAhhF2EXwRchF/EXYRfxF8EXYReBF2EYYRahFyEXYReRFyEWEReRF/EXIRaBFyEWoRfBGHEYYRbxF2EXgRbxFqEXYReBGGEXoRehGGEYERYRFxEXkRfxFxEVwRYRFyEYQRcRF/EXkRYRFyEXcRaBF3EXIRfxFWEXwRaBFqEXQRfBFWEYcRWRGLEYcRexFqEW8RhhGHEYsRexFvEXgRehF7EXgRYxGBEYYRhhFiEWMRehGBEWMRVhF/EXERdBF3EWgRhxFWEVkRixFZEVsRhhGLEVsRYhGGEVsRbhF7EXoRehFjEW4RZBFxEWERgBFhEXcRdBFqEXsRZBFsEXERVBFWEXERgBFkEWERYhFbEWMRgxFkEYARVBFxEWwRVBFsEVoRVBFaEVgRVBFYEVYRVhFTEVkRhRF0EXsRfRGFEXsRTxFbEVkRbhFjEV8RbBFkEWcRgBF3EXURWRFTEVIRfhF7EW4RXhFsEWcRgxFzEWQRbBFeEVoRWRFSEU8RaxFbEU8RaxFjEVsRfhFuEV8RgxGAEXMRcxGAEXURVhFYEVMRghF1EXcRexF+EX0RZhFjEWsRXxFjEWYRcxFnEWQRghF3EXQRhRGCEXQRZhFrEU8RWBFaEWARURFnEXMRfhGIEX0RWBFgEW0RdRGCEY0RUxFYEW0RiRGFEX0RVRFeEWcRjRFzEXURjRGCEYwRjBGCEYURUhFTEW0RihGMEYURiRGKEYURjhFREXMRUhFtEXARTxFSEWURiBGJEX0RaRFPEWURXxFXEX4RVRFaEV4RXRFaEVURjhFzEY0RWhFdEWARUhFwEWURZhFPEVARUBFPEWkRVxFfEVARUBFfEWYRVRFnEVERVxGIEX4RAwACAIwRAwCMEYoRcBFtETMABQCKEYkRcBE8AGURBwCJEYgRXRFVES8APABwETMAVxEHAIgRYBFdES8AAgCNEYwRBQCJEQcASQBVEVERjRESAI4RYBEvADUAbRFgETUAaRFHAFARVxFQEVgAVQAvAFURMwBtETUAaRFlETkAaRE5AEcAVwBVEUkASQCOERIAURGOEUkAVwBVAFURAgASAI0ROQBlETwABwBXEVgAWABQEUcAAwCKEQUASQBLAFERVwBJAFUAVQBJAEsASwBJABIAVQBLAFkANQAvACsAWQBGAFUALwBVACsACgASAAIAMwA1ACsAWABHAEwAVQBGACsAFAARAAUAMgA5ADwARwA5AC0AFAAHAFgAEgAJAEsAMwArACkADAACAAMAPAAzACkABQAHABQACgAJABIAEQADAAUATABHAFMADAAKAAIAEQAMAAMAPAApADIAUwBHAC0AFABYAEwAWQBLAAkARgA3ACsAOQAyAC0AUAA3AEYAKwA3AFAAGQAUAEwAQABZAAkAUwAtADAATABTADAAJwBQAEYAQAAJAAoAFwAKAAwAKQArAFIAEQAUABkALQAyAFsAQAA2AFkACgAXAEAAKwBQACcATgArACcAFgAMABEAIgARABkAGQBMADsAOwBMADAAFwA2AEAAUgArAE4AKQBSAFYAMgApAFYANgBGAFkAGwAWABEAFwAMABYAGwARACIANgAnAEYAQwAyAFYALQA/ADAAMgBDAFsAPwAtAFsAKgA7ADAAFgAXACUAPQAnADYAPQBOACcANAAwAD8ATgBIAFIAPQA2AC4AHwAWABsAHwAbACIAKgAwADQAFwAuADYAOABOAD0ASABOADgAKgAiADsAJQAuABcAWwBDAD8ADgBbAD8AJQAWAB8ANAAwABgACwBSAEgAVgBSAEMAGQAoACIAKAAZADsAJQAfAB4AQwBWAD8AJQAxAC4AQwBSAAsAVgBDAAsAVgALAD8AIQAqADQAPgAfACIAOwAiACgAIgAqACEAHAA4AD0AFQBIADgAKgA7ACEAIQA0ABgAFQA4ABwAOgAlAB4AKAA+ACIAJQAsADEAHAA9AC4ACwBIABUAGAA0AD8AJAAxACwAPgAeAB8AOgAeAD4AGAA/AA4AKAAiACEALgAxACQALgAkABwALAAlADoADgA/AAsAKABPAD4AKABPACIAAAAcACQAIAAVABwAIwAYAA4ADgALACYAFQAgAAsAJgALACAATwAoAEoALAAPACQAPgBPADoASgAoACEAIAAcAAAAGAAjAAQADwAAACQAQgAsAEUAUQA6AE8ADgAmACMASgAhAAYADwAsAEIAIQAYABMAEwAYAAQARQAsAFEALAA6AFEAWgBCAEUABgAhABMAUQBaAEUAAQAPAEIADQAAAA8AWgBNAEIAIAAAAA0AIAAaACYADwABAA0AAQBCAE0ARABRAE8AIwAmAB0ASgBEAE8AVABKAAYAUQBBAFoAEwAEACMAGgAgAA0ARABBAFEAHQAmABoARABKAFQAHQATACMAEAAaAA0AWgABAE0AAQAIAA0AQQBEAFQACAABAFoAVABaAEEAEAANAAgAWgBiAAgAYQAaABAAVABcAFoAYwBUAAYAEAAIAGIAXABiAFoAGgBeAB0AEwAdAF4AYgBhABAAYQBfABoAVABdAFwAGgBfAF4AYAATAF4AVABjAF0AXgBfAGEABgBgAGMABgATAGAAXQBiAFwAXQBjAGIAXgBhAGAAYABiAGMAYgBgAGEAoRCGEIUQoRCFEJ8QhRCGEIcQhxCIEIUQjhCIEIcQoRDaANgA2gCfEIUQjhCHEPEA2gChEJ8QiBDuAAwBhRCIEAwBEgGGENgAhhASAQYBhxCGEA4BhxAOAfEA2gDVANgAjhDxAO4AiBCOEO4ABgEOAYYQ2ADVANcA2gCFEAcBBwGFEAwBDgEGARIBCQEOARIB2ADXANIA3QDXANUA8QAOAQgBDAEFAQcBEgHYAAsB1QDcAN0A+QAMAe4ACwHYANIACAEOAQkB1ADcANUA1ADVANoADAH5AAUBDwHaAAcBCQESAQsB0gDXAN0A8QD9APkA7gDxAPkA1ADaAA8BBwEFAQ8BCAEJAQsB1ADdANwA1ADSAN0A/QAFAfkA5QDSANQABQH/AA8B/QD7AAUBCwHSAO8A7wAIAQsB5QDoANIA+wD/AAUB7ADlANQA7ADUAA8B7wDSAOgACAHvAPsADwH/AOwA6ADlAOwA7ADvAOgA/wD7AO8A7AD/AO8A5xD0EP4Q/hD8EOcQ9BDnEOEQqxD8EP4Q7BDhEOcQ4RDWEPQQvhD+EPQQ7BDnEMwQqxDnEPwQzBDnEKsQqxD+EL4Q4RDyENYQvhD0ENYQ8hDsEMwQxwDMEKsQyQDMEMwA8hDMEMkAwQCrEL4QwQDHAKsQ1hDyEMkAwQC+ENYQyQDBANYQzADMEMcAoAzQDNUMoAzVDJwMrQzEDMYMrQzGDLcMxgzNDNAMxgzSDM0MxgzYDNIMxgzEDNgMNwW4DDEFNwWrDLgMoAzGDNAMtwzGDKAMrwygDJwMuAycDKgMqwycDLgMpgyqDNoMqgzADNoM2gy5DJkMqgzLDMAMuQzADMsMwAy5DNoMpAyqDKYM2gykDKYMpAyyDKoM2QyyDKQM2QzFDLIMyAy2DLIMxQzIDLIMhwx5DJYMhwyCDI8Mlgw6BYcMLAUvBToF0gyhDJ0M2AyhDNIMmQzLDM4MmQy5DMsM0AzNDMgM1QzQDMgMyAy6DLYMzQy6DMgMzQydDLoM0gydDM0M2QykDNoM2QzIDMUM2QzVDMgMogzZDNoMqAzZDKIMqAycDNkMnAzVDNkMsgymDKoMdQxCBWcMawx1DGIMzgymDMEMPwVGBT0FPwU9BUIFZwxCBT0FdQxnDGIMsgy0DKYMsgyuDLQMsgy2DK4Mpgy0DLsMzgyqDKYMywyqDM4MQwVzDEYFHQUfBUMFHQVDBUEFQQVDBUYFQwUlBR0FPAUlBUMFYgxnDF0MYgxUDGoMJQUfBR0FPwVBBUYFOwU8BUMFOwVDBUEFPwU7BUEFZgxGBWwMPQVmDGcMRgVmDD0FMgUgBRsFMgUbBSMFwQyxDM4MWwxMDFcMVQxQDFEMTAxQDFcMVQxXDFAMiwxQDEwMiwyEDFAMhAxRDFAMjgyBDIkMjgx8DIEMfAxPDIEMVAxVDFEMUwxbDFcMiQyEDH4MVAxRDE8MXgxODFwMXAxODEwMWwxcDEwMUwxWDFsMVgxcDFsMTQzTDJoMXgzgDNMMTQyaDE4MmgyXDE4MlwyaDJ8MKwUYBR8FKwU4BRgFLQUrBR8FLQUfBSUFXgzTDE0MfgyLDJEMTAxODJcMTAyXDJEMiwxMDJEMgQxPDFEMgQxRDIQMgQyEDIkMfgyEDIsMTgxeDE0M0wyfDJoM3wzgDF4MXQxVDFQMcwzDDFYMWAxcDFYMXgziDOAMWAzhDOIMWAziDF4Mwwy/DOEMwwzhDFgMWAxeDFwMVgzDDFgMcgzDDHMMwwwdBR8FcgwdBcMMQwUdBXIMegyTDI4MjAx8DJMMjAyTDHoMYgxqDHwMYAx8DIwMYAxiDHwMYgxdDFoMYgxaDFQMbAxTDF8MZgxsDF8MXQxmDF8MZwxmDF0MXwxXDFUMcwxWDFMMcwxTDGwMcgxzDGwMQwVyDHMMQwVzDGwMRgVzDGwMegyODHcMXwxTDFcMXQxfDFUMWgxdDFQMewx+DJEMigx2DLwMpQyKDLwMjQyKDKUMjQx7DHYMfAxUDE8Mfgx7DI0MmgyfDLUMmgy1DLwMdgyaDLwMdgyXDJoMewyRDJcMewyXDHYMlAyJDH4MdwyJDJQMjgyJDHcMigyNDHYMlAx+DI0MMgUjBSgFkwx8DI4M2wyhDNgMvgylDNsMfwxxDHQMbgxxDH8MgwxuDH8MeQxuDIMMkgx5DH8MeQyDDH8Mlgx5DJIMbgx0DHEMbgx9DHEMbgyYDH0MaAyYDG4MkAyYDGgMZQyQDGgMmAyUDH0MjAyQDGUMjAxlDJUMaAyVDGUMYAyMDJUMiAxgDJUMdQxgDJUMcAxCBXUMggyHDHAMggyVDI8MdQyCDHAMcAxpDGEMcAxhDHUMcAyHDGEMlgySDDoFdQxrDGAMdQyVDIIMngw6BZIMmwwsBZ4MmwwvBSwFngwsBToFjwyVDGgMeQyPDG4MjwxoDG4MhwyPDHkMOgUsBSUFPAUlBTsFJQUsBSYFJQU8BSwFOgUlBTwFcAw/BUIFYQw7BT8FYQw/BXAMPAU7BWkMYQxpDDsFPAVpDJYMOgU8BZYMYQyHDJYMYQyWDGkMPAUmBSUFPAUtBSYFJQUtBTwFGQUzBTYFGgUZBTYFGgU2BTgFHAUaBTgFHAU3BRoFLwUpBSYFLAUvBSYFJgUrBS0FJQUmBS0FIgUrBSYFJgUpBSIFOQUgBTIFGQU5BTIFGQUyBTMFMQUZBRoFMQUaBTcFMwUyBSgFMwUoBSEFOAU2BTMFNgU4BSsFIgU4BSsFOAUzBTAFlAyKDIUMlAyNDIoMgAyUDIUMdAyADIUMdAxxDIAMcQyUDIAMfQyUDHEMlAx6DHcMmAx3DJQMmAyQDHcMkAyMDHoMkAx6DHcM2wylDKEMvgyFDKUMigylDIUMdAyFDL4MMQU0BRkFHgUcBTgFNQUcBR4FKQUeBSIFHgU4BSIFKQU1BR4FNQU3BRwFmwytDKkMqQytDLcMxAzbDNgMKQWbDKkMLwWbDCkFqQy3DKAMrwypDKAMqwyvDJwMNQWrDDcFNQWvDKsMqQyvDDUFKQWpDDUF4gzdDOAMpgy7DMEMtgynDK4M3QzPDOAM1wzHDMwMtAyuDMwMyQzCDN0M0wzgDM8MzwzdDKMMzwyjDJ8M0wzPDJ8MowyuDKwMrgy9DMwM3AzMDL0MtAzHDLsMtAzMDMcMsQzBDLsMsQy7DMcMkgywDJ4MngywDK0MngytDJsMkgx/DLAMKAUjBSEFJAUuBScFMwUhBSoFKgUhBScFLgUqBScFIQUjBdcMHQUYBR8FMAUuBSQFGAUwBSQFGAU4BTAFMwUqBS4FMwUuBTAF0QzCDNQMJAUnBdEMJAXRDNQMJAXUDMkMGAUkBckMnQy1DLMMoQy1DJ0MpQy8DLUMpQy1DKEMwgy9DK4MrgyjDN0MwgyuDN0M0Qy9DMIMyQzUDMIMowysDLMMtQyfDLMMowyzDJ8M4Qy/DOIMpwyzDK4MswysDK4MugynDLYMnQyzDKcMugydDKcM0QzcDL0MIQXcDNEMIQXXDNwMJwUhBdEMvwzUDMkMyQzdDOIMvwzJDOIMGAXJDB8FwwzJDL8MHwXJDMMM3AzXDMwMvgzEDK0MsAy+DK0MvgzbDMQMsAx0DL4Mfwx0DLAMogzaDNYM2gymDNYM2gyZDKYMmQzODKYMygzXDBsFygzeDNwMqAzeDMoM3gyoDNYMqAyiDNYMGwXXDCMFygzcDNcM3AzeDMcM3AzHDNcM3gzWDMcMpgzODNYM1gzODLEMNAUXBRsFNAUxBRcFGQUyBSAFNAUyBRkFNAUbBTIFGQUgBTkFxwzWDLEMOQUZBTQFMQXKDBcFMQW4DMoMFwXKDBsFuAyoDMoMJAMYAxYDIAMkAxYDFgMYAzoDFgM6AzIDOgMeAyoDGAMeAzoDNQMyAzADOgMoAzADOgMwAzIDHgMhAykDHgMpAyoD8A/uDxoD8A8aAxUDGgMiAyEDFQMaAyEDPAMoAzQDMAMoAzwDMQMzAykDMQMsAysDMQMrAycDMQMnAzMDJwMvAz0DJwM9AzMDIQMiAzEDIQMxAykDPQMpAzMDIgMmAzEDJgMsAzEDYwNpA3UDYwN2A2kDaQNnA3EDZwNgA24DYwNtA2wDNgMjAysDKwMsAzYDHwMXAyMDHwMjAxsDNgMsAxsDLAMfAxsDNgMbAyMDNwMqAz0DKAMuAzQDKAM6AzcDNwM6AyoDKAM3Ay4DKQM9AyoDNwM9Ay8DNwMvAy4DSQNDA0oDSQNHA0MDPwNHA0kDQwNAA0gDTANAA0MDRwNMA0MDRwNNA0wDPwNNA0cDQwNFA0oDUQNTA1sDUgNbA1MDXwNWA1MDUwNWA00DWwNTA00DWwNNAz8DUANdA1wDVgNcA0ADVgNAA0wDTQNWA0wDQANcA0YDUANcA1YDOAMtAzwDOAM1Ay0DXgNEA0YDXANeA0YDXANdA14DSwM1AzgDVwNeA10DRQM+A0EDRQNIA04DQwNIA0UDPgNOA0sDSwNEAzUDQQNLAzgDRANLA04DRANOA0ADSANAA04DPgNLA0EDRQNOAz4DWANQA18DVANYA18DWANaA1ADWAPhD1oDVANfA1MDUQNUA1MD4A/fD/MP3w/bD1UD3w9VA+APVAPhD1gD3A/hD1QDVwMdA14DXwNQA1YD3w/5D/oPUANaA1UD4A9VA1oD4Q/gD1oD8w/xD/kP3w/zD/kP3w/6D9sP+g/5Dx0DVwP6Dx0D+g9XA9sPVQNXA10DUANVA10DVQPbD1cD6g/wD/QP6g/rD/AP5A/qD/QP5g/rD+oP5A/mD+oP7w/0D/cP7w/oD/QP7w/3D/kP6Q/4D/IP4g/jD+kP4w/4D+kP4g/pD+cP6w/nD+4P6w/uD/AP6Q/uD+cPHQP5DyAD5g/nD+sP5g/iD+cPRgNEA0ADBBADEOIPBRDiD+YP6A/kD/QP9Q/lD/gP4w/1D/gP4w/8D/UP4w8DEPwP4g8DEOMP7w/oD+wPAhDkD+gP8w/sD/EPBRDmD+QP8Q/vD/kP8Q/sD+8PcwOCA2ADcwN+A4IDdgN+A3MDfQOJA34DbAN5A30DbAN9A3YDbAODA3kDZwNzA2ADZwN2A3MDaQN2A2cDdgN9A34DhwN8A3oDiAOCA38DggN8A38DggN6A3wDhgOCA4gDAwN/A/wCaAMDAw4DiAN/AwMDiAMDA2gDawNoAw4DaAMOAwoDaAMKAwIDgwN7A3gDcgNoAwIDYQNbAz8DYQM/A4MDfwP7AvwChQN3A4kDfgN6A4IDfQOFA4kDhQODA3gDfQODA4UDeQODA30DYANrA2gDhgOIA2gDhgNoA2sDcgNrA2gDYAOGA2sDggOGA2ADdANgA2sDiQOHA3oDdwOHA4kDhQN4A3cDfgOJA3oDcgMCAwwDBAMMAw8DcgMMAwQD1g8PAwEQZgMPA9YPagNmA9YPDwNyAwQDdAMPA2YDdANyAw8DdANrA3IDagNuA3QDYgNuA2oDbANtA2EDYwN1A20DagPWD2IDagPVD9YPYgPWD9UPagPVD2IDagN0A2YDbgNgA3QDZwNuA2IDZwNiA3EDaQNxA3UD1g/fD+AP1Q/WD+AP1w/gD+EP1w/VD+AP1g8BEAAQYwNsA3YDYgPVD9cP1g/zD98P1g8AEPMPABABEPMPbQNUA1EDbQN1A1QDdQPcD1gDdQNYA1QDcQNiA9cPcQPXD9gPdQNxA9gPVANYA9wP1w/WD9UP4Q/YD9cP4Q/cD9gPdQPYD9wPbQNRA1sDbQNbA2EDDgMDAwADAAP8AggDAwP8AgADCgMAAwgDDgMAAwoDAgMKAwgD/QL2AvMC/AL3AvUC/AL1Av0C/AL9AvMC8wILAw0D/ALzAggDCAPzAg0D+w8HA/wPAQMHA/sP/g8BA/sP/Q8BA/4PBwMQAwYDBwMGA/wPAQMSAwcDAQMLAxIDEAP4AvoCEAP6AvQC+AIvAzsD/gIvA/gC/gL/Ai8D+AI7A/oC9gL+AvgC+gIJA/QC9QIuA/8CNAMuA/UC9gL/Av4C9QL+Av8C/QL/AvYC/QL1Av8C9wI0A/UC9wI8AzQD+QI4AzwD+QI8A/cCBwMSAxAD9gL4AhIDEgP4AhADCwP2AhID8wL2AgsDLgMvA/8CfAOEA38DhwOEA3wDSQNKA3cDhwNKA0UDdwNKA4cDgQOEAz4DhANFAz4DhwNFA4QDfwP3AvwCfwP5AvcChAOBA/kChAP5An8DewM/A0kDeANJA3cDewNJA3gDPgNBA4EDgwM/A3sDAQMNAwsDBQMNAwEDBQMBAxED/Q8FAwED/w8FA/0P/w8RAwUDDAMRA/8PARAMA/8P/Q8FEAYQBhAFEOQPBhDkDwIQ/w8GEAIQ/w/9DwYQ/Q/+DwUQ+w/8DwMQ+w8DEAQQ+w8EEAUQBRAEEOIP/g/7DwUQBQMIAw0DEQMIAwUDAgMIAxEDDAMRAwUDDAMCAxEDDwMMAwEQgQM4A/kCgQNBAzgD7w8CEOgP/w8CEO8PARDvD+wP8w8BEOwP/w/vDwEQJAP3DxMDNQMwAy0D9w8kA/kP+Q8kAyADEwMhAx4DFQMhAxMD7g/pD+0P9w/0DxMDJAMeAxgDEwMeAyQDEwPwDxUD9A/wDxMDFwMrAyMDOQMXA/oCOwMrAzkDOwM5A/oCOwMnAysDLwMnAzsDOQMrAxcDHQMUA14DLQMwAzwDCQP6AhcDRANeAzUDNQNeAxQDFAMyAzUDFAMWAzIDFAMgAxYDHQMgAxQDHAP0AhcDFwP0AgkDOQMcAxcDGQMQAxwD8g/tD+kPGgMlAyID7g/2DyUD7g8lAxoDIgMcAyYDLAMcAzkDJgMcAywDHwM5AxcDLAM5Ax8DIgMlAxkDGQMcAyIDEAP0AhwDJQMGAwcD9Q/8DwYDBwMQAxkD7Q/jD/UP7Q/pD+MP7Q/1D/YP7Q/2D+4PJQP1DwYD9g/1DyUDJQMHAxkDswaUBpsGswbfCsYKswbfCpQG3wrGCuYKHgvmCgAL3wrmCh4LmQbZBr4GmQZtBtkGEgvuCtkGbQYSC9kGEgs/C+4K7go/C9AKsga7BpsGsgabBpQGsgaUBpkGmQaUBj4LlAZECz4LlAbfCkQLPgsSC20GmQY+C20GRAsSCz4LHgv3ChcLFwv3CgEL3woeC0QLHgsUC/cKHgsACxQLEgs+Cz8LPgseCz8LRAseCz4LHgsXCz8LAQs/CxcLGAvvCtoGGAvaBnAGGAumBioLpganBioLGAtwBqYG2gamBnAG2ga6BqYGGAsqCyQLGAskCzwLGAs8C80K7woYC80K+AofC80KJAsqCw0LJAsNCzwLPAsNCw4LPAsOC80KzQoOCx8LDgvkCh8L2gbdBrMG2gazBroG7wrlCtoG2gblCt0GugbaBpMGugazBpMGkwazBpsG7wrNCuUKzQrICuUKzQoAC8gKzQr4CgAL5QoAC98KyAoAC+UK+AoUCwAL+AofCxQL3woAC+YKpgbFBqcGpga+BsUGpwbECioLpwbFBsQKpgbIBr4GyAasBr4GyAayBqwGyAaTBrIGxQa+BsQKxAq+Bu4KxAruCuwKvgbZBu4KrAayBr4GvgayBpkGKgvECg0LDQvECuoKDQvqCg4L6grwCg4LDgvwCggLDgsIC+QK5AoICwEL5AoBCx8LxArsCuoK7ArQCuoK6grQCvAK7AruCtAK8Ao/CxcL0Ao/C/AKkwa7BrIGkwabBrsGPwvQCr4KvgrQCr8KvwrnBr4KvwrmBucG5gbkBucG5wbkBugGPwu+CucGPwueBpEGPwvnBp4G4Ao/C9UKPwtDC9UK4Ar3CtUKPwuRBkML1QpDC/cKQwuRBmcG5wboBm0GngbnBpEG5wZtBpEGkQZtBmgGywboBm0GaAZtBtMGbQbLBtMGkQZoBpUG0wa7BmgGaAa7BpUG9wpDCx0LQwtnBh0LZwaRBn8GkQaVBq0GkQatBn8GwgbmBtAKwgblBuYG0ArmBr8KwwrCBtAK0Ao/C+AKMQvQCuAK8QrrCsMK8QrDCtAK6wrCBsMK6wrgBsIGCAvQCjELCAsxC+AK8QrQCggLCAvgCgEL5QbkBuYGwgbiBuUG5QbiBuQG4gbZBuQG5AbZBugG2QZtBugGgQZtBtkGgQbLBm0GxAbiBsIG4AbEBsIGxAa9BuIG4ga9BtkGvQaBBtkGrAbLBoEGvQasBoEGrAayBssGAQvgCtUKAQvVCvcK8QrgBusKdAbgBvEKdAbxCg4L+ArxChYL+AoOC/EKdAYOC/gKdAb4CtIGiAbEBuAGiAamBsQGpga9BsQGvQayBqwGugayBr0Gpga6Br0GugaaBrIGdAaIBuAGdAamBogGdAa6BqYG0ga6BnQGFgsBC/gK+AoWCx0L+AodCwAL0gb4CswG+AoAC8wGAAsdC8wGzAYdC2cGmga7BrIGmgaVBrsGZwatBpUGZwZ/Bq0GugbMBrMG0gbMBroGugaVBpoGugazBpUGswbMBpUG" }, { "p": "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", "n": "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", "j": "Li4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0sAAIBLCwsLCwAAgEsAAIBLAACASwsLCwsLCwsLAACASwAAgEsLCwsLCwsLCwAAgEsAAIBLAACASwsLCwsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAAAsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEqKxwdKxwdHiocHR4qKxwdKhwdHiocHR4pHCodKBwdHigcHR4nJhwdJyYcHSYnHB0nJhwdJygcHScmHB0mHB0eJiccHSYcHR4mHCcdJRwdHiUcHR4kIxwdJCUcHSMcHR4jJBwdIhwdHiIcHR4hHB0eISIcHSAhHB0fHB0eHxwdHh8cHR4eHxwdHhwdHxwdHh8cJh0eHB0eHxwdHh8cHR4fHB0eHxwdHh8cHR4fHCAdHhwmHR4cHh0fHB0eHxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgXAAIBFwACARcXFxcXAAIBFwACARcAAgEXFxcXFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACAQYGBgYGBgYGBgYGBgYGBgYGBgYGBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIAAwQCAAMEAgADAgEAAwIBAAMEAgADAgEAAwIBAAICAgICAgICAgABAwIAAQMCAgICAgEAAwIBAAMCAQADAgABAwIBAAMCAQADAgEAAwICAgICAgICAgEAAwIBAAMCAAEDAgABAwIAAQMCAQADAgEAAwIBAAMCAgICAgABAwIBAAMCAQADAgABAwIBAAMCAgICAgMBAAICAgICAgICAgICAgICAgICAwEAAgICAgECAAMBAAIDAQIAAwECAAMBAgADAQACAwECAAMBAAIDAQIAAwEAAgMBAgADAQIAAwEAAgMBAgADAQACAwECAAMBAAIDAQACAwECAAMBAAIDAQIAAwECAAMBAAIDAQIAAwEAAgMBAgADAQIAAwEAAgMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsAgEALAIBAAEAAAAsAgEAAQIDAAECAwAsAAAAAQAAABcCAQAAAAAALAIBACwAAAAXAgEALBcAAAECAwAsAgEALAIBAAECAwAsAAAALAIBABcCAQAXAgEAFwIBAAEAAAAsAgEALAAAAAECAwAXAgEAAQIDACwAAAAXAgEAAQIDAAECAwAsAgEALAIBACwCAQABAgMAFwIBAAECAwAXAgEAAQIDAAECAwAXAgEALAIBABcCAQABAgMAFwIBAAECAwABAgMAFwIBABcAAAABAgMAFwIBABcCAQAXAAAAFwAAAAECAwAsAgEAFwAAABcCAQAXAAAALAIBABcCAQAXAAAAFwAAAAECAwAXAgEAFwAAACwCAQABAgMAFwIBABcAAAAXAgEALAIBABcAAAAXAgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAIDAQIAAwECAAMBAAIDAQIAAwECAAMBAgADAQACAwECAAMBAAIDAQIAAwECAAMBAgADAQIAAwEAAgMBAgADAQACAwECAAMBAAIDAQIAAwEAAgMBAgADAQIAAwECAAMCAgICAgICAgICAgICAgICAgICAgICAgICAwEAAgMBAAIBAAMCAQADAgABAwIBAAMCAAEDAgABAwIBAAMCAgICAgMBAAIBAAMCAQADAgEAAwIBAAMCAAEDAgEAAwICAgICAAEDAgICAgIBAAMCAQADAgEAAwIBAAMCAAEDAgEAAwICAgICAAEDAgEAAwICAgICAgICAgICAgMCAQADAgEAAwIBAAMEAgADBAIAAwIBAAMCAQADBAIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQDAgAEAwIABAMCAAQAAAAFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgcJCAoHCAkKBwsICQcICQoHCAkKBxEICQcICQoHCAkKBxEICQcICQoHCAkKBwgJCgkHCAoJCgcICgcICQoHCAkKBwgJCwwHCAwHCAkMDQcIDQcICQ0HCAkODwcIDgcICQ8QBwgPDgcIEAcICRAHCAkRBwgJEQcICREHEggRBxIIEhMHCBIRBwgSEQcIEhEHCBIRBwgREgcIEwcICRMHCAkUBxUIFQcICRUWBwgVBwgJFQcICRYHCAkWFQcIFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwAAABcAAgEXAAIBFwAAABcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXAAIBFwACARcAAgEXFxcXFxcXFxcXFxcXAAIBFwACARcAAgEXAAIBFxcXFxcXFxcXFxcXFwACARcAAgEXAAIBGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhsbGxsbGxsbGxsbGxsbGxssAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwAAgEsAAIBLAACASwsLCwsAAIBLCwsLCwAAgEsAAIBLAACAS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4u", "w": "/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAN0iAACAfwAA/wAAAP8AAACVagAA2SYAAP8AAACDfAAA/wAAAP8AAAD7BAAA/wAAAM4xAAD/AAAA9wgAAP4BAACYZwAAh3gAAP8AAADAPwAA/wAAAP8AAADXKAAA/wAAAPwDAAD/AAAA/wAAAIp1AAD/AAAAxToAAM8wAADAPwAAhHsAAP8AAAD/AAAA/wAAAP8AAAB/gAAA/wAAAP8AAACLdAAA/wAAAP8AAACAeQYA/wAAAP8AAADKNQAApVoAAH+AAADfIAAA3yAAANgnAACRbgAAwT4AAKlWAACdYQEA/wAAAP8AAACkWwAAiHcAAIV6AACIdwAA/wAAAP8AAAD/AAAAjnEAAIJ9AAD/AAAA/wAAAP8AAAB+fgMAzDMAAP8AAACRbgAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAAi3QAAL1CAACCfQAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAACQbwAAr1AAAP8AAAD/AAAA+QYAAP8AAAD/AAAAlWoAAP8AAAD/AAAA/wAAAId4AAD/AAAAqVYAAP8AAACtUgAAxDsAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAACpTggAqU8HAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAACpTwcA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAAhG0OAIZtDACkWwAAhnkAAIZtDACBfgAAj3AAAP8AAAD/AAAA/wAAAP8AAAD/AAAA+gUAAIJ9AADLNAAA/wAAAJJtAAD6BQAA6hUAAP8AAAD/AAAAuUYAAIZ5AAD/AAAA/wAAAP8AAAD+AQAA0S4AAIJ9AAD/AAAA/wAAAL1CAADwDwAA/wAAANcoAAD/AAAAlGsAAP8AAAD/AAAA/wAAAP8AAAD1CgAA/wAAAIF+AAD2CQAAmGcAAJdoAADHOAAA/wAAAJ9gAADKNQAAi3QAAOQbAACPcAAA8Q4AAP8AAADRLgAA/wAAAKtUAADzDAAA9AsAAIxzAAD/AAAAzDMAAJxjAAD/AAAAgH8AAPQLAACRbgAAwT4AAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAADuEQAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAADRLgAA/wAAAP8AAAD/AAAAinUAAIF+AAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAALVKAACAfwAA/QIAALZJAACAfwAAh3gAALpFAAD+AQAA2yQAAP8AAAD8AwAA1SoAAL1CAAD/AAAAsk0AAMA/AADGOQAAs0wAAP4BAADzDAAA+AcAANcoAACZZgAA/AMAAIF+AAD/AAAA9QoAAMA/AADjHAAA+wQAAIl2AADBPgAA+QYAAOsUAACNcgAAoF8AAOgXAADnGAAAj3AAAKJdAAD2CQAA2yQAAIF+AACRbgAAgH8AAPsEAADzDAAAkG8AAPINAACIdwAA0C8AAM0yAACQbwAA2SYAAPEOAADuEQAAxToAAIJ9AACMcwAArFMAAKxTAADeIQAAtUoAAPEOAADfIAAA/wAAALVKAAD9AgAAyTYAALJNAADHOAAA/wAAALNMAAD7BAAA/AMAAPcIAAD/AAAA4R4AAN0iAAD/AAAA/wAAAP0CAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAAyTYAAJJtAADyDQAA/gEAAJ1iAACUawAA9QoAAKVaAAD7BAAA/gEAAJ1iAAD4BwAAjHMAAPQLAACOcQAA8wwAAJ5hAAD/AAAAxjkAAPINAACTbAAAjHMAAIR7AAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD4BwAA9gkAAKpVAAD2CQAA/wAAAM4xAAD/AAAA/wAAAIt0AAD/AAAA/gEAAPINAADxDgAA5hkAAJplAAD/AAAA+QYAAP8AAAD/AAAA/wAAAO0SAAD2CQAAvEMAAM4xAAD/AAAA9QoAAP8AAAD/AAAA7RIAAP8AAAD/AAAA/wAAAJZpAACkWwAAnGMAAIZtDACFbQ0AhnkAAI1yAAB8eQoA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAAqU8HAKlOCAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAAs0UHAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAANEuAAD/AAAAi3QAAP8AAAD/AAAAxToAAP8AAAD/AAAAkG8AAP8AAAD/AAAA/wAAAOAfAAB/fwEA/wAAAP8AAAD/AAAAmmUAAP8AAACZZgAA/wAAAP8AAACKdQAAi3QAAJplAACeYQAA/wAAAP8AAACjXAAAlGsAAJNsAACTbAAA5xgAANQrAADFOgAAiHcAAJ1iAAB/gAAA/wAAAP8AAACAeQYA/wAAAJVqAAD/AAAA/wAAAP8AAACGeQAAwzwAAIR7AAD/AAAAlGsAAP8AAAD/AAAA3CMAAP8AAADVKgAA/wAAANcoAAD/AAAA/wAAAP8AAAD8AwAA/wAAAP8AAACzTAAA/wAAAP4BAAD/AAAA/wAAALRLAAD/AAAA/wAAAIV6AAD/AAAAmmUAAL5BAAD/AAAAyDcAAP8AAAD/AAAAgX4AAP8AAAD/AAAArlEAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAJFuAACHeAAAiHcAAI9wAAD/AAAA/wAAAJFuAAD/AAAA/wAAAJ9gAAD/AAAA/wAAAIxzAADAPwAA0i0AAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA", "b": "Li4uLi4uLi4uLi4uLi4uLi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0sLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwrKyoqKiopKCgnJycnJycmJiYmJSUkJCMjIiIhISAfHx8eHhwcHBwcHBwcHBwcHBsbGxsbGxsbGxsbGxsbGxsbGxsbGxsaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhkZGRkZGRkZGRkZGRgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFwYGBgYGBQUFBQUFBQUFBQUFBQUEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAwMDAwMDAwICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMDAwMDAwMDBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgcHBwcHBwcHBwcHBwkJCgoKCwwMDQ0ODg8PEBAREREREhISEhISExMUFRUVFRYWFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBkZGRkZGRkZGRkZGRkZGRkaGhoaGhoaGhoaGhoaGhsbGxssLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLi4uLi4uLi4uLi4u", "f": "TQJWAlMCSQJRAloCUQJLAloCWgJLAlMCOAJWAk0CMAI4Ak0CSwJNAlMCKQI4AjICMgI4AjACZwE/AmQCSQFkAmYCJAIhAiUCKAIkAiUCJQImAikCKAIlAisCTgFRAkkCYwJmAmQCYwJkAmECYQJkAmUCZwFJAj8CZQJkAj4CTgFLAlECNQIvAisCMwIrAikCMwIpAjICJQIpAisCKAIrAi8CNQIrAjMCZAJAAj4CZAI/AkACPwJJAkACQAJJAkYCWgJGAkkCfgEyAnEBcQEwAk0CcQEyAjACfgEzAjICVgFNAksCSgJPAlMBTwJRAVMBLAIjAiYCLAI3AiMCNwJBAiMCVAJBAjcCQAJdAjoCPgI6AjwCPgJAAjoCNAJMAi4CIgIlAiECIgImAiUCIgI0AiYCNAIuAiwCLgI3AiwCJgI0AiwCLgJUAjcCLgJMAlQCXQJaAlMCUwJCAkUCXQJTAkUCXQJFAkICQAJGAl0CXQJGAloCJgIjAikCKQIjAjgCVAJCAkQCVAJWAkECVAJEAlYCRAJCAlYCQgJTAlYCIwJBAjgCOAJBAlYCVwJdAkICVAJXAkIC2QHhAfwB/AHhAfEBCQMMA+0BCQMMA+sB9wHxAe0B/AHxAfcBJAIoAukBJALpAfYB6QHhAdkB9gHpAdkBAQMJA/4CCAMBA/4C9wEMAwEDDAMJAwED9wHtAQwD6QHhAfEB6QHnAfEBXQFkAWABZAFmAWABXQFcAWQBXAFhAWQBRgJoAVwBYAJHAWgBQwJcAV0BJgKBAYkBJQKJAYoBaAFnAVwBXAFnAWEB/AL+AvUC9QL+AgkD9QIJA+4C7AEPA+IB7gLiAQ8DDwP8AvUCDwP1Au4C/AIPA+wB+QH8AuwB7AHiAegB8AHoAeMB5wHwAfEB7QHxAeMB8AHjAfEBQwJdAWABIwJgAYEBDAPjAesBDAPtAeMB6wHjAegB4gHuAgkDCQPrAeIB4gHrAegB5AHwAekB6QHwAecB9AH4AewB9AHsAegB7wH5AfgB+AH5AewB+wHwAdoB8AHkAdoBugH0AfsBeAHaATUC6QEvAuQB2gHkATUCLwI1AuQB6AH7AfQB6AHwAfsBZgFMAkcCUAFVAWYBZgFVAUwCZgFkAVABiAFHAiICiAFmAUcCIgJHAicCJwJHAi4CJwIuAiICRwJMAi4CIgIuAjQCZwFMAWEBTAFnAWwBUAFhAUwBZAFhAVABPgJsAWcBPgI8AmwBSQFlAj4CSQFhAmUCZwFJAT4CRwFJAWcBRwFhAkkBRwFnAWgBRQFhAkcBRQFjAmECiQGDAYoBYQJjAmUCJQKKAYcBhwGKAX8BYAJFAUcBgwEhAoUBhQEhAn8BfwEhAiQCgwGIASICgwEiAiECgQGIAYkBgQFgAYgBiAGDAYkBYAFmAYgBigGDAYUBiAFmAYMBigGFAX8BTAJOAlQCTgJXAlQCTgJSAlcCUgJdAlcCTAFsATwCTAE8AlICaQFrAVgBWAFrAU8BXQI8AjoCUgI8Al0CUAJrAT0CUAJPAWsBUQFZAVMBUwFZAVsBUwFbAVgBUwFYAU8BSgJTAVACUAJTAU8BVQFOAkwCUAFMAVICUAFSAk4CUAFOAlUBygG+Ac4BvgHDAc4BvwHLAXgBzgG6AcgBzgHDAboByAHLAb8ByAG6AcsBgAG/AXgB1AG+AcoB1AG0Ab4BvgG0Ae8BvgHvAfgBUwDJAdMByQHEAdMBxAHSAdMBxAHfAdIB0AG/AXYBdgG/AYABsQG0AdMB0gHvAbQB0wHSAbQBXAJGAkMCWAJcAkMCVQJYAkECRgJcAUMCWAJDAkECXAI5AkACXAJAAkYCQQJDAmABIwJBAmABQQImAiMCYAJEAWICYAJKAUQBSgFGAUQBIwKBASYCJgKJASUCYAJiAkUBKgJzAS0CcwEqAnQBNgItAnkBQAJgAmgBRgJAAmgBIwImAjYCNgImAi0CVQJBAiMCLQImAiUCVQIjAjYCOQJqAV8CagFKAV8CXwJKAWACcAF0ATECdAEqAjECMQIqAigCKgIlAigCLQIlAioCOQJgAkACOQJfAmACSgJYAlUCUQFPAlUCSgJVAk8CWgFRAVUCWgFVAjYCWgFzAXkBWgF5AVEBcwF8AXkBUQF5AXwBUQF8AW8BeQEtAnMBWgE2AnkBywHaAXgBeAE1AnsBwwH0AboBugH7AcsBywH7AdoBvgH0AcMBUAI9AlwCPQI5AlwCPQJqATkCPQJrAWoBUAJcAkoCSgJcAlgC8gH6AdcB+gG7AdcB8gHXAeABuwHNAdcBagNQAG0DUABOAMEBUABOAG0D9QFtA04A9QFOAMEBaANAAGkDaQNAAD8AaQM/AFAAagNpA1AA9QHBAbsB9QG7AfoBXwNiA1cAVwBgA18DYgPJAVMAYgPcAckBawNiA18DbwNiA2sDbANrA18DbANfA2ADbwNrA2gDZgNoA2sDZgNrA2wDbANlA2YDZgNDAEAAZgNAAGgDZwNkA+4BagNnA24DagNuA2kD9QH6AfIBbQNnA2oDbQP1Ae4BbQPuAWcD7gH1AfIBbgNvA2kDaQNvA2gDSQBEAMEBUABJAMEBwQFEALcBSQC3AUQAPwBLAFAAUABLAEkAwQG3AbMBwQGzAbsBuwGzAdUBuwHVAc0BwAHKAc4BWABbAMoBygFbANQByAG/AdAB0AG4AcgBswG8AbgBvAHOAbgBuAHOAcgB1QGzAdAB0AF2AdcB1wF2AXABswG4AdABtwG8AbMBzQHVAdcB1wHVAdABQgBbAE0ATQBbAFgASQBNAMABtwFJALwBSQDAAbwBSwBbAEIATQBYAMABWADKAcABtwG8Ac4BwAHOAbwBSQBLAEIASQBCAE0A8gHgAekB5wHyAekB4gHYAd0BYgPdAdwBZwPuAeoBYgNTAFcAbgNhA28DYQNiA28DYQPdAWID4wHyAecB7gHyAeMBZwNjA24DbgNjA+IBbgPiAWED4gHuAeMB4gHdAWED4wHnAdEB6gHiAWcDYwNnA+IB4gHqAe4B6QEoAocBKAIlAocB4AFwATEC4AExAigC4AEoAukB1wFwAeAB3AHdAckB3QHfAcQB3QHEAckBBgEAAQEBfwEkAvYBfwH2AcIBtgGHAcIBhwF/AcIBBAEIAQABBgEEAQABCAEDAQABzAHFAb0BxQG5Ab0BCAECAQMBBwECAQgBAAEDAQUDAAEFAw4DzAEJAQsBBwH/AAIBCQHMAf4ACwEJAf8A/wAJAf4AzAG9Af4ABwELAf8A+gLbAfMC2wHHAQ4B8wLbAQ4B+gIOAQoB+gLzAg4B3QHYAcYB+gIKAQwB3QHGAd8B2wHfAcYBxwHbAcYB1gHRAcwB0QG2AcUBtgHCAcUBzAHRAcUB6QGHAbYBhwG2AbUB5wHpAdEB2AELAQUBxgEFAQ0BxgHYAQUBBQEHAQ0BBQELAQcB6QG2AdEB4wHRAdYB4gHjAdgB4wHWAdgBDgHHAcYBzwHYAcwBxgENAQ4BDQEIAQ4BDQEHAQgBzwHMAQsB2AHPAQsB1gHMAdgB0gHmAe8B2wHlAd8B3wHlAeYB0gHfAeYBKAIvAukB5QHvAeYB5QHzAe8BvgH4AfQB9wEBAwQD/gAEAwEDvQG5AfcB9wG5AfwBAgH/AAgD/wABAwgDAgEIAwUDvQEEA/4AvQH3AQQD/wD+AAEDuQHFAd4BwgH2AcUBxQH2Ad4BuQHeAfwBAwECAQUD3gH2AfwB9gHZAfwB8wLlAdsBWQFeAVsBbQFYAU0BWwFeAVgBWAFiAU0BaQFYAW0BhgFjAVQBXgFjAWUBVAFjAVkBWQFjAV8BWQFfAV4BXwFjAV4BegGEAYYBcgF6AYYBdQF6AXIBdwFUAVkBdwFyAVQBVAFyAYYBdwF1AXIBawFpAWoBaQFtAWoBcAF2AX0BegF9AYIBdgGAAX0BfQGAAYIBcAF9AXQBWAFeAWUBWAFlAWIBUQFvAVkBdAF9AXoBbwF8AXcBcwF6AXwBcwF0AXoBbwF3AVkBfAF1AXcBegF1AXwBBgEMAQoBCgEEAQYBCgEIAQQBCgEOAQgBYwFSAWUBZQFSAVYBhgGEAXEBhgFxAVIBhAF+AXEBhgFSAWMBggGAAXsBeAF7AYABggF7AYQBhAF7AX4BTgFiAVYBYgFlAVYBbQFNAWEBbQFhAWcBYgFhAU0BYgFOAWEBRgFnAUkBRAFGAUkBRAFJAUgBSgFqAUYBagFtAUYBbQFnAUYBSQFnAWQCSAFJAWYCegGCAYQBZwFhAUkCTgFJAmEBewEzAn4BcQFNAlIBewE1AjMCVgFSAU0CVgFLAk4B/gL1AvEC/AL5AfUC+QHdAfUC9QLdAfEC+QHvAd0B7wH1At0B7wHsAvUC9QLsAvEC7wHrAuwC7ALrAvEC7wHzAesC8wHlAesC6wLlAfEC5QHbAfEC2wHzAvEC8wL6AvECDAHwAvoC+gLwAvECDAEGAfACBgEBAfACAQEAAfACAAEOA/AC8AIOA/ECDgMFA/ECBQMIA/ECCAP+AvECtAFaAF0AXQBaAD0AtAGxAVoAsQHTAVoAWgDTAT0A0wHJAT0AyQFTAD0AUwBXAD0AYANSAFcAVwBSAD0AYANsA1IAbANrA1IAUgBrAz0AbANlA1IAZQNmA1IAZgNDAFIAUgBDAD0AQwBAAD0AQAA/AD0APwBLAD0ASwBCAD0AWwDUAUIA1AGyAUIAQgCyAT0A1AG0AUIAtAFdAEIAQgBdAD0AZgJ/AjQBZgI0AUgBYwJ3An8CYwJ/AmYCSAE0AUQBRAE0ASgBRAEoAXYCRAF2AmICYgJ2AikBYgIpAUUBRQEpAXcCRQF3AmMCdwJ5AoICdwKCAn8CfwKCAjABfwIwATQBNAEwASgBKAEwAScBKAEnAXsCKAF7AnYCdgJ7AiUBdgIlASkBKQElAXkCKQF5AncCggJtAjYBggI2ATABeQKAAnsCeQJ7AoICMAE5AUEBMAFBAScBggJ7Am0CMAE2ATkBJwFBAXsCJQGAAnkCewJ0Am0CNgEuATkBQQFvAnsCJQEwAYACewKFAn0CewJ9AnECewJxAnQCdAJxAmsCdAJrAm0CbQJrAjgBbQI4ATYBNgE4ATMBNgEzAS4BLgEzATcBLgE3ATkBOQE3AT0BOQE9AUEBQQE9AXMCQQFzAm8CbwJzAn0CbwJ9AnsCewJ9AiMBewIjASUBJQEjAS0BJQEtATABMAEtAYUCMAGFAoACgAKFAnsCfQJwAj8BfQI/ASMBhQJ1An4ChQJ+An0CfQJ+AmkCfQJpAnECcQJpAm4CcQJuAmsCawJuAkIBawJCATgBOAFCASoBOAEqATMBMwEqAUMBMwFDATcBNwFDATwBNwE8AT0BPQE8AWcCPQFnAnMCcwJnAn4CcwJ+An0CfQJ+AmgCfQJoAnACcAJoAjsBcAI7AT8BPwE7ATUBPwE1ASMBIwE1ASsBIwErAS0BLQErAXUCLQF1AoUCaAJ+AjUBaAI1ATsBdQJ6AoECdQKBAn4CfgKBAmwCfgJsAmkCaQJsAnICaQJyAm4CbgJyAj4BbgI+AUIBQgE+ASIBQgEiASoBKgEiAUABKgFAAUMBQwFAAToBQwE6ATwBPAE6AWoCPAFqAmcCZwJqAoECZwKBAn4CfgKBAjIBfgIyATUBNQEyASsBKwEyASYBKwEmAXoCKwF6AnUCbAKBAnICIgE+AUABgQJ4AnICPgEmAUABOgExAWoCagIxAYECJgEyAXoCMgGDAnoCcgJ4AiYBcgImAT4BegKGAnwCegJ8AoECgQJ8AngCeAJ8AiQBeAIkASYBJgEkAUABQAEkASwBQAEsAToBOgEsATEBMQEsAYECgQIsAYQCgQKEAi8BgQIvATIBMgEvAYYCMgGGAoMCgwKGAnoChAIsAYYChAKGAi8BfAKGAiwBfAIsASQB/QL/AvQC9wIDA/QCAwP7AvQCAwP3Av8C/wL3AvQCCAP+AvsCCAP7AgUD/ALyAv4C/QL0AvwC9ALyAvwC+wL+AvIC+wLyAvQC+QIDA/8C7wH8AvkBBwMGA+8B7wEGA/wCBwP9AvwCBwP8AgYDDgMFAwMDAwMFA/sC9gIDA/kC9gIAAwMDFgMAA/YCFgMTAwADAAMKAwMDDgMDAwoDEAMKAwAD9gL5Av8CAgP2Av8CFwMaAx8DFwMgAxoDEAMAAxMDIAMiAxwDIAMcAxoDEgMQAxMDHAMTAxYDHAMUAxMDIAMSAyIDIgMSAxQDIgMUAxwDFAMSAxMD+QD8ABAD+gD5ACADIAP5ACIDIgP5ABID+QAQAxID/AD9ABAD9wD6ABcDFwP6ACAD/AAGAf0ABgEBAf0AAQEQA/0AAQEKAxADEQMSAyADAAEOAwEBCgMBAQ4D+wD3ABcD+wAXAxgDGwMVA/gAGwP4APUA9gD7ABkDGQP7AB4DGQMbA/YA9gAbA/UA+AL6AgwB+wAYAx4D+AAVA/gC+AD4AgwBHQMCAw0DHQMWAwIDDQP/AgsDDQMCA/8C7QIdAw0D7QINAwsDFgP2AgIDCwP/AgcDBwP/Av0C8wEHA+8BGwMZAyMDGQMhAyMDGQMeAxgDGQMYAyEDGwMjAx0DGwMdAxUDGAMaAyEDGAMfAxoDIQMcAyMDIQMaAxwDGAMXAx8D7wIHA+sC7wILAwcD6wIHA/MB7QILA+8CIwMWAx0DIwMcAxYDFQMdA+0CFQPtAvgC+ALtAu8C+ALvAvoC+gLvAusC+gLrAvMC6wLlAfMC/AAMAQYB+AAMAfwA9QD8APkA9QD4APwA9gD5APoA9gD1APkA+wD2APoA+wD6APcA/gL1AvkC+QHxAvUC9QLxAvkC+QHvAfEC7wHrAvEC8QLrAvkC6wLzAvkC8wL6AvkC+gLwAvkCBgEEAfAC8AIEAfkC8AIOA/kCDgMFA/kCBQP7AvkC+wL+AvkCtAE+AEEA1AFbALQBPgC0AVsAWwBcAD4AXABBAD4AQQCxAbQBLQBWACkAKQBWAF8AVgBhAF8AVgBXAGEAVwBaAGEAVwBTAFoAUwDTAVoALQApADAAMAApACwANgBgAEUAOgArACwAOgAyACsAMgAuACsAOwAsACkAOwApADYAOgAsADsALgAqAC8ALgAvACsALwAwACsAKwAwACwAYQBaAEEAWgCxAUEANgApAGAAYAApAEoAKQBfAEoAYABKAF4AXgBKAEYAXgBBAFwASgBfAEYAYQBBAEYAXgBGAEEAXwBhAEYAcANyA3gDcAN4A3YDcwNxA3UDdQNxA3cDcAN3A3EDcAN2A3cDeAMtAHYDdgMtADAAdQMqAC4AdwMvAHUDdgMwAC8AdwN2Ay8AdQMvACoAVwBWAGADeANgA1YAeANWAC0AcgNsA2ADcgNgA3gDcwN1Ay4AcwMuADcAcwMzAHEDcwM3ADMAMwBwA3EDMwA1AHADOAB0A3IDNQAzADkAOAByAzkAcgNwAzkAcAM1ADkAdANlA3IDbANyA2UDMwA8ADkAQwBmA0gAZgNlA0gAdAM4AGUDZQM4AEgATAA/AEAAPwBMAEsAOAAxAFEAMQA2AEUAMQBFAFEAUQBFAE8ATwBZAEwAWQBUAEwATwBFAF4ATwBeAFkAXgBUAFkARQBgAF4AVABeAFwANwAuADIAVABcAFUAXABbAFUASwBVAFsATABUAEsASwBUAFUAQwBIAE8AUQBPAEgASAA4AFEAQwBPAEwAQwBMAEAAOwA2ADEAOQA1ADQAOQAxADgANQA7ADQAOQA0ADEANAA7ADEANwAyADoAMwA3ADoAMwA6ADsANQAzADsAtAFaAD0APQBaAEcAWgBTAEcAUwBXAEcAVwBSAEcAYANrA1IAUgBrA0cAYANsA2sDUgBDAEcAQwBAAEcAQABMAEcATABLAEcASwBCAEcA1AE9AEIAQgA9AEcA1AG0AT0AEAETARIBEwEQAQ8BEAESAaUCrAITAQ8BtAIQAaUCtAKxAhABEAGxAhEBqAITAawCrAIPARABrAIQAbQCrAK0ArECpQISARMBsQK0ArgCqgKsArECsQK4ArYCqAKlAhMBtQKwArECtgK1ArECtQKuArACuwKuArUCtgK4ArQCpwKlAqgCsgKmAqgCrAKyAqgCtwK7ArUCqAKmAqcCtAKlAq0CtgK0AqsCrwKsAqoCrwKqArECqQKxArACtQK2ArkCrgKpArACqQKuArMCswKuArsCrQKlAqcCrwKyAqwCrQKrArQCrwKxAqsCugK2AqsCqQKrArECuQK2AroCtQK5ArcCpgKyAq0CsgKrAq0CsgKvAqsCqwK5AroCswK7ArcCrQKnAqYCqwKpArkCqQKzArkCtwK5ArMCHQEVARYBHAEdARYBFQEdAZoCHQGgApoCHQEcAaACkwKOAhUBjgIWARUBjgIcARYBFQGaApMCoAIcAY4CkwKaAp4CjgKTAp4CoAKcApoCmgKcAp4CnAKOAp4CoAKOApwC6ALmAucC6QLmAugC6gLpAugC5wLmAuUCvwLCAsQCwQK/AsQCxALkAsECwALDAr8CwgK/AsMC5gLoAuUC6ALnAuUC2ALBAsQC2ALbAsEC2wLYAt0C4QLdAtgC4QLcAt0C4QLgAtwCxgLAAr0CwwLAAsYC2wLdAtwC4QLYAuACwwLGAsICxQLCAsYCxQLEAsICvwLBAr4C2QLYAsQC4ALYAtkCvQLAAr8C2gLbAt0CvwK8Ar0CxQLHAsQC2QLEAscC2QLHAtgCvgLBAtsC3ALgAt4C3ALjAuICvwK+ArwC0wK+AsECvgLbAtMC0wLbAtoC4ALZAtoC4ALaAt8C4ALfAt4C3ALeAt0C3gLjAtwC3wLaAt0C3gLfAt0C3gLaAt8CxwK+AtkC2QK+AtoC0wLSAtQC0wLaAr4C0wLUAtUCvgLIArwCxgK9ArwCxQLGArwCyAK+AskCvgLTAs0CvgLHAsUCyQK+AssCvgLFArwCvgLNAssCygLLAswCyQLNAr4CywLNAskC6ADvAPIA6ADyANQA5gDvAOgA3QDoANQA3wDdANQA1ADWAN8A5QDvAOYA7QDvAOUA3wDWANgA3wDYAOEA7wDZAPIA4QDYANIA0QDlANsA7QDlANEA2wDlAOYA7wDXANkA3QDjAOgA3wDpAN0A8wDWANQA2ADWAPAA4QDnAN8A0gDYANoA7QDRAO8A2wDmAOAA7wD0ANcA9ADZANcA6ADgAOYA8gDZAPEA8QDsAPIA7ADUAPIA6QDjAN0A8wDwANYA5wDpAN8A2gDYAOQA7gDhANIA2gDkAOIA0gDaANMA2gDiANMA2QD0APEA4ADoAN4A6ADjAN4A8wDUAOwA2ADwAOQA4QDuAOcA7gDSANMA7gDTAOoA0wDiAOoA7wDRANcA3ADRANsA0QDcANUA1wDRAPQA7ADxANAALgPqAOIA9ADRAOsA7ADQAPMALgPiACcDOgPVANwAOgPcANsAOwPbAOAANAPRANUA0QA1A+sA6wA1Ay8D8QD0ACoD4wA4A94A5wAkA+kALQPnAO4ALQPuAOoA9ADrAC8D9AAvAyoD3gA3A+AA3gA4AzcDLAPQAPEA4wDpACQD8wDsACkD8wApA/AA5wAlAyQDJQPnAC0D5ADwACYD4gDkACcD0QA0AzUDOgPbADsDOAPjACgD7ADQADAD7AAwAykDKAPjACQDKwPwACkD8AArAyYDJwPkACYDLgMtA+oANwM7A+AAKgMsA/EA0AAsAzADMwPVADoDNQM0Ay8DMAMsAzIDJQMtAysDLQMmAysDMgMsAyoDLQMnAyYDLgMnAy0DMgMqAzEDJQMpAyQDKwMpAyUDJAMpAygDKQMwAygDKgMvAzUDKgM1AzEDNAPVADMDMAMyAygDKAMyAzgDMgM3AzgDNwMyAzEDOQM0AzMDMQM1AzcDNwM2AzsDNwM1AzYDOQM1AzQDOgM7AzMDNgMzAzsDPAM1AzEDNQM8AzYDPAM1AzkDOQMzAzwDMwM2AzwDxwDEAMgAxQDIAMQAyQDGAMcAxwDGAMQAzwDEAMYAzwDGAMkAzADJAMcAxADPAM4AzADHAMsAzwDJAMwAxQDEAM4AyADKAMcAyADFAM0AygDIAM0AywDHAMoAzQDFAM4APgPLAEADQAPLAMoAzQDOAEMDPgPMAMsAQwPOAM8ARQPKAM0APQPMAD4DQwPPAEIDRQNAA8oAQgPPAMwAPQNCA8wAzQBDA0UDQwNCAz0DPgNDAz0DRQNDAz8DPwNDAz4DRQM/A0EDQANFA0YDRAM/Az4DRgM+A0ADRgNEAz4DRgNFA0EDPwNLA0EDRgNIA0QDRANJAz8DSQNMAz8DRgNBA0sDSANJA0QDSwM/A0wDSwNMA0kDRgNLA0gDSwNJA0gDSwNIA0oDSgNIA0cDSANLA0cDRwNLA0oD+wAeAxcDIAMXAx4DIAMeAxkDIAMZAxcDHgMXAxkDHwMXAx4DGAMfAx4DFwMYAx4D4gAnA+oAJwMuA+oAXgNcA1sDXANeA5QAXgOSAJQAlACjAFwDkgBeA1sDpQBbA1wDowClAFwDowCfAFwDnwBcA10DnwCjAJQAngCjAJ8AkgBbA6UAmACjAJ4AnwCUAJMAoACeAJ8AoACdAJ4AoAChAJ0AoACbAKEAmACfAKMApgCSAKUAnwCYAJ4AkwCUAJUAoACfAJoAkgCmAJEAowCmAKUAlgCUAJIAlACWAJUAkwCVAJcAnwCTAJcAngCdAJcAmwCgAJoAmQCdAKEApgCjAJwAkgCRAJYAnACjAJcAlwCjAJ8AlwCfAJ4AmgCfAJcAogCXAJ0AmQCiAJ0AmwCaAKQAoQCbAKQAkQCcAJYAlQCWAJcAlgCcAJcAkQCmAJwAogCaAJcApACZAKEAogCkAJoApACiAJkAWANOA00DTQNXA1gDVwNNA70AWAOzAE4DWAO2ALMAWANXA7YAugC9AE4DTQNOA70AVwO9ALYATgOzALoAswCtALoAtgCuALMAswCuAK0AvQC6AK4ArgC6AK0AtgC9AK4AZABmAGcAZgBkAGUAZgBlAGMAZgBjAGIAjgCIAIYAjgCMAIgAjgCGAGgAigCIAIwAjACLAIoAZQBkAGcAZgBlAGcAhgByAI4AjgByAHMAcgBvAHAAcABvAG4AbQBzAHIAbQByAHAAcABuAG0AjACOAIcAigCLAIUAigCQAIgAbgBzAG0AkACKAIUAcAByAGwAawBuAG8AhQCLAIwAjQCGAIgAcwBtAGwAbwBwAGsAhQCMAIcAjwCNAIgAjQB5AIYAdACGAI0AdAByAIYAbAB0AHMAcgB0AGwAbQBrAGwAawBtAG4AbABrAHAAcwBxAIkAcwCJAI4AeQB0AI0AdABxAHMAagBvAGsAawBpAGoAaQBrAG8AaQBvAGoAiACQAI8AjgCJAIcAiQBxAHQAdACNAIkAegB5AHgAhQCHAI8AjwCQAIUAjQCPAIQAeQCNAH8AgwCNAIQAjQCDAIIAjQCHAIkAdwB4AHkAjwCHAI0AfwCNAIIAggCAAIEAfwCDAI0AggCDAH8AjQCDAI8AgwCEAI8AiwORA4cDiwOWA5EDhwORA4ADjAOHA4ADjAOAA4oDjAOKA5UDiwN/A5YDfwONA5YDlQOKA5IDigOGA5IDiwOHA34DkgOGA3wDgAORA5ADkAOTA4ADkwOKA4ADlQOEA4wDhgOKA5cDnAOSA3wDjwONA38DiwOPA38DhQORA5YDnQN+A4cDhwOCA50DjAOCA4cDkAORA4gDjAOEA4IDlwOKA5MDlQOSA4kDegOSA5wDlwOYA4YDmAN8A4YDnAN8A5oDegOcA5oDmgN8A3kDmwN5A3wDjQOPA4MDlgONA4MDiwOUA48DfgOeA4sDhAOVA4kDkgN6A4kDfQN6A5oDmAObA3wDfQOaA3kDfQN5A5sDlgODA4UDngOUA4sDngN+A50DkQOFA4gDlAOeA48DjgODA48DgQODA44DewOdA4IDjwOeA5kDgQOOAxYAFACPA5kDHACZA54DFwAcAJ4DkAMVAJMDfQObAxkAHAAUAJkDgwMnAIUDhQMiAIgDGACeA50DiAMiAJADggMmAHsDJgCCA4QDiQMkAIQDGwCbA5gDgwMoACcAJgCdA3sDkwMVABIAlwOTAxIAIQAjAIkDlwMQABsAIQCJA3oDmAOXAxsAegN9Ax4AgQMWACgAjwMWAI4DgwOBAygAFwCeAxgAIgCFAyUAJgAYAJ0DJAAmAIQDIwAkAIkDlwMSABAAmwMbABkAHgAhAHoDFgCPAxQAkAMiABUAhQMnACUAEQAYACYAHgB9AxkAHAAWABQAFwAYABEAIQAbACMAGwAQACMAHgAbACEAGQAbAB4AEwAXABEAEAASACQAIwAQACQAFAAcABcAFwATABQAEgAVACYAJAASACYAKAAWAB0AJgAVACIAJgAiABEAEQAiACUAEQAlABMAIAAoAB0AFgAUAB0AIAAnACgAEwAfABQAEwAlAB8AEwAUABoAHwAlACcAHwAaABQAHwAnACAAHQAUABoAHwAgAB0AGgAfAB0AoQOfA6YDpgOoA6EDoQOpA6MDqQOhA6gDowOpA6oDqgOpA6QDqQOoA6QDnwOhA6UDowOqA6EDoQOqA6UDogOgA6gDogOoA6YDpgOfA6cDpAOoA6ADnwOlA6cDpwOiA6YDpwOlAwYACgCgA6IDpQOqAwcABgClAwcAogOnAwYABACqA6QDCwCkA6ADBwCqAwQACgCiAwYABACkAwkACQCkAwsACwCgAwoABwAEAAkACwAHAAkADAALAAoACgAGAAEABgAHAAEAAwAHAAsAAwALAA4AAQAHAAMADgALAAwADAAKAAEAAAADAA4AAgAOAAwADQADAAAADgACAAAADwABAAMADwADAA0AAAAPAA0AAgAPAAAADAABAAIAAgABAA8ACAAPAAIABQACAAgANwB1A3MDKgB1AzcAMwAqADcALwAqADMALwAzADcAKgAvADcAMgAqADcALgAqADIAHgCbA30DmwMeABkAjwKhApsCkQKhAo8CFwGPAhoBjwKJAhoBjwKUAokCjwKbApQCkwKaAiABkwIZARUBkwIgARkBlwKUAowClwKjApQClAKSAowCmwKSApQCGAGIAhkBIQEYARkBGQGIApMCowKXAqQClwKiAqQCmwKNApICoQKNApsCmQKNAqECkwKIAp4CiAKZApUCmQKKAo0CiAKKApkCiAKVAp4CigIeAZ0CigIYAR4BmgKeApACGAGKAogCkAKeApUCkAKVAosChwKVApkCiwKWApgClgKLAocCmAKaAosCmgKQAosCmAKWAiEBkQIhAZYCkQIUASEBmAIgAZoCIQEgAZgCFAEeARgBIQEUARgBIAEhARkBFwEaARsBGgEfARsBFwEbAR4BFwEeARQBhwKZAqECiwKVAocCFwEUAY8CFAGRAo8ClwKSAp8CigKdAo0ClwKMApICnwKSAo0CGwGfAp0CHgEbAZ0CnwKNAp0CGwGXAp8CHwGXAhsBhwKhApEClgKHApEClAKkAokClAKjAqQClwKJAqQCGgGJApcCGgGXAh8BwwDBALsAwwC7ALwAwQBTA78AUgNTA8EAuwC/ALcAuwDBAL8ArQDCAMAAugC5AMAAwgC6AMAAqwDAAL4AUANUA1EDugBPA7kATwNQA7kAUANRA8MAuABQA8MAuQBQA7gAvgC5ALgAwAC5AL4AVQNWA1MDVQNTA1IDVANSA1EDVANVA1IDswCrALIAswCtAKsAsQCrAKkAsgCrALEAsQCpAK8AqQC1AK8AWgOxAFQDswCyAFkDsgCxAFoDWQNaA08DTwNaA1ADsgBaA1kDWgNUA1ADugCzAE8DWQNPA1gDWANPA7MAswBZA1gDrAC1ALQArwC1AKwAVgOsAKoAVQOsAFYDqgC0ALAArAC0AKoArQDAAKsAqwC+AKkArQC6AMIAVAOsAFUDVAOvAKwAsQCvAFQDqQC+ALUAUQNSA8EAUQPBAMMAqgC3AKgAqgCwALcAtAC3ALAAtAC7ALcAqgCoAKcAtAC1ALsAtQC+ALwAvAC7ALUAuADDAL4AvgDDALwAqgCnAL8AtwC/AKcAtwCnAKgAUwNWA6oAUwOqAL8ATAFsAVgBbAFpAVgBbAE7AmkBOwJZAlgBaQE7AlgBbAE8AjsCOwI8AlkCYQFMAUgCUgJIAkwBYQFnAWwBYQFsAUwBSAJnAWEBSAI+AmcBPgI8AmcBZwE8AmwBSAJSAj4CUgI8Aj4CTAFZAlICTAFYAVkCUgJZAjwCUAJeAj0CSwFuAT0CXgJLAT0CPQJuAWsBbgFLAWsBUAJPAUsBUAJLAV4CTwFrAUsBTwFQAlcBXAJXAVACVwFcAjkCVwE5AmoBOQI9AmsBagE5AmsBVwFqAU8BTwFqAWsB" }] };
var b64 = (s, T2) => {
  const bin = atob(s), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new T2(u.buffer);
};
var BONES = MANNEQUIN.bones;
var BI = Object.fromEntries(BONES.map((b, i) => [b.id, i]));
var GEOS = MANNEQUIN.lod.map((L) => {
  const p = b64(L.p, Int16Array), n = b64(L.n, Int8Array), cnt = p.length / 3;
  const pos = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt * 3; i++) pos[i] = p[i] / 1e4;
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("normal", new BufferAttribute(n, 3, true));
  g.setAttribute("skinIndex", new BufferAttribute(b64(L.j, Uint8Array), 4));
  g.setAttribute("skinWeight", new BufferAttribute(b64(L.w, Uint8Array), 4, true));
  g.setIndex(new BufferAttribute(b64(L.f, Uint16Array), 1));
  g.computeBoundingSphere();
  g.boundingSphere.radius = 1.2;
  g.boundingSphere.center.set(0, 0.9, 0);
  return g;
});
var whiteMat = null;
function bodyMaterial() {
  return whiteMat ?? (whiteMat = makeLitMaterial({ body: (
    /* glsl */
    `alb=vec3(.92); ao=mix(.82,1.,smoothstep(0.,.5,vObj.y)); eN=.05;`
  ) }));
}
var Character = class {
  constructor({ lods = true, scale = 1 } = {}) {
    this.group = new Group();
    this.bones = BONES.map((b) => {
      const o = new Bone();
      o.name = b.id;
      return o;
    });
    BONES.forEach((b, i) => {
      const P2 = b.parent ? BONES[BI[b.parent]].pivot : [0, 0, 0];
      this.bones[i].position.set(b.pivot[0] - P2[0], b.pivot[1] - P2[1], b.pivot[2] - P2[2]);
      if (b.parent) this.bones[BI[b.parent]].add(this.bones[i]);
    });
    const root = this.bones[0], mat2 = bodyMaterial();
    this.skeleton = new Skeleton(this.bones);
    this.meshes = (lods ? GEOS : [GEOS[0]]).map((g, i) => {
      const m = new SkinnedMesh(g, mat2);
      if (i === 0) m.add(root);
      m.bind(this.skeleton);
      m.castShadow = true;
      m.receiveShadow = true;
      m.visible = i === 0;
      this.group.add(m);
      return m;
    });
    this.group.scale.setScalar(scale);
    this.B = Object.fromEntries(this.bones.map((b) => [b.name, b]));
    this.rest = this.bones.map((b) => b.position.clone());
    this.phase = Math.random() * 6;
    this.speed = 0;
    this.talk = 0;
    this.lod = 0;
  }
  setLOD(i) {
    if (i === this.lod) return;
    this.lod = i;
    this.meshes.forEach((m, k) => {
      m.visible = k === i;
    });
  }
  setShadow(on) {
    for (const m of this.meshes) m.castShadow = on;
  }
  // procedural pose: gait from speed (m/s), idle breathing, talking nod
  animate(dt, t) {
    const B2 = this.B, s = Math.min(1.6, this.speed / 1.4), w = Math.min(1, s);
    this.phase += dt * (this.speed > 0.05 ? 2.6 + this.speed * 1.9 : 0);
    const ph = this.phase, sn = Math.sin(ph), cs = Math.cos(ph);
    B2.thigh_left.rotation.x = -sn * 0.42 * w;
    B2.thigh_right.rotation.x = sn * 0.42 * w;
    B2.shin_left.rotation.x = Math.max(0, cs) * 0.75 * w;
    B2.shin_right.rotation.x = Math.max(0, -cs) * 0.75 * w;
    B2.upper_arm_left.rotation.set(sn * 0.32 * w, 0, 0.09);
    B2.upper_arm_right.rotation.set(-sn * 0.32 * w, 0, -0.09);
    B2.forearm_left.rotation.x = -0.18 - 0.2 * w;
    B2.forearm_right.rotation.x = -0.18 - 0.2 * w;
    B2.pelvis.rotation.y = sn * 0.07 * w;
    B2.pelvis.position.y = this.rest[0].y - Math.abs(cs) * 0.025 * w - 0.01 * w;
    B2.ribcage.rotation.set(Math.sin(t * 1.7 + this.phase) * 0.02 + 0.04 * w, -sn * 0.09 * w, 0);
    B2.head.rotation.x = this.talk > 0 ? Math.sin(t * 7) * 0.05 : Math.sin(t * 0.4 + this.phase) * 0.03;
    B2.head.rotation.y = this.talk > 0 ? 0 : Math.sin(t * 0.23 + this.phase * 2) * 0.25 * (1 - w);
    this.talk = Math.max(0, this.talk - dt);
  }
};
var NavGrid = class {
  constructor(x0, z0, x1, z1, cell = 2) {
    Object.assign(this, { x0, z0, cell });
    this.w = Math.ceil((x1 - x0) / cell);
    this.h = Math.ceil((z1 - z0) / cell);
    const N = this.w * this.h;
    this.g = new Float32Array(N);
    this.ok = new Uint8Array(N);
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell, o = j * this.w + i;
      const g = groundAt(x, z, 400);
      this.g[o] = g;
      this.ok[o] = waterLevel(x, z, g) - g < 0.3 && !occupiedAt(x, z, g, 0.5) ? 1 : 0;
    }
    // Do not delete an otherwise valid cell just because ONE neighbor is on
    // a different terrace. Height differences are checked per traversed edge.
    this.maxRise = 1.65; // 0.825 m/m per 2m cell, beneath PLAYER step limit
  }
  idx(x, z) {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    return i < 0 || j < 0 || i >= this.w || j >= this.h ? -1 : j * this.w + i;
  }
  center(o) {
    return [this.x0 + (o % this.w + 0.5) * this.cell, this.z0 + (Math.floor(o / this.w) + 0.5) * this.cell];
  }
  nearestOpen(o) {
    if (o >= 0 && this.ok[o]) return o;
    const i0 = o % this.w, j0 = Math.floor(o / this.w);
    for (let r = 1; r < 12; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = i0 + di, j = j0 + dj;
      if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
      if (this.ok[j * this.w + i]) return j * this.w + i;
    }
    return -1;
  }
  los(a, b) {
    const [ax, az] = this.center(a), [bx, bz] = this.center(b), n = Math.ceil(Math.hypot(bx - ax, bz - az) / (this.cell * 0.5));
    let prev = a;
    for (let k = 1; k <= n; k++) {
      const o = this.idx(ax + (bx - ax) * k / n, az + (bz - az) * k / n);
      if (o < 0 || !this.ok[o] || Math.abs(this.g[o] - this.g[prev]) > this.maxRise) return false;
      prev = o;
    }
    return true;
  }
  path(x0, z0, x1, z1) {
    const s = this.nearestOpen(this.idx(x0, z0)), t = this.nearestOpen(this.idx(x1, z1));
    if (s < 0 || t < 0) return null;
    const W = this.w, N = W * this.h, gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [], push = (o, f) => {
      heap.push([f, o]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = i - 1 >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (; ; ) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top[1];
    };
    const ti = t % W, tj = Math.floor(t / W), hcost = (o) => {
      const dx = Math.abs(o % W - ti), dz = Math.abs(Math.floor(o / W) - tj);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    gs[s] = 0;
    push(s, hcost(s));
    let found = false, iter = 0;
    while (heap.length && iter++ < 6e4) {
      const o = pop();
      if (closed[o]) continue;
      closed[o] = 1;
      if (o === t) {
        found = true;
        break;
      }
      const i = o % W, j = Math.floor(o / W);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= this.h) continue;
        const p = nj * W + ni;
        if (!this.ok[p] || closed[p] || Math.abs(this.g[p] - this.g[o]) > this.maxRise) continue;
        if (di && dj && (
          !this.ok[j * W + ni] || !this.ok[nj * W + i] ||
          Math.abs(this.g[j * W + ni] - this.g[o]) > this.maxRise ||
          Math.abs(this.g[nj * W + i] - this.g[o]) > this.maxRise
        )) continue;
        const c = gs[o] + (di && dj ? 1.414 : 1);
        if (c < gs[p]) {
          gs[p] = c;
          from[p] = o;
          push(p, c + hcost(p));
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let o = t; o !== -1; o = from[o]) cells.push(o);
    cells.reverse();
    const out2 = [cells[0]];
    for (let k = 1; k < cells.length; k++) if (!this.los(out2[out2.length - 1], cells[k])) out2.push(cells[k - 1]);
    out2.push(cells[cells.length - 1]);
    return out2.map((o) => this.center(o)).concat([[x1, z1]]);
  }
};
var NAMED = [
  {
    id: "bran",
    name: "\uBE0C\uB780",
    title: "\uD56D\uB9CC \uAD00\uB9AC\uC778",
    day: [[0, "home"], [6, "harbor_office", "stand"], [12, "quay", "wander"], [14, "harbor_office", "stand"], [19, "inn", "stand"], [22, "home"]],
    lines: { first: "\uC0C8\uB85C \uC628 \uC5BC\uAD74\uC774\uAD70. \uC785\uD56D\uC138\uB294 \uC870\uD569\uC5D0\uC11C \uC77C\uAC70\uB9AC \uBC1B\uC544\uC11C \uAC1A\uB3C4\uB85D.", day: ["\uBC30\uAC00 \uB2A6\uB294\uAD70. \uBC14\uB78C\uC774 \uBC14\uB00C\uC5C8\uC5B4.", "\uBD80\uB450\uC5D0\uC11C \uB6F0\uC9C0 \uB9C8."], night: ["\uC774 \uC2DC\uAC04\uC5D4 \uBD80\uB450 \uCABD\uC740 \uC704\uD5D8\uD574."] }
  },
  {
    id: "sera",
    role: "guild",
    name: "\uC138\uB77C",
    title: "\uC870\uD569 \uC811\uC218\uC6D0",
    day: [[0, "home"], [7, "guild_desk", "stand"], [12, "stall_b", "work"], [13, "guild_desk", "stand"], [19, "inn", "stand"], [21, "home"]],
    lines: { first: "\uACAC\uC2B5 \uB4F1\uB85D\uC774\uC694? \uC774\uB984 \uC801\uACE0, \uC758\uB8B0\uD310\uC740 \uC800\uCABD. \uCC98\uC74C\uC5D4 \uCC44\uC9D1\uBD80\uD130 \uD558\uC138\uC694.", day: ["\uC624\uB298 \uC758\uB8B0\uD310 \uC0C8\uB85C \uBD99\uC5C8\uC5B4\uC694.", "\uB2E4\uCE58\uBA74 \uC218\uB3C4\uC6D0 \uAC00\uC138\uC694. \uC870\uD569\uC740 \uCE58\uB8CC \uC548 \uD574\uC918\uC694."], night: ["\uC811\uC218\uB294 \uB0B4\uC77C \uC544\uCE68\uC5D0\uC694."] }
  },
  {
    id: "goram",
    role: "smith",
    name: "\uACE0\uB78C",
    title: "\uB300\uC7A5\uC7A5\uC774",
    day: [[0, "home"], [6, "smithy", "work"], [12, "inn_yard", "stand"], [13, "smithy", "work"], [20, "inn", "stand"], [23, "home"]],
    lines: { first: "\uBE48\uC190\uC774\uBA74 \uBCFC\uC77C \uC5C6\uB2E4. \uC1E0 \uAC00\uC838\uC640.", day: ["\uCE7C\uC740 \uD718\uB450\uB974\uB294 \uB188 \uC190 \uB530\uB77C \uB9DD\uAC00\uC9C0\uC9C0."], night: ["\u2026\uBD88 \uAEBC\uC84C\uB2E4. \uB0B4\uC77C \uC640."] }
  },
  {
    id: "miel",
    role: "inn",
    name: "\uBBF8\uC5D8",
    title: "\uC5EC\uAD00 \uC8FC\uC778",
    day: [[0, "inn", "stand"], [9, "stall_a", "work"], [11, "inn_yard", "work"], [24, "inn", "stand"]],
    lines: { first: "\uBC29\uC740 \uD558\uB8FB\uBC24 \uC740\uD654 \uC14B. \uC678\uC0C1\uC740 \uC548 \uB3FC\uC694. \uC815\uB9D0\uB85C\uC694.", day: ["\uB3D9\uAE30\uB4E4\uC740 \uBC8C\uC368 \uB098\uAC14\uC5B4\uC694. \uBD80\uC9C0\uB7F0\uD558\uC8E0."], night: ["\uB2A6\uC5C8\uB124\uC694. \uB530\uB73B\uD55C \uAD6D \uB0A8\uC558\uC5B4\uC694."] }
  },
  {
    id: "tino",
    role: "rival",
    name: "\uD2F0\uB178",
    title: "\uACAC\uC2B5 \uBAA8\uD5D8\uAC00",
    day: [[0, "home"], [6, "guild_board", "stand"], [8, "north_gate", "wander"], [17, "fountain_bench", "stand"], [19, "inn", "stand"], [23, "home"]],
    lines: { first: "\uB108\uB3C4 \uAC19\uC740 \uBC30\uB85C \uC654\uC9C0? \uB204\uAC00 \uBA3C\uC800 \uC815\uC2DD \uB418\uB098 \uBCF4\uC790.", day: ["\uB4E4\uAC1C \uC870\uC2EC\uD574. \uD574 \uC9C0\uBA74 \uB5BC\uB85C \uB2E4\uB140.", "\uB09C \uBC8C\uC368 \uC758\uB8B0 \uB450 \uAC1C \uD588\uB2E4."], night: ["\uB0B4\uC77C\uC740 \uBD81\uCABD \uACE0\uC6D0 \uAC00\uBCFC \uAC70\uC57C."] }
  },
  {
    id: "iva",
    name: "\uC774\uBC14",
    title: "\uACBD\uBE44\uB300\uC7A5",
    day: [[0, "plaza", "wander"], [6, "west_gate", "stand"], [10, "plaza", "wander"], [14, "quay", "wander"], [18, "north_gate", "stand"], [22, "plaza", "wander"]],
    lines: { first: "\uC678\uC9C0\uC778. \uBB38\uC81C \uC77C\uC73C\uD0A4\uBA74 \uB2E4\uC74C \uBC30\uB85C \uB3CC\uB824\uBCF4\uB0B8\uB2E4.", day: ["\uD604\uC0C1\uAE08 \uBD99\uC740 \uB188 \uBCF4\uBA74 \uC54C\uB824."], night: ["\uBC24\uC5D4 \uC131\uBB38 \uBC16\uC73C\uB85C \uD63C\uC790 \uB098\uAC00\uC9C0 \uB9C8."] }
  }
];
var JOBS = {
  vendor: { n: 3, day: (s) => [[0, "home"], [7, s, "work"], [18, "inn_yard", "wander"], [21, "home"]], lines: ["\uC2F1\uC2F1\uD574\uC694, \uBCF4\uACE0 \uAC00\uC694!", "\uC624\uB298 \uBC14\uB2E4\uAC00 \uC794\uC794\uD574\uC11C \uC0DD\uC120\uC774 \uB9CE\uC544\uC694."] },
  docker: { n: 4, day: () => [[0, "home"], [6, "pier_b", "work"], [12, "quay", "wander"], [13, "pier_a", "work"], [19, "inn", "wander"], [22, "home"]], lines: ["\uBE44\uCF1C, \uC9D0 \uB4E4\uC5B4\uAC04\uB2E4!", "\uD3ED\uD48D\uCCA0 \uC624\uAE30 \uC804\uC5D0 \uB2E4 \uC2E4\uC5B4\uC57C \uD574."] },
  folk: { n: 7, day: () => [[0, "home"], [8, "plaza", "wander"], [11, "stall_c", "wander"], [14, "fountain_bench", "wander"], [17, "quay", "wander"], [20, "home"]], lines: ["\uC870\uD569 \uC0AC\uB78C\uC774\uC5D0\uC694? \uB4E4\uAC1C \uC880 \uC5B4\uB5BB\uAC8C \uD574\uC918\uC694.", "\uB300\uC218 \uAF43\uC774 \uD544 \uB54C\uAC00 \uB410\uB294\uB370.", "\uC694\uC998 \uC720\uC801 \uCABD\uC5D0\uC11C \uC774\uC0C1\uD55C \uC18C\uB9AC\uAC00 \uB09C\uB300\uC694."] },
  kid: { n: 3, scale: 0.72, day: () => [[0, "home"], [9, "fountain_bench", "wander"], [13, "quay", "wander"], [16, "plaza", "wander"], [19, "home"]], lines: ["\uBAA8\uD5D8\uAC00\uB2E4! \uCE7C \uC788\uC5B4\uC694?", "\uBC14\uC704\uB0A0\uAC1C \uB465\uC9C0 \uBCF8 \uC801 \uC788\uC5B4\uC694?"] },
  guard: { n: 2, day: () => [[0, "north_gate", "stand"], [8, "plaza", "wander"], [16, "west_gate", "stand"]], lines: ["\uD1B5\uD589\uC99D \uC788\uB098?", "\uC218\uC0C1\uD55C \uAC74 \uBCF4\uACE0\uD574."] }
};
var NAMES = ["\uC624\uB80C", "\uD558\uB098", "\uD53C\uD2B8", "\uB8E8\uC0AC", "\uB378", "\uB9C8\uB974\uCF54", "\uBE44\uBE44", "\uC0AC\uC0E4", "\uD1A0\uB9C8", "\uC5D0\uB9B0", "\uB178\uC544", "\uCE74\uC774", "\uB80C", "\uC720\uB9AC", "\uB3C4\uB9B0", "\uD398\uC774", "\uC2E4\uB77C", "\uBCF4\uB974"];
function townsfolk() {
  const r = mulberry32(31), out2 = [];
  let k = 0;
  for (const [job, J] of Object.entries(JOBS)) for (let i = 0; i < J.n; i++) {
    const stall2 = ["stall_a", "stall_b", "stall_c"][i % 3];
    out2.push({
      id: `${job}${i}`,
      name: NAMES[k++ % NAMES.length],
      title: { vendor: "\uC0C1\uC778", docker: "\uBD80\uB450 \uC77C\uAFBC", folk: "\uC8FC\uBBFC", kid: "\uC544\uC774", guard: "\uACBD\uBE44\uBCD1" }[job],
      scale: J.scale ?? 0.94 + r() * 0.1,
      role: job === "vendor" ? "vendor" : void 0,
      day: J.day(stall2),
      lines: { day: J.lines, night: ["\uC774\uC81C \uB4E4\uC5B4\uAC00 \uBD10\uC57C\uC9C0."] },
      minor: true
    });
  }
  return out2;
}
var SHOW = 150;
var LOD0 = 26;
var SHADOW = 34;
var ANIM = 90;
var Townsfolk = class {
  constructor(scene, region, makeCharacter) {
    this.places = region.places;
    const B2 = BOUNDS;
    this.nav = World.kaelNav || new NavGrid(B2.x0, B2.z0, B2.x1, B2.z1, 2);
    const r = mulberry32(5), houses = [...TOWN.houses].sort(() => r() - 0.5);
    this.list = [...NAMED, ...townsfolk()].map((def, i) => {
      const appearance = resolveNpcAppearance(def);
      def.gender = appearance.gender;
      def.character = appearance.character;
      const ch = makeCharacter(appearance.character, {scale:def.scale ?? 1});
      scene.add(ch.group);
      const home = houses[i % Math.max(1, houses.length)]?.door ?? this.places.plaza;
      const a = r() * Math.PI * 2, rad = 1.2 + r() * 2.2;
      return {
        def,
        ch,
        home,
        jitter: [Math.cos(a) * rad, Math.sin(a) * rad],
        x: 0,
        y: 0,
        z: 0,
        yaw: r() * 6,
        path: null,
        pi: 0,
        entry: null,
        hidden: false,
        wait: 0,
        talkT: 0,
        lineI: 0,
        speed: 0,
        rnd: mulberry32(100 + i)
      };
    });
    this.queue = [];
  }
  entry(def, h) {
    let e = def.day[0];
    for (const d of def.day) if (d[0] <= h) e = d;
    return e;
  }
  spot(n, e) {
    if (e[1] === "home") return n.home;
    const p = this.places[e[1]] ?? this.places.plaza;
    return [p[0] + n.jitter[0], p[1] + n.jitter[1]];
  }
  // place everyone where their schedule says, without walking (load / time skip)
  settle(hour) {
    for (const n of this.list) {
      n.entry = this.entry(n.def, hour);
      const [x, z] = this.spot(n, n.entry);
      n.x = x;
      n.z = z;
      n.y = groundAt(x, z, 400);
      n.path = null;
      n.hidden = n.entry[1] === "home";
    }
  }
  goTo(n, x, z) {
    this.queue.push([n, x, z]);
  }
  update(dt, t, hour, player, camPos) {
    for (let k = 0; k < 3 && this.queue.length; k++) {
      const [n, x, z] = this.queue.shift();
      n.path = this.nav.path(n.x, n.z, x, z) ?? [[x, z]];
      n.pi = 0;
    }
    for (const n of this.list) {
      const e = this.entry(n.def, hour);
      if (e !== n.entry) {
        n.entry = e;
        const [x, z] = this.spot(n, e);
        if (n.hidden) {
          n.hidden = false;
          [n.x, n.z] = n.home;
          n.y = groundAt(n.x, n.z, 400);
        }
        this.goTo(n, x, z);
      }
      let moving = false;
      if (n.talkT > 0) {
        n.talkT -= dt;
        n.yaw = turn(n.yaw, Math.atan2(player.pos.x - n.x, player.pos.z - n.z), dt * 6);
      } else if (n.path && n.pi < n.path.length) {
        const [tx, tz] = n.path[n.pi], dx = tx - n.x, dz = tz - n.z, d2 = Math.hypot(dx, dz);
        const pd = Math.hypot(player.pos.x - n.x, player.pos.z - n.z);
        const blockedByPlayer = pd < 1.1 && dx * (player.pos.x - n.x) + dz * (player.pos.z - n.z) > 0;
        if (d2 < 0.3) n.pi++;
        else if (!blockedByPlayer) {
          const sp = 1.35 * (n.def.scale && n.def.scale < 0.8 ? 1.25 : 1), step = Math.min(d2, sp * dt);
          n.x += dx / d2 * step;
          n.z += dz / d2 * step;
          moving = true;
          n.yaw = turn(n.yaw, Math.atan2(dx, dz), dt * 5);
          n.y += (groundAt(n.x, n.z, n.y + 0.6) - n.y) * Math.min(1, dt * 12);
        }
        if (n.pi >= n.path.length) {
          n.path = null;
          if (n.entry[1] === "home") n.hidden = true;
          n.wait = 6 + n.rnd() * 14;
        }
      } else if (n.entry[2] === "wander" && (n.wait -= dt) <= 0) {
        const p = this.places[n.entry[1]] ?? this.places.plaza, a = n.rnd() * 6.28, r = 2 + n.rnd() * 9;
        this.goTo(n, p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r);
        n.wait = 1e9;
      }
      n.speed += ((moving ? 1.35 : 0) - n.speed) * Math.min(1, dt * 8);
      const d = Math.hypot(n.x - camPos.x, n.z - camPos.z), vis = !n.hidden && d < SHOW, g = n.ch.group;
      g.visible = vis;
      if (!vis) continue;
      g.position.set(n.x, n.y, n.z);
      g.rotation.y = n.yaw;
      n.ch.setLOD(d < LOD0 ? 0 : 1);
      n.ch.setShadow(d < SHADOW);
      n.ch.speed = n.speed;
      if (d < ANIM || (Math.floor(t * 10) + n.def.id.length) % 4 === 0) n.ch.animate(d < ANIM ? dt : dt * 4, t);
    }
  }
  // nearest person in front of the player within reach
  candidate(player) {
    let best = null, bd = 2.6;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    for (const n of this.list) {
      if (n.hidden) continue;
      const dx = n.x - player.pos.x, dz = n.z - player.pos.z, d = Math.hypot(dx, dz);
      if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.2) {
        bd = d;
        best = n;
      }
    }
    return best && { dist: bd, verb: "\uB300\uD654", label: best.def.name, act: () => this.talk(best, player) };
  }
  talk(n, player) {
    var _a;
    const met = (_a = Save.data).met ?? (_a.met = {}), L = n.def.lines, h = this.hour ?? 12;
    let line;
    const custom = this.lineFor?.(n.def);
    if (!met[n.def.id] && L.first) {
      line = L.first;
      met[n.def.id] = 1;
      Save.write();
    } else if (custom) line = custom;
    else {
      const pool = (h >= 20 || h < 6) && L.night ? L.night : L.day;
      line = pool[n.lineI++ % pool.length];
    }
    n.talkT = 5;
    n.ch.talk = 2.4;
    n.path && (n.wait = 0);
    this.onSay?.(n.def, line);
    Save.write();
  }
  // keep the player from walking through people
  pushPlayer(p) {
    for (const n of this.list) {
      if (n.hidden) continue;
      const dx = p.pos.x - n.x, dz = p.pos.z - n.z, d = Math.hypot(dx, dz), m = 0.62 * (n.def.scale ?? 1);
      if (d < m && d > 1e-4 && Math.abs(p.pos.y - n.y) < 1.5) {
        p.pos.x = n.x + dx / d * m;
        p.pos.z = n.z + dz / d * m;
      }
    }
  }
  labels(camera, player) {
    const out2 = [];
    for (const n of this.list) {
      if (n.hidden) continue;
      const d = Math.hypot(n.x - player.pos.x, n.z - player.pos.z);
      if (d > 11) continue;
      out2.push({ id: n.def.id, name: n.def.name, title: n.def.title, x: n.x, y: n.y + 1.95 * (n.def.scale ?? 1), z: n.z, d });
    }
    return out2;
  }
};
var turn = (a, b, k) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * Math.min(1, k);
};
var MAX_ACTIVE = 3;
var Guild = {
  get state() {
    return Save.data.guild;
  },
  board(day) {
    if (Save.data.board?.day === day) return Save.data.board.list;
    const r = mulberry32(day * 7919 + 13), pool = [...REQUEST_TEMPLATES].sort(() => r() - 0.5);
    const taken = new Set(Save.data.requests.map((q) => q.tpl));
    const list = pool.filter((t) => !taken.has(t.id)).slice(0, 5).map((t, k) => {
      const qty = t.qty[0] + Math.floor(r() * (t.qty[1] - t.qty[0] + 1));
      const base = 2 + ITEMS[t.item].value * qty * 1.5;
      const reward = Math.round(base * RISK[t.risk].mult);
      return { id: `d${day}_${k}`, tpl: t.id, title: t.title, giver: t.giver, item: t.item, qty, risk: t.risk, reward, desc: t.desc };
    });
    Save.data.board = { day, list };
    return list;
  },
  accept(q) {
    if (Save.data.requests.length >= MAX_ACTIVE || Save.data.requests.some((a) => a.id === q.id)) return false;
    Save.data.requests.push(q);
    Save.write();
    return true;
  },
  progress(q) {
    return Inventory.count(q.item);
  },
  isAccepted(q) {
    return Save.data.requests.some((a) => a.id === q.id);
  },
  ready(q) {
    return this.progress(q) >= q.qty;
  },
  readyList() {
    return Save.data.requests.filter((q) => this.ready(q));
  },
  turnIn() {
    const done = this.readyList();
    let pay = 0;
    for (const q of done) {
      if (q.item && !Inventory.take(q.item, q.qty)) continue;
      pay += q.reward;
      this.state.merit += q.risk;
      this.state.done++;
      Save.data.requests = Save.data.requests.filter((a) => a.id !== q.id);
    }
    Wallet.add(pay);
    Save.write();
    return { count: done.length, pay };
  },
  // the other newcomer keeps working whether you do or not
  advanceRival(day) {
    const rv = Save.data.rival;
    while (rv.day < day) {
      rv.day++;
      rv.done += 1 + Math.floor(mulberry32(rv.day * 31)() * 3);
    }
  }
};
var INN_PRICE = 3;
var Society = class {
  constructor({ ui, clock, folk, region }) {
    Object.assign(this, { ui, clock, folk, region });
    this.boardPos = region.places.guild_board;
  }
  line(def) {
    const G = Guild.state, rv = Save.data.rival;
    if (def.role === "guild") {
      if (!G.registered) return Save.data.met[def.id] ? "\uB4F1\uB85D\uBD80\uD130 \uD558\uC138\uC694. \uC774\uB984\uB9CC \uC4F0\uBA74 \uB3FC\uC694." : null;
      if (Guild.readyList().length) return "\uB2E4 \uD574\uC654\uC5B4\uC694? \uBCF4\uC5EC\uC918\uC694.";
      if (G.merit >= 6) return "\uC694\uC998 \uC2E4\uC801 \uAD1C\uCC2E\uB124\uC694. \uC774\uB300\uB85C\uBA74 \uC2EC\uC0AC \uBC1B\uC744 \uC218 \uC788\uACA0\uC5B4\uC694.";
    }
    if (def.role === "rival" && Save.data.met[def.id]) {
      return G.done > rv.done ? `\u2026${G.done}\uAC1C? \uC0DD\uAC01\uBCF4\uB2E4 \uBE60\uB974\uB124. \uB450\uACE0 \uBD10.` : `\uB09C \uBC8C\uC368 \uC758\uB8B0 ${rv.done}\uAC1C\uC9F8\uB2E4. \uB10C ${G.done}\uAC1C?`;
    }
    return null;
  }
  options(def) {
    const o = [];
    if (def.role === "guild") {
      if (!Guild.state.registered) o.push({ label: "\uACAC\uC2B5 \uB4F1\uB85D", act: () => this.register(def) });
      else {
        const n = Guild.readyList().length;
        if (n) o.push({ label: `\uC758\uB8B0 \uBCF4\uACE0 (${n})`, act: () => this.report(def) });
        o.push({ label: "\uC758\uB8B0\uD310 \uBCF4\uAE30", act: () => this.openBoard() });
      }
    }
    if (def.role === "smith") {
      for (const [id, it] of Object.entries(ITEMS)) if (it.kind === "weapon" && !Inventory.count(id))
        o.push({ label: `${it.name} \xB7 \uC740\uD654 ${it.price}`, act: () => this.buy(def, id) });
    }
    if (def.role === "inn") o.push({ label: `\uD558\uB8FB\uBC24 \uBB35\uAE30 \xB7 \uC740\uD654 ${INN_PRICE}`, act: () => this.sleep(def) });
    if (def.role === "vendor" && Inventory.entries().some(([id]) => ITEMS[id].kind === "material" && ITEMS[id].rarity === "common")) o.push({ label: "\uD754\uD55C \uC7AC\uB8CC \uD314\uAE30", act: () => this.sell(def) });
    return o;
  }
  register(def) {
    Guild.state.registered = true;
    Save.write();
    this.ui.say(def, "\uBC14\uB78C\uAE38 \uC870\uD569 \uACAC\uC2B5, \uB4F1\uB85D \uB05D. \uC758\uB8B0\uD310\uC740 \uBC14\uB85C \uC606\uC774\uC5D0\uC694. \uBCF4\uC218\uB294 \uC5EC\uAE30\uC11C \uBC1B\uC544\uC694.");
  }
  report(def) {
    const r = Guild.turnIn();
    this.ui.say(def, r.count ? `${r.count}\uAC74 \uD655\uC778\uD588\uC5B4\uC694. \uC740\uD654 ${r.pay}\uB2E2.` : "\uC544\uC9C1 \uB35C \uBAA8\uC558\uB124\uC694.");
  }
  buy(def, id) {
    const it = ITEMS[id];
    if (!Wallet.spend(it.price)) {
      this.ui.say(def, `${it.price}\uB2E2. \uBAA8\uC790\uB77C\uBA74 \uB3C8\uBD80\uD130 \uBC8C\uC5B4 \uC640.`);
      return;
    }
    Inventory.add(id, 1);
    Save.write();
    const E = Save.data.equip;
    this.onBought?.(id, !E.right ? "right" : !E.left ? "left" : null);
    this.ui.say(def, `${it.name}. \uD718\uB450\uB974\uB2E4 \uB0A0 \uB098\uAC00\uBA74 \uB2E4\uC2DC \uAC00\uC838\uC640.`);
  }
  sell(def) {
    let pay = 0;
    for (const [id, n] of Inventory.entries()) if (ITEMS[id].kind === "material" && ITEMS[id].rarity === "common") {
      pay += ITEMS[id].value * n;
      Inventory.take(id, n);
    }
    Wallet.add(pay);
    Save.write();
    this.ui.say(def, `\uC740\uD654 ${pay}\uB2E2. \uB2E4\uC74C\uC5D0 \uB610 \uC640\uC694.`);
  }
  sleep(def) {
    if (!Wallet.spend(INN_PRICE)) {
      this.ui.say(def, "\uC740\uD654 \uC14B\uC774\uC694. \uC678\uC0C1\uC740 \uC548 \uB3FC\uC694.");
      return;
    }
    this.ui.fade(() => {
      const c = this.clock;
      if (c.hour >= 7) c.day++;
      c.hour = 7;
      c.apply();
      Guild.advanceRival(c.day);
      this.folk.settle(c.hour);
      this.onSlept?.();
      Save.data.clock = { day: c.day, hour: c.hour };
      Save.write();
    }, `${this.clock.day + (this.clock.hour >= 7 ? 1 : 0)}\uC77C\uCC28 \uC544\uCE68`);
  }
  openBoard() {
    const list = Guild.board(this.clock.day);
    this.ui.openBoard(list, (q) => {
      Guild.accept(q);
      this.openBoard();
    });
  }
  boardCandidate(p) {
    const d = Math.hypot(p.pos.x - this.boardPos[0], p.pos.z - this.boardPos[1]);
    if (d > 2.8 || !Guild.state.registered) return null;
    return { dist: d, verb: "\uBCF4\uAE30", label: "\uC758\uB8B0\uD310", act: () => this.openBoard() };
  }
  goal() {
    const G = Guild.state;
    const ready = Guild.readyList();
    if (ready.length) return `의뢰 보고하기 (${ready.length}건)`;
    const q = Save.data.requests[0];
    if (q) return `${q.title} · ${ITEMS[q.item].name} ${Math.max(0, Math.min(Guild.progress(q), q.qty))}/${q.qty}`;
    if (G.registered && !Save.data.equip?.right && !Save.data.equip?.left && G.done >= 1) return "선택: 고람의 대장간에서 무기 마련하기";
    return "자유 탐험 · 채집·거래·대화·모험 중 원하는 활동을 해보자";
  }
};
var COL = { steel: [0.8, 0.84, 0.88], dark: [0.36, 0.3, 0.26], wood: [0.5, 0.38, 0.26], brass: [0.72, 0.58, 0.34] };
function colored(geo, col) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  const n = geo.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set(col, i * 3);
  geo.setAttribute("aCol", new BufferAttribute(c, 3));
  return geo;
}
function merge(parts) {
  const geos = parts.map(([g2, col2, m]) => colored(g2.applyMatrix4(m ?? new Matrix4()), col2));
  const n = geos.reduce((a, g2) => a + g2.attributes.position.count, 0), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g2 of geos) {
    pos.set(g2.attributes.position.array, o);
    nor.set(g2.attributes.normal.array, o);
    col.set(g2.attributes.aCol.array, o);
    o += g2.attributes.position.array.length;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("normal", new BufferAttribute(nor, 3));
  g.setAttribute("aCol", new BufferAttribute(col, 3));
  return g;
}
var T = (x, y, z, rx = 0, ry = 0, rz = 0, s = [1, 1, 1]) => new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(rx, ry, rz)), new Vector3(...s));
function blade(len, w, th) {
  const g = new CylinderGeometry(w, w, len, 4, 1).applyMatrix4(T(0, len / 2, 0, 0, Math.PI / 4, 0, [1, 1, th / w]));
  const tip = new ConeGeometry(w, w * 2.6, 4).applyMatrix4(T(0, len + w * 1.3, 0, 0, Math.PI / 4, 0, [1, 1, th / w]));
  return [g, tip];
}
var MODELS = {
  dagger: () => {
    const [b, t] = blade(0.2, 0.022, 6e-3);
    return merge([[b, COL.steel], [t, COL.steel], [new BoxGeometry(0.09, 0.016, 0.022), COL.brass], [new CylinderGeometry(0.014, 0.016, 0.1, 6), COL.dark, T(0, -0.055, 0)], [new SphereGeometry(0.02, 6, 4), COL.brass, T(0, -0.11, 0)]]);
  },
  sword: () => {
    const [b, t] = blade(0.62, 0.026, 7e-3);
    return merge([[b, COL.steel], [t, COL.steel], [new BoxGeometry(0.16, 0.02, 0.03), COL.brass], [new CylinderGeometry(0.015, 0.017, 0.15, 6), COL.dark, T(0, -0.08, 0)], [new SphereGeometry(0.024, 6, 4), COL.brass, T(0, -0.16, 0)]]);
  },
  axe: () => merge([
    [new CylinderGeometry(0.017, 0.02, 0.5, 6), COL.wood, T(0, 0.12, 0)],
    [new BoxGeometry(0.03, 0.09, 0.05), COL.dark, T(0, 0.33, 0.01)],
    [new CylinderGeometry(0.075, 0.075, 0.016, 12, 1, false, 0, Math.PI), COL.steel, T(0, 0.33, 0.04, Math.PI / 2, 0, 0, [1.1, 1, 1])]
  ])
};
function maktwoAttackSpec(model, dur = 0.7) {
  const ratio = model === "axe" ? [0.36, 0.34, 2.16, 1.24] : model === "sword" ? [0.31, 0.36, 2.16, 1.24] : [0.27, 0.25, 1.73, 1.08];
  const [wind, swing, back, follow] = ratio;
  const reference = wind + swing + (model === "axe" ? 0.36 : model === "sword" ? 0.33 : 0.32);
  const scale = dur / reference;
  return { windup: wind * scale, swing: swing * scale, recover: Math.max(0.08, dur - (wind + swing) * scale), back, follow };
}
function maktwoAttackPose(a) {
  if (!a) return null;
  const spec = a.spec || maktwoAttackSpec(a.w?.model, a.dur);
  const ease3 = (v) => {
    const t = clamp2(v, 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  };
  const time = a.t, charge = ease3(time / spec.windup);
  const travel = ease3((time - spec.windup) / spec.swing);
  const release = (a.contact?.time ?? spec.windup + spec.swing) + (a.contact?.time !== void 0 ? 0.065 : 0);
  const settle = 1 - ease3((time - release) / spec.recover);
  const arc = time < spec.windup ? 0.27 + (spec.back - 0.27) * charge : a.contact?.arc ?? spec.back - (spec.back + spec.follow) * travel;
  const pull = time < spec.windup ? charge : 1 - ease3(travel / 0.43);
  const extension = a.contact ? a.contact.extension : Math.sin(Math.PI * travel);
  const recoil = a.contact ? Math.sin(Math.PI * clamp2((time - a.contact.time) / 0.13, 0, 1)) : 0;
  return {
    side: a.hand === "right" ? 1 : -1,
    weight: charge * settle,
    arc: (0.27 + (arc - 0.27) * settle) * (a.hand === "right" ? 1 : -1),
    pull: pull * settle,
    extension: extension * settle,
    recoil,
    travel,
    yaw: a.aimYaw || 0,
    pitch: a.aimPitch || 0
  };
}
function maktwoWorldRay(origin, dir, limit) {
  const steps = Math.max(1, Math.ceil(limit / 0.16));
  for (let j = 1; j <= steps; j++) {
    const d = limit * j / steps, x = origin.x + dir.x * d, y = origin.y + dir.y * d, z = origin.z + dir.z * d;
    if (y < sample(x, z) + 0.055) return d;
    for (const o of query(x, z, 0.04)) {
      if (y <= o.bot + 0.03 || y >= o.top - 0.03) continue;
      if (inside(o, x, z, 0.015)) return d;
    }
  }
  return limit;
}
function shiftCameraWithinWorld(camera, x, y, z) {
  const distance = Math.hypot(x, y, z);
  if (distance < 1e-3) return;
  const direction = { x: x / distance, y: y / distance, z: z / distance };
  const margin = 0.075;
  const room = maktwoWorldRay(camera.position, direction, distance + margin);
  const fraction = clamp2((room - margin) / distance, 0, 1);
  camera.position.x += x * fraction;
  camera.position.y += y * fraction;
  camera.position.z += z * fraction;
}
function maktwoAttackCamera(camera, swing, motion) {
  if (!swing || motion <= 0) return;
  const pose = maktwoAttackPose(swing);
  const cy = Math.cos(camera.rotation.y), sy = Math.sin(camera.rotation.y);
  const cp = Math.cos(camera.rotation.x), sp = Math.sin(camera.rotation.x);
  const forward = pose.extension * 0.21 - pose.pull * 0.11 - pose.recoil * 0.085;
  const right = pose.arc * pose.weight * 0.055;
  const up = -pose.weight * 0.036;
  shiftCameraWithinWorld(
    camera,
    (-sy * cp * forward + cy * right + sy * sp * up) * motion,
    (sp * forward + cp * up) * motion,
    (-cy * cp * forward - sy * right + cy * sp * up) * motion
  );
  camera.rotation.y -= pose.arc * pose.weight * 0.23 * motion;
  camera.rotation.x = clamp2(camera.rotation.x + (pose.pull * 0.061 - pose.extension * 0.1 + pose.recoil * 0.032) * motion, -1.55, 1.55);
}
var ViewModel = class {
  constructor(camera) {
    this.root = new Group();
    this.camera = camera;
    camera.add(this.root);
    this.mat = makeLitMaterial({ vhead: (
      /* glsl */
      `attribute vec3 aCol; varying vec3 vCol;`
    ), vbody: (
      /* glsl */
      `vCol=aCol;`
    ), head: (
      /* glsl */
      `varying vec3 vCol;`
    ), body: (
      /* glsl */
      `alb=vCol; ao=1.;`
    ) });
    this.hands = {};
    for (const side of ["right", "left"]) {
      const g = new Group();
      this.root.add(g);
      this.hands[side] = { g, weapon: null, len: 0 };
    }
    this.trailN = 14;
    this.trail = [];
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(new Float32Array(this.trailN * 2 * 3), 3));
    geo.setAttribute("aA", new BufferAttribute(new Float32Array(this.trailN * 2), 1));
    const idx = [];
    for (let i = 0; i < this.trailN - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    this.trailMesh = new Mesh(geo, new ShaderMaterial({
      vertexShader: "attribute float aA; varying float vA; void main(){ vA=aA; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }",
      fragmentShader: "varying float vA; void main(){ gl_FragColor=vec4(vec3(.85,.97,1.),vA*.55); }",
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide
    }));
    this.trailMesh.frustumCulled = false;
    this.root.add(this.trailMesh);
    this.bob = 0;
  }
  setWeapon(side, def) {
    const h = this.hands[side];
    if (h.weapon) {
      h.g.remove(h.weapon);
      h.weapon.geometry.dispose();
      h.weapon = null;
    }
    if (def?.model) {
      h.weapon = new Mesh(MODELS[def.model](), this.mat);
      h.weapon.frustumCulled = false;
      h.weapon.position.set(0, 0.03, 0);
      h.g.add(h.weapon);
      h.len = def.model === "sword" ? 0.7 : def.model === "axe" ? 0.4 : 0.26;
    } else h.len = 0;
  }
  update(dt, swing, moving, visible) {
    this.root.visible = visible;
    this.bob += dt * (moving ? 7.5 : 1.6);
    const by = Math.sin(this.bob * 2) * (moving ? 9e-3 : 3e-3);
    const bx = Math.sin(this.bob) * (moving ? 8e-3 : 2e-3);
    for (const [side, h] of Object.entries(this.hands)) {
      const sign2 = side === "right" ? 1 : -1, active = Boolean(swing && swing.hand === side);
      const p = active ? maktwoAttackPose(swing) : null;
      const weight = p?.weight ?? 0, pull = p?.pull ?? 0, extension = p?.extension ?? 0, recoil = p?.recoil ?? 0;
      const arc = active ? p.arc : 0;
      const idleAngle = -sign2 * 0.38;
      const angle = active ? idleAngle + (arc - idleAngle) * weight : idleAngle;
      const portrait = clamp2((this.camera.aspect || 1) * 0.78, 0.5, 1);
      const yaw = -angle * portrait;
      h.g.position.set(
        sign2 * (0.5 - 0.34 * weight + 0.27 * pull) + bx,
        -0.43 + 0.14 * weight + 0.17 * pull + 0.07 * extension + by,
        -0.68 - 0.48 * weight - 0.18 * extension + 0.35 * pull + 0.09 * recoil
      );
      h.g.rotation.order = "YXZ";
      h.g.rotation.set(
        -1.03 + pull * 0.33 - extension * 0.1 + recoil * 0.03,
        yaw,
        sign2 * (0.07 + 0.1 * weight)
      );
      if (h.len > 0) {
        this.camera.updateMatrixWorld(true);
        const origin = this.camera.localToWorld(h.g.position.clone());
        const axis = new Vector3(0, 1, 0).applyEuler(h.g.rotation);
        const direction = axis.clone().transformDirection(this.camera.matrixWorld);
        const reach = h.len + 0.12;
        const room = maktwoWorldRay(origin, { x: direction.x, y: direction.y, z: direction.z }, reach);
        const retract = Math.max(0, reach - room);
        if (retract > 0) h.g.position.addScaledVector(axis, -retract);
      }
    }
    const geo = this.trailMesh.geometry, pos = geo.attributes.position, al = geo.attributes.aA;
    const hand = swing && this.hands[swing.hand];
    const pose = swing ? maktwoAttackPose(swing) : null;
    const striking = Boolean(hand && hand.len > 0 && pose?.travel > 0 && pose.travel < 1 && pose.weight > 0.45);
    if (striking) {
      hand.g.updateMatrix();
      const tip = new Vector3(0, hand.len, 0).applyMatrix4(hand.g.matrix);
      const mid = new Vector3(0, hand.len * 0.48, 0).applyMatrix4(hand.g.matrix);
      this.trail.unshift([tip, mid]);
      if (this.trail.length > this.trailN) this.trail.pop();
    } else if (this.trail.length) this.trail.splice(0, Math.min(3, this.trail.length));
    this.trailMesh.visible = this.trail.length > 1;
    for (let i = 0; i < this.trailN; i++) {
      const entry = this.trail[Math.min(i, this.trail.length - 1)];
      const alpha = i < this.trail.length ? 1 - i / this.trailN : 0;
      if (entry) {
        pos.setXYZ(i * 2, entry[0].x, entry[0].y, entry[0].z);
        pos.setXYZ(i * 2 + 1, entry[1].x, entry[1].y, entry[1].z);
      }
      al.setX(i * 2, alpha);
      al.setX(i * 2 + 1, alpha * 0.2);
    }
    pos.needsUpdate = al.needsUpdate = true;
  }
};
var Combat = class {
  constructor({ player, rig, ui, view, onDown }) {
    var _a;
    Object.assign(this, { player, rig, ui, view, onDown });
    this.max = 100;
    this.hp = Save.data.hp ?? 100;
    this.swing = null;
    this.next = "right";
    this.queued = false;
    this.calm = 0;
    this.downed = false;
    (_a = Save.data).equip ?? (_a.equip = { right: null, left: null });
    this.refresh();
  }
  weapon(hand) {
    const id = Save.data.equip[hand];
    return id ? ITEMS[id] : FISTS;
  }
  refresh() {
    this.view.setWeapon("right", this.weapon("right"));
    this.view.setWeapon("left", this.weapon("left"));
  }
  equip(id, hand) {
    const E = Save.data.equip;
    for (const h of ["right", "left"]) if (E[h] === id) E[h] = null;
    E[hand] = id;
    Save.write();
    this.refresh();
  }
  unequip(id) {
    const E = Save.data.equip;
    for (const h of ["right", "left"]) if (E[h] === id) E[h] = null;
    Save.write();
    this.refresh();
  }
  canAct() {
    return !this.downed && this.player.mode === "walk" && !this.player.swimming;
  }
  attack() {
    if (!this.canAct()) return;
    if (this.swing) {
      this.queued = true;
      return;
    }
    const R = this.weapon("right"), L = this.weapon("left");
    let hand = this.next;
    if (R !== FISTS && L === FISTS) hand = "right";
    else if (L !== FISTS && R === FISTS) hand = "left";
    this.next = hand === "right" ? "left" : "right";
    const w = this.weapon(hand), dur = 1.15 / w.rate;
    this.swing = { hand, w, t: 0, dur, spec: maktwoAttackSpec(w.model, dur), contact: null, hit: false };
  }
  strike(a, progress) {
    const p = this.player, spec = a.spec, side = a.hand === "right" ? 1 : -1;
    const arc = spec.back - (spec.back + spec.follow) * progress;
    const yaw = p.yaw - arc * side, pitch = p.pitch;
    const cp = Math.cos(pitch), dir = { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
    const origin = { x: p.pos.x, y: p.pos.y + PLAYER.height - 0.18, z: p.pos.z };
    const reach = a.w.reach * (0.84 + 0.16 * Math.sin(progress * Math.PI));
    const solid = maktwoWorldRay(origin, dir, reach);
    if (solid >= reach - 1e-3) return false;
    a.contact = { time: a.t, arc, distance: solid, extension: clamp2((solid - a.w.reach * 0.75) / 0.62, 0, 0.85) };
    return true;
  }
  hurt(dmg, src) {
    if (this.downed || this.player.mode !== "walk") return;
    this.hp = Math.max(0, this.hp - dmg);
    this.calm = 0;
    this.rig.dipV -= 0.7;
    this.ui.hurt(this.hp / this.max, dmg / this.max);
    if (this.hp <= 0) this.down();
  }
  down() {
    this.downed = true;
    this.swing = null;
    const lost = Math.floor(Wallet.get() * 0.2);
    Wallet.spend(lost);
    this.ui.fade(() => {
      this.hp = this.max;
      this.onDown?.(lost);
      this.downed = false;
      this.ui.hurt(1, 0);
    }, "\uC4F0\uB7EC\uC84C\uB2E4\u2026");
  }
  update(dt) {
    const s = this.swing;
    if (s) {
      const old = s.t;
      s.t += dt;
      const spec = s.spec;
      const finish2 = (s.contact ? s.contact.time + 0.065 : spec.windup + spec.swing) + spec.recover;
      if (s.t >= finish2) {
        this.swing = null;
        if (this.queued) {
          this.queued = false;
          this.attack();
        }
      } else if (!s.contact && s.t >= spec.windup && old < spec.windup + spec.swing) {
        const start = clamp2((old - spec.windup) / spec.swing, 0, 1);
        const end = clamp2((s.t - spec.windup) / spec.swing, 0, 1);
        const ease3 = (v) => {
          v = clamp2(v, 0, 1);
          return v * v * v * (v * (v * 6 - 15) + 10);
        };
        const steps = Math.max(1, Math.ceil((ease3(end) - ease3(start)) * (spec.back + spec.follow) / 0.085));
        for (let i = 1; i <= steps; i++) {
          const progress = ease3(start + (end - start) * i / steps);
          if (this.strike(s, progress)) break;
        }
      }
    }
    this.calm += dt;
    if (this.calm > 6 && this.hp < this.max) {
      this.hp = Math.min(this.max, this.hp + dt * 4);
      this.ui.hurt(this.hp / this.max, 0);
    }
    Save.data.hp = Math.round(this.hp);
  }
};
var hud = new Hud();
addEventListener("error", (e) => hud.error("\uC624\uB958: " + (e.message || e)));
var nextFrame2 = () => new Promise((r) => requestAnimationFrame(() => r()));
var Minimap = class {
  constructor(canvas2, region) {
    this.canvas = canvas2;
    this.ctx = canvas2.getContext("2d", { alpha: false });
    this.region = region;
    this.size = 128;
    this.tileSize = 160;
    this.ppm = this.size / 220;
    this.tile = document.createElement("canvas");
    this.tile.width = this.tile.height = this.tileSize;
    this.tctx = this.tile.getContext("2d", { alpha: false });
    this.cx = Number.NaN;
    this.cz = Number.NaN;
    this.lastDraw = -Infinity;
  }
  point(x, z) {
    return [(x - this.cx) * this.ppm + this.tileSize / 2, (z - this.cz) * this.ppm + this.tileSize / 2];
  }
  rebuild(x, z) {
    this.cx = Math.round(x / 16) * 16;
    this.cz = Math.round(z / 16) * 16;
    const ctx = this.tctx, n = this.tileSize, im = ctx.createImageData(n, n), data = im.data;
    const mask = World.mask, gn = GRID_N, cell = CFG.cell, half = HALF;
    for (let j = 0; j < n; j++) {
      const wz = this.cz + (j - n / 2) / this.ppm;
      for (let i = 0; i < n; i++) {
        const wx = this.cx + (i - n / 2) / this.ppm;
        const h = sampleClamped(wx, wz);
        const gi = Math.min(gn - 1, Math.max(0, Math.round((wx + half) / cell)));
        const gj = Math.min(gn - 1, Math.max(0, Math.round((wz + half) / cell)));
        const m = (gj * gn + gi) * 4;
        let r, g, b;
        if (h < 0) {
          r = 33;
          g = 81;
          b = 105;
        } else if (h < 3) {
          r = 143;
          g = 149;
          b = 130;
        } else if (h < 28) {
          r = 66;
          g = 100;
          b = 79;
        } else if (h < 76) {
          r = 88;
          g = 113;
          b = 95;
        } else {
          r = 120;
          g = 132;
          b = 120;
        }
        if (mask) {
          if (mask[m + 3] > 140) {
            r = 127;
            g = 137;
            b = 134;
          } else if (mask[m + 1] > 145) {
            r = 159;
            g = 158;
            b = 126;
          } else if (mask[m] > 145) {
            r = 154;
            g = 145;
            b = 117;
          }
        }
        const k = (j * n + i) * 4;
        data[k] = r;
        data[k + 1] = g;
        data[k + 2] = b;
        data[k + 3] = 255;
      }
    }
    ctx.putImageData(im, 0, 0);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const road of [...(World.roads || []), ...(World.kaelPaths || [])]) {
      if (!road.pts || road.pts.length < 2) continue;
      ctx.beginPath();
      for (let i = 0; i < road.pts.length; i++) {
        const p = this.point(road.pts[i][0], road.pts[i][1]);
        if (!i) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      }
      ctx.strokeStyle = "rgba(227,223,190,.79)";
      ctx.lineWidth = Math.max(1.5, road.width * this.ppm * 0.8);
      ctx.stroke();
    }
    for (const terrace of TERRACES) {
      ctx.beginPath();
      terrace.poly.forEach((p, i) => {
        const q = this.point(p[0], p[1]);
        if (!i) ctx.moveTo(q[0], q[1]);
        else ctx.lineTo(q[0], q[1]);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(185,190,174,.25)";
      ctx.fill();
      ctx.strokeStyle = "rgba(232,237,221,.69)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    for (const building of [...BUILDINGS, ...SKYLINE_BUILDINGS]) {
      const p = this.point(building.x, building.z);
      if (p[0] < -16 || p[0] > n + 16 || p[1] < -16 || p[1] > n + 16) continue;
      ctx.save();
      ctx.translate(p[0], p[1]);
      ctx.rotate(-(building.yaw || 0));
      ctx.fillStyle = "#c3bca8";
      ctx.fillRect(-building.w * this.ppm / 2, -building.d * this.ppm / 2, building.w * this.ppm, building.d * this.ppm);
      ctx.strokeStyle = "rgba(32,55,58,.65)";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(-building.w * this.ppm / 2, -building.d * this.ppm / 2, building.w * this.ppm, building.d * this.ppm);
      ctx.restore();
    }
    for (const pier2 of PIERS) {
      const a = this.point(pier2.a[0], pier2.a[1]), b = this.point(pier2.b[0], pier2.b[1]);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.strokeStyle = "#ad9876";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
  }
  update(player, now) {
    if (now - this.lastDraw < 90) return;
    this.lastDraw = now;
    const { x, z } = player.pos;
    if (!Number.isFinite(this.cx) || Math.hypot(x - this.cx, z - this.cz) > 20) this.rebuild(x, z);
    const ctx = this.ctx, n = this.size;
    ctx.clearRect(0, 0, n, n);
    const sx = (this.tileSize - n) / 2 + (x - this.cx) * this.ppm;
    const sy = (this.tileSize - n) / 2 + (z - this.cz) * this.ppm;
    ctx.drawImage(this.tile, sx, sy, n, n, 0, 0, n, n);
    const found = typeof Save !== "undefined" && Array.isArray(Save.data?.waypoints) ? Save.data.waypoints : [];
    for (const w of this.region.waypoints || []) {
      if (!found.includes(w.name)) continue;
      const px2 = n / 2 + (w.x - x) * this.ppm, py2 = n / 2 + (w.z - z) * this.ppm;
      if (Math.hypot(px2 - n / 2, py2 - n / 2) > n * 0.44) continue;
      ctx.beginPath();
      ctx.arc(px2, py2, 3.1, 0, Math.PI * 2);
      ctx.fillStyle = "#e3ece6";
      ctx.fill();
      ctx.strokeStyle = "#356b78";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (this.target) {
      const dx = (this.target.x - x) * this.ppm, dz = (this.target.z - z) * this.ppm;
      const len = Math.hypot(dx, dz), max = n * 0.41;
      const px2 = n / 2 + dx * Math.min(1, max / Math.max(1, len));
      const py2 = n / 2 + dz * Math.min(1, max / Math.max(1, len));
      ctx.beginPath();
      ctx.arc(px2, py2, 4.4, 0, Math.PI * 2);
      ctx.fillStyle = "#a7ebe5";
      ctx.strokeStyle = "#143b4b";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(n / 2, n / 2);
    ctx.rotate(-player.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3.8);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fillStyle = "#f7ffff";
    ctx.strokeStyle = "rgba(11,44,56,.94)";
    ctx.lineWidth = 2.3;
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }
};
var WorldMapPanel = class {
  constructor({ player, region, onTravel, onClose = () => {
  }, onTarget = () => {
  } }) {
    this.player = player;
    this.region = region;
    this.onTravel = onTravel;
    this.onClose = onClose;
    this.onTarget = onTarget;
    this.root = document.getElementById("worldMap");
    this.stage = document.getElementById("worldMapStage");
    this.canvas = document.getElementById("worldMapCanvas");
    this.ctx = this.canvas.getContext("2d", { alpha: false });
    this.zoom = 1;
    this.cx = 0;
    this.cz = 0;
    this.selected = null;
    this.target = null;
    this.raster = null;
    this.pointers = /* @__PURE__ */ new Map();
    this.dragged = false;
    this.lastRender = 0;
    this.needsDraw = true;
    this.els = { position: document.getElementById("mapPosition"), count: document.getElementById("mapDiscovered"), list: document.getElementById("mapWaypoints"), name: document.getElementById("mapSelectedName"), desc: document.getElementById("mapSelectedDesc"), target: document.getElementById("mapTargetBtn"), travel: document.getElementById("mapTravelBtn"), scale: document.getElementById("mapScale") };
    document.getElementById("mapClose").addEventListener("click", () => this.close());
    document.getElementById("mapZoomIn").addEventListener("click", () => this.changeZoom(1.45));
    document.getElementById("mapZoomOut").addEventListener("click", () => this.changeZoom(1 / 1.45));
    document.getElementById("mapRecenter").addEventListener("click", () => this.recenter());
    this.els.target.addEventListener("click", () => {
      if (!this.selected) return;
      this.target = { ...this.selected };
      this.onTarget(this.target.name);
      this.updateDetails();
      this.draw();
    });
    this.els.travel.addEventListener("click", () => {
      const w = this.selected;
      if (w?.kind !== "waypoint" || !this.discovered().some((v) => v.name === w.name)) return;
      this.onTravel(w.name);
      this.close();
    });
    this.stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.changeZoom(e.deltaY < 0 ? 1.23 : 1 / 1.23);
    }, { passive: false });
    this.stage.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      e.preventDefault();
      this.stage.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) this.dragged = false;
      if (this.pointers.size === 2) {
        const a = [...this.pointers.values()];
        this.pinchDistance = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        this.dragged = true;
      }
    });
    this.stage.addEventListener("pointermove", (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size >= 2) {
        const a = [...this.pointers.values()], dist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        if (this.pinchDistance > 0 && dist > 0) this.changeZoom(dist / this.pinchDistance);
        this.pinchDistance = dist;
        this.dragged = true;
      } else if (Math.abs(dx) + Math.abs(dy) > 0) {
        this.cx -= dx / this.scale();
        this.cz -= dy / this.scale();
        this.clampCenter();
        if (Math.abs(dx) + Math.abs(dy) > 2) this.dragged = true;
        this.draw();
      }
    });
    const end = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const canSelect = this.pointers.size === 1 && !this.dragged && e.type === "pointerup";
      this.pointers.delete(e.pointerId);
      this.pinchDistance = 0;
      if (canSelect) this.selectAt(e.clientX, e.clientY);
    };
    this.stage.addEventListener("pointerup", end);
    this.stage.addEventListener("pointercancel", end);
    addEventListener("resize", () => {
      if (this.isOpen()) this.draw();
    });
  }
  isOpen() {
    return !this.root.hidden;
  }
  discovered() {
    const found = Array.isArray(Save.data?.waypoints) ? Save.data.waypoints : [];
    return (this.region.waypoints || []).filter((w) => found.includes(w.name));
  }
  open() {
    document.querySelectorAll(".panel").forEach((p) => p.hidden = true);
    this.root.hidden = false;
    this.els.position.textContent = `X ${Math.round(this.player.pos.x)} \xB7 Z ${Math.round(this.player.pos.z)}`;
    this.cx = 0;
    this.cz = 0;
    this.zoom = 1;
    this.refreshList();
    this.updateDetails();
    this.draw();
    document.getElementById("mapClose").focus({ preventScroll: true });
  }
  close() {
    if (!this.isOpen()) return;
    this.root.hidden = true;
    this.pointers.clear();
    this.onClose();
    document.getElementById("hudMapOpen").focus({ preventScroll: true });
  }
  scale() {
    const w = this.stage.clientWidth || 1, h = this.stage.clientHeight || 1;
    return Math.max(0.01, Math.min(w, h) * 0.88 / (HALF * 2) * this.zoom);
  }
  changeZoom(factor) {
    this.zoom = Math.max(1, Math.min(14, this.zoom * factor));
    this.clampCenter();
    this.draw();
  }
  recenter() {
    this.cx = this.player.pos.x;
    this.cz = this.player.pos.z;
    this.zoom = Math.max(1.65, this.zoom);
    this.clampCenter();
    this.draw();
  }
  clampCenter() {
    const b = HALF * 1.06;
    this.cx = Math.max(-b, Math.min(b, this.cx));
    this.cz = Math.max(-b, Math.min(b, this.cz));
  }
  screen(x, z) {
    const s = this.scale();
    return [(x - this.cx) * s + this.stage.clientWidth / 2, (z - this.cz) * s + this.stage.clientHeight / 2];
  }
  world(px2, py2) {
    const s = this.scale();
    return { x: this.cx + (px2 - this.stage.clientWidth / 2) / s, z: this.cz + (py2 - this.stage.clientHeight / 2) / s };
  }
  selectAt(clientX, clientY) {
    const rect = this.stage.getBoundingClientRect(), x = clientX - rect.left, y = clientY - rect.top;
    const found = this.discovered();
    let hit = null, best = 24;
    for (const w of found) {
      const [sx, sy] = this.screen(w.x, w.z), d = Math.hypot(x - sx, y - sy);
      if (d < best) {
        best = d;
        hit = w;
      }
    }
    if (hit) this.selectWaypoint(hit);
    else {
      const p = this.world(x, y);
      if (Math.abs(p.x) > HALF || Math.abs(p.z) > HALF) return;
      this.selected = { kind: "pin", name: "\uC784\uC2DC \uD45C\uC2DD", x: Math.round(p.x), z: Math.round(p.z) };
      this.refreshList();
      this.updateDetails();
      this.draw();
    }
  }
  selectWaypoint(w) {
    this.selected = { name: w.name, x: w.x, z: w.z, kind: "waypoint" };
    this.cx = w.x;
    this.cz = w.z;
    this.zoom = Math.max(this.zoom, 1.8);
    this.clampCenter();
    this.refreshList();
    this.updateDetails();
    this.draw();
  }
  refreshList() {
    const found = this.discovered();
    this.els.count.textContent = `\uBC1C\uACAC ${found.length} / ${(this.region.waypoints || []).length}`;
    const nodes = found.map((w) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = w.name;
      b.setAttribute("aria-pressed", String(this.selected?.kind === "waypoint" && this.selected.name === w.name));
      const dist = document.createElement("small");
      dist.textContent = `${Math.round(Math.hypot(w.x - this.player.pos.x, w.z - this.player.pos.z))}m`;
      b.append(dist);
      b.addEventListener("click", () => this.selectWaypoint(w));
      return b;
    });
    if (!nodes.length) {
      const e = document.createElement("span");
      e.className = "world-map-empty";
      e.textContent = "\uBC1C\uACAC\uD55C \uC6E8\uC774\uD3EC\uC778\uD2B8\uAC00 \uC5C6\uC5B4";
      nodes.push(e);
    }
    this.els.list.replaceChildren(...nodes);
  }
  updateDetails() {
    const s = this.selected;
    this.els.name.textContent = s?.name || "\uC9C0\uB3C4\uB97C \uB20C\uB7EC \uC120\uD0DD";
    const dist = s ? Math.round(Math.hypot(s.x - this.player.pos.x, s.z - this.player.pos.z)) : 0;
    this.els.desc.textContent = s ? `${s.kind === "pin" ? "\uC0AC\uC6A9\uC790 \uC9C0\uC815 \uC704\uCE58" : "\uBC1C\uACAC\uD55C \uC6E8\uC774\uD3EC\uC778\uD2B8"} \xB7 \uD604\uC7AC \uC704\uCE58\uC5D0\uC11C ${dist}m` : "\uBC1C\uACAC\uD55C \uC9C0\uC810\uC744 \uC120\uD0DD\uD558\uAC70\uB098 \uC9C0\uB3C4\uB97C \uB20C\uB7EC \uD45C\uC2DD\uC744 \uB0A8\uAE38 \uC218 \uC788\uC5B4";
    this.els.target.disabled = !s;
    this.els.target.textContent = s && this.target && s.x === this.target.x && s.z === this.target.z ? "\uD45C\uC2DC \uC911" : "\uBAA9\uC801\uC9C0 \uD45C\uC2DC";
    this.els.travel.disabled = !(s?.kind === "waypoint" && this.discovered().some((w) => w.name === s.name));
  }
  makeRaster() {
    if (this.raster) return;
    const c = document.createElement("canvas"), n = 384;
    c.width = c.height = n;
    const ctx = c.getContext("2d", { alpha: false }), image = ctx.createImageData(n, n), d = image.data;
    const mask = World.mask, gn = GRID_N, cell = CFG.cell;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -HALF + (i + 0.5) * HALF * 2 / n, z = -HALF + (j + 0.5) * HALF * 2 / n;
      const h = sampleClamped(x, z);
      const gi = Math.max(0, Math.min(gn - 1, Math.round((x + HALF) / cell))), gj = Math.max(0, Math.min(gn - 1, Math.round((z + HALF) / cell))), m = (gj * gn + gi) * 4;
      let r = 43, g = 76, b = 95;
      if (h >= 0) {
        if (h < 4) {
          r = 173;
          g = 166;
          b = 140;
        } else if (h < 26) {
          r = 88;
          g = 131;
          b = 110;
        } else if (h < 70) {
          r = 106;
          g = 145;
          b = 123;
        } else {
          r = 137;
          g = 157;
          b = 140;
        }
        const shade2 = Math.max(-14, Math.min(15, (h % 21 - 10) * 0.55));
        r += shade2;
        g += shade2;
        b += shade2;
        if (mask) {
          if (mask[m + 3] > 140) {
            r = 157;
            g = 162;
            b = 151;
          } else if (mask[m + 1] > 145) {
            r = 166;
            g = 165;
            b = 135;
          } else if (mask[m] > 145) {
            r = 169;
            g = 154;
            b = 126;
          }
        }
      }
      const o = (j * n + i) * 4;
      d[o] = r;
      d[o + 1] = g;
      d[o + 2] = b;
      d[o + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    this.raster = c;
  }
  draw() {
    if (!this.isOpen()) return;
    const w = Math.max(1, Math.round(this.stage.clientWidth)), h = Math.max(1, Math.round(this.stage.clientHeight));
    const dpr = Math.min(1.5, devicePixelRatio || 1), pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#203c50";
    ctx.fillRect(0, 0, w, h);
    this.makeRaster();
    const [ix, iz] = this.screen(-HALF, -HALF), s = this.scale(), full = 2 * HALF * s;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.raster, ix, iz, full, full);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const road of [...(World.roads || []), ...(World.kaelPaths || [])]) {
      if (!road.pts || road.pts.length < 2) continue;
      ctx.beginPath();
      road.pts.forEach((p, i) => {
        const [x, y] = this.screen(p[0], p[1]);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.strokeStyle = "rgba(233,223,183,.75)";
      ctx.lineWidth = Math.max(0.85, Math.min(9, (road.width || 4) * s * 0.85));
      ctx.stroke();
    }
    for (const t of TERRACES) {
      ctx.beginPath();
      t.poly.forEach((p, i) => {
        const [x, y] = this.screen(p[0], p[1]);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(211,212,193,.30)";
      ctx.fill();
      ctx.strokeStyle = "rgba(234,233,217,.61)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (this.zoom >= 1.55) {
      for (const b of [...BUILDINGS, ...SKYLINE_BUILDINGS]) {
        const [x, y] = this.screen(b.x, b.z);
        if (x < -30 || x > w + 30 || y < -30 || y > h + 30) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-(b.yaw || 0));
        ctx.fillStyle = "#e4d9c5";
        ctx.fillRect(-(b.w || 5) * s / 2, -(b.d || 5) * s / 2, (b.w || 5) * s, (b.d || 5) * s);
        ctx.restore();
      }
    }
    for (const pier2 of PIERS) {
      const [x, y] = this.screen(pier2.a[0], pier2.a[1]), [ex, ey] = this.screen(pier2.b[0], pier2.b[1]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = "#baa987";
      ctx.lineWidth = Math.max(1.5, 4 * s);
      ctx.stroke();
    }
    if (this.target) {
      const [tx, ty] = this.screen(this.target.x, this.target.z), [px3, py3] = this.screen(this.player.pos.x, this.player.pos.z);
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.moveTo(px3, py3);
      ctx.lineTo(tx, ty);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = "rgba(175,244,230,.83)";
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const mark of this.discovered()) {
      const [x, y] = this.screen(mark.x, mark.z);
      if (x < -40 || y < -40 || x > w + 40 || y > h + 40) continue;
      const selected = this.selected?.kind === "waypoint" && this.selected.name === mark.name;
      ctx.beginPath();
      ctx.arc(x, y, selected ? 7 : 5.2, 0, Math.PI * 2);
      ctx.fillStyle = selected ? "#adebdc" : "#f7ffff";
      ctx.fill();
      ctx.strokeStyle = "#264f62";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = "600 11px " + getComputedStyle(document.documentElement).fontFamily;
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(13,37,43,.88)";
      ctx.strokeText(mark.name, x, y - 15);
      ctx.fillStyle = "#f7ffff";
      ctx.fillText(mark.name, x, y - 15);
    }
    if (this.selected?.kind === "pin") {
      const [x, y] = this.screen(this.selected.x, this.selected.z);
      ctx.strokeStyle = "#dff9ed";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.moveTo(x - 12, y);
      ctx.lineTo(x + 12, y);
      ctx.moveTo(x, y - 12);
      ctx.lineTo(x, y + 12);
      ctx.stroke();
    }
    const [px2, py2] = this.screen(this.player.pos.x, this.player.pos.z);
    ctx.save();
    ctx.translate(px2, py2);
    ctx.rotate(-this.player.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(7, 9);
    ctx.lineTo(0, 5);
    ctx.lineTo(-7, 9);
    ctx.closePath();
    ctx.fillStyle = "#c0fff8";
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = "#193e4d";
    ctx.stroke();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    const metres = Math.round(100 / this.scale());
    this.els.scale.textContent = `\uBD81\uCABD \u2191 \xB7 100px \u2248 ${metres}m`;
  }
  update(now) {
    if (!this.isOpen() || now - this.lastRender < 250) return;
    this.lastRender = now;
    this.els.position.textContent = `X ${Math.round(this.player.pos.x)} \xB7 Z ${Math.round(this.player.pos.z)}`;
    this.updateDetails();
    this.draw();
  }
};
async function boot() {
  const canvas2 = document.getElementById("view");
  const renderer = new WebGLRenderer({ canvas: canvas2, antialias: true, powerPreference: "high-performance" });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.toneMapping = NoToneMapping;
  const scene = new Scene();
  const camera = new PerspectiveCamera(65, innerWidth / innerHeight, 0.2, 14e3);
  camera.rotation.order = "YXZ";
  hud.progress(0.01, "\uC9C8\uAC10\uC744 \uADF8\uB9AC\uB294 \uC911");
  await nextFrame2();
  shared.uNoise.value = makeNoiseTexture();
  shared.uStroke.value = makeStrokeTexture();
  const anisotropy = Math.min(IS_MOBILE ? 2 : 8, renderer.capabilities.getMaxAnisotropy());
  shared.uNoise.value.anisotropy = anisotropy;
  shared.uStroke.value.anisotropy = anisotropy;
  const region = SERNBELD;
  Save.load();
  if (discardLegacyAnimalTasks(Save.data)) Save.write();
  if (!Save.data.combatDemoSwordGranted) {
    if (Inventory.count("apprentice_sword") === 0) Inventory.add("apprentice_sword", 1);
    Save.data.combatDemoSwordGranted = true;
    Save.write();
  }
  if (!Save.data.combatVisualDemoEquipped) {
    const eq = Save.data.equip ?? (Save.data.equip = { right: null, left: null });
    if (!eq.right && !eq.left && Inventory.count("apprentice_sword") > 0) eq.right = "apprentice_sword";
    Save.data.combatVisualDemoEquipped = true;
    Save.write();
  }
  await generateWorld(region, (p, t) => hud.progress(p, t));
  shared.uSunDir.value.copy(World.sun);
  shared.uHeight.value = World.heightTex;
  shared.uMask.value = World.maskTex;
  shared.uBake.value = World.bakeTex;
  hud.progress(0.96, "\uD48D\uACBD\uC744 \uC138\uC6B0\uB294 \uC911");
  await nextFrame2();
  scene.add(makeSky());
  const tmat = makeTerrainMaterial();
  const terrain = new TerrainLOD(scene, tmat);
  scene.add(makeFarRing(tmat));
  const ocean = makeOcean();
  scene.add(ocean);
  const rivers = makeRivers();
  scene.add(rivers);
  const blockout = buildBlockout(region);
  scene.add(blockout);
  const kael = buildKael(region);
  scene.add(kael);
  const cutstoneBridge = createCutstoneBridge(scene, region.landmarks.find((l) => l.kind === "arcade"));
  const waypoints = buildWaypoints(region);
  scene.add(waypoints);
  const sun = new SunShadow(scene, World.sun);
  hud.progress(0.97, "\uC232\uC744 \uAC00\uAFB8\uB294 \uC911");
  await nextFrame2();
  const veg = scatterVegetation(region);
  const leafTex = makeLeafAtlas();
  const forest = new Forest(scene, renderer, veg.trees, leafTex);
  const greatTree = buildGreatTree(region.landmarks.find((l) => l.kind === "great_tree"), leafTex);
  scene.add(greatTree);
  const rocks = new Rocks(scene, veg.rocks);
  const grass = new Grass(scene, makeGrassAtlas());
  const nodes = scatterGatherables(region, veg.trees, shared.uNoise.value);
  const gatherables = new Gatherables(scene, nodes, Save);
  const input = new Input(canvas2, { stickEl: hud.el.stick, jumpEl: hud.el.jump, atkEl: document.getElementById("atk"), onAnyInput: () => hud.hideHint() });
  if (IS_MOBILE) document.getElementById("atk").hidden = false;
  const player = new Player();
  const miniMap = new Minimap(document.getElementById("miniMap"), region);
  const rig = new CameraRig(camera);
  const ui = new GameUI();
  const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
  const teleport = (t) => {
    if (t.fly && player.mode !== "fly") player.setMode("fly");
    if (!t.fly && player.mode === "fly") player.setMode("walk");
    const portraitView = !!t.photo && IS_MOBILE && innerHeight > innerWidth;
    const px2 = portraitView ? t.lookAt[0] + (t.x - t.lookAt[0]) * 1.35 : t.x;
    const pz2 = portraitView ? t.lookAt[1] + (t.z - t.lookAt[1]) * 1.35 : t.z;
    const py2 = portraitView ? t.y + 45 : t.y;
    player.teleport(px2, pz2, yawTo(px2, pz2, t.lookAt[0], t.lookAt[1]), t.pitch ?? 0, t.fly ? py2 : null);
    gatherables.refresh();
  };
  const explore = new Explore({ region, player, gatherables, waypoints, ui, teleport });
  const fullMap = new WorldMapPanel({
    player,
    region,
    onTravel: (name) => explore.travelTo(name),
    onTarget: () => {
      miniMap.target = fullMap.target;
      miniMap.lastDraw = -Infinity;
    }
  });
  document.getElementById("hudMapOpen").addEventListener("click", () => {
    if (fullMap.isOpen()) fullMap.close();
    else fullMap.open();
  });
  hud.progress(0.985, "\uB9C8\uC744 \uC0AC\uB78C\uB4E4\uC774 \uAE68\uC5B4\uB098\uB294 \uC911");
  await nextFrame2();
  const clock = new GameClock(Save.data.clock.day, Save.data.clock.hour);
  clock.apply();
  const characterTypes={Group,Bone,Skeleton,SkinnedMesh,BufferGeometry,BufferAttribute,ShaderMaterial,Vector3,Quaternion,Euler,Color,DoubleSide};
  hud.progress(.988,"캐릭터를 준비하는 중");
  await nextFrame2();
  const studioSource=await loadStudioSource();
  const studioFactory=createStudioGeometry(studioSource);
  const makeCharacter=(profile,options)=>createStudioModel(characterTypes,studioFactory,profile,options);
  const folk = new Townsfolk(scene, region, makeCharacter);
  folk.settle(clock.hour);
  const society = new Society({ ui, clock, folk, region });
  Guild.advanceRival(clock.day);
  folk.lineFor = (def) => society.line(def);
  folk.onSay = (def, line) => ui.say(def, line, society.options(def));
  ui.activeIds = () => Save.data.requests.map((q) => q.id);
  explore.providers.push((p) => folk.candidate(p), (p) => society.boardCandidate(p));
  scene.add(camera);
  const regionEntries = folk.list.map((n, i) => ({
    id: 'resident:' + region.id + ':' + i, kind: 'resident', ref: n,
    getState: () => ({lineI: n.lineI}),
    setState: state => { if (Number.isSafeInteger(state.lineI) && state.lineI >= 0) n.lineI = state.lineI; },
    setActive: active => { n.ch.group.visible = active && !n.hidden; }
  }));
  WorldRegions.mount(region.id, regionEntries);
  const view = new ViewModel(camera);
  const combat = new Combat({ player, rig, ui, view, onDown: (lost) => {
    const m = region.places.monastery;
    teleport({ x: m[0], z: m[1], lookAt: [m[0], m[1] - 12] });
    clock.hour += 6;
    if (clock.hour >= 24) {
      clock.hour -= 24;
      clock.day++;
    }
    clock.apply();
    folk.settle(clock.hour);
    ui.say({ name: "\uC5D0\uB2E4 \uC218\uB140", title: "\uC218\uB3C4\uC6D0 \uC57D\uCD08\uD559\uC790" }, lost ? `\uB4E4\uD310\uC5D0\uC11C \uC2E4\uB824 \uC654\uC5B4\uC694. \uCE58\uB8CC\uBE44\uB85C \uC740\uD654 ${lost}\uB2E2 \uBC1B\uC558\uC5B4\uC694. \uBB34\uB9AC\uD558\uC9C0 \uB9C8\uC138\uC694.` : "\uB4E4\uD310\uC5D0\uC11C \uC2E4\uB824 \uC654\uC5B4\uC694. \uBB34\uB9AC\uD558\uC9C0 \uB9C8\uC138\uC694.");
    Save.write();
  } });
  const avatars=createCharacterRuntime({T:characterTypes,scene,camera,player,Save,makeCharacter,view,height:PLAYER.height,
    makeWeapon:id=>ITEMS[id]?.model?new Mesh(MODELS[ITEMS[id].model](),view.mat):null,
    attackPose:maktwoAttackPose,worldRay:maktwoWorldRay});
  society.onBought = (id, hand) => {
    if (hand) combat.equip(id, hand);
  };
  ui.onEquip = (id, hand) => combat.equip(id, hand);
  ui.onUnequip = (id) => combat.unequip(id);
  ui.hurt(combat.hp / combat.max, 0);
  ui.onInteract = () => explore.interact();
  const toggleFly = () => player.setMode(player.mode === "fly" ? "walk" : "fly");
  ui.setTravel((body) => {
    const wp = region.waypoints.map((w) => {
      const on = Save.data.waypoints.includes(w.name), b = document.createElement("button");
      b.type = "button";
      b.disabled = !on;
      b.innerHTML = `${w.name}<small>${on ? "\uC774\uB3D9" : "\uBBF8\uBC1C\uACAC"}</small>`;
      b.addEventListener("click", () => {
        explore.travelTo(w.name);
        ui.close(ui.travel);
      });
      return b;
    });
    const dev = region.teleports.map((t) => {
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = `${t.name}<small>\uBC14\uB85C \uAC00\uAE30</small>`;
      b.addEventListener("click", () => {
        teleport(t);
        ui.close(ui.travel);
      });
      return b;
    });
    const fly = document.createElement("button");
    fly.type = "button";
    fly.innerHTML = `${player.mode === "fly" ? "\uAC77\uAE30\uB85C \uB3CC\uC544\uAC00\uAE30" : "\uC790\uC720 \uBE44\uD589"}<small>F</small>`;
    fly.addEventListener("click", () => {
      toggleFly();
      ui.close(ui.travel);
    });
    const MOTION = [[1, "\uBCF4\uD1B5"], [0.4, "\uC57D\uD558\uAC8C"], [0, "\uB044\uAE30"]];
    const motion = document.createElement("button");
    motion.type = "button";
    const cur = MOTION.findIndex((m) => m[0] === Save.data.settings.motion);
    motion.innerHTML = `\uD654\uBA74 \uD754\uB4E4\uB9BC<small>${MOTION[Math.max(0, cur)][1]}</small>`;
    motion.addEventListener("click", () => {
      const nx = MOTION[(Math.max(0, cur) + 1) % 3];
      Save.data.settings.motion = rig.motion = nx[0];
      Save.write();
      ui.renderTravel();
    });
    const viewMode=document.createElement('button');viewMode.type='button';
    viewMode.innerHTML=`시점 전환<small>${avatars.mode==='third'?'3인칭 · 공격 반동 잠금':'1인칭'}</small>`;
    viewMode.onclick=()=>{avatars.setThird(avatars.mode!=='third');ui.renderTravel();};
    const characterButton=document.createElement('button');characterButton.type='button';
    characterButton.innerHTML='내 캐릭터<small>얼굴 · 체형 · 장식</small>';
    characterButton.onclick=()=>{ui.close(ui.travel);avatars.openChooser();};
    const reset = document.createElement("button");
    reset.type = "button";
    reset.innerHTML = "\uCC98\uC74C\uBD80\uD130 \uB2E4\uC2DC<small>\uC800\uC7A5 \uC0AD\uC81C</small>";
    reset.addEventListener("click", () => {
      if (confirm("\uAC00\uBC29\uACFC \uBC1C\uACAC\uD55C \uC6E8\uC774\uD3EC\uC778\uD2B8\uAC00 \uBAA8\uB450 \uC9C0\uC6CC\uC9D1\uB2C8\uB2E4.")) {
        Save.reset();
        location.reload();
      }
    });
    const list = (items) => {
      const d = document.createElement("div");
      d.className = "travel-list";
      d.append(...items);
      return d;
    };
    const sec = (t) => {
      const p = document.createElement("p");
      p.className = "section";
      p.textContent = t;
      return p;
    };
    body.replaceChildren(sec("\uC6E8\uC774\uD3EC\uC778\uD2B8"), list(wp), sec("\uC124\uC815"), list([motion,viewMode,characterButton]), sec("\uAC80\uC218\uC6A9"), list([...dev, fly, reset]));
  });
  rig.motion = Save.data.settings.motion;
  const sp = Save.data.pos, firstLaunch = !Save.data.intro;
  if (firstLaunch) teleport({ ...region.arrival });
  else if (sp) player.teleport(sp[0], sp[2], Save.data.yaw);
  else teleport({ ...region.spawn });
  miniMap.update(player, performance.now());
  const persist = () => {
    Save.data.pos = [player.pos.x, player.pos.y, player.pos.z];
    Save.data.yaw = player.yaw;
    Save.data.clock = { day: clock.day, hour: clock.hour };
    Save.write();
  };
  setInterval(() => {
    if (player.mode === "walk" && !player.swimming) persist();
  }, 15e3);
  addEventListener("visibilitychange", () => {
    if (document.hidden && player.mode === "walk") persist();
  });
  const resize = () => {
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, CFG.dprMax));
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    rig.setBaseFov(65);
    camera.updateProjectionMatrix();
    const h = innerHeight * renderer.getPixelRatio(), p11 = camera.projectionMatrix.elements[5];
    greatTree.userData.setViewport(h, p11);
    gatherables.setViewport(h, p11);
  };
  addEventListener("resize", resize);
  resize();
  terrain.update(player.pos.x, player.pos.z, player.pos.y);
  hud.ready(region);
  if (firstLaunch) ui.intro([
    "바닷바람을 따라 도착한 카엘 항구.",
    "이곳 사람들은 저마다 만들고, 거래하고, 자신의 길을 찾아 나선다.",
    "어떤 삶을 살지는 정해져 있지 않다. 먼저 주변을 둘러봐도 좋다."
  ], () => {
    Save.data.intro = true;
    Save.write();
  });
  if(!Save.data.characterCreated) avatars.openChooser(true);
  let last = performance.now();
  const tick = (now) => {
    const dt = Math.min(0.1, (now - last) / 1e3);
    last = now;
    const t = now / 1e3;
    if(avatars.isOpen){
      input.keys.clear();input.stick.x=input.stick.y=0;
      input.consumeLook();input.consumeAttack();input.consumeToggles();input.jumpQueued=false;
      return;
    }
    shared.uTime.value = t;
    for (const code of input.consumeToggles()) {
      if (fullMap.isOpen() && code !== "Escape" && code !== "KeyM") continue;
      if (code === "KeyF") toggleFly();
      else if (code === "KeyE" && player.mode === "walk") explore.interact();
      else if (code === "KeyM") {
        if (fullMap.isOpen()) fullMap.close();
        else fullMap.open();
      } else if (code === "Escape") {
        if (fullMap.isOpen()) fullMap.close();
        else {
          ui.close(ui.bag);
          ui.close(ui.travel);
          ui.close(ui.boardP);
        }
      } else if (!fullMap.isOpen() && code === "KeyI") ui.toggleBag();
    }
    clock.update(dt);
    folk.hour = clock.hour;
    if (fullMap.isOpen()) {
      input.keys.clear();
      input.stick.x = input.stick.y = 0;
      input.consumeLook();
      input.consumeAttack();
      input.jumpQueued = false;
    } else {
      if (input.consumeAttack() && ui.bag.hidden && ui.travel.hidden && ui.boardP.hidden) combat.attack();
      player.look(input);
      for (let rem = dt; rem > 1e-4; rem -= 1 / 60) player.update(Math.min(1 / 60, rem), input);
    }
    cutstoneBridge.update(player.pos.x, player.pos.z, now);
    miniMap.update(player, now);
    fullMap.update(now);
    if (WorldRegions.isActive(region.id)) folk.pushPlayer(player);
    rig.update(dt, player);
    if (WorldRegions.isActive(region.id)) {
      folk.update(dt, t, clock.hour, player, camera.position);
    }
    combat.update(dt);
    if (player.mode === "walk" && avatars.mode === "first") maktwoAttackCamera(camera, combat.swing, rig.motion);
    view.update(dt, combat.swing, Math.hypot(player.vel.x, player.vel.z) > 0.5, player.mode === "walk");
    avatars.update(dt,t,combat);
    avatars.applyThirdCamera(dt,rig);
    avatars.updateTrail(combat);
    explore.update();
    terrain.update(camera.position.x, camera.position.z, camera.position.y);
    sun.update(camera.position.x, camera.position.z, player.yaw);
    forest.update(camera.position);
    rocks.update(camera.position);
    grass.update(camera.position);
    gatherables.update(player.pos);
    ocean.position.set(Math.round(camera.position.x / 64) * 64, CFG.seaLevel, Math.round(camera.position.z / 64) * 64);
    rivers.userData.update(t);
    blockout.userData.update(t);
    waypoints.userData.update(t);
    renderer.render(scene, camera);
    hud.tick(dt, renderer.info.render, player.pos);
    ui.setClock(clock.label);
    ui.setGoal(society.goal());
    ui.setLabels(WorldRegions.isActive(region.id) ? folk.labels(camera, player) : [], camera);
  };
  renderer.setAnimationLoop(tick);
  window.__dev = { avatars,characterTypes,studioFactory, cutstoneBridge, fullMap, miniMap, collidersAt, groundAt, occupiedAt, renderer, scene, camera, player, input, rig, World, teleport, region, entities: WorldEntities, regions: WorldRegions, events: GameEvents, inventory: Inventory, skills: {validate:validateSkill, compile:compileSkill, library:SkillLibrary}, forest, veg, nodes, explore, ui, Save, clock, folk, society, Guild, combat, frame: () => tick(performance.now()) };
}
boot().catch((e) => {
  console.error(e);
  hud.error("\uCD08\uAE30\uD654 \uC2E4\uD328: " + e.message);
});
