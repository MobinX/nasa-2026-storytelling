import fs from "node:fs";
// Geometry/continuity checks for the whole journey, run against the same modules the camera rig uses.
// Everything is per world: the piece is two landings, and a second site is only as safe as the first if the
// assertions are repeated for it rather than assumed to transfer.
// node tools/check-journey.mjs
import { Euler, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { poseAt, scratchPose, SPACES, MOON_GROUND, MARS_GROUND, EVA_SPACE, legStartOf, walkDistance, walkRate } from "../src/journey/pose.js";
import { apply } from "../src/data/objects.js";
import { SURFACE_STOPS } from "../src/journey/timeline.js";
import { MOON, MARS } from "../src/journey/worlds.js";
import { groundPose, scratchGround } from "../src/journey/ground.js";
import { buildTerrain, buildCraters, levelTerrain, flattenAlongCorridor, heightAt, NEAR_R } from "../src/lib/terrain.js";
import { CORRIDOR_BY_WORLD } from "../src/journey/corridor.js";
import { ROCK_N, ROCK_CLEARANCE, scatterRocks } from "../src/lib/rocks.js";
import { nearestOnCorridor } from "../src/lib/path-clearance.js";
import { SEAM_A, SEAM_B, DEPART, TRANSFER_END, MARS_SEAM, MARS_DEPART, MOON_LEGS, MARS_LEGS, rumble, walkWeight } from "../src/journey/timeline.js";


const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

// The same boot step the app runs: objects.json fills the authored route with names, models and
// conversations, and a file that disagrees with the route fails here rather than at runtime.
const bootProblems = apply(JSON.parse(fs.readFileSync(new URL("../src/data/objects.json", import.meta.url), "utf8")).objects);
for (const m of bootProblems) fails.push("objects.json: " + m);
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
// The rig's own attitude at an offset, through whichever branch the space uses: a surface act composes an
// Euler off the site frame, a flight looks at a target with that world's vertical as up.
const quatAt = (o) => {
  poseAt(o, p);
  if (!p.space.local) return new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(p.position, p.target, upOf(p.space)));
  groundPose(o, terrains[p.world.id].heights, p, gp, 0);
  return new Quaternion().setFromEuler(new Euler(gp.pitch, gp.yaw, gp.roll, "YXZ")).premultiply(p.world.site.quaternion);
};
const rollAcross = (o) => 2 * Math.acos(Math.min(1, Math.abs(quatAt(o - 1e-5).dot(quatAt(o + 1e-5))))) * DEG;
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
  // The ascent retraces the walk back toward the pad on purpose; only the walking must never step back.
  const lastLock = (w.id === "moon" ? SURFACE_STOPS.moon : SURFACE_STOPS.mars).at(-1).lock;
  if (o <= lastLock && prevZ[w.id] !== null && gp.local.z < prevZ[w.id] - 1e-6) zBack[w.id]++;
  prevZ[w.id] = gp.local.z;
}

ok(nonFinite === 0, `${nonFinite} non-finite poses`);
// No teleport inside a space. A rail's speed varies by design - the descents decelerate into their
// hand-offs, the transfer crosses 400 units in four screens of scroll - so an absolute per-sample budget is
// the wrong ruler for it. What is always wrong is a discontinuity where one leg hands over to the next, and
// that is checked at the joint, in that rail's own units.
for (const sp of SPACES) {
  const n = sp.legs.length;
  for (let k = 1; k < n; k++) {
    const b = sp.from + (k / n) * (sp.to - sp.from);
    poseAt(b - 1e-7, p);
    const a = p.position.clone();
    poseAt(b + 1e-7, p);
    const gap = a.distanceTo(p.position);
    ok(gap < sp.rail.total * 1e-3, `${sp.id} teleports ${gap.toFixed(4)}u where leg ${k - 1} hands over to leg ${k}`);
  }
}
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
  { name: "F mars ground->deep space", o: MARS_DEPART, cut: true, heading: 0.999 },
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
ok(SPACES.length === 7 && SPACES.filter((s) => s.local).length === 2, `expected 7 spaces with exactly two surface acts, got ${SPACES.length}/${SPACES.filter((s) => s.local).length}`);

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
  const walkEnd = (world.id === "moon" ? SURFACE_STOPS.moon : SURFACE_STOPS.mars).at(-1).lock;
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

