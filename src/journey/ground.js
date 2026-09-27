import { MathUtils, Quaternion, Vector3 } from "three";
import { SITE, walkDistance } from "./pose.js";
import { heightAt } from "../lib/terrain.js";
import { gait } from "../lib/gait.js";
import { impact, walkWeight } from "./timeline.js";

const UP = new Vector3(0, 1, 0);
const _fwd = new Vector3();
const _right = new Vector3();
const _dir = new Vector3();
const _LOCAL_TO_SITE = new Quaternion(SITE.quaternion.x, SITE.quaternion.y, SITE.quaternion.z, SITE.quaternion.w).invert();

// Composition of the ground act: the scroll offset advances the authored rail and the camera is dropped
// onto the displaced terrain. The one additive term is the touchdown rumble, and it is a function of the
// offset like everything else, so the rig can still be scrubbed backwards bit-for-bit.
//
// yaw and pitch are the site's LOCAL frame, not the world's. The world +y axis is about 89 degrees from
// the landing site's normal, so expressing a standing person's gaze with a world-up Euler puts the lunar
// horizon sideways across the frame. The rig composes these with SITE.quaternion instead.
export function groundPose(offset, heights, pose, out, moving = 1) {
  _fwd.copy(pose.sample.tangent);
  _fwd.y = 0;
  if (_fwd.lengthSq() < 1e-8) _fwd.set(0, 0, 1);
  _fwd.normalize();
  _right.crossVectors(UP, _fwd);

  const shake = impact(offset);
  out.local.copy(pose.local);
  out.walked = walkDistance(offset);
  out.g = gait(out.walked, moving * walkWeight(offset));
  out.local.y = pose.local.y + heightAt(heights, out.local.x, out.local.z) + out.g.y + shake * 0.12;
  out.world.copy(out.local).applyQuaternion(SITE.quaternion).add(SITE.pos);

  _dir.copy(pose.target).sub(pose.position).applyQuaternion(_LOCAL_TO_SITE);
  out.yawAuth = Math.atan2(-_dir.x, -_dir.z);
  out.pitchAuth = Math.asin(MathUtils.clamp(_dir.y / _dir.length(), -1, 1));
  out.yaw = out.yawAuth + shake * 0.085;
  out.pitch = out.pitchAuth - shake * 0.22;
  out.roll = out.g.roll + shake * 0.15;
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
