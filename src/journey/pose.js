// The camera path: one pure function of the scroll offset, over six spaces and five scene graphs.
//
// Every rail here is authored data; the maths lives in rail.js and timeline.js. Two of the six spaces are
// sphere flights - down onto the Moon, down onto Mars - and the Martian one is the lunar one multiplied by
// the radius ratio, because limb coverage is scale-invariant (see worlds.js). The ground acts are authored
// in each site's own local metres.
import { Vector3 } from "three";
import { makeRail, sampleRail, scratchSample } from "./rail.js";
import { MOON_DOT_POS } from "../lib/bodies.js";
import { MOON, MARS, R_MARS, R_MOON, MARS_CENTRE, localAt, localDir, MOON_SUN } from "./worlds.js";
import { SEAM_A, SEAM_B, DEPART, TRANSFER_END, MARS_SEAM, MOON_LEGS, MARS_LEGS, smoothstep } from "./timeline.js";

export const SITE_UV = MOON.uv;
export const SUN_DIR = MOON_SUN;
export const EARTH_DIR = localDir(MOON, 0.3, 0.574, 0.76);
export const EARTH_AT = EARTH_DIR.clone().multiplyScalar(120);
export const EARTH_R = 2.0;
export const R_SPHERE = R_MOON;
export const CUT_LOCAL = MOON.cut;
const CUT_LOOK = MOON.cutLook;
const EYE_Y = 1.7;
const S = R_MARS / R_MOON;

const moonLocal = (p) => localAt(MOON, p[0], p[1], p[2]).toArray();
const marsLocal = (p) => localAt(MARS, p[0] * S, p[1] * S, p[2] * S).toArray();
const mix = (a, b, k) => new Vector3(...a).lerp(new Vector3(...b), k).toArray();

const DOT = new Vector3(MOON_DOT_POS[0], MOON_DOT_POS[1], MOON_DOT_POS[2]);
const from = new Vector3(13.6, 1.7, 2.6);
const approach = from.clone().sub(DOT).normalize();
const pEnd = DOT.clone().addScaledVector(approach, 0.25);
const pMid = DOT.clone().addScaledVector(approach, 0.9);

const SOLAR_LEGS = [
  {
    pace: "ease",
    points: [[26, 42, 124], [38, 30, 96], [54, 17, 62], [64, 9, 34]],
    look: [[0, 3, 0], DOT.toArray()],
    fov: [50, 44],
  },
  {
    pace: "linear",
    points: [[64, 9, 34], [50, 4.6, 16], [24, 2.6, 7], from.toArray(), pMid.toArray(), pEnd.toArray()],
    look: [DOT.toArray(), DOT.toArray()],
    fov: [44, 34],
  },
];

// Descent onto the Moon: one pass over the site rather than a lap of it. The camera comes down from ~250 km
// on a bearing it never turns off, and the only rotation across the whole act is the 7 degrees the nose
// drops as the ground comes up to meet it. Every frame looks down at regolith and stays inside the sphere's
// limb even at the portrait corners, which is what makes the dot/sphere swap invisible and keeps a horizon -
// and with it the question of which world you are in - out of the picture until the surface act. The leg
// arcs fall 1.05u / 0.72u / 0.43u / 0.21u against equal quarters of the offset, so the approach decelerates
// on its own and the last leg eases into the hand-off at a standstill.
const DESCENT_RAIL = [
  {
    pace: "linear",
    points: [[0, 0.9, -4.8], [0, 0.85, -4.58], [0, 0.79, -4.37], [0, 0.74, -4.17]],
    look: [[-1.03, -3.4, -1.53], [-0.8, -3.48, -1.29], [-0.55, -3.58, -1.08], [-0.35, -3.65, -0.88]],
    fov: [34, 40],
  },
  {
    pace: "linear",
    points: [[0, 0.74, -4.17], [0, 0.69, -3.99], [0, 0.64, -3.82], [0, 0.6, -3.66]],
    look: [[-0.35, -3.65, -0.88], [-0.22, -3.74, -0.73], [-0.12, -3.82, -0.6], [0, -3.88, -0.47]],
    fov: [40, 46],
  },
  {
    pace: "linear",
    points: [[0, 0.6, -3.66], [0, 0.57, -3.52], [0, 0.54, -3.39], [0, 0.51, -3.27]],
    look: [[0, -3.88, -0.47], [0, -3.95, -0.39], [0, -4.01, -0.3], [0, -4.07, -0.23]],
    fov: [46, 54],
  },
  {
    pace: "ease",
    points: [[0, 0.51, -3.27], [0, 0.49, -3.18], [0, 0.46, -3.09], MOON.cut],
    look: [[0, -4.07, -0.23], [0, -4.12, -0.18], [0, -4.19, -0.16], MOON.cutLook],
    fov: [54, 66],
  },
];

