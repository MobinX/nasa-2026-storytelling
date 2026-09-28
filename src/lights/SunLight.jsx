import { useRef } from "react";
import { Color } from "three";
import { useFrame } from "@react-three/fiber";
import { journey } from "../state/journey.js";
import { BY_ID, MOON } from "../journey/worlds.js";

// Airless body: one hard directional source and effectively no fill - no <Environment>/HDRI and no hemisphere
// light, because there is no atmosphere to scatter. The fill stays near nothing for the ground's sake rather
// than the sky's: the stars and the sky dome are unlit geometry that ambient cannot reach, but the regolith
// can see ambient, and the one thing that makes a lunar noon look like a lunar noon is that a shadow cast on
// it is black. The hardware does not have to live with that, and does not: lib/surface.js gives every vehicle
// its own bounce between its own panels, which is the part a single beam cannot show.
//
// Two things change per world, and both are about the light rather than the camera. The Moon's sun sits 20
// degrees up, so a horizontal field only catches a third of it and a frame with no sky in it measured as
// under-exposed on the phone, which is why the surface act lifts the directional. Mars is the reverse case:
// two thirds the flux, but a dusty sky that converts most of it into diffuse fill, so the directional drops
// and the ambient climbs - which is why there is no black shadow anywhere in the second half of the piece.
export default function SunLight({ direction }) {
  // Read once at render for the initial props, then owned by the frame loop. journey is mutable state and
  // not React state, so this cannot trigger the Canvas re-render that unhooks the scroller.
  const start = BY_ID[journey.worldId] || MOON;
  const light = useRef();
  const fill = useRef();
  useFrame(() => {
    const on = journey.graphId !== "solar";
    light.current.visible = on;
    if (!on) return;
    light.current.position.copy(direction).multiplyScalar(400);
    const world = BY_ID[journey.worldId];
    if (light.current.intensity !== world.sunIntensity) {
      light.current.intensity = world.sunIntensity;
      // Assigned rather than mutated: the headless harness sets JSX attributes wholesale, so a Color it
      // replaces with a string would stay a string, and this component must run identically under both.
      light.current.color = new Color(world.sunColor);
      fill.current.intensity = world.ambient;
      fill.current.color = new Color(world.ambientColor);
    }
  });
  return (
    <>
      <directionalLight ref={light} color={start.sunColor} intensity={start.sunIntensity} />
      <ambientLight ref={fill} color={start.ambientColor} intensity={start.ambient} />
    </>
  );
}
