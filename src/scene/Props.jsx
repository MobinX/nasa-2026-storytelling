import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { heightAt } from "../lib/terrain.js";
import { stepEvent } from "../lib/gait.js";
import { journey } from "../state/journey.js";

const box = (w, h, d, x, y, z) => (new THREE.BoxGeometry(w, h, d)).translate(x, y, z);
const cyl = (r1, r2, h, x, y, z, seg = 10) => (new THREE.CylinderGeometry(r1, r2, h, seg, 1)).translate(x, y, z);
const cone = (r, h, x, y, z) => (new THREE.ConeGeometry(r, h, 12)).translate(x, y, z);

// No atmosphere means no aerial perspective, so range is carried by known-size objects alone. Every site
// comes from journey/pose.js, because that is the same data the walk rail and the framing assertions use.
// Merged so each prop is one draw call.
function buildLander() {
  const grey = [cyl(1.4, 1.9, 1.5, 0, 1.55, 0, 8), box(0.9, 0.12, 0.9, 0, 0.06, 0), cyl(0.07, 0.07, 1.3, 0.6, 3.0, 0.6), cyl(0.07, 0.07, 1.3, -0.6, 3.0, -0.6), box(0.5, 0.5, 0.45, 0, 3.6, 0)];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.7;
    grey.push(box(0.12, 2.6, 0.12, Math.cos(a) * 1.6, 0.9, Math.sin(a) * 1.6));
  }
  return { grey: mergeGeometries(grey), gold: mergeGeometries([cone(1.9, 1.1, 0, 2.3, 0), box(1.1, 0.7, 1.0, 0, 2.6, 0)]) };
}

// A second shape for a world with weather: same merged-primitive method, but a habitat with a mast and a
// six-wheeled rover, because nothing lands on Mars without wheels and nothing stays that has no wind to
// blame for the dust on it.
function buildHabitat() {
  const grey = [cyl(1.5, 1.5, 3.4, 0, 1.7, 0, 12), box(1.2, 1.0, 1.2, 0, 3.7, 0), cyl(0.08, 0.08, 2.2, 0.0, 4.6, 0), box(2.6, 0.16, 1.8, 0, 0.1, 0)];
  for (let i = 0; i < 3; i++) grey.push(box(0.5, 0.42, 0.5, -2.2 - i * 0.05, 0.42, 1.2 - i * 1.2));
  return { grey: mergeGeometries(grey), gold: mergeGeometries([cyl(1.56, 1.56, 1.0, 0, 2.9, 0, 12)]) };
}
function buildRover() {
  const body = [box(1.5, 0.55, 1.0, 0, 0.78, 0), box(0.34, 0.34, 0.34, 0.9, 1.2, 0), cyl(0.05, 0.05, 1.1, -0.2, 1.5, 0), box(0.7, 0.04, 0.5, -0.2, 2.05, 0)];
  for (let i = 0; i < 3; i++) for (const side of [-1, 1]) body.push(cyl(0.28, 0.28, 0.18, -0.62 + i * 0.62, 0.28, side * 0.56, 10));
  return mergeGeometries(body);
}

export default function Props({ heights, world }) {
  const LM_LOCAL = world.lm, FLAG_LOCAL = world.flag, PANEL_LOCAL = world.panel, MASTS_LOCAL = world.masts;
  const { grey, gold } = useMemo(world.air > 0 ? buildHabitat : buildLander, [world]);
  const flag = useMemo(() => mergeGeometries([cyl(0.035, 0.035, 2.3, 0, 1.15, 0, 6), box(0.86, 0.03, 0.57, 0.43, 2.05, 0)]), []);
  const roverGeo = useMemo(() => (world.rover ? buildRover() : null), [world]);
  const y = (x, z) => heightAt(heights, x, z);
  return (
    <group>
      <group position={[LM_LOCAL[0], y(LM_LOCAL[0], LM_LOCAL[2]), LM_LOCAL[2]]}>
        <mesh geometry={grey}>
          <meshStandardMaterial color='#9c9ca4' roughness={0.85} metalness={0.15} />
        </mesh>
        <mesh geometry={gold}>
          <meshStandardMaterial color='#b9862f' roughness={0.45} metalness={0.7} />
        </mesh>
      </group>
      {world.rover && (
        <group position={[world.rover[0], y(world.rover[0], world.rover[2]), world.rover[2]]} rotation={[0, 0.7, 0]}>
          <mesh geometry={roverGeo}>
            <meshStandardMaterial color='#c9ccd2' roughness={0.6} metalness={0.3} />
          </mesh>
        </group>
      )}
      <group position={[FLAG_LOCAL[0], y(FLAG_LOCAL[0], FLAG_LOCAL[2]), FLAG_LOCAL[2]]} rotation={[0, -0.5, 0]}>
        <mesh geometry={flag}>
          <meshStandardMaterial color='#c8c8cd' roughness={0.9} />
        </mesh>
      </group>
      <mesh position={[PANEL_LOCAL[0], y(PANEL_LOCAL[0], PANEL_LOCAL[2]) + 0.4, PANEL_LOCAL[2]]} rotation={[0.5, 0.6, 0]}>
        <boxGeometry args={[1.7, 0.06, 1.1]} />
        <meshStandardMaterial color='#2b3550' roughness={0.35} metalness={0.4} />
      </mesh>
      {MASTS_LOCAL.map(([x, z]) => (
        <mesh key={x} position={[x, y(x, z) + 1.1, z]}>
          <cylinderGeometry args={[0.05, 0.05, 2.2, 6]} />
          <meshStandardMaterial color='#c2c2c7' roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

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
