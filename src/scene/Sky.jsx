import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { journey } from "../state/journey.js";
import { TIERS } from "../lib/quality.js";

const STARS = 2400;
const BAND = new THREE.Vector3(0.3, 0.85, 0.42).normalize();

function starField() {
  const pos = new Float32Array(STARS * 3);
  const data = new Float32Array(STARS * 2);
  const v = new THREE.Vector3();
  for (let i = 0; i < STARS; i++) {
    const cos = Math.random() * 2 - 1;
    const sin = Math.sqrt(1 - cos * cos);
    const a = Math.random() * Math.PI * 2;
    v.set(sin * Math.cos(a), cos, sin * Math.sin(a));
    const band = i % STARS < STARS * 0.34;
    if (band) v.applyAxisAngle(BAND, (Math.random() - 0.5) * 0.34).normalize();
    pos[i * 3] = v.x;
    pos[i * 3 + 1] = v.y;
    pos[i * 3 + 2] = v.z;
    data[i * 2] = band ? 0.1 + Math.random() * 0.28 : 0.3 + Math.pow(Math.random(), 2.6) * 0.7;
    data[i * 2 + 1] = Math.random();
  }
  return { pos, data };
}

// Not drei <Stars>: its gl_PointSize is tied to world distance (meaningless when the world scale jumps
// by 10^5 between acts) and its shell is centred on the origin, i.e. inside the terrain in Act III.
export function StarDome() {
  const pts = useRef();
  const { geo, mat } = useMemo(() => {
    const { pos, data } = starField();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aData", new THREE.BufferAttribute(data, 2));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPx: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec2 aData;
        uniform float uPx;
        varying float vB, vT;
        void main() {
          vB = aData.x;
          vT = aData.y;
          gl_PointSize = mix(0.9, 2.9, aData.x) * uPx;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position * 900.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vB, vT;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.08, d) * (0.22 + vB);
          vec3 tint = mix(vec3(1.0, 0.87, 0.72), vec3(0.78, 0.86, 1.0), vT);
          gl_FragColor = vec4(tint * a, a);
        }`,
    });
    return { geo, mat };
  }, []);

  useFrame(({ viewport, camera }) => {
    mat.uniforms.uPx.value = viewport.dpr;
    geo.setDrawRange(0, TIERS[journey.tier].stars);
    if (pts.current) pts.current.position.copy(camera.position);
  });

  return <points ref={pts} geometry={geo} material={mat} frustumCulled={false} renderOrder={-2} />;
}

const GLOW_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const glowFrag = (corona, limb) => /* glsl */ `
  uniform vec3 uColor;
  uniform float uPower;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = exp(-d * d * uPower) + pow(max(0.0, 1.0 - d), ${limb}) * ${corona};
    gl_FragColor = vec4(uColor * a, a);
  }`;

// Additive and order-independent, so the corona quads need no sorting. Kept out of the solar act, where
// the sun is a real object at the origin with its own glow.
export function SunGlow({ direction }) {
  const group = useRef();
  const mats = useMemo(
    () =>
      [
        { color: "#fff2d6", power: 11, corona: "0.42", limb: "3.5", size: 26 },
        { color: "#ffd39a", power: 2.4, corona: "0.2", limb: "6.0", size: 104 },
      ].map(
        (s) =>
          new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            uniforms: { uColor: { value: new THREE.Color(s.color) }, uPower: { value: s.power } },
            vertexShader: GLOW_VERT,
            fragmentShader: glowFrag(s.corona, s.limb),
          }),
      ),
    [],
  );

  useFrame(({ camera }) => {
    const show = journey.spaceId !== "solar" && TIERS[journey.tier].glow > 0;
    group.current.visible = show;
    if (!show) return;
    group.current.position.copy(camera.position).addScaledVector(direction, 900);
    group.current.quaternion.copy(camera.quaternion);
  });

  return (
    <group ref={group} renderOrder={-1}>
      {mats.map((m, i) => (
        <mesh key={i} material={m}>
          <planeGeometry args={[i === 0 ? 4.7 : 19, i === 0 ? 4.7 : 19]} />
        </mesh>
      ))}
    </group>
  );
}
