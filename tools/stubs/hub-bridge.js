import * as THREE from "three";
import * as hub from "./hub.js";
export { hub };
export const fakeState = {
  camera: new THREE.PerspectiveCamera(50, 400 / 800, 0.05, 2000),
  scene: new THREE.Scene(),
  gl: {
    info: { render: { calls: 12, triangles: 4000 }, memory: { textures: 4 }, programs: [{}, {}] },
    capabilities: { maxTextureSize: 8192, getMaxAnisotropy: () => 8, isWebGL2: true },
    getContext: () => ({ getExtension: () => null }),
    compileAsync: async () => ({}),
    setClearColor: () => {},
    toneMappingExposure: 1,
  },
  size: { width: 400, height: 800 },
  viewport: { width: 4, height: 8, dpr: 1.25, factor: 1 },
  clock: { elapsedTime: 0, getDelta: () => 1 / 60 },
  events: { connected: hub.scrollState.el, connect(target) { hub.scrollState.el = target; } },
  setDpr: (d) => (fakeState.viewport.dpr = d),
  setFrameloop: () => {},
  invalidate: () => {},
};
