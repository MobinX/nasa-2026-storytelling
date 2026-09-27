import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { heightAt } from "./terrain.js";
import { clampToCorridor } from "./path-clearance.js";

function seedRandom(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export const ROCK_N = 220;
export const ROCK_SEED = 7717;
export const ROCK_CLEARANCE = 1.2;

// Deterministic scatter lifted out of MoonSurface so the checks can run the same generator the scene
// does. The rng draw order per rock is load-bearing: nine draws, in this exact sequence, so changing one
// band moves only that band's rocks.
//
// A rock that lands on the walk path is clamped radially outward rather than deleted. Removing it would
// hollow out a rock-free swale along the route, and zeroing the slot would leave an identity matrix that
// draws a 1 m icosahedron dead centre at the landing site - which the instance-capacity audit cannot
// catch, because capacity stays at 220 either way.
export function scatterRocks(mesh, heights, corridor, { count = ROCK_N, seed = ROCK_SEED, clearance = ROCK_CLEARANCE } = {}) {
  const r = seedRandom(seed);
  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const p = new Vector3();
  const s = new Vector3();
  for (let i = 0; i < count; i++) {
    const band = i < 120 ? [8, 30] : i < 200 ? [30, 110] : [110, 235];
    const d = band[0] + r() * (band[1] - band[0]);
    const a = r() * Math.PI * 2;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const size = d < 30 ? 0.05 + r() * 0.2 : d < 110 ? 0.2 + r() * 0.6 : 1 + r() * 2.2;
    const [cx, cz] = corridor ? clampToCorridor(x, z, corridor, clearance) : [x, z];
    p.set(cx, heightAt(heights, cx, cz) + size * 0.32, cz);
    e.set(r() * 3.1, r() * 3.1, r() * 3.1);
    s.set(size * (0.7 + r() * 0.6), size * (0.45 + r() * 0.4), size * (0.7 + r() * 0.6));
    mesh.setMatrixAt(i, m.compose(p, q.setFromEuler(e), s));
  }
  mesh.instanceMatrix.needsUpdate = true;
}
