import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { journey } from "../state/journey.js";

// Airless body: one hard directional source and effectively no fill. Ambient past ~0.05 makes the black
// sky lie, and there is no atmosphere to scatter, so no <Environment>/HDRI and no hemisphere light.
// In the solar act the sun is a body in the scene and everything is unlit by design.
//
// The ground act runs brighter than the sphere act for one reason: the sun sits 20 degrees up, so a
// horizontal field only catches a third of it, and a frame that is entirely ground and contains no sky
// measured as under-exposed on the phone. Surface photographs of a bright mare agree.
const INTENSITY = { lunar: 2.35, ground: 2.8 };

export default function SunLight({ direction }) {
  const light = useRef();
  useFrame(() => {
    const on = journey.spaceId !== "solar";
    light.current.visible = on;
    if (!on) return;
    light.current.position.copy(direction).multiplyScalar(400);
    const want = INTENSITY[journey.spaceId];
    if (light.current.intensity !== want) light.current.intensity = want;
  });
  return (
    <>
      <directionalLight ref={light} color="#fff6e8" intensity={INTENSITY.lunar} />
      <ambientLight color="#0a0a0e" intensity={0.014} />
    </>
  );
}
