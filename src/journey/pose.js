import { Vector3, MathUtils } from "three";
import { makeRail, sampleRail, scratchSample } from "./rail.js";
import { MOON_DOT_POS, MOON_SPHERE_U } from "../lib/bodies.js";
import { siteFrame, uvFromDirection } from "../lib/terrain.js";
import { SEAM_A, SEAM_B, clamp01, range01, smoothstep } from "./timeline.js";

export const R_SPHERE = MOON_SPHERE_U;
export const SITE = siteFrame(MathUtils.degToRad(0.67), MathUtils.degToRad(23.5), R_SPHERE);
export const SITE_UV = uvFromDirection(SITE.n);

// Local tangent frame at the landing site -> world. The sun sits 20 degrees above the horizon and Earth
// 35 degrees up, so one directional light gives an honest terminator and an honest Earth phase in both
// the lunar and the ground act.
export const localAt = (x, y, z) => new Vector3(x, y, z).applyQuaternion(SITE.quaternion).add(SITE.pos);
export const localDir = (x, y, z) => new Vector3(x, y, z).applyQuaternion(SITE.quaternion).normalize();
export const SUN_DIR = localDir(-0.94, 0.342, 0.05);
export const EARTH_DIR = localDir(0.3, 0.574, 0.76);
export const EARTH_AT = EARTH_DIR.clone().multiplyScalar(120);
export const EARTH_R = 2.0;

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

const EYE_Y = 1.7;

// The lunar act's hand-off frame, 0.42u above the sphere, and the spot the ground field is levelled at -
// index.jsx, the corridor and the ground act's first point all key off these coordinates. The pitch is the
// load-bearing number: at this radius a 66-degree frame is only regolith if it stays inside the limb, which
// means aiming at least 35 degrees off the vertical, so nothing in the sphere act can show a horizon.
export const CUT_LOCAL = [0, 0.42, -3.0];
const CUT = CUT_LOCAL;
export const CUT_LOOK = [0, -4.27, -0.13];

// Where the ground act takes over: the same heading, eight metres above that levelled spot, so the last
// eight metres of the landing run down real terrain instead of 40 cm of unresolvable albedo.
const LANDING_ALT = 8;

// Descent, authored as one pass over the site rather than a lap of the Moon: the camera comes down from
// ~250 km on a bearing it never turns off, and the only rotation across the whole act is the 7 degrees
// the nose drops as the ground comes up to meet it. Every frame looks down at regolith and stays inside
// the sphere's limb, which is what makes seam A's 14-unit position jump invisible and keeps a horizon -
// and with it the whole question of which world you are in - out of the picture until the ground act.
// The leg arcs fall 0.65u / 0.53u / 0.41u / 0.28u against equal quarters of the offset, so the approach
// decelerates on its own and the last leg eases into the hand-off at a standstill.
const LUNAR_LEGS = [
  {
    pace: "linear",
    points: [localAt(0, 0.9, -4.8).toArray(), localAt(0, 0.85, -4.58).toArray(), localAt(0, 0.79, -4.37).toArray(), localAt(0, 0.74, -4.17).toArray()],
    look: [localAt(-1.03, -3.4, -1.53).toArray(), localAt(-0.8, -3.48, -1.29).toArray(), localAt(-0.55, -3.58, -1.08).toArray(), localAt(-0.35, -3.65, -0.88).toArray()],
    fov: [34, 40],
  },
  {
    pace: "linear",
    points: [localAt(0, 0.74, -4.17).toArray(), localAt(0, 0.69, -3.99).toArray(), localAt(0, 0.64, -3.82).toArray(), localAt(0, 0.6, -3.66).toArray()],
    look: [localAt(-0.35, -3.65, -0.88).toArray(), localAt(-0.22, -3.74, -0.73).toArray(), localAt(-0.12, -3.82, -0.6).toArray(), localAt(0, -3.88, -0.47).toArray()],
    fov: [40, 46],
  },
  {
    pace: "linear",
    points: [localAt(0, 0.6, -3.66).toArray(), localAt(0, 0.57, -3.52).toArray(), localAt(0, 0.54, -3.39).toArray(), localAt(0, 0.51, -3.27).toArray()],
    look: [localAt(0, -3.88, -0.47).toArray(), localAt(0, -3.95, -0.39).toArray(), localAt(0, -4.01, -0.3).toArray(), localAt(0, -4.07, -0.23).toArray()],
    fov: [46, 54],
  },
  {
    pace: "ease",
    points: [localAt(0, 0.51, -3.27).toArray(), localAt(0, 0.49, -3.18).toArray(), localAt(0, 0.46, -3.09).toArray(), localAt(...CUT).toArray()],
    look: [localAt(0, -4.07, -0.23).toArray(), localAt(0, -4.12, -0.18).toArray(), localAt(0, -4.19, -0.16).toArray(), localAt(...CUT_LOOK).toArray()],
    fov: [54, 66],
  },
];

