import { walkDistance, MOON_GROUND, MARS_GROUND } from "./pose.js";
import { sampleRail, scratchSample } from "./rail.js";
import { SURFACE_STOPS } from "./timeline.js";

// Every local [x,z] the ground camera will occupy, at ~0.5 m. The walk used to be one of many paths the
// player could take, so the crater field and the rock scatter only had to be plausible on average; with
// no steering this polyline is the path, and both have to be generated against it rather than against a
// bounding box that was never the same shape.
//
// Each world gets its own, and it stops at the last conversation rather than at the end of the act: the
// ascent retraces the route on purpose, and a polyline that crosses itself makes the rock-clearance test
// meaningless - every rock would be "on the path" twice, in two different places.
const corridorOf = (space, until) => {
  const rail = space.rail;
  const s = scratchSample();
  const arc = walkDistance(space, until);
  const n = Math.max(2, Math.ceil(arc / 0.5));
  const out = [];
  for (let i = 0; i <= n; i++) {
    sampleRail(rail, (i / n) * (arc / rail.total), s);
    out.push([s.position.x, s.position.z]);
  }
  return out;
};

// The ground a stop looks across and the ground a vehicle stands on belong to the *levelling* band, not to
// the path: the height field is levelled along it, so a 6.4 m lander parked 17 m down the line of sight is
// no longer free to sit on a swell that grazes the bottom corner of itself. The craters and the rock scatter
// stay clamped to the path alone, because a boulder has to miss the walk, not the view, and pushing rocks
// away from a band with lateral runs in it makes them land on the other side of it.
const stopGround = (stops) =>
  stops.flatMap((stop) => {
    const out = [];
    const dx = stop.obj[0] - stop.cam[0], dz = stop.obj[2] - stop.cam[2];
    const steps = Math.max(2, Math.ceil(Math.hypot(dx, dz) / 0.5));
    for (let i = 0; i <= steps; i++) out.push([stop.cam[0] + (dx * i) / steps, stop.cam[2] + (dz * i) / steps]);
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 0, 1]) out.push([stop.obj[0] + sx * stop.half, stop.obj[2] + sz * stop.half]);
    return out;
  });

const extraLeg = (space) => (space.to - space.from) / space.legs.length;
const endOfWalk = (space, stops) => stops.at(-1).lock + extraLeg(space) * 0.6;

// Sorted by z, because a polyline is only ever as good as its segments: concatenating the pads onto the end
// of the route would join the last rail point to the first pad point, hundreds of metres away, and the rock
// clearance is measured against the line between consecutive points.
const rail = (space, stops) => corridorOf(space, endOfWalk(space, stops));

export const GROUND_CORRIDOR = rail(MOON_GROUND, SURFACE_STOPS.moon);
export const MARS_CORRIDOR = rail(MARS_GROUND, SURFACE_STOPS.mars);
export const CORRIDOR_BY_WORLD = { moon: GROUND_CORRIDOR, mars: MARS_CORRIDOR };

// Sorted by z: a polyline is only as good as its segments, and concatenating the pads onto the end of the
// route would join the last rail point to a pad point hundreds of metres away.
export const LEVEL_BAND_BY_WORLD = {
  moon: GROUND_CORRIDOR.concat(stopGround(SURFACE_STOPS.moon)).sort((a, b) => a[1] - b[1]),
  mars: MARS_CORRIDOR.concat(stopGround(SURFACE_STOPS.mars)).sort((a, b) => a[1] - b[1]),
};
