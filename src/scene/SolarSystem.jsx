import { useMemo } from "react";
import { MathUtils, RingGeometry } from "three";
import { useFrame } from "@react-three/fiber";
import { BODIES, SUN_U, EARTH, MOON_DOT_U, MOON_ORBIT_U, MOON_THETA, thetaAt } from "../lib/bodies.js";
import { maps } from "../lib/textures.js";
import { radializeRing } from "../lib/geometry.js";
import { makeGlow } from "../lib/glow.js";
import { journey } from "../state/journey.js";
import OrbitRings from "./OrbitRings.jsx";
import Labels from "./Labels.jsx";

const holders = [];
const spinners = [];
const TILT = BODIES.map((b) => MathUtils.degToRad(b.tilt));
const SATURN = BODIES.find((b) => b.id === "saturn");
const RING_IN = SATURN.radius * 1.11;
const RING_OUT = SATURN.radius * 2.27;

export default function SolarSystem() {
  const ringGeo = useMemo(() => radializeRing(new RingGeometry(RING_IN, RING_OUT, 96, 1), RING_IN, RING_OUT), []);
  const glows = useMemo(() => [makeGlow({ color: "#fff2d6", power: 9 }), makeGlow({ color: "#ffcf94", power: 2.2, corona: "0.3", limb: "5.0" })], []);
  useFrame(({ clock }) => {
    const o = journey.offset;
    const t = clock.elapsedTime;
    for (let i = 0; i < BODIES.length; i++) {
      const h = holders[i], b = BODIES[i];
      if (!h) continue;
      const th = thetaAt(b, o);
      h.position.set(Math.cos(th) * b.orbit, 0, Math.sin(th) * b.orbit);
      if (spinners[i]) spinners[i].rotation.y = (t * 0.1 * (24 / Math.abs(b.rotH))) * Math.sign(b.rotH);
    }
  });

  return (
    <>
      <OrbitRings />
      <Labels holders={holders} />
      <group>
        <mesh rotation={[0, 0, 0]}>
          <sphereGeometry args={[SUN_U, 24, 16]} />
          <meshBasicMaterial color='#fff3d9' toneMapped={false} />
        </mesh>
        {glows.map((m, i) => (
          <mesh key={i} material={m} renderOrder={10}>
            <planeGeometry args={[SUN_U * (i ? 9 : 3.4), SUN_U * (i ? 9 : 3.4)]} />
          </mesh>
        ))}
      </group>

      {BODIES.map((b, i) => (
        <group key={b.id} ref={(el) => (holders[i] = el)}>
          <group ref={(el) => (spinners[i] = el)} rotation={[0, 0, TILT[i]]}>
            <mesh>
              <sphereGeometry args={[b.radius, b.segments[0], b.segments[1]]} />
              <meshBasicMaterial color={b.colour} map={maps[b.id]} toneMapped={false} />
            </mesh>
            {b.id === "saturn" && (
              <mesh geometry={ringGeo} renderOrder={3}>
                <meshBasicMaterial map={maps.saturnRing} transparent alphaTest={0.02} depthWrite={false} side={2} toneMapped={false} opacity={0.92} />
              </mesh>
            )}
          </group>

          {b === EARTH && (
            <mesh position={[Math.cos(MOON_THETA) * MOON_ORBIT_U, 0, Math.sin(MOON_THETA) * MOON_ORBIT_U]}>
              <sphereGeometry args={[MOON_DOT_U, 16, 10]} />
              <meshBasicMaterial color='#c9c9cd' map={maps.moon} toneMapped={false} />
            </mesh>
          )}
        </group>
      ))}
    </>
  );
}

