// Mutable per-frame state shared between the R3F loop and the DOM HUD. Deliberately not React state:
// nothing here may trigger a render, because a <Canvas> re-render unhooks ScrollControls' scroll listener
// and permanently freezes the journey.
export const journey = {
  offset: 0,
  raw: 0,
  scrollAlive: true,
  flicks: 0,
  fps: 0,
  dpr: 1,
  tier: 2,
  maxTier: 3,
  walkActive: false,
  encounter: 0,
  companion: { x: 0.5, y: 0.5, on: false },
  actId: "system",
  spaceId: "solar",
  connected: false,
  walked: 0,
  yaw: 0,
  camLocal: { x: 0, z: -20 },
  gl: { calls: 0, tris: 0, programs: 0, textures: 0 },
  caps: { maxTextureSize: 0, maxAnisotropy: 0, renderer: "", webgl2: true },
  bootMs: 0,
  software: false,
  warmedMs: 0,
  scrollEl: null,
};
