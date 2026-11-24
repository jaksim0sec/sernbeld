const ROWS = 24;
const ANGLES = 24;
const FIRST = .06;
const LAST = .96;
const TAU = 2 * Math.PI;
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, value) => {
  const t = Math.max(0,Math.min(1,(value-a)/(b-a)));
  return t*t*(3-2*t);
};

function sections(points, index, belongs) {
  const rows = Array.from({length: ROWS + 1}, () => []);
  const step = (LAST - FIRST) / ROWS;
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i], b = index[i + 1], c = index[i + 2];
    if (!belongs(a) || !belongs(b) || !belongs(c)) continue;
    const lo = Math.min(points[a * 3 + 1], points[b * 3 + 1], points[c * 3 + 1]);
    const hi = Math.max(points[a * 3 + 1], points[b * 3 + 1], points[c * 3 + 1]);
    const start = Math.max(0, Math.ceil((lo - FIRST) / step));
    const end = Math.min(ROWS, Math.floor((hi - FIRST) / step));
    for (let row = start; row <= end; row++) {
      const height = FIRST + row * step;
      const segment = [];
      for (const [u, v] of [[a,b],[b,c],[c,a]]) {
        const p = u * 3, q = v * 3, y = points[p + 1], nextY = points[q + 1];
        if ((y > height) === (nextY > height)) continue;
        const t = (height - y) / (nextY - y);
        segment.push(mix(points[p], points[q], t), mix(points[p+2], points[q+2], t));
      }
      if (segment.length === 4) rows[row].push(segment);
    }
  }
  return rows;
}

function perimeter(segments, radiusLimit) {
  if (segments.length < 4) return null;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [a,b,c,d] of segments) {
    minX = Math.min(minX, a, c); maxX = Math.max(maxX, a, c);
    minZ = Math.min(minZ, b, d); maxZ = Math.max(maxZ, b, d);
  }
  const x = (minX + maxX) / 2, z = (minZ + maxZ) / 2;
  const radii = new Float32Array(ANGLES);
  for (let i = 0; i < ANGLES; i++) {
    const angle = TAU * i / ANGLES, dx = Math.cos(angle), dz = Math.sin(angle);
    for (const [a,b,c,d] of segments) {
      const ex = c - a, ez = d - b, det = dx * ez - dz * ex;
      if (Math.abs(det) < 1e-9) continue;
      const px = a - x, pz = b - z;
      const ray = (px * ez - pz * ex) / det, edge = (px * dz - pz * dx) / det;
      if (edge >= -1e-5 && edge <= 1.00001 && ray <= radiusLimit && ray > radii[i]) radii[i] = ray;
    }
  }
  // A panel that does not surround the section centre has no usable radial fit.
  if (radii.some(r => r < .004)) return null;
  return {x, z, radii};
}

