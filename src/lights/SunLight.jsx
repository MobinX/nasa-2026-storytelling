import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { journey } from "../state/journey.js";

// Airless body: one hard directional source and effectively no fill. Ambient past ~0.05 makes the black
// sky lie, and there is no atmosphere to scatter, so no <Environment>/HDRI and no hemisphere light.
// In the solar act the sun is a body in the scene and everything is unlit by design.
export default function SunLight({ direction, intensity = 2.35 }) {
  const light = useRef();
  useFrame(() => {
    const on = journey.spaceId !== "solar";
    light.current.visible = on;
    if (on) light.current.position.copy(direction).multiplyScalar(400);
  });
  return (
    <>
      <directionalLight ref={light} color="#fff6e8" intensity={intensity} />
      <ambientLight color="#0a0a0e" intensity={0.014} />
    </>
  );
}
