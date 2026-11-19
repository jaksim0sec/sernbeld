var TerrainEdit = (() => {
  const patch = SERNBELD_TERRAIN_PATCH, G = patch.grid, T2 = patch.tiles.size;
  if (patch.format !== "sernbeld-height-delta-v1" || G.half !== CFG.half || G.size !== Math.round(G.half * 2 / G.cell) + 1 || patch.tiles.encoding !== "int16_le_centimeter_base64")
    throw new Error("\uC9C0\uD615 \uC218\uC815 \uB370\uC774\uD130\uAC00 \uD604\uC7AC \uAC8C\uC784 \uC5D4\uC9C4\uACFC \uD638\uD658\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  const values = new Float32Array(G.size * G.size);
  for (const block of patch.tiles.blocks) {
    if (!Number.isInteger(block.tx) || !Number.isInteger(block.tz) || block.tx < 0 || block.tz < 0 || block.tx * T2 >= G.size || block.tz * T2 >= G.size) throw new Error("\uC9C0\uD615 \uD0C0\uC77C \uC88C\uD45C\uAC00 \uC798\uBABB\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
    const bytes = atob(block.data);
    if (bytes.length !== T2 * T2 * 2) throw new Error("\uC9C0\uD615 \uD0C0\uC77C \uAE38\uC774\uAC00 \uC798\uBABB\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
    for (let j = 0; j < T2; j++) for (let i = 0; i < T2; i++) {
      const ix = block.tx * T2 + i, iz = block.tz * T2 + j;
      if (ix >= G.size || iz >= G.size) continue;
      const p = (j * T2 + i) * 2;
      let cm = bytes.charCodeAt(p) | bytes.charCodeAt(p + 1) << 8;
      if (cm & 32768) cm -= 65536;
      values[iz * G.size + ix] = cm * 0.01;
    }
  }
  const last = G.size - 1;
  function at(x, z) {
    const outside = Math.max(Math.abs(x) - G.half, Math.abs(z) - G.half, 0);
    if (outside >= 25) return 0;
    const gx = Math.max(0, Math.min(last, (x + G.half) / G.cell)), gz = Math.max(0, Math.min(last, (z + G.half) / G.cell));
    const ix = Math.min(last - 1, Math.floor(gx)), iz = Math.min(last - 1, Math.floor(gz));
    const fx = gx - ix, fz = gz - iz, o = iz * G.size + ix;
    const a = values[o] + (values[o + 1] - values[o]) * fx;
    const b = values[o + G.size] + (values[o + G.size + 1] - values[o + G.size]) * fx;
    return (a + (b - a) * fz) * (outside ? 1 - outside / 25 : 1);
  }
  return { at };
})();
var TERRACES = [
  { id: "upper", name: "\uC0C1\uBD80 \uAD6C\uC5ED", y: 78, poly: [
    [317, -520],
    [354, -526],
    [389, -520],
    [429, -522],
    [468, -517],
    [510, -516],
    [514, -500],
    [512, -484],
    [495, -484],
    [463, -482],
    [451, -482],
    [445, -484],
    [409, -484],
    [396, -481],
    [383, -481],
    [379, -484],
    [351, -484],
    [337, -482],
    [328, -484],
    [317, -493]
  ] },
  { id: "homes", name: "\uC0C1\uCE35 \uC8FC\uAC70\uC9C0", y: 50, poly: [
    [286, -492],
    [318, -494],
    [354, -488],
    [398, -484],
    [463, -489],
    [508, -492],
    [524, -478],
    [523, -452],
    [499, -449],
    [477, -452],
    [438, -452],
    [430, -450],
    [422, -452],
    [375, -452],
    [365, -450],
    [349, -452],
    [332, -449],
    [318, -452],
    [300, -452],
    [286, -463]
  ] },
  { id: "market", name: "\uC2DC\uAC00\uC9C0", y: 24, poly: [
    [260, -460],
    [291, -464],
    [331, -458],
    [372, -452],
    [422, -452],
    [469, -458],
    [512, -456],
    [537, -441],
    [538, -420],
    [520, -412],
    [500, -412],
    [478, -408],
    [466, -412],
    [437, -412],
    [427, -409],
    [417, -412],
    [354, -412],
    [342, -408],
    [330, -409],
    [319, -412],
    [280, -412],
    [260, -420],
    [255, -441]
  ] },
  { id: "harbor", name: "\uD56D\uB9CC\uAD6C\uC5ED", y: 3.2, poly: [
    [202, -475],
    [263, -475],
    [268, -425],
    [268, -412],
    [323, -412],
    [359, -413],
    [412, -412],
    [465, -414],
    [510, -414],
    [529, -403],
    [531, -381],
    [520, -372],
    [485, -369],
    [454, -373],
    [415, -370],
    [386, -374],
    [344, -370],
    [311, -374],
    [275, -369],
    [238, -371],
    [195, -375]
  ] }
];
var WALL = 2.6;
var STAIR_W = 5;
var S = (a, b, y0, y1, n = [0, 1]) => ({ a, b, y0, y1, n });
var STAIRS = [
  // 항만 → 시가지: 중앙 쌍계단
  S([420, -412], [389, -412], 3.2, 24.06),
  S([381, -412], [389, -412], 24.06, 24.06),
  S([350, -412], [381, -412], 3.2, 24.06),
  // 시가지 → 상층 주거지
  S([444, -452], [401, -452], 24, 50.06),
  S([393, -452], [401, -452], 50.06, 50.06),
  S([350, -452], [393, -452], 24, 50.06),
  // 상층 주거지 → 상부 구역(수도원 정문)
  S([446, -484], [400, -484], 50, 78.06),
  S([392, -484], [400, -484], 78.06, 78.06),
  S([346, -484], [392, -484], 50, 78.06),
  // 상부 구역 → 북쪽 고원(공중 회랑)
  S([438, -510], [492, -510], 78, 107.4),
  S([492, -510], [498, -510], 107.4, 107.4),
  // Offset side alleys: the harbor-to-market path is on the west, the upper
  // market-to-homes link on the east, breaking the symmetry of the central stairs.
  S([260, -392], [260, -429], 3.2, 24.06, [1, 0]),
  S([513, -431], [513, -472], 24, 50.06, [1, 0])
];
var P = Math.PI;
var BUILDINGS = [
  // 항만구역
  { type: "office", role: "harbor", name: "\uD56D\uB9CC \uAD00\uB9AC\uC18C", x: 472, z: -397, w: 15, d: 10, h: 9, yaw: 0 },
  { type: "warehouse", x: 441, z: -398, w: 13, d: 9, h: 8, yaw: 0 },
  { type: "smithy", role: "smithy", name: "\uACE0\uB78C\uC758 \uB300\uC7A5\uAC04", x: 323, z: -398, w: 14, d: 10, h: 7, yaw: 0 },
  { type: "warehouse", x: 298, z: -399, w: 13, d: 10, h: 8, yaw: 0 },
  { type: "warehouse", x: 275, z: -398, w: 11, d: 10, h: 7, yaw: 0 },
  { type: "shipyard", name: "\uC870\uC120 \uC791\uC5C5\uC7A5", x: 231, z: -432, w: 26, d: 34, h: 11, yaw: 0 },
  // 시가지
  { type: "guild", role: "guild", name: "\uBC14\uB78C\uAE38 \uC870\uD569", x: 454, z: -431, w: 22, d: 16, h: 17, yaw: -P / 2 },
  { type: "inn", role: "inn", name: "\uC5EC\uAD00 \uBC14\uB78C\uB9C9\uC774", x: 341, z: -431, w: 20, d: 14, h: 15, yaw: P / 2 },
  { type: "house", x: 296, z: -442, w: 12, d: 8, h: 8, yaw: 0, shop: 1 },
  { type: "house", x: 310, z: -428, w: 9, d: 8, h: 7, yaw: P / 2, shop: 1 },
  { type: "house", x: 487, z: -438, w: 11, d: 9, h: 9, yaw: -P / 2 },
  { type: "house", x: 488, z: -421, w: 10, d: 9, h: 8, yaw: -P / 2, shop: 1 },
  { type: "house", x: 318, z: -445, w: 10, d: 7, h: 9, yaw: 0, shop: 1 },
  { type: "house", x: 476, z: -445.5, w: 9, d: 7, h: 10, yaw: 0, balcony: true },
  { type: "house", x: 490, z: -401, w: 9, d: 8, h: 8, yaw: 0 },
  // 상층 주거지(한 줄, 가운데는 계단 길)
  ...[[312, 13], [328, 12], [344, 13], [360, 12], [376, 13], [420, 13], [436, 12], [452, 13], [468, 12], [485, 13]].map(([x, w], i) => ({ type: "house", home: 1, x, z: -463, w, d: 9, h: 10 + i * 5 % 5, yaw: 0, balcony: i % 3 === 1 })),
  // 상부 구역
  { type: "monastery", name: "\uCE68\uBB35\uC758 \uC218\uB3C4\uC6D0", x: 392, z: -498, w: 40, d: 14, h: 16, yaw: 0 }
];
var SKYLINE_BUILDINGS = [
  // Upper quarter: annexes around the monastery, uneven roofs and wings.
  { type: "house", x: 346, z: -497, w: 17, d: 11, h: 15, yaw: 0 },
  { type: "house", x: 363, z: -498, w: 14, d: 11, h: 12, yaw: 0 },
  { type: "house", x: 433, z: -498, w: 15, d: 12, h: 16, yaw: 0 },
  { type: "house", x: 451, z: -499, w: 17, d: 11, h: 13, yaw: 0 },
  { type: "house", x: 474, z: -499, w: 16, d: 10, h: 17, yaw: 0 },
  // Second row of stepped homes. The front row is retained for usable streets.
  { type: "house", x: 309, z: -476, w: 13, d: 9, h: 14, yaw: 0, balcony: true },
  { type: "house", x: 326, z: -476, w: 13, d: 9, h: 12, yaw: 0 },
  { type: "house", x: 460, z: -475, w: 12, d: 9, h: 14, yaw: 0, balcony: true },
  { type: "house", x: 481, z: -476, w: 13, d: 9, h: 13, yaw: 0 },
  // Workshop courtyard along the quieter west quay, outside the main route.
  { type: "house", x: 342, z: -383, w: 13, d: 9, h: 11, yaw: 0, shop: 1 },
  { type: "house", x: 361, z: -382, w: 15, d: 10, h: 13, yaw: 0 },
  // Market's outside edges: multi-level house fronts, open central plaza preserved.
  { type: "house", x: 286, z: -428, w: 10, d: 9, h: 13, yaw: 0, shop: 1 },
  { type: "house", x: 292, z: -416, w: 10, d: 8, h: 12, yaw: 0, shop: 1 },
  { type: "house", x: 471, z: -419, w: 12, d: 9, h: 12, yaw: 0, shop: 1 },
  // Nonparallel city wings outside old rectangular silhouettes.
  { type: "house", x: 321, z: -506, w: 13, d: 10, h: 16, yaw: -0.16 },
  { type: "house", x: 500, z: -502, w: 14, d: 10, h: 14, yaw: 0.22 },
  { type: "house", x: 290, z: -478, w: 13, d: 10, h: 15, yaw: 0.13, balcony: true },
  { type: "house", x: 503, z: -471, w: 13, d: 10, h: 17, yaw: -0.18 },
  { type: "house", x: 277, z: -441, w: 11, d: 9, h: 14, yaw: 0.2, shop: 1 },
  { type: "house", x: 531, z: -426, w: 14, d: 10, h: 16, yaw: -0.12, shop: 1 },
  { type: "house", x: 514, z: -395, w: 11, d: 9, h: 11, yaw: 0.2 },
  { type: "house", x: 221, z: -400, w: 12, d: 11, h: 12, yaw: 0.22 }
];
var STALLS = [
  { x: 300, z: -420, yaw: 0, c: 0 },
  { x: 314, z: -420, yaw: 0, c: 1 },
  { x: 300, z: -432, yaw: P, c: 2 },
  { x: 357, z: -423, yaw: -P / 2, c: 1 },
  { x: 432, z: -423, yaw: P / 2, c: 3 },
  { x: 366, z: -438, yaw: 0, c: 2 },
  { x: 427, z: -438, yaw: P, c: 0 },
  // 시장 거리
  { x: 372, z: -386, yaw: 0, c: 3 },
  { x: 386, z: -385, yaw: 0, c: 1 },
  { x: 400, z: -386, yaw: 0, c: 0 }
  // 어시장
];
var PIERS = [
  { a: [300, -376], b: [300, -336] },
  { a: [385, -376], b: [385, -326] },
  { a: [455, -376], b: [455, -330] }
];
var SHIP = { x: 467, z: -346, yaw: 0 };
var LIGHTHOUSE = { x: 500, z: -383 };
var FOUNTAIN = { x: 397, z: -428 };
var BOARD = { x: 438, z: -419, yaw: -P / 2 };
var VIEWPOINT = { x: 343, z: -496 };
var BOUNDS = { x0: 188, z0: -533, x1: 545, z1: -322 };
var World = {
  region: null,
  sun: new Vector3(),
  F: {},
  // distance fields
  H: null,
  // Float32 heightfield GRID_N^2
  roads: [],
  rivers: [],
  heightTex: null,
  maskTex: null,
  bakeTex: null
};
var nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
var HALF = CFG.half;
function buildFields(R) {
  const fc = CFG.fieldCell, F = World.F;
  F.coast = new Field({ half: HALF, cell: fc, maxD: 420 }).addPolygon(catmull(R.coast, 30, true)).build();
  F.tiers = R.tiers.map((t) => ({ t, f: new Field({ half: HALF, cell: fc, maxD: 160 }).addPolygon(catmull(t.poly, 25, true)).build() }));
  F.pads = R.pads.map((p) => ({ p, f: new Field({ half: HALF, cell: fc, maxD: 60 }).addPolygon(p.poly).build() }));
  F.beach = new Field({ half: HALF, cell: fc, maxD: 140 });
  for (const b of R.beaches) F.beach.addPolyline(catmull(b, 15));
  F.beach.build();
  F.flower = new Field({ half: HALF, cell: fc, maxD: 40 });
  for (const p of R.flowers) F.flower.addPolygon(catmull(p, 25, true));
  F.flower.build();
  F.river = new Field({ half: HALF, cell: fc, maxD: 120, attrs: 2 });
  for (const r of R.rivers) {
    const pts = resample(r.pts.map((p) => [p[0], p[1], p[2], r.width]), 5);
    F.river.addPolyline(pts);
    World.rivers.push({ id: r.id, width: r.width, pts });
  }
  F.river.build();
}
var HQ = { town: 0, coast: 0, pad: 0, beach: 0, river: 1e9, riverY: -1e9, riverW: 0, road: 1e9, roadW: 0 };
function islandProfile(h, x, z, I, sea) {
  const dx = x - I.x, dz = z - I.z, R = I.r * 1.7;
  if (dx * dx + dz * dz > R * R) return h;
  const d = Math.hypot(dx, dz) + I.r * 0.28 * fbm(N2, x * 0.03 + I.x, z * 0.03, 3);
  const m = 1 - d / I.r;
  const k = 0.18 * sstep(-0.6, 0, m) ** 2 + 0.82 * sstep(-0.02, 0.22, m);
  const top = I.h * (1 + 0.15 * fbm(N1, x * 0.02, z * 0.02 + I.z, 2));
  return Math.max(h, mix(sea, top, k));
}
function heightBase(x, z) {
  const R = World.region, F = World.F;
  const sdc = F.coast.sample(x, z);
  const e = sdc + 9 * fbm(N3, x * 0.021, z * 0.021, 3) + 24 * fbm(N2, x * 52e-4, z * 52e-4, 3);
  HQ.coast = e;
  HQ.pad = 0;
  HQ.beach = 0;
  HQ.town = 0;
  const sea = -2.2 - 24 * sstep(0, 240, -e);
  let h;
  if (e < -60) h = sea;
  else {
    let land = R.baseHeight + 6 * fbm(N1, x * 28e-4, z * 28e-4, 4) + 2 * fbm(N2, x * 0.012, z * 0.012, 3);
    const jagT = 7 * fbm(N3, x * 0.024 + 3, z * 0.024, 3) + 14 * fbm(N1, x * 6e-3, z * 6e-3 + 9, 2);
    for (const { t, f } of F.tiers) {
      if (!f.near(x, z, 30)) continue;
      const s = f.sample(x, z) + jagT;
      if (s < -110) continue;
      const top = t.h + 5 * fbm(N2, x * 45e-4 + t.h, z * 45e-4, 3);
      const k = 0.12 * sstep(-100, 6, s) ** 2 + 0.88 * sstep(-4, t.cliff, s);
      land = Math.max(land, land + (top - land) * k);
    }
    for (const { p, f } of F.pads) {
      if (!f.near(x, z, 20)) continue;
      const s = f.sample(x, z);
      if (s < -30) continue;
      const k = sstep(-14, 4, s);
      land = mix(land, p.h, k);
      if (k > HQ.pad) HQ.pad = k;
    }
    let beachK = 0;
    if (F.beach.near(x, z)) beachK = 1 - sstep(50, 110, F.beach.sample(x, z));
    HQ.beach = beachK;
    let landP = land;
    if (beachK > 0) landP = mix(land, Math.max(1 + Math.max(e, 0) * 0.035, land * sstep(40, 66, e)), beachK);
    const c = sstep(mix(-4, -38, beachK), mix(20, 8, beachK), e);
    h = mix(sea, landP, c);
  }
  for (const I of R.islets) h = islandProfile(h, x, z, I, sea);
  if (Math.abs(x) > HALF * 0.9 || Math.abs(z) > HALF * 0.9) for (const I of R.farIslands) h = islandProfile(h, x, z, I, sea);
  return h;
}
function heightFn(x, z) {
  let h = heightBase(x, z);
  const F = World.F;
  HQ.river = 1e9;
  HQ.riverY = -1e9;
  if (F.river.near(x, z)) {
    const d = F.river.sample(x, z);
    if (d < 110) {
      const wy = F.river.a, w = F.river.b;
      HQ.river = d;
      HQ.riverY = wy;
      HQ.riverW = w;
      if (d < w * 9) {
        const bed = wy - 2.4;
        const inner = Math.min(h, bed + 2.9 * sstep(0, w * 1.35, d));
        const raise = h < wy + 0.5 && h > wy - 6 ? wy + 0.5 + 2 * sstep(w * 1.3, w * 5, d) : h;
        const outer = Math.max(h, raise);
        const hr = mix(inner, outer, sstep(w * 0.9, w * 2.6, d));
        h = mix(h, hr, 1 - sstep(w * 4, w * 9, d));
      }
    }
  }
  HQ.road = 1e9;
  if (F.road && F.road.near(x, z)) {
    const d = F.road.sample(x, z);
    if (d < 70) {
      const rh = F.road.a, w = F.road.b;
      HQ.road = d;
      HQ.roadW = w;
      const bank = 4 + Math.abs(h - rh) * 1.25;
      h = mix(h, rh, 1 - sstep(w * 0.5, w * 0.5 + bank, d));
    }
  }
  h += TerrainEdit.at(x, z);
  const t = townHeight(x, z);
  if (t !== null) {
    HQ.pad = 1;
    HQ.town = 1;
    HQ.road = 1e9;
    HQ.beach = 0;
    HQ.river = 1e9;
    return t;
  }
  return h;
}
function inPoly(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function stairUV(s, x, z) {
  const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz);
  const px2 = x - s.a[0], pz2 = z - s.a[1];
  return [(px2 * dx + pz2 * dz) / L, px2 * s.n[0] + pz2 * s.n[1], L];
}
var STAIR_V = WALL + STAIR_W + 1;
var STAIR_MIN_V = 0.02;
var STAIR_MAX_V = STAIR_V + WALL;
function stairSurface(x, z, margin = 0, exactTreads = false) {
  for (const s of STAIRS) {
    const [u, v, L] = stairUV(s, x, z);
    if (u < -margin || u > L + margin || v < STAIR_MIN_V - margin || v > STAIR_MAX_V + margin) continue;
    const run = Math.max(0, Math.min(L, u));
    if (!exactTreads) return s.y0 + (s.y1 - s.y0) * run / L;
    const steps = Math.max(1, Math.ceil(Math.abs(s.y1 - s.y0) / 0.3));
    const k = Math.min(steps - 1, Math.floor(run / L * steps));
    if (k === 0) return s.y0 + 0.06;
    if (k === steps - 1) return s.y1 + 0.06;
    return s.y0 + (s.y1 - s.y0) * (k + 0.5) / steps + 0.06;
  }
  return null;
}
function stairHeight(x, z) {
  return stairSurface(x, z);
}
function stairTreadAt(x, z) {
  return stairSurface(x, z, 0.16, true);
}
function terraceAt(x, z) {
  for (const t of TERRACES) if (inPoly(t.poly, x, z)) return t;
  return null;
}
function townHeight(x, z) {
  const B2 = BOUNDS;
  if (x < B2.x0 || x > B2.x1 || z < B2.z0 || z > B2.z1) return null;
  const s = stairHeight(x, z);
  if (s !== null) return s;
  const t = terraceAt(x, z);
  return t ? t.y : null;
}
function roadHeightNear(x, z, r) {
  let best = r, h = null;
  for (const rd of World.roads) for (let i = 0; i < rd.pts.length; i++) {
    const d = Math.hypot(rd.pts[i][0] - x, rd.pts[i][1] - z);
    if (d < best) {
      best = d;
      h = rd.h[i];
    }
  }
  return h;
}
function solveRoads(R) {
  const F = World.F;
  F.road = new Field({ half: HALF, cell: CFG.fieldCell, maxD: 70, attrs: 2 });
  for (const r of R.roads) {
    const pts = catmull(r.pts, 5), n = pts.length;
    let hs = pts.map((p) => Math.max(1.4, heightBase(p[0], p[1])));
    for (let pass = 0; pass < 3; pass++) {
      const s = hs.slice();
      for (let i = 0; i < n; i++) {
        let a = 0, c = 0;
        for (let k = -4; k <= 4; k++) {
          const j = i + k;
          if (j >= 0 && j < n) {
            a += hs[j];
            c++;
          }
        }
        s[i] = a / c;
      }
      hs = s;
    }
    const g = r.grade ?? 0.16, ds = [0];
    for (let i = 1; i < n; i++) ds.push(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const f = hs.slice(), b = hs.slice();
    for (let i = 1; i < n; i++) f[i] = Math.min(f[i - 1] + g * ds[i], Math.max(f[i - 1] - g * ds[i], f[i]));
    for (let i = n - 2; i >= 0; i--) b[i] = Math.min(b[i + 1] + g * ds[i + 1], Math.max(b[i + 1] - g * ds[i + 1], b[i]));
    const out2 = f.map((v, i) => (v + b[i]) / 2);
    const cum = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + ds[i]);
    for (const [idx, dist] of [[0, (i) => cum[i]], [n - 1, (i) => cum[n - 1] - cum[i]]]) {
      const pin = roadHeightNear(pts[idx][0], pts[idx][1], 8);
      if (pin === null) continue;
      const delta = pin - out2[idx];
      for (let i = 0; i < n; i++) out2[i] += delta * Math.max(0, 1 - dist(i) / 90);
    }
    F.road.addPolyline(pts.map((p, i) => [p[0], p[1], out2[i], r.width]));
    World.roads.push({ id: r.id, width: r.width, pts, h: out2 });
  }
  F.road.build();
}
async function generateWorld(R, progress) {
  World.region = R;
  World.sun.set(...R.sun).normalize();
  progress(0.02, "\uC9C0\uD615 \uC124\uACC4\uB3C4\uB97C \uC77D\uB294 \uC911");
  await nextFrame();
  buildFields(R);
  solveRoads(R);
  progress(0.08, "\uC9C0\uD615\uC744 \uB9CC\uB4DC\uB294 \uC911");
  await nextFrame();
  const n = GRID_N, H = new Float32Array(n * n), mask = new Uint8Array(n * n * 4), F = World.F;
  for (let j = 0; j < n; j++) {
    const z = -HALF + j * CFG.cell;
    for (let i = 0; i < n; i++) {
      const x = -HALF + i * CFG.cell, o = j * n + i;
      const h = heightFn(x, z);
      H[o] = h;
      const road = HQ.road < 1e8 ? 1 - sstep(HQ.roadW * 0.5 - 0.4, HQ.roadW * 0.5 + 1.2, HQ.road) : 0;
      const bank = HQ.river < 1e8 ? 1 - sstep(HQ.riverW * 0.85, HQ.riverW * 1.35 + 2.5, HQ.river) : 0;
      const shore = HQ.beach * (1 - sstep(30, 70, HQ.coast));
      const sand = Math.max(bank, shore, h < 1.2 ? sstep(1.2, -0.5, h) : 0);
      const fl = F.flower.near(x, z) ? sstep(-10, 25, F.flower.sample(x, z)) : 0;
      mask[o * 4] = 255 * road;
      mask[o * 4 + 1] = 255 * sand;
      mask[o * 4 + 2] = 255 * fl;
      mask[o * 4 + 3] = HQ.town ? 255 : 230 * HQ.pad;
    }
    if ((j & 31) === 0) {
      progress(0.08 + 0.6 * j / n, "\uC9C0\uD615\uC744 \uB9CC\uB4DC\uB294 \uC911");
      await nextFrame();
    }
  }
  World.H = H;
  World.mask = mask;
  const bn = Math.round(HALF * 2 / CFG.bakeCell) + 1, bake = new Uint8Array(bn * bn * 4);
  const S2 = World.sun, hyp = Math.hypot(S2.x, S2.z), sdx = S2.x / hyp, sdz = S2.z / hyp, tanE = S2.y / hyp;
  const dirs = [];
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2 + 0.2;
    dirs.push([Math.cos(a), Math.sin(a)]);
  }
  const aoSteps = [4, 10, 20, 40, 80];
  for (let j = 0; j < bn; j++) {
    const z = -HALF + j * CFG.bakeCell;
    for (let i = 0; i < bn; i++) {
      const x = -HALF + i * CFG.bakeCell, h0 = sampleClamped(x, z) + 0.4;
      let occ = 0;
      for (let t = 3; t < 800; t += 2 + t * 0.085) {
        const e = sampleClamped(x + sdx * t, z + sdz * t) - (h0 + t * tanE);
        if (e > 0) {
          occ = Math.max(occ, e / (1.6 + t * 0.032));
          if (occ >= 1) break;
        }
      }
      let hor = 0;
      for (const [dx, dz] of dirs) {
        let m = 0;
        for (const s of aoSteps) {
          const e = (sampleClamped(x + dx * s, z + dz * s) - h0) / s;
          if (e > m) m = e;
        }
        hor += Math.min(1, m * 0.9);
      }
      hor /= dirs.length;
      const o = (j * bn + i) * 4;
      bake[o] = Math.round(255 * (1 - Math.min(1, occ)));
      bake[o + 1] = Math.round(255 * Math.max(0, 1 - hor * 1.15));
      bake[o + 2] = 0;
      bake[o + 3] = 255;
    }
    if ((j & 15) === 0) {
      progress(0.68 + 0.27 * j / bn, "\uBE5B\uACFC \uADF8\uB298\uC744 \uAD7D\uB294 \uC911");
      await nextFrame();
    }
  }
  const tex = (data, size, format, type) => {
    const t = new DataTexture(data, size, size, format, type);
    t.magFilter = t.minFilter = LinearFilter;
    t.flipY = false;
    t.needsUpdate = true;
    return t;
  };
  World.bakeTex = tex(bake, bn, RGBAFormat, UnsignedByteType);
  World.maskTex = tex(mask, n, RGBAFormat, UnsignedByteType);
  const hh = new Uint16Array(n * n);
  for (let i = 0; i < n * n; i++) hh[i] = DataUtils.toHalfFloat(H[i]);
  World.heightTex = tex(hh, n, RedFormat, HalfFloatType);
  World.heightTex.unpackAlignment = 2;
}
function sample(x, z) {
  const g = (x + HALF) / CFG.cell, k = (z + HALF) / CFG.cell;
  if (g < 0 || k < 0 || g >= GRID_N - 1 || k >= GRID_N - 1) return heightFn(x, z);
  const i = g | 0, j = k | 0, fx = g - i, fz = k - j, n = GRID_N, H = World.H, o = j * n + i;
  const a = H[o] + (H[o + 1] - H[o]) * fx, b = H[o + n] + (H[o + n + 1] - H[o + n]) * fx;
  return a + (b - a) * fz;
}
function sampleClamped(x, z) {
  const lim = HALF - 0.01;
  return sample(Math.max(-lim, Math.min(lim, x)), Math.max(-lim, Math.min(lim, z)));
}
function normalAt(x, z, out2) {
  const e = 1.25, dx = sample(x - e, z) - sample(x + e, z), dz = sample(x, z - e) - sample(x, z + e);
  const inv = 1 / Math.hypot(dx, 2 * e, dz);
  return out2.set(dx * inv, 2 * e * inv, dz * inv);
}
function maskAt(x, z, out2 = [0, 0, 0, 0]) {
  const i = Math.round((x + HALF) / CFG.cell), j = Math.round((z + HALF) / CFG.cell);
  if (i < 0 || j < 0 || i >= GRID_N || j >= GRID_N) {
    out2.fill(0);
    return out2;
  }
  const o = (j * GRID_N + i) * 4, M = World.mask;
  out2[0] = M[o] / 255;
  out2[1] = M[o + 1] / 255;
  out2[2] = M[o + 2] / 255;
  out2[3] = M[o + 3] / 255;
  return out2;
}
function waterLevel(x, z, ground = sample(x, z)) {
  let y = CFG.seaLevel;
  const F = World.F.river;
  if (F.near(x, z)) {
    const d = F.sample(x, z);
    if (d < F.b * 1.2 && F.a - ground < 3.2) y = Math.max(y, F.a);
  }
  return y;
}
