import { createElement } from "react";
import App from "../src/App.jsx";
import * as hub from "./stubs/hub.js";
import { fakeState } from "./stubs/hub-bridge.js";
import { preloadMaps, maps } from "../src/lib/textures.js";
import { buildTerrain, levelTerrain, deriveNormalMap, heightAt } from "../src/lib/terrain.js";
import { CUT_LOCAL } from "../src/journey/pose.js";
import { input } from "../src/state/input.js";
import { journey } from "../src/state/journey.js";

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
  return out;
}
