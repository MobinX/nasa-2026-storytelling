import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { heightAt } from "../lib/terrain.js";
import { journey } from "../state/journey.js";
import { dialogue } from "../state/dialogue.js";

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (r1, r2, h, x, y, z, seg = 8) => new THREE.CylinderGeometry(r1, r2, h, seg, 1).translate(x, y, z);

const _siteToLocal = new THREE.Quaternion();
const _cam = new THREE.Vector3();
const _above = new THREE.Vector3();

// A second suited figure, built the way the LM is: merged primitives, with only the joints that actually
// move broken out into their own mesh. Skinning is not on the table - no rig, no asset, and nothing to
// fetch it from on a phone connection.
//
// He faces the parked camera, which is where the listener stands.
const buildBody = () =>
  mergeGeometries([
    box(0.54, 0.66, 0.40, 0, 1.15, 0),
    box(0.46, 0.54, 0.22, 0, 1.26, -0.30),
    cyl(0.19, 0.19, 0.08, 0, 1.50, 0, 10),
    box(0.42, 0.20, 0.32, 0, 0.79, 0),
    box(0.19, 0.62, 0.24, -0.145, 0.44, 0.01),
    box(0.19, 0.62, 0.24, 0.145, 0.44, -0.01),
    box(0.21, 0.11, 0.31, -0.145, 0.06, 0.05),
    box(0.21, 0.11, 0.31, 0.145, 0.06, 0.03),
  ]);

const buildUpperArm = () => mergeGeometries([cyl(0.095, 0.085, 0.32, 0, -0.16, 0)]);
const buildForeArm = () => mergeGeometries([cyl(0.085, 0.075, 0.30, 0, -0.15, 0), box(0.12, 0.15, 0.11, 0, -0.35, 0.01)]);

const ease = (x, y, k, dt) => x + (y - x) * Math.min(1, k * dt);
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

export default function Companion({ heights, world }) {
  const COMPANION_LOCAL = world.companion;
  const PARKED = world.park;
  useMemo(() => _siteToLocal.copy(world.site.quaternion).invert(), [world]);
  const group = useRef();
  const head = useRef();
  const shoulderL = useRef();
  const shoulderR = useRef();
  const elbowL = useRef();
  const elbowR = useRef();
  const soft = useRef({ talk: 0, headYaw: 0 });

  const parts = useMemo(
    () => ({
      body: buildBody(),
      upper: buildUpperArm(),
      fore: buildForeArm(),
      helmet: new THREE.SphereGeometry(0.205, 14, 12),
      visor: new THREE.SphereGeometry(0.175, 12, 10),
      suitMat: new THREE.MeshStandardMaterial({ color: "#e6e7ea", roughness: 0.82, metalness: 0.04 }),
      glassMat: new THREE.MeshStandardMaterial({ color: "#c9a227", roughness: 0.22, metalness: 0.85 }),
      y: heightAt(heights, COMPANION_LOCAL[0], COMPANION_LOCAL[2]),
      // rotY(facing) maps the model's +z onto the direction from him to the end of the rail.
      facing: Math.atan2(PARKED[0] - COMPANION_LOCAL[0], PARKED[1] - COMPANION_LOCAL[2]),
    }),
    [heights],
  );

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const on = journey.graphId === world.graph;
    g.visible = on;
    if (!on) return;
    const d = Math.min(dt, 1 / 20);
    const t = state.clock.elapsedTime;
    // Gestures only come alive as the walk arrives, and only while he is mid-sentence. Eased rather than
    // switched: a raised hand popping up on the first caption character reads as a jump cut. This is not
    // the camera path, so a local ease is allowed here where the scroll budget forbids one.
    soft.current.talk = ease(soft.current.talk, dialogue.talking ? journey.talk : 0, 3.5, d);
    const talk = soft.current.talk;

    g.rotation.z = 0.012 * Math.sin(t * 0.55);
    g.position.y = parts.y + 0.006 * Math.sin(t * 1.1);

    // Head tracking, in his own body frame: the site-frame delta un-rotated by `facing`. Because he was
    // placed facing the parked camera, this reads ~0 where the conversation happens and grows as you
    // walk past him.
    _cam.copy(state.camera.position).sub(world.site.pos).applyQuaternion(_siteToLocal);
    const wx = _cam.x - COMPANION_LOCAL[0];
    const wz = _cam.z - COMPANION_LOCAL[2];
    const c = Math.cos(parts.facing);
    const s = Math.sin(parts.facing);
    const want = Math.atan2(c * wx - s * wz, s * wx + c * wz);
    soft.current.headYaw = ease(soft.current.headYaw, clamp(want, -0.75, 0.75), 2.2, d);
    head.current.rotation.set(-0.05 + 0.03 * Math.sin(t * 0.9), soft.current.headYaw, 0);

    // A two-handed explanatory gesture, arms out of phase so it reads as speech, not calisthenics. Arms
    // hang along -y, so a negative x rotation swings them forward.
    const idle = 0.10 + 0.05 * Math.sin(t * 0.7);
    shoulderL.current.rotation.set(-(idle + talk * (0.62 + 0.3 * Math.sin(t * 2.1))), 0, -0.16 - talk * 0.3);
    shoulderR.current.rotation.set(-(idle + talk * (0.55 + 0.3 * Math.sin(t * 2.1 + 2.4))), 0, 0.16 + talk * 0.3);
    elbowL.current.rotation.x = -0.24 - talk * (0.55 + 0.28 * Math.sin(t * 2.1 + 0.9));
    elbowR.current.rotation.x = -0.2 - talk * (0.62 + 0.28 * Math.sin(t * 2.1 + 3.3));

    // Where to hang the caption. Projected per frame rather than pinned to a screen corner, so the words
    // belong to him; the HUD clamps it back inside the safe area.
    _above.set(COMPANION_LOCAL[0], parts.y + 2.62, COMPANION_LOCAL[2]).applyQuaternion(world.site.quaternion).add(world.site.pos).project(state.camera);
    journey.companion.x = _above.x * 0.5 + 0.5;
    journey.companion.y = 0.5 - _above.y * 0.5;
    journey.companion.on = journey.talk > 0.5 && _above.z < 1;
  });

  return (
    <group ref={group} position={[COMPANION_LOCAL[0], parts.y, COMPANION_LOCAL[2]]} rotation={[0, parts.facing, 0]}>
      <mesh geometry={parts.body} material={parts.suitMat} />
      <group ref={head} position={[0, 1.52, 0]}>
        <mesh geometry={parts.helmet} material={parts.suitMat} position={[0, 0.12, 0]} />
        <mesh geometry={parts.visor} material={parts.glassMat} position={[0, 0.12, 0.055]} scale={[0.86, 0.78, 0.62]} />
      </group>
      <group ref={shoulderL} position={[-0.315, 1.4, 0]}>
        <mesh geometry={parts.upper} material={parts.suitMat} />
        <group ref={elbowL} position={[0, -0.32, 0]}>
          <mesh geometry={parts.fore} material={parts.suitMat} />
        </group>
      </group>
      <group ref={shoulderR} position={[0.315, 1.4, 0]}>
        <mesh geometry={parts.upper} material={parts.suitMat} />
        <group ref={elbowR} position={[0, -0.32, 0]}>
          <mesh geometry={parts.fore} material={parts.suitMat} />
        </group>
      </group>
    </group>
  );
}
