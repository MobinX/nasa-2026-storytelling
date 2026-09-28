// The primitive soup and the glTF 2.0 writer behind every hand-built vehicle in the walk.
//
// NASA publishes a Lunar Module, a Viking, an InSight, a Mars Global Surveyor and a Pioneer. It publishes
// nothing at all for the Lunar Roving Vehicle, the ALSEP or Sojourner - the whole 3D Resources catalog was
// enumerated and there is no mesh for any of them in any format - so those three are made here instead, from
// the dimensions NASA does publish. The output is deliberately the same shape as the reduced NASA exports
// that tools/prepare-models.mjs produces: non-indexed float32 POSITION + NORMAL, three material buckets, one
// embedded data-URI buffer, no required extensions. That is what lets tools/check-models.mjs and the app's
// bare GLTFLoader treat a downloaded spacecraft and a built one identically.
//
// Everything is metres with y up and the base of the machine at y = 0, because the walk plants models on
// terrain height and a model whose feet are not at zero stands in a hole or on a plinth.

const push = (a, v) => a.push(v[0], v[1], v[2]);
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export const prim = () => ({ pos: [], nrm: [] });

export const tri = (P, a, b, c, n) => { for (const v of [a, b, c]) { push(P.pos, v); push(P.nrm, n); } };
export const quad = (P, a, b, c, d) => { const n = norm(cross(sub(b, a), sub(d, a))); for (const v of [a, b, c, a, c, d]) { push(P.pos, v); push(P.nrm, n); } };

export const box = (P, [w, h, d], [x, y, z] = [0, 0, 0]) => {
  const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [a * w / 2, 0, b * d / 2]);
  const t = (v, s) => add([v[0], s * h / 2 + y, v[2]], [x, 0, z]);
  const top = c.map((v) => t(v, 1)), bot = c.map((v) => t(v, -1));
  quad(P, top[0], top[1], top[2], top[3]);
  quad(P, bot[3], bot[2], bot[1], bot[0]);
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(P, bot[i], bot[j], top[j], top[i]); }
};

// A prism of n sides around y: r1 at the base, r2 at the top. r2 = 0 makes a cone, and a flat disc is a cone
// with the tip at the centre of the open face - which is the cheapest thing that reads as a dish.
export const drum = (P, n, r1, r2, h, [x, y, z] = [0, 0, 0], spin = 0) => {
  const ring = (r, yy) => Array.from({ length: n }, (_, i) => { const a = spin + (i / n) * Math.PI * 2; return [x + Math.cos(a) * r, y + yy, z + Math.sin(a) * r]; });
  const lo = ring(r1, -h / 2), hi = ring(r2, h / 2);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; quad(P, lo[i], lo[j], hi[j], hi[i]); }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (r2 > 1e-6) tri(P, [x, y + h / 2, z], hi[i], hi[j], [0, 1, 0]);
    if (r1 > 1e-6) tri(P, [x, y - h / 2, z], lo[j], lo[i], [0, -1, 0]);
  }
};

// A strut between two points, which axis-aligned boxes cannot do. This carries most of the silhouette of a
// Surveyor leg, a rover frame, an RTG mount or an ALSEP cable run: anything that runs where it actually ran.
export const strut = (P, a, b, r, n = 6) => {
  const dir = norm(sub(b, a));
  const up = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = norm(cross(dir, up)), v = cross(dir, u);
  const ring = (c, s) => Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2, ct = Math.cos(t) * s, st = Math.sin(t) * s; return add(add(c, mul(u, ct)), mul(v, st)); });
  const lo = ring(a, r), hi = ring(b, r);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; quad(P, lo[i], lo[j], hi[j], hi[i]); }
  tri(P, a, lo[n - 1], lo[0], mul(dir, -1));
  tri(P, b, hi[0], hi[n - 1], dir);
};

