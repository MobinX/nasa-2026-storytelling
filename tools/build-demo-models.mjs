// Builds the ten demo models named by src/data/objects.json into public/models/*.gltf.
//
// They are real glTF 2.0 files with real vertex data and embedded base64 buffers, so the runtime path
// under test is GLTFLoader and not a stand-in: nodes, meshes, primitives, materials, accessors, buffer
// views. Each model is a soup of boxes, prisms and discs authored here as the same primitives the deleted
// procedural props used, so the silhouettes still read as the hardware.
//
// Run: node tools/build-demo-models.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "models");

// ---- primitive soup ---------------------------------------------------------
// Every primitive returns non-indexed triangles (position + normal), which is the one thing a demo model
// needs to get right: indexed geometry, UV sets and smoothing groups all buy nothing here.
const push = (a, v) => a.push(v[0], v[1], v[2]);
const quad = (P, a, b, c, d) => {
  const n = norm(cross(sub(b, a), sub(d, a)));
  for (const v of [a, b, c, a, c, d]) { push(P.pos, v); push(P.nrm, n); }
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

const box = (P, [w, h, d], [x, y, z] = [0, 0, 0]) => {
  const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [a * w / 2, 0, b * d / 2]);
  const t = (v, s) => add([v[0], s * h / 2 + y, v[2]], [x, 0, z]);
  const top = c.map((v) => t(v, 1)), bot = c.map((v) => t(v, -1));
  quad(P, top[0], top[1], top[2], top[3]);
  quad(P, bot[3], bot[2], bot[1], bot[0]);
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(P, bot[i], bot[j], top[j], top[i]); }
};

// A prism with n sides around y: r1 at the base, r2 at the top. r2 = 0 makes a cone.
const tri = (P, a, b, c, n) => { for (const v of [a, b, c]) { push(P.pos, v); push(P.nrm, n); } };
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

const prim = () => ({ pos: [], nrm: [] });

