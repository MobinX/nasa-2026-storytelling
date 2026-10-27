// The conversation orbit, headless: the arc that walks the crew member and the visitor round the object
// while a stop holds the scroll, the conversation clock that drives it, and the site frame the crew member
// reads the visitor out of. None of it is a picture - the arc is a state machine over a hold, the clock is a
// function from a phase machine to 0..1 - so all of it can be walked here without mounting anything, the way
// check-dialogue.mjs walks every conversation.
//
// The invariants that matter are the ones the walking rail and the visitor's face depend on: the arc has to be
// moving on the first second of the greeting rather than waiting to be asked a question, it has to reach the
// full 270 degrees it is authored to sweep, it has to be sitting on the arrival pose the moment the scroll
// lets go (a hold that released mid-sweep cuts the camera sideways off the machine), and the crew member has
// to be looking at the visitor all the way round.
import { Quaternion, Vector3 } from "three";
import { apply, OBJECTS } from "../src/data/objects.js";
import { createScript, advance, tapped, finish } from "../src/lib/dialogue.js";
import {
  ORBIT_ARC, orbitOut, stepOrbit, orbitHolds, resetOrbit,
  spinAboutY, spinAboutAxis, facingToward, siteLocal, crewStation,
} from "../src/journey/orbit.js";
import { SURFACE_STOPS } from "../src/journey/timeline.js";
import { MOON, MARS, EVA } from "../src/journey/worlds.js";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

for (const m of apply(OBJECTS)) fails.push("objects.json: " + m);

const DEG = 180 / Math.PI;
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const bearing = (x, z, ox, oz) => Math.atan2(x - ox, z - oz);
const sign = (stop) => (stop.orbit < 0 ? -1 : 1);

// ---- the shape ---------------------------------------------------------------------------------------
ok(orbitOut(0) === 0, "the orbit is not at the arrival pose at the start of a stop");
ok(orbitOut(1) === 1, "the orbit never reaches the far side");
let before = orbitOut(0);
for (let i = 1; i <= 100; i++) {
  const v = orbitOut(i / 100);
  ok(v >= before - 1e-12, `the outward walk is not monotone at w=${(i / 100).toFixed(2)}`);
  before = v;
}
console.log(`orbit: ${(ORBIT_ARC * DEG).toFixed(0)}deg outbound over the briefing, held on the far side for the questions, home on the frame the visitor moves on`);

// ---- the hold: what a held stop actually does --------------------------------------------------------
// One hold, walked the way the rig walks it: a frame of the rig is a delta and a conversation, and the arc
// is the only answer to both. `dwell` is how long the visitor spends on the choice panel before pressing
// move on; `tapEvery` how many frames pass between the taps that skip the intro. Infinity means he waits for
// each caption to finish typing - which is what a visitor who has actually read it does.
function walkAHold(stop, { seconds = 1 / 30, dwell = 0, tapEvery = Infinity, frames = 40000 } = {}) {
  resetOrbit();
  const s = createScript(stop.convo);
  const rows = [];
  let dwellLeft = 0, sinceTap = 0;
  for (let i = 0; i < frames; i++) {
    if (s.phase === "line") {
      advance(s, seconds);
      sinceTap++;
      if (sinceTap >= tapEvery || (s.beats[s.beat] ?? "").length <= s.chars) {
        if (tapped(s)) sinceTap = 0;
      }
    } else if (s.phase === "choice") {
      dwellLeft += seconds;
      if (dwellLeft >= dwell) finish(s);
    }
    const orb = stepOrbit(stop, seconds, s.phase === "done");
    rows.push({ dt: seconds, theta: Math.abs(orb.theta), at: i * seconds, finished: s.phase === "done", id: orb.stop?.id });
    if (!orbitHolds(stop.id)) break;
  }
  // The frame the rig hands the stop back to the walking rail, with nothing holding it.
  const off = stepOrbit(null, seconds, false);
  return { rows, off };
}

const eagle = SURFACE_STOPS.moon[0];
const viking = SURFACE_STOPS.mars[3];

