// Where the visitor stops on the way across each world, and what happens there.
//
// A surface act is one leg per screen of scroll: down, settle, contact, stand up, then for every object a
// walking leg and a hold leg, then off the pad. The hold leg is the conversation - two centimetres of rail
// so the picture does not move while someone is talking - and it is also where the scroll is trapped until
// the visitor has answered.
//
// This module owns the ROUTE only: where the camera parks, where the thing stands, where its crew member
// stands, and which leg all of that belongs to. What is said and what model is drawn come from
// objects.json, applied to these same objects by data/objects.js before anything renders - the geometry is
// authored here so the camera path stays a build-time thing, and the ids are asserted to match rather than
// hoped at.
//
// The numbers are authored in local metres on the site: the checker measures the framing at every stop with
// them, so "the camera can stop here" and "you can see it from here" cannot drift apart.
const APPROACH_LEGS = 4;   // down, settle, contact, stand up
const ESCAPE_LEGS = 2;     // the EVA act's two: climb out of Mars orbit, turn to the first machine
const PAD_LEG = 1;         // the ascent, after the last conversation
const firstLegOf = (planet) => (planet === "solar" ? ESCAPE_LEGS : APPROACH_LEGS);
const holdLegOf = (i, planet = "moon") => firstLegOf(planet) + i * 2 + 1;
const walkLegOf = (i, planet = "moon") => firstLegOf(planet) + i * 2;
const legsFor = (n, planet = "moon") => firstLegOf(planet) + n * 2 + (planet === "solar" ? 0 : PAD_LEG);

// How a stop is placed, which is the whole shape of the piece: the machine stands at a BEARING off the
// walking line, at a STANDOFF, and the camera turns to it. Authoring it as "three degrees off the line of
// travel" - which is what this used to be - put all ten vehicles in a row down the middle of a straight
// corridor, and worse, it put them *in the path*: the way out of one conversation walked straight through
// the machine that conversation had just been about. Anything at 25 degrees or more is beside the route
// rather than on it, which is what scattering means, and the arrival then turns through that same angle -
// which is the head turn the walking leg is authored to make visible.
const TAN = Math.PI / 180;
const placed = (r) => {
  if (r.obj) return r; // the two EVA stops are authored outright - nothing is planted, so nothing is a bearing
  const a = (r.bear ?? 0) * TAN;
  return { ...r, obj: [r.cam[0] + Math.sin(a) * r.stand, r.y ?? 0, r.cam[2] + Math.cos(a) * r.stand] };
};

// The crew member stands beside his machine rather than in front of it: far enough off the line of sight to
// clear the footprint, near enough to stay inside a portrait frame, which at 9:19.5 is only about fifteen
// degrees wide. Both are measured from the sight line, because after a 40-degree turn that and the walking
// line are no longer the same thing.
const spread = (r) => {
  if (r.crew) return r;
  const dx = r.obj[0] - r.cam[0], dz = r.obj[2] - r.cam[2];
  const range = Math.hypot(dx, dz);
  const near = range * (r.near ?? 0.78);
  // Ten and a half degrees is as far across the frame as a man can be put and stay in it, so for anything
  // wider than that he stands in front of the machine and to one side - which is where a person waiting by
  // a lunar module actually is, and what the frame can hold.
  const edge = 13 - Math.atan(0.45 / near) / TAN; // as far across a portrait frame as a man and his own
  // shoulders can be put and still be in shot - which at six metres is tighter than at fifteen.
  const want = Math.min(edge, Math.max(6, Math.asin(Math.min(0.72, (r.half + 0.8) / near)) / TAN)) * (r.side ?? 1);
  const a = Math.atan2(dx, dz) + want * TAN;
  return { ...r, crew: [r.cam[0] + Math.sin(a) * near, r.obj[1], r.cam[2] + Math.cos(a) * near] };
};

