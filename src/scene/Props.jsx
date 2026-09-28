import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { heightAt } from "../lib/terrain.js";
import { stepEvent } from "../lib/gait.js";
import { journey } from "../state/journey.js";

// The hardware in the walk is data - objects.json names a glTF for every stop and scene/WalkObjects.jsx
// draws it beside its crew member - so this file is left with the two things that are not objects at all:
// the visitor's own tracks, and their own shadow. Both follow the camera, which is why they belong to the
// surface act rather than to a stop.

const PRINT_N = 64;
const alphaMap = () => {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 24;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 12, 1, 32, 12, 26);
  grd.addColorStop(0, "#ffffff");
  grd.addColorStop(1, "#000000");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 24);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
};

// Regolith records every step and there is no wind, so tracks are physically required. A fresh print is
// DARKER (compaction kills the backscatter surge), hence MultiplyBlending rather than a lightened decal.
export function Footprints({ heights, world }) {
  const mesh = useRef();
  const last = useRef(-1);
  const i = useRef(0);
  const { geo, mat } = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.3, 0.1);
    g.rotateX(-Math.PI / 2);
    return {
      geo: g,
      mat: new THREE.MeshBasicMaterial({
        alphaMap: alphaMap(),
        // A fresh lunar print is DARKER - compaction kills the backscatter surge - so it multiplies. On
        // Mars the opposite happens: the wind covers the shadowed crust with bright dust, so a track is a
        // light scar that fades over sols rather than staying for four billion years.
        color: world.air > 0 ? "#d8b193" : "#000000",
        transparent: true,
        depthWrite: false,
        blending: THREE.MultiplyBlending,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    };
  }, []);

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    m.visible = journey.graphId === world.graph;
    if (!m.visible) return;
    const step = stepEvent(journey.walked);
    if (step === last.current) return;
    last.current = step;
    const p = journey.camLocal;
    const side = step % 2 ? 0.11 : -0.11;
    const x = p.x + Math.cos(journey.yaw) * side;
    const z = p.z + Math.sin(journey.yaw) * side;
    const mtx = new THREE.Matrix4().makeRotationY(-journey.yaw).setPosition(x, heightAt(heights, x, z) + 0.02, z);
    m.setMatrixAt(i.current % PRINT_N, mtx);
    i.current++;
    m.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geo, mat, PRINT_N]} frustumCulled={false} renderOrder={2} />;
}

// One multiply-blended oval stretched along the sun vector: real shadows would cost a full depth pass and
// 4-12 PCF taps for a contact shadow nobody resolves at 1.7 m. It is also the only object whose motion
// is unambiguously the viewer's, so it doubles as a speed gauge.
export function BlobShadow({ heights, world }) {
  const mesh = useRef();
  const { geo, mat } = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    return { geo: g, mat: new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.MultiplyBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }) };
  }, []);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const on = journey.graphId === world.graph;
    m.visible = on;
    if (!on) return;
    const p = journey.camLocal;
    const sun = world.sunLocal;
    const el = Math.max(0.2, sun.y);
    m.position.set(p.x, heightAt(heights, p.x, p.z) + 0.03, p.z);
    m.rotation.y = Math.atan2(-sun.x, -sun.z);
    m.scale.set(0.5 + 1.4 / el, 1, 0.6 + 1.8 / el);
    m.material.opacity = world.air > 0 ? 0.22 : 0.6;
  });
  return <mesh ref={mesh} geometry={geo} material={mat} renderOrder={2} />;
}
