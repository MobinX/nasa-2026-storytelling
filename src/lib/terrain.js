import * as THREE from "three";

export const R_MOON_M = 1737400;
export const NEAR_R = 240;
export const MID_R = 900;
export const FAR_R = 4000;
export const EYE = 1.7;

// Deterministic scatter so the rail, the rocks and the height query can never disagree.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export const CRATERS = (() => {
  const r = rng(20260926);
  const out = [];
  const add = (n, min, max, depth) => {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * NEAR_R * 0.98;
      const rad = min + r() * (max - min);
      out.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: rad, depth: rad * depth });
    }
  };
  add(3, 25, 60, 0.16);
  add(9, 6, 18, 0.18);
  add(26, 1.2, 4, 0.22);
  return out;
})();

// Real LOLA/DEM is 500 m/pixel: 300x coarser than the camera height, so it contributes nothing here.
// Local relief has to be synthetic; the NASA map is used for albedo and the mare/highland swells.
export function buildTerrain({ seg = 96 } = {}) {
  const t0 = performance.now();
  const geo = new THREE.PlaneGeometry(NEAR_R * 2, NEAR_R * 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const grid = new Float32Array((seg + 1) * (seg + 1));
  const cell = (NEAR_R * 2) / seg;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const d = Math.hypot(x, z);
    let h = 0;
    h += Math.sin(x * 0.011) * Math.cos(z * 0.0093) * 2.4;
    h += Math.sin(x * 0.0031 + 1.7) * Math.cos(z * 0.0027 - 0.6) * 6.2;
    for (let c = 0; c < CRATERS.length; c++) {
      const k = CRATERS[c];
      const dr = Math.hypot(x - k.x, z - k.z) / k.r;
      if (dr > 1.9) continue;
      if (dr < 1) h -= k.depth * Math.pow(Math.cos((dr * Math.PI) / 2), 1.4);
      h += k.depth * 0.24 * Math.exp(-Math.pow(dr - 1.08, 2) / 0.014);
    }
    h -= (d * d) / (2 * R_MOON_M);
    const fade = 1 - THREE.MathUtils.smoothstep(d, NEAR_R * 0.75, NEAR_R);
    const v = h * fade;
    grid[i] = v;
    p.setY(i, v);
  }
  geo.computeVertexNormals();
  const heights = { grid, seg, cell, origin: -NEAR_R };
  geo.userData.heights = heights;
  return { geo, heights, ms: performance.now() - t0 };
}

export function heightAt(h, x, z) {
  const fx = (x - h.origin) / h.cell, fz = (z - h.origin) / h.cell;
  const n = h.seg + 1;
  if (fx < 0 || fz < 0 || fx > n - 1 || fz > n - 1) return 0;
  const i = Math.min(n - 2, Math.floor(fx)), j = Math.min(n - 2, Math.floor(fz));
  const tx = fx - i, tz = fz - j;
  const g = h.grid, a = j * n + i;
  const h00 = g[a], h10 = g[a + 1], h01 = g[a + n], h11 = g[a + n + 1];
  return h00 * (1 - tx) * (1 - tz) + h10 * tx * (1 - tz) + h01 * (1 - tx) * tz + h11 * tx * tz;
}

// Central differences off the height grid: geometry gives the silhouettes, this gives the near-field
// bumps, which 96x96 shading alone would render as origami.
export function deriveNormalMap(h, size = 512) {
  const data = new Uint8Array(size * size * 4);
  const step = (NEAR_R * 2) / size;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = -NEAR_R + i * step, z = -NEAR_R + j * step;
      const dx = (heightAt(h, x + step, z) - heightAt(h, x - step, z)) / (2 * step);
      const dz = (heightAt(h, x, z + step) - heightAt(h, x, z - step)) / (2 * step);
      const inv = 1 / Math.hypot(-dx, 1, -dz);
      const o = (j * size + i) * 4;
      data[o] = ((-dx * inv) * 0.5 + 0.5) * 255;
      data[o + 1] = ((-dz * inv) * 0.5 + 0.5) * 255;
      data[o + 2] = (inv * 0.5 + 0.5) * 255;
      data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// Inverse of three's own SphereGeometry mapping (y = R cos(theta), uv = (phi/2PI, 1 - theta/PI)), so the
// continuity holds whatever longitude convention the source map uses.
export function uvFromDirection(v) {
  const theta = Math.acos(THREE.MathUtils.clamp(v.y, -1, 1));
  const phi = Math.atan2(v.z, -v.x);
  return [(phi / (Math.PI * 2) + 1) % 1, 1 - theta / Math.PI];
}

// Local frame at a selenographic site. (east, n, north) is left-handed and would turn the site frame
// into a reflection, so the third axis is east x n: walking local +z heads south on the map.
export function siteFrame(lat, lon, radius) {
  const n = new THREE.Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
  const east = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), n).normalize();
  const fwd = new THREE.Vector3().crossVectors(east, n).normalize();
  const basis = new THREE.Matrix4().makeBasis(east, n, fwd);
  return { n, east, fwd, basis, pos: n.clone().multiplyScalar(radius), quaternion: new THREE.Quaternion().setFromRotationMatrix(basis) };
}

// Level the field at the spot the orbit act hands off, so the eye height the descent authored is the eye
// height above real ground. Without this the cut inherits whatever crater swell happens to be there.
export function levelTerrain(terrain, x = 0, z = 0) {
  const off = heightAt(terrain.heights, x, z);
  const p = terrain.geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) - off);
  p.needsUpdate = true;
  for (let i = 0; i < terrain.heights.grid.length; i++) terrain.heights.grid[i] -= off;
  return off;
}
