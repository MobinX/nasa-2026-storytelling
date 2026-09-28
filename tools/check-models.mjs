// The walk's hardware comes from NASA now, so this checks the files the browser will actually fetch rather
// than the format that happened to be convenient to generate. Two containers are allowed - a self-contained
// .glb, or a .gltf whose buffer is a data: URI - because the reduced NASA exports and the one hand-built
// model use different ones. What is not allowed is anything the app's bare GLTFLoader cannot serve: no
// required extension it has no decoder for, and no sidecar .bin or .jpg that a phone has to make another
// round trip for. Draco is the one that would bite hardest: every model on NASA's own 3D Resources page is
// Draco-compressed, so three would need a wasm decoder before the first frame, and tools/prepare-models.mjs
// exists to take that out.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const objects = JSON.parse(fs.readFileSync(path.join(root, "src/data/objects.json"), "utf8")).objects;
const { apply, OBJECTS } = await import("../src/data/objects.js");
const { STOPS } = await import("../src/journey/stops.js");
apply(OBJECTS); // binds each stop to the file it draws with, which is what the act budget below sums

// three 0.186's GLTFLoader handles these without a decoder being registered; nothing else in the file may be
// in extensionsRequired.
const ALLOWED_REQUIRED = new Set(["EXT_texture_webp"]);

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

const readDoc = (file) => {
  const raw = fs.readFileSync(file);
  if (raw.slice(0, 4).toString("latin1") !== "glTF") return { json: JSON.parse(raw.toString("utf8")), bin: null, raw };
  const chunks = [];
  let off = 12;
  while (off + 8 <= raw.length) {
    const len = raw.readUInt32LE(off); // a chunk is a length, a four-byte type, then the data
    const kind = raw.readUInt32LE(off + 4);
    chunks.push({ kind, data: raw.slice(off + 8, off + 8 + len) });
    off += 8 + len;
  }
  const head = chunks.find((c) => c.kind === 0x4e4f534a);
  ok(head, `${path.basename(file)}: no JSON chunk`);
  const bin = chunks.find((c) => c.kind === 0x004e4942);
  return { json: JSON.parse(head.data.toString("utf8")), bin: bin?.data ?? null, raw };
};

