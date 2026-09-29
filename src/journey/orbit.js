import { Quaternion, Vector3 } from "three";

// The conversation orbit: while a stop is holding the scroll, the crew member and the visitor circle the
// object together instead of standing still and talking across it. It is a partial arc that leaves the
// arrival pose, sweeps around the machine and comes back, so the last thing it does is hand the rail back
// the exact pose it took - which is the only way "answer him and slide on" reads as walking again rather
// than as a cut. See scene/CameraRig.jsx for where it is applied and scene/Companion.jsx for the figure
// that travels with it.
//
// It is a function of the conversation, not of the scroll: the offset is pinned for the whole hold, so the
// picture could not move on its own. `dialogue.progress` is the monotone 0..1 the HUD writes as the caption
// types and the rounds are answered, and this is the only place it becomes a pose.

// How far around the object the pair travels at the peak of the arc, in radians. 1.3 rad is ~74 degrees:
// far enough that the machine is clearly being walked around rather than looked at from a second angle,
// and short enough that neither the subject nor the crew member leaves the portrait frame the stop was
// authored for at any point in the arc. The binding stop is mars-opportunity, whose crew member is already
// framed at ndc 0.978 against the 0.98 edge when parked - tools/check-journey.mjs sweeps exactly this arc
// at every stop and fails the build if any sample leaves the frame, so this number is a measured ceiling,
// not a taste. Raising it means re-authoring a stop's framing, not widening a tolerance.
export const ORBIT_ARC = 1.3;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// The shape of the arc: zero at both ends and widest in the middle, with zero derivative at both ends so
// the orbit neither starts with a jerk nor has to be stopped when the conversation ends - at progress 0 it
// is the arrival pose and at progress 1 it is the arrival pose again, so the release is seamless by
// construction. sin^2(pi p) is that curve in one term.
export const orbitSwing = (progress) => {
  const s = Math.sin(Math.PI * clamp01(progress));
  return s * s;
};

// The signed angle to rotate the pair by, `dir` being which way round the object this stop circles.
export const orbitAngle = (progress, dir = 1) => ORBIT_ARC * orbitSwing(progress) * (dir < 0 ? -1 : 1);

const _q = new Quaternion();
const UP = new Vector3(0, 1, 0);

// a rotation of theta about a local +y, applied to a point in the site's own (x, z) plane. The same sense
// as three's own right-handed yaw (setFromAxisAngle about +y), so a value authored here and the site
// quaternion compose without a mirror.
export function spinAboutY(v, ox, oz, theta) {
  const c = Math.cos(theta), s = Math.sin(theta);
  const dx = v.x - ox, dz = v.z - oz;
  v.x = ox + dx * c + dz * s;
  v.z = oz - dx * s + dz * c;
  return v;
}

// The world-space twin: rotate `v` about the vertical axis through `pivot`. Used on the flight branch,
// where a pose is a world position and a world look target rather than a standing position in a site
// frame, and on the camera's own target so it keeps the machine in the middle of the picture.
export function spinAboutAxis(v, pivot, axis, theta) {
  _q.setFromAxisAngle(axis, theta);
  return v.sub(pivot).applyQuaternion(_q).add(pivot);
}

// The facing a figure needs to keep looking at a point, in the site's own frame: the same atan2 the crew
// member is parked with, evaluated per frame so he turns with the visitor instead of staring past him.
export const facingToward = (fromX, fromZ, toX, toZ) => Math.atan2(toX - fromX, toZ - fromZ);

// A pivot on the object's vertical axis, in world units. The y does not matter - the axis is a line through
// (ox, oz) parallel to the world's normal and every point on it is fixed by the rotation - so it is the
// object's own authored height, which is right for a machine hanging in deep space and harmless when it is
// standing on the ground.
export const orbitPivot = (world, obj, out = new Vector3()) =>
  out.set(obj[0], obj[1], obj[2]).applyQuaternion(world.site.quaternion).add(world.site.pos);

const _pivot = new Vector3();

// The whole orbit, applied to a pose: the one place both the rig and the checker turn the pair around the
// object, so they cannot drift. `pose` is the rig's scratch pose (world `position`, world `target`, and -
// in a surface act - `local` in the site's own metres), and `stop` is the conversation's stop. The camera,
// the look target and the standing position all rotate about the object's own vertical by the same angle,
// which is what keeps the machine dead centre and the crew member across it from the visitor. A no-op at
// theta 0, so the arrival pose is returned untouched and the walking rail is handed back exactly what it
// took. Mutates and returns `pose`.
export function orbitPose(pose, stop, theta) {
  if (!theta || !stop) return pose;
  const world = pose.world;
  // The vertical the pose is already built against, exactly as the rig's lookAt picks it: the solar diagram
  // is world-up, every other space stands on its own site normal - and the deep-space act's frames use
  // Mars's normal because that is the site it borrows its orientation from.
  const axis = pose.space.id === "solar" ? UP : world.site.n;
  orbitPivot(world, stop.obj, _pivot);
  spinAboutAxis(pose.position, _pivot, axis, theta);
  spinAboutAxis(pose.target, _pivot, axis, theta);
  // Only the standing branch reads `local`, and there its pivot is the object's [x,z] in the site's own
  // metres; the flight branch hands back world coordinates in `local`, where that pivot would be nonsense.
  if (pose.space.local) spinAboutY(pose.local, stop.obj[0], stop.obj[2], theta);
  return pose;
}