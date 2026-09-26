import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { maps } from "../lib/textures.js";
import { R_SPHERE, EARTH_AT, EARTH_R, SITE } from "../journey/pose.js";
import { journey } from "../state/journey.js";

// Lunar space: 1 unit is still ~145 km, so the Moon is a 12-unit sphere and Earth a 2-unit one 120
// units away, which is its true 1.9 degree apparent size from the surface. Both are lit by the same
// directional light that the ground act uses, so the terminator and Earth's phase agree by construction.
export default function MoonOrbit() {
  const group = useRef();
  useFrame(() => {
    group.current.visible = journey.spaceId === "lunar";
  });
  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[R_SPHERE, 64, 32]} />
        <meshLambertMaterial map={maps.moon} color='#c9c9cf' />
      </mesh>
      <mesh position={EARTH_AT.toArray()}>
        <sphereGeometry args={[EARTH_R, 24, 14]} />
        <meshLambertMaterial map={maps.earth} />
      </mesh>
      <mesh position={SITE.pos.toArray()} visible={false}>
        <sphereGeometry args={[0.01, 4, 2]} />
        <meshBasicMaterial />
      </mesh>
    </group>
  );
}
