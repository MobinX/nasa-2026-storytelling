import { useEffect, useRef, useState } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { journey } from "../state/journey.js";
import { ACTS } from "../journey/timeline.js";
import { dialogueView, stepDialogue, advanceDialogue, finishDialogue } from "./Dialogue.jsx";
import Ask from "./Ask.jsx";
import NasaLink from "./NasaLink.jsx";

const PAINT_MS = 100;
const TALK_MS = 45;

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "nasa.gov";
  }
};

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
  const edge = useRef({ paint: 0 });
  const goTimer = useRef(0);
  const [goHint, setGoHint] = useState("");
  const [leaving, setLeaving] = useState(null);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t) => {
      const e = edge.current;
      const dt = last ? Math.min(0.25, (t - last) / 1000) : 0;
      last = t;
      const talking = stepDialogue(dt);
      if (t - e.paint > (talking ? TALK_MS : PAINT_MS)) {
        e.paint = t;
        setTick((n) => (n + 1) & 1023);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(goTimer.current);
    };
  }, []);

  const act = ACTS.find((a) => a.id === journey.actId) || ACTS[0];
  const walk = journey.walkActive;
  const talk = dialogueView();
  const bubbleRef = useRef(null);
  const tapGuide = useRef(null);
  const tapFollow = useRef(0);
  const tapDone = useRef(false);
  const bubbleUp = !!talk && !talk.hidden && talk.phase === "line";
  const talkId = talk?.stop?.id;
  const onMoon = talk?.stop?.planet === "moon";

  // The one coaching moment of the journey: the first caption on the Moon is a button, not a subtitle, and
  // a visitor who has only ever scrolled at this point has no reason to know that. Driver dims everything
  // except the bubble until they tap it once; that same tap is what teaches it, so it retires the hint for
  // the rest of the page's life - a reload starts the journey over and shows it again. The stage is
  // refreshed on a slow clock because the bubble follows the crew member, and the conversation orbit keeps
  // moving him while the popover is up.
  useEffect(() => {
    if (!bubbleUp || !onMoon || tapDone.current) return;
    const el = bubbleRef.current;
    if (!el) return;
    const guide = driver({
      animate: true,
      duration: 320,
      allowClose: false,
      allowScroll: true,
      overlayClickBehavior: "none",
      overlayColor: "#020a09",
      overlayOpacity: 0.55,
      stagePadding: 8,
      stageRadius: 20,
      popoverOffset: 12,
      popoverClass: "tap-guide",
      showButtons: [],
    });
    tapGuide.current = guide;
    guide.highlight({
      element: el,
      popover: {
        title: "Tap the text",
        description: "Tap the astronaut's words to hear him out.",
        side: "top",
        align: "center",
        showButtons: [],
      },
    });
    tapFollow.current = window.setInterval(() => guide.refresh(), 240);
    return () => {
      window.clearInterval(tapFollow.current);
      tapFollow.current = 0;
      guide.destroy();
      if (tapGuide.current === guide) tapGuide.current = null;
    };
  }, [bubbleUp, talkId, onMoon]);

  const askLeave = (url, name) => setLeaving({ url, name });

  // The leave dialog is the only thing in the HUD that claims the keyboard; Escape is the polite way out
  // of a decision the visitor did not ask to make.
  useEffect(() => {
    if (!leaving) return;
    const onKey = (e) => {
      if (e.key === "Escape") setLeaving(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leaving]);

  const tapBubble = () => {
    if (!tapDone.current) {
      tapDone.current = true;
      window.clearInterval(tapFollow.current);
      tapFollow.current = 0;
      const guide = tapGuide.current;
      tapGuide.current = null;
      if (guide) guide.destroy();
    }
    advanceDialogue();
  };

  // "Move on" is a release, not a jump. The rig needs the arc home before it lets go of the scroller, so
  // wait for the hold to actually drop, then nudge the rail a few dozen pixels and put the crew member's own
  // onward line on screen. The visitor does the rest; the scroll is theirs again.
  const moveOn = () => {
    const onward = dialogueView()?.onward || "Scroll on when you're ready.";
    finishDialogue();
    let tries = 0;
    const reveal = () => {
      const el = journey.scrollEl;
      if (!el) {
        setGoHint(onward);
        return;
      }
      if (journey.lock.engaged && tries++ < 40) {
        window.setTimeout(reveal, 50);
        return;
      }
      setGoHint(onward);
      window.clearTimeout(goTimer.current);
      goTimer.current = window.setTimeout(() => setGoHint(""), 7000);
      const max = el.scrollHeight - el.clientHeight;
      el.scrollTop = Math.min(max, el.scrollTop + Math.max(36, el.clientHeight * 0.05));
    };
    window.setTimeout(reveal, 60);
  };

  // The caption is the act's own string; the site coordinates live in the text rather than being
  // appended here, because the two landings have different ones and neither belongs in the renderer.
  const caption = act.caption;

  return (
    <>
      <div className='hud'>
        <div className={"caption" + (walk ? " caption-up" : "")}>
          <span>{caption}</span>
        </div>
        {talk && !talk.hidden && talk.phase === "line" ? (
          <div
            ref={bubbleRef}
            role='button'
            tabIndex={0}
            className='bubble'
            style={{ left: talk.x, top: talk.y, "--anchor": talk.anchor }}
            onClick={tapBubble}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                tapBubble();
              }
            }}
          >
            {talk.text}
            {talk.typed ? <NasaLink source={talk.source} name={talk.stop.name} onLeave={askLeave} /> : null}
            <i />
          </div>
        ) : null}
        {talk && talk.phase === "choice" ? <Ask stop={talk.stop} onMoveOn={moveOn} onLeave={askLeave} /> : null}
        <div className='credit'>textures by Solar System Scope (CC BY 4.0)</div>
        {journey.software && (
          <div className='poster'>
            <b>This browser is rendering in software.</b>
            <span>Scroll still moves the camera, but the scene is paused so the phone does not overheat. Try Chrome with hardware acceleration enabled.</span>
          </div>
        )}
        {SEAM_SLIDER && <SeamSlider />}
        <div className='swipe-cue' data-hidden={journey.raw > 0.0002}>
          <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
            <path d='M8 13V4.5a1.5 1.5 0 0 1 3 0V11' />
            <path d='M11 10.5v-1a1.5 1.5 0 0 1 3 0v1.5' />
            <path d='M14 10v-.5a1.5 1.5 0 0 1 3 0V11' />
            <path d='M17 11a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1-6 6h-1.5a5 5 0 0 1-4.2-2.35l-2.3-3.4a1.5 1.5 0 0 1 2.4-1.8L9 15' />
          </svg>
          <span>Scroll to travel</span>
        </div>
        {journey.lock.engaged && (journey.orbitClosing || (talk && talk.phase === "line")) ? (
          <div className='hint hint-hold' data-hidden={false}>
            {journey.orbitClosing ? "coming round" : "tap the caption"}
          </div>
        ) : null}
        {goHint ? <div className='hint hint-go'>{goHint}</div> : null}
      </div>
      {/* The dialog sits outside .hud on purpose: .hud's own stacking context would trap it under the
          driver.js overlay, and the first NASA mark a visitor ever taps is inside that overlay. */}
      {leaving ? (
        <div className='leave' onClick={(e) => e.target === e.currentTarget && setLeaving(null)}>
          <div className='leave-card' role='dialog' aria-modal='true' aria-labelledby='leave-title'>
            <b id='leave-title'>You're leaving this web site</b>
            <span>
              {leaving.name} — this mark links to {hostOf(leaving.url)}, NASA's own page for this machine, so you can check what you have been
              told.
            </span>
            <div className='leave-actions'>
              <button type='button' className='ask-secondary' onClick={() => setLeaving(null)}>Stay here</button>
              <button
                type='button'
                className='ask-cta'
                onClick={() => {
                  window.open(leaving.url, "_blank", "noopener,noreferrer");
                  setLeaving(null);
                }}
              >
                Continue to {hostOf(leaving.url)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
