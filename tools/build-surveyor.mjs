// NASA publishes a Lunar Module, a Viking, an InSight, a Mars Global Surveyor and a Pioneer. It does not
// publish a Surveyor: the whole 3D Resources catalog was enumerated and there is no lander model in any
// format, so Surveyor 3 - the probe Apollo 12 astronauts visited, the only spacecraft on another world that
// humans have taken parts off - is built here instead, from the published dimensions:
//
//   3.4 m overall, 4.32 m across the three footpads, spherical pads 0.3 m in diameter, legs of hollow
//   fibreglass struts with a steel shoe; a 1.22 m square equipment box 0.76 m deep carrying 27 kg of
//   electronics; a 14 x 14 x 48 cm TV camera under the box looking out; a 1.08 m parabolic high-gain
//   antenna black-baffled inside on its mast; a surface sampler with a 7.6 cm scoop on three axes.
//
// Same two-material-primitive soup as the rest of the scene, and the same glTF 2.0 writer, so it goes
// through the same loader as the real NASA files. Run: node tools/build-surveyor.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "models", "surveyor-3.gltf");

// ---- primitive soup --------------------------------------------------------
// Non-indexed triangles (position + normal), which is all a model this size needs.
const push = (a, v) => a.push(v[0], v[1], v[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const prim = () => ({ pos: [], nrm: [] });

const tri = (P, a, b, c, n) => { for (const v of [a, b, c]) { push(P.pos, v); push(P.nrm, n); } };
const quad = (P, a, b, c, d) => { const n = norm(cross(sub(b, a), sub(d, a))); for (const v of [a, b, c, a, c, d]) { push(P.pos, v); push(P.nrm, n); } };

const box = (P, [w, h, d], [x, y, z] = [0, 0, 0]) => {
  const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [a * w / 2, 0, b * d / 2]);
  const t = (v, s) => add([v[0], s * h / 2 + y, v[2]], [x, 0, z]);
  const top = c.map((v) => t(v, 1)), bot = c.map((v) => t(v, -1));
  quad(P, top[0], top[1], top[2], top[3]);
  quad(P, bot[3], bot[2], bot[1], bot[0]);
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(P, bot[i], bot[j], top[j], top[i]); }
};

// A prism of n sides around y: r1 at the base, r2 at the top. r2 = 0 makes a cone, and a flat disc is a
// cone with the tip at the centre of the open face - which is the cheapest thing that reads as a dish.
const drum = (P, n, r1, r2, h, [x, y, z] = [0, 0, 0], spin = 0) => {
  const ring = (r, yy) => Array.from({ length: n }, (_, i) => { const a = spin + (i / n) * Math.PI * 2; return [x + Math.cos(a) * r, y + yy, z + Math.sin(a) * r]; });
  const lo = ring(r1, -h / 2), hi = ring(r2, h / 2);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; quad(P, lo[i], lo[j], hi[j], hi[i]); }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (r2 > 1e-6) tri(P, [x, y + h / 2, z], hi[i], hi[j], [0, 1, 0]);
    if (r1 > 1e-6) tri(P, [x, y - h / 2, z], lo[j], lo[i], [0, -1, 0]);
  }
};

// A strut between two points, which axis-aligned boxes cannot do: the legs and the sampler arm are the
// whole silhouette of a Surveyor, so they have to run where they actually ran.
const strut = (P, a, b, r, n = 6) => {
  const dir = norm(sub(b, a));
  const up = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = norm(cross(dir, up)), v = cross(dir, u);
  const ring = (c, s) => Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2, ct = Math.cos(t) * s, st = Math.sin(t) * s; return add(add(c, mul(u, ct)), mul(v, st)); });
  const lo = ring(a, r), hi = ring(b, r);
  const side = norm(cross(sub(hi[0], lo[0]), sub(hi[1], lo[1])));
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; quad(P, lo[i], lo[j], hi[j], hi[i]); }
  tri(P, a, lo[n - 1], lo[0], mul(dir, -1));
  tri(P, b, hi[0], hi[n - 1], dir);
};

