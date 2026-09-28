import fs from "node:fs";
// Geometry/continuity checks for the whole journey, run against the same modules the camera rig uses.
// Everything is per world: the piece is two landings, and a second site is only as safe as the first if the
// assertions are repeated for it rather than assumed to transfer.
// node tools/check-journey.mjs
import { Euler, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { poseAt, scratchPose, SPACES, MOON_GROUND, MARS_GROUND, MOON_FRAMED_AT, MARS_FRAMED_AT, legStartOf, walkDistance, walkRate } from "../src/journey/pose.js";
import { MOON, MARS, R_SPHERE } from "../src/journey/worlds.js";
import { groundPose, scratchGround } from "../src/journey/ground.js";
import { buildTerrain, buildCraters, levelTerrain, flattenAlongCorridor, heightAt, NEAR_R } from "../src/lib/terrain.js";
import { CORRIDOR_BY_WORLD } from "../src/journey/corridor.js";
import { ROCK_N, ROCK_CLEARANCE, scatterRocks } from "../src/lib/rocks.js";
import { nearestOnCorridor } from "../src/lib/path-clearance.js";
import { SEAM_A, SEAM_B, DEPART, TRANSFER_END, MARS_SEAM, MOON_LEGS, MARS_LEGS, MOON_TALK_START, MOON_ASCENT_START, rumble, walkWeight } from "../src/journey/timeline.js";
const MOON_TALK_END = MOON_ASCENT_START;

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };
const DEG = 180 / Math.PI;
const UP = new Vector3(0, 1, 0);

const terrains = {};
for (const world of [MOON, MARS]) {
  const t = buildTerrain({ seg: 96, avoid: CORRIDOR_BY_WORLD[world.id], relief: world.relief });
  flattenAlongCorridor(t, CORRIDOR_BY_WORLD[world.id]);
  const off = levelTerrain(t, world.cut[0], world.cut[2]);
  ok(Math.abs(heightAt(t.heights, world.cut[0], world.cut[2])) < 1e-6, `${world.id}: field not levelled at the hand-off spot`);
  console.log(`${world.id}: terrain levelled ${off.toFixed(2)}m at the cut, built in ${t.ms.toFixed(0)}ms, sun ${world.sunElevation.toFixed(0)}deg up`);
  terrains[world.id] = t;
}

const p = scratchPose();
const gp = scratchGround();
const inv = (w) => new Quaternion(w.site.quaternion.x, w.site.quaternion.y, w.site.quaternion.z, w.site.quaternion.w).invert();

const localOf = (v, w) => v.clone().sub(w.site.pos).applyQuaternion(inv(w));
const heading = (o) => { poseAt(o, p); return p.target.clone().sub(p.position).normalize(); };
const upOf = (sp) => (sp.id === "solar" ? UP : sp.world.site.n);
// The rig's own attitude on the sphere side of a cut: lookAt with that world's vertical as up.
const sphereQuat = (o) => {
  poseAt(o, p);
  return new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(p.position, p.target, upOf(p.space)));
};
const groundQuat = (o) => {
  poseAt(o, p);
  groundPose(o, terrains[p.world.id].heights, p, gp, 0);
  return new Quaternion().setFromEuler(new Euler(gp.pitch, gp.yaw, gp.roll, "YXZ")).premultiply(p.world.site.quaternion);
};
const rollAcross = (o) => {
  const a = sphereQuat(o - 1e-5);
  const b = groundQuat(o + 1e-5);
  return 2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))) * DEG;
};
// Half the diagonal of a portrait frame, which is the worst corner a horizon can leak through.
const cornerOf = (fov) => {
  const tv = Math.tan(fov / 2 / DEG);
  return Math.atan(Math.hypot(tv, tv * 0.5));
};

const N = 20000;
let nonFinite = 0, prev = null, prevSpace = null;
const steps = new Map();
let prevZ = { moon: null, mars: null };
const zBack = { moon: 0, mars: 0 };
const eye = { moon: { lo: 1e9, hi: -1e9 }, mars: { lo: 1e9, hi: -1e9 } };

