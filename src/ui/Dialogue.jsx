import { journey } from "../state/journey.js";
import { dialogue } from "../state/dialogue.js";
import { createScript, questionsOf, pick, advance, tapped, visibleText, isTalking, roundTitle, questionTotal } from "../lib/dialogue.js";
import { STOPS } from "../journey/stops.js";

// The caption and question chip of whichever crew member is currently holding the scroll. Lives in the HUD,
// outside <Canvas>, on purpose: React state anywhere inside the Canvas is how ScrollControls loses its
// scroll listener and the journey freezes with no error. So this renders from a mutable snapshot on the
// HUD's own repaint tick, and the only thing it hands back to the scene is "he is mid-sentence", through
// state/dialogue.js.
//
// One script per stop, ten of them, created the first time that stop is reached and kept after that, so a
// visitor who scrolls back over an instrument finds it already explained rather than being trapped by it
// twice. Finishing a conversation is what releases the scroll: `done` is read by the rig on its next frame.
//
// Everything here sets touch-action: pan-y. Without it a fixed panel with pointer-events:auto swallows any
// drag that starts on it, and the page cannot scroll - which is the one thing this app runs on.

const BY_ID = {};
for (const stop of Object.values(STOPS).flat()) BY_ID[stop.id] = stop;

const scripts = {};
const scriptFor = (id) => (scripts[id] ??= createScript(BY_ID[id].convo));

export function stepDialogue(dt) {
  const id = journey.talkStop;
  if (!id) {
    dialogue.talking = 0;
    return false;
  }
  const s = scriptFor(id);
  advance(s, dt);
  dialogue.talking = isTalking(s) ? 1 : 0;
  if (s.phase === "end") journey.done[id] = true;
  return true;
}

function useActive(fn) {
  const id = journey.talkStop;
  if (!id) return;
  const s = scriptFor(id);
  fn(s);
  dialogue.talking = isTalking(s) ? 1 : 0;
  if (s.phase === "end") journey.done[id] = true;
}

export function advanceDialogue() {
  useActive((s) => tapped(s));
}

export function askDialogue(id) {
  useActive((s) => pick(s, id));
}

export function dialogueView() {
  const id = journey.talkStop;
  if (!id) return null;
  const stop = BY_ID[id];
  const script = scriptFor(id);
  const pos = journey.companion;
  const x = Math.max(0.16, Math.min(0.84, pos.x));
  const y = Math.max(0.12, Math.min(0.72, pos.y));
  return {
    stop,
    phase: script.phase,
    text: visibleText(script),
    chips: script.phase === "ask" ? questionsOf(script) : [],
    // He can be projected off the edge if the visitor stops scrolling exactly at a stop; an unowned speech
    // bubble floating at the clamped edge of the screen is worse than no bubble.
    hidden: !pos.on,
    title: roundTitle(script),
    round: Math.min(script.round + 1, stop.convo.rounds.length),
    asked: script.asked.length,
    total: questionTotal(stop.convo),
    x: (x * 100).toFixed(1) + "%",
    y: (y * 100).toFixed(1) + "%",
    card: script.phase === "end" ? { title: stop.name, hint: stop.convo.outro.beats.at(-1) } : null,
  };
}