// ---- every stop: the hold is where the rail arrived, and the thing is in frame ----------------------
// The scroll trap is only honest if the offset it holds is the offset the camera arrives at the object,
// and the framing is only honest if it is measured where the visitor is actually standing. Both are checked
// for all ten stops, because a route is exactly as good as its worst stop.
const camera = new PerspectiveCamera(57, 0.5, 0.02, 4200);
const eyeSlot = { v: new Vector3(), q: new Quaternion() };
const localToSite = (w) => new Quaternion(w.site.quaternion.x, w.site.quaternion.y, w.site.quaternion.z, w.site.quaternion.w).invert();
const SPACE_BY_PLANET = { moon: MOON_GROUND, mars: MARS_GROUND, solar: EVA_SPACE };

// The eight corners of a prop in camera space. |ndc| <= 1 is the frame edge and the assertion uses 0.98,
// so a phone slightly narrower than 400 px still keeps the subject in. A prop that grows later is caught
// by the box rather than slipping out of frame, and `heights` is null where there is no ground to hide
// something behind.
//
// Occlusion is measured per corner, along that corner's own sight line: comparing the ground against the
// lowest corner of the box on the centre line called a hidden object whenever a prop stood in a dip, even
// though every visible part of it was clear of the ridge.
const subject = (heights, site, box) => {
  const groundAt = (x, z) => (heights ? heightAt(heights, x, z) : 0);
  const y0 = groundAt(site[0], site[2]);
  const elOf = (v) => Math.atan2(v.y, Math.hypot(v.x, -v.z));
  const halfT = Math.tan(camera.fov / 2 / DEG);
  const pts = [];
  for (const sx of [-box.half, box.half]) for (const sz of [-box.half, box.half]) for (const sy of [y0, y0 + box.top]) {
    const world = new Vector3(site[0] + sx, sy, site[2] + sz);
    const v = world.clone().sub(eyeSlot.v).applyQuaternion(eyeSlot.q.clone().invert());
    const d = world.clone().sub(eyeSlot.v);
    const range = Math.hypot(d.x, d.z);
    // Both terms in the site's own level frame: the camera is pitched, and comparing a corner's elevation
    // in the camera's frame against a ridge measured off the local vertical is off by exactly that pitch.
    const corner = Math.atan2(world.y - eyeSlot.v.y, range);
    let blocked = false, peak = -Infinity;
    for (let k = 1; k < range - 0.6; k += 0.5) {
      const f = k / range;
      const terr = Math.atan2(groundAt(eyeSlot.v.x + d.x * f, eyeSlot.v.z + d.z * f) - eyeSlot.v.y, k);
      if (terr * DEG > peak) peak = terr * DEG;
      if (terr > corner + 1e-6) { blocked = true; break; }
    }
    pts.push({ v, blocked, peak, range });
  }
  const centre = new Vector3(site[0], y0 + box.top / 2, site[2]).sub(eyeSlot.v).applyQuaternion(eyeSlot.q.clone().invert());
  return {
    ax: Math.max(...pts.map((q) => Math.abs(q.v.x / (-q.v.z * camera.aspect * halfT)))),
    ay: Math.max(...pts.map((q) => Math.abs(q.v.y / (-q.v.z * halfT)))),
    az: Math.atan2(centre.x, -centre.z) * DEG,
    arc: (Math.max(...pts.map((q) => elOf(q.v))) - Math.min(...pts.map((q) => elOf(q.v)))) * DEG,
    range: centre.length(),
    blocked: pts.filter((q) => q.blocked).length,
    peak: Math.max(...pts.map((q) => q.peak)),
  };
};