// Parts are built upright at the origin and then carried onto the machine: yaw about y, pitch about x, roll
// about z, in that order, then moved. A seat backs away from its pan, a Pathfinder petal folds down to the
// ground, a dish tips toward Earth, and none of that is expressible as a box with an offset. Nothing here
// scales, because these are rotations only and the normals have to survive them unchanged.
export const carry = (dst, src, { at = [0, 0, 0], yaw = 0, pitch = 0, roll = 0 } = {}) => {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  // Ry * Rx * Rz, worked out once: a point is rolled, then pitched, then yawed, each about its own axis.
  const m = [
    [cy * cr + sy * sp * sr, -cy * sr + sy * sp * cr, sy * cp],
    [cp * sr, cp * cr, -sp],
    [-sy * cr + cy * sp * sr, sy * sr + cy * sp * cr, cy * cp],
  ];
  const xform = (v) => [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2] + at[0],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2] + at[1],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2] + at[2],
  ];
  for (let i = 0; i < src.pos.length; i += 3) {
    push(dst.pos, xform([src.pos[i], src.pos[i + 1], src.pos[i + 2]]));
    push(dst.nrm, xform([src.nrm[i], src.nrm[i + 1], src.nrm[i + 2]]).map((v, a) => v - at[a]));
  }
  return dst;
};

// Build a part once, then carry it on as many times as the machine has of it.
export const part = (build) => { const P = prim(); build(P); return P; };

// ---- glTF 2.0 emission -----------------------------------------------------
const pad4 = (buf) => (buf.length % 4 === 0 ? buf : Buffer.concat([buf, Buffer.alloc(4 - (buf.length % 4))], buf.length + 4 - (buf.length % 4)));

export function gltf(prims, name, materials, generator) {
  const accessors = [], bufferViews = [], bin = [];
  let offset = 0;
  const meshes = [], mats = [];
  for (const [key, P] of Object.entries(prims)) {
    if (!P.pos.length) continue;
    mats.push({ name: key, doubleSided: true, pbrMetallicRoughness: { baseColorFactor: materials[key].baseColorFactor, metallicFactor: materials[key].metallicFactor, roughnessFactor: materials[key].roughnessFactor } });
    meshes.push({ name: key, primitives: [{ attributes: { POSITION: pos(P), NORMAL: nrm(P) }, material: mats.length - 1, mode: 4 }] });
  }
  const blob = pad4(Buffer.concat(bin));
  return {
    asset: { version: "2.0", generator },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0, children: meshes.slice(1).map((_, i) => i + 1) }, ...meshes.slice(1).map((m) => ({ name: m.name, mesh: meshes.indexOf(m) }))],
    meshes,
    materials: mats,
    buffers: [{ byteLength: blob.length, uri: "data:application/octet-stream;base64," + blob.toString("base64") }],
    bufferViews,
    accessors,
  };

  function pos(P) {
    const buf = Buffer.from(new Float32Array(P.pos).buffer);
    const count = P.pos.length / 3;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.pos.length; i += 3) for (let a = 0; a < 3; a++) { const v = P.pos[i + a]; if (v < min[a]) min[a] = v; if (v > max[a]) max[a] = v; }
    return emit(buf, 34962, { componentType: 5126, count, type: "VEC3", min, max });
  }
  function nrm(P) {
    const buf = Buffer.from(new Float32Array(P.nrm).buffer);
    return emit(buf, 34962, { componentType: 5126, count: P.nrm.length / 3, type: "VEC3" });
  }
  function emit(buf, target, rest) {
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target });
    bin.push(pad4(buf));
    accessors.push({ bufferView: bufferViews.length - 1, byteOffset: 0, ...rest });
    offset += pad4(buf).length;
    return accessors.length - 1;
  }
}

// The one honest readout of what was just built: how much the browser will draw, how tall it stands, and how
// much ground it takes. tools/check-journey.mjs frames every stop against the footprint numbers, so these
// lines are what a ROUTE entry is authored from rather than remembered.
export function report(doc, file) {
  const tris = doc.meshes.reduce((n, m) => n + doc.accessors[m.primitives[0].attributes.POSITION].count / 3, 0);
  const all = doc.accessors.filter((a) => a.min);
  const min = [0, 1, 2].map((i) => Math.min(...all.map((a) => a.min[i])));
  const max = [0, 1, 2].map((i) => Math.max(...all.map((a) => a.max[i])));
  const ext = [0, 1, 2].map((i) => max[i] - min[i]);
  console.log(`${file}: ${Math.round(tris)} tris, ${doc.meshes.length} prims, ${ext[1].toFixed(2)}m tall, ${ext[0].toFixed(2)} x ${ext[2].toFixed(2)} m footprint, base y=${min[1].toFixed(2)}`);
  return { tris: Math.round(tris), prims: doc.meshes.length, top: ext[1], across: ext[0], deep: ext[2], base: min[1] };
}
