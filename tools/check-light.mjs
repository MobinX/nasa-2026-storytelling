// What the walk really shows a phone. Every vehicle is shaded the way three 0.186 will shade it - glTF
// baseColorFactor in linear space, one directional light, no environment to give a metal anything to
// reflect, ACESFilmic at exposure 0.95, sRGB out - and the triangles are weighted by how much of each one is
// inside the portrait frame at the stop, which is the only weighting that answers "can the visitor see it".
//
// There are two floors here and they pull against each other on purpose. The night side of a machine has to
// clear black, because four of the ten stops stand with their unlit side to the visitor and a silhouette you
// are being asked to look at is a failure. And the sun side has to stay clearly brighter than it, because the
// one thing that makes a lunar noon read as a lunar noon is that the shadows on the regolith are black. Any
// fix that lifts everything equally passes the first floor and fails the second.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Color, LinearSRGBColorSpace } from "three";
import { reveal, tint, ground, luma } from "../src/lib/surface.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

// --- three's own output path, transcribed. ACESFilmic in three divides the exposure by 0.6 before anything
// else, and its RRT toe sends everything under about 0.003 linear to zero: that clamp is why a "small" fill
// change measured with a gamma-only model looks like nothing on the phone.
const RECIPROCAL_PI = 1 / Math.PI;
const EXPOSURE = 0.95;
const ACES_IN = [[0.59719, 0.076, 0.0284], [0.35458, 0.90834, 0.13383], [0.04823, 0.01566, 0.83777]];
const ACES_OUT = [[1.60475, -0.10208, -0.00327], [-0.53108, 1.10813, -0.07276], [-0.07367, -0.00605, 1.07602]];
const mul3 = (M, v) => [0, 1, 2].map((i) => M[0][i] * v[0] + M[1][i] * v[1] + M[2][i] * v[2]);
const rrt = (v) => v.map((x) => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.432951) + 0.238081));
const oetf = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const encode = (rgb) => rgb.map((x) => oetf(Math.max(0, Math.min(1, x))));

// --- the shading, per face: diffuse plus the material's own bounce. Specular is deliberately left out: a
// single directional on a rough surface is one glint, and a glint is not what makes a vehicle readable.
const lin = (hex) => { const c = new Color(hex); return [c.r, c.g, c.b]; };
function shade({ albedo, emissive, metal, N, S, sunColor, sunIntensity, ambient }) {
  const ndl = N[0] * S[0] + N[1] * S[1] + N[2] * S[2];
  const diffuse = albedo.map((a) => a * (1 - metal) * RECIPROCAL_PI);
  const out = [0, 1, 2].map((k) => diffuse[k] * (ambient[k] + Math.max(0, ndl) * sunColor[k] * sunIntensity) + emissive[k]);
  const mapped = mul3(ACES_OUT, rrt(mul3(ACES_IN, out.map((c) => (c * EXPOSURE) / 0.6))));
  return { luma: luma(encode(mapped)), ndl };
}

// --- glTF in both containers the app ships, read the same way tools/check-models.mjs reads it
function readDoc(file) {
  const raw = fs.readFileSync(file);
  if (raw.slice(0, 4).toString("latin1") !== "glTF") {
    const json = JSON.parse(raw.toString("utf8"));
    return { json, bin: Buffer.from(json.buffers[0].uri.split(",")[1], "base64") };
  }
  let off = 12, json = null, bin = null;
  while (off + 8 <= raw.length) {
    const len = raw.readUInt32LE(off), kind = raw.readUInt32LE(off + 4), data = raw.slice(off + 8, off + 8 + len);
    if (kind === 0x4e4f534a) json = JSON.parse(data.toString("utf8"));
    if (kind === 0x004e4942) bin = data;
    off += 8 + len;
  }
  return { json, bin };
}

