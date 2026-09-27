import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { maps } from "../lib/textures.js";
import { NEAR_R, MID_R } from "../lib/terrain.js";
import { GROUND_CORRIDOR } from "../journey/corridor.js";
import { ROCK_N, scatterRocks } from "../lib/rocks.js";
import { SITE, SITE_UV, SUN_DIR } from "../journey/pose.js";
import { journey } from "../state/journey.js";
import { TIERS } from "../lib/quality.js";
import Props, { Footprints, BlobShadow } from "./Props.jsx";
import Companion from "./Companion.jsx";

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
    scatterRocks(rocks.current, heights, GROUND_CORRIDOR, { count: ROCK_N });
  }, [heights]);

  useFrame(() => {
    group.current.visible = journey.spaceId === "ground";
    if (!group.current.visible) return;
    rocks.current.count = TIERS[journey.tier].rocks;
  });

  const sunLocal = useMemo(() => SUN_DIR.clone().applyQuaternion(SITE.quaternion.clone().invert()), []);

  return (
    <group ref={group} position={SITE.pos.toArray()} quaternion={SITE.quaternion.toArray()}>
      {/* Regolith bounce: the only fill an airless body has. It comes up off the lit field, so it lifts the
          shadow sides of the hardware and the dark half of the landing frame while leaving the terminator
          where the sun puts it. Inside this group it exists exactly when the ground act does. */}
      <directionalLight position={[0, -60, 0]} color="#5f5850" intensity={0.5} />
      <mesh geometry={geo} material={near} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} material={far}>
        <ringGeometry args={[NEAR_R * 0.99, MID_R, 96, 3]} />
      </mesh>
      <mesh geometry={ridge.g} material={ridge.m} position={[0, 6, 0]} renderOrder={1} />
      <instancedMesh ref={rocks} args={[rockGeo, near, ROCK_N]} frustumCulled={false} />
      <Props heights={heights} />
      <Companion heights={heights} />
      <Footprints heights={heights} />
      <BlobShadow heights={heights} sunDirLocal={sunLocal} />
    </group>
  );
}
