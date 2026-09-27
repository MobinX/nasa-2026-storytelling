// Distance and clearance queries against a polyline of local [x,z] points. Deliberately pure and
// import-free: lib/terrain.js needs it to reject craters, journey/corridor.js needs it to build the
// polyline, and the checks need the exact same arithmetic the generators used. Anything with an import
// here would close a cycle between terrain and pose.

// Segment distance, not vertex distance: the corridor is sampled at 0.5 m, so measuring to the nearest
// vertex would let a rock 1.19 m off the middle of a segment read as clear at 1.216 m.
export function nearestOnCorridor(x, z, corridor) {
  let best = Infinity;
  let bx = corridor[0][0];
  let bz = corridor[0][1];
  for (let i = 0; i < corridor.length - 1; i++) {
    const ax = corridor[i][0];
    const az = corridor[i][1];
    const ex = corridor[i + 1][0] - ax;
    const ez = corridor[i + 1][1] - az;
    const len2 = ex * ex + ez * ez;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / len2)) : 0;
    const px = ax + ex * t;
    const pz = az + ez * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) {
      best = d;
      bx = px;
      bz = pz;
    }
  }
  return { dist: best, x: bx, z: bz };
}

export const distanceToCorridor = (x, z, corridor) => nearestOnCorridor(x, z, corridor).dist;

export const reachesCorridor = (x, z, reach, corridor) => distanceToCorridor(x, z, corridor) < reach;

// Push a point out to `clearance` from the path, keeping the bearing it was already on so the scatter
// still looks like a scatter. Away-from-nearest-point is a fixed point iteration: leaving one segment
// clear can arrive at the next, so it is repeated. A point that lands exactly on the path has no bearing
// to keep, and goes east - the walk runs north-south, so that is always a real direction.
export function clampToCorridor(x, z, corridor, clearance) {
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 12; pass++) {
    const near = nearestOnCorridor(px, pz, corridor);
    if (near.dist >= clearance) break;
    let dx = px - near.x;
    let dz = pz - near.z;
    let l = Math.hypot(dx, dz);
    if (l < 1e-6) {
      dx = 1;
      dz = 0;
      l = 1;
    }
    px = near.x + (dx / l) * clearance;
    pz = near.z + (dz / l) * clearance;
  }
  return [px, pz];
}
