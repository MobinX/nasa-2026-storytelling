import { Quaternion, Vector3 } from "three";

// The conversation orbit: while a stop holds the scroll, the crew member and the visitor circle the object
// instead of standing still and talking across it. It opens on the first frame of the greeting, sweeps 270
// degrees of bearing round the machine as the conversation runs, and is back on the trail by the last
// sentence - so the thing the visitor sees when they scroll on is the exact pose the thing saw when they
// arrived. See scene/CameraRig.jsx for where it is applied and scene/Companion.jsx for the figure that
// travels with it.
//
// It is a function of the conversation *and* of the clock, which is the whole reason it is a state machine
// rather than a curve. A curve of the conversation alone is what this used to be: it sat at zero through the
// greeting, because nobody had been asked anything yet, so the arrival, the machine and the man talking about
// it were all perfectly still for the first twenty seconds of every stop. The clock is the floor - the arc
// keeps going while the visitor reads a question - and the conversation is the accelerator, so the sweep ends
// with the talk rather than running ahead of it.
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
// which is why a stop chooses which way round it goes (see journey/stops.js). tools/check-journey.mjs sweeps
// the whole 270 at every stop and refuses the build if any sample leaves the frame, is hidden by the ground,
// or comes too near somebody else's hardware.
export const ORBIT_ARC = (270 * Math.PI) / 180;

const DEG = Math.PI / 180;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// The shape of the sweep: none at all at the start and the end of the conversation, and widest exactly
// halfway through it, with zero derivative at all three - so the hold neither begins with a jerk, nor has to
// be stopped when it is over, and the quarter of a lap it does not travel is the quarter it never sees. The
// ends are returned as an exact zero rather than as sin(pi)^2, which is a float and not nothing: the rig
// releases the scroll the moment the arc is home, and "home" has to mean home.
export const orbitSwing = (w) => {
  const x = clamp01(w);
  if (x <= 0 || x >= 1) return 0;
  const s = Math.sin(Math.PI * x);
  return s * s;
};

// The clock floor: on this much wall clock alone the pair have been all the way round the machine and back,
// which is longer than a stop takes to read out. A visitor who has the page open on one crew member for two
// and a half minutes gets the whole sweep anyway rather than a photograph.
const SWEEP_SECONDS = 150;

// Two rate ceilings. Outward, because a visitor hammering the caption taps cannot make the arc jump a
// distance the talk has already covered; inward, because the way back is the walk off and it is allowed to be
// brisker than the look round. A stop read at its own pace never touches either: a minute and a half of
// conversation carries the arc at ten degrees a second at its fastest, and the caps are set above that so the
// motion is the conversation's, not the throttle's.
const OUT_RATE = 12 * DEG;
const HOME_RATE = 24 * DEG;

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

// The one writer of the arc. `stop` is the stop currently holding the scroll, or null when nothing is;
// `content` is the monotone 0..1 of the whole conversation, greeting included; `finished` is that the
// visitor has answered it. Returns the signed angle to swing the pair by and whose object to swing them
// about - the two can differ for a moment, because leaving a stop mid-arc has to keep turning the pose it is
// leaving until it is home.
export function stepOrbit(stop, delta, content = 0, finished = false) {
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

  // Away from the stop, the conversation no longer matters: the target is home and the only question is how
  // fast the picture gets back to the rail it came off.
  if (!stop) {
    state.w = 1;
    state.u = follow(state.u, 0, LEAVE_RATE, delta);
    if (state.u === 0) clear();
    return { theta: state.u * dir(held), stop: held, closing: true };
  }

  if (!state.released) {
    // Answered means answered: whatever the conversation clock had got to, the sweep's remaining job is to
    // get home. Leaving the target where a slow reader had left it would hold the scroll for the rest of the
    // floor's minutes.
    if (finished) state.w = 1;
    else state.w = Math.max(state.w + delta / SWEEP_SECONDS, clamp01(content));
    const target = ORBIT_ARC * orbitSwing(state.w);
    state.u = follow(state.u, target, target > state.u ? OUT_RATE : HOME_RATE, delta);
    // Home, and nothing left to say. One frame later the rig drops the hold and the rail has its pose back.
    if (finished && state.u === 0) state.released = true;
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
