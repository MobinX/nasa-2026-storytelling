import { createElement } from "react";
import { Vector3 } from "three";
import App from "../src/App.jsx";
import * as hub from "./stubs/hub.js";
import { fakeState } from "./stubs/hub-bridge.js";
import { preloadMaps, maps } from "../src/lib/textures.js";
import { apply, OBJECTS, allStops, modelPaths } from "../src/data/objects.js";
import { models } from "../src/lib/models.js";
import { buildTerrain, levelTerrain, flattenAlongCorridor, deriveNormalMap, heightAt } from "../src/lib/terrain.js";
import { poseAt, scratchPose, walkRate, MARS_GROUND } from "../src/journey/pose.js";
import { MOON, MARS, BY_ID } from "../src/journey/worlds.js";
import { groundPose, scratchGround } from "../src/journey/ground.js";
import { MARS_WALK_IN, MARS_DEPART, SURFACE_STOPS, SEAM_A, SEAM_B, DEPART, TRANSFER_END, MARS_SEAM } from "../src/journey/timeline.js";
import { CORRIDOR_BY_WORLD, LEVEL_BAND_BY_WORLD } from "../src/journey/corridor.js";
import { journey } from "../src/state/journey.js";
import { auditMaterials } from "./lib-shader-audit.mjs";
import { seenMaterials } from "./stubs/hub.js";

