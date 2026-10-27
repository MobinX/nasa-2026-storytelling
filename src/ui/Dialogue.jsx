import { journey } from "../state/journey.js";
import { dialogue } from "../state/dialogue.js";
import { createScript, advance, tapped, finish, visibleText, isTalking } from "../lib/dialogue.js";
import { STOPS } from "../journey/stops.js";

// The caption and the choice panel of whichever crew member is currently holding the scroll. Lives in the
// HUD, outside <Canvas>, on purpose: React state anywhere inside the Canvas is how ScrollControls loses its
// scroll listener and the journey freezes with no error. So this renders from a mutable snapshot on the
// HUD's own repaint tick, and the only thing it hands back to the scene is "he is mid-sentence", through
// state/dialogue.js.
//
// One intro per stop, created the first time that stop is reached and kept after that, so a visitor who
// scrolls back over an instrument finds it already introduced rather than being trapped by it twice.
// Finishing the intro opens the choice panel; choosing "move on" is what releases the scroll.
//
// Everything here sets touch-action: pan-y. Without it a fixed panel with pointer-events:auto swallows any
// drag that starts on it, and the page cannot scroll - which is the one thing this app runs on.

const BY_ID = {};
for (const stop of Object.values(STOPS).flat()) BY_ID[stop.id] = stop;

const scripts = {};
const scriptFor = (id) => (scripts[id] ??= createScript(BY_ID[id].convo));

const sync = (s) => {
  dialogue.talking = isTalking(s) ? 1 : 0;
};

export function stepDialogue(dt) {
  const id = journey.talkStop;
  if (!id) {
    dialogue.talking = 0;
    return false;
  }
  const s = scriptFor(id);
  advance(s, dt);
  sync(s);
  return true;
}

export function advanceDialogue() {
  const id = journey.talkStop;
  if (!id) return;
  const s = scriptFor(id);
  tapped(s);
  sync(s);
}

// The one way past a stop. The rig releases only after the arc is home, so setting `done` here is enough;
// the panel disappears immediately because dialogueView reports the script as done.
export function finishDialogue() {
  const id = journey.talkStop;
  if (!id) return false;
  const s = scriptFor(id);
  if (!finish(s)) return false;
  journey.done[id] = true;
  dialogue.talking = 0;
  dialogue.generating = 0;
  return true;
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
    // He can be projected off the edge if the visitor stops scrolling exactly at a stop; an unowned speech
    // bubble floating at the clamped edge of the screen is worse than no bubble.
    hidden: !pos.on,
    x: (x * 100).toFixed(1) + "%",
    // The same anchor as a 0..1 number, so the bubble can cap its own width to the room it has on the
    // narrower side of the speaker without measuring anything after paint.
    anchor: x,
    y: (y * 100).toFixed(1) + "%",
    onward: stop.convo.onward,
  };
}
