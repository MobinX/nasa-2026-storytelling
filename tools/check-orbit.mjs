// The conversation orbit, headless: the curve that walks the crew member and the visitor around the object
// while a stop holds the scroll, and the progress number the HUD feeds it. Neither is a picture - one is a
// function from a conversation to an angle, the other is a function from a phase machine to 0..1 - so both
// can be walked here without mounting anything, the way check-dialogue.mjs walks every conversation.
//
// The invariants that matter are the two ends and the middle: the arc has to be the arrival pose at
// progress 0 (so the hold starts where the rail arrived), back at the arrival pose at progress 1 (so the
// release hands the walking rail back the exact pose it took, and the slide-on is seamless), and widest in
// between. And it has to be a rigid rotation about the object's own vertical, or the machine would drift
// off centre and the crew member would not stay across it from the visitor.
import { Vector3 } from "three";
import { apply, OBJECTS, conversationFor } from "../src/data/objects.js";
import { createScript, questionsOf, pick, advance, tapped, conversationProgress, questionTotal } from "../src/lib/dialogue.js";
import { ORBIT_ARC, orbitAngle, orbitSwing, spinAboutY, spinAboutAxis, facingToward } from "../src/journey/orbit.js";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

for (const m of apply(OBJECTS)) fails.push("objects.json: " + m);

// ---- the curve ---------------------------------------------------------------------------------------
const DEG = 180 / Math.PI;
ok(Math.abs(orbitSwing(0)) < 1e-12 && Math.abs(orbitAngle(0)) < 1e-12, "the orbit is not at the arrival pose at progress 0");
ok(Math.abs(orbitSwing(1)) < 1e-12 && Math.abs(orbitAngle(1)) < 1e-12, "the orbit does not return to the arrival pose at progress 1");
ok(Math.abs(orbitSwing(0.5) - 1) < 1e-12, "the orbit does not reach its full arc at the middle");
ok(Math.abs(orbitAngle(0.5, 1) - ORBIT_ARC) < 1e-12, "the orbit's peak is not ORBIT_ARC");
ok(Math.abs(orbitAngle(0.5, -1) + ORBIT_ARC) < 1e-12, "the orbit's sign does not follow the stop's side");
// Widest in the middle, and monotone on each side of it: no stutter inside a half, and the peak is the
// single maximum. Sampled over the whole [0,1].
let prev = -1;
for (let i = 0; i <= 25; i++) {
  const v = orbitSwing(i / 50); // 0 .. 0.5
  ok(v >= prev - 1e-12, `the orbit's rise is not monotone at p=${(i / 50).toFixed(2)}`);
  prev = v;
}
let down = orbitSwing(0.5);
for (let i = 26; i <= 50; i++) {
  const v = orbitSwing(i / 50); // past the peak .. 1
  ok(v <= down + 1e-12, `the orbit's return is not monotone at p=${(i / 50).toFixed(2)}`);
  down = v;
}
// A whole lap of one orbit at the peak, in degrees, is worth printing: it is the number a person would
// describe the movement with.
console.log(`orbit: ${(ORBIT_ARC * DEG).toFixed(0)}deg at the peak, released exactly on the arrival pose`);

