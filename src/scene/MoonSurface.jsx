import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { maps } from "../lib/textures.js";
import { heightAt, NEAR_R, MID_R } from "../lib/terrain.js";
import { SITE, SITE_UV, SUN_DIR } from "../journey/pose.js";
import { journey } from "../state/journey.js";
import { TIERS } from "../lib/quality.js";
import Props, { Footprints, BlobShadow } from "./Props.jsx";

// Near field is CPU-displaced once at boot so heightAt() can be an O(1) lookup for the camera, the
// rocks and the footprints. The albedo is a crop of the same equirect the camera has been flying into,
// so the pattern continues across the cut; the 512 detail tile supplies the grit the map cannot.
const CROP_W = 12000 / (2 * Math.PI * 1737400);
const CROP_H = 6000 / (Math.PI * 1737400);

const crop = (mul, aniso) => {
  const t = maps.moon.clone();
  t.repeat.set(CROP_W * mul, CROP_H * mul);
  t.offset.set(SITE_UV[0] - (CROP_W * mul) / 2, SITE_UV[1] - (CROP_H * mul) / 2);
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
};

// A flat tangent plane already puts its horizon at eye level, which is where the real lunar horizon is;
// only the far edge is a lie, so everything beyond it steps down and the ridge band hides it.
const RIDGE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const RIDGE_FRAG = /* glsl */ `
  varying vec2 vUv;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float noise(float x) {
    float i = floor(x), f = fract(x);
    return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f));
  }
  void main() {
    float a = vUv.x * 6.28318;
    float crest = 0.34 + 0.20 * noise(a * 9.0) + 0.12 * noise(a * 23.0) + 0.05 * noise(a * 61.0);
    float k = smoothstep(crest, crest - 0.07, 1.0 - vUv.y);
    gl_FragColor = vec4(mix(vec3(0.04, 0.04, 0.05), vec3(0.42, 0.42, 0.45), k), k);
  }`;

const ROCK_N = 220;

export default function MoonSurface({ terrain }) {
  const group = useRef();
  const rocks = useRef();
  const { geo, heights, normalMap } = terrain;
  const tier = TIERS[journey.tier];

  const near = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: crop(1, tier.aniso),
        normalMap: tier.normalMap ? normalMap : null,
        roughnessMap: maps.detail,
        color: "#a0a0a6",
        roughness: 1,
        metalness: 0,
      }),
    [normalMap],
  );
  const far = useMemo(() => new THREE.MeshLambertMaterial({ map: crop(6, 2), color: "#7c7c82" }), []);
  const ridge = useMemo(() => {
    const g = new THREE.CylinderGeometry(2400, 2400, 44, 128, 1, true);
    const m = new THREE.ShaderMaterial({ vertexShader: RIDGE_VERT, fragmentShader: RIDGE_FRAG, transparent: true, side: THREE.BackSide, depthWrite: false });
    return { g, m };
  }, []);

  const rockGeo = useMemo(() => new THREE.IcosahedronGeometry(1, 1), []);
  useEffect(() => {
    const r = seedRandom(7717);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (let i = 0; i < ROCK_N; i++) {
      const band = i < 120 ? [8, 30] : i < 200 ? [30, 110] : [110, 235];
      const d = band[0] + r() * (band[1] - band[0]);
      const a = r() * Math.PI * 2;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const size = d < 30 ? 0.05 + r() * 0.2 : d < 110 ? 0.2 + r() * 0.6 : 1 + r() * 2.2;
      p.set(x, heightAt(heights, x, z) + size * 0.32, z);
      e.set(r() * 3.1, r() * 3.1, r() * 3.1);
      s.set(size * (0.7 + r() * 0.6), size * (0.45 + r() * 0.4), size * (0.7 + r() * 0.6));
      rocks.current.setMatrixAt(i, m.compose(p, q.setFromEuler(e), s));
    }
    rocks.current.instanceMatrix.needsUpdate = true;
  }, [heights]);

  useFrame(() => {
    group.current.visible = journey.spaceId === "ground";
    if (!group.current.visible) return;
    rocks.current.count = TIERS[journey.tier].rocks;
  });

  const sunLocal = useMemo(() => SUN_DIR.clone().applyQuaternion(SITE.quaternion.clone().invert()), []);

  return (
    <group ref={group} position={SITE.pos.toArray()} quaternion={SITE.quaternion.toArray()}>
      <mesh geometry={geo} material={near} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} material={far}>
        <ringGeometry args={[NEAR_R * 0.99, MID_R, 96, 3]} />
      </mesh>
      <mesh geometry={ridge.g} material={ridge.m} position={[0, 6, 0]} renderOrder={1} />
      <instancedMesh ref={rocks} args={[rockGeo, near, ROCK_N]} frustumCulled={false} />
      <Props heights={heights} />
      <Footprints heights={heights} />
      <BlobShadow heights={heights} sunDirLocal={sunLocal} />
    </group>
  );
}

function seedRandom(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
