import { journey } from "../state/journey.js";
import { dialogue } from "../state/dialogue.js";
import { createScript, questionsOf, pick, advance, tapped, visibleText, isTalking, roundTitle, END_CARD, TOTAL_ROUNDS } from "../lib/dialogue.js";

// The crew member's caption and question chips. Lives in the HUD, outside <Canvas>, on purpose: React
// state anywhere inside the Canvas is how ScrollControls loses its scroll listener and the journey
// freezes with no error. So this renders from a mutable snapshot on the HUD's own repaint tick, and the
// only thing it hands back to the scene is "he is mid-sentence", through state/dialogue.js.
//
// Everything here sets touch-action: pan-y. Without it a fixed panel with pointer-events:auto swallows
// any drag that starts on it, and the page cannot scroll - which is the one thing this app runs on.

let script = createScript();
let lastEncounter = 0;

export function stepDialogue(dt) {
  const on = journey.encounter > 0.5;
  if (on && lastEncounter <= 0.5) script = createScript();
  lastEncounter = journey.encounter;
  if (!on) {
    dialogue.talking = 0;
    return false;
  }
  advance(script, dt);
  dialogue.talking = isTalking(script) ? 1 : 0;
  return true;
}

export function advanceDialogue() {
  if (journey.encounter <= 0.5) return;
  tapped(script);
  dialogue.talking = isTalking(script) ? 1 : 0;
}

export function askDialogue(id) {
  if (journey.encounter <= 0.5) return;
  pick(script, id);
  dialogue.talking = isTalking(script) ? 1 : 0;
}

export function dialogueView() {
  if (journey.encounter <= 0.5) return null;
  const chips = questionsOf(script);
  const pos = journey.companion;
  const x = Math.max(0.16, Math.min(0.84, pos.x));
  const y = Math.max(0.12, Math.min(0.72, pos.y));
  return {
    phase: script.phase,
    text: visibleText(script),
    chips: script.phase === "ask" ? chips : [],
    // He can be projected off the edge if the visitor stops scrolling exactly at the seam; an unowned
    // speech bubble floating at the clamped edge of the screen is worse than no bubble.
    hidden: !pos.on,
    title: roundTitle(script),
    round: Math.min(script.round + 1, TOTAL_ROUNDS),
    asked: script.asked.length,
    x: (x * 100).toFixed(1) + "%",
    y: (y * 100).toFixed(1) + "%",
    card: script.phase === "end" ? END_CARD : null,
  };
}