// ---- the ten models --------------------------------------------------------
// Grey is the structure, gold the thermal foil. Both are deliberately untextured: the point of these files
// is the load path, and an untextured two-material glTF exercises everything the renderer needs.
const MODELS = {
  "moon-solar-wind": () => {
    const grey = prim(), gold = prim();
    drum(grey, 8, 0.03, 0.03, 1.5, [0, 0.75, 0]);
    box(gold, [1.3, 0.02, 0.55], [0, 1.42, 0.1]);
    box(grey, [0.18, 0.1, 0.14], [0, 0.12, 0]);
    return { grey, gold };
  },
  "moon-seismometer": () => {
    const grey = prim(), gold = prim();
    box(grey, [0.6, 0.42, 0.6], [0, 0.55, 0]);
    box(gold, [0.56, 0.02, 0.56], [0, 0.78, 0]);
    box(grey, [0.9, 0.03, 0.9], [0, 0.1, 0]);
    for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) drum(grey, 6, 0.05, 0.05, 0.24, [x, 0.24, z]);
    drum(gold, 10, 0.17, 0.17, 0.05, [0, 0.9, 0]);
    return { grey, gold };
  },
  "moon-retroreflector": () => {
    const grey = prim(), gold = prim();
    box(grey, [0.72, 0.05, 0.42], [0, 0.62, 0]);
    for (const [x, z] of [[-0.25, -0.12], [0, -0.12], [0.25, -0.12], [-0.25, 0.12], [0, 0.12], [0.25, 0.12]]) box(gold, [0.2, 0.06, 0.2], [x, 0.67, z]);
    for (const x of [-0.3, 0.3]) drum(grey, 6, 0.035, 0.035, 0.62, [x, 0.3, 0]);
    box(grey, [0.8, 0.04, 0.5], [0, 0.03, 0]);
    return { grey, gold };
  },
  "moon-eagle": () => {
    const grey = prim(), gold = prim();
    drum(grey, 8, 1.4, 1.9, 1.5, [0, 1.55, 0]);
    box(grey, [0.9, 0.12, 0.9], [0, 0.06, 0]);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.7; box(grey, [0.12, 2.6, 0.12], [Math.cos(a) * 1.6, 0.9, Math.sin(a) * 1.6]); box(grey, [0.55, 0.09, 0.55], [Math.cos(a) * 1.9, 0.14, Math.sin(a) * 1.9]); }
    box(grey, [0.5, 0.5, 0.45], [0, 3.15, 0]);
    drum(grey, 6, 0.07, 0.07, 1.3, [0.6, 3.0, 0.6]);
    drum(grey, 6, 0.07, 0.07, 1.3, [-0.6, 3.0, -0.6]);
    drum(gold, 12, 1.9, 0.2, 1.1, [0, 2.3, 0]);
    box(gold, [1.1, 0.7, 1.0], [0, 2.6, 0]);
    return { grey, gold };
  },
  "mars-rover": () => {
    const grey = prim(), gold = prim();
    box(grey, [1.5, 0.55, 1.0], [0, 0.78, 0]);
    box(grey, [0.34, 0.34, 0.34], [0.9, 1.2, 0]);
    drum(grey, 6, 0.05, 0.05, 1.1, [-0.2, 1.5, 0]);
    box(grey, [0.7, 0.04, 0.5], [-0.2, 2.05, 0]);
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const P = i === 1 ? gold : grey; drum(P, 10, 0.28, 0.28, 0.18, [-0.62 + i * 0.62, 0.28, s * 0.56], Math.PI / 2); }
    box(gold, [0.9, 0.06, 0.7], [-0.4, 1.12, 0]);
    return { grey, gold };
  },
  "mars-airfield": () => {
    const grey = prim(), gold = prim();
    box(grey, [0.46, 0.28, 0.4], [0, 0.42, 0]);
    for (const [x, z] of [[-0.3, -0.28], [0.3, -0.28], [-0.3, 0.28], [0.3, 0.28]]) drum(grey, 6, 0.02, 0.02, 0.42, [x, 0.21, z]);
    box(gold, [0.5, 0.02, 0.06], [0, 0.6, 0]);
    drum(grey, 4, 0.66, 0.66, 0.015, [0, 0.62, 0], 0.4);
    drum(grey, 4, 0.66, 0.66, 0.015, [0, 0.66, 0], -0.4);
    return { grey, gold };
  },
  "mars-depot": () => {
    const grey = prim(), gold = prim();
    for (let i = 0; i < 7; i++) { const a = i * 1.9; drum(gold, 8, 0.05, 0.05, 0.36, [Math.cos(a) * 0.3, 0.18, Math.sin(a) * 0.24]); }
    box(grey, [0.5, 0.04, 0.5], [0, 0.02, 0]);
    drum(grey, 4, 0.06, 0.06, 1.1, [0.34, 0.55, 0.34]);
    box(gold, [0.3, 0.22, 0.02], [0.34, 1.02, 0.34]);
    return { grey, gold };
  },
  "mars-ares": () => {
    const grey = prim(), gold = prim();
    drum(grey, 14, 1.5, 1.5, 3.4, [0, 1.7, 0]);
    box(grey, [1.2, 1.0, 1.2], [0, 3.9, 0]);
    drum(grey, 6, 0.08, 0.08, 2.2, [0, 4.8, 0]);
    box(grey, [0.9, 0.7, 0.2], [1.45, 1.1, 0]);
    box(grey, [2.6, 0.16, 1.8], [0, 0.08, 0]);
    for (let i = 0; i < 3; i++) box(grey, [0.5, 0.42, 0.5], [-2.2, 0.42, 1.2 - i * 1.2]);
    drum(gold, 14, 1.56, 1.56, 1.0, [0, 2.9, 0]);
    box(gold, [1.15, 0.5, 0.06], [0, 2.2, 1.5]);
    return { grey, gold };
  },
  "solar-l2-observatory": () => {
    const grey = prim(), gold = prim();
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; drum(gold, 6, 0.9, 0.9, 0.06, [Math.cos(a) * 1.55, 3.3, Math.sin(a) * 1.55 * 0.58]); }
    drum(gold, 6, 0.9, 0.9, 0.06, [0, 3.3, 0]);
    box(grey, [1.1, 0.7, 0.9], [0, 2.7, 0]);
    box(grey, [0.6, 0.5, 0.4], [0, 3.9, -0.1]);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) box(grey, [2.3, 0.03, 1.1], [s * (1.5 + i * 2.4), 1.1 - i * 0.06, 0]);
    for (const s of [-1, 1]) drum(grey, 6, 0.05, 0.05, 2.1, [s * 1.2, 1.1, 0.9]);
    box(grey, [5.0, 0.04, 2.2], [0, 0.1, 0]);
    return { grey, gold };
  },
  "solar-sun-probe": () => {
    const grey = prim(), gold = prim();
    drum(gold, 22, 1.9, 1.55, 0.16, [0, 1.0, 0]);
    drum(grey, 16, 1.3, 1.3, 0.05, [0, 1.12, 0]);
    box(grey, [0.8, 0.9, 0.8], [0, 1.6, 0]);
    drum(grey, 12, 0.55, 0.02, 0.5, [0, 2.3, 0]);
    for (const s of [-1, 1]) box(grey, [0.06, 0.9, 0.06], [s * 0.75, 1.55, 0]);
    for (const s of [-1, 1]) box(gold, [1.4, 0.03, 0.7], [s * 2.6, 1.0, 0]);
    return { grey, gold };
  },
};

