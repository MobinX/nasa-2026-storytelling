import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { BODIES, SUN_U, EARTH, MOON_DOT_U, MOON_ORBIT_U, thetaAt } from "../lib/bodies.js";
import { journey } from "../state/journey.js";

const NAMES = ["Sun", ...BODIES.map((b) => b.name), "Moon"];
const COLS = 5;
const CELL_W = 256;
const CELL_H = 64;

function atlas() {
  const c = document.createElement("canvas");
  c.width = CELL_W * COLS;
  c.height = CELL_H * 3;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.font = "600 34px Roboto, helvetica neue, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#cfeee6";
  NAMES.forEach((n, i) => {
    ctx.fillText(n, (i % COLS) * CELL_W + CELL_W / 2, Math.floor(i / COLS) * CELL_H + CELL_H / 2, CELL_W - 12);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// troika <Text> fetches a font from a CDN unless you give it one and reallocates its SDF atlas mid-run,
// which is a visible hitch while scrolling. Nine 5-character strings are one canvas and one draw call.
export default function Labels({ holders }) {
  const mesh = useRef();
  const { geo, mat } = useMemo(() => {
    const { pos, tile } = atlasLayout();
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 2, 1, 3]), 1));
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]), 2));
    g.setAttribute("aTile", new THREE.InstancedBufferAttribute(tile, 4));
    g.instanceCount = NAMES.length;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uMap: { value: atlas() }, uPxToW: { value: 0.01 }, uNear: { value: 6 }, uFar: { value: 150 } },
      vertexShader: /* glsl */ `
        attribute vec4 aTile;
        varying vec2 vUv;
        varying float vFade;
        uniform float uPxToW, uNear, uFar;
        void main() {
          vec3 origin = vec3(instanceMatrix[3].xyz);
          vec4 mv = viewMatrix * vec4(origin, 1.0);
          float dist = -mv.z;
          float h = 17.0 * uPxToW * dist;
          vec2 size = vec2(h * (aTile.z / aTile.w), h);
          mv.xy += position.xy * size;
          vUv = aTile.xy + uv * aTile.zw;
          vFade = clamp(1.0 - (dist - uNear) / (uFar - uNear), 0.0, 1.0) * smoothstep(1.5, 4.0, dist);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying float vFade;
        void main() {
          vec4 t = texture2D(uMap, vUv);
          gl_FragColor = vec4(t.rgb, t.a * vFade);
        }`,
    });
    return { geo: g, mat };
  }, []);

  const _v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, viewport }) => {
    const show = journey.spaceId === "solar" && journey.tier >= 2;
    mesh.current.visible = show;
    if (!show) return;
    mat.uniforms.uPxToW.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / viewport.height;
    const im = mesh.current.instanceMatrix.array;
    const put = (i, x, y, z) => {
      const o = i * 16 + 12;
      im[o] = x;
      im[o + 1] = y;
      im[o + 2] = z;
    };
    put(0, 0, SUN_U * 1.5, 0);
    BODIES.forEach((b, i) => {
      const h = holders && holders[i];
      if (!h) return;
      _v.setFromMatrixPosition(h.matrixWorld);
      put(1 + i, _v.x, _v.y + b.radius * 1.9, _v.z);
      if (b === EARTH) {
        const th = thetaAt(b, journey.offset);
        put(9, _v.x + Math.cos(0.42) * MOON_ORBIT_U, _v.y + MOON_DOT_U * 2.2, _v.z + Math.sin(0.42) * MOON_ORBIT_U);
      }
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geo, mat, NAMES.length]} frustumCulled={false} renderOrder={5} />;
}

function atlasLayout() {
  const pos = new Float32Array([-0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 0]);
  const tile = new Float32Array(NAMES.length * 4);
  NAMES.forEach((n, i) => {
    const col = i % COLS,
      row = Math.floor(i / COLS);
    const wide = 0.62;
    tile[i * 4] = (col + (1 - wide) / 2) / COLS;
    tile[i * 4 + 1] = 1 - (row + 1) / 3;
    tile[i * 4 + 2] = wide / COLS;
    tile[i * 4 + 3] = 1 / 3;
  });
  return { pos, tile };
}
