// Mutable per-frame state shared between the R3F loop and the DOM HUD. Deliberately not React state:
// nothing here may trigger a render, because a <Canvas> re-render unhooks ScrollControls' scroll listener
// and permanently freezes the journey.
export const journey = {
  offset: 0,
  raw: 0,
  flicks: 0,
  fps: 0,
  dpr: 1,
  tier: 3,
  walked: 0,
  walkActive: false,
  talk: 0,
  talkStop: null,
  air: 0,
  // Which conversations have been finished (by stop id) and where the scroll is currently being held.
  done: {},
  lock: { engaged: false, offset: 0, id: null },
  yaw: 0,
  camLocal: { x: 0, z: -20 },
  graphId: "solar",
  worldId: "moon",
  companion: { x: 0.5, y: 0.5, on: false },
  actId: "system",
  connected: false,
  gl: { calls: 0, tris: 0, programs: 0, textures: 0 },
  caps: { maxTextureSize: 0, maxAnisotropy: 0, renderer: "", webgl2: true },
  bootMs: 0,
  software: false,
  warmedMs: 0,
  scrollEl: null,
};
