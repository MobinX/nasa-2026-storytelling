import { SPACES, walkDistance } from "./pose.js";
import { sampleRail, scratchSample } from "./rail.js";
import { MOON_TALK_START, MOON_LEGS, DEPART } from "./timeline.js";

// Every local [x,z] a ground camera will occupy, at ~0.5 m. The walk used to be one of many paths the
// player could take, so the crater field and the rock scatter only had to be plausible on average; with
// no steering this polyline is the path, and both have to be generated against it rather than against a
// bounding box that was never the same shape. Each world needs its own: the two rails are 60 m and 30 m
// apart in shape, and the fields are generated from these points at boot.
//
// Kept out of pose.js on purpose: pose.js imports lib/terrain.js for the site frame, and terrain takes
// this as an argument, so importing it back would close the cycle.
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

// The lunar corridor ends one leg past the conversation hold; the Martian one runs to the end of the rail.
const MOON_UNTIL = MOON_TALK_START + (DEPART - SPACES[2].from) / MOON_LEGS;
export const GROUND_CORRIDOR = corridorOf(SPACES[2], MOON_UNTIL);
export const MARS_CORRIDOR = corridorOf(SPACES[5], 1);
export const CORRIDOR_BY_WORLD = { moon: GROUND_CORRIDOR, mars: MARS_CORRIDOR };