// Ground space: authored in LOCAL metres on the tangent plane, mapped to world by the site frame.
//
// Seam B cuts ORIENTATION only, like seam A - it does not have to cut position, and here it must not: the
// sphere cannot show a landing-height view at all (from 0.4u up, a 66-degree frame is only regolith if it
// is aimed 35 degrees off the vertical, which from 0.4 metres of eye height means staring at 40 cm of dirt
// that the albedo crop cannot resolve at any scale). So the lunar act hands off a steep downward frame at
// 8 m above the site and the last eight metres of the landing happen in the ground act, where the terrain
// has relief, rocks and a horizon. Both sides of the cut are regolith lit by the same sun, which is the
// same trade the dot/sphere swap makes one act earlier. Six legs, sixths of the act: down, settle, contact,
// stand up, walk, arrive.

// Every leg repeats the previous leg's last point and last look stop exactly, or the head and the rails
// would snap at the joint. Over the walk itself the gaze drifts a few degrees east: enough to carry the
// LM on the right and bring the flag in on the left, and it is still the only camera rotation the walking
// act has.
const GROUND_LEGS = [
  {
    // Final descent. The frame still holds no horizon here, so the cut cannot be seen.
    pace: "linear",
    points: [[CUT_LOCAL[0], LANDING_ALT, CUT_LOCAL[2]], [0, 6.6, -2.85], [0, 5.2, -2.65], [0, 4, -2.45]],
    look: [[0, -9.75, 7.84], [0, -7.46, 6.99], [0, -5.16, 6.04], [0, -3.35, 4.9]],
    fov: [66, 64],
  },
  {
    // Flare: decelerating from 4 m onto the surface, and the horizon comes up into the frame.
    pace: "ease",
    points: [[0, 4, -2.45], [0, 3.2, -2.25], [0, 2.4, -2.05], [0, 1.6, -1.85]],
    look: [[0, -3.35, 4.9], [0, -1.92, 4.31], [0, -0.91, 3.24], [0, -0.35, 1.82]],
    fov: [64, 60],
  },
  {
    // Contact. Six centimetres of rail against a quarter of the act, so the camera is parked while the
    // rumble runs, and the impact is the only motion there is - against ground, rocks and the horizon.
    pace: "linear",
    points: [[0, 1.6, -1.85], [0, 1.55, -1.83], [0, 1.5, -1.8]],
    look: [[0, -0.35, 1.82], [0, -0.22, 1.79], [0, -0.09, 1.76]],
    fov: [60, 60],
  },
  {
    // Up on the feet, and the head lifts to find the mare, the ridge and the hardware.
    pace: "ease",
    points: [[0, 1.5, -1.8], [0, 1.55, -1], [0.2, 1.65, -0.2], [0.3, EYE_Y, 0.6]],
    look: [[0, -0.09, 1.76], [0, 0.58, 2.91], [0, 1.35, 4.08], [0, 1.91, 5.02]],
    fov: [60, 57],
  },
  {
    pace: "linear",
    points: [[0.3, EYE_Y, 0.6], [0.7, EYE_Y, 6], [0.1, EYE_Y, 11], [0.9, EYE_Y, 17]],
    look: [[0, 1.91, 5.02], [0.5, 1.5, 14], [0.2, 1.55, 24], [1.2, 1.55, 29]],
    fov: [57, 57],
  },
  {
    pace: "ease",
    points: [[0.9, EYE_Y, 17], [2, EYE_Y, 23], [3.2, EYE_Y, 29]],
    look: [[1.2, 1.55, 29], [2.7, 1.6, 34], [3.9, 1.55, 39]],
    fov: [57, 57],
  },
];