const LUNAR_SPHERE_LEGS = DESCENT_RAIL.map((L) => ({ ...L, points: L.points.map(moonLocal), look: L.look.map(moonLocal) }));
// The same flight at Mars, scaled. Nothing about the coverage is re-derived, because there is nothing to
// re-derive: the ratios are the same numbers.
const MARS_SPHERE_LEGS = DESCENT_RAIL.map((L) => ({ ...L, points: L.points.map(marsLocal), look: L.look.map(marsLocal) }));

// The hand-off heading, expressed on the plane side: 31.4 degrees off the local vertical, aimed from eight
// metres up at the ground twenty-odd metres out. Both hand-offs use it - the descent arrives with it and the
// ascent leaves with it - because it is the only heading at which a sphere and a plane can both fill a
// 66-degree frame with nothing but regolith.
const HANDOVER_LOOK = [0, -9.75, 7.84];

// Lunar surface act, in local metres: down, settle, contact, stand up, walk, walk, hold at the LM, off the
// pad. The hold leg is the conversation - two centimetres of rail against an eighth of the act, so a man can
// finish a sentence without the picture moving. The ascent then climbs and pitches down until the frame is
// regolith again, which is the hand-off pose the transfer space takes over from.
const MOON_GROUND_LEGS = [
  {
    pace: "linear",
    points: [[0, MOON.landingAlt, -3], [0, 6.6, -2.85], [0, 5.2, -2.65], [0, 4, -2.45]],
    look: [[0, -9.75, 7.84], [0, -7.46, 6.99], [0, -5.16, 6.04], [0, -3.35, 4.9]],
    fov: [66, 64],
  },
  {
    pace: "ease",
    points: [[0, 4, -2.45], [0, 3.2, -2.25], [0, 2.4, -2.05], [0, 1.6, -1.85]],
    look: [[0, -3.35, 4.9], [0, -1.92, 4.31], [0, -0.91, 3.24], [0, -0.35, 1.82]],
    fov: [64, 60],
  },
  {
    // Contact. The camera is parked, so the rumble is the only motion there is - against ground, rocks and
    // a horizon, which is the reason the landing is flown this low and not from 0.42u above a sphere.
    pace: "linear",
    points: [[0, 1.6, -1.85], [0, 1.55, -1.83], [0, 1.5, -1.8]],
    look: [[0, -0.35, 1.82], [0, -0.22, 1.79], [0, -0.09, 1.76]],
    fov: [60, 60],
  },
  {
    pace: "ease",
    points: [[0, 1.5, -1.8], [0, 1.55, -1], [0.2, 1.65, -0.2], [0.3, EYE_Y, 0.6]],
    look: [[0, -0.09, 1.76], [0, 0.58, 2.91], [0, 1.35, 4.08], [0, 1.91, 5.02]],
    fov: [60, 57],
  },
  {
    pace: "linear",
    points: [[0.3, EYE_Y, 0.6], [0.6, EYE_Y, 5.5], [0.1, EYE_Y, 10.5], [0.8, EYE_Y, 15.5]],
    look: [[0, 1.91, 5.02], [0.4, 1.45, 12], [0.1, 1.5, 18], [1.1, 1.55, 24]],
    fov: [57, 57],
  },
  {
    pace: "linear",
    points: [[0.8, EYE_Y, 15.5], [1.6, EYE_Y, 20], [2.5, EYE_Y, 25], [3.2, EYE_Y, 29]],
    look: [[1.1, 1.55, 24], [2.2, 1.6, 30], [3.1, 1.6, 35], [3.9, 1.55, 39]],
    fov: [57, 57],
  },
  {
    pace: "linear",
    points: [[3.2, EYE_Y, 29], [3.2, EYE_Y, 29.03], [3.2, EYE_Y, 29.06]],
    look: [[3.9, 1.55, 39], [3.9, 1.57, 39.06], [3.95, 1.62, 39.2]],
    fov: [57, 55],
  },
  {
    pace: "ease",
    points: [[3.2, EYE_Y, 29.06], [2.6, 2.4, 22], [1.4, 4.4, 11], [0, MOON.landingAlt, -3]],
    look: [[3.9, 1.55, 39], [2.4, 0.4, 30], [0.8, -1.6, 18], HANDOVER_LOOK],
    fov: [55, 66],
  },
];