for (let i = 0; i <= N; i++) {
  const o = i / N;
  poseAt(o, p);
  if (![p.position.x, p.position.y, p.position.z, p.target.x, p.target.y, p.target.z, p.fov].every(Number.isFinite)) nonFinite++;
  ok(p.fov > 26 && p.fov < 74, `fov out of range at o=${o.toFixed(3)}: ${p.fov.toFixed(1)}`);
  if (prev && prevSpace === p.space.id) {
    const k = p.space.id;
    steps.set(k, Math.max(steps.get(k) || 0, p.position.distanceTo(prev)));
  }
  prev = p.position.clone();
  prevSpace = p.space.id;
  if (!p.space.local) continue;
  const w = p.world;
  groundPose(o, terrains[w.id].heights, p, gp, 0);
  const above = gp.local.y - heightAt(terrains[w.id].heights, gp.local.x, gp.local.z);
  eye[w.id].lo = Math.min(eye[w.id].lo, above);
  eye[w.id].hi = Math.max(eye[w.id].hi, above);
  // The ascent retraces the walk northward on purpose; only the walking itself must never step back.
  if (o <= (w.id === "moon" ? MOON_TALK_END : 1) && prevZ[w.id] !== null && gp.local.z < prevZ[w.id] - 1e-6) zBack[w.id]++;
  prevZ[w.id] = gp.local.z;
}

ok(nonFinite === 0, `${nonFinite} non-finite poses`);
for (const [k, v] of steps) ok(v < (k.endsWith("Ground") ? 0.05 : 0.6), `${k} rail has a ${v.toFixed(3)}-unit jump between adjacent samples`);
for (const w of [MOON, MARS]) {
  ok(eye[w.id].lo > 0.15, `${w.id} eye dips into the terrain: min ${eye[w.id].lo.toFixed(3)}m`);
  ok(eye[w.id].hi < 9, `${w.id} eye floats too high: max ${eye[w.id].hi.toFixed(3)}m`);
  ok(zBack[w.id] === 0, `${w.id} rail advances backwards ${zBack[w.id]} times`);
}

// ---- every descent is a descent, and never shows a horizon -----------------------------------------
// Each hand-off hides a position jump of orders of magnitude on the strength of a frame that is nothing
// but regolith. On a sphere that means staying inside the limb, and for a portrait frame the test is the
// diagonal corner, not the vertical edge. Anything that leaks puts black sky on one side of a cut.
for (const [spaceName, from, to] of [["lunar", SEAM_A, SEAM_B], ["marsOrbit", TRANSFER_END, MARS_SEAM]]) {
  const sp = SPACES.find((s) => s.id === spaceName);
  const R = sp.world.radius;
  let reversed = 0, prevAlong = null, worst = 99, at = 0, minAlt = 1e9;
  for (let i = 1; i <= 900; i++) {
    const o = from + (i / 900) * (to - from - 1e-4);
    poseAt(o, p);
    const l = localOf(p.position, sp.world);
    if (prevAlong !== null && l.z < prevAlong - 1e-4) reversed++;
    prevAlong = l.z;
    const r = p.position.distanceTo(sp.world.centre);
    minAlt = Math.min(minAlt, r - R);
    const offNadir = Math.acos(-p.target.clone().sub(p.position).normalize().dot(sp.world.site.n));
    const margin = (Math.asin(R / r) - (offNadir + cornerOf(p.fov))) * DEG;
    if (margin < worst) { worst = margin; at = o; }
  }
  ok(reversed === 0, `${spaceName} reverses its travel ${reversed} times: the camera is circling the planet again`);
  ok(worst > 0, `${spaceName} shows the limb and black sky at o=${at.toFixed(3)}: ${worst.toFixed(2)}deg past the edge`);
  ok(minAlt > 0.3, `${spaceName} clips the sphere: min altitude ${minAlt.toFixed(3)}u`);
  console.log(`${spaceName}: ${worst.toFixed(1)}deg inside the limb at the tightest frame (o=${at.toFixed(3)}), min altitude ${minAlt.toFixed(2)}u, rail ${sp.rail.total.toFixed(2)}u`);
}

// The departure frame is the same rule played backwards: the ascent has to end on regolith so the transfer
// can take it, and the transfer's first frame must arrive with the same heading.
{
  const sp = SPACES.find((s) => s.id === "transfer");
  poseAt(DEPART + 1e-4, p);
  const r = p.position.distanceTo(sp.world.centre);
  const off = Math.acos(-heading(DEPART + 1e-4).dot(sp.world.site.n));
  const margin = (Math.asin(sp.world.radius / r) - (off + cornerOf(p.fov))) * DEG;
  ok(margin > 0, `the ascent hands off with the limb in frame: ${margin.toFixed(2)}deg past`);
  console.log(`ascent hand-off: ${margin.toFixed(1)}deg inside the limb, frame all regolith`);
}

