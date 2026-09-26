import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { BODIES } from "../lib/bodies.js";
import { journey } from "../state/journey.js";

const LOCAL_R = 0.85;
const COLOR = new THREE.Color("#4d6f8f");
const ZERO = new THREE.Vector3();
const ONE_Q = new THREE.Quaternion();

// 8 orbits in one draw call with analytic antialiasing. THREE.LineLoop is 1px and hard-aliased
// (linewidth is a documented WebGL no-op) and drei's <Line> rebuilds all its geometry on every phone
// rotation, which is exactly what happens mid-scroll on Android.
export default function OrbitRings() {
  const mesh = useRef();
  const { geo, mat } = useMemo(() => {
    const geo = new THREE.RingGeometry(LOCAL_R - 0.035, LOCAL_R + 0.035, 128, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: COLOR }, uTime: { value: 0 }, uOpacity: { value: 0.6 } },
      vertexShader: /* glsl */ `
        varying float vR, vAng;
        void main() {
          vR = length(position.xz);
          vAng = atan(position.z, position.x);
          gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uTime, uOpacity;
        varying float vR, vAng;
        void main() {
          float w = max(fwidth(vR) * 1.4, 1e-5);
          float a = 1.0 - smoothstep(0.0, w, abs(vR - ${LOCAL_R}));
          float sweep = mod(vAng + uTime * 0.22 + 3.14159, 6.28318) / 6.28318;
          a *= uOpacity * (0.42 + 0.58 * smoothstep(0.55, 1.0, sweep));
          gl_FragColor = vec4(uColor * a, a);
        }`,
    });
    return { geo, mat };
  }, []);

  const built = useRef(false);
  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = clock.elapsedTime;
    mesh.current.visible = journey.spaceId === "solar";
    if (built.current || !mesh.current) return;
    const m = new THREE.Matrix4();
    const s = new THREE.Vector3();
    BODIES.forEach((b, i) => {
      const k = b.orbit / LOCAL_R;
      s.set(k, 1, k);
      m.compose(ZERO, ONE_Q, s);
      mesh.current.setMatrixAt(i, m);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    built.current = true;
  });

  return <instancedMesh ref={mesh} args={[geo, mat, BODIES.length]} frustumCulled={false} />;
}