// Martian surface act. The same choreography, but the reveal is the point of the second half: the frame
// comes up into a sky with colour in it for the first time in the piece.
const MARS_GROUND_LEGS = [
  {
    pace: "linear",
    points: [[0, MARS.landingAlt, -3], [0, 6.6, -2.85], [0, 5.2, -2.65], [0, 4, -2.45]],
    look: [[0, -9.75, 7.84], [0, -7.46, 6.99], [0, -5.16, 6.04], [0, -3.35, 4.9]],
    fov: [66, 64],
  },
  {
    pace: "ease",
    points: [[0, 4, -2.45], [0, 3.2, -2.25], [0, 2.4, -2.05], [0, 1.7, -1.85]],
    look: [[0, -3.35, 4.9], [0, -1.92, 4.31], [0, -0.91, 3.24], [0, -0.3, 1.9]],
    fov: [64, 60],
  },
  {
    pace: "linear",
    points: [[0, 1.7, -1.85], [0, 1.65, -1.83], [0, 1.6, -1.8]],
    look: [[0, -0.3, 1.9], [0, -0.18, 1.88], [0, -0.05, 1.86]],
    fov: [60, 60],
  },
  {
    pace: "ease",
    points: [[0, 1.6, -1.8], [0.05, 1.5, -1], [0.2, EYE_Y, -0.2], [0.3, EYE_Y, 0.6]],
    look: [[0, -0.05, 1.86], [0, 0.7, 3.2], [0, 1.45, 4.6], [0, 2.0, 5.6]],
    fov: [60, 56],
  },
  {
    pace: "linear",
    points: [[0.3, EYE_Y, 0.6], [0.6, EYE_Y, 5.5], [0.1, EYE_Y, 10.5], [0.8, EYE_Y, 15.5]],
    look: [[0, 2.0, 5.6], [0.4, 1.5, 12], [0.1, 1.55, 18], [1.1, 1.6, 24]],
    fov: [56, 56],
  },
  {
    pace: "linear",
    points: [[0.8, EYE_Y, 15.5], [1.6, EYE_Y, 20], [2.5, EYE_Y, 25], [3.2, EYE_Y, 29]],
    look: [[1.1, 1.6, 24], [2.2, 1.65, 30], [3.1, 1.65, 35], [3.9, 1.6, 39]],
    fov: [56, 56],
  },
  {
    pace: "linear",
    points: [[3.2, EYE_Y, 29], [3.2, EYE_Y, 29.03], [3.2, EYE_Y, 29.06]],
    look: [[3.9, 1.6, 39], [3.9, 1.62, 39.06], [3.95, 1.65, 39.2]],
    fov: [56, 54],
  },
];

// Out of the Moon. The first frame is the hand-off pose - regolith, steep, no horizon - and then the nose
// comes up: the limb, then the disc, then the whole world shrinking behind while Mars grows ahead. The last
// leg ends exactly on the Martian descent's first frame, so that boundary changes only which world's
// vertical the rig treats as up, and it does so while the frame is nothing but the Martian ground.
const _ascentTop = moonLocal([0, 1.9, -4.6]);
const _ascentLook = moonLocal([0, 4.2, 14]);
const _highLook = moonLocal([0, 9, 26]);
const _entryPoint = marsLocal(DESCENT_RAIL[0].points[0]);
const _entryLook = marsLocal(DESCENT_RAIL[0].look[0]);

const TRANSFER_LEGS = [
  {
    pace: "linear",
    points: [[0, 0.42, -3], [0, 0.7, -3.4], [0, 1.15, -3.9], [0, 1.9, -4.6]].map(moonLocal),
    look: [CUT_LOOK, [0, -2.2, 1.4], [0, 0.4, 6.5], [0, 4.2, 14]].map(moonLocal),
    fov: [66, 52],
  },
  {
    pace: "linear",
    points: [_ascentTop, moonLocal([0, 3.4, -7.5]), moonLocal([0, 6.5, -12]), mix(_ascentTop, _entryPoint, 0.12)],
    look: [_ascentLook, moonLocal([0, 9, 26]), mix(_highLook, MARS_CENTRE.toArray(), 0.35), mix(_highLook, MARS_CENTRE.toArray(), 0.62)],
    fov: [52, 38],
  },
  {
    pace: "linear",
    points: [mix(_ascentTop, _entryPoint, 0.12), mix(_ascentTop, _entryPoint, 0.45), mix(_ascentTop, _entryPoint, 0.78), _entryPoint],
    look: [
      mix(_highLook, MARS_CENTRE.toArray(), 0.62),
      mix(mix(_highLook, MARS_CENTRE.toArray(), 0.62), _entryLook, 0.55),
      mix(_highLook, _entryLook, 0.85),
      _entryLook,
    ],
    fov: [38, 34],
  },
];

const buildSpace = ({ id, graph, from, to, near, far, legs, local, world }) => ({
  id,
  graph,
  from,
  to,
  near,
  far,
  legs,
  world: world || MOON,
  local: !!local,
  rail: makeRail(legs.map((l) => ({ points: l.points }))),
});

