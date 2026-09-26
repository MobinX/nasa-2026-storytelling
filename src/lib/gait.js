// 1.62 m/s^2: a pendular step frequency scales with sqrt(g), so Earth's ~1.9 Hz becomes ~0.9 Hz. The
// asymmetric shape (fast rise, floaty apex) is what reads as lunar; a symmetric sine reads as trampoline
// above about 12cm of travel, and the phase is locked to distance walked so it can never drift.
export const STRIDE = 1.62;

export function gait(distance, moving) {
  const ph = (distance / STRIDE) * Math.PI * 2;
  const s = Math.sin(ph);
  const up = Math.pow(Math.max(0, s), 0.8);
  return {
    y: (0.058 * up + 0.004 * Math.sin(ph * 2)) * moving,
    roll: 0.025 * s * moving,
    pitch: 0.008 * Math.sin(ph + 1.2) * moving,
    sway: 0.019 * s * moving,
    stance: s,
  };
}

export const stepEvent = (distance) => Math.floor(distance / (STRIDE / 2));
