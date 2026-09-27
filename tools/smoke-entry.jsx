import { createElement } from "react";
import { Vector3 } from "three";
import App from "../src/App.jsx";
import * as hub from "./stubs/hub.js";
import { fakeState } from "./stubs/hub-bridge.js";
import { preloadMaps, maps } from "../src/lib/textures.js";
import { buildTerrain, levelTerrain, deriveNormalMap, heightAt } from "../src/lib/terrain.js";
import { CUT_LOCAL, LM_LOCAL, FLAG_LOCAL, SITE, poseAt, scratchPose, walkRate } from "../src/journey/pose.js";
import { groundPose, scratchGround } from "../src/journey/ground.js";
import { WALK_IN } from "../src/journey/timeline.js";
import { GROUND_CORRIDOR } from "../src/journey/corridor.js";
import { journey } from "../src/state/journey.js";
import { auditMaterials } from "./lib-shader-audit.mjs";
import { seenMaterials, hosts } from "./stubs/hub.js";

// The walk is now scroll-only, so the interesting failures are not "does the joystick move me" but
// "does the rig add anything the pure function does not" and "did some component quietly reattach a
// gesture listener", which is the one thing that can kill page scrolling on Android.
export async function run() {
  const out = { errors: [], notes: [] };
  await preloadMaps(4);
  const terrain = buildTerrain({ seg: 96, avoid: GROUND_CORRIDOR });
  out.notes.push("levelled " + levelTerrain(terrain, CUT_LOCAL[0], CUT_LOCAL[2]).toFixed(3) + "m");
  terrain.normalMap = deriveNormalMap(terrain.heights, 256);

  const res = hub.renderTree(createElement(App, { terrain }));
  Object.assign(out, { passes: res.passes, hosts: res.hosts, frames: hub.frames.length });

  const canvasProps = fakeState.__canvasProps || {};
  out.notes.push("canvas gl antialias=" + canvasProps.gl?.antialias + " alpha=" + canvasProps.gl?.alpha + " shadows=" + canvasProps.shadows + " dpr=" + JSON.stringify(canvasProps.dpr));
  try {
    canvasProps.onCreated?.(fakeState);
  } catch (e) {
    out.errors.push("onCreated: " + e.message);
  }
  out.notes.push("tier=" + journey.tier + " dpr=" + fakeState.viewport.dpr);

  const cam = fakeState.camera;
  const dt = 1 / 60;
  let lastNearFar = null;
  const seenSpaces = new Set();
  let walkedAt = -1;
  let walkedFinite = true;
  const track = { xLo: Infinity, xHi: -Infinity };

  for (let i = 0; i <= 300; i++) {
    const o = i / 300;
    hub.setScroll(o);
    fakeState.clock.elapsedTime = i * dt;
    for (let k = 0; k < hub.frames.length; k++) {
      try {
        hub.frames[k].cb(fakeState, dt);
      } catch (e) {
        out.errors.push("frame#" + k + " at o=" + o.toFixed(3) + ": " + e.message);
        break;
      }
    }
    if (!Number.isFinite(cam.position.length() + cam.fov + cam.near + cam.far)) out.errors.push("non-finite camera at o=" + o.toFixed(3));
    if (!Number.isFinite(journey.walked)) walkedFinite = false;
    if (journey.spaceId === "ground") {
      track.xLo = Math.min(track.xLo, journey.camLocal.x);
      track.xHi = Math.max(track.xHi, journey.camLocal.x);
    }
    seenSpaces.add(cam.near + "/" + cam.far);
    if (lastNearFar && lastNearFar !== cam.near + "/" + cam.far) out.notes.push(`near/far switched ${lastNearFar} -> ${cam.near}/${cam.far} at o=${o.toFixed(3)}`);
    lastNearFar = cam.near + "/" + cam.far;
    if (journey.walkActive && walkedAt < 0) walkedAt = o;
  }
  out.notes.push("distinct near/far pairs " + [...seenSpaces].join(" "));
  out.notes.push("walk act unlocked at o=" + (walkedAt < 0 ? "never" : walkedAt.toFixed(2)));
  if (!walkedFinite) out.errors.push("walk distance went non-finite during the sweep");

  // With no input state left to integrate, the rig must be exactly groundPose. Anything else that ever
  // crept in would be invisible in a screenshot and fatal to reverse scrubbing.
  hub.setScroll(0.95);
  hub.scrollState.delta = 0;
  for (let k = 0; k < hub.frames.length; k++) hub.frames[k].cb(fakeState, dt);
  const p = scratchPose();
  const gp = scratchGround();
  poseAt(0.95, p);
  groundPose(0.95, terrain.heights, p, gp, 0);
  const siteQuat = SITE.quaternion;
  const expected = gp.local.clone().applyQuaternion(siteQuat).add(SITE.pos);
  const drift = cam.position.distanceTo(expected);
  out.notes.push("rig vs groundPose at o=0.95 idle: " + (drift * 1000).toFixed(4) + "mm of drift");
  if (drift > 1e-9) out.errors.push("the rig is not a pure function of the offset: " + drift.toExponential(2) + "m off groundPose");

  // The gait is driven by scroll velocity now. Parked must be dead still; a deliberate scroll must bob.
  const eyeAbove = () => cam.position.distanceTo(new Vector3(journey.camLocal.x, heightAt(terrain.heights, journey.camLocal.x, journey.camLocal.z), journey.camLocal.z).applyQuaternion(siteQuat).add(SITE.pos));
  hub.setScroll(0.95);
  hub.scrollState.delta = 0;
  const parked = [];
  for (let i = 0; i < 40; i++) {
    for (let k = 0; k < hub.frames.length; k++) hub.frames[k].cb(fakeState, dt);
    parked.push(eyeAbove());
  }
  const parkedTravel = Math.max(...parked) - Math.min(...parked);

  // The rail does not move uniformly - the landing legs crawl and the walk legs run - so the scroll rate
  // that means 2.2 m/s is read off the leg the test actually walks in, not off an average of the act.
  let o2 = WALK_IN + 0.01;
  const scrollDeltaFor = (mps) => (mps / walkRate(o2)) * dt;
  const moving = [];
  for (let i = 0; i < 240; i++) {
    hub.scrollState.delta = scrollDeltaFor(2.2);
    o2 = Math.min(0.999, o2 + scrollDeltaFor(2.2));
    hub.setScroll(o2);
    hub.scrollState.delta = scrollDeltaFor(2.2);
    for (let k = 0; k < hub.frames.length; k++) hub.frames[k].cb(fakeState, dt);
    moving.push(eyeAbove());
  }
  // Rail travel also changes the eye height, so the bob is counted as reversals of its derivative rather
  // than as range: a monotone climb is walking up a slope, a sawtooth is walking.
  const movingTravel = Math.max(...moving) - Math.min(...moving);
  let reversals = 0, lastSign = 0;
  for (let i = 1; i < moving.length; i++) {
    const sgn = Math.sign(moving[i] - moving[i - 1]);
    if (sgn && sgn !== lastSign) reversals++;
    if (sgn) lastSign = sgn;
  }
  out.notes.push("eye height range " + parkedTravel.toExponential(1) + "m parked, " + movingTravel.toFixed(3) + "m at a 2.2 m/s scroll with " + reversals + " reversals of direction");
  if (parkedTravel > 1e-9) out.errors.push("the gait is still moving with no scroll: " + parkedTravel.toExponential(1) + "m");
  if (reversals < 3) out.errors.push("a deliberate scroll did not bob, it slid: " + reversals + " reversals");

  hub.setScroll(0.95);
  hub.scrollState.delta = 0;
  for (let k = 0; k < hub.frames.length; k++) hub.frames[k].cb(fakeState, dt);
  const railX = GROUND_CORRIDOR.map(([x]) => x);
  const xLo = Math.min(...railX) - 0.5;
  const xHi = Math.max(...railX) + 0.5;
  out.notes.push("camera parked at local x=" + journey.camLocal.x.toFixed(2) + "m z=" + journey.camLocal.z.toFixed(2) + "m, authored band " + xLo.toFixed(2) + ".." + xHi.toFixed(2) + "m");
  if (track.xLo < xLo || track.xHi > xHi) out.errors.push("the camera left the authored band: x " + track.xLo.toFixed(2) + ".." + track.xHi.toFixed(2) + "m");

  out.hosts = hub.hosts.map((h) => h.tag);

  for (const probe of [["solar", 0.02], ["lunar", 0.5], ["ground", 0.98]]) {
    hub.setScroll(probe[1]);
    for (let k = 0; k < hub.frames.length; k++) hub.frames[k].cb(fakeState, dt);
    const b = hub.budgetAt();
    out.notes.push(probe[0] + " act: " + b.draws + " draws, " + (b.tris / 1000).toFixed(1) + "k tris, " + b.programs + " programs" + (b.noMaterial.length ? ", drawables with no material: " + b.noMaterial.join("/") : ""));
    if (b.draws > 60) out.errors.push(probe[0] + " act exceeds the 60 draw-call hard ceiling: " + b.draws);
    if (b.tris > 120000) out.errors.push(probe[0] + " act exceeds the 120k triangle ceiling: " + b.tris);
    if (b.programs > 10) out.errors.push(probe[0] + " act exceeds the 10 program ceiling: " + b.programs);
  }

  // A single non-passive pointer listener anywhere on the scroller is enough to make Android wait for the
  // gesture decision and stall the journey, and it stays true whether or not there are controls left to
  // register: so assert the absence over every host, and assert the scroll style that now carries it.
  const GESTURES = /^(pointer|mouse|wheel|touch|gesture|click|dblclick)/i;
  const offenders = [];
  let domNodes = 0;
  for (const h of hub.hosts) {
    if (!h.isDomNode) continue;
    domNodes++;
    for (const t of Object.keys(h.__listeners || {})) if (GESTURES.test(t)) offenders.push(h.className + "." + t);
  }
  const appSrc = await import("node:fs").then((fs) => fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8"));
  if (offenders.length) out.errors.push("gesture listeners attached after the controls were deleted: " + offenders.join(", "));
  if (!/touchAction:\s*"pan-y"/.test(appSrc)) out.errors.push("App.jsx no longer sets touchAction pan-y on the scroller, so a vertical drag can be claimed by the browser");
  if (!/overscrollBehavior:\s*"contain"/.test(appSrc)) out.errors.push("App.jsx no longer contains overscroll, so the phone can pull-to-refresh mid-journey");
  out.notes.push(domNodes + " DOM nodes, none holding a gesture handler; scroller style intact");

  // React's onClick never reaches this harness (applyProps drops function props), so the gesture audit can
  // only see addEventListener. The dialogue panel's real hazard is different and quieter: a fixed element
  // with pointer-events:auto and no touch-action swallows any drag starting on it, and the journey IS a
  // drag. That is only checkable in the source, so check it there.
  const css = await import("node:fs").then((fs) => fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8"));
  const talkBlocks = [...css.matchAll(/\.(bubble|chips|chips button)\s*\{([\s\S]*?)\}/g)];
  const wanted = { bubble: true, chips: true, "chips button": true };
  out.notes.push(talkBlocks.length + " dialogue surfaces found in styles.css");
  if (talkBlocks.length !== Object.keys(wanted).length) out.errors.push("expected 3 dialogue surfaces in styles.css, found " + talkBlocks.length);
  for (const [, cls, body] of talkBlocks) {
    if (!/touch-action:\s*pan-y/.test(body)) out.errors.push("." + cls.trim() + " has no touch-action: pan-y, so a drag starting on it cannot scroll the journey");
    const interactive = /pointer-events:\s*auto/.test(body) || (cls.trim() === "chips button" && true);
    if (interactive && !/touch-action:\s*pan-y/.test(body)) out.errors.push("." + cls.trim() + " claims pointer-events without opting into pan-y");
  }

  const used = new Set();
  for (const m of seenMaterials) for (const slot of ["map", "alphaMap", "roughnessMap", "normalMap", "emissiveMap", "metalnessMap", "aoMap"]) if (m[slot]) used.add(m[slot]);
  const decoded = Object.entries(maps).filter(([, v]) => v);
  const unused = decoded.filter(([, t]) => !used.has(t) && ![...seenMaterials].some((m) => [...Object.values(m)].includes(t)));
  out.notes.push(decoded.length + " maps decoded, " + used.size + " bound to materials" + (unused.length ? ", unused: " + unused.map(([k]) => k).join(",") : ""));
  if (unused.length) out.errors.push("decoded but never used: " + unused.map(([k]) => k).join(", "));

  const audit = auditMaterials(seenMaterials, hub.hosts);
  out.audit = audit;
  for (const p2 of audit.problems) out.errors.push("material audit: " + p2);
  out.notes.push(audit.shaders + " ShaderMaterials, " + audit.materials + " materials, " + audit.hosts + " nodes audited");

  const textured = [...seenMaterials].filter((m) => m.map && m.map.isTexture);
  out.notes.push(textured.length + " materials carry a texture map");
  if (textured.length < 10) out.errors.push("only " + textured.length + " textured materials; expected the 8 planets + moon dot + moon sphere + Earth");
  const sized = [...seenMaterials].filter((m) => m.map?.image).map((m) => m.map.image.width + "x" + m.map.image.height);
  out.notes.push("map sizes " + [...new Set(sized)].sort().join(" "));
  out.notes.push("walk ends at local (" + LM_LOCAL[0].toFixed(1) + ", " + LM_LOCAL[2].toFixed(1) + ") LM and (" + FLAG_LOCAL[0].toFixed(1) + ", " + FLAG_LOCAL[2].toFixed(1) + ") flag");
  audit.notes.forEach((n) => out.notes.push("note: " + n));
  return out;
}
