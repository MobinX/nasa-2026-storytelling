import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { journey } from "../state/journey.js";
import { dialogue } from "../state/dialogue.js";
import { spinAboutY, facingToward } from "../journey/orbit.js";
import { reveal } from "../lib/surface.js";

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (r1, r2, h, x, y, z, seg = 8) => new THREE.CylinderGeometry(r1, r2, h, seg, 1).translate(x, y, z);

const _siteToLocal = new THREE.Quaternion();
const _cam = new THREE.Vector3();
const _above = new THREE.Vector3();
const _pos = new THREE.Vector3();

// A suited figure beside every object the visitor walks up to, built the way the hardware is: merged
// primitives, with only the joints that actually move broken out into their own mesh. Skinning is not on
// the table - no rig, no asset, and nothing to fetch it from on a phone connection.
//
// He faces the spot the rail parks at, which is the stop's camera position, so the conversation is
// eye-to-eye without anyone steering. Only the crew member whose stop is currently holding the scroll
// claims the caption anchor; two bubbles fighting over the same DOM node is worse than none.
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

const shared = (() => {
  const body = buildBody(), upper = buildUpperArm(), fore = buildForeArm();
  return {
    body, upper, fore,
    helmet: new THREE.SphereGeometry(0.205, 14, 12),
    visor: new THREE.SphereGeometry(0.175, 12, 10),
    // Gold-tinted and metallic, which is what a real helmet visor is - and in a scene with no environment
    // to mirror, a metal is a mirror that reflects nothing. lib/surface.js is what stops his face being a
    // black hole at the centre of every conversation.
    suitMat: reveal(new THREE.MeshStandardMaterial({ color: "#e6e7ea", roughness: 0.82, metalness: 0.04 })),
    glassMat: reveal(new THREE.MeshStandardMaterial({ color: "#c9a227", roughness: 0.22, metalness: 0.85 })),
  };
})();

const ease = (x, y, k, dt) => x + (y - x) * Math.min(1, k * dt);
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

