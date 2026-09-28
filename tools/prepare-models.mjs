// Turn official NASA 3D Resources models into files this piece can draw on a phone.
//
// NASA publishes the real vehicles, and every one of them is a Blender export: Draco-compressed (so three
// would need a wasm decoder at boot), one mesh per authored part - the Apollo LM arrives as 134 nodes and
// 157 primitives, InSight as 143 - textures up to 1024², and in the LM's case 135 baked animations. Against a
// hard ceiling of 60 draw calls and 120k triangles per act, with four vehicles standing in one act, none of
// them is usable as published.
//
// So the geometry is kept and everything else is rebuilt: the scene graph is baked into one mesh, materials
// are bucketed (textured stays as authored, flat colour merges onto a coarse grid), primitives are joined per
// material, the mesh is simplified with meshoptimizer, the authored unit scale is applied so the vehicle is
// in metres, it sits on y=0, and textures are re-encoded to 512² WebP. What ships is NASA's own silhouette in
// this scene's visual language, at a few thousand triangles and a handful of draw calls.
//
// Every `from` is the NASA page the `src` download came from; the files themselves are fetched from
// assets.science.nasa.gov/content/dam/science/cds/3d/resources/model/... and mirrored on
// github.com/nasa/NASA-3D-Resources. None of them is metric-clean, Draco-free or low-poly as published.
//
// Not in package.json on purpose: this runs when an asset is added, never when the app is built.
//   npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions \
//           draco3dgltf meshoptimizer sharp
//   node tools/prepare-models.mjs <dir-of-downloaded-glbs> <out-dir>
import { NodeIO, PropertyType } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { flatten, weld, simplify, join, center, prune, dedup, getBounds, transformPrimitive, textureCompress } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import sharp from "sharp";
import { MeshoptSimplifier } from "meshoptimizer";
import fs from "node:fs";
import path from "node:path";

// One row per asset, keyed by the file written out. `src` is the NASA download, `scale` converts its
// authored units to metres (two of these exports are not metric), `ratio` is the triangle budget as a
// fraction of the source, and `span` is the real vehicle's published size, so a silent scale mistake shows
// up in the log rather than as a lander the size of a house.
const ASSETS = {
  "apollo-lunar-module": { from: "https://science.nasa.gov/3d-resources/apollo-lunar-module/", src: "apollo-lunar-module.glb", scale: 1, ratio: 0.05, blend: true, span: "6.89 m tall, 4.27 m descent stage, 9.45 m footpad to footpad" },
  "mer-rover": { from: "https://science.nasa.gov/3d-resources/mars-exploration-rover-opportunity-mer-b/", src: "cds-mer-b.glb", scale: 0.18, ratio: 1, span: "1.5 m tall, 1.845 m long, 1.72 m wide, one design for Spirit and Opportunity" },
   "insight-lander": { from: "https://science.nasa.gov/3d-resources/insight-cruise-lander/", src: "insight-panels-deployed.glb", scale: 1, ratio: 0.02, error: 0.05, paint: true, span: "4.8 x 3.6 m footprint, 1.0 m to the deck, three 2.2 m arrays" },
  "viking-lander": { from: "https://science.nasa.gov/3d-resources/viking-lander/", src: "cds-viking.glb", scale: 0.18, ratio: 0.05, span: "3.26 m tall with the HGA stowed, one design for Viking 1 and 2" },
  "mars-global-surveyor": { from: "https://science.nasa.gov/3d-resources/mars-global-surveyor/", src: "MGS-full.glb", scale: 1, ratio: 1, span: "2.3 x 2.0 m bus, 1.52 m dish, 5.0 m x 1.4 m solar wings" },
  "pioneer-10": { from: "https://science.nasa.gov/3d-resources/pioneer/", src: "Pioneer10.glb", scale: 1, ratio: 1, span: "2.74 m dish, 0.46 m bus, 3.0 m RTG boom, 6.6 m magnetometer boom" },
};

const [scratch, outDir] = process.argv.slice(2);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "draco3d.decoder": await draco3d.createDecoderModule() });

// Gold foil, white panel, dark structure: a coarse grid on the authored base colour, so everything with no
// texture of its own falls into one flat material - and therefore one draw call.
const bucketKey = (m, blend) => {
  const c = m.getBaseColorFactor();
  const q = (v) => Math.round((v ?? 0) * (blend ? 1 : 2));
  const k = `${q(c[0])}${q(c[1])}${q(c[2])}`;
  return blend ? k : `${k}|${(m.getMetallicFactor() ?? 0).toFixed(1)}|${(m.getRoughnessFactor() ?? 0.8).toFixed(1)}`;
};

const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
};

const compose = (t, r, s) => {
  const [x, y, z, w] = r, [px, py, pz] = t, [sx, sy, sz] = s;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    px, py, pz, 1,
  ];
};