for (const planet of ["moon", "mars", "solar"]) {
  const space = SPACE_BY_PLANET[planet];
  const world = space.world;
  const heights = planet === "solar" ? null : terrains[world.id].heights;
  for (const stop of SURFACE_STOPS[planet]) {
    const o = stop.lock + 1e-4;
    poseAt(o, p);
    const g = heights ? groundPose(o, heights, p, gp, 0) : null;
    const local = g ? g.local : localOf(p.position, world);
    const drift = Math.hypot(local.x - stop.cam[0], local.z - stop.cam[2]);
    ok(drift < 0.4, `${planet} stop ${stop.index}: the scroll holds ${drift.toFixed(2)}m away from where the route says the object stands`);
    ok(stop.model && stop.convo, `${planet} stop ${stop.index} "${stop.id}": no model or conversation bound - objects.json did not load`);
    if (stop.name === stop.id) ok(false, `${planet} stop ${stop.index}: objects.json never filled in the name`);

    const q = quatAt(o);
    camera.fov = p.fov;
    camera.position.copy(p.position);
    camera.quaternion.copy(q);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const camUp = new Vector3(0, 1, 0).applyQuaternion(q);
    const camRight = new Vector3(1, 0, 0).applyQuaternion(q);
    const tilt = Math.atan2(world.site.n.dot(camRight), world.site.n.dot(camUp)) * DEG;
    ok(Math.abs(tilt) < 3, `${planet} stop ${stop.index}: the vertical is ${tilt.toFixed(1)}deg off level`);

    if (g) eyeSlot.q.setFromEuler(new Euler(gp.pitch, gp.yaw, gp.roll, "YXZ"));
    else {
      const dv = p.target.clone().sub(p.position).applyQuaternion(localToSite(world));
      eyeSlot.q.setFromEuler(new Euler(Math.asin(dv.y / dv.length()), Math.atan2(-dv.x, -dv.z), 0, "YXZ"));
    }
    eyeSlot.v.copy(local);
    const thing = subject(heights, stop.obj, { half: 1.2, top: stop.top });
    const crew = subject(heights, stop.crew, { half: 0.45, top: 1.95 });
    for (const [name, x] of [["object", thing], ["crew", crew]]) {
      ok(x.ax <= 0.98 && x.ay <= 0.98, `${planet} stop ${stop.index}: ${name} leaves the portrait frame (ndc ${x.ax.toFixed(2)},${x.ay.toFixed(2)})`);
      if (heights) ok(x.blocked === 0, `${planet} stop ${stop.index}: ${name} is behind the ground: ${x.blocked} of 8 corners, worst ridge ${x.peak.toFixed(1)}deg`);
    }
    const sep = Math.abs(thing.az - crew.az);
    ok(sep > 2.5 && sep < 20, `${planet} stop ${stop.index}: object and crew are ${sep.toFixed(1)}deg apart in azimuth`);
    ok(crew.range > 3.5 && crew.range < 18, `${planet} stop ${stop.index}: the crew member is ${crew.range.toFixed(1)}m off; the conversation does not work at that distance`);
    ok(thing.range > crew.range * 0.5, `${planet} stop ${stop.index}: the object (${thing.range.toFixed(1)}m) is nearer than the crew (${crew.range.toFixed(1)}m) and would hide him`);
    console.log(`${planet} stop ${stop.index} ${stop.id}: held ${drift.toFixed(2)}m off route | object ${thing.range.toFixed(1)}m at ${thing.az.toFixed(1)}deg, ${thing.arc.toFixed(1)}deg tall | crew ${crew.range.toFixed(1)}m at ${crew.az.toFixed(1)}deg | fov ${p.fov.toFixed(0)} tilt ${tilt.toFixed(1)}`);
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
