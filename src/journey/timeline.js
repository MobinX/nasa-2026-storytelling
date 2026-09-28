// Screens of scroll for the whole journey. The piece is three acts now - down onto the Moon and along its
// route, down onto Mars and along its route, and a drift between two things in deep space - so every
// boundary below is written as a number of flicks and converted once. A surface act is one leg per screen,
// which is what makes a stop a thing you can feel: one flick, one instrument, one conversation.
import { STOPS, legsForPlanet } from "./stops.js";

export const PAGES = 46;
export const DISTANCE = 1;
export const DAMPING = 0.18;

const screens = (n) => n / PAGES;

// Scene-graph boundaries. Position is cut at most of these and only orientation is handed off; the README's
// "How it is put together" explains why a cut is the only thing that works at these scales.
export const SEAM_A = screens(4); //    solar diagram -> Moon sphere, the dot/sphere swap
export const SEAM_B = screens(7); //    Moon sphere   -> lunar surface, the 8 m hand-off
export const DEPART = screens(20); //   lunar surface -> transfer, the same hand-off inverted
export const TRANSFER_END = screens(24); //  Moon's vertical -> Mars's vertical, at transfer speed
export const MARS_SEAM = screens(27); // Mars sphere  -> Martian surface, the 8 m hand-off again
export const MARS_DEPART = screens(40); //  Martian surface -> transfer, inverted hand-off once more
export const EVA_SEAM = screens(42); //  deep space: the coast ends and the two EVA stops begin

// A surface act: four legs to get down and stand up, then a walking leg and a hold leg per object, then
// the ascent. The EVA act is just the pairs. Counted by journey/stops.js from the stop list, so adding an
// object to objects.json lengthens the walk and moves every later boundary with it.
export const MOON_LEGS = legsForPlanet("moon");
export const MARS_LEGS = legsForPlanet("mars");
export const EVA_LEGS = legsForPlanet("solar");

const span = (from, to, legs) => (to - from) / legs;
// Where each conversation traps the scroll: the offset the rail arrives at, which is the first frame of
// that stop's hold leg. The window is deliberately wider than the leg, because the visitor has to be able
// to arrive, look, and then find that they cannot advance.
// The same stop objects, not copies: objects.json is applied to STOPS after this module has run, and a
// conversation, a name and a model are only visible to the rig and the captions if they read the objects
// that got filled in. The lock is written onto the stop, so the live route and the schedule cannot disagree.
const stopAt = (stops, from, to, legs) => {
  const s = span(from, to, legs);
  for (const stop of stops) {
    stop.lock = from + stop.leg * s;
    stop.spanSize = s;
  }
  return stops;
};

export const SURFACE_STOPS = {
  moon: stopAt(STOPS.moon, SEAM_B, DEPART, MOON_LEGS),
  mars: stopAt(STOPS.mars, MARS_SEAM, MARS_DEPART, MARS_LEGS),
  solar: stopAt(STOPS.solar, MARS_DEPART, 1, EVA_LEGS),
};

export const MOON_CONTACT = SEAM_B + span(SEAM_B, DEPART, MOON_LEGS) * 2;
export const MOON_IMPACT_END = MOON_CONTACT + span(SEAM_B, DEPART, MOON_LEGS);
export const MOON_WALK_IN = SEAM_B + span(SEAM_B, DEPART, MOON_LEGS) * 4;
export const MARS_CONTACT = MARS_SEAM + span(MARS_SEAM, MARS_DEPART, MARS_LEGS) * 2;
export const MARS_IMPACT_END = MARS_CONTACT + span(MARS_SEAM, MARS_DEPART, MARS_LEGS);
export const MARS_WALK_IN = MARS_SEAM + span(MARS_SEAM, MARS_DEPART, MARS_LEGS) * 4;

