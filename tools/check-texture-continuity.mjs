// The orbit-to-ground cut is only convincing if the ground samples the same region of the map that the
// camera was flying into. That depends on three's actual sphere UV convention and on which way a plane's
// uv runs after rotateX(-PI/2) - both are read from real geometry here rather than reasoned about, and
// the pole rows are excluded because longitude is undefined there.
import * as THREE from "three";
import { SITE, SITE_UV, R_SPHERE, CUT_LOCAL } from "../src/journey/pose.js";
import { uvFromDirection } from "../src/lib/terrain.js";

// uvFromDirection takes a unit direction: normalise first, or acos() gets a clamped argument and the
// comparison below silently measures nothing.
const _unit = new THREE.Vector3();
const uvFromDirectionUnit = (v) => uvFromDirection(_unit.copy(v).normalize());

const problems = [];
const sph = new THREE.SphereGeometry(R_SPHERE, 64, 32);
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
if (samples < 100) problems.push(`only ${samples} interior sphere vertices sampled`);
if (worstU > 1 / 32) problems.push(`uvFromDirection u disagrees with three's sphere uv by ${worstU.toFixed(4)}`);
if (worstV > 1 / 32) problems.push(`uvFromDirection v disagrees with three's sphere uv by ${worstV.toFixed(4)}`);
console.log(`sphere: ${samples} interior vertices, worst delta u ${worstU.toFixed(5)} v ${worstV.toFixed(5)} (one segment = ${(1 / 64).toFixed(4)})`);

// Plane uv direction, from the real attribute data.
const plane = new THREE.PlaneGeometry(480, 480, 2, 2);
plane.rotateX(-Math.PI / 2);
const pp = plane.attributes.position, pu = plane.attributes.uv;
const at = (x, z) => {
  for (let i = 0; i < pp.count; i++) if (Math.abs(pp.getX(i) - x) < 1e-6 && Math.abs(pp.getZ(i) - z) < 1e-6) return [pu.getX(i), pu.getY(i)];
  throw new Error("vertex not found");
};
const dPlaneU = at(240, 0)[0] - at(0, 0)[0];
const dPlaneV = at(0, 240)[1] - at(0, 0)[1];

const Rm = 1737400;
const sphereUvAt = (x, z) => uvFromDirectionUnit(new THREE.Vector3(0, 0, 0).addVectors(SITE.n.clone(), SITE.east.clone().multiplyScalar(x / Rm).add(SITE.fwd.clone().multiplyScalar(z / Rm))));
const dSphU = sphereUvAt(240, 0)[0] - sphereUvAt(0, 0)[0];
const dSphV = sphereUvAt(0, 240)[1] - sphereUvAt(0, 0)[1];

if (Math.sign(dPlaneU) !== Math.sign(dSphU)) problems.push(`east runs ${dPlaneU > 0 ? "+" : "-"} on the ground but ${dSphU > 0 ? "+" : "-"} on the sphere`);
if (Math.sign(dPlaneV) !== Math.sign(dSphV)) problems.push(`forward runs ${dPlaneV > 0 ? "+" : "-"} in ground v but ${dSphV > 0 ? "+" : "-"} on the sphere`);
console.log(`gradients: ground du/dx ${dPlaneU.toExponential(2)} vs sphere ${dSphU.toExponential(2)} | ground dv/dz ${dPlaneV.toExponential(2)} vs sphere ${dSphV.toExponential(2)}`);

// The crop must be centred on the site: with repeat r and offset o, plane uv 0.5 maps to o + 0.5r.
const CROP_W = 12000 / (2 * Math.PI * Rm);
const CROP_H = 6000 / (Math.PI * Rm);
const centreU = SITE_UV[0] - CROP_W / 2 + 0.5 * CROP_W;
const centreV = SITE_UV[1] - CROP_H / 2 + 0.5 * CROP_H;
if (Math.abs(centreU - SITE_UV[0]) > 1e-9 || Math.abs(centreV - SITE_UV[1]) > 1e-9) problems.push("crop window is not centred on the landing site");

const cut = sphereUvAt(CUT_LOCAL[0], CUT_LOCAL[2]);
console.log(`site uv ${SITE_UV.map((v) => v.toFixed(5)).join(",")} | crop centre ${centreU.toFixed(5)},${centreV.toFixed(5)} | crop spans ${(CROP_W * 1e3).toFixed(2)}e-3 x ${(CROP_H * 1e3).toFixed(2)}e-3 uv`);
const texel = (1 / 2048 / CROP_W).toFixed(1);
console.log(`one map texel covers ${((Rm * 2 * Math.PI) / 2048 / 1000).toFixed(2)} km; the 480 m field spans ${(480 / (CROP_W * Rm * 2 * Math.PI) * 100).toFixed(1)}% of the crop window, so fine detail must come from the normal and detail maps`);

console.log(problems.length ? "\nFAIL\n" + problems.map((p) => " - " + p).join("\n") : "\ntexture continuity conventions verified");
process.exit(problems.length ? 1 : 0);