// A reader: the briefing typed out, then long enough on the choice panel to let the pair settle on the far
// side before moving on. The outbound is the whole 270; the questions are asked from there; the return is
// the walk off.
{
  const { rows, off } = walkAHold(eagle, { seconds: 1 / 30, dwell: 24 });
  const peak = Math.max(...rows.map((r) => r.theta));
  const early = rows.find((r) => r.at >= 4);
  const mid = rows.find((r) => r.at >= 8);
  ok(rows[1].theta > 0, "the arc was still at the arrival pose two frames into the briefing");
  ok(early && early.theta > 0.2, "the arc had barely moved four seconds into the briefing");
  ok(mid && mid.theta > 1, "the arc was still within a few degrees of the arrival pose eight seconds in");
  ok(Math.abs(peak - ORBIT_ARC) < 1e-6, `the sweep peaked at ${(peak * DEG).toFixed(1)}deg instead of the ${(ORBIT_ARC * DEG).toFixed(0)}deg far side`);
  ok(rows.at(-1).theta < 1e-9, `the scroll was released with the arc at ${(rows.at(-1).theta * DEG).toFixed(2)}deg off the arrival pose`);
  ok(off.theta === 0 && !off.stop, "the stop the rail got back was not the arrival pose");
  ok(rows.at(-1).id === eagle.id, "the arc was swinging about somebody else's machine when the scroll let go");
  // Out once and home once: no stutter and no second lap.
  let dir = 0, flips = 0;
  for (let i = 1; i < rows.length; i++) {
    const d = rows[i].theta - rows[i - 1].theta;
    if (Math.abs(d) < 1e-9) continue;
    const s = Math.sign(d);
    if (!dir) dir = s;
    else if (s !== dir) { flips++; dir = s; }
  }
  ok(flips <= 1, `the sweep turned back on itself ${flips + 1} times: the pair are pacing, not walking round the machine`);
  // The outward walk is smooth. The exit turn is deliberately brisker, so it is measured separately and
  // only its landing at the arrival pose matters.
  let fast = 0;
  for (let i = 1; i < rows.length; i++) if (!rows[i].finished) fast = Math.max(fast, Math.abs(rows[i].theta - rows[i - 1].theta) / rows[i].dt);
  ok(fast * DEG < 26, `the outward arc moved ${(fast * DEG).toFixed(1)}deg in a second of wall clock`);
  const far = rows.filter((r) => Math.abs(r.theta - ORBIT_ARC) < 1e-6).length / 30;
  console.log(`reader at ${eagle.id}: ${(peak * DEG).toFixed(0)}deg round the machine, ${far.toFixed(1)}s on the far side, home at release (${(rows.length / 30).toFixed(0)}s)`);
}

// A skimmer: taps the briefing away and moves on at once. The arc cannot wait for a conversation that has
// already ended - but whatever part of it there is, it has to finish where it started. This is the release
// path the "move on" button uses.
{
  const { rows, off } = walkAHold(viking, { seconds: 1 / 60, tapEvery: 15, dwell: 0 });
  const peak = Math.max(...rows.map((r) => r.theta));
  ok(rows[1].theta > 0, "the skimmer's arc was still parked two frames in");
  ok(peak > 0.01, `the skimmer never saw the arc open at all (${(peak * DEG).toFixed(1)}deg)`);
  ok(rows.at(-1).theta < 1e-9, `the skimmer released at ${(rows.at(-1).theta * DEG).toFixed(2)}deg off the arrival pose`);
  ok(off.theta === 0 && !off.stop, "the skimmer came off the arc somewhere other than the arrival pose");
  ok(rows.length / 60 < 40, `a skimmer's stop took ${(rows.length / 60).toFixed(0)}s to let go of the scroll`);
  console.log(`skimmer at ${viking.id}: ${(peak * DEG).toFixed(0)}deg in ${(rows.length / 60).toFixed(1)}s, home at release`);
}

// Scrolled away from mid-arc: the visitor went back up the page while the pair were round the far side of
// the machine. The scroll is not held any more, but the pose still has to rejoin the rail instead of jumping.
{
  resetOrbit();
  for (let i = 0; i < 400; i++) stepOrbit(eagle, 1 / 30, false); // a visitor who never makes the choice
  const away = Math.abs(stepOrbit(eagle, 1 / 30, false).theta);
  ok(away > 0.5, `leaving a stop from ${(away * DEG).toFixed(0)}deg is not a test of coming off it`);
  let t = 0, orb;
  do {
    orb = stepOrbit(null, 1 / 30, false);
    t += 1 / 30;
  } while (orb.stop && t < 10);
  ok(t <= 5.5, `coming off the arc took ${t.toFixed(1)}s, which is the visitor waiting on a camera they did not ask for`);
  ok(!orb.stop && Math.abs(orb.theta) < 1e-9, `the arc did not get home before it let the stop go (${(orb.theta * DEG).toFixed(2)}deg)`);
  console.log(`off the arc at ${(away * DEG).toFixed(0)}deg: back on the trail in ${t.toFixed(2)}s, no scroll held`);
}