// One act per leg, so the caption says what is happening rather than where the number is. The surface
// acts alternate "walking - <thing>" with "<thing> - <where it really is>", which is the only place the
// location string from objects.json is ever shown. Those two are read through a getter, because the act
// list is built before the file is applied and a caption frozen at import would name the stop by its id
// for the rest of the session.
const legSpan = (from, to, legs) => (to - from) / legs;
const acts = [];
const push = (id, from, to, graph, caption) => acts.push({ id, from, to, graph, caption });
const named = (id, from, to, graph, build) => {
  const act = { id, from, to, graph };
  Object.defineProperty(act, "caption", { get: build, enumerable: true });
  acts.push(act);
};
const surfaceActs = (planet, from, to, legs, graph) => {
  const s = legSpan(from, to, legs);
  const at = (leg) => from + leg * s;
  push(planet + "-landing", at(0), at(2), graph, "Landing");
  push(planet + "-touchdown", at(2), at(3), graph, "Touchdown");
  push(planet + "-reveal", at(3), at(4), graph, planet === "moon" ? "Sea of Tranquillity" : "Jezero West");
  for (const [i, stop] of SURFACE_STOPS[planet].entries()) {
    named(`${planet}-walk-${i}`, at(stop.walkLeg), at(stop.leg), graph, () => "Walking — " + stop.name);
    named(`${planet}-talk-${i}`, at(stop.leg), at(stop.leg + 1), graph, () => stop.name + " — " + stop.location);
  }
  push(planet + "-ascent", at(legs - 1), to, graph, planet === "moon" ? "Ascent stage" : "Off Mars");
};
push("system", 0, screens(1), "solar", "The Solar System");
push("transit", screens(1), SEAM_A, "solar", "Inner Planes");
push("approach", SEAM_A, screens(6), "moonSphere", "Approach");
push("descent", screens(6), SEAM_B, "moonSphere", "Descent");
surfaceActs("moon", SEAM_B, DEPART, MOON_LEGS, "moonGround");
push("transfer", DEPART, TRANSFER_END, "transfer", "Trans-Mars coast");
push("capture", TRANSFER_END, screens(26), "transfer", "Mars, ahead");
push("marsDescent", screens(26), MARS_SEAM, "transfer", "Descent to Jezero");
surfaceActs("mars", MARS_SEAM, 1, MARS_LEGS, "marsGround");
{
  const s = legSpan(MARS_DEPART, 1, EVA_LEGS);
  push("away", MARS_DEPART, MARS_DEPART + s, "eva", "Leaving Mars orbit");
  push("turn", MARS_DEPART + s, SURFACE_STOPS.solar[0].lock - s, "eva", "The machines out here");
  SURFACE_STOPS.solar.forEach((stop, i) => {
    named("eva-drift-" + i, MARS_DEPART + (2 + i * 2) * s, stop.lock, "eva", () => "Drifting — " + stop.name);
    named("eva-talk-" + i, stop.lock, stop.lock + s, "eva", () => stop.name + " — " + stop.location);
  });
}
export const ACTS = acts;

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const range01 = (x, from, to) => clamp01((x - from) / (to - from));

// Zero derivative at both ends, so it can be inserted at a joint without a velocity pop.
export const smoothstep = (x, from, to) => {
  const t = range01(x, from, to);
  return t * t * (3 - 2 * t);
};

// The gait only belongs once the camera is upright and walking. Without this gate the descent and the
// stand-up, which both move the camera along the same rail, would read as a run.
export const walkWeight = (offset, walkIn) => smoothstep(offset, walkIn, walkIn + 0.02);

// The touchdown rumble, per landing band. A function of the offset like everything else on the camera
// path, so scrubbing back through contact reproduces the shake exactly, and its frequency in wall-clock
// time is whatever the scroll rate is: a flick reads as a jolt, a slow scroll as a settling wobble. Two
// components because a single sine reads as a spring, and both vanish at either end of the band.
export const rumble = (offset, from, to) => {
  const t = range01(offset, from, to);
  if (t <= 0 || t >= 1) return 0;
  return Math.exp(-3.2 * t) * (1 - t) * (0.75 * Math.sin(t * Math.PI * 9) + 0.25 * Math.sin(t * Math.PI * 21));
};

export const actAt = (offset) => {
  const o = clamp01(offset);
  for (let i = acts.length - 1; i >= 0; i--) if (o >= acts[i].from) return acts[i];
  return acts[0];
};

export const CAMERA = { orbit: { near: 0.05, far: 2000 }, ground: { near: 0.02, far: 4200 } };
