import * as THREE from "three";

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const frag = (corona, limb) => /* glsl */ `
  uniform vec3 uColor;
  uniform float uPower;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = exp(-d * d * uPower) + pow(max(0.0, 1.0 - d), ${limb}) * ${corona};
    gl_FragColor = vec4(uColor * a, a);
  }`;

// Analytic radial falloff: no texture, no aliasing, and additive so order never matters.
export const makeGlow = ({ color, power, corona = "0.42", limb = "3.5" }) =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uPower: { value: power } },
    vertexShader: VERT,
    fragmentShader: frag(corona, limb),
  });