// Every material the browser will end up holding: the file's factors, through the pass lib/models.js runs.
function primitivesOf(file) {
  const { json: d, bin } = readDoc(path.join(root, "public", file));
  const drawn = new Set((d.nodes ?? []).map((n) => n.mesh).filter((m) => m !== undefined));
  const prims = [];
  for (const mi of drawn) for (const pr of d.meshes[mi].primitives) {
    const read = (ai) => {
      const a = d.accessors[ai], bv = d.bufferViews[a.bufferView];
      return new Float32Array(bin.buffer, bin.byteOffset + bv.byteOffset + (a.byteOffset || 0), a.count * 3);
    };
    const pbr = d.materials[pr.material]?.pbrMetallicRoughness ?? {};
    const factor = (pbr.baseColorFactor ?? [1, 1, 1, 1]).slice(0, 3);
    const material = reveal({
      color: new Color().setRGB(factor[0], factor[1], factor[2], LinearSRGBColorSpace),
      metalness: pbr.metallicFactor ?? 1,
      emissive: new Color(0, 0, 0),
    });
    prims.push({
      name: d.materials[pr.material]?.name ?? "unnamed",
      pos: read(pr.attributes.POSITION),
      albedo: [material.color.r, material.color.g, material.color.b],
      emissive: [material.emissive.r, material.emissive.g, material.emissive.b],
      metal: material.metalness,
      textured: pbr.baseColorTexture !== undefined,
    });
  }
  return prims;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const rotY = (v, a) => [Math.cos(a) * v[0] + Math.sin(a) * v[2], v[1], -Math.sin(a) * v[0] + Math.cos(a) * v[2]];

// The frame the visitor is standing in when the scroll traps: the walk author's local metres, the vehicle
// parked at its bearing and turned to its objYaw, the camera at the stop's park point.
function lookAt(stop, world, file) {
  const S = [world.sunLocal.x, world.sunLocal.y, world.sunLocal.z];
  const ambient = lin(world.ambientColor).map((c) => c * world.ambient);
  const sunColor = lin(world.sunColor);
  const at = [stop.obj[0], stop.planet === "solar" ? stop.obj[1] : 0, stop.obj[2]];
  let sum = 0, lit = 0, litW = 0, dark = 0, darkW = 0, voidW = 0, top = 0, inFrame = 0;
  for (const P of primitivesOf(file)) {
    for (let i = 0; i < P.pos.length; i += 9) {
      const v = [0, 1, 2].map((k) => rotY([P.pos[i + k * 3], P.pos[i + k * 3 + 1], P.pos[i + k * 3 + 2]], stop.yaw).map((x, a) => x + at[a]));
      let N = unit(cross(sub(v[1], v[0]), sub(v[2], v[0])));
      const c = [(v[0][0] + v[1][0] + v[2][0]) / 3, (v[0][1] + v[1][1] + v[2][1]) / 3, (v[0][2] + v[1][2] + v[2][2]) / 3];
      const toCam = unit(sub(stop.cam, c));
      if (dot(N, toCam) < 0) N = N.map((x) => -x); // side:2 - the far skin of open soup is drawn too
      const area = Math.hypot(...cross(sub(v[1], v[0]), sub(v[2], v[0]))) / 2;
      const weight = area * Math.max(0, dot(N, toCam));
      if (!(weight > 0)) continue;
      const { luma: L, ndl } = shade({ albedo: P.albedo, emissive: P.emissive, metal: P.metal, N, S, sunColor, sunIntensity: world.sunIntensity, ambient });
      inFrame += weight;
      sum += weight * L;
      if (!(L >= 0 && L <= 1)) continue;
      top = Math.max(top, L);
      if (L < 0.035) voidW += weight; // under about 9/255 there is no shape left, only a hole
      if (ndl > 0.15) { lit += weight * L; litW += weight; }
      else if (ndl < 0.05) { dark += weight * L; darkW += weight; }
    }
  }
  return { mean: sum / (inFrame || 1), peak: top, void: voidW / (inFrame || 1), lit: litW ? lit / litW : 0, dark: darkW ? dark / darkW : 0 };
}

const { apply, OBJECTS } = await import("../src/data/objects.js");
const { STOPS } = await import("../src/journey/stops.js");
apply(OBJECTS);
const { MOON, MARS, EVA } = await import("../src/journey/worlds.js");
const WORLD = { moon: MOON, mars: MARS, solar: EVA };
const FILE = Object.fromEntries(OBJECTS.map((o) => [o.id, o["3dmodel"]]));

const MIN_MEAN = 35; // /255: the floor a machine has to clear to read as an object rather than a silhouette
const MAX_VOID = 0.1; // of the in-frame area allowed under 9/255 - struts and cables are allowed to be dark
const MIN_RATIO = 2; // sun side over night side: the hard noon has to survive whatever lifts the shadows

console.log("stop                 file                        mean  void   sunlit  night   ratio");
for (const planet of ["moon", "mars", "solar"]) {
  for (const stop of STOPS[planet]) {
    const r = lookAt({ ...stop, planet }, WORLD[planet], FILE[stop.id]);
    const at = (m) => `${stop.id}: ${m}`;
    ok(r.mean * 255 >= MIN_MEAN, at(`reads ${Math.round(r.mean * 255)}/255 from the walk - the floor is ${MIN_MEAN}`));
    ok(r.void <= MAX_VOID, at(`${(r.void * 100).toFixed(0)}% of what the stop shows is under 9/255 - the ceiling is ${(MAX_VOID * 100).toFixed(0)}%`));
    ok(r.dark * 255 >= 8, at(`its night side measures ${Math.round(r.dark * 255)}/255: nothing there is visible`));
    ok(r.lit >= r.dark * MIN_RATIO, at(`sun side ${Math.round(r.lit * 255)} vs night side ${Math.round(r.dark * 255)}: the one sun no longer models the vehicle`));
    console.log(`${stop.id.padEnd(20)} ${path.basename(FILE[stop.id]).padEnd(27)} ${Math.round(r.mean * 255)}/${Math.round(r.void * 100)}%  ${Math.round(r.lit * 255)}     ${Math.round(r.dark * 255)}     ${(r.lit / (r.dark || 1e-6)).toFixed(1)}x`);
  }
}

// The soil, measured the same way: a horizontal patch of the world's own ground colour, which is most of any
// walk-up frame, lit at that world's sun elevation. This is an upper bound - the ground is a tint over a real
// albedo map and the map is darker than the tint - so what is asserted is the tint's own level and the fact
// that the far field still recedes from the near one, which is a depth cue rather than an exposure error.
const GROUND_MIN = 0.7;
console.log("");
for (const planet of ["moon", "mars"]) {
  const world = WORLD[planet];
  const S = [world.sunLocal.x, world.sunLocal.y, world.sunLocal.z];
  const ambient = lin(world.ambientColor).map((c) => c * world.ambient);
  const t = ground(world.groundColor, world.farColor);
  const g = shade({ albedo: [t.near.r, t.near.g, t.near.b], emissive: [0, 0, 0], metal: 0, N: [0, 1, 0], S, sunColor: lin(world.sunColor), sunIntensity: world.sunIntensity, ambient }).luma;
  ok(luma(t.near) >= GROUND_MIN, `${planet}: its ground tint keeps only ${(luma(t.near) * 100).toFixed(0)}% of the map under it`);
  ok(luma(t.far) < luma(t.near), `${planet}: the far ground is no longer darker than the near - the horizon stopped receding`);
  console.log(`${planet.padEnd(20)} ground tint ${(luma(new Color(world.groundColor)) * 100).toFixed(0)}% -> ${(luma(t.near) * 100).toFixed(0)}%, far ${(luma(t.far) * 100).toFixed(0)}%: a horizontal patch reads ${Math.round(g * 255)}/255 before its map`);
}

// The two diagrams of the solar system: a body drawn with a texture and a colour multiplies them in linear
// space, so a hue that reads as a pale pastel on the swatch is quietly holding the map to a fifth of itself.
const { BODIES } = await import("../src/lib/bodies.js");
const MIN_TINT = 0.5;
console.log("\nbody       hue        keeps   tinted");
for (const b of BODIES) {
  const kept = luma(tint(b.colour));
  ok(kept >= MIN_TINT, `${b.id}: the tint keeps ${(kept * 100).toFixed(0)}% of its map - the floor is ${(MIN_TINT * 100).toFixed(0)}%`);
  ok(Math.abs(luma(b.tint) - kept) < 1e-9, `${b.id}: the tint lib/bodies.js ships is not the one lib/surface.js computes`);
  console.log(`${b.id.padEnd(10)} ${b.colour}  ${(luma(new Color(b.colour)) * 100).toFixed(0).padStart(4)}%   ${(kept * 100).toFixed(0)}%`);
}
for (const [name, hex] of [["moon globe", "#c9c9cf"], ["mars globe", "#bd7a58"], ["moon dot", "#c9c9cd"]]) {
  const kept = luma(tint(hex));
  ok(kept >= MIN_TINT, `${name}: the globe tint keeps ${(kept * 100).toFixed(0)}% of its map`);
  console.log(`${name.padEnd(10)} ${hex}  ${(luma(new Color(hex)) * 100).toFixed(0).padStart(4)}%   ${(kept * 100).toFixed(0)}%`);
}

console.log(fails.length ? "\nFAIL\n" + fails.map((f) => " - " + f).join("\n") : "\nevery stop reads from where the walk stands, and every body keeps its map");
process.exit(fails.length ? 1 : 0);
