import { useRef } from "react";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { useFrame } from "@react-three/fiber";
import { useScroll } from "@react-three/drei";
import { poseAt, scratchPose, walkRate } from "../journey/pose.js";
import { SURFACE_STOPS, clamp01, smoothstep } from "../journey/timeline.js";
import { groundPose, scratchGround } from "../journey/ground.js";
import { stepOrbit, orbitHolds, orbitPose } from "../journey/orbit.js";
import { journey } from "../state/journey.js";
import { dialogue } from "../state/dialogue.js";

const UP = new Vector3(0, 1, 0);
const _m = new Matrix4();
const _e = new Euler(0, 0, 0, "YXZ");
const _q = new Quaternion();

// Scroll speed to gait amplitude. The speed is the rail's real one - metres per unit of offset times the
// scroll rate - so the parked touchdown and hold legs, which advance a screen of scroll against
// centimetres, get no bob at all and the walking legs get the full lope. With the physical 1.62 m lunar
// stride that is a 9 Hz vibration at a fast flick, so the band-pass tapers it back to a glide. Footprint
// spacing still comes from stepEvent() at the true stride, so the tracks never lie about distance.
const gaitAmplitude = (metresPerSecond) => smoothstep(metresPerSecond, 0.15, 0.9) * (1 - smoothstep(metresPerSecond, 6, 18));

// Which stop list belongs to which space. The approach and the flights have none: only a walk does.
const STOPS_OF = { ground: SURFACE_STOPS.moon, marsGround: SURFACE_STOPS.mars, eva: SURFACE_STOPS.solar };

// The only writer of the camera, and a pure function of scroll.offset with one exception: a stop holds the
// offset where it arrived until its conversation is finished. The exception is kept out of the pose math -
// it clamps the input and pins the scroller, it never edits a pose - so scrub-back purity survives for
// every offset that is not currently being argued about.
//
// The height field is per world, and the rig is the only thing that knows which one the offset is standing
// on, so it takes both and picks per frame.
export default function CameraRig({ terrains }) {
  const scroll = useScroll();
  const pose = scratchPose();
  const ground = useRef(scratchGround());

  useFrame(({ camera }, delta) => {
    const d = Math.min(delta, 1 / 20);
    const raw = clamp01(scroll.offset);
    poseAt(raw, pose);
    const list = STOPS_OF[pose.space.id];
    let held = 0;
    let stopId = null;
    let stopRef = null;
    if (list) {
      for (const stop of list) {
        // A finished conversation hands the rail back as soon as the arc has come home, not the instant the
        // last caption is tapped: letting go mid-sweep would cut the camera sideways off the machine.
        if (raw >= stop.lock && (!journey.done[stop.id] || orbitHolds(stop.id))) {
          if (stop.lock >= held) stopRef = stop;
          held = Math.max(held, stop.lock);
          stopId = stop.id;
        }
      }
    }
    const o = held ? Math.min(raw, held) : raw;
    if (held) {
      // Pin the scroller, or the visitor's flick runs ahead of the hold and the release jumps.
      const el = scroll.el;
      if (el) {
        const max = el.scrollHeight - el.clientHeight;
        const want = 1 + held * (max - 1);
        if (Math.abs(el.scrollTop - want) > 1) el.scrollTop = want;
      }
    }
    if (o !== raw) poseAt(o, pose);

    // The conversation orbit. The offset is pinned for the whole hold, so the picture could not move on its
    // own; the arc is what moves it, opening on the first frame of the greeting, sweeping 270 degrees round
    // the machine as he talks, and coming back along itself before the hold lets go (see journey/orbit.js).
    // orbitPose rotates the arrival pose - camera, look target and standing position - about the object's own
    // vertical by that angle; because the target is authored to sit on the axis the machine stays dead centre,
    // and because the angle is only ever released at zero the walking rail is handed back the exact pose it
    // arrived with. This is the rig's second deviation from a pure function of the offset, and like the first
    // it stays out of the pose maths: it rotates the pose, it never edits the rail.
    const orb = stepOrbit(stopRef, d, dialogue.progress, !!stopRef && !!journey.done[stopRef.id]);
    if (orb.theta) orbitPose(pose, orb.stop, orb.theta);
    journey.orbitTheta = orb.theta;
    journey.orbitStop = orb.stop ? orb.stop.id : null;
    journey.orbitClosing = orb.closing;

    const local = pose.space.local;
    const world = pose.world;
    journey.graphId = pose.space.graph;
    journey.worldId = world.id;
    journey.air = local ? world.air : 0;
    journey.offset = o;
    journey.raw = raw;
    journey.lock = { engaged: !!held, offset: held, id: stopId };
    journey.talkStop = stopId;
    journey.talk = held ? 1 : 0;
    journey.walkActive = local && o > world.walkIn;

    if (!local) {
      camera.position.copy(pose.position);
      // The reference up is the site normal of the body the camera is looking down at, not the world's.
      // Every hand-off into a surface act is a frame of nothing but regolith, so a frame that rolls with
      // the wrong vertical would rotate the ground pattern across the cut.
      _m.lookAt(pose.position, pose.target, pose.space.id === "solar" ? UP : world.site.n);
      camera.quaternion.setFromRotationMatrix(_m);
    } else {
      const gp = groundPose(o, terrains[world.id].heights, pose, ground.current, gaitAmplitude(walkRate(pose.space, o) * (scroll.delta / d)));
      camera.position.copy(gp.world);
      _e.set(gp.pitch, gp.yaw, gp.roll, "YXZ");
      camera.quaternion.copy(_q.setFromEuler(_e).premultiply(world.site.quaternion));
      journey.camLocal.x = gp.local.x;
      journey.camLocal.z = gp.local.z;
      journey.yaw = gp.yaw;
      journey.walked = gp.walked;
    }

    let dirty = false;
    if (camera.near !== pose.space.near || camera.far !== pose.space.far) {
      camera.near = pose.space.near;
      camera.far = pose.space.far;
      dirty = true;
    }
    if (Math.abs(camera.fov - pose.fov) > 1e-3) {
      camera.fov = pose.fov;
      dirty = true;
    }
    // R3F refreshes the projection matrix for declarative prop changes only, never for these writes.
    if (dirty) camera.updateProjectionMatrix();
  });

  return null;
}
