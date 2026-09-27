import fs from "node:fs";
// Geometry/continuity checks for the whole journey, run against the same modules the camera rig uses.
// node tools/check-journey.mjs
import { Euler, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { poseAt, scratchPose, SPACES, SITE, R_SPHERE, CUT_LOCAL, LM_LOCAL, FLAG_LOCAL, LM_BOX, FLAG_BOX, COMPANION_LOCAL, COMPANION_BOX, walkDistance } from "../src/journey/pose.js";
import { groundPose, scratchGround } from "../src/journey/ground.js";
import { buildTerrain, buildCraters, levelTerrain, heightAt, NEAR_R } from "../src/lib/terrain.js";
import { GROUND_CORRIDOR } from "../src/journey/corridor.js";
import { ROCK_N, ROCK_CLEARANCE, scatterRocks } from "../src/lib/rocks.js";
import { nearestOnCorridor } from "../src/lib/path-clearance.js";
import { SEAM_A, SEAM_B, CONTACT, IMPACT_END, WALK_IN, walkWeight, impact } from "../src/journey/timeline.js";

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };
const DEG = 180 / Math.PI;

const terrain = buildTerrain({ seg: 96, avoid: GROUND_CORRIDOR });
const levelOff = levelTerrain(terrain, CUT_LOCAL[0], CUT_LOCAL[2]);
const p = scratchPose();
const gp = scratchGround();

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
    groundPose(o, terrain.heights, p, gp);
    const eye = heightAt(terrain.heights, gp.local.x, gp.local.z);
    const above = gp.local.y - eye;
    minGroundEye = Math.min(minGroundEye, above);
    maxGroundEye = Math.max(maxGroundEye, above);
    if (prevZ !== null && gp.local.z < prevZ - 1e-6) zBack++;
    prevZ = gp.local.z;
  } else {
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
// The ground act opens at landing altitude and only then becomes a person walking, so the ceiling that
// used to cover the whole act belongs to the walk alone.
ok(maxGroundEye < 9, `ground eye floats too high: max ${maxGroundEye.toFixed(3)}m`);
{
  let lo = 9, hi = -9;
  for (let i = 0; i <= 300; i++) {
    const o = WALK_IN + (i / 300) * (1 - WALK_IN);
    poseAt(o, p);
    groundPose(o, terrain.heights, p, gp, 0);
    const above = gp.local.y - heightAt(terrain.heights, gp.local.x, gp.local.z);
    lo = Math.min(lo, above);
    hi = Math.max(hi, above);
  }
  ok(lo > 1.4 && hi < 2.1, `the walk is not at human height: ${lo.toFixed(2)}..${hi.toFixed(2)}m above the surface`);
  console.log(`walk eye height ${lo.toFixed(2)}..${hi.toFixed(2)}m above the surface`);
}
ok(zBack === 0, `ground rail advances backwards ${zBack} times`);
for (const [k, v] of steps) ok(v < (k === "ground" ? 0.05 : 0.6), `${k} rail has a ${v.toFixed(3)}-unit jump between adjacent samples`);

// ---- the lunar act is a descent, not a lap of the Moon --------------------------------------------
// Seam A and seam B both hide a position jump of several orders of magnitude on the strength of a frame
// that is nothing but regolith. On a sphere that means staying inside the limb, which for a portrait frame
// is the diagonal corner, not the vertical edge. Anything that leaks puts black sky on one side of a cut.
const _toSite = new Quaternion(SITE.quaternion.x, SITE.quaternion.y, SITE.quaternion.z, SITE.quaternion.w).invert();
const _l = new Vector3();
let reversed = 0, prevAlong = null, worstMargin = 99, marginAt = 0;
for (let i = 1; i <= 900; i++) {
  const o = SEAM_A + (i / 900) * (SEAM_B - SEAM_A - 1e-4);
  poseAt(o, p);
  _l.copy(p.position).sub(SITE.pos).applyQuaternion(_toSite);
  if (prevAlong !== null && _l.z < prevAlong - 1e-4) reversed++;
  prevAlong = _l.z;
  const offNadir = Math.acos(-p.target.clone().sub(p.position).normalize().dot(SITE.n));
  const tv = Math.tan(p.fov / 2 / DEG);
  const corner = Math.atan(Math.hypot(tv, tv * 0.5));
  const margin = (Math.asin(R_SPHERE / p.position.length()) - (offNadir + corner)) * DEG;
  if (margin < worstMargin) { worstMargin = margin; marginAt = o; }
}
ok(reversed === 0, `the descent reverses its travel ${reversed} times: the camera is circling the Moon again`);
ok(worstMargin > 0, `the descent shows the limb and black sky at o=${marginAt.toFixed(3)}: ${worstMargin.toFixed(2)}deg past the edge`);

// Contact: the rumble must bracket its own band and not the hand-off, the camera must be parked while it
// runs, and the frame it shakes has to contain something - the horizon and the ground 1..20 m out.
ok(impact(SEAM_B) === 0 && impact(CONTACT) === 0 && impact(IMPACT_END) === 0, "the rumble does not bracket its band");
let peakT = 1, peak = 0;
for (let i = 0; i <= 400; i++) {
  const t = i / 400;
  const v = Math.abs(impact(CONTACT + t * (IMPACT_END - CONTACT)));
  if (v > peak) { peak = v; peakT = t; }
}
ok(peakT < 0.34, `the rumble peaks ${(peakT * 100).toFixed(0)}% through its band: it should hit at contact and decay`);
let rock = 0, jolt = 0;
for (let i = 0; i <= 400; i++) {
  const o = CONTACT + (i / 400) * (IMPACT_END - CONTACT);
  poseAt(o, p);
  groundPose(o, terrain.heights, p, gp, 0);
  rock = Math.max(rock, Math.abs(gp.pitch - gp.pitchAuth) * DEG);
  jolt = Math.max(jolt, Math.abs(gp.local.y - p.local.y - heightAt(terrain.heights, gp.local.x, gp.local.z)));
}
ok(rock > 4, `the touchdown rocks the camera ${rock.toFixed(1)}deg off its authored pitch - a shrug, not an impact`);
const contactTravel = walkDistance(IMPACT_END) - walkDistance(CONTACT);
ok(contactTravel < 0.4, `${contactTravel.toFixed(2)}m walked during the rumble: the camera is not parked at contact`);
ok(walkDistance(SEAM_B) === 0, `the ground rail starts at ${walkDistance(SEAM_B).toFixed(2)}m, so footprints begin behind the camera`);
// The hand-off frame must hold no horizon (that is what makes the cut unobservable), the contact frame
// must hold one plus ground out to tens of metres (that is what makes the rumble visible), and by the time
// the walking unlocks the head has to be up.
const topEdge = (o) => {
  poseAt(o, p);
  groundPose(o, terrain.heights, p, gp, 0);
  return (gp.pitch + (p.fov / 2 / DEG)) * DEG;
};
const eyeAbove = (o) => {
  poseAt(o, p);
  groundPose(o, terrain.heights, p, gp, 0);
  return gp.local.y - heightAt(terrain.heights, gp.local.x, gp.local.z);
};
ok(topEdge(SEAM_B + 1e-4) < -10, `the frame already shows the horizon at the hand-off: top edge ${topEdge(SEAM_B + 1e-4).toFixed(1)}deg`);
// ... and nothing beyond the displaced field, which is the other way a hand-off can be seen.
const farHit = (eyeAbove(SEAM_B + 1e-4) / Math.tan(-topEdge(SEAM_B + 1e-4) / DEG));
ok(farHit < NEAR_R * 0.9, `the hand-off frame reaches ${farHit.toFixed(0)}m out, past the textured field`);
ok(topEdge(CONTACT) > 0, `the contact frame holds no horizon to shake: top edge ${topEdge(CONTACT).toFixed(1)}deg`);
ok(topEdge(WALK_IN) > 5, `the stand-up never lifts the horizon into frame: top edge ${topEdge(WALK_IN).toFixed(1)}deg at the walk`);
console.log(`descent: heading stays ${worstMargin.toFixed(1)}deg inside the limb at o=${marginAt.toFixed(3)}, contact rocks ${rock.toFixed(1)}deg and ${jolt.toFixed(2)}m, rail parked at ${contactTravel.toFixed(2)}m`);
console.log(`landing: hand-off at ${eyeAbove(SEAM_B + 1e-4).toFixed(1)}m seeing ${farHit.toFixed(0)}m of field, contact at ${eyeAbove(CONTACT + 0.02).toFixed(1)}m with the horizon in frame, walk unlocked at ${WALK_IN}`);

const head = (o) => { poseAt(o, p); return p.target.clone().sub(p.position).normalize(); };
const rigQuat = (g) => new Quaternion().setFromEuler(new Euler(g.pitch, g.yaw, g.roll, "YXZ")).premultiply(SITE.quaternion);
poseAt(SEAM_A - 1e-4, p); const aPos = p.position.clone(); const aHead = head(SEAM_A - 1e-4);
poseAt(SEAM_A + 1e-4, p); const bPos = p.position.clone(); const bHead = head(SEAM_A + 1e-4);
ok(aHead.dot(bHead) > 0.95, `seam A heading jumps: dot ${aHead.dot(bHead).toFixed(4)}`);

// Seam B cuts position on purpose - eight metres of it - because the sphere cannot frame a landing-height
// view. What must survive the cut is the orientation: the ground act stands the camera on the site's own
// normal, so roll is the half that can actually break, and it was the half broken silently for the whole
// first build. Compare full orientations, not just headings.
poseAt(SEAM_B - 1e-5, p);
const cWorld = p.position.clone(); const cHead = head(SEAM_B - 1e-5); const cFov = p.fov;
const _m = new Matrix4().lookAt(cWorld, p.target.clone(), SITE.n);
const cQuat = new Quaternion().setFromRotationMatrix(_m);
poseAt(SEAM_B + 1e-5, p); groundPose(SEAM_B + 1e-5, terrain.heights, p, gp);
const dFov = p.fov;
const dWorld = gp.world.clone();
const dHead = p.target.clone().sub(p.position).normalize();
const gap = cWorld.distanceTo(dWorld);
ok(gap > 6.5 && gap < 9, `seam B hand-off is ${gap.toFixed(3)}m apart, not the eight metres of landing the ground act opens with`);
ok(Math.abs(heightAt(terrain.heights, CUT_LOCAL[0], CUT_LOCAL[2])) < 1e-6, `the field is not levelled at the hand-off spot (offset ${levelOff.toFixed(2)}m)`);
ok(dHead.dot(cHead) > 0.999, `seam B heading jumps: dot ${dHead.dot(cHead).toFixed(5)}`);
ok(Math.abs(cFov - dFov) < 0.5, `seam B fov jumps ${cFov.toFixed(2)} -> ${dFov.toFixed(2)}`);
const rollHandoff = 2 * Math.acos(Math.min(1, Math.abs(cQuat.dot(rigQuat(gp))))) * DEG;
ok(rollHandoff < 2, `seam B rolls ${rollHandoff.toFixed(1)}deg across the cut`);

poseAt(SEAM_A, p);
ok(p.space.id === "solar", "at exactly SEAM_A the solar rail's frame-filling terminus must still be the live pose");
poseAt(SEAM_A + 1e-6, p);
ok(p.space.id === "lunar", "the lunar space must take over immediately after SEAM_A");
ok(SPACES.length === 3 && SPACES[2].local, "expected 3 spaces with only the ground one local");
const endZ = (() => { poseAt(1, p); groundPose(1, terrain.heights, p, gp); return gp.local.z; })();
ok(endZ > 20, `walk covers only ${endZ.toFixed(1)}m of authored rail`);
ok(walkWeight(CONTACT) === 0 && walkWeight(0.93) === 1, "the gait gate is not held shut through the landing");
// The ground act is six equal legs, so contact and the walk are the second and fourth sixths by authorship
// and by nothing else. timeline.js cannot derive them without a cycle, so this is where the two agree.
const legStart = (k) => SEAM_B + (k / SPACES[2].legs.length) * (1 - SEAM_B);
ok(SPACES[2].legs.length === 6, `the ground act has ${SPACES[2].legs.length} legs, not the six the timeline assumes`);
ok(Math.abs(CONTACT - legStart(2)) < 1e-3, `the rumble starts at ${CONTACT}, which is ${(CONTACT - legStart(2)).toFixed(3)} off the contact leg at ${legStart(2).toFixed(3)}`);
ok(Math.abs(WALK_IN - legStart(4)) < 1e-3, `the walk unlocks at ${WALK_IN}, not at the walking leg's ${legStart(4).toFixed(3)}`);

// ---- the walk has to be walkable, and it has to arrive somewhere -------------------------------
// With no steering the rail is the only path, so anything generated against the terrain is now
// load-bearing rather than cosmetic.

let maxSlope = 0, walkClimb = 0;
{
  const z = GROUND_CORRIDOR.filter(([, zz]) => zz > -1);
  for (let i = 1; i < z.length; i++) {
    const [x0, z0] = z[i - 1], [x1, z1] = z[i];
    const d = Math.hypot(x1 - x0, z1 - z0);
    maxSlope = Math.max(maxSlope, Math.abs(Math.atan2(heightAt(terrain.heights, x1, z1) - heightAt(terrain.heights, x0, z0), d)));
  }
  walkClimb = heightAt(terrain.heights, z.at(-1)[0], z.at(-1)[1]) - heightAt(terrain.heights, z[0][0], z[0][1]);
}
ok(maxSlope * DEG < 2, `the walk climbs a ${maxSlope.toFixed(1)}deg hill: the horizon never arrives`);
// The eye-height assertions above cannot see this: groundPose adds heightAt and the check subtracts it,
// so terrain cancels exactly and only the authored y column is ever tested. This is the real measure.
poseAt(1, p); groundPose(1, terrain.heights, p, gp);
{
  const ahead = new Vector3(gp.local.x, 0, gp.local.z + 15);
  ahead.y = heightAt(terrain.heights, ahead.x, ahead.z);
  const dip = Math.atan2(ahead.y - gp.local.y, 15) * DEG;
  ok(dip < -3, `ground 15m ahead sits at ${dip.toFixed(1)}deg, not the -6.5deg a flat mare gives`);
  console.log(`corridor: climb ${walkClimb.toFixed(2)}m, max slope ${(maxSlope * DEG).toFixed(1)}deg, ground 15m ahead ${dip.toFixed(1)}deg`);
}

{
  const craters = buildCraters(GROUND_CORRIDOR);
  const uncut = buildCraters();
  const margin = Math.min(...craters.map((k) => nearestOnCorridor(k.x, k.z, GROUND_CORRIDOR).dist - k.r * 1.25));
  ok(margin >= 0, `a crater rim reaches the walk corridor: ${margin.toFixed(2)}m inside`);
  ok(uncut.length - craters.length > 0 && uncut.length - craters.length < 8, `${uncut.length - craters.length} craters rejected; the corridor should meet the mare, not clear it`);
  console.log(`craters: ${uncut.length} seeded, ${uncut.length - craters.length} rejected off the corridor, closest rim margin ${margin.toFixed(1)}m`);
}

const recordTo = (list) => ({ setMatrixAt: (i, m) => list.push([m.elements[12], m.elements[14]]), instanceMatrix: { needsUpdate: false } });
{
  const clamped = []; scatterRocks(recordTo(clamped), terrain.heights, GROUND_CORRIDOR);
  const raw = []; scatterRocks(recordTo(raw), terrain.heights, undefined);
  ok(clamped.length === ROCK_N && raw.length === ROCK_N, `rock scatter filled ${clamped.length} of ${ROCK_N} slots`);
  const near = (list) => Math.min(...list.map(([x, z]) => nearestOnCorridor(x, z, GROUND_CORRIDOR).dist));
  const rawNear = near(raw), clampedNear = near(clamped);
  ok(rawNear < ROCK_CLEARANCE, `the rock clearance test is vacuous: nothing was ever within ${ROCK_CLEARANCE}m of the rail`);
  ok(clampedNear >= ROCK_CLEARANCE - 1e-6, `a rock sits ${clampedNear.toFixed(2)}m from the walk path, which the camera now walks through`);
  console.log(`rocks: closest ${rawNear.toFixed(2)}m unclamped -> ${clampedNear.toFixed(2)}m clamped (ceiling ${ROCK_CLEARANCE}m)`);
}

// The ending composition, asserted rather than eyeballed - nothing in this project has ever been
// rendered on a real device, and portrait is only 30.4deg wide at fov 57.
const camera = new PerspectiveCamera(57, 0.5, SPACES[2].near, SPACES[2].far);
const eye = { v: new Vector3(), q: new Quaternion() };

// The eight corners of a prop, in camera space. |ndc| <= 1 is the frame edge; the assertion uses 0.98 so
// a phone slightly narrower than 400x800 still keeps the subject in.
const subject = (site, box) => {
  const y0 = heightAt(terrain.heights, site[0], site[2]);
  const pts = [];
  for (const sx of [-box.half, box.half]) for (const sz of [-box.half, box.half]) for (const sy of [y0, y0 + box.top]) pts.push(new Vector3(site[0] + sx, sy, site[2] + sz).sub(eye.v).applyQuaternion(eye.q.clone().invert()));
  const centre = new Vector3(site[0], y0 + box.top / 2, site[2]).sub(eye.v).applyQuaternion(eye.q.clone().invert());
  const halfT = Math.tan(camera.fov / 2 / DEG);
  const elOf = (v) => Math.atan2(v.y, Math.hypot(v.x, -v.z));
  const base = Math.min(...pts.map(elOf));
  const range = centre.length();
  // Frustum containment is the easy half. The mistake that passes it is a subject behind a ridge, so the
  // terrain under the sight line is sampled against the lowest corner of the box.
  let blocked = 0, peak = -Infinity;
  for (let d = 1; d < range - 0.6; d += 0.5) {
    const k = d / range;
    const terr = Math.atan2(heightAt(terrain.heights, eye.v.x + (site[0] - eye.v.x) * k, eye.v.z + (site[2] - eye.v.z) * k) - eye.v.y, d);
    if (terr > peak) peak = terr;
    if (terr > base + 1e-6) blocked++;
  }
  return {
    ax: Math.max(...pts.map((v) => Math.abs(v.x / (-v.z * camera.aspect * halfT)))),
    ay: Math.max(...pts.map((v) => Math.abs(v.y / (-v.z * halfT)))),
    az: Math.atan2(centre.x, -centre.z) * DEG,
    arc: (Math.max(...pts.map(elOf)) - base) * DEG,
    range, blocked, peak: peak * DEG,
  };
};

poseAt(1, p); groundPose(1, terrain.heights, p, gp);
camera.fov = p.fov;
camera.position.copy(gp.world);
camera.quaternion.copy(rigQuat(gp));
camera.updateProjectionMatrix();
camera.updateMatrixWorld(true);
// World frame for the site normal, because this is the check that the deleted control system never had:
// a camera yawed and pitched out of the world axes while standing on a surface whose normal is 89deg
// away from them renders the horizon sideways, and no screenshot was ever taken to notice.
const camUp = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
const camRight = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
const tilt = Math.atan2(SITE.n.dot(camRight), SITE.n.dot(camUp)) * DEG;
ok(Math.abs(tilt) < 3, `the horizon is ${tilt.toFixed(1)}deg off level: the camera is not standing on the site normal`);

eye.v.copy(gp.local);
eye.q.setFromEuler(new Euler(gp.pitch, gp.yaw, gp.roll, "YXZ"));
const lm = subject(LM_LOCAL, LM_BOX);
const fl = subject(FLAG_LOCAL, FLAG_BOX);
const cp = subject(COMPANION_LOCAL, COMPANION_BOX);
for (const [name, x] of [["LM", lm], ["flag", fl], ["companion", cp]]) {
  ok(x.ax <= 0.98 && x.ay <= 0.98, `${name} leaves the portrait frame: ndc ${x.ax.toFixed(2)},${x.ay.toFixed(2)}`);
  ok(x.blocked === 0, `${name} is behind a ridge: ${x.blocked} samples of terrain above its base, peaking at ${x.peak.toFixed(1)}deg`);
}
// Three subjects in a 30.4-degree-wide frame is the whole difficulty of this ending, and it is only
// solvable in azimuth if the crew member is allowed to overlap the LM in depth - which is the point.
const cpSep = Math.min(Math.abs(cp.az - lm.az), Math.abs(cp.az - fl.az));
ok(cpSep > 2.5, `the companion is within ${cpSep.toFixed(1)}deg of centre azimuth of both the LM and the flag; he would be hidden`);
ok(cp.arc > 9 && cp.arc < 28, `the companion spans ${cp.arc.toFixed(1)}deg at ${cp.range.toFixed(1)}m - too small to read as a person, or filling the frame`);
ok(cp.range > 4 && cp.range < 14, `the companion is ${cp.range.toFixed(1)}m away; the conversation does not work at that distance`);
const sep = Math.abs(lm.az - fl.az);
ok(sep > 6 && sep < 20, `LM/flag bearing separation ${sep.toFixed(1)}deg: below 6 they overlap, above 20 one leaves frame`);
ok(fl.arc > lm.arc, `the flag spans ${fl.arc.toFixed(1)}deg and the LM ${lm.arc.toFixed(1)}deg - the foreground subject must read larger`);
console.log(`ending: companion ${cp.range.toFixed(1)}m at ${cp.az.toFixed(1)}deg (${cp.arc.toFixed(1)}deg tall, ndc ${cp.ax.toFixed(2)}/${cp.ay.toFixed(2)}), LM ${lm.range.toFixed(1)}m at ${lm.az.toFixed(1)}deg (${lm.arc.toFixed(1)}deg tall, ndc ${lm.ax.toFixed(2)}/${lm.ay.toFixed(2)}), flag ${fl.range.toFixed(1)}m at ${fl.az.toFixed(1)}deg (${fl.arc.toFixed(1)}deg tall, ndc ${fl.ax.toFixed(2)}/${fl.ay.toFixed(2)}), separation ${sep.toFixed(1)}deg, horizon ${tilt.toFixed(1)}deg off level`);

poseAt(SEAM_B + 1e-4, p); groundPose(SEAM_B + 1e-4, terrain.heights, p, gp);
const startRange = Math.hypot(LM_LOCAL[0] - gp.local.x, LM_LOCAL[2] - gp.local.z);
ok(lm.range < startRange * 0.5, `the walk only closes from ${startRange.toFixed(1)}m to ${lm.range.toFixed(1)}m from the LM`);
console.log(`approach: LM ${startRange.toFixed(1)}m -> ${lm.range.toFixed(1)}m`);

poseAt(SEAM_A, p);
console.log(`terrain: levelled ${levelOff.toFixed(2)}m at the cut, built in ${terrain.ms.toFixed(0)}ms`);
console.log(`steps per space   `, [...steps].map(([k, v]) => `${k}=${v.toFixed(3)}`).join(" "));
console.log(`min lunar altitude ${minAlt.toFixed(3)}u | ground eye ${minGroundEye.toFixed(2)}..${maxGroundEye.toFixed(2)}m above surface | rail end ${endZ.toFixed(1)}m`);
console.log(`seam A heading dot ${aHead.dot(bHead).toFixed(4)} (gap ${aPos.distanceTo(bPos).toFixed(2)}u, different worlds)`);
console.log(`seam B gap ${gap.toFixed(4)}m heading ${dHead.dot(cHead).toFixed(5)} roll ${rollHandoff.toFixed(2)}deg fov ${cFov.toFixed(2)}->${dFov.toFixed(2)}`);

// The rig is now a pure function of scroll.offset with nothing added, so the ground act can be scrubbed
// back and compared bit for bit - which was impossible while damped input integrators fed it.
const fwd = [];
for (let i = 0; i <= 60; i++) {
  poseAt(i / 60, p);
  const row = [p.position.x, p.position.y, p.position.z, p.fov];
  if (p.space.local) { groundPose(i / 60, terrain.heights, p, gp); row.push(gp.world.x, gp.world.y, gp.world.z, gp.yaw, gp.pitch, gp.walked); }
  fwd.push(row);
}
for (let i = 60; i >= 0; i--) {
  poseAt(i / 60, p);
  const row = [p.position.x, p.position.y, p.position.z, p.fov];
  if (p.space.local) { groundPose(i / 60, terrain.heights, p, gp); row.push(gp.world.x, gp.world.y, gp.world.z, gp.yaw, gp.pitch, gp.walked); }
  if (row.some((v, k) => Math.abs(v - fwd[i][k]) > 1e-12)) ok(false, `scrub-back differs at o=${i / 60}`);
}

const cameraPath = ["src/scene/CameraRig.jsx", "src/journey/ground.js", "src/journey/pose.js", "src/journey/rail.js"]
  .map((rf) => fs.readFileSync(new URL("../" + rf, import.meta.url), "utf8"))
  .join("\n");
ok(!/clock\.|elapsedTime|performance\.now|Date\.now/.test(cameraPath), "the camera path reads wall-clock time");
ok(!/useScroll\(\)\.offset\s*[+\-*/]=|scroll\.offset\s*=/.test(cameraPath), "something writes scroll.offset");

console.log("purity + clock-free camera path verified");
console.log(fails.length ? "\nFAIL\n" + fails.map((f) => " - " + f).join("\n") : "\nall journey checks passed");
process.exit(fails.length ? 1 : 0);
