import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { ScrollControls } from "@react-three/drei";
import Experience from "./scene/Experience.jsx";
import Hud from "./ui/Hud.jsx";
import { journey } from "./state/journey.js";
import { isSoftwareRenderer, MAX_TIER, resolveDpr } from "./lib/quality.js";
import { PAGES, DISTANCE, DAMPING, CAMERA } from "./journey/timeline.js";

// Module scope for every config literal: R3F compares these and re-applies them, and a <Canvas>
// re-render is what unhooks ScrollControls. The camera is driven imperatively, never by props or state.
const DPR = [1, 2];
const GL = { antialias: true, alpha: false, stencil: false, powerPreference: "high-performance", preserveDrawingBuffer: false };
const CAM = { fov: 50, near: CAMERA.orbit.near, far: CAMERA.orbit.far, position: [26, 42, 124] };
const RESIZE = { scroll: false, debounce: { scroll: 200, resize: 250 } };
const SCROLL_STYLE = { overscrollBehavior: "contain", touchAction: "pan-y" };

const onCreated = ({ gl, viewport, setDpr, setFrameloop }) => {
  THREE.Cache.enabled = true;
  gl.toneMappingExposure = 0.95;
  journey.dpr = viewport.dpr;
  journey.caps.maxTextureSize = gl.capabilities.maxTextureSize;
  journey.caps.maxAnisotropy = gl.capabilities.getMaxAnisotropy();
  journey.caps.webgl2 = gl.capabilities.isWebGL2;
  const ctx = gl.getContext();
  const dbg = ctx.getExtension("WEBGL_debug_renderer_info");
  if (dbg) journey.caps.renderer = String(ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL)).slice(0, 44);
  // The budget is set once here and never revisited: nothing degrades the picture mid-journey now, so a
  // hot phone keeps tier 3 and ?tier=0..2 is the only way down. A software GL takes it itself.
  const forced = new URLSearchParams(window.location.search).get("tier");
  journey.software = isSoftwareRenderer(gl);
  if (journey.software && forced === null) setFrameloop("never");
  journey.tier = forced === null ? (journey.software ? 0 : MAX_TIER) : Math.max(0, Math.min(MAX_TIER, Number(forced) || 0));
  setDpr(resolveDpr(journey.tier));
  // R3F 9 has no visibilitychange handling and a phone in a Termux session throttles thermally within
  // a couple of minutes; leaving the loop running in a background tab is how it gets hot for nothing.
  if (setFrameloop) document.addEventListener("visibilitychange", () => setFrameloop(document.hidden ? "never" : "always"));
};

export default function App({ terrains }) {
  return (
    <>
      <Canvas dpr={DPR} gl={GL} camera={CAM} resize={RESIZE} shadows={false} frameloop='always' onCreated={onCreated}>
        <color attach='background' args={["#000000"]} />
        <ScrollControls pages={PAGES} distance={DISTANCE} damping={DAMPING} style={SCROLL_STYLE}>
          <Experience terrains={terrains} />
        </ScrollControls>
      </Canvas>
      <Hud />
    </>
  );
}
