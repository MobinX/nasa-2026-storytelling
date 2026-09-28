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

// The rule every ground stop obeys, authored as two angles off the walking line rather than metres, because
// angles are what the frame is made of: the object sits three degrees to one side - nearly dead ahead, since
// the visitor is meant to be looking at it - and the crew member five degrees to the other. A portrait phone
// frame is only about 15 degrees wide, so a fixed lateral offset that keeps a man beside a seismometer puts
// him clean out of picture at a lunar module. Derived from the standoff instead, the separation is the same
// whatever the scale of the vehicle.
const TAN = Math.PI / 180;
const AHEAD = 3;
const ASIDE = 5;
const spread = (r) => {
  if (r.obj && r.crew) return r;
  const s = r.side ?? 1;
  const stand = r.stand ?? 9;
  const near = stand * 0.78;
  return {
    ...r,
    obj: [r.cam[0] + s * stand * AHEAD * TAN, 0, r.cam[2] + stand],
    crew: [r.cam[0] - s * near * ASIDE * TAN, 0, r.cam[2] + near],
  };
};

// `top`, `half` and `deep` are the shipped model's own bounding box - height, half its width across the
  // line of sight and half its extent along it, both measured after the yaw the vehicle is parked at -
// taken from the file rather than remembered, because the checker frames every stop against them: a
// vehicle that grows is then a failing build instead of a clipped footpad. `stand` is what the widest of
// those two numbers forces: at twelve degrees off the walking line, a 6.4 m lunar module wants to be seen
// from seventeen metres, and a 1.3 m rover from seven.
const toStop = (planet, raw, i) => {
  const r = spread(raw);
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

// One screen of scroll per leg. The spacing between cameras is not free: it has to be longer than the
// standoff plus the footprint, or the walk parks the visitor underneath the previous stop's hardware - which
// is what a 6.4 m lander with 17 m of standoff does to an 11 m route. The standoffs and the camera line
// together are what tools/check-journey.mjs calls footprint clearance, per stop, against every other stop.
const ROUTE = {
  moon: [
    { id: "moon-eagle", cam: [0.6, 1.7, 12], side: 1, stand: 17, top: 4.99, half: 3.25, objYaw: -0.5 },
    { id: "moon-intrepid", cam: [-0.4, 1.7, 36], side: -1, stand: 17, top: 4.99, half: 3.25, objYaw: 0.7 },
    { id: "moon-surveyor3", cam: [0.8, 1.7, 60], side: 1, stand: 13, top: 3.1, half: 2.55, deep: 2.4, objYaw: 0.4 },
    { id: "moon-falcon", cam: [-1.2, 1.7, 79], side: -1, stand: 17, top: 4.99, half: 3.25, objYaw: 2.4 },
  ],
  mars: [
    { id: "mars-spirit", cam: [0.6, 1.7, 12], side: 1, stand: 7, top: 1.31, half: 1.4, deep: 1.25, objYaw: 1.1 },
    { id: "mars-opportunity", cam: [-0.4, 1.7, 24], side: -1, stand: 7, top: 1.31, half: 1.3, deep: 1.4, objYaw: 2.6 },
    { id: "mars-insight", cam: [0.8, 1.7, 36], side: 1, stand: 16, top: 1.56, half: 3.25, deep: 1.85, objYaw: 0.15 },
    { id: "mars-viking1", cam: [-1.2, 1.7, 60], side: -1, stand: 9.5, top: 1.61, half: 1.85, deep: 1.9, objYaw: -0.9 },
  ],
  // The two deep-space stops are metres in the EVA frame and authored outright: there is no walking line to
  // take an angle from when the camera drifts, nothing is planted on anything, and a spacecraft on a tether
  // hangs above or below the visitor as often as ahead of it.
  solar: [
    { id: "solar-mgs", cam: [0, 0, 0], obj: [1.4, -2.4, 26], crew: [-1.0, 1.3, 12], top: 5.15, half: 5.35, deep: 2.05, objYaw: 1.35 },
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
