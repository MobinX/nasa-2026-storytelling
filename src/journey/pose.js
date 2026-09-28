// The camera path: one pure function of the scroll offset, over seven spaces and six scene graphs.
//
// Every rail here is authored data; the maths lives in rail.js and timeline.js. Three of the seven spaces
// are flights - down onto the Moon, down onto Mars, and out past both - and the Martian descent is the lunar
// one multiplied by the radius ratio, because limb coverage is scale-invariant (see worlds.js). The walks
// are authored in each site's own local metres.
import { Vector3 } from "three";
import { makeRail, sampleRail, scratchSample } from "./rail.js";
import { MOON_DOT_POS } from "../lib/bodies.js";
import { MOON, MARS, EVA, R_MARS, R_MOON, MARS_CENTRE, EVA_ORIGIN, localAt, localDir, MOON_SUN } from "./worlds.js";
import { SEAM_A, SEAM_B, DEPART, TRANSFER_END, MARS_SEAM, MARS_DEPART, smoothstep } from "./timeline.js";
import { STOPS } from "./stops.js";

export const SUN_DIR = MOON_SUN;
const EARTH_DIR = localDir(MOON, 0.3, 0.574, 0.76);
export const EARTH_AT = EARTH_DIR.clone().multiplyScalar(120);
export const EARTH_R = 2.0;
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

// A surface act, generated from the walk schedule: four legs down and up on the feet, then a walking leg
// and a hold leg per object, then off the pad. The approach is authored (a landing is tuned by eye and
// there is nothing in a stop list to generate it from); the route is not, because every stop has to end up
// exactly where the checker measures it and exactly where the model and the crew member are drawn.
//
// Each hold leg is two centimetres of rail against a screen of scroll, which is the whole mechanism: the
// picture stops, the scroll stops with it, and a man talks to you about the thing in front of you.
const APPROACH = (world) => [
  {
    pace: "linear",
    points: [[0, world.landingAlt, -3], [0, 6.6, -2.85], [0, 5.2, -2.65], [0, 4, -2.45]],
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
    // Contact: the camera is parked, so the rumble is the only motion there is - against ground, rocks and
    // a horizon, which is why the landing is flown from eight metres and not from 0.42u above a sphere.
    pace: "linear",
    points: [[0, 1.7, -1.85], [0, 1.65, -1.83], [0, 1.6, -1.8]],
    look: [[0, -0.3, 1.9], [0, -0.18, 1.88], [0, -0.05, 1.86]],
    fov: [60, 60],
  },
  {
    pace: "ease",
    points: [[0, 1.6, -1.8], [0.05, 1.5, -1], [0.2, EYE_Y, -0.2], [0.3, EYE_Y, 0.6]],
    look: [[0, -0.05, 1.86], [0, 0.7, 3.2], [0, 1.45, 4.6], [0, 2.0, 5.6]],
    fov: [60, 57],
  },
];

const aimOf = (stop) => [stop.obj[0], stop.aim, stop.obj[2]];
const midOf = (a, b, k = 0.5) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

const surfaceLegs = (planet, world) => {
  const legs = APPROACH(world);
  const stand = legs[legs.length - 1];
  let cam = stand.points[stand.points.length - 1];
  let look = stand.look[stand.look.length - 1];
  for (const stop of STOPS[planet]) {
    const aim = aimOf(stop);
    legs.push({
      pace: "linear",
      points: [cam, midOf(cam, stop.cam, 0.55).map((v, i) => (i === 0 ? v + 0.45 : v)), stop.cam],
      look: [look, midOf(look, aim, 0.45), aim],
      fov: [57, 57],
    });
    // The hold leg is two centimetres forward of the arrival, never back toward the previous stop: an
    // earlier version took `cam` from the enclosing step and slid the camera 7 m backwards while a man was
    // talking. The rail is monotone in z along the walk, and tools/check-journey.mjs holds it to that.
    const parked = [stop.cam[0], stop.cam[1], stop.cam[2] + 0.06];
    legs.push({
      pace: "linear",
      points: [stop.cam, [stop.cam[0], stop.cam[1], stop.cam[2] + 0.03], parked],
      look: [aim, [aim[0] + 0.04, aim[1] + 0.03, aim[2]], [aim[0] + 0.09, aim[1] + 0.06, aim[2] + 0.05]],
      fov: [57, 55],
    });
    cam = parked;
    look = [aim[0] + 0.09, aim[1] + 0.06, aim[2] + 0.05];
  }
  // Off the pad: up and back over the landing site, the nose dropping until the frame is regolith again -
  // the hand-off pose, which is the ascent's destination rather than anywhere near the last object.
  legs.push({
    pace: "ease",
    points: [cam, midOf(cam, [1.6, 2.6, 26]), midOf([1.6, 2.6, 26], [0, world.landingAlt, -3], 0.45), [0, world.landingAlt, -3]],
    look: [look, midOf(look, [1.5, -0.4, 30], 0.5), midOf([1.5, -0.4, 30], HANDOVER_LOOK, 0.5), HANDOVER_LOOK],
    fov: [55, 66],
  });
  return legs;
};

