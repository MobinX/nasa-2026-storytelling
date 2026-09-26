import { useRef } from "react";
import { Euler, Matrix4, MathUtils, Vector3 } from "three";
import { useFrame } from "@react-three/fiber";
import { useScroll } from "@react-three/drei";
import { poseAt, scratchPose } from "../journey/pose.js";
import { clamp01, groundWeight } from "../journey/timeline.js";
import { consumeLook, input } from "../state/input.js";
import { groundPose, scratchGround } from "../journey/ground.js";
import { journey } from "../state/journey.js";

const UP = new Vector3(0, 1, 0);
const _m = new Matrix4();
const _e = new Euler(0, 0, 0, "YXZ");
const LOOK = { dx: 0, dy: 0 };

const LAT_MAX = 6.5;
const FWD_MAX = 4.0;
const FWD_BACK = 1.5;
const LOOK_SENS = 0.0055;   // 0.32 deg per pixel: a 300px thumb drag turns about a right angle
const MOVE_SPEED = 2.35;
const MAX_PITCH = 0.62;

const damp = (x, y, lambda, dt) => MathUtils.lerp(x, y, 1 - Math.exp(-lambda * dt));

// The only writer of the camera. Everything is a pure function of scroll.offset plus the additive player
// state, so scrubbing backwards is exact. The single exception is the input integrators, which are
// damped because they are input, not scroll - drei's internal damp is the whole smoothing budget for
// the scroll path and damping it twice is what makes scroll-driven cameras feel rubber-bandy.
export default function CameraRig({ heights }) {
  const scroll = useScroll();
  const pose = scratchPose();
  const ground = useRef(scratchGround());
  const s = useRef({ forward: 0, lateral: 0, appliedF: 0, appliedL: 0, yaw: 0, pitch: 0, seeded: false });

  useFrame(({ camera }, delta) => {
    const d = Math.min(delta, 1 / 20);
    const o = clamp01(scroll.offset);
    poseAt(o, pose);
    const w = groundWeight(o);
    const st = s.current;
    journey.groundWeight = w;
    journey.walkActive = pose.space.local && w > 0.5;
    input.enabled = journey.walkActive;

    if (!pose.space.local) {
      camera.position.copy(pose.position);
      _m.lookAt(pose.position, pose.target, UP);
      camera.quaternion.setFromRotationMatrix(_m);
      st.seeded = false;
      st.forward = damp(st.forward, 0, 0.55, d);
      st.lateral = damp(st.lateral, 0, 0.55, d);
      st.appliedF = damp(st.appliedF, 0, 7, d);
      st.appliedL = damp(st.appliedL, 0, 7, d);
    } else {
      if (!st.seeded) {
        st.seeded = true;
        st.yaw = 0;
        st.pitch = 0;
        st.forward = 0;
        st.lateral = 0;
      }
      // The accumulators must be cleared here, by the single consumer, or every frame re-applies the
      // whole history and drag-look compounds quadratically.
      consumeLook(LOOK);
      st.yaw += LOOK.dx * LOOK_SENS;
      st.pitch = MathUtils.clamp(st.pitch + LOOK.dy * LOOK_SENS, -MAX_PITCH, MAX_PITCH);
      LOOK.dx = 0;
      LOOK.dy = 0;

      const mx = journey.walkActive ? input.move.x : 0;
      const my = journey.walkActive ? input.move.y : 0;
      st.forward = MathUtils.clamp(st.forward + my * MOVE_SPEED * d, -FWD_BACK, FWD_MAX);
      st.lateral = MathUtils.clamp(st.lateral + mx * MOVE_SPEED * d, -LAT_MAX, LAT_MAX);
      st.appliedF = damp(st.appliedF, st.forward * w, 5, d);
      st.appliedL = damp(st.appliedL, st.lateral * w, 5, d);

      const gp = groundPose(o, { appliedF: st.appliedF, appliedL: st.appliedL, moving: Math.min(1, Math.hypot(mx, my)), w, yaw: st.yaw, pitch: st.pitch }, heights, pose, ground.current);
      camera.position.copy(gp.world);
      _e.set(gp.pitch, gp.yaw, gp.roll, "YXZ");
      camera.quaternion.setFromEuler(_e);
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