// ---- seams ------------------------------------------------------------------------------------------
// Position is cut at four of the five boundaries and orientation is the only thing handed across. The one
// that is not - TRANSFER_END - swaps which planet's vertical the rig calls up, which is only invisible
// because both sides are looking at nothing but Martian ground at that instant.
const SEAMS = [
  { name: "A solar->lunar", o: SEAM_A, cut: true, heading: 0.95 },
  { name: "B lunar->moon ground", o: SEAM_B, cut: true, heading: 0.999 },
  { name: "C moon ground->transfer", o: DEPART, cut: true, heading: 0.999 },
  { name: "D transfer->mars orbit", o: TRANSFER_END, cut: false, heading: 0.999 },
  { name: "E mars orbit->mars ground", o: MARS_SEAM, cut: true, heading: 0.999 },
];
for (const seam of SEAMS) {
  poseAt(seam.o - 1e-5, p);
  const a = p.position.clone(); const aFov = p.fov; const aId = p.space.id;
  poseAt(seam.o + 1e-5, p);
  const b = p.position.clone(); const bFov = p.fov; const bId = p.space.id;
  const dot = heading(seam.o - 1e-5).dot(heading(seam.o + 1e-5));
  ok(dot > seam.heading, `seam ${seam.name} heading jumps: dot ${dot.toFixed(5)}`);
  ok(Math.abs(aFov - bFov) < 0.5, `seam ${seam.name} fov jumps ${aFov.toFixed(2)} -> ${bFov.toFixed(2)}`);
  const gap = a.distanceTo(b);
  if (seam.cut) ok(gap > 0.5, `seam ${seam.name} claims a position cut but the rails are ${gap.toFixed(3)}u apart`);
  else ok(gap < 0.5, `seam ${seam.name} is meant to be continuous and jumps ${gap.toFixed(3)}u`);
  console.log(`seam ${seam.name}: ${aId} -> ${bId}, heading ${dot.toFixed(5)}, fov ${aFov.toFixed(1)}->${bFov.toFixed(1)}, ${seam.cut ? "position cut" : "continuous"} by ${gap.toFixed(3)}u, roll ${rollAcross(seam.o).toFixed(2)}deg`);
}

poseAt(SEAM_A, p);
ok(p.space.id === "solar", "at exactly SEAM_A the solar rail's frame-filling terminus must still be the live pose");
poseAt(SEAM_A + 1e-6, p);
ok(p.space.id === "lunar", "the lunar space must take over immediately after SEAM_A");
ok(SPACES.length === 6 && SPACES.filter((s) => s.local).length === 2, "expected 6 spaces with exactly two surface acts");