// ---- a rigid rotation about the object's own vertical -------------------------------------------------
// spinAboutY is the site-frame half of the pair; the world half has to agree with it, or the camera and the
// crew member would orbit in opposite senses and cross each other.
const obj = { x: 3, z: -2 };
const rad = (a) => Math.hypot(a.x - obj.x, a.z - obj.z);
const v0 = new Vector3(4.1, 0, 5.7);
const radius = rad(v0);
for (const theta of [0, 0.3, ORBIT_ARC, -ORBIT_ARC, 2.9]) {
  const v = spinAboutY(v0.clone(), obj.x, obj.z, theta);
  ok(Math.abs(rad(v) - radius) < 1e-9, `spinAboutY changed the radius at theta=${theta.toFixed(2)}`);
  // The bearing about the object (atan2(x, z), the same measure the stopper authors with) advances by
  // exactly theta, so a positive angle turns the pair one way and a negative angle the other.
  ok(Math.abs(wrap(bearing(v.x, v.z, obj.x, obj.z) - theta) - bearing(v0.x, v0.z, obj.x, obj.z)) < 1e-9, `spinAboutY turned the bearing the wrong way at theta=${theta.toFixed(2)}`);
}
// The world half, about the vertical through the pivot: same sense, same angle, same radius to the pivot.
const axis = new Vector3(0, 1, 0);
const pivot = new Vector3(obj.x, 0, obj.z);
const w0 = new Vector3(v0.x, 0.7, v0.z);
const wRadius = w0.distanceTo(pivot);
for (const theta of [0.3, ORBIT_ARC, -ORBIT_ARC, -1.1]) {
  const w = spinAboutAxis(w0.clone(), pivot, axis, theta);
  ok(Math.abs(w.distanceTo(pivot) - wRadius) < 1e-9, `spinAboutAxis changed the radius at theta=${theta.toFixed(2)}`);
  const s = spinAboutY(v0.clone(), obj.x, obj.z, theta);
  ok(Math.abs(w.x - s.x) < 1e-9 && Math.abs(w.z - s.z) < 1e-9, `the two orbit halves disagree at theta=${theta.toFixed(2)}: the pair would cross`);
}
// And the facing helper points a figure at a target in the site frame, the way the crew member is parked.
ok(Math.abs(facingToward(0, 0, 0, 10)) < 1e-12, "facingToward does not point along +z at a target on +z");

// ---- the site frame every crew member reads the visitor through -------------------------------------
// Three sites, one map: the inverse each figure uses has to belong to the site it was asked about. It used to
// be one scratch quaternion shared by all ten figures, whichever of them mounted last - which put four of
// them facing the wrong way and left the other six looking right, and is the exact shape of "some objects
// work and some do not".
const _in = new Vector3(), _out = new Vector3();
for (const world of [MOON, MARS, EVA]) {
  for (const p of [new Vector3(1.7, 0.4, -22), new Vector3(-8, 2.2, 60), new Vector3(0, 0, 0)]) {
    _in.copy(p).applyQuaternion(world.site.quaternion).add(world.site.pos); // the same point in world units
    siteLocal(world.site, _in, _out);
    ok(_out.distanceTo(p) < 1e-9, `${world.id}: siteLocal did not hand back the site's own metres, so the figure there is reading the camera through somebody else's vertical`);
  }
}
// Asked in the order the components mount, and again afterwards: the answer cannot depend on which figure
// last asked for it.
const probe = new Vector3(0.6, 1.7, 12).applyQuaternion(MOON.site.quaternion).add(MOON.site.pos);
const first = siteLocal(MOON.site, probe, new Vector3()).clone();
siteLocal(MARS.site, probe, new Vector3());
siteLocal(EVA.site, probe, new Vector3());
ok(siteLocal(MOON.site, probe, new Vector3()).distanceTo(first) < 1e-12, "a crew member on the Moon read the visitor through the frame of the last site mounted");

