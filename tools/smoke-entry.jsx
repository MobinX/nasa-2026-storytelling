import { createElement } from "react";
import App from "../src/App.jsx";
import * as hub from "./stubs/hub.js";
import { fakeState } from "./stubs/hub-bridge.js";
import { preloadMaps, maps } from "../src/lib/textures.js";
import { buildTerrain, levelTerrain, deriveNormalMap, heightAt } from "../src/lib/terrain.js";
import { CUT_LOCAL } from "../src/journey/pose.js";
import { input } from "../src/state/input.js";
import { journey } from "../src/state/journey.js";
import { auditMaterials } from "./lib-shader-audit.mjs";
import { seenMaterials, hosts } from "./stubs/hub.js";

export async function run() {
  const out = { errors: [], notes: [] };
  await preloadMaps(4);
  const terrain = buildTerrain({ seg: 96 });
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
  let firstWalkFrame = -1;

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
    seenSpaces.add(cam.near + "/" + cam.far);
    if (lastNearFar && lastNearFar !== cam.near + "/" + cam.far) out.notes.push(`near/far switched ${lastNearFar} -> ${cam.near}/${cam.far} at o=${o.toFixed(3)}`);
    lastNearFar = cam.near + "/" + cam.far;
    if (journey.walkActive && firstWalkFrame < 0) firstWalkFrame = o;
  }

  out.notes.push("distinct near/far pairs " + [...seenSpaces].join(" "));
  out.notes.push("walk input unlocked at o=" + (firstWalkFrame < 0 ? "never" : firstWalkFrame.toFixed(2)));

  const before = cam.position.clone();
  const yawBefore = journey.yaw;
  hub.setScroll(0.95);
  for (let i = 0; i < 45; i++) {
    input.move.x = 1;
    input.move.y = 1;
    input.look.dx = 6;
    input.look.dy = 2;
    fakeState.clock.elapsedTime += dt;
    hub.frames.forEach((f) => f.cb(fakeState, dt));
  }
  const moved = cam.position.distanceTo(before);
  const turned = Math.abs(journey.yaw - yawBefore);
  out.notes.push("stick+drag over 0.75s moved " + moved.toFixed(2) + "m and turned " + ((turned * 180) / Math.PI).toFixed(1) + "deg");
  if (moved < 0.5) out.errors.push("joystick produced no motion in the walk act");
  if (turned < 0.05) out.errors.push("drag produced no yaw in the walk act");
  if (!journey.walkActive) out.errors.push("walk input never unlocked");
  if (Math.abs(journey.camLocal.x) > 8) out.errors.push("strafe escaped the authored band: x=" + journey.camLocal.x.toFixed(2) + "m");
  if (!Number.isFinite(journey.walked)) out.errors.push("walk distance went non-finite");

  out.hosts = hub.hosts.map((h) => h.tag);

  // The plan's ceilings: 40 draws soft / 60 hard, 120k triangles, 10 programs. Measured per act because
  // only one act is visible at a time and the harness holds a real scene graph.
  for (const probe of [["solar", 0.02], ["lunar", 0.5], ["ground", 0.98]]) {
    hub.setScroll(probe[1]);
    for (let k = 0; k < hub.frames.length; k++) hub.frames[k].cb(fakeState, dt);
    const b = hub.budgetAt();
    out.notes.push(probe[0] + " act: " + b.draws + " draws, " + (b.tris / 1000).toFixed(1) + "k tris, " + b.programs + " programs" + (b.noMaterial.length ? ", drawables with no material: " + b.noMaterial.join("/") : ""));
    if (b.draws > 60) out.errors.push(probe[0] + " act exceeds the 60 draw-call hard ceiling: " + b.draws);
    if (b.tris > 120000) out.errors.push(probe[0] + " act exceeds the 120k triangle ceiling: " + b.tris);
    if (b.programs > 10) out.errors.push(probe[0] + " act exceeds the 10 program ceiling: " + b.programs);
  }

  // Drive the real input handlers: the walk controls are the one part of the app no other check touches,
  // and the whole gesture split rests on the look pad never calling preventDefault (that is what would
  // silently kill page scrolling on Android).
  const stick = hub.hosts.find((h) => h.className === "stick");
  const look = hub.hosts.find((h) => h.className === "look");
  if (!stick || !look) out.errors.push("thumb or look pad not mounted");
  else {
    const lookTypes = Object.keys(look.__listeners);
    for (const t of lookTypes) {
      const opts = (look.__listeners[t] || []).map((l) => l.opts);
      const passive = opts.some((o) => o === true || o?.passive === true);
      const blocking = opts.some((o) => o === undefined || o === false || (o && o.passive === false));
      if (!passive || blocking) out.errors.push("look pad " + t + " is not registered passive (Android waits on the gesture decision)");
    }
    input.enabled = true;
    hub.emit(stick, "pointerdown", { clientX: 59, clientY: 59 });
    hub.emit(stick, "pointermove", { clientX: 59, clientY: 20 });
    if (!(input.move.y > 0.4)) out.errors.push("stick up-drag gave move.y=" + input.move.y.toFixed(2));
    const stickCancel = hub.emit(stick, "pointercancel", { clientX: 59, clientY: 20 });
    if (input.move.y !== 0) out.errors.push("pointercancel did not release the stick");
    void stickCancel;
    input.look.dx = 0;
    const down = hub.emit(look, "pointerdown", { clientX: 10, clientY: 10 });
    const move = hub.emit(look, "pointermove", { clientX: 40, clientY: 10 });
    if (input.look.dx <= 0) out.errors.push("horizontal drag produced no look delta");
    if (down.prevented || move.prevented) out.errors.push("look pad preventDefault-ed a pointer event, which kills page scroll");
    hub.emit(look, "pointercancel", { clientX: 40, clientY: 10 });
    input.enabled = false;
    input.move.x = 0;
    input.move.y = 0;
    input.look.dx = 0;
    out.notes.push("look pad listeners: " + Object.keys(look.__listeners).join("/") + "; stick and drag verified, no preventDefault on the scroll path");
  }

  // Every decoded map has to reach a material, or it is dead payload downloaded on a phone connection.
  const used = new Set();
  for (const m of seenMaterials) for (const slot of ["map", "alphaMap", "roughnessMap", "normalMap", "emissiveMap", "metalnessMap", "aoMap"]) if (m[slot]) used.add(m[slot]);
  const decoded = Object.entries(maps).filter(([, v]) => v);
  const unused = decoded.filter(([, t]) => !used.has(t) && ![...seenMaterials].some((m) => [...Object.values(m)].includes(t)));
  out.notes.push(decoded.length + " maps decoded, " + used.size + " bound to materials" + (unused.length ? ", unused: " + unused.map(([k]) => k).join(",") : ""));
  if (unused.length) out.errors.push("decoded but never used: " + unused.map(([k]) => k).join(", "));

  const audit = auditMaterials(seenMaterials, hub.hosts);
  out.audit = audit;
  for (const p of audit.problems) out.errors.push("material audit: " + p);
  out.notes.push(audit.shaders + " ShaderMaterials, " + audit.materials + " materials, " + audit.hosts + " nodes audited");

  // If the maps never reach the materials the bodies render as flat coloured balls, which is the kind of
  // thing that looks like a design choice rather than a bug, so assert it.
  const textured = [...seenMaterials].filter((m) => m.map && m.map.isTexture);
  out.notes.push(textured.length + " materials carry a texture map");
  if (textured.length < 10) out.errors.push("only " + textured.length + " textured materials; expected the 8 planets + moon dot + moon sphere + Earth");
  const sized = [...seenMaterials].filter((m) => m.map?.image).map((m) => m.map.image.width + "x" + m.map.image.height);
  out.notes.push("map sizes " + [...new Set(sized)].sort().join(" "));
  audit.notes.forEach((n) => out.notes.push("note: " + n));
  return out;
}