// `top`, `half` and `deep` are the shipped model's own bounding box - height, and half its extent across and
// along the line of sight, measured after the yaw it is parked at - taken from the file rather than
// remembered, because the checker frames every stop against them: a vehicle that grows is then a failing
// build rather than a clipped footpad. `stand` follows from the widest of those numbers plus the clearance
// it needs off the path, so a 6.4 m lander is looked at from further away than a 1.3 m rover, and neither
// fills the frame nor is walked through.
const toStop = (planet, raw, i) => {
  const r = spread(placed(raw));
  const aim = r.obj[1] + r.top * 0.6;
  return {
    planet,
    index: i,
    id: r.id,
    name: r.id,
    location: "",
    model: null,
    convo: null,
    cam: r.cam,
    obj: r.obj,
    crew: r.crew,
    top: r.top,
    half: r.half,
    deep: r.deep ?? r.half,
    yaw: r.objYaw ?? 0,
    aim,
    leg: holdLegOf(i, planet),
    walkLeg: walkLegOf(i, planet),
  };
};

// One screen of scroll per leg. The cameras step steadily outward while the hardware stands alternately to
// one side and then the other, so the route reads as a traverse of a site rather than a queue at it. The
// four machines on each world are four different machines in four different places: a descent stage at
// Tranquility, the rover parked at its VIP site at Hadley, Surveyor 3 in its shallow crater, the ALSEP out
// at Descartes. `top`, `half` and `deep` are the shipped model's own extents at the `objYaw` it is parked at,
// computed from the file - (X/2)|cos yaw| + (Z/2)|sin yaw| across, the same two terms swapped along - so the
// frame the checker measures against is the box the browser actually draws.
const ROUTE = {
  moon: [
    { id: "moon-eagle", cam: [0.6, 1.7, 12], bear: 38, stand: 19, top: 4.99, half: 3.25, side: 1, objYaw: -0.5 },
    { id: "moon-lrv", cam: [-0.4, 1.7, 36], bear: -47, stand: 12, top: 1.72, half: 1.81, deep: 1.71, side: 1, objYaw: 0.9 },
    { id: "moon-surveyor3", cam: [0.8, 1.7, 60], bear: 33, stand: 14.5, top: 3.1, half: 2.55, deep: 2.42, side: 1, objYaw: 0.4 },
    { id: "moon-alsep", cam: [-1.2, 1.7, 86], bear: -41, stand: 12.5, top: 1.85, half: 2.09, deep: 2.12, side: 1, objYaw: 0.5 },
  ],
  mars: [
    { id: "mars-sojourner", cam: [0.6, 1.7, 12], bear: -34, stand: 17, top: 2.01, half: 2.68, deep: 2.69, side: -1, objYaw: 2.4 },
    { id: "mars-opportunity", cam: [-0.4, 1.7, 24], bear: 36, stand: 8, top: 1.31, half: 1.3, deep: 1.4, side: 1, objYaw: 2.6 },
    { id: "mars-insight", cam: [0.8, 1.7, 40], bear: -44, stand: 16.5, top: 1.56, half: 3.25, deep: 1.85, side: -1, objYaw: 0.15 },
    { id: "mars-viking1", cam: [-1.2, 1.7, 62], bear: 37, stand: 11.5, top: 1.61, half: 1.85, deep: 1.9, side: 1, objYaw: -0.9 },
  ],
  // The two deep-space stops are metres in the EVA frame and authored outright: nothing is planted, the
  // camera arrives on a drift rather than a walking line, and a spacecraft on a tether hangs above or below
  // the visitor as often as beside them. The bearings are therefore measured off the drift - MGS is reached
  // by coming up on it from one side rather than dead ahead, which is what a rendezvous approach is.
  solar: [
    { id: "solar-mgs", cam: [0, 0, 0], obj: [18.7, -2.4, 18], crew: [8.8, 1.0, 12.1], top: 5.15, half: 5.35, deep: 2.05, objYaw: 1.35 },
    { id: "solar-pioneer10", cam: [0, 0, 36], obj: [-1.2, -1.6, 58], crew: [1.1, 0.9, 47], top: 8.25, half: 2.6, deep: 2.25, objYaw: 0.5 },
  ],
};

export const ROUTE_IDS = { moon: ROUTE.moon.map((s) => s.id), mars: ROUTE.mars.map((s) => s.id), solar: ROUTE.solar.map((s) => s.id) };

export const STOPS = {
  moon: ROUTE.moon.map((r, i) => toStop("moon", r, i)),
  mars: ROUTE.mars.map((r, i) => toStop("mars", r, i)),
  solar: ROUTE.solar.map((r, i) => toStop("solar", r, i)),
};

export const legsForPlanet = (planet) => legsFor(STOPS[planet].length, planet);
