import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useScroll } from "@react-three/drei";
import { journey } from "../state/journey.js";
import { actAt, clamp01 } from "../journey/timeline.js";
import { SUN_DIR } from "../journey/pose.js";
import { MOON, MARS } from "../journey/worlds.js";
import CameraRig from "./CameraRig.jsx";
import SolarSystem from "./SolarSystem.jsx";
import SphereWorld from "./SphereWorld.jsx";
import GroundWorld from "./GroundWorld.jsx";
import EvaWorld from "./EvaWorld.jsx";
import SunLight from "../lights/SunLight.jsx";
import { StarDome, SunGlow } from "./Sky.jsx";

// ScrollControls only attaches its `scroll` listener while R3F's event target is its own scroller, and
// <Canvas> re-connects the outer div from a dependency-free effect on every viewport change - the Android
// URL bar collapsing mid-flick is enough. Without this the listener is dropped and never returns, and
// the journey freezes at whatever offset it reached with no error anywhere.
const ScrollGuard = () => {
  const events = useThree((s) => s.events);
  const scroll = useScroll();
  useFrame(() => {
    const connected = events.connected === scroll.el;
    if (!connected) events.connect?.(scroll.el);
    journey.connected = connected;
    journey.scrollEl = scroll.el;
  });
  return null;
};

// three's compile() walks with traverseVisible, so the acts that are hidden at boot never link their
// programs - and a mobile shader link costs 50-300ms, which lands exactly on the orbit-to-surface cut.
// Flipping everything visible and compiling inside a useFrame runs before this frame's gl.render, so the
// mixed frame is never drawn.
const ShaderWarmup = () => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    const t0 = performance.now();
    const hidden = [];
    scene.traverse((o) => {
      if (o.visible === false) {
        o.visible = true;
        hidden.push(o);
      }
    });
    try {
      gl.compile(scene, camera);
    } finally {
      for (const o of hidden) o.visible = false;
    }
    journey.warmedMs = performance.now() - t0;
  });
  return null;
};

const FrameMeter = () => {
  const gl = useThree((s) => s.gl);
  const acc = useRef({ t: 0, frames: 0 });
  useFrame((_, delta) => {
    const a = acc.current;
    a.t += delta;
    a.frames++;
    if (a.t < 0.5) return;
    journey.fps = a.frames / a.t;
    a.t = 0;
    a.frames = 0;
    const info = gl.info;
    journey.gl.calls = info.render.calls;
    journey.gl.tris = info.render.triangles;
    journey.gl.programs = info.programs ? info.programs.length : 0;
    journey.gl.textures = info.memory.textures;
  });
  return null;
};

// The DOM-side snapshot. Nothing here can be React state: the graph that is drawn is decided inside the
// frame loop by each component reading journey.graphId, and a setState on a space change would re-render
// the Canvas, which is exactly how the scroll listener used to get unhitched.
const Snapshot = () => {
  const scroll = useScroll();
  useFrame(() => {
    // The rig owns journey.offset, because a held stop is not the same number as the scroller.
    journey.raw = clamp01(scroll.scroll.current);
    journey.actId = actAt(journey.offset).id;
  });
  return null;
};

// ?freeze=0.699 parks the journey on a seam frame so the two sides can be screenshotted and compared.
const ScrollFreeze = () => {
  const scroll = useScroll();
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("freeze");
    if (raw === null) return;
    const o = clamp01(Number(raw));
    const max = scroll.el.scrollHeight - scroll.el.clientHeight;
    scroll.el.scrollTop = 1 + o * (max - 1);
  }, [scroll]);
  return null;
};

export default function Experience({ terrains }) {
  return (
    <>
      <ScrollGuard />
      <ShaderWarmup />
      <FrameMeter />
      <Snapshot />
      <ScrollFreeze />
      <CameraRig terrains={terrains} />
      <SunLight direction={SUN_DIR} />
      <StarDome />
      <SunGlow direction={SUN_DIR} />
      <SolarSystem />
      <SphereWorld />
      <GroundWorld world={MOON} terrain={terrains.moon} />
      <GroundWorld world={MARS} terrain={terrains.mars} />
      <EvaWorld />
    </>
  );
}
