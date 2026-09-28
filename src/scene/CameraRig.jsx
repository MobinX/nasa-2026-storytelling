import { useRef } from "react";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { useFrame } from "@react-three/fiber";
import { useScroll } from "@react-three/drei";
import { poseAt, scratchPose, walkRate } from "../journey/pose.js";
import { MOON_TALK_IN, MOON_TALK_OUT, MARS_TALK_IN, clamp01, smoothstep } from "../journey/timeline.js";
import { groundPose, scratchGround } from "../journey/ground.js";
import { journey } from "../state/journey.js";

const UP = new Vector3(0, 1, 0);
const _m = new Matrix4();
const _e = new Euler(0, 0, 0, "YXZ");
const _q = new Quaternion();

// Scroll speed to gait amplitude. The speed is the rail's real one - metres per unit of offset times the
// scroll rate - so the parked touchdown and conversation legs, which advance eighths of the act against
// centimetres, get no bob at all and the walking legs get the full lope. With the physical 1.62 m lunar
// stride that is a 9 Hz vibration at a fast flick, so the band-pass tapers it back to a glide. Footprint
// spacing still comes from stepEvent() at the true stride, so the tracks never lie about distance.
const gaitAmplitude = (metresPerSecond) => smoothstep(metresPerSecond, 0.15, 0.9) * (1 - smoothstep(metresPerSecond, 6, 18));

// A conversation window, not a step: the lunar one has to close again, because the ascent continues past
// it and a speech bubble hovering over a crew member who is 30 m and falling behind is worse than none.
const window_ = (o, open, close) => Math.min(smoothstep(o, open, open + 0.012), 1 - smoothstep(o, close - 0.005, close + 0.005));

// The only writer of the camera, and a pure function of scroll.offset: scrubbing backwards reproduces
// every pose exactly. drei's internal ScrollControls damp is the whole smoothing budget - anything
// derived from the offset that gets damped a second time feels rubber-bandy.
// The height field is per world, and the rig is the only thing that knows which one the offset is
// standing on, so it takes both and picks per frame.
export default function CameraRig({ terrains }) {
  const scroll = useScroll();
  const pose = scratchPose();
  const ground = useRef(scratchGround());

  useFrame(({ camera }, delta) => {
    const d = Math.min(delta, 1 / 20);
    const o = clamp01(scroll.offset);
    poseAt(o, pose);
    const local = pose.space.local;
    const world = pose.world;
    journey.graphId = pose.space.graph;
    journey.worldId = world.id;
    journey.air = local ? world.air : 0;
    journey.moon.talk = window_(o, MOON_TALK_IN, MOON_TALK_OUT);
    journey.mars.talk = Math.min(1, smoothstep(o, MARS_TALK_IN, MARS_TALK_IN + 0.012));
    journey.walkActive = local && o > world.walkIn;
    journey.talk = local ? (world.id === "mars" ? journey.mars.talk : journey.moon.talk) : 0;

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
