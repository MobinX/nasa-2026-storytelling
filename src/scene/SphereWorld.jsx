import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { maps } from "../lib/textures.js";
import { MOON, MARS, R_MARS } from "../journey/worlds.js";
import { EARTH_AT, EARTH_R } from "../journey/pose.js";
import { journey } from "../state/journey.js";

// Lunar space: 1 unit is still ~145 km, so the Moon is a 12-unit sphere and Earth a 2-unit one 120 units
// away, which is its true 1.9 degree apparent size from the surface. Both are lit by the same directional
// light that the ground acts use, so the terminator and Earth's phase agree by construction.
//
// The same graph also carries the flight to Mars, which is why the Martian globe is a sibling rather than
// another component: leaving one world and arriving at the other has to be one continuous view, and the
// only thing that changes between them is which vertical the rig treats as up. Mars is 1.95x the Moon by
// radius and 400 units out, so it arrives as a disc growing into a world without ever being swapped.
export default function SphereWorld() {
  const group = useRef();
  const marsGroup = useRef();
  useFrame(() => {
    const on = journey.graphId === "moonSphere" || journey.graphId === "transfer";
    group.current.visible = on;
    if (!on) return;
    marsGroup.current.visible = journey.graphId === "transfer";
  });
  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[MOON.radius, 64, 32]} />
        <meshLambertMaterial map={maps.moon} color='#c9c9cf' />
      </mesh>
      <mesh position={EARTH_AT.toArray()}>
        <sphereGeometry args={[EARTH_R, 24, 14]} />
        <meshLambertMaterial map={maps.earth} />
      </mesh>
      <group ref={marsGroup} position={MARS.centre.toArray()} quaternion={MARS.spin.toArray()}>
        <mesh>
          <sphereGeometry args={[R_MARS, 64, 32]} />
          <meshLambertMaterial map={maps.mars} color='#bd7a58' />
        </mesh>
      </group>
    </group>
  );
}