// The walk is scroll-only, so the interesting failures are not "does the joystick move me" but "does the rig
// add anything the pure function does not", "did the scroll trap let a flick run past a crew member who is
// still talking" and "did some component quietly reattach a gesture listener", which is the one thing that
// can kill page scrolling on Android.
export async function run() {
  const out = { errors: [], notes: [] };
  await preloadMaps(4);
  for (const m of apply(OBJECTS)) out.errors.push("objects.json: " + m);
  // The budget the ceilings exist to protect has only ever been measured against proxy boxes. Load the
  // shipped walk models from disk - the same bytes the phone fetches, parsed by the same loader - so the
  // draw-call and triangle counts below are NASA geometry rather than a stand-in for it.
  const fs = await import("node:fs");
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const loader = new GLTFLoader();
  for (const p of modelPaths()) {
    const buf = fs.readFileSync(new URL("../public/" + p, import.meta.url));
    models.set(p, await new Promise((res, rej) => loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "", res, rej)));
  }
  out.notes.push("loaded " + models.size + " walk models from public/, from disk, through the app's own loader");
  const terrains = {};
  for (const world of [MOON, MARS]) {
    const t = buildTerrain({ seg: 96, avoid: CORRIDOR_BY_WORLD[world.id], relief: world.relief });
    flattenAlongCorridor(t, LEVEL_BAND_BY_WORLD[world.id]);
    out.notes.push(world.id + " levelled " + levelTerrain(t, world.cut[0], world.cut[2]).toFixed(3) + "m");
    t.normalMap = deriveNormalMap(t.heights, 256);
    terrains[world.id] = t;
  }

  const res = hub.renderTree(createElement(App, { terrains }));
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

  // The sweep is the rail, and a scroll trap would stop it at the first crew member. Answering everything
  // is the state a visitor who has finished the walk is in, and it is what the trap test below releases
  // from, so the sweep runs with every conversation closed.
  for (const stop of allStops()) journey.done[stop.id] = true;

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
    if (journey.graphId === MOON.graph) {
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

  // The trap is the whole mechanism of the walk, so it is asserted rather than assumed: an unanswered crew
  // member holds the offset exactly where the rail arrived, pins the scroller, and lets go the moment his
  // conversation is finished. A flick that runs past him leaves the visitor standing somewhere with nobody
  // talking and nothing to look at.
  const held = SURFACE_STOPS.mars[1];
  const toScroller = (o) => 1 + o * (hub.scrollState.el.scrollHeight - hub.scrollState.el.clientHeight - 1);
  delete journey.done[held.id];
  hub.setScroll(held.lock - 0.004);
  for (let k = 0; k < hub.frames.length; k++) hub.frames[k].cb(fakeState, dt);
  hub.setScroll(held.lock + held.spanSize * 3);
  hub.scrollState.el.scrollTop = toScroller(held.lock + held.spanSize * 3);
  for (let k = 0; k < hub.frames.length; k++) hub.frames[k].cb(fakeState, dt);
  const pinned = Math.abs(hub.scrollState.el.scrollTop - toScroller(held.lock)) < 2;
  out.notes.push("flick past " + held.id + ": offset " + journey.offset.toFixed(4) + " vs lock " + held.lock.toFixed(4) + ", scroller " + (pinned ? "pinned" : "escaped"));
  if (Math.abs(journey.offset - held.lock) > 1e-4) out.errors.push("the scroll trap let a flick run " + ((journey.offset - held.lock) * 46).toFixed(2) + " screens past " + held.id);
  if (!pinned) out.errors.push("the scroll trap held the camera but not the scroller, so releasing jumps");
  if (journey.talkStop !== held.id) out.errors.push("the rig reported " + journey.talkStop + " as the held stop, not " + held.id);
  const escaped = cam.position.clone();
  journey.done[held.id] = true;
  for (let k = 0; k < hub.frames.length; k++) hub.frames[k].cb(fakeState, dt);
  if (cam.position.distanceTo(escaped) < 1e-3) out.errors.push("finishing the conversation did not release the scroll");
  out.notes.push("released at o=" + journey.offset.toFixed(4) + " after the conversation was answered");

  // The same hold, but released the way a visitor releases it: tap the caption, choose a question, tap
  // through the answer, four rounds, and the outro. Nothing below writes journey.done, so this is the whole
  // loop - HUD callbacks, phase machine, rig and scroller pin - and it is the only place the piece is tested
  // as the thing it actually is: a scroll that will not move until somebody has been talked to.
  const { stepDialogue, advanceDialogue, askDialogue, dialogueView } = await import("../src/ui/Dialogue.jsx");
  const conversed = SURFACE_STOPS.moon[0];
  journey.done = {};
  hub.setScroll(conversed.lock + conversed.spanSize * 0.5);
  let asked = 0, bubbles = 0, guard = 0, view = null, heldPose = null;
  // One frame first, so the rig has had the flick and has already decided to hold: the loop below is
  // written against the offset the visitor is *allowed* to reach, not the one they asked for.
  for (let k = 0; k < hub.frames.length; k++) hub.frames[k].cb(fakeState, dt);
  heldPose = cam.position.clone();
  // Sample the conversation orbit as the visitor is walked through the stop: the angle the rig has swung
  // the pair by, and how far that has carried the camera round the machine, away from the pose it arrived
  // at. The offset is pinned for all of this, so any displacement here is the orbit and nothing else.
  let thetaMax = 0, orbitCarry = 0;
  while (guard++ < 4000 && journey.offset <= conversed.lock + 1e-3) {
    stepDialogue(1 / 30);
    view = dialogueView();
    if (!view) break;
    if (view.chips.length) {
      askDialogue(view.chips[0].id);
      asked++;
    } else {
      if (view.phase === "line") bubbles++;
      advanceDialogue();
    }
    for (let k = 0; k < hub.frames.length; k++) hub.frames[k].cb(fakeState, dt);
    thetaMax = Math.max(thetaMax, Math.abs(journey.orbitTheta));
    orbitCarry = Math.max(orbitCarry, cam.position.distanceTo(heldPose));
  }
  out.notes.push("conversation at " + conversed.id + ": " + bubbles + " caption taps, " + asked + " questions asked, released after " + guard + " ticks");
  out.notes.push("orbit at " + conversed.id + ": swung to " + thetaMax.toFixed(2) + "rad, carrying the camera " + orbitCarry.toFixed(2) + "m round the object while the scroll stayed pinned");
  if (asked !== 4) out.errors.push("the visitor asked " + asked + " questions at " + conversed.id + "; a stop is four rounds of one question each");
  if (view && view.total !== 4) out.errors.push(conversed.id + " reports " + view.total + " questions for its progress line");
  // The orbit is the whole feature: it has to actually happen (a stop with no movement is the old hold),
  // it has to carry the camera a real distance round the object, and it has to be home by the time the
  // scroll is released or the release jumps.
  if (thetaMax < 0.3) out.errors.push("the conversation orbit barely moved at " + conversed.id + ": peak " + thetaMax.toFixed(3) + "rad");
  if (orbitCarry < 1) out.errors.push("the orbit did not carry the camera round the object at " + conversed.id + ": " + orbitCarry.toFixed(2) + "m");
  if (Math.abs(conversed.side) < 0.5) out.errors.push(conversed.id + " has no side to orbit by");
  if (journey.offset <= conversed.lock + 1e-3) out.errors.push("answering every question did not release the scroll at " + conversed.id);
  if (heldPose && cam.position.distanceTo(heldPose) < 1e-3) out.errors.push("the scroll released but the camera stayed where it was");
  // And once released the orbit is zero: the walking rail has the pose back exactly, so sliding on is a walk.
  for (let k = 0; k < hub.frames.length; k++) hub.frames[k].cb(fakeState, dt);
  if (Math.abs(journey.orbitTheta) > 1e-9) out.errors.push("the orbit was still swinging " + journey.orbitTheta.toFixed(4) + "rad after the conversation released the scroll");
  for (const stop of allStops()) journey.done[stop.id] = true;

  // With no input state left to integrate, the rig must be exactly groundPose. Anything else that ever
  // crept in would be invisible in a screenshot and fatal to reverse scrubbing.
  const STANDOFF = MARS_DEPART - 0.06;
  hub.setScroll(STANDOFF);
  hub.scrollState.delta = 0;
  for (let k = 0; k < hub.frames.length; k++) hub.frames[k].cb(fakeState, dt);
  const p = scratchPose();
  const gp = scratchGround();
  poseAt(STANDOFF, p);
  groundPose(STANDOFF, terrains[p.world.id].heights, p, gp, 0);
  const expected = gp.local.clone().applyQuaternion(p.world.site.quaternion).add(p.world.site.pos);
  const drift = cam.position.distanceTo(expected);
  out.notes.push("rig vs groundPose at o=" + STANDOFF.toFixed(2) + " idle: " + (drift * 1000).toFixed(4) + "mm of drift");
  if (drift > 1e-9) out.errors.push("the rig is not a pure function of the offset: " + drift.toExponential(2) + "m off groundPose");

  // The gait is driven by scroll velocity now. Parked must be dead still; a deliberate scroll must bob.
  const eyeAbove = () => {
    const site = BY_ID[journey.worldId].site;
    const h = heightAt(terrains[journey.worldId].heights, journey.camLocal.x, journey.camLocal.z);
    return cam.position.distanceTo(new Vector3(journey.camLocal.x, h, journey.camLocal.z).applyQuaternion(site.quaternion).add(site.pos));
  };

  hub.setScroll(STANDOFF);
  hub.scrollState.delta = 0;
  const parked = [];
  for (let i = 0; i < 40; i++) {
    for (let k = 0; k < hub.frames.length; k++) hub.frames[k].cb(fakeState, dt);
    parked.push(eyeAbove());
  }
  const parkedTravel = Math.max(...parked) - Math.min(...parked);

  // The rail does not move uniformly - the landing legs crawl and the walk legs run - so the scroll rate
  // that means 2.2 m/s is read off the leg the test actually walks in, not off an average of the act. The
  // march stops at the last screen of the Martian act, because past it there is no ground to stand on.
  let o2 = MARS_WALK_IN + 0.01;
  const oEnd = MARS_DEPART - 0.002;
  const scrollDeltaFor = (mps) => (mps / walkRate(MARS_GROUND, o2)) * dt;
  const moving = [];
  for (let i = 0; i < 240 && o2 < oEnd; i++) {
    hub.scrollState.delta = scrollDeltaFor(2.2);
    o2 = Math.min(oEnd, o2 + scrollDeltaFor(2.2));
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

  // The band the lunar walk is allowed to wander in, measured across the whole sweep above and checked
  // against the corridor the terrain was cleared for. Parked here, in the middle of that walk.
  hub.setScroll(SURFACE_STOPS.moon[1].lock);
  hub.scrollState.delta = 0;
  for (let k = 0; k < hub.frames.length; k++) hub.frames[k].cb(fakeState, dt);
  const railX = CORRIDOR_BY_WORLD.moon.map(([x]) => x);
  const xLo = Math.min(...railX) - 0.5;
  const xHi = Math.max(...railX) + 0.5;
  out.notes.push("camera parked at local x=" + journey.camLocal.x.toFixed(2) + "m z=" + journey.camLocal.z.toFixed(2) + "m, authored band " + xLo.toFixed(2) + ".." + xHi.toFixed(2) + "m");
  if (track.xLo < xLo || track.xHi > xHi) out.errors.push("the camera left the authored band: x " + track.xLo.toFixed(2) + ".." + track.xHi.toFixed(2) + "m");

  out.hosts = hub.hosts.map((h) => h.tag);

  const probes = [
    ["solar", 0.02],
    ["moonSphere", (SEAM_A + SEAM_B) / 2],
    ["moonGround", SURFACE_STOPS.moon[2].lock],
    ["transfer", (DEPART + TRANSFER_END) / 2],
    ["marsOrbit", (TRANSFER_END + MARS_SEAM) / 2],
    ["marsGround", SURFACE_STOPS.mars[0].lock],
    ["eva", SURFACE_STOPS.solar[0].lock],
  ];
  for (const probe of probes) {
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
  for (const planet of ["moon", "mars"]) {
    const last = SURFACE_STOPS[planet].at(-1);
    const gaps = SURFACE_STOPS[planet].slice(1).map((b, i) => Math.hypot(b.cam[0] - SURFACE_STOPS[planet][i].cam[0], b.cam[2] - SURFACE_STOPS[planet][i].cam[2]));
    out.notes.push(planet + " walk ends at " + last.name + " (" + last.model + "), stops " + gaps.map((g) => g.toFixed(0) + "m").join(", "));
  }
  audit.notes.forEach((n) => out.notes.push("note: " + n));
  return out;
}
