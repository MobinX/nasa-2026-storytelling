import { Vector3, MathUtils } from "three";
import { makeRail, sampleRail, scratchSample } from "./rail.js";
import { MOON_DOT_POS, MOON_SPHERE_U } from "../lib/bodies.js";
import { siteFrame, uvFromDirection } from "../lib/terrain.js";
import { SEAM_A, SEAM_B, clamp01, range01, smoothstep, smootherstep } from "./timeline.js";

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

// The dot/sphere swap is invisible because both sides of it fill the frame with regolith: the 0.13u dot
// at 0.25u subtends 63deg, and the 12u sphere seen from 12.5u covers everything.
const surf = (alt, along) => SITE.pos.clone().addScaledVector(SITE.n, alt).addScaledVector(SITE.fwd, along);
const EYE_Y = 1.7;
export const CUT_LOCAL = [0, 0.35, -15.4];
const CUT = CUT_LOCAL;
const CUT_LOOK = [0, -3.95, -12.4];

const LUNAR_LEGS = [
  {
    pace: "ease",
    points: [localAt(...CUT).toArray(), surf(1.6, -11).toArray(), surf(6, -6).toArray(), surf(15, 4).toArray()],
    look: [localAt(...CUT_LOOK).toArray(), [0, 0, 0], [0, 0, 0], [0, 0, 0]],
    fov: [34, 52],
  },
  {
    pace: "ease",
    points: [surf(15, 4).toArray(), [SITE.n.x * 27 + SITE.fwd.x * 18, 12, SITE.n.z * 27 + SITE.fwd.z * 18], [30, 16, 26]],
    look: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    fov: [52, 56],
  },
  {
    pace: "linear",
    points: [[30, 16, 26], [4, 20, 33], [-25, 13, 8], [-16, 9.5, -24], [7, 7.5, -27], surf(3.4, -24).toArray()],
    look: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], localAt(0, -1.2, -19).toArray()],
    fov: [56, 62],
  },
  {
    pace: "beat",
    points: [surf(3.4, -24).toArray(), localAt(0, 1.6, -20).toArray(), localAt(0, 0.7, -17.4).toArray(), localAt(...CUT).toArray()],
    look: [localAt(0, -1.2, -19).toArray(), localAt(0, -2.4, -16).toArray(), localAt(0, -3.4, -14).toArray(), localAt(...CUT_LOOK).toArray()],
    fov: [62, 66],
  },
];

// Ground space: authored in LOCAL metres on the tangent plane, mapped to world by the site frame. The
// first point and its look target are shared with the lunar descent above, so nothing has to be matched
// after the fact.
const GROUND_LEGS = [
  {
    pace: "ease",
    points: [CUT, [0, 0.7, -12], [0, 1.25, -7], [0, EYE_Y, -1]],
    look: [CUT_LOOK, [0, -0.9, -9], [0, 0.2, -6], [0, 1.2, 4]],
    fov: [66, 57],
  },
  {
    pace: "linear",
    points: [[0, EYE_Y, -1], [0.6, EYE_Y, 6], [-0.4, EYE_Y, 13], [0.3, EYE_Y, 20], [0, EYE_Y, 27]],
    look: [[0, 1.2, 4], [0.9, 1.3, 12], [-0.3, 1.4, 20], [0.4, 1.5, 27], [0, 1.6, 35]],
    fov: [57, 57],
  },
];

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

const paceOf = (pace, s) => (pace === "beat" ? smootherstep(s, 0, 1) : pace === "ease" ? smoothstep(s, 0, 1) : s);

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

export const walkDistance = (offset) => (range01(offset, SEAM_B, 1) * SPACES[2].rail.total);