// ---- the two landings --------------------------------------------------------------------------------
for (const world of [MOON, MARS]) {
  const at = (o) => { poseAt(o, p); groundPose(o, terrains[world.id].heights, p, gp, 0); return gp; };
  ok(rumble(world.contact - 0.01, world.contact, world.impactEnd) === 0, `${world.id}: the rumble starts before contact`);
  ok(rumble(world.contact, world.contact, world.impactEnd) === 0 && rumble(world.impactEnd, world.contact, world.impactEnd) === 0, `${world.id}: the rumble does not vanish at both ends of its band`);
  let rock = 0, peakT = 1, peak = 0;
  for (let i = 0; i <= 400; i++) {
    const t = i / 400;
    const o = world.contact + t * (world.impactEnd - world.contact);
    const g = at(o);
    rock = Math.max(rock, Math.abs(g.pitch - g.pitchAuth) * DEG);
    const v = Math.abs(rumble(o, world.contact, world.impactEnd));
    if (v > peak) { peak = v; peakT = t; }
  }
  ok(rock > 4, `${world.id}: the touchdown rocks the camera ${rock.toFixed(1)}deg off its authored pitch - a shrug, not an impact`);
  ok(peakT < 0.34, `${world.id}: the rumble peaks ${Math.round(peakT * 100)}% through its band; it should hit at contact and decay`);
  const parked = walkDistance(SPACES.find((s) => s.world === world && s.local), world.impactEnd) - walkDistance(p.space, world.contact);
  ok(parked < 0.4, `${world.id}: ${parked.toFixed(2)}m walked during the rumble, so the camera is not parked at contact`);

  // The frame that gets shaken has to contain something. At the hand-off it must hold no horizon, at
  // contact it must hold one, and by the walking it must be looking across the site.
  const topEdge = (o) => (at(o).pitch + (p.fov / 2 / DEG)) * DEG;
  ok(topEdge(world.seam + 1e-4) < -10, `${world.id}: the hand-off frame already shows the horizon (${topEdge(world.seam + 1e-4).toFixed(1)}deg)`);
  const farHit = (at(world.seam + 1e-4).local.y - heightAt(terrains[world.id].heights, gp.local.x, gp.local.z)) / Math.tan(-topEdge(world.seam + 1e-4) / DEG);
  ok(farHit < NEAR_R * 0.9, `${world.id}: the hand-off frame reaches ${farHit.toFixed(0)}m out, past the textured field`);
  ok(topEdge(world.contact) > 0, `${world.id}: the contact frame holds no horizon to shake (${topEdge(world.contact).toFixed(1)}deg)`);

  // The stand-up, then the walk: human height only once walking, and never a bob before then.
  const sp = SPACES.find((s) => s.world === world && s.local);
  ok(walkWeight(world.contact, world.walkIn) === 0, `${world.id}: the gait gate is open during the landing`);
  ok(walkWeight(world.walkIn + 0.03, world.walkIn) === 1, `${world.id}: the gait never turns on`);
  let lo = 9, hi = -9, rate = 0;
  const walkEnd = world.id === "moon" ? MOON_TALK_END : 1;
  for (let i = 0; i <= 300; i++) {
    const o = world.walkIn + (i / 300) * (walkEnd - world.walkIn);
    const g = at(o);
    const above = g.local.y - heightAt(terrains[world.id].heights, g.local.x, g.local.z);
    lo = Math.min(lo, above); hi = Math.max(hi, above);
    rate = Math.max(rate, walkRate(sp, o));
  }
  ok(lo > 1.4 && hi < 2.1, `${world.id}: the walk is not at human height (${lo.toFixed(2)}..${hi.toFixed(2)}m)`);
  const legStart = (k) => legStartOf(sp, k);
  ok(Math.abs(world.contact - legStart(2)) < 1e-3, `${world.id}: contact is authored at leg 2 (${legStart(2).toFixed(4)}) but the timeline says ${world.contact.toFixed(4)}`);
  ok(Math.abs(world.walkIn - legStart(4)) < 1e-3, `${world.id}: the walk unlocks off the walking leg`);
  console.log(`${world.id}: rocks ${rock.toFixed(1)}deg at contact, sees ${farHit.toFixed(0)}m of field at hand-off, walks at ${lo.toFixed(2)}..${hi.toFixed(2)}m up to ${rate.toFixed(0)} m per unit offset`);
}
ok(MOON_LEGS === MOON_GROUND.legs.length && MARS_LEGS === MARS_GROUND.legs.length, "the timeline leg counts disagree with the rails");

// ---- both walks have to be walkable, and both have to arrive somewhere -------------------------------
for (const world of [MOON, MARS]) {
  const terrain = terrains[world.id];
  const corridor = CORRIDOR_BY_WORLD[world.id];
  let maxSlope = 0;
  const z = corridor.filter(([, zz]) => zz > -1);
  for (let i = 1; i < z.length; i++) {
    const [x0, z0] = z[i - 1], [x1, z1] = z[i];
    const d = Math.hypot(x1 - x0, z1 - z0);
    maxSlope = Math.max(maxSlope, Math.abs(Math.atan2(heightAt(terrain.heights, x1, z1) - heightAt(terrain.heights, x0, z0), d)));
  }
  ok(maxSlope * DEG < 2, `${world.id}: the walk climbs a ${maxSlope.toFixed(1)}deg hill: the horizon never arrives`);
  const craters = buildCraters(corridor, world.relief);
  const uncut = buildCraters(undefined, world.relief);
  const margin = Math.min(...craters.map((k) => nearestOnCorridor(k.x, k.z, corridor).dist - k.r * 1.25));
  ok(margin >= 0, `${world.id}: a crater rim reaches the walk corridor: ${margin.toFixed(2)}m inside`);
  ok(uncut.length - craters.length < 12, `${world.id}: ${uncut.length - craters.length} craters rejected; the corridor should meet the field, not clear it`);
  const recordTo = (list) => ({ setMatrixAt: (i, m) => list.push([m.elements[12], m.elements[14]]), instanceMatrix: { needsUpdate: false } });
  const clamped = []; scatterRocks(recordTo(clamped), terrain.heights, corridor, { count: ROCK_N, seed: world.rockSeed });
  const raw = []; scatterRocks(recordTo(raw), terrain.heights, undefined, { count: ROCK_N, seed: world.rockSeed });
  ok(clamped.length === ROCK_N && raw.length === ROCK_N, `${world.id}: rock scatter filled ${clamped.length} of ${ROCK_N} slots`);
  const near = (list) => Math.min(...list.map(([x, zz]) => nearestOnCorridor(x, zz, corridor).dist));
  ok(near(raw) < ROCK_CLEARANCE, `${world.id}: the rock clearance test is vacuous`);
  ok(near(clamped) >= ROCK_CLEARANCE - 1e-6, `${world.id}: a rock sits ${near(clamped).toFixed(2)}m from the walk path`);
  console.log(`${world.id}: corridor ${craters.length}/${uncut.length} craters kept (rim margin ${margin.toFixed(1)}m), rocks ${near(raw).toFixed(2)} -> ${near(clamped).toFixed(2)}m, max slope ${(maxSlope * DEG).toFixed(1)}deg`);
}

