// Screens of scroll for the whole journey. It used to be 10 and every flick swept a tenth of the story,
// which is fast enough to blow straight past the descent and the landing; the piece is two landings long
// now, so the budget is written in screens and every boundary below is a number of flicks, not a decimal.
export const PAGES = 30;
export const DISTANCE = 1;
export const DAMPING = 0.18;

const screens = (n) => n / PAGES;

// Scene-graph boundaries. Position is cut at all four and only orientation is handed off; the README's
// "How it is put together" explains why a cut is the only thing that can work at these scales.
export const SEAM_A = screens(4.5); //   solar diagram -> Moon sphere, the dot/sphere swap
export const SEAM_B = screens(8); //     Moon sphere   -> lunar surface, the 8 m hand-off
export const DEPART = screens(16.5); //  lunar surface -> transfer, the same hand-off inverted
export const TRANSFER_END = screens(20.5); //  Moon's vertical -> Mars's vertical, at transfer speed
export const MARS_SEAM = screens(24); //  Mars sphere   -> Martian surface, the 8 m hand-off again

// Each ground act is a list of equal legs and the milestones are leg starts. Nothing here can derive them
// from the rails without a cycle, so tools/check-journey.mjs is what holds the two together.
export const MOON_LEGS = 8;
export const MARS_LEGS = 7;
const legAt = (from, to, n, i) => from + (i / n) * (to - from);

export const MOON_CONTACT = legAt(SEAM_B, DEPART, MOON_LEGS, 2);
export const MOON_IMPACT_END = legAt(SEAM_B, DEPART, MOON_LEGS, 3);
export const MOON_WALK_IN = legAt(SEAM_B, DEPART, MOON_LEGS, 4);
export const MOON_TALK_START = legAt(SEAM_B, DEPART, MOON_LEGS, 6);
export const MOON_ASCENT_START = legAt(SEAM_B, DEPART, MOON_LEGS, 7);
export const MOON_TALK_IN = MOON_TALK_START - 0.008;
export const MOON_TALK_OUT = MOON_ASCENT_START + 0.005;

export const MARS_CONTACT = legAt(MARS_SEAM, 1, MARS_LEGS, 2);
export const MARS_IMPACT_END = legAt(MARS_SEAM, 1, MARS_LEGS, 3);
export const MARS_WALK_IN = legAt(MARS_SEAM, 1, MARS_LEGS, 4);
export const MARS_TALK_START = legAt(MARS_SEAM, 1, MARS_LEGS, 6);
export const MARS_TALK_IN = MARS_TALK_START - 0.008;
export const MARS_TALK_OUT = 2; //   the journey ends mid-conversation, so this one never closes

export const ACTS = [
  { id: "system", from: 0, to: screens(1), graph: "solar", caption: "The Solar System" },
  { id: "transit", from: screens(1), to: SEAM_A, graph: "solar", caption: "Inner Planes" },
  { id: "approach", from: SEAM_A, to: screens(6), graph: "moonSphere", caption: "Approach" },
  { id: "descent", from: screens(6), to: SEAM_B, graph: "moonSphere", caption: "Descent" },
  { id: "landing", from: SEAM_B, to: MOON_CONTACT, graph: "moonGround", caption: "Landing" },
  { id: "touchdown", from: MOON_CONTACT, to: MOON_IMPACT_END, graph: "moonGround", caption: "Touchdown" },
  { id: "reveal", from: MOON_IMPACT_END, to: MOON_WALK_IN, graph: "moonGround", caption: "Sea of Tranquillity" },
  { id: "walk", from: MOON_WALK_IN, to: MOON_TALK_START, graph: "moonGround", caption: "Sea of Tranquillity — 0.67°N 23.5°E" },
  { id: "eagle", from: MOON_TALK_START, to: DEPART, graph: "moonGround", caption: "Eagle — Tranquillity Base" },
  { id: "ascent", from: DEPART, to: screens(18), graph: "transfer", caption: "Ascent stage" },
  { id: "transfer", from: screens(18), to: TRANSFER_END, graph: "transfer", caption: "Trans-Mars coast" },
  { id: "capture", from: TRANSFER_END, to: screens(22), graph: "transfer", caption: "Mars, ahead" },
  { id: "marsDescent", from: screens(22), to: MARS_SEAM, graph: "transfer", caption: "Descent to Jezero" },
  { id: "marsLanding", from: MARS_SEAM, to: MARS_CONTACT, graph: "marsGround", caption: "Entry, descent, landing" },
  { id: "marsTouchdown", from: MARS_CONTACT, to: MARS_IMPACT_END, graph: "marsGround", caption: "Touchdown" },
  { id: "marsReveal", from: MARS_IMPACT_END, to: MARS_WALK_IN, graph: "marsGround", caption: "Jezero West" },
  { id: "marsWalk", from: MARS_WALK_IN, to: MARS_TALK_START, graph: "marsGround", caption: "Jezero West — 18.4°N 77.5°E" },
  { id: "ares", from: MARS_TALK_START, to: 1, graph: "marsGround", caption: "Ares — Sol 1" },
];

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
  for (let i = ACTS.length - 1; i >= 0; i--) if (o >= ACTS[i].from) return ACTS[i];
  return ACTS[0];
};

export const CAMERA = { orbit: { near: 0.05, far: 2000 }, ground: { near: 0.02, far: 4200 } };
