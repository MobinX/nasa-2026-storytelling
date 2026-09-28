import { MathUtils, Quaternion, Vector3 } from "three";
import { walkDistance } from "./pose.js";
import { heightAt } from "../lib/terrain.js";
import { gait } from "../lib/gait.js";
import { rumble, walkWeight } from "./timeline.js";

const UP = new Vector3(0, 1, 0);
const _fwd = new Vector3();
const _right = new Vector3();
const _dir = new Vector3();
const _localToSite = new Quaternion();

// Composition of a surface act: the scroll offset advances the authored rail and the camera is dropped
// onto the displaced terrain of whichever world is underfoot. The one additive term is the touchdown
// rumble, and it is a function of the offset like everything else, so the rig can be scrubbed backwards
// bit-for-bit on both planets.
//
// yaw and pitch are the site's LOCAL frame, not the world's. The world +y axis is about 89 degrees from
// the lunar landing site's normal, so expressing a standing person's gaze with a world-up Euler puts the
// horizon sideways across the frame. The rig composes these with the site quaternion instead.
export function groundPose(offset, heights, pose, out, moving = 1) {
  const world = pose.world;
  const site = world.site;
  _localToSite.copy(site.quaternion).invert();

  _fwd.copy(pose.sample.tangent);
  _fwd.y = 0;
  if (_fwd.lengthSq() < 1e-8) _fwd.set(0, 0, 1);
  _fwd.normalize();
  _right.crossVectors(UP, _fwd);

  const shake = rumble(offset, world.contact, world.impactEnd);
  out.local.copy(pose.local);
  out.walked = walkDistance(pose.space, offset);
  out.g = gait(out.walked, moving * walkWeight(offset, world.walkIn), world.gait);
  out.local.y = pose.local.y + heightAt(heights, out.local.x, out.local.z) + out.g.y + shake * 0.12;
  out.world.copy(out.local).applyQuaternion(site.quaternion).add(site.pos);

  _dir.copy(pose.target).sub(pose.position).applyQuaternion(_localToSite);
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