const seen = new Map();
const byPath = new Map();
for (const o of objects) {
  const file = path.join(root, "public", o["3dmodel"]);
  const at = (m) => `${o.id}: ${m}`;
  if (!fs.existsSync(file)) { fails.push(at("model file missing: " + o["3dmodel"])); continue; }
  const { json: d, bin, raw } = readDoc(file);
  const tag = path.basename(o["3dmodel"]);
  if (seen.has(tag)) continue; // three stops are the same vehicle; the file is checked once
  seen.set(tag, true);

  ok(d.asset?.version === "2.0", at("not glTF 2.0"));
  for (const e of d.extensionsRequired ?? []) ok(ALLOWED_REQUIRED.has(e), at(`requires ${e}, which the app cannot decode without a loader extension`));
  ok(!(d.extensionsUsed ?? []).includes("KHR_draco_mesh_compression"), at("still Draco-compressed - run tools/prepare-models.mjs"));

  // Every byte the file needs has to be inside it.
  let need = 0;
  for (const [i, b] of (d.buffers ?? []).entries()) {
    if (b.uri === undefined) { need += b.byteLength; continue; } // the GLB's own binary chunk
    ok(/^data:/.test(b.uri), at(`buffer ${i} is an external reference (${b.uri})`));
  }
  if (bin) ok(bin.length >= need, at(`binary chunk holds ${bin.length}B, the accessors want ${need}B`));
  for (const [i, im] of (d.images ?? []).entries()) {
    if (im.bufferView !== undefined) continue;
    ok(/^data:/.test(im.uri ?? ""), at(`image ${i} is an external reference (${im.uri})`));
  }

  const views = d.bufferViews ?? [];
  for (const [i, bv] of views.entries()) {
    // Offsets must land on 4 for float32 and uint32 reads; the length only has to for vertex and index
    // data, because an embedded JPEG or WebP is whatever size it is.
    ok(bv.byteOffset % 4 === 0, at(`bufferView ${i} starts at byte ${bv.byteOffset}, which is not 4-aligned`));
    if (bv.target && bv.byteLength % 4) ok(false, at(`bufferView ${i} holds vertex data and is ${bv.byteLength} bytes`));
    if (bin) ok(bv.byteOffset + bv.byteLength <= bin.length, at(`bufferView ${i} runs past the binary chunk`));
  }
  if (d.buffers?.length === 1 && /^data:/.test(d.buffers[0].uri ?? "")) {
    const decoded = Buffer.from(d.buffers[0].uri.split(",")[1], "base64");
    ok(decoded.length === d.buffers[0].byteLength, at(`buffer byteLength ${d.buffers[0].byteLength} != decoded ${decoded.length}`));
  }

  let prims = 0, tris = 0, minB = [1e9, 1e9, 1e9], maxB = [-1e9, -1e9, -1e9];
  const drawn = new Set((d.nodes ?? []).map((n) => n.mesh).filter((m) => m !== undefined));
  for (const [mi, m] of (d.meshes ?? []).entries()) {
    ok(mi === 0 || drawn.has(mi), at(`mesh ${mi} is not referenced by any node, so it never draws`));
    for (const pr of m.primitives) {
      prims++;
      const pos = d.accessors[pr.attributes.POSITION];
      ok(pr.attributes.NORMAL !== undefined, at("a primitive has no NORMAL, so nothing lights it"));
      ok(pos?.count > 3, at("a primitive has no vertices"));
      tris += ((pr.indices ? d.accessors[pr.indices].count : pos.count) || 0) / 3;
      if (pos.min) {
        ok(pos.min.every((v, i) => Number.isFinite(v) && v <= pos.max[i]), at("accessor min/max disagree"));
        for (let i = 0; i < 3; i++) {
          minB[i] = Math.min(minB[i], pos.min[i]);
          maxB[i] = Math.max(maxB[i], pos.max[i]);
        }
      }
    }
  }
  const extent = [0, 1, 2].map((i) => maxB[i] - minB[i]);
  const [height, across, deep] = [extent[1], extent[0], extent[2]];
  ok(tris > 200, at(`${Math.round(tris)} triangles is not a model of a spacecraft`));
  ok(tris < 60000, at(`${Math.round(tris)} triangles will not fit the act's 120k budget with four vehicles in it`));
  ok(prims <= 16, at(`${prims} primitives is ${prims} draw calls; tools/prepare-models.mjs exists to stop that`));
  ok(height > 0.4 && height < 12, at(`${height.toFixed(2)}m tall is not a vehicle next to a 1.7m astronaut - check its unit scale`));
  ok(Math.max(across, deep) < 14, at(`${Math.max(across, deep).toFixed(2)}m across will not fit the walk`));
  console.log(`${tag}: ${(raw.length / 1024).toFixed(0)} KB, ${prims} draws, ${Math.round(tris)} tris, ${height.toFixed(2)}m tall, ${across.toFixed(2)} x ${deep.toFixed(2)} m footprint`);
  byPath.set(o["3dmodel"], { prims, tris: Math.round(tris) });
}

// The per-act ceilings, measured from the shipped files. The frame smoke cannot parent these meshes - a
// <primitive> under a stub renderer is not an Object3D child - so the draw-call cost of the walk hardware
// is totalled here instead: every stop in an act draws its vehicle plus its crew member, and the ground
// itself costs eight more.
const SCENE_COST = 8;
const CREW_COST = 5;
for (const planet of ["moon", "mars", "solar"]) {
  let draws = SCENE_COST, tris = 0;
  for (const stop of STOPS[planet]) {
    const m = byPath.get(stop.model);
    if (!m) continue;
    draws += m.prims + CREW_COST;
    tris += m.tris + 320;
  }
  ok(draws <= 60, `${planet} act would need ${draws} draw calls for ${STOPS[planet].length} vehicles: the ceiling is 60`);
  ok(tris <= 120000, `${planet} act would upload ${(tris / 1000).toFixed(0)}k triangles: the ceiling is 120k`);
  console.log(`${planet} act: ${draws} draws, ${(tris / 1000).toFixed(1)}k tris for ${STOPS[planet].length} stops (ceiling 60 / 120k)`);
}

console.log(fails.length ? "\nFAIL\n" + fails.map((f) => " - " + f).join("\n") : `\n${seen.size} walk models verified: self-contained, decoder-free, inside the draw budget`);
process.exit(fails.length ? 1 : 0);