// ---- the man has to be looking at you ---------------------------------------------------------------
// Every stop, the whole sweep, and the two numbers that decide whether a conversation reads as somebody
// talking to you: the direction his chest points in world space, and the direction the visitor actually is.
// The eye goes out to world units and comes back through siteLocal on the way, because that round trip is
// exactly where the frames used to be crossed.
for (const [planet, world] of [["moon", MOON], ["mars", MARS], ["solar", EVA]]) {
  for (const stop of SURFACE_STOPS[planet]) {
    const eyeLocal = new Vector3(), eyeWorld = new Vector3(), read = new Vector3();
    const crewLocal = new Vector3(), crewWorld = new Vector3();
    let worst = 0, worstAt = 0;
    for (let i = 0; i <= 90; i++) {
      const theta = ORBIT_ARC * orbitOut(i / 90) * sign(stop);
      eyeLocal.set(stop.cam[0], 0, stop.cam[2]);
      spinAboutY(eyeLocal, stop.obj[0], stop.obj[2], theta);
      eyeWorld.copy(eyeLocal).applyQuaternion(world.site.quaternion).add(world.site.pos);
      siteLocal(world.site, eyeWorld, read);
      ok(read.distanceTo(eyeLocal) < 1e-6, `${planet} stop ${stop.index}: siteLocal did not hand back the eye the rig put in`);
      const face = crewStation(stop, theta, read, crewLocal);
      crewWorld.copy(crewLocal).applyQuaternion(world.site.quaternion).add(world.site.pos);
      // The renderer's own composition: a yaw about the site's local +y, inside a group turned by the site.
      const shown = new Vector3(Math.sin(face), 0, Math.cos(face)).applyQuaternion(world.site.quaternion);
      const real = eyeWorld.clone().sub(crewWorld);
      real.y = 0;
      const err = Math.abs(wrap(Math.atan2(shown.x, shown.z) - Math.atan2(real.x, real.z))) * DEG;
      if (err > worst) { worst = err; worstAt = theta * DEG; }
    }
    ok(worst < 0.01, `${planet} stop ${stop.index}: the crew member is up to ${worst.toFixed(1)}deg off the visitor at ${worstAt.toFixed(0)}deg round the machine`);
  }
}
console.log("crew: every figure faces the visitor all the way round his own machine, in his own site frame");

// ---- every stop can make the turn ----------------------------------------------------------------
// The arc is no longer a function of a conversation script, so this walks it directly at every stop: out to
// the far side, held there while finished stays false, and home before the hold is allowed to drop. The
// reader above exercises the same path with the HUD's own tap timing; this one makes sure no authored stop
// has a direction or geometry that can strand the scroller.
let walked = 0;
for (const planet of ["moon", "mars", "solar"]) {
  for (const stop of SURFACE_STOPS[planet]) {
    resetOrbit();
    let peak = 0;
    for (let i = 0; i < 30 * 30; i++) peak = Math.max(peak, Math.abs(stepOrbit(stop, 1 / 30, false).theta));
    ok(Math.abs(peak - ORBIT_ARC) < 1e-6, `${planet} ${stop.id}: the arc only reached ${(peak * DEG).toFixed(1)}deg`);
    const held = Math.abs(stepOrbit(stop, 1 / 30, false).theta);
    ok(Math.abs(held - ORBIT_ARC) < 1e-6, `${planet} ${stop.id}: the arc did not hold on the far side (${(held * DEG).toFixed(1)}deg)`);
    let t = 0, orb;
    do {
      orb = stepOrbit(stop, 1 / 30, true);
      t += 1 / 30;
    } while (orbitHolds(stop.id) && t < 10);
    ok(!orbitHolds(stop.id) && Math.abs(orb.theta) < 1e-9, `${planet} ${stop.id}: moving on did not bring the arc home`);
    ok(t < 4, `${planet} ${stop.id}: the way home took ${t.toFixed(1)}s`);
    resetOrbit();
    walked++;
  }
}
ok(walked === 10, `walked ${walked} stops, expected ten`);

console.log(fails.length ? "\nFAIL\n" + fails.map((f) => " - " + f).join("\n") : "\nthe arc walks 270deg out while the briefing runs, holds for the questions and hands the rail back the pose it took");
process.exit(fails.length ? 1 : 0);
