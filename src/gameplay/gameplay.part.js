import {loadStudioSource,loadStudioLod} from './src/entities/character/studio-source.js';
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
import {createSkillWorkbench} from './src/ui/skill-workbench.js';
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
  // Preserve all triangles and attributes, but let camera/shadow frusta
  // reject spatial batches independently. Collision registration is unchanged.
  meshChunks(mat2, cell = 80) {
    const chunks = new Map();
    for (let i = 0; i < this.t.length; i += 3) {
      const p = i * 3;
      const x = (this.p[p] + this.p[p + 3] + this.p[p + 6]) / 3;
      const z = (this.p[p + 2] + this.p[p + 5] + this.p[p + 8]) / 3;
      const key = Math.floor(x / cell) + ":" + Math.floor(z / cell);
      let chunk = chunks.get(key);
      if (!chunk) chunks.set(key, chunk = new Geo());
      for (let k = 0; k < 9; k++) {
        chunk.p.push(this.p[p + k]); chunk.n.push(this.n[p + k]); chunk.c.push(this.c[p + k]);
      }
      for (let k = 0; k < 3; k++) chunk.t.push(this.t[i + k]);
    }
    return Array.from(chunks.values(), chunk => chunk.mesh(mat2));
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
            box2(G, bx, base, bz, 1.6, t.y - 1.4 - base, 0.9, yaw, C.stoneD, PAT.stone);
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
        box2(G, x, y, z, w, h, depth, 0, plaster, PAT.timber);
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
    box2(G, b.x, y - 0.55, b.z, b.w + 2, 1.2, b.w + 2, 0, C.stoneL, PAT.stone, true);
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
    box2(G, x, y - 0.65, z + 3.4, w, 0.7, 3.9, 0, C.stoneL, PAT.stone, true);
    for (let j = 0; j < 4; j++) {
      const fx = x - w * 0.38 + j * w * 0.25;
      box2(G, fx, y + 0.2, z + 5.15, 0.45, 1.2, 0.45, 0, C.stoneL, PAT.stone);
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
    box2(G, x, y, z, 4.2 * s, 0.65, 2.9 * s, 0, C.stoneL, PAT.stone);
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
        box2(G, supp[0], base, supp[2], 1.55, top - base - 0.2, 1.5, yaw, C.stoneL, PAT.stone);
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
  g.add(...G.meshChunks(townMaterial(DoubleSide)));
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
  setResolution(size) {
    const shadow = this.light.shadow;
    if (shadow.mapSize.x === size) return;
    shadow.mapSize.set(size, size);
    // Three only allocates the target when it has no shadow map.
    shadow.map?.dispose();
    shadow.map = null;
  }
  update(x, z, yaw) {
    const E = CFG.shadowExtent, c = this.c;
    c.set(x - Math.sin(yaw) * E * 0.55, 0, z - Math.cos(yaw) * E * 0.55);
    c.y = sample(c.x, c.z);
    const texel = 2 * E / this.light.shadow.mapSize.x;
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
// Graphics settings never alter interaction reach, collision, or game time.
var GRAPHICS = Object.freeze({
  high: Object.freeze({dpr:CFG.dprMax, floor:IS_MOBILE ? .85 : 1, terrainSplit:.85, terrainCache:140, trees:1, grass:1, rocks:1, npcRange:105, npcDetail:1, shadowScale:1, shadowMs:IS_MOBILE ? 32 : 0}),
  medium: Object.freeze({dpr:IS_MOBILE ? 1.25 : 1.5, floor:.75, terrainSplit:.76, terrainCache:120, trees:.86, grass:.85, rocks:.88, npcRange:100, npcDetail:.86, shadowScale:.5, shadowMs:0}),
  low: Object.freeze({dpr:1, floor:.65, terrainSplit:.65, terrainCache:100, trees:.70, grass:.70, rocks:.75, npcRange:85, npcDetail:.70, shadowScale:.25, shadowMs:0})
});
function graphicsKey(value) {
  return Object.hasOwn(GRAPHICS, value) ? value : IS_MOBILE ? "medium" : "high";
}
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
    this.nearRange = NEAR;
  }
  setQuality(q) {
    this.nearRange = NEAR * q.trees;
    const fade = [this.nearRange - FADE, this.nearRange];
    for (const p of this.parts) {
      p.barkMat.uniforms.uFade.value.set(...fade);
      p.leafMat.uniforms.uFade.value.set(...fade);
    }
    this.impostors.material.uniforms.uFade.value.set(...fade);
    this.last = [Infinity, Infinity];
  }
  update(cam) {
    if (Math.hypot(cam.x - this.last[0], cam.z - this.last[1]) < 10) return;
    this.last = [cam.x, cam.z];
    for (const n of this.near) n.bark.count = n.leaves.count = 0;
    this.grid.query(cam.x, cam.z, this.nearRange + 12, (t) => {
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
      return { m, cell, radius, inner };
    });
  }
  setQuality(q) {
    // Preserve nearby grass; trim only the distant decorative ring.
    for (const r of this.rings) {
      const radius = r.inner === 0 ? r.radius : Math.max(r.inner + 1, r.radius * q.grass);
      const side = Math.ceil(2 * radius / r.cell) + 2, u = r.m.material.uniforms;
      r.m.geometry.instanceCount = side * side;
      u.uSide.value = side;
      u.uRadius.value = radius;
    }
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
    this.range = RANGE;
  }
  setQuality(q) {
    this.range = RANGE * q.rocks;
    this.last = [Infinity, Infinity];
  }
  update(cam) {
    if (Math.hypot(cam.x - this.last[0], cam.z - this.last[1]) < 12) return;
    this.last = [cam.x, cam.z];
    for (const o of this.meshes) o.m.count = 0;
    this.grid.query(cam.x, cam.z, this.range, (r) => {
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
    this.nextRespawn = Infinity;
  }
  setViewport(h, p11) {
    this.points.material.uniforms.uScale.value = h * p11 * 0.5;
  }
  refresh() {
    this.last = [Infinity, Infinity];
  }
  update(cam) {
    const now = Date.now();
    if (Math.hypot(cam.x - this.last[0], cam.z - this.last[1]) < 8 && now < this.nextRespawn) return;
    this.last = [cam.x, cam.z];
    this.nextRespawn = Infinity;
    for (const m of Object.values(this.meshes)) m.count = 0;
    const picked = this.save.data.picked, near = this.near = [];
    const pos = this.points.geometry.attributes.position, seed = this.points.geometry.attributes.aSeed;
    this.grid.query(cam.x, cam.z, RANGE2, (n) => {
      if (!isAvailable(n, picked, now)) {
        this.nextRespawn = Math.min(this.nextRespawn, picked[n.id] + GATHER[n.type].respawn * 1000 + 1);
        return;
      }
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
      const moveSide = !this.lookOnly && touch && e.clientX < innerWidth * 0.5 && ![...touches.values()].some((t) => t.kind === "move");
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
      if (!this.lookOnly && !t.touch && e.type === "pointerup" && t.travel < 6 && performance.now() - t.t0 < 350) this.attackQueued = true;
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
    this.previousPos = new Vector3();
    this.renderPos = new Vector3();
    this.accumulator = 0;
    this.simTime = 0;
    this.moveHeading = null;
    this.nearby = [];
    this.renderReady = false;
    this.stepRise = 0;
  }
  teleport(x, z, yaw, pitch = 0, y = null) {
    const spawn=this.mode==="fly"&&y!=null?{x,y,z}:playerSafeSpawn(x,z,y);
    this.pos.set(spawn.x,spawn.y,spawn.z);
    this.vel.set(0, 0, 0);
    this.wish.set(0, 0);
    this.yaw = yaw;
    this.pitch = pitch;
    this.onGround = y == null || (this.mode==="walk"&&Math.abs(this.pos.y-playerFloor(this.pos.x,this.pos.z,this.pos.y+CONTACT_SKIN))<=CONTACT_SKIN);
    this.swimming = false;
    this.running = false;
    this.landImpact = 0;
    this.moveHeading=null;this.stepRise=0;
    this.resetInterpolation();
    this.teleportId++;
  }
  resetInterpolation(){
    this.accumulator=0;this.previousPos.copy(this.pos);this.renderPos.copy(this.pos);this.visualY=this.pos.y;this.renderReady=true;
  }
  // Fixed physics ticks; interpolate only the presentation, never collision.
  advance(dt,input,nearby=[]){
    this.nearby=nearby;
    if(!this.renderReady)this.resetInterpolation();
    const h=1/60;
    let rise=0;
    this.accumulator=Math.min(.1,this.accumulator+Math.max(0,dt));
    while(this.accumulator+1e-9>=h){
      this.previousPos.copy(this.pos);
      this.update(h,input);
      rise=Math.max(rise,this.stepRise);
      this.accumulator=Math.max(0,this.accumulator-h);
    }
    this.stepRise=rise;
    const a=Math.min(1,this.accumulator/h);
    this.renderPos.copy(this.previousPos).lerp(this.pos,a);
    if(this.mode==="walk"&&this.onGround&&!this.swimming){
      // Smooth the vertical presentation of ALL low steps, not just stairs.
      // Keep it bounded so landing and ledge departures cannot float.
      const target=this.renderPos.y,old=this.visualY??target;
      this.visualY=clamp2(target+(old-target)*Math.exp(-Math.max(0,dt)*23),target-.13,target+.13);
      this.renderPos.y=this.visualY;
    }else this.visualY=this.renderPos.y;
    // Interpolation cannot put the rendered actor under the newly reached
    // tread or terrain. Camera smoothing remains presentation-only.
    if(this.mode==="walk"){
      const ground=playerFloor(this.renderPos.x,this.renderPos.z,Math.max(this.previousPos.y,this.pos.y)+CONTACT_SKIN,0);
      this.renderPos.y=Math.max(this.renderPos.y,playerTerrain(this.renderPos.x,this.renderPos.z),ground);
      this.visualY=this.renderPos.y;
    }
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
    dt=clamp2(dt,0,.08);if(!dt)return;
    this.simTime+=dt;
    // A restored position or a changed terrain cell may start below the
    // surface. Terrain is solid; the downward-crossing test alone cannot
    // recover from an already invalid starting state.
    const terrainHere=playerTerrain(this.pos.x,this.pos.z);
    if(this.pos.y<terrainHere-CONTACT_SKIN){
      const safe=playerSafeSpawn(this.pos.x,this.pos.z,terrainHere);
      this.pos.set(safe.x,safe.y,safe.z);this.vel.y=0;this.onGround=true;this.swimming=false;
      this.previousPos.copy(this.pos);
    }
    const mv=input.move(),sy=Math.sin(this.yaw),cy=Math.cos(this.yaw);
    this.running=input.run()&&mv.mag>.1;
    const sp=this.swimming?(this.running?3.6:2.6):this.running?PLAYER.run:PLAYER.walk;
    const tx=(-sy*mv.y+cy*mv.x)*sp,tz=(-cy*mv.y-sy*mv.x)*sp;
    const blend=1-Math.exp(-dt*(this.swimming?4:this.onGround?12:2.5));
    this.vel.x+=(tx-this.vel.x)*blend;this.vel.z+=(tz-this.vel.z)*blend;
    if(mv.mag<.02&&Math.hypot(this.vel.x,this.vel.z)<.025){this.vel.x=0;this.vel.z=0;}
    const jump=input.consumeJump();
    if(jump&&this.onGround&&!this.swimming){this.vel.y=PLAYER.jump;this.onGround=false;}
    const oldY=this.pos.y;
    this.stepRise=0;
    // Sweep a single vector, clipping it against every simultaneous contact.
    // No axis-wise movement or depenetration-derived velocity.
    const distance=Math.hypot(this.vel.x,this.vel.z)*dt;
    const count=Math.max(1,Math.ceil(distance/.09));
    this.solids=playerSweepColliders(this.pos.x,this.pos.z,PLAYER.radius+distance+.02);
    for(let i=0;i<count;i++)this.tryMove(this.vel.x*dt/count,this.vel.z*dt/count);
    const x=this.pos.x,z=this.pos.z,feet=this.pos.y;
    const terrain=playerTerrain(x,z),water=waterLevel(x,z,terrain);
    const bottom=playerFloor(x,z,Math.max(feet+CONTACT_SKIN,water-.01),PLAYER.radius,this.solids);
    const depth=water-(Number.isFinite(bottom)?bottom:terrain);
    if(!this.swimming&&depth>SWIM_IN&&feet<=water-FLOAT+.05&&!this.onGround)this.swimming=true;
    // Enter deep water while walking down the shore as well.
    if(!this.swimming&&depth>SWIM_IN&&feet<=water-FLOAT-.03)this.swimming=true;
    if(this.swimming&&depth<SWIM_OUT)this.swimming=false;
    if(this.swimming){
      const target=water-FLOAT+Math.sin(this.simTime*2.1)*.025;
      this.vel.y+=((target-feet)*6-this.vel.y)*(1-Math.exp(-dt*8));
      if(jump)this.vel.y=2.2;
      const next=feet+this.vel.y*dt;
      if(next>feet)this.pos.y=playerCeiling(x,z,feet,next,this.solids);
      else{
        const support=playerFloor(x,z,feet+CONTACT_SKIN,PLAYER.radius,this.solids);
        this.pos.y=Math.max(next,support);
        if(this.pos.y>next)this.vel.y=0;
      }
      if(this.pos.y<next-CONTACT_SKIN)this.vel.y=0;
      this.onGround=false;
    }else{
      // Ground snapping is permitted only for a previously grounded actor.
      // In the air only actual downward crossing of a solid surface lands.
      const wasGround=this.onGround;
      if(!wasGround)this.vel.y=Math.max(-45,this.vel.y-PLAYER.gravity*dt);
      if(this.vel.y>0){
        const next=feet+this.vel.y*dt;
        this.pos.y=playerCeiling(x,z,feet,next,this.solids);
        if(this.pos.y<next-CONTACT_SKIN)this.vel.y=0;
        this.onGround=false;
      }else{
        const floor=playerFloor(x,z,feet+CONTACT_SKIN,PLAYER.radius,this.solids);
        const gap=feet-floor;
        const snap=wasGround&&gap>=-CONTACT_SKIN&&gap<=PLAYER.step;
        if(snap){
          this.pos.y=floor;this.vel.y=0;this.onGround=true;
        }else{
          if(wasGround)this.vel.y=-PLAYER.gravity*dt;
          const next=feet+this.vel.y*dt;
          if(Number.isFinite(floor)&&next<=floor&&floor<=feet+CONTACT_SKIN){
            if(!wasGround&&this.vel.y<-4)this.landImpact=Math.min(1,-this.vel.y/16);
            this.pos.y=floor;this.vel.y=0;this.onGround=true;
          }else{this.pos.y=next;this.onGround=false;}
        }
      }
    }
    this.solids=null;
    if(this.onGround)this.stepRise=Math.max(0,this.pos.y-oldY);
    // Facing follows the actual continuous motion, not competing key axes.
    const speed=Math.hypot(this.vel.x,this.vel.z);
    if(speed>.12)this.moveHeading=Math.atan2(this.vel.x,this.vel.z);
    else if(mv.mag<.05)this.moveHeading=null;
  }
  candidate(dx,dz){
    const p=this.pos,x=clamp2(p.x+dx,-BOUND,BOUND),z=clamp2(p.z+dz,-BOUND,BOUND);
    const terrain=playerTerrain(x,z),maxRise=this.onGround&&!this.swimming?PLAYER.step:0;
    const limit=p.y+maxRise+CONTACT_SKIN;
    let floor=playerFloor(x,z,limit,PLAYER.radius,this.solids);
    if(terrain>limit){
      const len=Math.hypot(dx,dz),ex=.07;
      let nx=playerTerrain(x-ex,z)-playerTerrain(x+ex,z),nz=playerTerrain(x,z-ex)-playerTerrain(x,z+ex),n=Math.hypot(nx,nz);
      if(n<1e-6){nx=-dx;nz=-dz;n=len||1;}
      return {contacts:[{nx:nx/n,nz:nz/n,depth:terrain-limit}]};
    }
    let y=p.y;
    // Apply rise before the horizontal collision query. Check overhead at
    // the origin too; a low ceiling can veto an otherwise climbable step.
    if(maxRise>0&&floor>y+CONTACT_SKIN){
      const rise=floor-y;
      const atStair=stairSurface(x,z,0,true)!==null;
      const currentTerrain=playerTerrain(p.x,p.z);
      if(!atStair&&Math.abs(floor-terrain)<CONTACT_SKIN&&Math.abs(p.y-currentTerrain)<.04&&rise>Math.hypot(dx,dz)*Math.tan(50*Math.PI/180)+1e-5){
        // A steep continuous slope is not an auto-step. The threshold is
        // independent of speed and dt; keep the contour/tangential component.
        const e=.035,gx=playerTerrain(x-e,z)-playerTerrain(x+e,z),gz=playerTerrain(x,z-e)-playerTerrain(x,z+e),n=Math.hypot(gx,gz);
        const len=Math.hypot(dx,dz)||1,nx=n>1e-6?gx/n:-dx/len,nz=n>1e-6?gz/n:-dz/len;
        return {contacts:[{nx,nz,depth:rise}]};
      }
      if(playerCeiling(p.x,p.z,y,floor,this.solids)<floor-CONTACT_SKIN)return {contacts:[{nx:-dx/(Math.hypot(dx,dz)||1),nz:-dz/(Math.hypot(dx,dz)||1),depth:rise}]};
      y=floor;
    }
    const contacts=playerContacts(x,z,y,this.nearby,PLAYER.radius,this.solids);
    // Existing overlap may only decrease. This permits walking away from a
    // moving NPC or a bad save position without adding energy to the player.
    if(contacts.length){
      const prior=playerContacts(p.x,p.z,y,this.nearby,PLAYER.radius,this.solids);
      const unresolved=contacts.filter(c=>!prior.some(q=>c.collider===q.collider&&c.depth<q.depth-1e-5));
      if(unresolved.length)return {contacts:unresolved};
    }
    return {x,z,y,contacts:[]};
  }
  blocked(x,z){return this.candidate(x-this.pos.x,z-this.pos.z).contacts.length>0;}
  tryMove(dx,dz){
    if(Math.hypot(dx,dz)<1e-8)return;
    let mx=dx,mz=dz;
    for(let pass=0;pass<4;pass++){
      if(Math.hypot(mx,mz)<1e-7)break;
      const c=this.candidate(mx,mz);
      if(!c.contacts.length){
        this.pos.set(c.x,c.y,c.z);return;
      }
      // Advance up to the first contact, then project the remainder onto
      // all contact planes. The projection cannot increase speed.
      let lo=0,hi=1;
      for(let j=0;j<7;j++){
        const mid=(lo+hi)*.5;
        if(this.candidate(mx*mid,mz*mid).contacts.length)hi=mid;else lo=mid;
      }
      if(lo>1e-4){
        const ok=this.candidate(mx*lo,mz*lo);
        if(!ok.contacts.length)this.pos.set(ok.x,ok.y,ok.z);
      }
      mx*=1-lo;mz*=1-lo;
      const before=Math.hypot(mx,mz);
      for(let k=0;k<2;k++)for(const q of c.contacts){
        const d=mx*q.nx+mz*q.nz;if(d<0){mx-=d*q.nx;mz-=d*q.nz;}
        const v=this.vel.x*q.nx+this.vel.z*q.nz;
        if(v<0){this.vel.x-=v*q.nx;this.vel.z-=v*q.nz;}
      }
      if(Math.hypot(mx,mz)>=before-1e-7)break;
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
      const floor=playerFloor(this.pos.x,this.pos.z,this.pos.y+PLAYER.step,0);
      const safe=playerSafeSpawn(this.pos.x,this.pos.z,Number.isFinite(floor)?floor:null);
      this.pos.set(safe.x,safe.y,safe.z);
      this.onGround = true;
      this.swimming = false;
    } else {this.pos.y += PLAYER.height;this.onGround=false;}
    this.moveHeading=null;this.resetInterpolation();this.teleportId++;
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
      cam.position.copy(p.renderPos??p.pos);
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
      const strideLength = clamp2(0.9 + 0.55 * this.speed, 1.2, 3.8);
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
    const position=p.renderPos??p.pos;
    this.feetY=position.y;
    cam.position.set(position.x,position.y+PLAYER.height,position.z);
    const forward = 0.06 + this.lean * 0.48 * motion;
    shiftCameraWithinWorld(
      cam,
      cosYaw * sway * motion - sinYaw * forward,
      (bob + this.dip) * motion,
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
  settings: { motion: 1, graphics: graphicsKey(null) },
  intro: false
});
var Save = {
  data: fresh(),
  load() {
    try {
      const s = localStorage.getItem(KEY);
      if (s) {
        const d = JSON.parse(s);
        if (d.v === 1) this.data = { ...fresh(), ...d, settings: {...fresh().settings, ...d.settings} };
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
        if (w) c = { dist: 3, verb: "\uC774\uB3D9\uD558\uAE30", label: w.name, act: () => this.ui.onWaypoint?.(w.name) };
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
    if (!isAvailable(n, Save.data.picked)) return;
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
    this.travel.querySelector(".system-menu-shade").addEventListener("click",()=>this.close(this.travel));
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
    if (!this.travel.hidden) {this.menuPage="home";this.renderTravel?.();}
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
    this.pathCache = new Map();
    this.search = {gs:new Float32Array(N), from:new Int32Array(N), closed:new Uint8Array(N)};
  }
  invalidatePaths() {
    this.pathCache.clear();
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
    // Cache only static grid cells, not exact endpoints or mutable NPC arrays.
    const key = s + ":" + t + ":" + this.maxRise;
    const cached = this.pathCache.get(key);
    if (cached) {
      this.pathCache.delete(key);
      this.pathCache.set(key, cached);
      return cached.map(o => this.center(o)).concat([[x1, z1]]);
    }
    const W = this.w, {gs, from, closed} = this.search;
    gs.fill(Infinity); from.fill(-1); closed.fill(0);
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
    this.pathCache.set(key, out2);
    if (this.pathCache.size > 128) this.pathCache.delete(this.pathCache.keys().next().value);
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
// Do not submit distant residents to the mobile GPU or its shadow pass.
var SHOW = 105;
var LOD0 = 14;
var LOD1 = 38;
var SHADOW = 12;
function residentLOD(distance, detail, current) {
  // Keep the current mesh within 1 m of its boundary.
  const near = LOD0 * detail + (current === 0 ? 1 : current == null ? 0 : -1);
  const far = LOD1 * detail + (current === 2 ? -1 : current == null ? 0 : 1);
  return distance < near ? 0 : distance < far ? 1 : 2;
}
var Townsfolk = class {
  constructor(scene, region, makeCharacter) {
    this.places = region.places;
    this.scene=scene;this.makeCharacter=makeCharacter;
    this.nextModelAt=0;
    const B2 = BOUNDS;
    this.nav = World.kaelNav || new NavGrid(B2.x0, B2.z0, B2.x1, B2.z1, 2);
    const r = mulberry32(5), houses = [...TOWN.houses].sort(() => r() - 0.5);
    this.list = [...NAMED, ...townsfolk()].map((def, i) => {
      const appearance = resolveNpcAppearance(def);
      def.gender = appearance.gender;
      def.character = appearance.character;
      // Resident data/schedules are cheap and stay live regardless of mesh residency.
      const ch = null;
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
        poseOffset: i * .61803398875 % 1,
        rnd: mulberry32(100 + i)
      };
    });
    this.queue = [];
    this.quality = GRAPHICS.high;
    this.facing = new Vector3();
  }
  ensureActor(n) {
    if(n.ch||n.modelFailed)return n.ch;
    try{
      const ch=this.makeCharacter(n.def.character,{scale:n.def.scale??1});
      ch.group.position.set(n.x,n.y,n.z);ch.group.rotation.y=n.yaw;ch.group.visible=false;
      this.scene.add(ch.group);n.ch=ch;return ch;
    }catch(error){
      n.modelFailed=true;console.error("Resident model failed: "+n.def.id,error);return null;
    }
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
    this.queue.length = 0;
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
    const pending = this.queue.findIndex(job => job[0] === n);
    if (pending >= 0) this.queue[pending] = [n, x, z];
    else this.queue.push([n, x, z]);
  }
  update(dt, t, hour, player, camPos, camera) {
    const facing = camera ? this.facing.set(0, 0, -1).applyQuaternion(camera.quaternion) : null;
    let pendingModel=null,pendingDistance=Infinity;
    // Budget aggregate path work; preserve FIFO and guarantee one job progresses.
    const deadline = performance.now() + 2.5;
    for (let k = 0; k < 3 && this.queue.length && (k === 0 || performance.now() < deadline); k++) {
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
      const dxCam = n.x - camPos.x, dzCam = n.z - camPos.z;
      const d = Math.hypot(dxCam, dzCam);
      // Keep a generous margin for peripheral vision, especially on portrait screens.
      // Off-camera NPC logic still runs, but their skinned meshes stop rendering.
      const inFront = !facing || d < 4 || dxCam * facing.x + (n.y + .9 - camPos.y) * facing.y + dzCam * facing.z > -Math.max(1, d * .12);
      const vis = !n.hidden && d < this.quality.npcRange && inFront;
      if(!n.ch){
        if(!n.modelFailed&&!n.hidden&&(vis||d<8)&&d<pendingDistance){pendingModel=n;pendingDistance=d;}
        continue;
      }
      const g=n.ch.group;
      g.visible = vis;
      if (!vis) {
        n.poseAge = null;
        continue;
      }
      g.position.set(n.x, n.y, n.z);
      g.rotation.y = n.yaw;
      const lod = residentLOD(d, this.quality.npcDetail, n.lod);
      if (lod !== n.lod) {
        n.ch.setLOD(lod);
        n.lod = lod;
      }
      n.ch.setShadow(d < SHADOW);
      n.ch.speed = n.speed;
      const interval = d < SHADOW || n.talkT > 0 ? 0 : d < 22 ? 1 / 30 : d < 42 ? 1 / 20 : 1 / 10;
      n.poseAge = (n.poseAge ?? interval * n.poseOffset) + dt;
      if (n.poseAge >= interval) {
        n.ch.animate(Math.min(.12, n.poseAge), t);
        n.poseAge = 0;
      }
    }
    // At most one resident model per frame/interval, closest visible first.
    // Never gate the loading overlay, chooser or resident simulation on all models.
    if(pendingModel&&t>=this.nextModelAt){
      this.ensureActor(pendingModel);this.nextModelAt=t+.08;
    }
  }
  // nearest person in front of the player within reach
  candidate(player) {
    let best = null, bd = 2.6;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    for (const n of this.list) {
      if (n.hidden||!n.ch) continue;
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
    if(n.ch)n.ch.talk = 2.4;
    n.path && (n.wait = 0);
    this.onSay?.(n.def, line);
    Save.write();
  }
  // Dynamic residents participate in the same horizontal contact solver.
  // Their navigation must not teleport or inject velocity into the player.
  playerContacts(p) {
    const out=[];
    for(const n of this.list){
      if(n.hidden||!n.ch||Math.abs(p.pos.y-n.y)>2||Math.hypot(p.pos.x-n.x,p.pos.z-n.z)>2)continue;
      const scale=n.def.scale??1;
      out.push({type:"cyl",x:n.x,z:n.z,r:Math.max(.12,.62*scale-PLAYER.radius),bot:n.y,top:n.y+1.72*scale,walk:false});
    }
    return out;
  }
  labels(camera, player) {
    const out2 = [];
    for (const n of this.list) {
      if (n.hidden||!n.ch) continue;
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
  if(!(limit>0))return 0;
  // Exact finite segment vs. rotated boxes/cylinders. Sampling the static
  // colliders at 10cm intervals missed thin walls and decks completely.
  let best=limit;
  const mx=origin.x+dir.x*limit*.5,mz=origin.z+dir.z*limit*.5;
  const range=Math.hypot(dir.x,dir.z)*limit*.5+.02;
  for(const o of query(mx,mz,range)){
    let lo=0,hi=best;
    function slab(p,d,min,max){
      if(Math.abs(d)<1e-9)return p>=min&&p<=max;
      let a=(min-p)/d,b=(max-p)/d;if(a>b)[a,b]=[b,a];
      lo=Math.max(lo,a);hi=Math.min(hi,b);return lo<=hi;
    }
    if(!slab(origin.y,dir.y,o.bot-.005,o.top+.005))continue;
    if(o.type==="cyl"){
      const x=origin.x-o.x,z=origin.z-o.z,r=o.r+.015;
      const a=dir.x*dir.x+dir.z*dir.z,b=2*(x*dir.x+z*dir.z),c=x*x+z*z-r*r;
      if(a<1e-12){if(c>0)continue;}
      else{
        const d=b*b-4*a*c;if(d<0)continue;
        const s=Math.sqrt(d);
        lo=Math.max(lo,(-b-s)/(2*a));hi=Math.min(hi,(-b+s)/(2*a));
      }
    }else{
      const [x,z]=local(o,origin.x,origin.z);
      const dx=dir.x*o.cos-dir.z*o.sin,dz=dir.x*o.sin+dir.z*o.cos;
      if(!slab(x,dx,-o.hx-.015,o.hx+.015)||!slab(z,dz,-o.hz-.015,o.hz+.015))continue;
    }
    if(lo<=hi&&hi>=0&&lo<=best)best=Math.max(0,lo);
  }
  // Heightfield/treads are still sampled at the original resolution. The
  // expensive static broad phase no longer executes for every sample.
  const terrainHit=d=>origin.y+dir.y*d<playerTerrain(origin.x+dir.x*d,origin.z+dir.z*d)+.055;
  if(terrainHit(0))return 0;
  const steps=Math.max(1,Math.ceil(best/.10));
  for(let j=1;j<=steps;j++){
    const d=best*j/steps;if(!terrainHit(d))continue;
    let a=best*(j-1)/steps,b=d;
    for(let k=0;k<5;k++){const m=(a+b)*.5;if(terrainHit(m))b=m;else a=m;}
    return b;
  }
  return best;
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
    this.trailMesh.visible = false;
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
    this.swing = { hand, w, t: 0, dur, spec: maktwoAttackSpec(w.model, dur), contact: null, hit: false,
      aimYaw: Save.data.settings.view === "third" ? this.player.yaw : null,
      aimPitch: Save.data.settings.view === "third" ? this.player.pitch : null };
  }
  strike(a, progress) {
    const p = this.player, spec = a.spec, side = a.hand === "right" ? 1 : -1;
    const arc = spec.back - (spec.back + spec.follow) * progress;
    const yaw = (a.aimYaw ?? p.yaw) - arc * side, pitch = a.aimPitch ?? p.pitch;
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
  renderer.shadowMap.autoUpdate = false;
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
  const characterTypes={Group,Bone,Skeleton,SkinnedMesh,Mesh,MeshBasicMaterial,BufferGeometry,BufferAttribute,ShaderMaterial,Vector2,Vector3,Vector4,Quaternion,Matrix4,Euler,Color,DoubleSide};
  hud.progress(.988,"캐릭터를 준비하는 중");
  await nextFrame2();
  const [studioSource,studioLod]=await Promise.all([loadStudioSource(),loadStudioLod()]);
  studioSource.lod=studioLod;
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
    setActive: active => { if(n.ch)n.ch.group.visible = active && !n.hidden; }
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
    makeWeapon:id=>{
      const model=ITEMS[id]?.model;
      if(!model||!MODELS[model])return null;
      const weapon=new Mesh(MODELS[model](),view.mat);
      weapon.userData.handleY=model==='sword'?-.08:model==='dagger'?-.055:.06;
      return weapon;
    },
    attackPose:maktwoAttackPose,worldRay:maktwoWorldRay,groundSurface:playerFootSurface,runSpeed:PLAYER.run});
  let previousView;
  const clearEditorInput = () => {
    input.keys.clear();
    input.stick.x = input.stick.y = 0;
    input.consumeJump();
    input.consumeAttack();
  };
  const skillWorkbench = createSkillWorkbench({
    library: SkillLibrary,
    canOpen: () => !avatars.isOpen && !combat.downed && player.mode === "walk" &&
      ui.bag.hidden && ui.travel.hidden && ui.boardP.hidden && $("intro").hidden &&
      $("speech").hidden && !fullMap.isOpen(),
    enter: () => {
      previousView = {third: avatars.mode === "third", yaw: player.yaw, pitch: player.pitch};
      avatars.setThird(false, {persist:false});
      input.lookOnly = true;
      clearEditorInput();
      input.consumeLook();
    },
    leave: () => {
      avatars.setThird(previousView.third, {persist:false});
      player.yaw = previousView.yaw;
      player.pitch = previousView.pitch;
      input.lookOnly = false;
      clearEditorInput();
      input.consumeLook();
    }
  });
  society.onBought = (id, hand) => {
    if (hand) combat.equip(id, hand);
  };
  ui.onEquip = (id, hand) => combat.equip(id, hand);
  ui.onUnequip = (id) => combat.unequip(id);
  ui.hurt(combat.hp / combat.max, 0);
  ui.onInteract = () => explore.interact();
  const toggleFly = () => player.setMode(player.mode === "fly" ? "walk" : "fly");
  ui.onWaypoint=name=>{fullMap.open();const w=fullMap.discovered().find(w=>w.name===name);if(w)fullMap.selectWaypoint(w);};
  const menuLabels={home:"메뉴",settings:"플레이 설정",controls:"조작법",info:"게임 정보",dev:"개발자 도구",data:"데이터 관리"};
  const menuPages=Object.keys(menuLabels);
  const menuPageKey="sernbeld.menu-page.v1";
  const menuIcon=id=>{const s=document.createElementNS("http://www.w3.org/2000/svg","svg");s.setAttribute("viewBox","0 0 24 24");s.setAttribute("aria-hidden","true");const u=document.createElementNS(s.namespaceURI,"use");u.setAttribute("href","./assets/ui-icons.svg#"+id);s.append(u);return s;};
  const menuButton=(label,icon,action,cls="system-menu-tile")=>{
    const b=document.createElement("button");b.type="button";b.className=cls;
    if(icon)b.append(menuIcon(icon));const span=document.createElement("span");span.textContent=label;b.append(span);b.onclick=action;return b;
  };
  const navigateMenu=page=>{ui.menuPage=menuPages.includes(page)?page:"home";ui.renderTravel();if(!ui.travel.hidden)(ui.menuPage==="home"?ui.travel.querySelector(".system-menu-exit"):$("systemMenuBack")).focus({preventScroll:true});};
  ui.menuBack=()=>{if(ui.menuPage!=="home")navigateMenu("home");else ui.close(ui.travel);};
  $("systemMenuBack").onclick=ui.menuBack;
  // Render the actual saved face once per changed appearance; no extra WebGL context or animation loop.
  let portraitKey="",portraitCanvas=null;
  function playerPortrait(){
    const profile=avatars.profile,key=JSON.stringify(profile);
    if(key===portraitKey&&portraitCanvas)return portraitCanvas;
    const c=document.createElement("canvas");c.width=c.height=128;c.setAttribute("aria-hidden","true");
    let target=null,actor=null;
    const previous=renderer.getRenderTarget(),color=renderer.getClearColor(new Color()),alpha=renderer.getClearAlpha(),shadow=renderer.shadowMap.autoUpdate;
    try{
      actor=makeCharacter(profile,{clothing:false});actor.setShadow(false);
      const portraitScene=new Scene();portraitScene.add(actor.group);actor.group.updateMatrixWorld(true);
      const center=actor.model.localToWorld(new Vector3(...actor.data.face.focus.map(v=>v/1428)));
      const half=.145*actor.units;
      const portraitCamera=new OrthographicCamera(-half,half,half,-half,.01,20);
      portraitCamera.position.copy(center).add(new Vector3(.05,.015,3));portraitCamera.lookAt(center);
      target=new WebGLRenderTarget(128,128);
      renderer.shadowMap.autoUpdate=false;renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.clear();renderer.render(portraitScene,portraitCamera);
      const pixels=new Uint8Array(128*128*4);renderer.readRenderTargetPixels(target,0,0,128,128,pixels);
      const context=c.getContext("2d"),image=context.createImageData(128,128);
      for(let y=0;y<128;y++)image.data.set(pixels.subarray((127-y)*512,(128-y)*512),y*512);
      context.putImageData(image,0,0);portraitCanvas=c;portraitKey=key;return c;
    }catch(error){console.warn("Menu portrait unavailable",error);return menuIcon("ui-person");}
    finally{renderer.setRenderTarget(previous);renderer.setClearColor(color,alpha);renderer.shadowMap.autoUpdate=shadow;target?.dispose();actor?.dispose();}
  }
  ui.setTravel(body=>{
    const page=menuPages.includes(ui.menuPage)?ui.menuPage:"home";
    ui.menuPage=page;
    try{sessionStorage.setItem(menuPageKey,page);}catch{}
    $("systemMenuTitle").textContent=menuLabels[page];$("systemMenuBack").hidden=page==="home";
    ui.travel.querySelector(".system-menu-exit").hidden=page!=="home";$("menuMoney").hidden=page!=="home";
    ui.travel.dataset.page=page;
    $("menuMoney").textContent="은화 "+Wallet.get().toLocaleString("ko-KR");
    body.replaceChildren();body.scrollTop=0;
    const row=(name,value)=>{const d=el("div","system-menu-row");const a=el("span");a.textContent=name;const b=el("span","system-menu-value");b.textContent=value;d.append(a,b);return d;};
    const heading=label=>{const h=el("h3","system-menu-section");h.textContent=label;body.append(h);};
    const choice=(label,options,current,change)=>{
      const field=el("div","system-menu-field"),name=el("span");name.textContent=label;
      const group=el("div","system-menu-choices");group.setAttribute("role","group");group.setAttribute("aria-label",label);
      for(const [value,title] of options){const b=menuButton(title,null,()=>{change(value);for(const option of group.children)option.setAttribute("aria-pressed",String(option===b));},"system-menu-choice");b.setAttribute("aria-pressed",String(current===value));group.append(b);}
      field.append(name,group);body.append(field);
    };
    const openCharacter=()=>{ui.close(ui.travel);avatars.openChooser();};
    if(page==="home"){
      const profile=menuButton("",null,openCharacter,"system-menu-profile");profile.replaceChildren();
      const portrait=el("span","system-menu-portrait");portrait.append(playerPortrait());
      const text=el("span","system-menu-profile-copy"),name=el("strong"),sub=el("span");
      name.textContent="내 캐릭터";sub.textContent=region.name+" · "+(Guild.state.registered?"조합원":"여행자");text.append(name,sub);
      const action=el("span","system-menu-profile-action");action.textContent="외형 변경";text.append(action);
      profile.append(portrait,text,menuIcon("ui-next"));body.append(profile);
      const grid=el("div","system-menu-grid");
      for(const [label,icon,dest] of [["플레이 설정","ui-settings","settings"],["조작법","ui-controls","controls"],["게임 정보","ui-info","info"]]){
        grid.append(menuButton(label,icon,()=>navigateMenu(dest)));
      }
      body.append(grid);
      const secondary=el("div","system-menu-secondary");
      for(const [label,icon,dest] of [["개발자 도구","ui-dev","dev"],["데이터 관리","ui-save","data"]]){
        const b=menuButton(label,icon,()=>navigateMenu(dest),"system-menu-link");b.append(menuIcon("ui-next"));secondary.append(b);
      }
      body.append(secondary);return;
    }
    if(page==="settings"){
      choice("카메라 시점",[["first","1인칭"],["third","3인칭"]],avatars.mode,v=>avatars.setThird(v==="third"));
      choice("그래픽 품질",[["low","하"],["medium","중"],["high","상"]],graphicsKey(Save.data.settings.graphics),v=>applyGraphics(v));
      choice("화면 흔들림",[[1,"보통"],[.4,"약하게"],[0,"끄기"]],Save.data.settings.motion,v=>{Save.data.settings.motion=rig.motion=v;Save.write();});
      return;
    }
    if(page==="controls"){
      heading("터치");
      for(const [a,b] of [["이동","왼쪽 드래그"],["시점","오른쪽 드래그"],["점프 · 공격","화면 버튼"],["상호작용","표시된 행동 누르기"]])body.append(row(a,b));
      heading("키보드 · 마우스");
      for(const [a,b] of [["이동","W A S D"],["달리기","Shift"],["점프","Space"],["시점","마우스 드래그"],["공격","클릭"],["상호작용","E"],["가방 · 지도","I · M"],["닫기","Esc"]])body.append(row(a,b));
      return;
    }
    if(page==="info"){
      heading("현재 세계");
      body.append(row("지역",region.name),row("발견한 웨이포인트",Save.data.waypoints.length+" / "+region.waypoints.length),row("조합 가입",Guild.state.registered?"가입":"미가입"));
      heading("세른벨드");body.append(row("게임","SERNBELD"),row("저장 방식","기기 내 저장"));return;
    }
    if(page==="dev"){
      const fly=menuButton(player.mode==="fly"?"걷기로 돌아가기":"자유 비행",null,()=>{toggleFly();ui.close(ui.travel);},"system-menu-link");
      body.append(fly);heading("검수용 이동");
      for(const t of region.teleports)body.append(menuButton(t.name,null,()=>{teleport(t);ui.close(ui.travel);},"system-menu-link"));
      return;
    }
    if(page==="data"){
      heading("저장 데이터");
      body.append(row("저장 위치","현재 브라우저"));
      const reset=menuButton("처음부터 다시",null,()=>{
        if(confirm("가방, 캐릭터와 발견한 웨이포인트 등 모든 게임 진행을 초기화할까?")){
          try{sessionStorage.removeItem("sernbeld.last-screen.v1");sessionStorage.removeItem(menuPageKey);}catch{}
          Save.reset();location.reload();
        }
      },"system-menu-link system-menu-danger");
      const note=el("p","system-menu-note");note.textContent="현재 기기에 저장된 게임 진행을 삭제해. 이 작업은 되돌릴 수 없어.";body.append(reset,note);
    }
  });
  rig.motion = Save.data.settings.motion;
  const sp = Save.data.pos, firstLaunch = !Save.data.intro;
  if (firstLaunch) teleport({ ...region.arrival });
  else if (sp) player.teleport(sp[0], sp[2], Save.data.yaw,0,Number.isFinite(sp[1])?Math.max(sp[1],playerTerrain(sp[0],sp[2])):null);
  else teleport({ ...region.spawn });
  miniMap.update(player, performance.now());
  const persist = () => {
    Save.data.pos = [player.pos.x, player.pos.y, player.pos.z];
    Save.data.yaw = skillWorkbench.isOpen() ? previousView.yaw : player.yaw;
    Save.data.clock = { day: clock.day, hour: clock.hour };
    Save.write();
  };
  setInterval(() => {
    if (player.mode === "walk" && !player.swimming) persist();
  }, 15e3);
  addEventListener("visibilitychange", () => {
    if (document.hidden && player.mode === "walk") persist();
  });
  // Adaptive resolution: drop pixel ratio in steps when frames run long, recover when fast.
  let quality = GRAPHICS[graphicsKey(Save.data.settings.graphics)];
  let dprCap = Math.min(devicePixelRatio || 1, quality.dpr), dprNow = dprCap, frameAvg = 1 / 60, dprClock = 0;
  function applyGraphics(key, persist = true) {
    key = graphicsKey(key);
    quality = GRAPHICS[key];
    Save.data.settings.graphics = key;
    terrain.setQuality(quality);
    forest.setQuality(quality);
    grass.setQuality(quality);
    rocks.setQuality(quality);
    folk.quality = quality;
    sun.setResolution(CFG.shadowSize * quality.shadowScale);
    dprNow = Math.min(devicePixelRatio || 1, quality.dpr);
    frameAvg = 1 / 60; dprClock = 0;
    resize();
    renderer.shadowMap.needsUpdate = true;
    if (persist) Save.write();
  }
  const resize = () => {
    dprCap = Math.min(devicePixelRatio || 1, quality.dpr);
    dprNow = Math.min(dprNow, dprCap);
    renderer.setPixelRatio(dprNow);
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    rig.setBaseFov(65);
    camera.updateProjectionMatrix();
    const h = innerHeight * renderer.getPixelRatio(), p11 = camera.projectionMatrix.elements[5];
    greatTree.userData.setViewport(h, p11);
    gatherables.setViewport(h, p11);
  };
  addEventListener("resize", resize);
  applyGraphics(Save.data.settings.graphics, false);
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
  // Remember the most recently opened visible window, not a generic menu flag.
  const screenKey="sernbeld.last-screen.v1";
  const screens=[
    {name:"character",target:document.getElementById("character-chooser"),attribute:"open",isOpen:()=>avatars.isOpen,restore:()=>avatars.openChooser()},
    {name:"magic",target:document.getElementById("skillWorkbench"),attribute:"hidden",isOpen:()=>skillWorkbench.isOpen(),restore:()=>skillWorkbench.open()},
    {name:"map",target:document.getElementById("worldMap"),attribute:"hidden",isOpen:()=>fullMap.isOpen(),restore:()=>fullMap.open()},
    {name:"bag",target:ui.bag,attribute:"hidden",isOpen:()=>!ui.bag.hidden,restore:()=>{if(ui.bag.hidden)ui.toggleBag();}},
    {name:"travel",target:ui.travel,attribute:"hidden",isOpen:()=>!ui.travel.hidden,restore:()=>{let page="home";try{page=sessionStorage.getItem(menuPageKey)||"home";}catch{}if(ui.travel.hidden)ui.toggleTravel();navigateMenu(page);}},
    {name:"board",target:ui.boardP,attribute:"hidden",isOpen:()=>!ui.boardP.hidden,restore:()=>society.openBoard()}
  ];
  let lastScreen=null,openOrder=[];
  try{lastScreen=sessionStorage.getItem(screenKey);}catch{}
  const rememberScreen=()=>{
    const visible=screens.filter(screen=>screen.isOpen()).map(screen=>screen.name);
    openOrder=openOrder.filter(name=>visible.includes(name));
    for(const name of visible)if(!openOrder.includes(name))openOrder.push(name);
    const active=openOrder.at(-1);
    try{if(active)sessionStorage.setItem(screenKey,active);else sessionStorage.removeItem(screenKey);}catch{}
  };
  const onScreenMutations=records=>{
    for(const record of records){
      const screen=screens.find(s=>s.target===record.target&&s.attribute===record.attributeName);
      if(!screen||!screen.isOpen())continue;
      const wasOpen=screen.attribute==="open"?record.oldValue!==null:record.oldValue===null;
      if(!wasOpen){openOrder=openOrder.filter(name=>name!==screen.name);openOrder.push(screen.name);}
    }
    rememberScreen();
  };
  const screenObserver=new MutationObserver(onScreenMutations);
  for(const screen of screens)if(screen.target)screenObserver.observe(screen.target,{attributes:true,attributeOldValue:true,attributeFilter:[screen.attribute]});
  if(!Save.data.characterCreated)avatars.openChooser(true);
  else if(!firstLaunch)screens.find(screen=>screen.name===lastScreen)?.restore();
  addEventListener("pagehide",()=>onScreenMutations(screenObserver.takeRecords()));
  rememberScreen();
  let last = performance.now(), lastShadow = -Infinity, shadowCut = -1, nextGoal = -Infinity;
  GameEvents.on("inventory.changed", () => { nextGoal = -Infinity; });
  const tick = (now) => {
    const dt = Math.max(0,Math.min(0.1, (now - last) / 1e3));
    last = now;
    const t = now / 1e3;
    if (avatars.isOpen) {
      input.keys.clear(); input.stick.x = input.stick.y = 0;
      input.consumeLook(); input.consumeAttack(); input.consumeToggles(); input.jumpQueued = false;
      return;
    }
    frameAvg += (dt - frameAvg) * 0.05;
    if ((dprClock += dt) > 2) {
      dprClock = 0;
      const next = frameAvg > 1 / 40 ? Math.max(Math.min(quality.floor, dprCap), dprNow - 0.125) : frameAvg < 1 / 56 ? Math.min(dprCap, dprNow + 0.125) : dprNow;
      if (next !== dprNow) {
        dprNow = next;
        resize();
      }
    }
    shared.uTime.value = t;
    for (const code of input.consumeToggles()) {
      if(!ui.travel.hidden){if(code==="Escape")ui.menuBack();break;}
      if (skillWorkbench.isOpen()) {
        if (code === "Escape") {
          skillWorkbench.dismiss();
          break;
        }
        continue;
      }
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
    if (fullMap.isOpen() || !ui.travel.hidden) {
      input.keys.clear();
      input.stick.x = input.stick.y = 0;
      input.consumeLook();
      input.consumeAttack();
      input.jumpQueued = false;
    } else {
      const editingSkill = skillWorkbench.isOpen();
      if (editingSkill) clearEditorInput();
      if (!editingSkill && input.consumeAttack() && ui.bag.hidden && ui.travel.hidden && ui.boardP.hidden) combat.attack();
      player.look(input);
      player.advance(dt,input,WorldRegions.isActive(region.id)?folk.playerContacts(player):[]);
    }
    cutstoneBridge.update(player.pos.x, player.pos.z, now);
    miniMap.update(player, now);
    fullMap.update(now);
     rig.update(dt, player);
    if (WorldRegions.isActive(region.id)) {
      folk.update(dt, t, clock.hour, player, camera.position, camera);
    }
    combat.update(dt);
    if (player.mode === "walk" && avatars.mode === "first") maktwoAttackCamera(camera, combat.swing, rig.motion);
    view.root.visible = player.mode === "walk";
    avatars.update(dt,t,combat);
    avatars.applyThirdCamera(dt,rig);
    avatars.updateTrail(combat);
    gatherables.update(player.pos);
    explore.update();
    terrain.update(camera.position.x, camera.position.z, camera.position.y);
    if (now - lastShadow >= quality.shadowMs || shadowCut !== player.teleportId) {
      sun.update(camera.position.x, camera.position.z, player.yaw);
      renderer.shadowMap.needsUpdate = true;
      lastShadow = now;
      shadowCut = player.teleportId;
    }
    forest.update(camera.position);
    rocks.update(camera.position);
    grass.update(camera.position);
    // Ocean is world-anchored; no 64m position discontinuity on camera movement.
    rivers.userData.update(t);
    blockout.userData.update(t);
    waypoints.userData.update(t);
    renderer.render(scene, camera);
    hud.tick(dt, renderer.info.render, player.pos);
    ui.setClock(clock.label);
    if (now >= nextGoal) {
      ui.setGoal(society.goal());
      nextGoal = now + 150;
    }
    ui.setLabels(WorldRegions.isActive(region.id) ? folk.labels(camera, player) : [], camera);
  };
  renderer.setAnimationLoop(tick);
  window.__dev = { playerTerrain, playerFloor, playerFootSurface, playerContacts, maktwoWorldRay, stairs:STAIRS, stairBounds:[STAIR_MIN_V,STAIR_MAX_V], graphics: {set: applyGraphics, get: () => graphicsKey(Save.data.settings.graphics), presets: GRAPHICS}, terrain, grass, rocks, gatherables, avatars,characterTypes,studioFactory, cutstoneBridge, fullMap, miniMap, collidersAt, groundAt, occupiedAt, renderer, scene, camera, player, input, rig, World, teleport, region, entities: WorldEntities, regions: WorldRegions, events: GameEvents, inventory: Inventory, skills: {validate:validateSkill, compile:compileSkill, library:SkillLibrary}, forest, veg, nodes, explore, ui, Save, clock, folk, society, Guild, combat, frame: () => tick(performance.now()) };
}
boot().catch((e) => {
  console.error(e);
  hud.error("\uCD08\uAE30\uD654 \uC2E4\uD328: " + e.message);
});
