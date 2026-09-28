import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { EVA } from "../journey/worlds.js";
import { STOPS } from "../journey/stops.js";
import WalkObjects from "./WalkObjects.jsx";
import { journey } from "../state/journey.js";

// The last act, in metres, at a spot out beyond Mars. It is drawn on top of the transfer graph rather than
// instead of it: the spheres of Mars and the Moon and the star dome are the backdrop, and the two machines
// are the foreground, which is the only way a scale change of 10^5 can look like one continuous flight.
//
// There is no ground here, so nothing is planted: the objects sit at their authored offsets and so does the
// crew member beside each of them.
export default function EvaWorld() {
  const group = useRef();
  useFrame(() => {
    group.current.visible = journey.graphId === EVA.graph;
  });
  return (
    <group ref={group} position={EVA.site.pos.toArray()} quaternion={EVA.site.quaternion.toArray()}>
      <WalkObjects stops={STOPS.solar} site={EVA.site} heights={null} graph={EVA.graph} />
    </group>
  );
}