// ---- a rigid rotation about the object's own vertical ------------------------------------------------
// spinAboutY is the site-frame half of the pair; the world half has to agree with it, or the camera and the
// crew member would orbit in opposite senses and cross each other.
const obj = { x: 3, z: -2 };
const r = (a) => Math.hypot(a.x - obj.x, a.z - obj.z);
const v0 = new Vector3(4.1, 0, 5.7);
const radius = r(v0);
for (const theta of [0, 0.3, ORBIT_ARC, -ORBIT_ARC, 2.9]) {
  const v = spinAboutY(v0.clone(), obj.x, obj.z, theta);
  ok(Math.abs(r(v) - radius) < 1e-9, `spinAboutY changed the radius at theta=${theta.toFixed(2)}`);
  // The bearing about the object (atan2(x, z), the same measure the stopper authors with) advances by
  // exactly theta, so a positive angle turns the pair one way and a negative angle the other.
  const b0 = Math.atan2(v0.x - obj.x, v0.z - obj.z);
  const b1 = Math.atan2(v.x - obj.x, v.z - obj.z);
  let d = b1 - b0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  ok(Math.abs(d - theta) < 1e-9, `spinAboutY turned the bearing by ${d.toFixed(4)}, not ${theta.toFixed(4)}`);
}
// The world half, about the vertical through the pivot: same sense, same angle, same radius to the pivot.
const axis = new Vector3(0, 1, 0);
const pivot = new Vector3(obj.x, 0, obj.z);
const w0 = new Vector3(v0.x, 0.7, v0.z);
const wRadius = w0.distanceTo(pivot);
for (const theta of [0.3, ORBIT_ARC, -1.1]) {
  const w = spinAboutAxis(w0.clone(), pivot, axis, theta);
  ok(Math.abs(w.distanceTo(pivot) - wRadius) < 1e-9, `spinAboutAxis changed the radius at theta=${theta.toFixed(2)}`);
  const s = spinAboutY(v0.clone(), obj.x, obj.z, theta);
  ok(Math.abs(w.x - s.x) < 1e-9 && Math.abs(w.z - s.z) < 1e-9, `the two orbit halves disagree at theta=${theta.toFixed(2)}: the pair would cross`);
}
// And the facing helper points a figure at a target in the site frame, the way the crew member is parked.
const f = facingToward(0, 0, 0, 10);
ok(Math.abs(f) < 1e-12, "facingToward does not point along +z at a target on +z");

// ---- the progress number the HUD feeds it ------------------------------------------------------------
// Walk every conversation the way the HUD does and hold the progress to a monotone 0..1 that starts at the
// greeting and ends pinned at 1. A curve that stepped backwards would spin the pair back the way they came
// mid-answer, and one that ended below 1 would release the scroll with the camera still round the object.
let walked = 0;
for (const convo of OBJECTS.map(conversationFor)) {
  const s = createScript(convo);
  const at = (m) => `${convo.id}: ${m}`;
  let last = -1;
  const tick = (label) => {
    const p = conversationProgress(s);
    ok(p >= 0 && p <= 1, at(`${label}: progress ${p} is off 0..1`));
    ok(p >= last - 1e-9, at(`${label}: progress went backwards, ${p.toFixed(3)} after ${last.toFixed(3)}`));
    last = p;
  };
  ok(Math.abs(conversationProgress(s)) < 1e-12, at("a fresh script is not parked at the greeting"));
  // Type the intro, tap through it, then type each answer and take one chip per round, exactly as the HUD
  // drives it, sampling progress every frame.
  let guard = 0;
  while (s.phase !== "end" && guard++ < 6000) {
    if (s.phase === "line") advance(s, 1 / 30);
    tick("walk");
    if (s.phase === "ask") {
      const q = questionsOf(s)[0];
      if (!q) { ok(false, at("the walk stalled with no question to ask")); break; }
      pick(s, q.id);
      tick("after pick");
      continue;
    }
    if (s.phase === "line") {
      const beat = s.beats[s.beat];
      if (beat !== undefined && s.chars >= beat.length) tapped(s);
    }
    if (s.phase === "line" && s.pendingEnd) tapped(s);
  }
  ok(s.phase === "end", at("the walk never reached the end card"));
  ok(Math.abs(conversationProgress(s) - 1) < 1e-12, at("progress does not end pinned at 1"));
  ok(Math.abs(last - 1) < 1e-12, at("the last sampled progress was not 1"));
  const total = questionTotal(convo);
  ok(total === 4, at(`${total} rounds, expected four`));
  walked++;
}
ok(walked === 10, `walked ${walked} conversations, expected ten`);

console.log(fails.length ? "\nFAIL\n" + fails.map((f) => " - " + f).join("\n") : "\nthe orbit leaves and returns as one rigid arc, and every conversation ends it back home");
process.exit(fails.length ? 1 : 0);