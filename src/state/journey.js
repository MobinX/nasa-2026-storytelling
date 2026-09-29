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
  // How far the conversation orbit has swung the visitor around the object this frame, in radians. Read by
  // the crew member so he travels with the same arc; zero except from the moment a stop is reached.
  orbitTheta: 0,
  // Which stop that angle belongs to - it is not always the one holding the scroll, because a visitor who
  // scrolls away mid-arc takes the arc and its crew member home with them.
  orbitStop: null,
  // The arc is on its way back to the trail after the conversation ended, which is the one moment the scroll
  // is still held with nobody left to talk to. The HUD says so rather than offering a caption to tap.
  orbitClosing: false,
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