// ---- glTF emission ---------------------------------------------------------
const b64 = (buf) => buf.toString("base64");
const pad4 = (buf) => (buf.length % 4 === 0 ? buf : Buffer.concat([buf, Buffer.alloc(4 - (buf.length % 4))], buf.length + 4 - (buf.length % 4)));

function gltf(prims, name) {
  const bin = [];
  const views = [];
  const accessors = [];
  const bufferViews = [];
  let offset = 0;
  const addAccessor = (P, comp) => {
    const flat = comp === 0 ? P.pos : P.nrm;
    const buf = Buffer.from(new Float32Array(flat).buffer);
    const data = pad4(buf);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target: comp === 0 ? 34962 : 34962 });
    views.push(bin.length);
    bin.push(data);
    const count = flat.length / 3;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < flat.length; i += 3) for (let a = 0; a < 3; a++) { const v = flat[i + a]; if (v < min[a]) min[a] = v; if (v > max[a]) max[a] = v; }
    accessors.push({ bufferView: bufferViews.length - 1, byteOffset: 0, componentType: 5126, count, type: "VEC3", ...(comp === 0 ? { min, max } : {}) });
    offset += data.length;
    return accessors.length - 1;
  };
  const meshes = [];
  const materials = [];
  for (const [matName, P] of Object.entries(prims)) {
    if (!P.pos.length) continue;
    materials.push({ name: matName, doubleSided: true, pbrMetallicRoughness: { baseColorFactor: matName === "gold" ? [0.73, 0.53, 0.19, 1] : [0.62, 0.62, 0.66, 1], metallicFactor: matName === "gold" ? 0.7 : 0.15, roughnessFactor: matName === "gold" ? 0.45 : 0.85 } });
    meshes.push({ primitives: [{ attributes: { POSITION: addAccessor(P, 0), NORMAL: addAccessor(P, 1) }, material: materials.length - 1, mode: 4 }], name: matName });
  }
  const blob = pad4(Buffer.concat(bin));
  return {
    asset: { version: "2.0", generator: "tools/build-demo-models.mjs" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0, children: meshes.slice(1).map((_, i) => i + 1) }, ...meshes.slice(1).map((m, i) => ({ name: m.name, mesh: i + 1 }))],
    meshes,
    materials,
    buffers: [{ byteLength: blob.length, uri: "data:application/octet-stream;base64," + blob.toString("base64") }],
    bufferViews,
    accessors,
  };
}

fs.mkdirSync(out, { recursive: true });
const objects = JSON.parse(fs.readFileSync(path.join(root, "src/data/objects.json"), "utf8")).objects;
for (const o of objects) {
  const id = o.id;
  const build = MODELS[id];
  if (!build) { console.error("no demo geometry for " + id); process.exit(1); }
  const doc = gltf(build(), id);
  const file = path.join(root, "public", o["3dmodel"]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(doc));
  const tris = doc.meshes.reduce((n, m) => n + doc.accessors[m.primitives[0].attributes.POSITION].count / 3, 0);
  console.log(`${id}.gltf  ${(doc.buffers[0].byteLength / 1024).toFixed(1)} KB, ${tris} triangles, ${doc.meshes.length} primitives`);
}
console.log("wrote", objects.length, "demo models to", out);
