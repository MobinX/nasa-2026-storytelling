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
globalThis.window = { location: { search: "" }, addEventListener: () => {} };
Object.defineProperty(globalThis, "navigator", { value: { hardwareConcurrency: 8, deviceMemory: 8, devicePixelRatio: 3 }, configurable: true });
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
const { buildTerrain, deriveNormalMap, levelTerrain, heightAt } = await import("../src/lib/terrain.js");
const { CUT_LOCAL } = await import("../src/journey/pose.js");
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
const missing = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "moon", "saturnRing", "detail"].filter((k) => !maps[k]);
console.log(missing.length ? "MISSING MAPS: " + missing.join(",") : "all 11 maps decoded, anisotropy=" + maps.moon.anisotropy + " colorSpace=" + maps.moon.colorSpace);

const terrain = buildTerrain({ seg: 96 });
const off = levelTerrain(terrain, CUT_LOCAL[0], CUT_LOCAL[2]);
terrain.normalMap = deriveNormalMap(terrain.heights, 512);
const p = scratchPose();
const gp = scratchGround();
poseAt(SEAM_B + 1e-5, p);
groundPose(SEAM_B + 1e-5, { appliedF: 0, appliedL: 0, moving: 0, w: 1, yaw: 0, pitch: 0 }, terrain.heights, p, gp);
console.log("levelled", off.toFixed(3) + "m at the cut; seam-frame eye", gp.local.y.toFixed(3) + "m; heightAt(cut) now", heightAt(terrain.heights, CUT_LOCAL[0], CUT_LOCAL[2]).toFixed(4));
console.log("normalMap", terrain.normalMap.image.width + "px colorSpace=" + terrain.normalMap.colorSpace + " wrap=" + terrain.normalMap.wrapS);
console.log("detail wrap=" + maps.detail.wrapS + " colorSpace=" + maps.detail.colorSpace, "| moon repeat", maps.moon.repeat.toArray().join("x"));
console.log(`boot path OK in ${(performance.now() - t0).toFixed(0)}ms, ${created} canvases`);
process.exit(missing.length ? 1 : 0);
