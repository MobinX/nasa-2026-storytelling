// Geometry/continuity checks for the whole journey, run against the same modules the camera rig uses.
// node tools/check-journey.mjs
import { Vector3 } from "three";
import { poseAt, scratchPose, SPACES, SITE, CUT_LOCAL } from "../src/journey/pose.js";
import { groundPose, scratchGround } from "../src/journey/ground.js";
import { buildTerrain, levelTerrain, heightAt } from "../src/lib/terrain.js";
import { SEAM_A, SEAM_B, clamp01, groundWeight } from "../src/journey/timeline.js";

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

const terrain = buildTerrain({ seg: 96 });
const levelOff = levelTerrain(terrain, CUT_LOCAL[0], CUT_LOCAL[2]);
const p = scratchPose();
const gp = scratchGround();
const NO_INPUT = { appliedF: 0, appliedL: 0, moving: 0, w: 1, yaw: 0, pitch: 0 };

let nonFinite = 0;
const steps = new Map();
let prev = null, prevSpace = null;
let minAlt = 1e9, maxGroundEye = -1e9, minGroundEye = 1e9, zBack = 0, prevZ = null;

const N = 20000;
for (let i = 0; i <= N; i++) {
  const o = i / N;
  poseAt(o, p);
  if (![p.position.x, p.position.y, p.position.z, p.target.x, p.target.y, p.target.z, p.fov].every(Number.isFinite)) nonFinite++;
  ok(p.fov > 26 && p.fov < 74, `fov out of range at o=${o.toFixed(3)}: ${p.fov.toFixed(1)}`);

  if (p.space.local) {
    groundPose(o, NO_INPUT, terrain.heights, p, gp);
    const eye = heightAt(terrain.heights, gp.local.x, gp.local.z);
    const above = gp.local.y - eye;
    minGroundEye = Math.min(minGroundEye, above);
    maxGroundEye = Math.max(maxGroundEye, above);
    if (prevZ !== null && gp.local.z < prevZ - 1e-6) zBack++;
    prevZ = gp.local.z;
  } else {
    const alt = p.position.length() - SITE.pos.length();
    if (p.space.id === "lunar") minAlt = Math.min(minAlt, p.position.distanceTo(new Vector3(0, 0, 0)) - 12);
  }

  if (prev && prevSpace === p.space.id) {
    const k = p.space.id;
    steps.set(k, Math.max(steps.get(k) || 0, p.position.distanceTo(prev)));
  }
  prev = p.position.clone();
  prevSpace = p.space.id;
}

ok(nonFinite === 0, `${nonFinite} non-finite poses`);
ok(minAlt > 0.3, `lunar camera clips the sphere: min altitude ${minAlt.toFixed(3)}u`);
ok(minGroundEye > 0.15, `ground eye dips into the terrain: min ${minGroundEye.toFixed(3)}m above surface`);
ok(maxGroundEye < 2.6, `ground eye floats too high: max ${maxGroundEye.toFixed(3)}m`);
ok(zBack === 0, `ground rail advances backwards ${zBack} times with no input`);
for (const [k, v] of steps) ok(v < (k === "ground" ? 0.05 : 0.6), `${k} rail has a ${v.toFixed(3)}-unit jump between adjacent samples`);

const head = (o) => { poseAt(o, p); return p.target.clone().sub(p.position).normalize(); };
poseAt(SEAM_A - 1e-4, p); const aPos = p.position.clone(); const aHead = head(SEAM_A - 1e-4);
poseAt(SEAM_A + 1e-4, p); const bPos = p.position.clone(); const bHead = head(SEAM_A + 1e-4);
ok(aHead.dot(bHead) > 0.95, `seam A heading jumps: dot ${aHead.dot(bHead).toFixed(4)}`);

poseAt(SEAM_B - 1e-5, p); const cWorld = p.position.clone(); const cHead = head(SEAM_B - 1e-5); const cFov = p.fov;
poseAt(SEAM_B + 1e-5, p); groundPose(SEAM_B + 1e-5, NO_INPUT, terrain.heights, p, gp);
const dFov = p.fov;
const dWorld = gp.world.clone();
const dHead = p.target.clone().sub(p.position).normalize();
const gap = cWorld.distanceTo(dWorld);
ok(gap < 0.15, `seam B position gap ${gap.toFixed(3)}m - terrain not levelled at the cut (offset ${levelOff.toFixed(2)}m)`);
ok(dHead.dot(cHead) > 0.999, `seam B heading jumps: dot ${dHead.dot(cHead).toFixed(5)}`);
ok(Math.abs(cFov - dFov) < 0.5, `seam B fov jumps ${cFov.toFixed(2)} -> ${dFov.toFixed(2)}`);

poseAt(SEAM_A, p);
ok(p.space.id === "solar", "at exactly SEAM_A the solar rail's frame-filling terminus must still be the live pose");
poseAt(SEAM_A + 1e-6, p);
ok(p.space.id === "lunar", "the lunar space must take over immediately after SEAM_A");
ok(SPACES.length === 3 && SPACES[2].local, "expected 3 spaces with only the ground one local");
const endZ = (() => { poseAt(1, p); groundPose(1, NO_INPUT, terrain.heights, p, gp); return gp.local.z; })();
ok(endZ > 20, `walk covers only ${endZ.toFixed(1)}m of authored rail`);
ok(groundWeight(0.699) === 0 && groundWeight(0.76) === 1, "groundWeight gates wrong");

console.log(`terrain: levelled ${levelOff.toFixed(2)}m at the cut, built in ${terrain.ms.toFixed(0)}ms`);
console.log(`steps per space   `, [...steps].map(([k, v]) => `${k}=${v.toFixed(3)}`).join(" "));
console.log(`min lunar altitude ${minAlt.toFixed(3)}u | ground eye ${minGroundEye.toFixed(2)}..${maxGroundEye.toFixed(2)}m above surface | rail end ${endZ.toFixed(1)}m`);
console.log(`seam A heading dot ${aHead.dot(bHead).toFixed(4)} (gap ${aPos.distanceTo(bPos).toFixed(2)}u, different worlds)`);
console.log(`seam B gap ${gap.toFixed(4)}m heading ${dHead.dot(cHead).toFixed(5)} fov ${cFov.toFixed(2)}->${dFov.toFixed(2)}`);
console.log(fails.length ? "\nFAIL\n" + fails.map((f) => " - " + f).join("\n") : "\nall journey checks passed");
process.exit(fails.length ? 1 : 0);
