import { SPACES } from "./pose.js";
import { sampleRail, scratchSample } from "./rail.js";

// Every local [x,z] the ground camera will occupy, at ~0.5 m. The walk used to be one of many paths the
// player could take, so the crater field and the rock scatter only had to be plausible on average; with
// no steering this polyline is the path, and both have to be generated against it rather than against a
// bounding box that was never the same shape.
//
// Kept out of pose.js on purpose: pose.js imports lib/terrain.js for the site frame, and terrain takes
// this as an argument, so importing it back would close the cycle.
export const GROUND_CORRIDOR = (() => {
  const rail = SPACES[2].rail;
  const s = scratchSample();
  const n = Math.max(2, Math.ceil(rail.total / 0.5));
  const out = [];
  for (let i = 0; i <= n; i++) {
    sampleRail(rail, i / n, s);
    out.push([s.position.x, s.position.z]);
  }
  return out;
})();
