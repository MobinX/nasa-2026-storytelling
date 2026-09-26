import { MathUtils, Vector3 } from "three";
import { SITE, walkDistance } from "./pose.js";
import { heightAt } from "../lib/terrain.js";
import { gait } from "../lib/gait.js";

const UP = new Vector3(0, 1, 0);
const _fwd = new Vector3();
const _right = new Vector3();
const _dir = new Vector3();

// Composition of the ground act: the scroll offset advances the authored rail, the player's stick/WASD
// adds a bounded offset on top, and the camera is dropped onto the displaced terrain. Extracted so the
// camera rig and tools/check-journey.mjs cannot drift apart.
export function groundPose(offset, s, heights, pose, out) {
  _fwd.copy(pose.sample.tangent);
  _fwd.y = 0;
  if (_fwd.lengthSq() < 1e-8) _fwd.set(0, 0, 1);
  _fwd.normalize();
  _right.crossVectors(UP, _fwd);

  out.local.copy(pose.local).addScaledVector(_fwd, s.appliedF).addScaledVector(_right, s.appliedL);
  out.walked = walkDistance(offset) + s.appliedF;
  out.g = gait(out.walked, s.moving * s.w);
  out.local.y = pose.local.y + heightAt(heights, out.local.x, out.local.z) + out.g.y;
  out.world.copy(out.local).applyQuaternion(SITE.quaternion).add(SITE.pos);

  _dir.copy(pose.target).sub(pose.position).normalize();
  out.yawAuth = Math.atan2(-_dir.x, -_dir.z);
  out.pitchAuth = Math.asin(MathUtils.clamp(_dir.y, -1, 1));
  out.yaw = out.yawAuth + s.yaw;
  out.pitch = MathUtils.clamp(out.pitchAuth + s.pitch, -1.35, 1.2);
  out.roll = out.g.roll;
  return out;
}

export const scratchGround = () => ({
  local: new Vector3(),
  world: new Vector3(),
  g: { y: 0, roll: 0, pitch: 0, sway: 0, stance: 0 },
  yaw: 0,
  yawAuth: 0,
  pitch: 0,
  pitchAuth: 0,
  roll: 0,
  walked: 0,
});