// Prop sites in LOCAL metres, declared next to the rail that has to walk up to them. With no steering
// the rail is the only path there is, so the ending composition is asserted against these numbers in
// tools/check-journey.mjs - an edit here that leaves frame fails the suite instead of the phone.
export const LM_LOCAL = [5, 0, 44.5];
export const FLAG_LOCAL = [3.0, 0, 34.0];
export const PANEL_LOCAL = [-4.2, 0, 12];
// The crew member waiting by the LM. Chosen so he reads at the end of the walk rather than merely being
// in frame: 8 m out, between the flag and the LM in azimuth, in front of the descent stage the way the
// real photographs put an astronaut in front of it. tools/check-journey.mjs asserts all three subjects fit
// at once, which is not free - portrait is only 30.4 degrees wide at fov 57.
export const COMPANION_LOCAL = [3.5, 0, 37];
export const COMPANION_BOX = { half: 0.45, top: 1.95 };
export const MASTS_LOCAL = [[20, 62], [-16, 71]];

// The checks frame the subjects with a box marginally larger than the merged geometry in Props.jsx, so a
// prop that grows later is caught by the assertion rather than silently slipping out of frame.
export const LM_BOX = { half: 2.0, top: 4.0 };
export const FLAG_BOX = { half: 0.55, top: 2.4 };

const buildSpace = ({ id, from, to, near, far, legs, local }) => ({
  id,
  from,
  to,
  near,
  far,
  legs,
  local: !!local,
  rail: makeRail(legs.map((l) => ({ points: l.points }))),
});

export const SPACES = [
  buildSpace({ id: "solar", from: 0, to: SEAM_A, near: 0.05, far: 2000, legs: SOLAR_LEGS }),
  buildSpace({ id: "lunar", from: SEAM_A, to: SEAM_B, near: 0.05, far: 2000, legs: LUNAR_LEGS }),
  buildSpace({ id: "ground", from: SEAM_B, to: 1, near: 0.02, far: 4200, legs: GROUND_LEGS, local: true }),
];

export const spaceAt = (offset) => {
  for (let i = 0; i < SPACES.length; i++) if (offset <= SPACES[i].to) return SPACES[i];
  return SPACES[SPACES.length - 1];
};

const paceOf = (pace, s) => (pace === "ease" ? smoothstep(s, 0, 1) : s);

// A leg may carry any number of authored look targets / fov stops; they are walked by the same local u.
const lerpSet = (arr, u, out) => {
  const t2 = clamp01(u) * (arr.length - 1);
  const i0 = Math.min(arr.length - 2, Math.floor(t2));
  return out.fromArray(arr[i0]).lerp(_c.fromArray(arr[i0 + 1]), t2 - i0);
};
const _c = new Vector3();
const lerpSetFov = (arr, u) => {
  const t2 = clamp01(u) * (arr.length - 1);
  const i0 = Math.min(arr.length - 2, Math.floor(t2));
  return arr[i0] + (arr[i0 + 1] - arr[i0]) * (t2 - i0);
};
const _a = new Vector3();

export const poseAt = (offset, out) => {
  const space = spaceAt(offset);
  const n = space.rail.curves.length;
  const t = range01(offset, space.from, space.to) * n;
  const i = Math.min(n - 1, Math.floor(t));
  const leg = space.legs[i];
  const u = paceOf(leg.pace, clamp01(t - i));
  const w = space.rail.windows[i];
  sampleRail(space.rail, (w.a + u * (w.b - w.a)) / space.rail.total, out.sample);
  out.local.copy(out.sample.position);
  out.tangent.copy(out.sample.tangent);
  lerpSet(leg.look, u, out.target);
  out.fov = leg.fov.length === 2 ? leg.fov[0] + (leg.fov[1] - leg.fov[0]) * u : lerpSetFov(leg.fov, u);
  out.leg = i;
  out.space = space;
  if (space.local) {
    out.position.copy(out.local).applyQuaternion(SITE.quaternion).add(SITE.pos);
    out.target.applyQuaternion(SITE.quaternion).add(SITE.pos);
    out.tangent.applyQuaternion(SITE.quaternion);
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
});

// Metres actually walked, taken off the rail rather than off the offset: the touchdown leg advances a
// quarter of the act against two tenths of a metre, and footprints and the gait phase have to know that.
export const walkDistance = (offset) => {
  const space = SPACES[2];
  const n = space.rail.curves.length;
  const t = range01(offset, space.from, space.to) * n;
  const i = Math.min(n - 1, Math.floor(t));
  const u = paceOf(space.legs[i].pace, clamp01(t - i));
  const w = space.rail.windows[i];
  return w.a + u * (w.b - w.a);
};

// Metres per unit of offset, so the gait bob can be driven by the speed the camera is really going rather
// than by an average that assumes the rail moves uniformly. Central difference: still a pure function.
export const walkRate = (offset, eps = 1.5e-3) => (walkDistance(offset + eps) - walkDistance(offset - eps)) / (2 * eps);
