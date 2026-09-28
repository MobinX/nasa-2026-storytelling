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

// The rule every ground stop obeys, authored as two angles because angles are what the frame is made of.
// The object sits three degrees off the walking line - nearly dead ahead, since the visitor is meant to be
// looking at it - and the crew member stands on the other side at five, so neither hides the other and both
// stay inside a portrait frame, whose horizontal half-angle is only about fifteen degrees at 9:19.5.
//
// This used to be authored in metres, and it failed on the tall things: a fixed 1.15 m offset is 13 degrees
// at five metres and five at thirteen, so walking further from a machine to fit it in frame pushed its crew
// member clean out of the picture. Derived from the standoff instead, the separation is the same whatever
// the scale of the object, and tools/check-journey.mjs measures it for all ten stops.
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

// `top` is the model's own height, which the checker draws a box around; the camera centres on `aim`, a
// little under two thirds of the way up, so a 5.9 m ascent vehicle is framed rather than stared at through
// its roof.
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
    aim,
    leg: holdLegOf(i, planet),
    walkLeg: walkLegOf(i, planet),
  };
};

// One screen of scroll per leg, so the spacing between stops is the length of the walk the visitor feels
// between two conversations. The last stop of each world is the tall hardware the landing leaves behind:
// the LM on the Moon, the ascent vehicle at Jezero.
const ROUTE = {
  moon: [
    { id: "moon-solar-wind", cam: [0.6, 1.7, 11], side: 1, stand: 8.5, top: 1.5 },
    { id: "moon-seismometer", cam: [0.2, 1.7, 22], side: -1, stand: 8.5, top: 0.76 },
    { id: "moon-retroreflector", cam: [1.4, 1.7, 34], side: 1, stand: 9, top: 0.65 },
    { id: "moon-eagle", cam: [3.2, 1.7, 46], side: -1, stand: 13, top: 3.65 },
  ],
  mars: [
    { id: "mars-rover", cam: [0.6, 1.7, 11], side: 1, stand: 10, top: 2.07 },
    { id: "mars-airfield", cam: [0.2, 1.7, 22], side: -1, stand: 8.5, top: 0.67 },
    { id: "mars-depot", cam: [1.4, 1.7, 34], side: 1, stand: 9.5, top: 1.1 },
    { id: "mars-ares", cam: [3.2, 1.7, 46], side: -1, stand: 14, top: 5.9 },
  ],
  // The two deep-space stops are metres in the EVA frame, and authored: there is no walking line to take an
  // angle from when the camera drifts, and a thing on a tether hangs above or below you as often as ahead.
  solar: [
    { id: "solar-l2-observatory", cam: [0, 0, 0], obj: [0.9, -0.5, 22], crew: [-1.2, 0.9, 15], top: 4.15 },
    { id: "solar-sun-probe", cam: [0, 0, 30], obj: [-1.6, 0.8, 52], crew: [1.5, -0.6, 44], top: 2.55 },
  ],
};

export const ROUTE_IDS = { moon: ROUTE.moon.map((s) => s.id), mars: ROUTE.mars.map((s) => s.id), solar: ROUTE.solar.map((s) => s.id) };

export const STOPS = {
  moon: ROUTE.moon.map((r, i) => toStop("moon", r, i)),
  mars: ROUTE.mars.map((r, i) => toStop("mars", r, i)),
  solar: ROUTE.solar.map((r, i) => toStop("solar", r, i)),
};

export const legsForPlanet = (planet) => legsFor(STOPS[planet].length, planet);