export default function Companion({ stop, site, heights, graph, ground }) {
  const group = useRef();
  const head = useRef();
  const shoulderL = useRef();
  const shoulderR = useRef();
  const elbowL = useRef();
  const elbowR = useRef();
  const soft = useRef({ talk: 0, headYaw: 0, float: 0 });
  useMemo(() => _siteToLocal.copy(site.quaternion).invert(), [site]);

  // On a surface he stands on the regolith; in deep space he hangs at the elevation the stop author for him.
  const y = useMemo(() => (heights ? ground(stop.crew[0], stop.crew[2]) : stop.crew[1]), [stop, ground, heights]);
  const facing = useMemo(() => Math.atan2(stop.cam[0] - stop.crew[0], stop.cam[2] - stop.crew[2]), [stop]);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const on = journey.graphId === graph;
    g.visible = on;
    if (!on) return;
    const d = Math.min(dt, 1 / 20);
    const t = state.clock.elapsedTime;
    const mine = journey.talkStop === stop.id;
    // Gestures only come alive while he is the one talking, and only mid-sentence. Eased rather than
    // switched: a raised hand popping up on the first caption character reads as a jump cut. This is not
    // the camera path, so a local ease is allowed where the scroll budget forbids one.
    soft.current.talk = ease(soft.current.talk, dialogue.talking && mine ? journey.talk : 0, 3.5, d);
    soft.current.float = ease(soft.current.float, heights ? 0 : 1, 1.6, d);
    const talk = soft.current.talk;
    const floater = soft.current.float;

    g.rotation.z = 0.012 * Math.sin(t * 0.55) + floater * 0.1 * Math.sin(t * 0.33);

    // The visitor, in the site's own metres, and the crew member carried round the object by the same arc
    // the rig applied to the camera (journey.orbitTheta). Both are spun about the object's [x,z] in the site
    // frame, so he stays across the machine from the visitor for the whole conversation rather than being
    // overtaken by them - which is the whole point of moving the pair together. `face` is recomputed every
    // frame from the visitor's real position, so he turns to keep briefing whoever he is talking to.
    _cam.copy(state.camera.position).sub(site.pos).applyQuaternion(_siteToLocal);
    // Only the crew member whose conversation is holding the scroll travels the arc; his neighbours stand
    // still, because journey.orbitTheta is the held stop's angle and every figure in this graph would
    // otherwise swing round its own machine in sympathy.
    const theta = mine ? journey.orbitTheta : 0;
    _pos.set(stop.crew[0], 0, stop.crew[2]);
    spinAboutY(_pos, stop.obj[0], stop.obj[2], theta);
    const crewX = _pos.x;
    const crewZ = _pos.z;
    g.position.x = crewX;
    g.position.z = crewZ;
    // His feet follow the ground he is actually standing on, not the ground he was parked on: the orbit
    // walks him a few metres across the regolith, and on a field with real relief that is enough to float
    // him or bury him by several centimetres if the height is frozen at the arrival spot.
    const stand = heights ? ground(crewX, crewZ) : stop.crew[1];
    g.position.y = stand + 0.006 * Math.sin(t * 1.1) + floater * 0.5 * Math.sin(t * 0.21);
    const face = facingToward(crewX, crewZ, _cam.x, _cam.z);
    g.rotation.y = face;

    // Head tracking, in his own body frame: the site-frame delta un-rotated by `face`. Because the body has
    // already turned to the visitor, this reads ~0 while they are talking and grows as the head leads the
    // turn - which is the head-turn the orbit is meant to read as.
    const wx = _cam.x - crewX;
    const wz = _cam.z - crewZ;
    const c = Math.cos(face);
    const s = Math.sin(face);
    const want = Math.atan2(c * wx - s * wz, s * wx + c * wz);
    soft.current.headYaw = ease(soft.current.headYaw, clamp(want, -0.75, 0.75), 2.2, d);
    head.current.rotation.set(-0.05 + 0.03 * Math.sin(t * 0.9) - floater * 0.12, soft.current.headYaw, floater * 0.2);

    // A two-handed explanatory gesture, arms out of phase so it reads as speech, not calisthenics. Arms
    // hang along -y, so a negative x rotation swings them forward; a floater lets them drift wide.
    const idle = 0.10 + 0.05 * Math.sin(t * 0.7) + floater * (0.22 + 0.06 * Math.sin(t * 0.4));
    shoulderL.current.rotation.set(-(idle + talk * (0.62 + 0.3 * Math.sin(t * 2.1))), 0, -0.16 - talk * 0.3);
    shoulderR.current.rotation.set(-(idle + talk * (0.55 + 0.3 * Math.sin(t * 2.1 + 2.4))), 0, 0.16 + talk * 0.3);
    elbowL.current.rotation.x = -0.24 - talk * (0.55 + 0.28 * Math.sin(t * 2.1 + 0.9));
    elbowR.current.rotation.x = -0.2 - talk * (0.62 + 0.28 * Math.sin(t * 2.1 + 3.3));

    if (!mine) return;
    // Where to hang the caption. Projected per frame rather than pinned to a screen corner, so the words
    // belong to him; the HUD clamps it back inside the safe area. Taken from his orbiting position rather
    // than the parked one, so the bubble stays above him as he walks round the machine.
    _above.set(crewX, stand + 2.62, crewZ).applyQuaternion(site.quaternion).add(site.pos).project(state.camera);
    journey.companion.x = _above.x * 0.5 + 0.5;
    journey.companion.y = 0.5 - _above.y * 0.5;
    journey.companion.on = journey.talk > 0.5 && _above.z < 1;
  });

  return (
    <group ref={group} position={[stop.crew[0], y, stop.crew[2]]} rotation={[0, facing, 0]}>
      <mesh geometry={shared.body} material={shared.suitMat} />
      <group ref={head} position={[0, 1.52, 0]}>
        <mesh geometry={shared.helmet} material={shared.suitMat} position={[0, 0.12, 0]} />
        <mesh geometry={shared.visor} material={shared.glassMat} position={[0, 0.12, 0.055]} scale={[0.86, 0.78, 0.62]} />
      </group>
      <group ref={shoulderL} position={[-0.315, 1.4, 0]}>
        <mesh geometry={shared.upper} material={shared.suitMat} />
        <group ref={elbowL} position={[0, -0.32, 0]}>
          <mesh geometry={shared.fore} material={shared.suitMat} />
        </group>
      </group>
      <group ref={shoulderR} position={[0.315, 1.4, 0]}>
        <mesh geometry={shared.upper} material={shared.suitMat} />
        <group ref={elbowR} position={[0, -0.32, 0]}>
          <mesh geometry={shared.fore} material={shared.suitMat} />
        </group>
      </group>
    </group>
  );
}
