// The auditor is only trustworthy if it fails on faults that matter. Each case is a real mistake someone
// makes writing shaders blind; the auditor must name it.
import * as THREE from "three";
import { auditMaterials } from "./lib-shader-audit.mjs";

const cases = [];
const expect = (name, materials, hosts, fragment) => {
  const { problems } = auditMaterials(new Set(materials), hosts || []);
  const hit = problems.some((p) => (fragment instanceof RegExp ? fragment.test(p) : fragment(p)));
  cases.push([name, !!hit, problems]);
};

const mk = (vs, fs, uniforms, mutate) => {
  const m = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms });
  if (mutate) mutate(m);
  return m;
};
const OK_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

expect("missing uniform", [mk(OK_VS.replace("vUv = uv;", "vUv = uv * uScale;") + "", `uniform float uScale; varying vec2 vUv; void main(){ gl_FragColor = vec4(vUv, 0.0, 1.0); }`.replace("uniform float uScale;", "uniform float uScale;") , {})], [], /uScale/);

expect("varying only in fragment", [mk(OK_VS, `varying vec2 vUv; varying float vMissing; void main(){ gl_FragColor = vec4(vUv, vMissing, 1.0); }`, {})], [], /vMissing|not declared/);

expect("undeclared identifier", [mk(`void main() { gl_Position = vec4(0.0); }`, `void main(){ gl_FragColor = vec4(uNever, 0.0, 0.0, 1.0); }`, {})], [], /uNever|not declared/);

expect("redeclared injected attribute", [mk(`attribute vec2 uv; void main(){ gl_Position = vec4(uv,0.0,1.0); }`, `void main(){ gl_FragColor = vec4(1.0); }`, {})], [], /injected attribute/);

expect("fragment uses uv built-in", [mk(OK_VS, `void main(){ gl_FragColor = vec4(uv, 0.0, 1.0); }`, {})], [], /vertex attribute/);

const srgb = new THREE.Texture(); srgb.colorSpace = THREE.SRGBColorSpace;
const lin = new THREE.Texture(); lin.colorSpace = THREE.NoColorSpace;
expect("albedo in linear space", [Object.assign(new THREE.MeshStandardMaterial(), { map: lin, normalMap: lin })], [], /albedo texture must be SRGB/);
expect("data map in sRGB", [Object.assign(new THREE.MeshStandardMaterial(), { map: srgb, normalMap: srgb })], [], /data texture must not be SRGB/);
expect("additive with depthWrite", [mk(OK_VS, `void main(){ gl_FragColor = vec4(1.0); }`, {}, (m) => { m.blending = THREE.AdditiveBlending; m.depthWrite = true; })], [], /AdditiveBlending/);

const inst = new THREE.InstancedMesh(new THREE.BufferGeometry(), mk(OK_VS, `void main(){ gl_FragColor = vec4(1.0); }`, {}), 4);
inst.count = 9;
expect("instance count past capacity", [], [inst], /exceeds instanceMatrix capacity/);
const misuse = mk(`uniform float uUnused; void main(){ gl_Position = instanceMatrix * vec4(position,1.0); }`, `void main(){ gl_FragColor = vec4(1.0); }`, { uUnused: { value: 1 } });
expect("instanceMatrix on a plain mesh", [misuse], [{ isInstancedMesh: false, material: null }], /not attached to an InstancedMesh/);

const clean = mk(OK_VS, `varying vec2 vUv; void main(){ gl_FragColor = vec4(vUv, 0.0, 1.0); }`, {});
expect("a clean shader stays silent", [clean], [], () => false);

let bad = 0;
for (const [name, detected, problems] of cases) {
  const shouldDetect = !name.startsWith("a clean");
  const pass = shouldDetect === detected;
  if (!pass) bad++;
  console.log((pass ? "ok   " : "FAIL ") + name + (detected ? " (flagged)" : " (silent)") + (pass || !problems.length ? "" : " -> " + problems[0]));
}
console.log(bad ? `\n${bad} auditor self-test failures` : "\nthe auditor catches every injected fault and stays silent on clean input");
process.exit(bad ? 1 : 0);
