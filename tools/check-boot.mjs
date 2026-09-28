// Runs the real boot sequence (texture decode + terrain build + levelling) headlessly, so a crash on the
// loading path is caught here rather than as a black page on the phone.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx2d = () => {
  const noop = () => {};
  return {
    fillStyle: "#000", font: "", textAlign: "", textBaseline: "", clearRect: noop, fillRect: noop,
    fillText: noop, drawImage: noop, beginPath: noop, arc: noop, fill: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(140) }),
  };
};
let created = 0;
globalThis.document = {
  createElement: (tag) => {
    created++;
    const el = { tagName: tag, width: 0, height: 0, style: {}, getContext: () => ctx2d() };
    return el;
  },
  getElementById: () => null,
  addEventListener: () => {},
};
globalThis.self = globalThis;
// three turns an embedded image into a Blob and loads it back through a blob: URL, which Node does not have.
URL.createObjectURL = () => "blob:harness";
URL.revokeObjectURL = () => {};
globalThis.window = { location: { search: "" }, addEventListener: () => {} };
Object.defineProperty(globalThis, "navigator", { value: { hardwareConcurrency: 8, deviceMemory: 8, devicePixelRatio: 3 }, configurable: true });
// three's FileLoader wraps a streamed response in ProgressEvent for onProgress. Node has no such class,
// and the data-URI buffers of the walk models go through that same path, so it is declared rather than the
// loader being worked around - the browser supplies it and the app never sees a difference.
globalThis.ProgressEvent = class ProgressEvent {
  constructor(type, init = {}) { Object.assign(this, { type, lengthComputable: false, loaded: 0, total: 0 }, init); }
};

globalThis.Image = class {
  set src(v) {
    const file = path.join(root, "public", v.replace(/^\//, ""));
    if (!fs.existsSync(file)) {
      setTimeout(() => this.onerror && this.onerror(new Error("missing " + v)), 0);
      return;
    }
    const buf = fs.readFileSync(file);
    this.width = 2;
    this.height = 2;
    this._bytes = buf.length;
    setTimeout(() => this.onload && this.onload(), 0);
  }
};

const { preloadMaps, maps } = await import("../src/lib/textures.js");
const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
const { apply, OBJECTS, modelPaths } = await import("../src/data/objects.js");
const { buildTerrain, deriveNormalMap, levelTerrain, flattenAlongCorridor, heightAt } = await import("../src/lib/terrain.js");
const { MOON, MARS } = await import("../src/journey/worlds.js");
const { CORRIDOR_BY_WORLD } = await import("../src/journey/corridor.js");
const GROUND_CORRIDOR = CORRIDOR_BY_WORLD.moon;
const MARS_CORRIDOR = CORRIDOR_BY_WORLD.mars;
const { LEVEL_BAND_BY_WORLD: LEVEL_BAND } = await import("../src/journey/corridor.js");
const { groundPose, scratchGround } = await import("../src/journey/ground.js");
const { poseAt, scratchPose } = await import("../src/journey/pose.js");
const { clamp01, SEAM_B } = await import("../src/journey/timeline.js");

const t0 = performance.now();
let last = -1;
await preloadMaps(4, (p) => {
  if (Math.round(p * 100) <= last) return;
  last = Math.round(p * 100);
});
const keys = Object.keys(maps);
console.log("maps:", keys.join(" "));
const missing = ["sun", "mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "moon", "saturnRing", "detail"].filter((k) => !maps[k]);
console.log(missing.length ? "MISSING MAPS: " + missing.join(",") : "all 12 maps decoded, anisotropy=" + maps.moon.anisotropy + " colorSpace=" + maps.moon.colorSpace);

// The content step of the boot, and the models it names, parsed by the loader the app actually uses. A
// glTF that is structurally valid JSON and still refuses to build a scene is the failure this catches.
const bootProblems = apply(OBJECTS);
for (const m of bootProblems) console.log("objects.json: " + m);
if (bootProblems.length) process.exit(1);
const gltf = new GLTFLoader();
let walkTris = 0;
for (const p of modelPaths()) {
  const buf = fs.readFileSync(path.join(root, "public", p));
  const scene = await new Promise((res, rej) => gltf.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "", res, rej));
  let meshes = 0;
  scene.scene.traverse((o) => { if (o.isMesh) { meshes++; walkTris += o.geometry.attributes.position.count / 3; } });
  if (!meshes) console.log("MODEL HAS NO MESHES: " + p);
}
console.log(`objects.json bound: ${OBJECTS.length} objects, ${modelPaths().length} models parsed, ${Math.round(walkTris)} triangles of walk hardware`);

const terrain = buildTerrain({ seg: 96, avoid: GROUND_CORRIDOR, relief: MOON.relief });
flattenAlongCorridor(terrain, LEVEL_BAND.moon);
const off = levelTerrain(terrain, MOON.cut[0], MOON.cut[2]);
terrain.normalMap = deriveNormalMap(terrain.heights, 512);
const marsTerrain = buildTerrain({ seg: 96, avoid: MARS_CORRIDOR, relief: MARS.relief });
flattenAlongCorridor(marsTerrain, LEVEL_BAND.mars);
levelTerrain(marsTerrain, MARS.cut[0], MARS.cut[2]);
marsTerrain.normalMap = deriveNormalMap(marsTerrain.heights, 512);
console.log("mars field: levelled, eye at hand-off", marsTerrain.heights.grid.length, "samples, normalMap", marsTerrain.normalMap.image.width + "px");
const p = scratchPose();
const gp = scratchGround();
poseAt(SEAM_B + 1e-5, p);
groundPose(SEAM_B + 1e-5, terrain.heights, p, gp, 0);
console.log("levelled", off.toFixed(3) + "m at the cut; seam-frame eye", gp.local.y.toFixed(3) + "m; heightAt(cut) now", heightAt(terrain.heights, MOON.cut[0], MOON.cut[2]).toFixed(4));
console.log("normalMap", terrain.normalMap.image.width + "px colorSpace=" + terrain.normalMap.colorSpace + " wrap=" + terrain.normalMap.wrapS);
console.log("detail wrap=" + maps.detail.wrapS + " colorSpace=" + maps.detail.colorSpace, "| moon repeat", maps.moon.repeat.toArray().join("x"));
console.log(`boot path OK in ${(performance.now() - t0).toFixed(0)}ms, ${created} canvases`);
process.exit(missing.length ? 1 : 0);
