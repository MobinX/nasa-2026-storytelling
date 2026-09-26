import { useEffect, useRef, useState } from "react";
import { journey } from "../state/journey.js";
import { ACTS, PAGES } from "../journey/timeline.js";
import { attachControls } from "./controls.js";

const DEBUG = typeof window !== "undefined" ? !new URLSearchParams(window.location.search).has("plain") : true;
const PAINT_MS = 100;
const FLICK_GAP_MS = 320;
const FLICK_MIN_DELTA = 0.012;

// Fixed DOM siblings of <Canvas>: the HUD must never re-render the Canvas, and the pads sit above the
// scroller so they can claim gestures. pointer-events stays off until the walk act unlocks them.
export default function Hud() {
  const [, setTick] = useState(0);
  const stick = useRef(null);
  const look = useRef(null);
  const edge = useRef({ time: 0, offset: 0, paint: 0 });

  useEffect(() => attachControls(stick.current, look.current), []);

  useEffect(() => {
    let raf = 0;
    const loop = (t) => {
      const e = edge.current;
      const o = journey.offset;
      if (o > e.offset + FLICK_MIN_DELTA && t - e.time > FLICK_GAP_MS) journey.flicks++;
      if (o !== e.offset) e.time = t;
      e.offset = o;
      if (t - e.paint > PAINT_MS) {
        e.paint = t;
        setTick((n) => (n + 1) & 1023);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rows = [
    ["act", journey.actId],
    ["offset", (journey.offset * 100).toFixed(1) + "%"],
    ["scroll", journey.scrollAlive ? "responding" : "awaiting input"],
    ["flicks", journey.flicks + " / " + PAGES + " screens"],
  ];
  const fine = [
    ["fps", journey.fps.toFixed(0)],
    ["draws", journey.gl.calls],
    ["tris", (journey.gl.tris / 1000).toFixed(1) + "k"],
    ["progs", journey.gl.programs],
    ["texs", journey.gl.textures],
    ["tier", journey.tier + "/" + journey.maxTier],
    ["dpr", journey.dpr],
    ["maxTex", journey.caps.maxTextureSize],
    ["gpu", journey.caps.renderer || "?"],
    ["boot", journey.bootMs.toFixed(0) + "ms"],
  ];
  const act = ACTS.find((a) => a.id === journey.actId) || ACTS[0];
  const walk = journey.walkActive;
  const caption = act.id === "system" ? "The Solar System" : act.id === "walk" ? "Sea of Tranquillity — 0.67°N 23.5°E" : act.caption;

  return (
    <div className='hud'>
      <div className={"caption" + (walk ? " caption-up" : "")}>
        <span>{caption}</span>
      </div>
      <div className={"pads" + (walk ? " pads-on" : "")}>
        <div className='stick' ref={stick}>
          <i />
        </div>
        <div className='look' ref={look}>
          <em>drag: look · 2 fingers: pitch</em>
        </div>
      </div>
      <div className='credit'>textures by Solar System Scope (CC BY 4.0)</div>
      <div className='hint' data-hidden={journey.offset > 0.02}>
        scroll to travel
      </div>
      {DEBUG && (
        <div className={"readout" + (journey.connected ? "" : " readout-dead")}>
          {rows.map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <b>{v}</b>
            </div>
          ))}
          {fine.map(([k, v]) => (
            <div key={k} className='fine'>
              <span>{k}</span>
              <b>{v}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
