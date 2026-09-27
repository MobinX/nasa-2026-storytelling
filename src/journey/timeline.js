// Screens of scroll for the whole journey. It used to be 10 and every flick swept a tenth of the story,
// which is fast enough to blow straight past the descent and the landing; at 15 a flick is 0.067 of the
// timeline, so the approach, the last eight metres and the rumble are each a gesture of their own.
export const PAGES = 15;
export const DISTANCE = 1;
export const DAMPING = 0.18;

export const ACTS = [
  { id: "system", from: 0.0, to: 0.06, space: "solar", caption: "The Solar System" },
  { id: "transit", from: 0.06, to: 0.28, space: "solar", caption: "Inner Planes" },
  { id: "approach", from: 0.28, to: 0.42, space: "lunar", caption: "Approach" },
  { id: "descent", from: 0.42, to: 0.62, space: "lunar", caption: "Descent" },
  { id: "handover", from: 0.62, to: 0.7, space: "lunar", caption: "Final Approach" },
  { id: "landing", from: 0.7, to: 0.8, space: "ground", caption: "Landing" },
  { id: "touchdown", from: 0.8, to: 0.855, space: "ground", caption: "Touchdown" },
  { id: "reveal", from: 0.855, to: 0.9, space: "ground", caption: "Sea of Tranquillity" },
  { id: "walk", from: 0.9, to: 1.0, space: "ground", caption: "Walk" },
];

// Three scene graphs, never co-rendered: the units change by ~10^5 across each boundary, so position
// is cut and only orientation (unitless) is handed off. Both cuts land on a frame full of regolith.
export const SEAM_A = 0.28;
export const SEAM_B = 0.7;
// Contact with the surface, eight metres of descent after the hand-off, and the end of the rumble.
export const CONTACT = 0.8;
export const IMPACT_END = 0.855;
// The camera is on its feet and walking from here.
export const WALK_IN = 0.9;

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const range01 = (x, from, to) => clamp01((x - from) / (to - from));

// Zero derivative at both ends, so it can be inserted at a joint without a velocity pop.
export const smoothstep = (x, from, to) => {
  const t = range01(x, from, to);
  return t * t * (3 - 2 * t);
};

// The gait only belongs once the camera is upright and walking. Without this gate the descent and the
// stand-up, which both move the camera along the same rail, would read as a run.
export const walkWeight = (offset) => smoothstep(offset, WALK_IN, 0.92);

// The touchdown rumble. A function of the offset like everything else on the camera path, so scrubbing
// back through contact reproduces the shake exactly, and its frequency in wall-clock time is whatever the
// scroll rate is: a flick reads as a jolt, a slow scroll as a settling wobble. Two components because a
// single sine reads as a spring, and both vanish at either end of the band.
export const impact = (offset) => {
  const t = range01(offset, CONTACT, IMPACT_END);
  if (t <= 0 || t >= 1) return 0;
  return Math.exp(-3.2 * t) * (1 - t) * (0.75 * Math.sin(t * Math.PI * 9) + 0.25 * Math.sin(t * Math.PI * 21));
};

export const actAt = (offset) => {
  const o = clamp01(offset);
  for (let i = ACTS.length - 1; i >= 0; i--) if (o >= ACTS[i].from) return ACTS[i];
  return ACTS[0];
};

export const CAMERA = { orbit: { near: 0.05, far: 2000 }, ground: { near: 0.02, far: 4000 } };