// Bake the whole (flattened) scene into a single mesh under a single node: joining only merges primitives
// that live in the same mesh, and NASA's exports put every part in its own.
function collapse(doc, scene) {
  const target = doc.createMesh("walk");
  const walk = (node, parent) => {
    const local = compose(node.getTranslation(), node.getRotation(), node.getScale());
    const world = parent ? mul(parent, local) : local;
    const mesh = node.getMesh();
    if (mesh) for (const prim of mesh.listPrimitives()) {
      const copy = prim.clone();
      transformPrimitive(copy, world);
      target.addPrimitive(copy);
    }
    for (const child of node.listChildren()) walk(child, world);
    node.detach();
  };
  for (const child of [...scene.listChildren()]) walk(child, null);
  scene.addChild(doc.createNode("walk").setMesh(target));
}

for (const [id, spec] of Object.entries(ASSETS)) {
  const inPath = path.join(scratch, spec.src);
  if (!fs.existsSync(inPath)) { console.log(`${id}: ${spec.src} is not in ${scratch} - skipped`); continue; }
  const doc = await io.read(inPath);
  const root = doc.getRoot();
  const scene = root.listScenes()[0];

  for (const a of root.listAnimations()) root.detach(a);
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) prim.setExtension("KHR_draco_mesh_compression", null);
  for (const ext of [...root.listExtensionsRequired(), ...root.listExtensionsUsed()]) if (ext.extensionName === "KHR_draco_mesh_compression") ext.dispose();

  await doc.transform(flatten());
  collapse(doc, scene);

  // One vehicle is the exception: InSight's 143 parts are painted with eleven 1024² maps, so nothing joins,
  // nothing welds across, and the simplifier cannot collapse a hundred disconnected shells. Averaging each
  // map down to the one colour it is really showing lets every part fall into a shared material, which is
  // what makes the mesh mergeable - and it is the dust on those panels that the conversation is about
  // anyway, not the weave of the cell.
  if (spec.paint) {
    for (const m of root.listMaterials()) {
      const t = m.getBaseColorTexture();
      if (!t) continue;
      const image = t.getImage();
      if (!image) continue;
      const bytes = Buffer.from(image.buffer ?? image, image.byteOffset ?? 0, image.byteLength);
      const { r, g, b } = await sharp(Buffer.from(bytes)).resize(1, 1, { fit: "fill" }).raw().toBuffer().then((px) => ({ r: px[0] / 255, g: px[1] / 255, b: px[2] / 255 }));
      m.setBaseColorTexture(null).setMetallicRoughnessTexture(null).setNormalTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
      const c = m.getBaseColorFactor();
      m.setBaseColorFactor([c[0] * r, c[1] * g, c[2] * b, c[3]]);
    }
  }

  const buckets = new Map();
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
    const src = prim.getMaterial() ?? doc.createMaterial();
    if (src.getBaseColorTexture() && !spec.paint) continue;
    for (const sem of prim.listSemantics()) if (sem !== "POSITION" && sem !== "NORMAL") prim.setAttribute(sem, null);
    const key = bucketKey(src, spec.blend);
    if (!buckets.has(key)) buckets.set(key, doc.createMaterial("flat" + buckets.size)
      .setBaseColorFactor([...src.getBaseColorFactor()])
      .setMetallicFactor(src.getMetallicFactor())
      .setRoughnessFactor(src.getRoughnessFactor()));
    prim.setMaterial(buckets.get(key));
  }

  await doc.transform(dedup({ properties: [PropertyType.MATERIAL] }));
  await doc.transform(join());
  await doc.transform(weld());
  await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: spec.ratio, error: spec.error ?? 0.01 }));

  if (spec.scale !== 1) {
    const s = spec.scale, I = [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1];
    for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) transformPrimitive(prim, I);
  }
  await doc.transform(prune());
  // Centre last: every step above can move vertices, and the walk plants each vehicle with its lowest point
  // on the regolith, so "base at y=0" has to be true of the file that ships, not of an earlier stage.
  await doc.transform(center({ pivot: "below" }));
  try {
    await doc.transform(textureCompress({ targetFormat: "webp", resize: [512, 512] }));
  } catch (err) {
    console.log(`${id}: textures left as authored (${err.message})`);
  }

  const prims = root.listMeshes().reduce((n, m) => n + m.listPrimitives().length, 0);
  let tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    const i = p.getIndices();
    tris += (i ? i.getCount() : p.getAttribute("POSITION").getCount()) / 3;
  }
  const b = getBounds(scene);
  const size = [0, 1, 2].map((k) => (b.max[k] - b.min[k]).toFixed(2)).join(" x ");
  const outPath = path.join(outDir, id + ".glb");
  fs.mkdirSync(outDir, { recursive: true });
  await io.write(outPath, doc);
  console.log(`${id}: ${prims} draws, ${Math.round(tris)} tris, ${(fs.statSync(outPath).size / 1024).toFixed(0)} KB, ${size} m`);
  console.log(`   real: ${spec.span}`);
}