// Build per-limb maps around the target rig in the garment reference pose.
// The garment supplies a region ID and the target joint names. Vertex/ring
// order, source joint offsets, and garment type are irrelevant to the fit.
export function fitGarmentLimbs(T, asset, rest, policy, skin) {
  const region = Int16Array.from({length: rest.length / 3}, (_,i) => policy.limbRegion(i,asset) ?? -1);
  const fitted = new Uint8Array(region.length);
  const axial = new Float32Array(region.length), bones = [];
  for (const [limb, {parent, joint, tip}] of policy.limbs.entries()) {
    const id = skin.boneIndex.get(joint), end = skin.boneIndex.get(tip);
    if (id === undefined || end === undefined) throw Error('Unknown garment limb '+joint+' → '+tip);
    if (parent && !skin.boneIndex.has(parent)) throw Error('Unknown garment limb parent '+parent);
    const origin = new T.Vector3().setFromMatrixPosition(skin.inverseBones[id].clone().invert());
    const axis = new T.Vector3().setFromMatrixPosition(skin.inverseBones[end].clone().invert()).sub(origin);
    const length = axis.length();
    if (length < .01) continue;
    axis.multiplyScalar(1 / length);
    const x = new T.Vector3(Math.abs(axis.x) < .8 ? 1 : 0, Math.abs(axis.x) < .8 ? 0 : 1, 0);
    x.addScaledVector(axis, -axis.dot(x)).normalize();
    const z = new T.Vector3().crossVectors(axis, x), v = new T.Vector3();
    const project = points => {
      const local = new Float32Array(points.length);
      for (let i = 0; i < local.length; i += 3) {
        v.fromArray(points,i).sub(origin);
        local[i] = x.dot(v);
        local[i+1] = axis.dot(v) / length;
        local[i+2] = z.dot(v);
      }
      return local;
    };
    const ownsSkin = i => {
      if (!skin.mask[i]) return false;
      let weight = 0;
      for (let k = i * 4; k < i * 4 + 4; k++) if (skin.joints[k] === id) weight += skin.weights[k];
      return weight >= .5;
    };
    const clothLocal = project(asset.position);
    bones[limb] = {parent:skin.boneIndex.get(parent), joint:id};
    const clothRows = sections(clothLocal,asset.index,i=>region[i]===limb);
    const skinRows = sections(project(skin.positions),skin.index,ownsSkin);
    const rows = clothRows.map((segments,i) => {
      const cloth = perimeter(segments,length*.65), body = perimeter(skinRows[i],length*.55);
      if (!cloth || !body) return null;
      const radii = Float32Array.from(cloth.radii,(r,k)=>Math.max(1,Math.min(1.4,(body.radii[k]+.004)/r)));
      return {cloth, body, radii};
    });
    for (let i = 0; i < region.length; i++) {
      if (region[i] !== limb) continue;
      const k = i * 3, t = clothLocal[k+1];
      axial[i] = t;
      if (t <= -.14 || t >= 1.08) continue;
      const row = Math.max(0,Math.min(ROWS,(t-FIRST)/(LAST-FIRST)*ROWS));
      const a = Math.floor(row), b = Math.ceil(row);
      const from = rows[a] ?? rows[b], to = rows[b] ?? rows[a];
      if (!from || !to) continue;
      const blend = row - a;
      const cx = mix(from.cloth.x,to.cloth.x,blend), cz = mix(from.cloth.z,to.cloth.z,blend);
      const px = clothLocal[k]-cx, pz = clothLocal[k+2]-cz;
      const angle = ((Math.atan2(pz,px)+TAU)%TAU)*ANGLES/TAU, s = Math.floor(angle);
      const scaleAt = sample => mix(sample.radii[s],sample.radii[(s+1)%ANGLES],angle-s);
      const scale = mix(scaleAt(from),scaleAt(to),blend)-1;
      // Keep the attached upper sleeve continuous. The lower sleeve uses
      // the full correction, including any rigid cuff layers.
      const strength = smooth(-.14,.14,t);
      const dx = (mix(from.body.x,to.body.x,blend)-cx+px*scale)*strength;
      const dz = (mix(from.body.z,to.body.z,blend)-cz+pz*scale)*strength;
      v.fromArray(rest,k).addScaledVector(x,dx).addScaledVector(z,dz).toArray(rest,k);
      fitted[i] = 1;
    }
  }
  return {fitted, constrain(i, weights) {
    const limb = bones[region[i]];
    if (limb?.parent === undefined) return false;
    const t = axial[i], {parent,joint} = limb;
    if (t >= .18) {
      weights.fill(0);
      weights[joint] = 1;
      return true;
    }
    if (t <= -.40) return false;
    const prior = weights[parent]+weights[joint], pass = smooth(-.12,.18,t);
    const limbWeight = mix(prior,1,pass);
    const lower = mix(weights[joint],limbWeight*smooth(-.18,.18,t),smooth(-.40,-.18,t));
    for (let k = 0; k < weights.length; k++) weights[k] *= 1-pass;
    weights[parent] = limbWeight-lower;
    weights[joint] = lower;
    return false;
  }};
}

// Rotate the original normals by the geometric change in the fitted limb.
// Keep authored smoothing across UV splits and all normals outside the limb.
export function retargetedNormals(T, asset, rest, policy) {
  const mesh = new T.BufferGeometry();
  mesh.setIndex(new T.BufferAttribute(asset.index,1));
  mesh.setAttribute('position',new T.BufferAttribute(asset.position,3));
  mesh.computeVertexNormals();
  const original = mesh.attributes.normal.array.slice();
  mesh.setAttribute('position',new T.BufferAttribute(rest,3));
  mesh.computeVertexNormals();
  const target = mesh.attributes.normal.array, out = asset.normal.slice();
  const from = new T.Vector3(), to = new T.Vector3(), normal = new T.Vector3(), rotation = new T.Quaternion();
  for (let i = 0; i < out.length; i += 3) {
    const region = policy.limbRegion(i/3,asset);
    if (region == null || region < 0) continue;
    from.fromArray(original,i); to.fromArray(target,i);
    if (from.lengthSq() < .5 || to.lengthSq() < .5) continue;
    rotation.setFromUnitVectors(from,to);
    normal.fromArray(out,i).applyQuaternion(rotation).toArray(out,i);
  }
  return out;
}