export const SPACES = [
  buildSpace({ id: "solar", graph: "solar", from: 0, to: SEAM_A, near: 0.05, far: 2000, legs: SOLAR_LEGS }),
  buildSpace({ id: "lunar", graph: "moonSphere", from: SEAM_A, to: SEAM_B, near: 0.05, far: 2000, legs: LUNAR_SPHERE_LEGS, world: MOON }),
  buildSpace({ id: "ground", graph: MOON.graph, from: SEAM_B, to: DEPART, near: 0.02, far: 4200, legs: MOON_GROUND_LEGS, local: true, world: MOON }),
  buildSpace({ id: "transfer", graph: "transfer", from: DEPART, to: TRANSFER_END, near: 0.05, far: 2000, legs: TRANSFER_LEGS, world: MOON }),
  buildSpace({ id: "marsOrbit", graph: "transfer", from: TRANSFER_END, to: MARS_SEAM, near: 0.05, far: 2000, legs: MARS_SPHERE_LEGS, world: MARS }),
  buildSpace({ id: "marsGround", graph: MARS.graph, from: MARS_SEAM, to: 1, near: 0.02, far: 4200, legs: MARS_GROUND_LEGS, local: true, world: MARS }),
];

export const spaceAt = (offset) => {
  for (let i = 0; i < SPACES.length; i++) if (offset <= SPACES[i].to) return SPACES[i];
  return SPACES[SPACES.length - 1];
};

const paceOf = (pace, s) => (pace === "ease" ? smoothstep(s, 0, 1) : s);
const clamp01u = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const _c = new Vector3();

const lerpSet = (arr, u, out) => {
  const t2 = clamp01u(u) * (arr.length - 1);
  const i0 = Math.min(arr.length - 2, Math.floor(t2));
  return out.fromArray(arr[i0]).lerp(_c.fromArray(arr[i0 + 1]), t2 - i0);
};

const lerpSetFov = (arr, u) => {
  const t2 = clamp01u(u) * (arr.length - 1);
  const i0 = Math.min(arr.length - 2, Math.floor(t2));
  return arr[i0] + (arr[i0 + 1] - arr[i0]) * (t2 - i0);
};

export const poseAt = (offset, out) => {
  const space = spaceAt(offset);
  const n = space.rail.curves.length;
  const t = clamp01u((offset - space.from) / (space.to - space.from)) * n;
  const i = Math.min(n - 1, Math.floor(t));
  const leg = space.legs[i];
  const u = paceOf(leg.pace, clamp01u(t - i));
  const w = space.rail.windows[i];
  sampleRail(space.rail, (w.a + u * (w.b - w.a)) / space.rail.total, out.sample);
  out.local.copy(out.sample.position);
  out.tangent.copy(out.sample.tangent);
  lerpSet(leg.look, u, out.target);
  out.fov = leg.fov.length === 2 ? leg.fov[0] + (leg.fov[1] - leg.fov[0]) * u : lerpSetFov(leg.fov, u);
  out.leg = i;
  out.space = space;
  out.world = space.world;
  if (space.local) {
    const q = space.world.site.quaternion;
    out.position.copy(out.local).applyQuaternion(q).add(space.world.site.pos);
    out.target.applyQuaternion(q).add(space.world.site.pos);
    out.tangent.applyQuaternion(q);
  } else {
    out.position.copy(out.local);
  }
  return out;
};

export const scratchPose = () => ({
  sample: scratchSample(),
  position: new Vector3(),
  local: new Vector3(),
  target: new Vector3(),
  tangent: new Vector3(),
  fov: 50,
  leg: 0,
  space: null,
  world: MOON,
});

// Metres actually walked, off the rail rather than the offset: the touchdown and conversation legs advance
// a slice of the act against centimetres, and footprints and the gait phase must not lie about distance.
export const walkDistance = (space, offset) => {
  const n = space.rail.curves.length;
  const t = clamp01u((offset - space.from) / (space.to - space.from)) * n;
  const i = Math.min(n - 1, Math.floor(t));
  const u = paceOf(space.legs[i].pace, clamp01u(t - i));
  const w = space.rail.windows[i];
  return w.a + u * (w.b - w.a);
};

// Metres per unit of offset, so the gait bob is driven by the speed the camera is really going. Central
// difference: still a pure function of the offset.
export const walkRate = (space, offset, eps = 1.5e-3) =>
  (walkDistance(space, offset + eps) - walkDistance(space, offset - eps)) / (2 * eps);

export const MOON_GROUND = SPACES[2];
export const MARS_GROUND = SPACES[5];
export const legStartOf = (space, i) => space.from + (i / space.legs.length) * (space.to - space.from);

// Where each ending composition is measured: the hold leg, not the end of the rail.
export const MOON_FRAMED_AT = legStartOf(MOON_GROUND, MOON_LEGS - 2) + 0.002;
export const MARS_FRAMED_AT = legStartOf(MARS_GROUND, MARS_LEGS - 1) + 0.002;

export { MARS_CENTRE, R_MARS, R_MOON };