// ---- Surveyor 3 ------------------------------------------------------------
// silver is the structure and the electronics box, gold the Kapton on the legs, dark the dish interior,
// the TV camera's light baffle and the sampler's shadowed joints.
const SURVEYOR = () => {
  const silver = prim(), gold = prim(), dark = prim();
  const LEG_TIP = 2.16; //  4.32 m footpad to footpad
  const DECK_Y = 1.55;

  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const fx = Math.cos(a) * LEG_TIP, fz = Math.sin(a) * LEG_TIP;
    strut(gold, [Math.cos(a) * 0.45, DECK_Y + 0.25, Math.sin(a) * 0.45], [fx, 0.16, fz], 0.045);
    strut(silver, [Math.cos(a) * 0.62, DECK_Y - 0.35, Math.sin(a) * 0.62], [fx, 0.16, fz], 0.03);
    drum(silver, 12, 0.15, 0.15, 0.09, [fx, 0.09, fz]); //  the 0.3 m spherical footpad, flattened by its own landing
    // The three vernier thruster nozzles on the box's corners, canted outward the way they were.
    drum(dark, 8, 0.055, 0.085, 0.14, [Math.cos(a) * 0.68, DECK_Y + 0.62, Math.sin(a) * 0.68]);
  }

  box(gold, [1.22, 0.76, 1.22], [0, DECK_Y, 0]); //  the equipment box, 27 kg of electronics inside
  box(silver, [1.22, 0.1, 1.22], [0, DECK_Y + 0.44, 0]); //  the top deck the HGA and batteries sat on
  box(dark, [0.48, 0.14, 0.14], [0.2, DECK_Y - 0.5, 0]); //  the television camera, under the box, looking out
  drum(dark, 10, 0.07, 0.05, 0.1, [0.46, DECK_Y - 0.5, 0], 0);

  strut(silver, [0, DECK_Y + 0.5, 0], [0, 2.9, 0], 0.03); //  the antenna mast
  drum(dark, 16, 0.54, 0.06, 0.2, [0, 3.05, 0]); //  the 1.08 m parabolic high-gain antenna, black-baffled
  drum(silver, 16, 0.56, 0.56, 0.02, [0, 2.95, 0]);

  // The surface sampler: three axes and a 7.6 cm scoop, parked at full extension toward the 14 degree slope
  // it stopped digging on, 105 seconds before the engines were cut from Earth.
  const sx = Math.cos(Math.PI / 2 + 2.09), sz = Math.sin(Math.PI / 2 + 2.09);
  strut(silver, [sx * 0.6, DECK_Y - 0.2, sz * 0.6], [sx * 1.15, 0.85, sz * 1.15], 0.035);
  strut(silver, [sx * 1.15, 0.85, sz * 1.15], [sx * 1.5, 0.34, sz * 1.5], 0.03);
  box(dark, [0.16, 0.05, 0.13], [sx * 1.55, 0.3, sz * 1.55]);
  return { silver, gold, dark };
};

const MATERIALS = {
  silver: { baseColorFactor: [0.72, 0.72, 0.75, 1], metallicFactor: 0.2, roughnessFactor: 0.7 },
  gold: { baseColorFactor: [0.73, 0.53, 0.19, 1], metallicFactor: 0.7, roughnessFactor: 0.45 },
  dark: { baseColorFactor: [0.06, 0.06, 0.07, 1], metallicFactor: 0.1, roughnessFactor: 0.9 },
};

// ---- glTF 2.0 emission -----------------------------------------------------
const pad4 = (buf) => (buf.length % 4 === 0 ? buf : Buffer.concat([buf, Buffer.alloc(4 - (buf.length % 4))], buf.length + 4 - (buf.length % 4)));

function gltf(prims, name) {
  const accessors = [], bufferViews = [], bin = [];
  let offset = 0;
  const meshes = [], materials = [];
  for (const [key, P] of Object.entries(prims)) {
    if (!P.pos.length) continue;
    materials.push({ name: key, doubleSided: true, pbrMetallicRoughness: { baseColorFactor: MATERIALS[key].baseColorFactor, metallicFactor: MATERIALS[key].metallicFactor, roughnessFactor: MATERIALS[key].roughnessFactor } });
    meshes.push({ name: key, primitives: [{ attributes: { POSITION: pos(P), NORMAL: nrm(P) }, material: materials.length - 1, mode: 4 }] });
  }
  const blob = pad4(Buffer.concat(bin));
  return {
    asset: { version: "2.0", generator: "tools/build-surveyor.mjs" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0, children: meshes.slice(1).map((_, i) => i + 1) }, ...meshes.slice(1).map((m) => ({ name: m.name, mesh: meshes.indexOf(m) }))],
    meshes,
    materials,
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

const doc = gltf(SURVEYOR(), "surveyor-3");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(doc));
const tris = doc.meshes.reduce((n, m) => n + doc.accessors[m.primitives[0].attributes.POSITION].count / 3, 0);
const p = doc.accessors[0];
console.log(`surveyor-3.gltf: ${tris} triangles, ${doc.meshes.length} primitives, ${(p.max[1] - p.min[1]).toFixed(2)} m tall, ${(p.max[0] - p.min[0]).toFixed(2)} x ${(p.max[2] - p.min[2]).toFixed(2)} m across, base y=${p.min[1].toFixed(2)}`);
