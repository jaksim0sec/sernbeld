// .work/entry.js
var IS_MOBILE = typeof matchMedia !== "undefined" && (matchMedia("(pointer: coarse)").matches || Math.min(innerWidth, innerHeight) < 600);
var CFG = {
  half: 1280,
  // playable heightfield covers [-half, half] metres
  cell: 2.5,
  // heightfield resolution (m)
  chunk: 160,
  // smallest terrain LOD node (m)
  bakeCell: 5,
  // baked sun/AO resolution (m)
  fieldCell: 5,
  // authored-shape distance field resolution (m)
  shadowSize: IS_MOBILE ? 1024 : 2048,
  shadowExtent: IS_MOBILE ? 74 : 100,
  dprMax: IS_MOBILE ? 1.5 : 1.75,
  farHalf: 9e3,
  farCell: 80,
  seaLevel: 0
};
var GRID_N = Math.round(CFG.half * 2 / CFG.cell) + 1;
var CHUNK_CELLS = CFG.chunk / CFG.cell;
var PLAYER = {
  height: 1.5,
  // eye height above feet, calibrated to the adult NPC mesh (~1.72 m)
  radius: 0.35,
  body: 1.72,
  walk: 2.6,
  run: 5,
  jump: 7,
  gravity: 24,
  step: 0.5,
  // max rise per 0.5 m sub-step (~45 degree slope)
  wade: 1.15
  // deepest water you can walk into
};
var ring = (cx, cz, r, n = 10) => Array.from({ length: n }, (_, i) => {
  const a = i / n * Math.PI * 2;
  return [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
});
var SERNBELD = {
  id: "sernbeld",
  name: "\uC138\uB978\uBCA8\uB4DC",
  subtitle: "\uBC14\uB78C\uACFC \uC720\uC0B0\uC758 \uD3C9\uC6D0",
  sun: [-0.4, 0.56, 0.56],
  // direction towards the sun
  baseHeight: 20,
  // default land height inside the coast
  // Island outline. The concave notch on the east side is Kael bay.
  coast: [
    [-321, -917],
    [71, -989],
    [429, -937],
    [679, -870],
    [1036, -840],
    [1143, -628],
    [1232, -402],
    [1250, -113],
    [1232, 155],
    [1060, 190],
    [900, 150],
    [768, 72],
    [600, -20],
    [640, -160],
    [600, -235],
    [540, -262],
    [480, -235],
    [420, -150],
    [321, -10],
    [200, 40],
    [71, 72],
    [-125, 93],
    [-214, 196],
    [-179, 361],
    [0, 443],
    [321, 464],
    [607, 443],
    [822, 402],
    [930, 430],
    [1090, 520],
    [947, 670],
    [714, 814],
    [411, 937],
    [143, 979],
    [-125, 896],
    [-286, 773],
    [-446, 876],
    [-607, 773],
    [-839, 690],
    [-1125, 505],
    [-1214, 196],
    [-1179, -113],
    [-1214, -402],
    [-1143, -608],
    [-911, -711],
    [-661, -793],
    [-482, -855]
  ],
  // Raised plateaus, lowest first. Cliff = width (m) of the cliff band.
  tiers: [
    { id: "arch_hill", h: 32, cliff: 30, poly: [[160, 520], [460, 520], [520, 680], [280, 760], [120, 680]] },
    { id: "west", h: 36, cliff: 24, poly: [[-1300, -640], [-560, -720], [-420, -560], [-330, -360], [-330, -120], [-290, 120], [-330, 330], [-460, 560], [-760, 720], [-1300, 600]] },
    { id: "east", h: 44, cliff: 24, poly: [[820, -310], [1180, -310], [1300, -100], [1260, 180], [1080, 200], [900, 150], [700, -40], [660, -170], [700, -260]] },
    { id: "aether_field", h: 58, cliff: 24, poly: [[-1300, -760], [-800, -860], [-200, -820], [-170, -640], [-260, -470], [-460, -400], [-760, -380], [-1050, -430], [-1300, -480]] },
    { id: "ne_heights", h: 104, cliff: 22, poly: [[650, -1e3], [1200, -950], [1300, -500], [1180, -310], [820, -310], [680, -470], [640, -700]] },
    { id: "north_heights", h: 108, cliff: 22, poly: [[-170, -1050], [470, -1050], [540, -860], [548, -690], [520, -520], [480, -380], [330, -400], [140, -470], [-60, -520], [-150, -660]] }
  ],
  // Flattened building ground. Overrides tiers.
  pads: [
    { id: "kael_town", h: 3.2, poly: [[-280, -390], [200, -450], [430, -340], [470, -180], [320, -10], [60, 60], [-200, 70], [-300, -120]] },
    { id: "monastery", h: 38, poly: ring(-640, 180, 110) },
    { id: "bridge_n", h: 106, poly: ring(470, -575, 30, 8) },
    { id: "bridge_ne", h: 106, poly: ring(705, -570, 30, 8) }
  ],
  // Coastline stretches where cliffs give way to sand.
  beaches: [
    [[-600, 780], [-446, 872], [-300, 790]],
    [[-160, 880], [0, 940], [140, 975]],
    [[-150, 380], [0, 440], [200, 462]]
  ],
  // Rivers: [x, z, waterY]. A segment dropping steeply becomes a waterfall.
  rivers: [
    { id: "aether_falls", width: 9, pts: [
      [100, -960, 105],
      [240, -880, 104.6],
      [380, -790, 104.2],
      [500, -720, 103.8],
      [530, -702, 103.6],
      [575, -692, 20.5],
      [600, -640, 19.5],
      [612, -540, 18.2],
      [600, -430, 16.5],
      [580, -330, 14.2],
      [565, -292, 13.6],
      [548, -258, 0.2],
      [530, -230, 0.2]
    ] }
  ],
  // Roads: graded automatically (max ~16%), cutting ramps through tier cliffs.
  roads: [
    { id: "town_west", width: 4.5, pts: [[60, -170], [-80, -150], [-220, -90], [-330, 10], [-430, 110], [-540, 170], [-600, 185]] },
    { id: "west_field", width: 4, pts: [[-430, 110], [-480, -40], [-520, -220], [-570, -360], [-640, -460], [-700, -520]] },
    { id: "field_windmill", width: 3.5, pts: [[-570, -360], [-460, -440], [-350, -505]] },
    { id: "town_north", width: 4.5, pts: [[120, -300], [-40, -410], [-190, -520], [-200, -690], [-80, -790], [90, -800], [260, -760], [380, -660], [470, -585]] },
    { id: "north_gazebo", width: 3.5, pts: [[90, -800], [75, -880], [62, -930]] },
    { id: "ne_shrine", width: 4, pts: [[705, -570], [790, -660], [880, -770], [930, -850]] },
    { id: "town_east", width: 4.5, pts: [[300, -60], [430, -200], [520, -330], [600, -385], [700, -335], [830, -235], [960, -130], [1090, 40]] },
    { id: "south", width: 4, pts: [[-600, 185], [-610, 320], [-520, 470], [-340, 560], [-130, 600], [100, 580], [300, 610]] },
    { id: "cove", width: 3.5, pts: [[-340, 560], [-400, 690], [-440, 790]] }
  ],
  // Painted flower meadows.
  flowers: [
    [[-1100, -700], [-820, -800], [-470, -760], [-400, -560], [-520, -440], [-800, -430], [-1060, -490]],
    ring(-640, 285, 55, 8)
  ],
  islets: [
    { x: -1300, z: 300, r: 30, h: 14 },
    { x: -1250, z: -250, r: 22, h: 10 },
    { x: 1320, z: 350, r: 26, h: 12 },
    { x: 1180, z: 640, r: 34, h: 16 },
    { x: 640, z: 1e3, r: 24, h: 9 },
    { x: -700, z: 900, r: 20, h: 8 },
    { x: 960, z: 880, r: 40, h: 18 },
    { x: -1e3, z: 760, r: 28, h: 12 },
    { x: 150, z: 1080, r: 30, h: 11 },
    { x: 1330, z: -700, r: 30, h: 16 },
    { x: 760, z: 300, r: 12, h: 5 }
  ],
  farIslands: [
    { x: -4200, z: -2600, r: 700, h: 170 },
    { x: 4600, z: -1800, r: 450, h: 130 },
    { x: 2600, z: 4300, r: 800, h: 110 },
    { x: -3600, z: 3200, r: 500, h: 90 },
    { x: 400, z: -5200, r: 600, h: 150 }
  ],
  // Structures. In this build they are BLOCKOUT massing only (hatched material).
  landmarks: [
    { kind: "great_tree", name: "\uC5D0\uD14C\uB974 \uB300\uC218", x: -740, z: -560 },
    { kind: "windmill", name: "\uB4E4\uD310 \uD48D\uCC28", x: -330, z: -525 },
    { kind: "gazebo", name: "\uBC14\uB78C\uC758 \uC815\uC790", x: 60, z: -948 },
    { kind: "shrine", name: "\uD558\uB298 \uC131\uC18C", x: 945, z: -885 },
    { kind: "arcade", name: "\uACF5\uC911 \uD68C\uB791", a: [470, -575], b: [705, -570], y: 106, width: 7 },
    // 카엘 항구의 건축은 regions/kael.js + render/kael.js
    { kind: "arch", x: -580, z: -770, yaw: 0.4 },
    { kind: "arch", x: -930, z: -160, yaw: 1.2 },
    { kind: "arch", x: 330, z: 640, yaw: 0.1 },
    { kind: "arch", x: -330, z: 330, yaw: -0.5 }
  ],
  // Named routes use actual NPC destinations. They are solved against Kael's
  // collision-aware navigation grid at startup rather than drawn through houses.
  kaelRoads: [
    { id: "pier_workshops", from: "pier_a", to: "smithy", width: 3.1 },
    { id: "pier_office", from: "pier_b", to: "harbor_office", width: 3.1 },
    { id: "quay_workshops", from: "quay", to: "smithy", width: 3.4 },
    { id: "waterfront", from: "pier_a", to: "pier_b", width: 3.2 },
    { id: "harbor_market", from: "quay", to: "stall_b", width: 3 },
    { id: "market_plaza", from: "stall_b", to: "plaza", width: 3.4 },
    { id: "market_guild", from: "plaza", to: "guild_board", width: 3 },
    { id: "market_inn", from: "plaza", to: "inn", width: 3 },
    { id: "market_monastery", from: "plaza", to: "monastery", width: 2.8 },
    { id: "west_workshops", from: "west_gate", to: "smithy", width: 3.2 },
    { id: "upper_gate", from: "monastery", to: "north_gate", width: 2.8 }
  ],
  // spots that NPC schedules refer to
  places: {
    plaza: [397, -432],
    guild_desk: [442, -433],
    guild_board: [435, -419],
    inn: [352, -430],
    inn_yard: [360, -440],
    smithy: [323, -391],
    harbor_office: [472, -390],
    stall_a: [300, -417],
    stall_b: [314, -417],
    stall_c: [300, -435],
    monastery: [392, -488],
    pier_a: [385, -340],
    pier_b: [455, -345],
    quay: [405, -390],
    fountain_bench: [406, -420],
    north_gate: [480, -500],
    west_gate: [240, -395]
  },
  waypoints: [
    { name: "\uCE74\uC5D8 \uD56D\uAD6C", x: 412, z: -418 },
    { name: "\uC5D0\uD14C\uB974 \uB4E4\uD310", x: -560, z: -400 },
    { name: "\uBD81\uCABD \uACE0\uC6D0", x: 200, z: -780 },
    { name: "\uACF5\uC911 \uD68C\uB791", x: 590, z: -572 },
    { name: "\uB3D9\uCABD \uB2A5\uC120", x: 980, z: -110 },
    { name: "\uCE68\uBB35\uC758 \uC218\uB3C4\uC6D0", x: 352, z: -490 },
    { name: "\uB0A8\uCABD \uC5B8\uB355", x: -120, z: 600 }
  ],
  spawn: { x: 430, z: -386, lookAt: [397, -470] },
  arrival: { x: 455, z: -338, lookAt: [397, -460] },
  // first launch: stepping off the cargo ship onto pier 3
  teleports: [
    { name: "\uCE74\uC5D8 \uD56D\uAD6C", x: 430, z: -386, lookAt: [397, -470] },
    { name: "\uC5D0\uD14C\uB974 \uB4E4\uD310", x: -600, z: -440, lookAt: [-740, -560] },
    { name: "\uCE68\uBB35\uC758 \uC218\uB3C4\uC6D0", x: 392, z: -485, lookAt: [392, -500] },
    { name: "\uACF5\uC911 \uD68C\uB791", x: 588, z: -572, lookAt: [550, -700] },
    { name: "\uB0A8\uCABD \uD574\uBCC0", x: -430, z: 800, lookAt: [-150, 900] },
    { name: "\uCE74\uC5D8 \uD56D\uAD6C 3/4 \uC870\uB9DD", x: 196, z: -165, y: 116, lookAt: [398, -468], fly: true, photo: true, pitch: -0.22 },
    { name: "\uCE74\uC5D8 \uD56D\uAD6C \uB3D9\uCABD \uC870\uB9DD", x: 568, z: -175, y: 110, lookAt: [397, -468], fly: true, photo: true, pitch: -0.18 },
    { name: "\uCE74\uC5D8 \uD56D\uAD6C \uC804\uBA74", x: 400, z: -230, y: 70, lookAt: [395, -450], fly: true, pitch: -0.05 },
    { name: "\uC12C \uC804\uACBD", x: 300, z: 1700, y: 560, lookAt: [100, -100], fly: true, pitch: -0.32 }
  ]
};
function mulberry32(a) {
  return function() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function makePerlin(seed) {
  const r = mulberry32(seed), a = new Uint8Array(256), perm = new Uint8Array(512);
  for (let i = 0; i < 256; i++) a[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = r() * (i + 1) | 0;
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = a[i & 255];
  const gx = [1, -1, 1, -1, 1.41, -1.41, 0, 0], gy = [1, 1, -1, -1, 0, 0, 1.41, -1.41];
  return function(x, y, period) {
    let X = Math.floor(x), Y = Math.floor(y);
    const fx = x - X, fy = y - Y;
    let X1 = X + 1, Y1 = Y + 1;
    if (period) {
      X = (X % period + period) % period;
      Y = (Y % period + period) % period;
      X1 = (X1 % period + period) % period;
      Y1 = (Y1 % period + period) % period;
    }
    X &= 255;
    Y &= 255;
    X1 &= 255;
    Y1 &= 255;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const h00 = perm[perm[X] + Y] & 7, h10 = perm[perm[X1] + Y] & 7, h01 = perm[perm[X] + Y1] & 7, h11 = perm[perm[X1] + Y1] & 7;
    const n00 = gx[h00] * fx + gy[h00] * fy, n10 = gx[h10] * (fx - 1) + gy[h10] * fy;
    const n01 = gx[h01] * fx + gy[h01] * (fy - 1), n11 = gx[h11] * (fx - 1) + gy[h11] * (fy - 1);
    const a0 = n00 + u * (n10 - n00), a1 = n01 + u * (n11 - n01);
    return a0 + v * (a1 - a0);
  };
}
var N1 = makePerlin(1337);
var N2 = makePerlin(7331);
var N3 = makePerlin(4242);
function fbm(n, x, y, o) {
  let s = 0, a = 1, f = 1, t = 0;
  for (let i = 0; i < o; i++) {
    s += a * n(x * f, y * f);
    t += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / t;
}
var sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
var mix = (a, b, t) => a + (b - a) * t;
var clamp2 = (x, a, b) => x < a ? a : x > b ? b : x;
function resample(pts, step) {
  const out2 = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < m; k++) {
      const t = k / m;
      out2.push(a.map((v, j) => v + (b[j] - v) * t));
    }
  }
  out2.push(pts[pts.length - 1].slice());
  return out2;
}
function catmull(pts, step, closed = false) {
  const out2 = [], n = pts.length, last = closed ? n : n - 1;
  const P2 = (i) => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < last; i++) {
    const p0 = P2(i - 1), p1 = P2(i), p2 = P2(i + 1), p3 = P2(i + 2);
    const m = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < m; k++) {
      const t = k / m, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out2.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out2.push(pts[n - 1].slice());
  return out2;
}
var Field = class {
  constructor({ half, cell, maxD, attrs = 0 }) {
    this.half = half;
    this.cell = cell;
    this.maxD = maxD;
    this.n = Math.round(2 * half / cell) + 1;
    const N = this.n * this.n;
    this.D = new Float32Array(N).fill(maxD);
    this.A = attrs > 0 ? new Float32Array(N) : null;
    this.B = attrs > 1 ? new Float32Array(N) : null;
    this.segs = [];
    this.polys = [];
    this.bbox = [Infinity, Infinity, -Infinity, -Infinity];
    this.d = maxD;
    this.a = 0;
    this.b = 0;
  }
  addPolyline(pts) {
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      this._seg(p[0], p[1], q[0], q[1], p[2] ?? 0, q[2] ?? 0, p[3] ?? 0, q[3] ?? 0);
    }
    return this;
  }
  addPolygon(pts) {
    this.polys.push(pts);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      this._seg(p[0], p[1], q[0], q[1], 0, 0, 0, 0);
    }
    return this;
  }
  _seg(ax, az, bx, bz, a0, a1, b0, b1) {
    const dx = bx - ax, dz = bz - az;
    this.segs.push({ ax, az, dx, dz, l2: dx * dx + dz * dz || 1e-9, a0, a1, b0, b1 });
    const b = this.bbox;
    b[0] = Math.min(b[0], ax, bx);
    b[1] = Math.min(b[1], az, bz);
    b[2] = Math.max(b[2], ax, bx);
    b[3] = Math.max(b[3], az, bz);
  }
  build() {
    const { n, cell, half, maxD, D, A, B: B2 } = this;
    for (const s of this.segs) {
      const x0 = Math.min(s.ax, s.ax + s.dx) - maxD, x1 = Math.max(s.ax, s.ax + s.dx) + maxD;
      const z0 = Math.min(s.az, s.az + s.dz) - maxD, z1 = Math.max(s.az, s.az + s.dz) + maxD;
      const i0 = Math.max(0, Math.floor((x0 + half) / cell)), i1 = Math.min(n - 1, Math.ceil((x1 + half) / cell));
      const j0 = Math.max(0, Math.floor((z0 + half) / cell)), j1 = Math.min(n - 1, Math.ceil((z1 + half) / cell));
      for (let j = j0; j <= j1; j++) {
        const z = -half + j * cell;
        for (let i = i0; i <= i1; i++) {
          const x = -half + i * cell;
          let t = ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.l2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px2 = s.ax + s.dx * t - x, pz2 = s.az + s.dz * t - z, d = Math.sqrt(px2 * px2 + pz2 * pz2);
          const o = j * n + i;
          if (d < D[o]) {
            D[o] = d;
            if (A) A[o] = s.a0 + (s.a1 - s.a0) * t;
            if (B2) B2[o] = s.b0 + (s.b1 - s.b0) * t;
          }
        }
      }
    }
    if (this.polys.length) {
      const inside2 = new Uint8Array(n * n);
      for (const poly of this.polys) {
        for (let j = 0; j < n; j++) {
          const z = -half + j * cell, xs = [];
          for (let k = 0; k < poly.length; k++) {
            const p = poly[k], q = poly[(k + 1) % poly.length];
            if (p[1] > z !== q[1] > z) xs.push(p[0] + (z - p[1]) / (q[1] - p[1]) * (q[0] - p[0]));
          }
          xs.sort((a, b) => a - b);
          for (let k = 0; k + 1 < xs.length; k += 2) {
            const i0 = Math.max(0, Math.ceil((xs[k] + half) / cell)), i1 = Math.min(n - 1, Math.floor((xs[k + 1] + half) / cell));
            for (let i = i0; i <= i1; i++) inside2[j * n + i] = 1;
          }
        }
      }
      for (let o = 0; o < n * n; o++) if (!inside2[o]) D[o] = -D[o];
    }
    return this;
  }
  // cheap reject: false when (x,z) is surely beyond maxD + pad of every shape
  near(x, z, pad = 0) {
    const b = this.bbox, m = this.maxD + pad;
    return x > b[0] - m && x < b[2] + m && z > b[1] - m && z < b[3] + m;
  }
  sample(x, z) {
    const n = this.n, g = (x + this.half) / this.cell, k = (z + this.half) / this.cell;
    if (g < 0 || k < 0 || g >= n - 1 || k >= n - 1) return this.brute(x, z);
    const i = g | 0, j = k | 0, fx = g - i, fz = k - j, o = j * n + i;
    const bl = (Q) => {
      const a = Q[o] + (Q[o + 1] - Q[o]) * fx, b = Q[o + n] + (Q[o + n + 1] - Q[o + n]) * fx;
      return a + (b - a) * fz;
    };
    this.d = bl(this.D);
    if (this.A) this.a = bl(this.A);
    if (this.B) this.b = bl(this.B);
    return this.d;
  }
  brute(x, z) {
    let best = Infinity, bs = null, bt = 0;
    for (const s of this.segs) {
      let t = ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px2 = s.ax + s.dx * t - x, pz2 = s.az + s.dz * t - z, d2 = px2 * px2 + pz2 * pz2;
      if (d2 < best) {
        best = d2;
        bs = s;
        bt = t;
      }
    }
    let d = Math.min(this.maxD, Math.sqrt(best));
    if (bs) {
      this.a = bs.a0 + (bs.a1 - bs.a0) * bt;
      this.b = bs.b0 + (bs.b1 - bs.b0) * bt;
    }
    if (this.polys.length) {
      let inside2 = false;
      for (const poly of this.polys) {
        let c = false;
        for (let k = 0, m = poly.length - 1; k < poly.length; m = k++) {
          const p = poly[k], q = poly[m];
          if (p[1] > z !== q[1] > z && x < (q[0] - p[0]) * (z - p[1]) / (q[1] - p[1]) + p[0]) c = !c;
        }
        if (c) {
          inside2 = true;
          break;
        }
      }
      if (!inside2) d = -d;
    }
    this.d = d;
    return d;
  }
};
