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

const extraLeg = (space) => (space.to - space.from) / space.legs.length;
const endOfWalk = (space, stops) => stops.at(-1).lock + extraLeg(space) * 0.6;

export const GROUND_CORRIDOR = corridorOf(MOON_GROUND, endOfWalk(MOON_GROUND, SURFACE_STOPS.moon));
export const MARS_CORRIDOR = corridorOf(MARS_GROUND, endOfWalk(MARS_GROUND, SURFACE_STOPS.mars));
export const CORRIDOR_BY_WORLD = { moon: GROUND_CORRIDOR, mars: MARS_CORRIDOR };
