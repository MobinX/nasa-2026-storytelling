import { smoothstep } from "../journey/timeline.js";
import { SEAM_A } from "../journey/timeline.js";
import { tint } from "./surface.js";

export const AU2U = (a) => 4.6 + 6.6 * Math.pow(a, 0.55);
export const KM2U = (km) => 0.42 * Math.pow(km / 6371, 0.35);

export const SUN_U = 1.6;
export const MOON_ORBIT_U = 1.15;
export const MOON_DOT_U = 0.13;
export const MOON_SPHERE_U = 12;

// Real orbital radii and radii are unrenderable next to each other on a 400px-wide screen, so both are
// compressed. Order, tilt and relative sizing stay honest; the labels carry the rest of the legibility.
export const BODIES = [
  { id: "mercury", name: "Mercury", a: 0.387, km: 2439.7, tilt: 0.03, rotH: 1407.6, years: 0.241, theta0: 0.1, colour: "#8f8a84", file: "2k_mercury.jpg", tex: [1024, 512] },
  { id: "venus", name: "Venus", a: 0.723, km: 6051.8, tilt: 177.36, rotH: -5832.5, years: 0.615, theta0: 0.225, colour: "#e3c48f", file: "2k_venus_surface.jpg", tex: [1024, 512] },
  { id: "earth", name: "Earth", a: 1.0, km: 6371, tilt: 23.44, rotH: 23.93, years: 1.0, theta0: 0.03, colour: "#5b7fb8", file: "2k_earth_daymap.jpg", tex: [1024, 512] },
  { id: "mars", name: "Mars", a: 1.524, km: 3389.5, tilt: 25.19, rotH: 24.62, years: 1.881, theta0: 0.34, colour: "#b4694a", file: "2k_mars.jpg", tex: [1024, 512] },
  { id: "jupiter", name: "Jupiter", a: 5.203, km: 69911, tilt: 3.13, rotH: 9.93, years: 11.86, theta0: 1.95, colour: "#d8b48a", file: "2k_jupiter.jpg", tex: [1024, 512] },
  { id: "saturn", name: "Saturn", a: 9.537, km: 58232, tilt: 26.73, rotH: 10.66, years: 29.46, theta0: 2.95, colour: "#e3d0a8", file: "2k_saturn.jpg", tex: [1024, 512] },
  { id: "uranus", name: "Uranus", a: 19.19, km: 25362, tilt: 97.77, rotH: -17.24, years: 84.01, theta0: 4.05, colour: "#a8dbe4", file: "2k_uranus.jpg", tex: [1024, 512] },
  { id: "neptune", name: "Neptune", a: 30.07, km: 24622, tilt: 28.32, rotH: 16.11, years: 164.8, theta0: 5.15, colour: "#5b76d4", file: "2k_neptune.jpg", tex: [1024, 512] },
];

for (const b of BODIES) {
  b.orbit = AU2U(b.a);
  b.radius = b.id === "earth" ? KM2U(b.km) : KM2U(b.km);
  b.w = 1 / Math.sqrt(b.years);
  b.rev = 0.44 / Math.sqrt(b.years);
  // The tint, not the hue: every body in the opening diagram is a texture times its colour, and the hexes
  // as authored were keeping a fifth to two thirds of each map. See lib/surface.js.
  b.tint = tint(b.colour);
  // At 20 segments the silhouette is a polygon, and every planet is only 10-40 px across in the opening diagram.
  // 8 spheres at 48x32 is ~23k triangles - cheaper than the fill rate the dpr and MSAA bumps just bought.
  b.segments = [48, 32];
}

// Revolution must stop before the rail commits to an approach, or the authored terminus misses the body.
export const REVOLVE_UNTIL = 0.09;
export const revolve = (offset) => 1 - smoothstep(offset, 0.03, REVOLVE_UNTIL);
export const thetaAt = (b, offset) => b.theta0 + b.rev * revolve(offset);
export const MOON_THETA = 0.42;

export const EARTH = BODIES[2];

// Derived, never hardcoded: the rail has to meet the Moon where it actually is at the cut.
export const MOON_DOT_POS = moonDotPos(SEAM_A, [0, 0, 0]);
export function moonDotPos(offset, out) {
  const th = thetaAt(EARTH, offset);
  out[0] = Math.cos(th) * EARTH.orbit + Math.cos(MOON_THETA) * MOON_ORBIT_U;
  out[1] = 0;
  out[2] = Math.sin(th) * EARTH.orbit + Math.sin(MOON_THETA) * MOON_ORBIT_U;
  return out;
}
