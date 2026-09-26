import * as THREE from "three";

// RingGeometry UVs are planar, not radial, so Cassini's 1-D radial profile smears across it unless u is
// remapped to normalised radius.
export function radializeRing(geo, inner, outer) {
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    uv.setX(i, (v.length() - inner) / (outer - inner));
    uv.setY(i, 0.5);
  }
  uv.needsUpdate = true;
  return geo;
}