// ---- both endings, framed and asserted --------------------------------------------------------------
const camera = new PerspectiveCamera(57, 0.5, 0.02, 4200);
const eyeSlot = { v: new Vector3(), q: new Quaternion() };
const BOX = { half: 2.0, top: 4.0 }, SMALL = { half: 0.55, top: 2.4 }, PERSON = { half: 0.45, top: 1.95 };

const subject = (terrain, site, box) => {
  const y0 = heightAt(terrain.heights, site[0], site[2]);
  const pts = [];
  for (const sx of [-box.half, box.half]) for (const sz of [-box.half, box.half]) for (const sy of [y0, y0 + box.top]) pts.push(new Vector3(site[0] + sx, sy, site[2] + sz).sub(eyeSlot.v).applyQuaternion(eyeSlot.q.clone().invert()));
  const centre = new Vector3(site[0], y0 + box.top / 2, site[2]).sub(eyeSlot.v).applyQuaternion(eyeSlot.q.clone().invert());
  const halfT = Math.tan(camera.fov / 2 / DEG);
  const elOf = (v) => Math.atan2(v.y, Math.hypot(v.x, -v.z));
  const base = Math.min(...pts.map(elOf));
  const range = centre.length();
  let blocked = 0, peak = -Infinity;
  for (let d = 1; d < range - 0.6; d += 0.5) {
    const k = d / range;
    const terr = Math.atan2(heightAt(terrain.heights, eyeSlot.v.x + (site[0] - eyeSlot.v.x) * k, eyeSlot.v.z + (site[2] - eyeSlot.v.z) * k) - eyeSlot.v.y, d);
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

for (const [world, at] of [[MOON, MOON_FRAMED_AT], [MARS, MARS_FRAMED_AT]]) {
  const terrain = terrains[world.id];
  poseAt(at, p);
  groundPose(at, terrain.heights, p, gp, 0);
  camera.fov = p.fov;
  camera.position.copy(gp.world);
  camera.quaternion.copy(new Quaternion().setFromEuler(new Euler(gp.pitch, gp.yaw, gp.roll, "YXZ")).premultiply(world.site.quaternion));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  // A camera yawed and pitched out of the world axes while standing on a surface whose normal is 89deg
  // away from them renders the horizon sideways, and no screenshot was ever taken to notice.
  const camUp = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const camRight = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const tilt = Math.atan2(world.site.n.dot(camRight), world.site.n.dot(camUp)) * DEG;
  ok(Math.abs(tilt) < 3, `${world.id}: the horizon is ${tilt.toFixed(1)}deg off level at the ending`);

  eyeSlot.v.copy(gp.local);
  eyeSlot.q.setFromEuler(new Euler(gp.pitch, gp.yaw, gp.roll, "YXZ"));
  const craft = subject(terrain, world.lm, world.air > 0 ? { half: 2.2, top: 4.6 } : BOX);
  const flag = subject(terrain, world.flag, SMALL);
  const cp = subject(terrain, world.companion, PERSON);
  for (const [name, x] of [["craft", craft], ["flag", flag], ["crew", cp]]) {
    ok(x.ax <= 0.98 && x.ay <= 0.98, `${world.id}: ${name} leaves the portrait frame (ndc ${x.ax.toFixed(2)},${x.ay.toFixed(2)})`);
    ok(x.blocked === 0, `${world.id}: ${name} is behind a ridge: ${x.blocked} samples, peaking at ${x.peak.toFixed(1)}deg`);
  }
  const sep = Math.abs(craft.az - flag.az);
  ok(sep > 4 && sep < 22, `${world.id}: craft/flag bearing separation ${sep.toFixed(1)}deg`);
  const cpSep = Math.min(Math.abs(cp.az - craft.az), Math.abs(cp.az - flag.az));
  ok(cpSep > 2.5, `${world.id}: the crew member is within ${cpSep.toFixed(1)}deg of both subjects; he would be hidden`);
  ok(cp.arc > 6 && cp.arc < 30, `${world.id}: the crew member spans ${cp.arc.toFixed(1)}deg at ${cp.range.toFixed(1)}m`);
  ok(cp.range > 3 && cp.range < 16, `${world.id}: the crew member is ${cp.range.toFixed(1)}m away; the conversation does not work at that distance`);
  if (world.rover) {
    const rv = subject(terrain, world.rover, { half: 1.1, top: 1.4 });
    ok(rv.ax <= 0.98 && rv.ay <= 0.98, `${world.id}: the rover leaves the frame (ndc ${rv.ax.toFixed(2)},${rv.ay.toFixed(2)})`);
    ok(rv.blocked === 0, `${world.id}: the rover is behind a ridge`);
    console.log(`${world.id} ending: crew ${cp.range.toFixed(1)}m/${cp.arc.toFixed(1)}deg, craft ${craft.range.toFixed(1)}m at ${craft.az.toFixed(1)}deg, flag ${flag.range.toFixed(1)}m at ${flag.az.toFixed(1)}deg (sep ${sep.toFixed(1)}deg), rover ${rv.range.toFixed(1)}m, horizon ${tilt.toFixed(1)}deg off level`);
  } else {
    ok(flag.arc > craft.arc, `${world.id}: the flag spans ${flag.arc.toFixed(1)}deg and the LM ${craft.arc.toFixed(1)}deg - the foreground subject must read larger`);
    console.log(`${world.id} ending: crew ${cp.range.toFixed(1)}m/${cp.arc.toFixed(1)}deg, LM ${craft.range.toFixed(1)}m at ${craft.az.toFixed(1)}deg, flag ${flag.range.toFixed(1)}m at ${flag.az.toFixed(1)}deg (sep ${sep.toFixed(1)}deg), horizon ${tilt.toFixed(1)}deg off level`);
  }
}

// The rig is a pure function of the offset with nothing added, so either surface act can be scrubbed back
// and compared bit for bit - which was impossible while damped input integrators fed it.
const fwd = [];
for (let i = 0; i <= 60; i++) {
  const o = i / 60;
  poseAt(o, p);
  const row = [p.position.x, p.position.y, p.position.z, p.fov];
  if (p.space.local) {
    groundPose(o, terrains[p.world.id].heights, p, gp, 0);
    row.push(gp.world.x, gp.world.y, gp.world.z, gp.yaw, gp.pitch, gp.walked);
  }
  fwd.push(row);
}
for (let i = 60; i >= 0; i--) {
  const o = i / 60;
  poseAt(o, p);
  const row = [p.position.x, p.position.y, p.position.z, p.fov];
  if (p.space.local) {
    groundPose(o, terrains[p.world.id].heights, p, gp, 0);
    row.push(gp.world.x, gp.world.y, gp.world.z, gp.yaw, gp.pitch, gp.walked);
  }
  if (row.some((v, k) => Math.abs(v - fwd[i][k]) > 1e-12)) ok(false, `scrub-back differs at o=${o.toFixed(3)}`);
}

const cameraPath = ["src/scene/CameraRig.jsx", "src/journey/ground.js", "src/journey/pose.js", "src/journey/rail.js", "src/journey/worlds.js"]
  .map((rf) => fs.readFileSync(new URL("../" + rf, import.meta.url), "utf8"))
  .join("\n");
ok(!/clock\.|elapsedTime|performance\.now|Date\.now/.test(cameraPath), "the camera path reads wall-clock time");
ok(!/useScroll\(\)\.offset\s*[+\-*/]=|scroll\.offset\s*=/.test(cameraPath), "something writes scroll.offset");
console.log("purity + clock-free camera path verified");
console.log(`steps per space   `, [...steps].map(([k, v]) => `${k}=${v.toFixed(3)}`).join(" "));

console.log(fails.length ? "\nFAIL\n" + fails.map((f) => " - " + f).join("\n") : "\nall journey checks passed");
process.exit(fails.length ? 1 : 0);
