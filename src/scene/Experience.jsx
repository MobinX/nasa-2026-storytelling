import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor, useScroll } from "@react-three/drei";
import { journey } from "../state/journey.js";
import { TIERS } from "../lib/quality.js";
import { actAt, clamp01, groundWeight } from "../journey/timeline.js";
import { spaceAt, SUN_DIR } from "../journey/pose.js";
import CameraRig from "./CameraRig.jsx";
import SolarSystem from "./SolarSystem.jsx";
import MoonOrbit from "./MoonOrbit.jsx";
import MoonSurface from "./MoonSurface.jsx";
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

const SpaceWatcher = ({ onChange }) => {
  const scroll = useScroll();
  const last = useRef("solar");
  useFrame(() => {
    const o = clamp01(scroll.offset);
    journey.offset = o;
    journey.raw = clamp01(scroll.scroll.current);
    journey.actId = actAt(o).id;
    const id = spaceAt(o).id;
    if (id !== last.current) {
      last.current = id;
      journey.spaceId = id;
      onChange(id);
    }
  });
  return null;
};

// Escalate and degrade by mutating dpr and per-object visibility only; remounting would re-link shaders,
// which costs 50-300ms on mobile drivers. maxTier latches after two declines so a hot phone does not
// oscillate against its own thermal curve.
const Tiers = () => {
  const setDpr = useThree((s) => s.setDpr);
  const state = useRef({ declines: 0, inclines: 0 });
  const set = (t) => {
    journey.tier = Math.max(0, Math.min(TIERS.length - 1, t));
    setDpr(TIERS[journey.tier].dpr);
    journey.dpr = TIERS[journey.tier].dpr;
  };
  return (
    <PerformanceMonitor
      iterations={8}
      ms={500}
      threshold={0.7}
      bounds={() => [24, 45]}
      onDecline={() => {
        const st = state.current;
        st.declines++;
        set(journey.tier - 1);
        if (st.declines >= 2) journey.maxTier = Math.min(journey.maxTier, journey.tier);
        st.inclines = 0;
      }}
      onIncline={() => {
        const st = state.current;
        st.inclines++;
        if (st.inclines >= 3 && journey.tier < journey.maxTier) set(journey.tier + 1);
      }}
      onFallback={() => set(0)}
    />
  );
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

export default function Experience({ terrain }) {
  const [space, setSpace] = useState("solar");
  return (
    <>
      <ScrollGuard />
      <ShaderWarmup />
      <FrameMeter />
      <Tiers />
      <SpaceWatcher onChange={setSpace} />
      <ScrollFreeze />
      <CameraRig heights={terrain.heights} />
      <SunLight direction={SUN_DIR} />
      <StarDome />
      <SunGlow direction={SUN_DIR} />
      {space === "solar" && <SolarSystem />}
      <MoonOrbit />
      <MoonSurface terrain={terrain} />
    </>
  );
}
