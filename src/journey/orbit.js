import { Quaternion, Vector3 } from "three";

// The conversation orbit: while a stop holds the scroll, the crew member and the visitor circle the object
// instead of standing still and talking across it. The clock opens the arc whenever the stop is held, walks
// them out to the far side over the first twenty-two seconds, keeps them there while the briefing and any
// questions run, and brings them home on the frame the visitor chooses to move on. The pose handed back to
// the walking rail is exactly the pose it gave up, so sliding away is a walk rather than a cut.
//
// It used to be a function of a four-round conversation's progress. The rounds are gone; what is left is the
// hold itself, which is a clock and a direction. The actor on the far side is the right picture for the new
// questions: the visitor and the crew member look across the machine at each other while the answer streams,
// and the return happens only after the visitor has decided to leave.
//
// The angle is never allowed to stop anywhere but the arrival pose, and the rig will not let a finished
// conversation go until it has come back to it. That is the one promise the walking rail is owed: a hold that
// released mid-sweep would cut the camera sideways off the machine at the exact moment the visitor asks to
// move on.

// 270 degrees of bearing, off the arrival pose: three quarters of a lap of the machine, and the farthest the
// arc goes. The camera, the look target and the standing position all rotate rigidly about the object's own
// vertical, so nothing inside the frame moves - the subject, the crew member and the portrait all keep the
// size and place the stop was authored for, and only the machine itself turns to show a different side. That
// rigidity is what makes a wide arc affordable; what limits it is whatever else stands on the same ground,
// which is why a stop chooses which way round it goes (see journey/stops.js). tools/check-orbit.mjs sweeps
// the whole 270 at every stop and refuses the build if any sample leaves the frame, is hidden by the ground,
// or comes too near somebody else's hardware.
export const ORBIT_ARC = (270 * Math.PI) / 180;

const DEG = Math.PI / 180;

// How long the pair take to reach the far side. The outbound is a smoothstep, so neither the first frame nor
// the arrival at the far side has a velocity pop; twenty-two seconds is a stroll round the hardware rather
// than a turntable, and leaves the visitor looking across the machine while they read the options and ask.
const OUT_SECONDS = 22;
const OUT_RATE = 22 * DEG;

// The way back after the visitor has chosen to leave. It is deliberately brisker than the outbound: they have
// already made the decision, and the hold is still pinning the scroller while it happens, so this is the one
// turn in the piece that owes the visitor speed rather than ceremony. The `coming round` hint covers it.
const HOME_RATE = 90 * DEG;

// And off the arc entirely, for a visitor who scrolled away mid-sweep: the scroll is not held any more, so
// the picture has to rejoin the walking rail quickly without a cut.
const LEAVE_RATE = 60 * DEG;

const state = { stop: null, w: 0, u: 0, released: false };

const clear = () => {
  state.stop = null;
  state.w = 0;
  state.u = 0;
  state.released = false;
};

// The shape of the outward walk: none at all on the first frame, and settled on the far side with no
// velocity pop. It is monotone, which is all the rig's promise needs.
export const orbitOut = (w) => {
  const x = w < 0 ? 0 : w > 1 ? 1 : w;
  return x * x * (3 - 2 * x);
};

// The one writer of the arc. `stop` is the stop currently holding the scroll, or null when nothing is;
// `finished` is that the visitor has chosen to move on. Returns the signed angle to swing the pair by and
// whose object to swing them about - the two can differ for a moment, because leaving a stop mid-arc has to
// keep turning the pose it is leaving until it is home.
export function stepOrbit(stop, delta, finished = false) {
  if (stop !== state.stop) {
    if (stop) {
      state.stop = stop;
      state.w = 0;
      state.u = 0;
      state.released = false;
    } else if (!state.stop || state.released) {
      clear();
      return { theta: 0, stop: null, closing: false };
    }
  }
  const held = state.stop;
  if (!held) return { theta: 0, stop: null, closing: false };

  // Away from the stop, the visitor is walking; the only question is how fast the picture gets back to the
  // rail it came off.
  if (!stop) {
    state.u = follow(state.u, 0, LEAVE_RATE, delta);
    if (state.u === 0) clear();
    return { theta: state.u * dir(held), stop: held, closing: true };
  }

  if (!state.released) {
    if (finished) {
      state.u = follow(state.u, 0, HOME_RATE, delta);
      // Home, and nothing left to say. One frame later the rig drops the hold and the rail has its pose back.
      if (state.u === 0) state.released = true;
    } else {
      state.w = Math.min(1, state.w + delta / OUT_SECONDS);
      state.u = follow(state.u, ORBIT_ARC * orbitOut(state.w), OUT_RATE, delta);
    }
  }
  return { theta: state.u * dir(held), stop: held, closing: finished && !state.released };
}

const dir = (stop) => (stop.orbit < 0 ? -1 : 1);

const follow = (u, target, rate, delta) => {
  const room = target - u;
  const step = rate * delta;
  if (Math.abs(room) <= step) return target;
  return u + Math.sign(room) * step;
};

// Whether a finished conversation has still got the scroll, because its arc has not come home yet.
export const orbitHolds = (id) => !!state.stop && state.stop.id === id && !state.released;

// For the headless sweep: put the arc away as though nothing is being argued about.
export const resetOrbit = () => clear();

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

// One inverse of each site's orientation, cached against the site object itself, so a figure standing on the
// Moon can never find itself reading the camera's position through the frame of the Martian site - which is
// what a scratch quaternion shared by every crew member in the scene did, and it put four of the ten of
// them facing the way the machine was going rather than the way the visitor was.
const _inverses = new Map();
export function siteLocal(site, worldPoint, out) {
  let inv = _inverses.get(site);
  if (!inv) {
    inv = site.quaternion.clone().invert();
    _inverses.set(site, inv);
  }
  return out.copy(worldPoint).sub(site.pos).applyQuaternion(inv);
}

const _pivot = new Vector3();

// The pivot on the object's vertical axis, in world units. The y does not matter - the axis is a line through
// (ox, oz) parallel to the world's normal and every point on it is fixed by the rotation - so it is the
// object's own authored height, which is right for a machine hanging in deep space and harmless when it is
// standing on the ground.
export const orbitPivot = (world, obj, out = new Vector3()) =>
  out.set(obj[0], obj[1], obj[2]).applyQuaternion(world.site.quaternion).add(world.site.pos);

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

// Where the crew member stands at one point of the arc, and which way he has to turn to keep briefing the
// visitor: his own rigid spin about the machine, then a facing recomputed every frame from where the eye
// actually got to. Both halves belong here rather than in the component so that
// tools/check-journey.mjs can put the same question to all ten stops over the whole sweep - he is either
// looking at the visitor or the stop is broken, and there is no third answer. `camLocal` is the eye in the
// site's own metres, from siteLocal(). Writes `out` (x, z) and returns the yaw.
export function crewStation(stop, theta, camLocal, out) {
  out.set(stop.crew[0], 0, stop.crew[2]);
  spinAboutY(out, stop.obj[0], stop.obj[2], theta);
  return facingToward(out.x, out.z, camLocal.x, camLocal.z);
}
