import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { NEAR_R, MID_R } from "../lib/terrain.js";
import { maps } from "../lib/textures.js";
import { journey } from "../state/journey.js";
import { TIERS } from "../lib/quality.js";
import { Footprints, BlobShadow } from "./Props.jsx";
import WalkObjects from "./WalkObjects.jsx";
import { scatterRocks, ROCK_N } from "../lib/rocks.js";
import { CORRIDOR_BY_WORLD } from "../journey/corridor.js";
import { STOPS } from "../journey/stops.js";

const STOPS_BY_ID = { moon: STOPS.moon, mars: STOPS.mars };

// A standing-person world: the displaced near field, the far ring, the band that hides where the plane
// stops, the rocks, the hardware and the crew member. One component, driven entirely by a world
// descriptor, because the two landings are the same machinery over different ground.
//
// The near field is CPU-displaced once at boot so heightAt() can be an O(1) lookup for the camera, the
// rocks and the footprints. The albedo is a crop of the same equirect the camera has been flying into,
// so the pattern continues across the hand-off; the detail tile supplies the grit the map cannot.

// 12,000 km of the body's own surface, cropped across the 480 m field. Which is why the crop is a
// fraction of a texel wide: the map cannot resolve what the camera is standing on, at any scale.
const cropOf = (world) => {
  const w = 12000 / (2 * Math.PI * world.radiusM);
  const h = 6000 / (Math.PI * world.radiusM);
  return { w, h };
};

const crop = (world, mul, aniso) => {
  const { w, h } = cropOf(world);
  const t = maps[world.mapKey].clone();
  t.repeat.set(w * mul, h * mul);
  t.offset.set(world.uv[0] - (w * mul) / 2, world.uv[1] - (h * mul) / 2);
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
};

// The band at the edge of the field. On the Moon it is a hard black crest, because without an atmosphere
// range is carried by known-size objects alone and nothing fades. On Mars the same geometry is hills
// dissolving into dust haze, which is the one piece of aerial perspective this planet gets to use.
const RIDGE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const ridgeFrag = (hazy) => /* glsl */ `
  varying vec2 vUv;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float noise(float x) {
    float i = floor(x), f = fract(x);
    return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f));
  }
  void main() {
    float a = vUv.x * 6.28318;
    ${hazy ? "float crest = 0.20 + 0.11 * noise(a * 7.0) + 0.06 * noise(a * 19.0) + 0.03 * noise(a * 47.0);" : "float crest = 0.34 + 0.20 * noise(a * 9.0) + 0.12 * noise(a * 23.0) + 0.05 * noise(a * 61.0);"}
    float k = smoothstep(crest, crest - 0.07, 1.0 - vUv.y);
    ${hazy ? "vec3 tint = mix(vec3(0.30, 0.20, 0.15), vec3(0.60, 0.44, 0.33), k); gl_FragColor = vec4(tint, k * 0.94);" : "gl_FragColor = vec4(mix(vec3(0.04, 0.04, 0.05), vec3(0.42, 0.42, 0.45), k), k);"}
  }`;

// Mars has a sky. Dust in suspension scatters forward, which is why the daylight is butterscotch, the
// limb of it brighter near the horizon, and the glow around the sun is blue - the same Mie effect that
// makes Earth sunsets red, with the colours swapped because the particles are larger.
const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenith, uHorizon, uGlow;
  uniform vec3 uSun;
  varying vec3 vDir;
  void main() {
    float h = clamp(vDir.y * 1.4 + 0.02, 0.0, 1.0);
    vec3 c = mix(uHorizon, uZenith, pow(h, 0.55));
    float d = max(0.0, dot(normalize(vDir), normalize(uSun)));
    c = mix(c, uGlow, pow(d, 14.0) * 0.9 + pow(d, 3.0) * 0.10);
    gl_FragColor = vec4(c, 1.0);
  }`;

export default function GroundWorld({ world, terrain }) {
  const group = useRef();
  const rocks = useRef();
  const { geo, heights, normalMap } = terrain;
  const tier = TIERS[journey.tier];
  const hazy = world.air > 0;

  const near = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: crop(world, 1, tier.aniso),
        normalMap: tier.normalMap ? normalMap : null,
        roughnessMap: maps.detail,
        color: world.groundColor,
        roughness: world.roughness,
        metalness: 0,
      }),
    [normalMap, world],
  );
  const far = useMemo(() => new THREE.MeshLambertMaterial({ map: crop(world, 6, 2), color: world.farColor }), [world]);
  const ridge = useMemo(() => {
    const g = new THREE.CylinderGeometry(2400, 2400, 44, 128, 1, true);
    const m = new THREE.ShaderMaterial({ vertexShader: RIDGE_VERT, fragmentShader: ridgeFrag(hazy), transparent: true, side: THREE.BackSide, depthWrite: false });
    return { g, m };
  }, [hazy]);
  const sky = useMemo(() => {
    if (!hazy) return null;
    return {
      g: new THREE.SphereGeometry(2000, 32, 20),
      m: new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uZenith: { value: new THREE.Color(...world.skyZenith) },
          uHorizon: { value: new THREE.Color(...world.skyHorizon) },
          uGlow: { value: new THREE.Color(...world.skyGlow) },
          uSun: { value: new THREE.Vector3(...world.sunLocal.toArray()) },
        },
      }),
    };
  }, [hazy, world]);

  const rockGeo = useMemo(() => new THREE.IcosahedronGeometry(1, 1), []);
  useEffect(() => {
    scatterRocks(rocks.current, heights, CORRIDOR_BY_WORLD[world.id], { count: ROCK_N, seed: world.rockSeed });
  }, [heights, world]);

  useFrame(() => {
    const on = journey.graphId === world.graph;
    group.current.visible = on;
    if (!on) return;
    rocks.current.count = TIERS[journey.tier].rocks;
  });

  return (
    <group ref={group} position={world.site.pos.toArray()} quaternion={world.site.quaternion.toArray()}>
      {sky ? <mesh geometry={sky.g} material={sky.m} renderOrder={-1} /> : null}
      <mesh geometry={geo} material={near} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} material={far}>
        <ringGeometry args={[NEAR_R * 0.99, MID_R, 96, 3]} />
      </mesh>
      <mesh geometry={ridge.g} material={ridge.m} position={[0, 6, 0]} renderOrder={1} />
      <instancedMesh ref={rocks} args={[rockGeo, near, ROCK_N]} frustumCulled={false} />
      <WalkObjects stops={STOPS_BY_ID[world.id]} site={world.site} heights={heights} graph={world.graph} />
      <Footprints heights={heights} world={world} />
      <BlobShadow heights={heights} world={world} />
    </group>
  );
}

export const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

