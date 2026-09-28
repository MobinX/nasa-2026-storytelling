import { useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { heightAt } from "../lib/terrain.js";
import { instance } from "../lib/models.js";
import { journey } from "../state/journey.js";
import Companion from "./Companion.jsx";

// Everything the visitor walks up to, drawn from the walk schedule: the model named by objects.json, and
// the crew member standing beside it. The stop is the single source of truth, so the thing, the person,
// the caption and the offset the scroll is held at all come from one row of authored data.
//
// `heights` is null in deep space, where there is no ground to plant a leg in: the objects then sit at
// their local offsets and the crew member floats at his.
export default function WalkObjects({ stops, site, heights, graph }) {
  const groups = stops.map((stop) => <WalkObject key={stop.id} stop={stop} site={site} heights={heights} graph={graph} />);
  return <group>{groups}</group>;
}

function WalkObject({ stop, site, heights, graph }) {
  const root = useMemo(() => new THREE.Group(), []);
  // Nothing is planted in deep space: the object hangs at its authored offset, and on a surface it sits on
  // the terrain. Both cases put the model's own base (y=0 in the file) where the stop says it belongs.
  const ground = heights ? (x, z) => heightAt(heights, x, z) : () => 0;
  const proxy = useMemo(() => {
    const g = new THREE.BoxGeometry(Math.max(0.6, stop.half * 1.4), Math.max(0.4, stop.top * 0.7), Math.max(0.6, stop.half * 1.4));
    g.translate(0, Math.max(0.4, stop.top * 0.35), 0);
    return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: "#9c9ca4", roughness: 0.85, metalness: 0.15 }));
  }, [stop]);

  const model = useMemo(() => instance(stop.model, proxy), [stop, proxy]);
  const y = ground(stop.obj[0], stop.obj[2]) + (heights ? 0 : stop.obj[1]);
  useMemo(() => {
    root.position.set(stop.obj[0], y, stop.obj[2]);
    root.rotation.y = stop.yaw;
    root.add(model);
  }, [root, model, y]);

  useFrame(() => {
    root.visible = journey.graphId === graph;
  });

  return (
    <>
      <primitive object={root} />
      <Companion stop={stop} site={site} heights={heights} graph={graph} ground={ground} />
    </>
  );
}
