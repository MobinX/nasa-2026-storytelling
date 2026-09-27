import { useEffect, useRef, useState } from "react";
import { journey } from "../state/journey.js";
import { ACTS, PAGES } from "../journey/timeline.js";
import { dialogueView, stepDialogue, advanceDialogue, askDialogue } from "./Dialogue.jsx";

const DEBUG = typeof window !== "undefined" ? !new URLSearchParams(window.location.search).has("plain") : true;
const PAINT_MS = 100;
const TALK_MS = 45;
const FLICK_GAP_MS = 320;
const FLICK_MIN_DELTA = 0.012;

// A fixed DOM sibling of <Canvas>: the HUD must never re-render the Canvas, so pointer-events stays off
// everywhere except the one control that is genuinely a control.
const SEAM_SLIDER = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("seam");

// ?seam= parks the journey anywhere along the scroll with a real thumb: the only honest way to inspect a
// cut on a phone, since it is a single frame in a hundred.
function SeamSlider() {
  return (
    <input
      className='seam'
      type='range'
      min='0'
      max='1000'
      defaultValue={700}
      onInput={(e) => {
        const el = journey.scrollEl;
        if (!el) return;
        const max = el.scrollHeight - el.clientHeight;
        el.scrollTop = 1 + (Number(e.target.value) / 1000) * Math.max(0, max - 1);
      }}
    />
  );
}

export default function Hud() {
  const [, setTick] = useState(0);
  const edge = useRef({ time: 0, offset: 0, paint: 0 });

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t) => {
      const e = edge.current;
      const o = journey.offset;
      const dt = last ? Math.min(0.25, (t - last) / 1000) : 0;
      last = t;
      const talking = stepDialogue(dt);
      if (o > e.offset + FLICK_MIN_DELTA && t - e.time > FLICK_GAP_MS) journey.flicks++;
      if (o !== e.offset) e.time = t;
      e.offset = o;
      if (t - e.paint > (talking ? TALK_MS : PAINT_MS)) {
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
    ["tier", journey.tier],
    ["dpr", journey.dpr],
    ["maxTex", journey.caps.maxTextureSize],
    ["gpu", journey.caps.renderer || "?"],
    ["boot", journey.bootMs.toFixed(0) + "ms"],
    ["warm", journey.warmedMs.toFixed(0) + "ms"],
  ];
  const act = ACTS.find((a) => a.id === journey.actId) || ACTS[0];
  const walk = journey.walkActive;
  const talk = dialogueView();
  const caption = act.id === "system" ? "The Solar System" : act.id === "walk" ? "Sea of Tranquillity — 0.67°N 23.5°E" : act.caption;

  return (
    <div className='hud'>
      <div className={"caption" + (walk ? " caption-up" : "")}>
        <span>{caption}</span>
      </div>
      {talk && talk.card ? (
        <div className='endcard'>
          <b>{talk.card.title}</b>
          <span>{talk.card.hint}</span>
        </div>
      ) : null}
      {talk && !talk.hidden && talk.phase === "line" ? (
        <button type='button' className='bubble' style={{ left: talk.x, top: talk.y }} onClick={advanceDialogue}>
          {talk.text}
          <i />
        </button>
      ) : null}
      {talk && talk.chips.length ? (
        <div className='chips'>
          <em>
            round {talk.round} · {talk.title} · {talk.asked}/16 answered
          </em>
          {talk.chips.map((q) => (
            <button key={q.id} type='button' onClick={() => askDialogue(q.id)}>
              {q.q}
            </button>
          ))}
        </div>
      ) : null}
      <div className='credit'>textures by Solar System Scope (CC BY 4.0)</div>
      {journey.software && (
        <div className='poster'>
          <b>This browser is rendering in software.</b>
          <span>Scroll still moves the camera, but the scene is paused so the phone does not overheat. Try Chrome with hardware acceleration enabled.</span>
        </div>
      )}
      {SEAM_SLIDER && <SeamSlider />}
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
