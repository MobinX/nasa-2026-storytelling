export const PAGES = 10;
export const DISTANCE = 1;
export const DAMPING = 0.18;

export const ACTS = [
  { id: "system", from: 0.0, to: 0.06, space: "solar", caption: "The Solar System" },
  { id: "transit", from: 0.06, to: 0.28, space: "solar", caption: "Inner Planes" },
  { id: "cislunar", from: 0.28, to: 0.42, space: "lunar", caption: "Toward the Moon" },
  { id: "orbit", from: 0.42, to: 0.6, space: "lunar", caption: "Low Lunar Orbit" },
  { id: "descent", from: 0.6, to: 0.7, space: "lunar", caption: "Descent" },
  { id: "reveal", from: 0.7, to: 0.8, space: "ground", caption: "Sea of Tranquillity" },
  { id: "walk", from: 0.8, to: 1.0, space: "ground", caption: "Walk" },
];

// Three scene graphs, never co-rendered: the units change by ~10^5 across each boundary, so position
// is cut and only orientation (unitless) is handed off. Both cuts land on a frame full of regolith.
export const SEAM_A = 0.28;
export const SEAM_B = 0.7;
export const GROUND_IN = SEAM_B;
export const GROUND_FULL = 0.75;

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const range01 = (x, from, to) => clamp01((x - from) / (to - from));

// Zero derivative at both ends, so it can be inserted at a joint without a velocity pop.
export const smoothstep = (x, from, to) => {
  const t = range01(x, from, to);
  return t * t * (3 - 2 * t);
};

export const smootherstep = (x, from, to) => {
  const t = range01(x, from, to);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export const groundWeight = (offset) => smoothstep(offset, GROUND_IN, GROUND_FULL);

export const actAt = (offset) => {
  const o = clamp01(offset);
  for (let i = ACTS.length - 1; i >= 0; i--) if (o >= ACTS[i].from) return ACTS[i];
  return ACTS[0];
};

export const CAMERA = { orbit: { near: 0.05, far: 2000 }, ground: { near: 0.02, far: 4000 } };
