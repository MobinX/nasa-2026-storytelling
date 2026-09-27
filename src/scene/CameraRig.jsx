import { useRef } from "react";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { useFrame } from "@react-three/fiber";
import { useScroll } from "@react-three/drei";
import { SITE, poseAt, scratchPose, walkRate } from "../journey/pose.js";
import { WALK_IN, clamp01, smoothstep } from "../journey/timeline.js";
import { groundPose, scratchGround } from "../journey/ground.js";
import { journey } from "../state/journey.js";

const UP = new Vector3(0, 1, 0);
const _m = new Matrix4();
const _e = new Euler(0, 0, 0, "YXZ");
const _q = new Quaternion();

// Scroll speed to gait amplitude. The speed is the rail's real one - metres per unit of offset times the
// scroll rate - so the touchdown leg, which advances a quarter of the act against two tenths of a metre,
// gets no bob at all and the walking legs get the full lope. With the physical 1.62 m lunar stride an
// ordinary one-screen-per-second flick would run at ~9 Hz, which reads as a vibration rather than a walk,
// so the band-pass tapers a violent flick back to a glide. Footprint spacing still comes from stepEvent()
// at the true stride, so the tracks never lie about distance.
const gaitAmplitude = (metresPerSecond) => smoothstep(metresPerSecond, 0.15, 0.9) * (1 - smoothstep(metresPerSecond, 6, 18));

// The only writer of the camera, and now a pure function of scroll.offset: scrubbing backwards reproduces
// every pose exactly. drei's internal ScrollControls damp is the whole smoothing budget - anything
// derived from the offset that gets damped a second time feels rubber-bandy.
export default function CameraRig({ heights }) {
  const scroll = useScroll();
  const pose = scratchPose();
  const ground = useRef(scratchGround());

  useFrame(({ camera }, delta) => {
    const d = Math.min(delta, 1 / 20);
    const o = clamp01(scroll.offset);
    poseAt(o, pose);
    journey.walkActive = pose.space.local && o > WALK_IN;
    // The crew member starts talking when the walk has actually finished. Gated at 0.97 rather than 1 so
    // an overscroll bounce at the bottom of the page cannot flicker the whole dialogue panel.
    journey.encounter = smoothstep(o, 0.97, 0.985);

    if (!pose.space.local) {
      camera.position.copy(pose.position);
      // Near the cut the camera is standing on the site, so the reference up is the site normal rather
      // than the world's. The ground act inherits orientation from here, and world +y is ~89 degrees
      // from the landing site's normal - handing that off would put the horizon sideways.
      _m.lookAt(pose.position, pose.target, pose.space.id === "lunar" ? SITE.n : UP);
      camera.quaternion.setFromRotationMatrix(_m);
    } else {
      const gp = groundPose(o, heights, pose, ground.current, gaitAmplitude(walkRate(o) * (scroll.delta / d)));
      camera.position.copy(gp.world);
      _e.set(gp.pitch, gp.yaw, gp.roll, "YXZ");
      camera.quaternion.copy(_q.setFromEuler(_e).premultiply(SITE.quaternion));
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
