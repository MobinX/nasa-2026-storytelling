// A hand-off between the sphere and the ground is only convincing if the ground samples the same region of
// the map that the camera was flying into. That depends on three's actual sphere UV convention, on which
// way a plane's uv runs after rotateX(-PI/2), and - for the second world - on the globe's spin agreeing
// with the crop. All three are read from real geometry here rather than reasoned about, per world, and the
// pole rows are excluded because longitude is undefined there.
import * as THREE from "three";
import { WORLDS } from "../src/journey/worlds.js";
import { uvFromDirection } from "../src/lib/terrain.js";

// uvFromDirection takes a unit direction: normalise first, or acos() gets a clamped argument and the
// comparison below silently measures nothing.
const _unit = new THREE.Vector3();
const uvFromDirectionUnit = (v) => uvFromDirection(_unit.copy(v).normalize());

const problems = [];
const fail = (m) => problems.push(m);

// Plane uv direction, from the real attribute data - the same geometry both surfaces use.
const plane = new THREE.PlaneGeometry(480, 480, 2, 2);
plane.rotateX(-Math.PI / 2);
const pp = plane.attributes.position, pu = plane.attributes.uv;
const at = (x, z) => {
  for (let i = 0; i < pp.count; i++) if (Math.abs(pp.getX(i) - x) < 1e-6 && Math.abs(pp.getZ(i) - z) < 1e-6) return [pu.getX(i), pu.getY(i)];
  throw new Error("vertex not found");
};
const dPlaneU = at(240, 0)[0] - at(0, 0)[0];
const dPlaneV = at(0, 240)[1] - at(0, 0)[1];
console.log(`plane: east runs ${dPlaneU > 0 ? "+" : "-"} in u, forward runs ${dPlaneV > 0 ? "+" : "-"} in v`);

for (const world of WORLDS) {
  const at2 = (m) => `${world.id}: ${m}`;
  // 1. Does uvFromDirection reproduce three's own sphere mapping at this radius?
  const sph = new THREE.SphereGeometry(world.radius, 64, 32);
  const sp = sph.attributes.position, su = sph.attributes.uv;
  const d = new THREE.Vector3();
  let worstU = 0, worstV = 0, samples = 0;
  for (let i = 0; i < sp.count; i++) {
    d.set(sp.getX(i), sp.getY(i), sp.getZ(i));
    const v = su.getY(i);
    if (v < 0.06 || v > 0.94) continue;
    const mine = uvFromDirectionUnit(d);
    const du = Math.min(Math.abs(mine[0] - su.getX(i)), 1 - Math.abs(mine[0] - su.getX(i)));
    worstU = Math.max(worstU, du);
    worstV = Math.max(worstV, Math.abs(mine[1] - v));
    samples++;
  }
  if (samples < 100) fail(at2(`only ${samples} interior sphere vertices sampled`));
  if (worstU > 1 / 32) fail(at2(`uvFromDirection u disagrees with three's sphere uv by ${worstU.toFixed(4)}`));
  if (worstV > 1 / 32) fail(at2(`uvFromDirection v disagrees with three's sphere uv by ${worstV.toFixed(4)}`));

  // 2. Do the ground's uv gradients run the same way as the sphere's at this site?
  const Rm = world.radiusM;
  const sphereUvAt = (x, z) => uvFromDirectionUnit(new THREE.Vector3().addVectors(world.site.n, world.site.east.clone().multiplyScalar(x / Rm).add(world.site.fwd.clone().multiplyScalar(z / Rm))));
  const dSphU = sphereUvAt(240, 0)[0] - sphereUvAt(0, 0)[0];
  const dSphV = sphereUvAt(0, 240)[1] - sphereUvAt(0, 0)[1];
  if (Math.sign(dPlaneU) !== Math.sign(dSphU)) fail(at2(`east runs ${dPlaneU > 0 ? "+" : "-"} on the ground but ${dSphU > 0 ? "+" : "-"} on the sphere`));
  if (Math.sign(dPlaneV) !== Math.sign(dSphV)) fail(at2(`forward runs ${dPlaneV > 0 ? "+" : "-"} in ground v but ${dSphV > 0 ? "+" : "-"} on the sphere`));

  // 3. Is the crop window centred on the site, and - where the globe is spun to put the hour right -
  //    does the sphere actually show that region under the camera's feet?
  const CROP_W = 12000 / (2 * Math.PI * Rm);
  const CROP_H = 6000 / (Math.PI * Rm);
  const centreU = world.uv[0] - CROP_W / 2 + 0.5 * CROP_W;
  const centreV = world.uv[1] - CROP_H / 2 + 0.5 * CROP_H;
  if (Math.abs(centreU - world.uv[0]) > 1e-9 || Math.abs(centreV - world.uv[1]) > 1e-9) fail(at2("crop window is not centred on the landing site"));
  // The map is drawn in the body frame, so the direction under the camera's feet is the site normal read
  // BACK through the spin, not forwards through it.
  const spun = world.site.n.clone().applyQuaternion(world.spin.clone().invert());
  const underfoot = uvFromDirectionUnit(spun);
  const du = Math.min(Math.abs(underfoot[0] - world.uv[0]), 1 - Math.abs(underfoot[0] - world.uv[0]));
  const dv = Math.abs(underfoot[1] - world.uv[1]);
  if (world.spin.angle === 0) {
    if (du > 1e-4 || dv > 1e-4) fail(at2(`unspun globe shows uv ${underfoot.join(",")} under a site cropped at ${world.uv.join(",")}`));
  } else if (du > 1e-4 || dv > 1e-4) {
    fail(at2(`the spun globe does not put the cropped region under the site: off by ${du.toFixed(5)},${dv.toFixed(5)}`));
  }
  const mapW = world.id === "moon" ? 2048 : 1024;
  console.log(`${world.id}: sphere ${(1 / 64).toFixed(4)}-segment convention, worst delta u ${worstU.toFixed(5)} v ${worstV.toFixed(5)} over ${samples} verts | site uv ${world.uv.map((v) => v.toFixed(5)).join(",")} spun-underfoot off ${du.toFixed(6)},${dv.toFixed(6)} | crop ${CROP_W.toFixed(2)}e-3 x ${CROP_H.toFixed(2)}e-3, texel ${(((Rm * 2 * Math.PI) / mapW / 1000)).toFixed(2)} km, field ${(480 / (CROP_W * Rm * 2 * Math.PI) * 100).toFixed(1)}% of the window`);
}

console.log(problems.length ? "\nFAIL\n" + problems.map((m) => " - " + m).join("\n") : "\ntexture continuity conventions verified");
process.exit(problems.length ? 1 : 0);
