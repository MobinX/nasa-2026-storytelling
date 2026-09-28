import { journey } from "../state/journey.js";
import { dialogue } from "../state/dialogue.js";
import { MOON, MARS, createScript, questionsOf, pick, advance, tapped, visibleText, isTalking, roundTitle, questionTotal } from "../lib/dialogue.js";

// The crew member's caption and question chip. Lives in the HUD, outside <Canvas>, on purpose: React state
// anywhere inside the Canvas is how ScrollControls loses its scroll listener and the journey freezes with
// no error. So this renders from a mutable snapshot on the HUD's own repaint tick, and the only thing it
// hands back to the scene is "he is mid-sentence", through state/dialogue.js.
//
// Two conversations, one per landing, each with its own script. Only one can be open at a time - the lunar
// one closes when the ascent starts, long before the Martian one opens - so a single `dialogue.talking`
// slot still serves the animation.
//
// Everything here sets touch-action: pan-y. Without it a fixed panel with pointer-events:auto swallows any
// drag that starts on it, and the page cannot scroll - which is the one thing this app runs on.

const CONVO = { moon: MOON, mars: MARS };
const state = { moon: createScript(MOON), mars: createScript(MARS) };
const opened = { moon: 0, mars: 0 };

const activeKey = () => (journey.mars.talk > 0.5 ? "mars" : journey.moon.talk > 0.5 ? "moon" : null);

export function stepDialogue(dt) {
  const key = activeKey();
  if (!key) {
    dialogue.talking = 0;
    return false;
  }
  const gate = journey[key].talk;
  if (opened[key] <= 0.5 && gate > 0.5) state[key] = createScript(CONVO[key]);
  opened[key] = gate;
  advance(state[key], dt);
  dialogue.talking = isTalking(state[key]) ? 1 : 0;
  return true;
}

function useActive(fn) {
  const key = activeKey();
  if (!key) return;
  fn(state[key]);
  dialogue.talking = isTalking(state[key]) ? 1 : 0;
}

export function advanceDialogue() {
  useActive((s) => tapped(s));
}

export function askDialogue(id) {
  useActive((s) => pick(s, id));
}

export function dialogueView() {
  const key = activeKey();
  if (!key) return null;
  const script = state[key];
  const convo = CONVO[key];
  const pos = journey.companion;
  const x = Math.max(0.16, Math.min(0.84, pos.x));
  const y = Math.max(0.12, Math.min(0.72, pos.y));
  return {
    world: key,
    phase: script.phase,
    text: visibleText(script),
    chips: script.phase === "ask" ? questionsOf(script) : [],
    // He can be projected off the edge if the visitor stops scrolling exactly at the seam; an unowned
    // speech bubble floating at the clamped edge of the screen is worse than no bubble.
    hidden: !pos.on,
    title: roundTitle(script),
    round: Math.min(script.round + 1, convo.rounds.length),
    asked: script.asked.length,
    total: questionTotal(convo),
    x: (x * 100).toFixed(1) + "%",
    y: (y * 100).toFixed(1) + "%",
    card: script.phase === "end" ? convo.endCard : null,
  };
}
