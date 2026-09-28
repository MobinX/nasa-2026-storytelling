// Walking on airless bodies, as data per world rather than as one tuned number.
//
// 1.62 m/s^2: a pendular step frequency scales with sqrt(g), so Earth's ~1.9 Hz becomes ~0.9 Hz on the
// Moon. The asymmetric shape (fast rise, floaty apex) is what reads as lunar; a symmetric sine reads as
// trampoline above about 12cm of travel, and the phase is locked to distance walked so it can never drift.
//
// Mars is the opposite joke: 3.72 m/s^2 is 2.3 times the Moon's, so the same leg swings 1.5x faster over
// a shorter stride and the hop flattens to a walk. The numbers below are that ratio applied to the lunar
// profile, which is why the Martian crew member cannot lope the way the lunar one does.
const MOON = { stride: 1.62, lift: 0.058, flounce: 0.004, roll: 0.025, pitch: 0.008, sway: 0.019 };
const MARS = { stride: 1.06, lift: 0.025, flounce: 0.002, roll: 0.011, pitch: 0.004, sway: 0.008 };

export const GAIT = { moon: MOON, mars: MARS };
export const STRIDE = MOON.stride;

export function gait(distance, moving, profile = MOON) {
  const ph = (distance / profile.stride) * Math.PI * 2;
  const s = Math.sin(ph);
  const up = Math.pow(Math.max(0, s), 0.8);
  return {
    y: (profile.lift * up + profile.flounce * Math.sin(ph * 2)) * moving,
    roll: profile.roll * s * moving,
    pitch: profile.pitch * Math.sin(ph + 1.2) * moving,
    sway: profile.sway * s * moving,
    stance: s,
  };
}

export const stepEvent = (distance, profile = MOON) => Math.floor(distance / (profile.stride / 2));
