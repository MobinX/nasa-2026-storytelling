// Validates the demo glTF files the loader will fetch: buffer arithmetic, accessor bounds, primitive
// attributes and node wiring. glTF is unforgiving in exactly the places a browser fails silently, so
// every rule here is one the renderer would otherwise pay for with a blank model.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const objects = JSON.parse(fs.readFileSync(path.join(root, "src/data/objects.json"), "utf8")).objects;
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const seen = new Set();

for (const o of objects) {
  const file = path.join(root, "public", o["3dmodel"]);
  const at = (m) => `${o.id}: ${m}`;
  if (!fs.existsSync(file)) { fails.push(at("model file missing: " + o["3dmodel"])); continue; }
  if (seen.has(o["3dmodel"])) fails.push(at("two objects share one model file"));
  seen.add(o["3dmodel"]);
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  ok(d.asset?.version === "2.0", at("not glTF 2.0"));
  ok(d.buffers?.length === 1 && /^data:application\/octet-stream;base64,/.test(d.buffers[0].uri), at("expected one embedded data-uri buffer"));
  const raw = Buffer.from(d.buffers[0].uri.split(",")[1], "base64");
  ok(raw.length === d.buffers[0].byteLength, `buffer byteLength ${d.buffers[0].byteLength} != decoded ${raw.length}`);
  ok(d.accessors.length === d.meshes.length * 2, at(`${d.accessors.length} accessors for ${d.meshes.length} meshes (want POSITION + NORMAL each)`));
  let tris = 0;
  for (const [vi, bv] of (d.bufferViews || []).entries()) {
    ok(bv.byteOffset % 4 === 0, at(`bufferView ${vi} byteOffset ${bv.byteOffset} is not 4-aligned`));
    ok(bv.byteOffset + bv.byteLength <= raw.length, at(`bufferView ${vi} runs past the buffer`));
  }
  for (const [ai, a] of d.accessors.entries()) {
    const bv = d.bufferViews[a.bufferView];
    const bytes = a.count * 12;
    ok(a.componentType === 5126 && a.type === "VEC3", at(`accessor ${ai} must be float VEC3`));
    ok(bv.byteOffset + a.byteOffset + bytes <= bv.byteOffset + bv.byteLength, at(`accessor ${ai} reads past its bufferView`));
    if (a.min) {
      ok(a.min.every((v, i) => Number.isFinite(v) && v <= a.max[i]), at(`accessor ${ai} min/max disagree`));
      ok(Math.max(...a.min.map(Math.abs)) < 40, at(`accessor ${ai} has geometry 100x bigger than the site (|min|max| ${Math.max(...a.min.map(Math.abs))})`));
    }
  }
  for (const m of d.meshes) for (const pr of m.primitives) {
    ok(pr.attributes?.POSITION !== undefined && pr.attributes?.NORMAL !== undefined, at("a primitive is missing POSITION or NORMAL"));
    ok(d.materials[pr.material], at("primitive points at a material that is not there"));
    tris += d.accessors[pr.attributes.POSITION].count / 3;
    ok(d.accessors[pr.attributes.POSITION].count === d.accessors[pr.attributes.NORMAL].count, at("position and normal counts differ"));
  }
  const nodeMeshes = new Set(d.nodes.map((n) => n.mesh).filter((n) => n !== undefined));
  ok(d.meshes.every((_, i) => nodeMeshes.has(i)), at("a mesh is not referenced by any node, so it never draws"));
  ok(tris > 24 && tris < 4000, `${o.id}: ${tris} triangles is not a demo model, it is a mistake`);
  const h = (d.accessors.find((a) => a.min)?.max[1] ?? 0);
  ok(h > 0.3 && h < 6, at(`model apex is ${h.toFixed(2)}m, which does not read as hardware next to a 1.7m astronaut`));
  console.log(`${o.id}: ${(raw.length / 1024).toFixed(1)} KB, ${d.meshes.length} primitives, ${tris} tris, ${h.toFixed(2)}m tall`);
}
console.log(fails.length ? "\nFAIL\n" + fails.map((f) => " - " + f).join("\n") : "\ndemo glTF models verified");
process.exit(fails.length ? 1 : 0);