const MOON_GROUND_LEGS = surfaceLegs("moon", MOON);
const MARS_GROUND_LEGS = surfaceLegs("mars", MARS);

// Out of Mars and among the machines. Two legs climb away from Jezero - the hand-off pose again, so the
// cut is invisible - and turn the camera until Mars is a disc behind and the first observatory is a
// handrail ahead; then a drift and a hold per machine, with no gait, because nobody walks on a tether.
const evaWorldAt = (p) => localAt(EVA, p[0], p[1], p[2]).toArray();
const _marsHandOff = marsLocal(MARS.cut);
const _marsHandLook = marsLocal(MARS.cutLook);
const _evaIn = mix(_marsHandOff, EVA_ORIGIN.toArray(), 0.55);
const _evaTurn = mix(_marsHandOff, EVA_ORIGIN.toArray(), 0.9);

const EVA_ACT_LEGS = [
  {
    pace: "linear",
    points: [_marsHandOff, marsLocal([0, 0.9, -3.6]), marsLocal([0, 1.7, -4.4]), mix(_marsHandOff, _evaIn, 0.5)],
    look: [_marsHandLook, marsLocal([0, 0.2, 1.5]), marsLocal([0.4, 2.2, 7]), mix(_marsHandLook, localAt(EVA, ...aimOf(STOPS.solar[0])).toArray(), 0.25)],
    fov: [66, 54],
  },
  {
    pace: "linear",
    points: [mix(_marsHandOff, _evaIn, 0.5), _evaIn, mix(_evaIn, _evaTurn, 0.6), _evaTurn],
    look: [
      mix(_marsHandLook, localAt(EVA, ...aimOf(STOPS.solar[0])).toArray(), 0.25),
      mix(_marsHandLook, localAt(EVA, ...aimOf(STOPS.solar[0])).toArray(), 0.7),
      localAt(EVA, ...aimOf(STOPS.solar[0])).toArray(),
      localAt(EVA, ...aimOf(STOPS.solar[0])).toArray(),
    ],
    fov: [54, 50],
  },
];
for (const [i, stop] of STOPS.solar.entries()) {
  const aim = localAt(EVA, ...aimOf(stop)).toArray();
  const cam = evaWorldAt(stop.cam);
  const parked = evaWorldAt([stop.cam[0], stop.cam[1], stop.cam[2] + 0.4]);
  const prev = i === 0 ? _evaTurn : evaWorldAt([STOPS.solar[i - 1].cam[0], STOPS.solar[i - 1].cam[1], STOPS.solar[i - 1].cam[2] + 0.4]);
  const prevAim = i === 0 ? localAt(EVA, ...aimOf(STOPS.solar[0])).toArray() : localAt(EVA, ...aimOf(STOPS.solar[i - 1])).toArray();
  EVA_ACT_LEGS.push({
    pace: "linear",
    points: [prev, mix(prev, cam, 0.55), cam],
    look: [prevAim, mix(prevAim, aim, 0.5), aim],
    fov: [50, 52],
  });
  EVA_ACT_LEGS.push({
    pace: "linear",
    points: [cam, mix(cam, parked, 0.5), parked],
    look: [aim, mix(aim, [aim[0] + 0.3, aim[1] + 0.2, aim[2]], 0.5), mix(aim, [aim[0] + 0.6, aim[1] + 0.35, aim[2] + 0.2], 1)],
    fov: [52, 50],
  });
}

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
  buildSpace({ id: "marsGround", graph: MARS.graph, from: MARS_SEAM, to: MARS_DEPART, near: 0.02, far: 4200, legs: MARS_GROUND_LEGS, local: true, world: MARS }),
  buildSpace({ id: "eva", graph: EVA.graph, from: MARS_DEPART, to: 1, near: 0.02, far: 2000, legs: EVA_ACT_LEGS, world: EVA }),
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

// Looked up by id rather than by index: a fourth surface act would insert itself anywhere in the list and
// every module that names one of these spaces would keep working.
const byId = (id) => SPACES.find((s) => s.id === id);
export const MOON_GROUND = byId("ground");
export const MARS_GROUND = byId("marsGround");
export const EVA_SPACE = byId("eva");
export const legStartOf = (space, i) => space.from + (i / space.legs.length) * (space.to - space.from);
