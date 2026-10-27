// The crew member's half of a stop, as a machine. Deliberately React-free and clock-free: the HUD owns when
// time passes and this owns how the introduction moves, so tools/check-dialogue.mjs can walk every one of the
// ten objects without mounting anything.
//
// The shape is short on purpose: he introduces the machine, then the visitor either asks him a free-form
// question or moves on. Questions are answered by the answer service, not by a script - this machine only
// knows the spoken intro and the two-state hand-off at the end of it.
//
// Answers are split into beats rather than paragraphs because the caption is a floating bubble above one
// astronaut's head, not a subtitle track: a beat has to be readable in one glance at arm's length.

export const MAX_BEATS = 3;
// Three wrapped lines of the caption bubble. The bubble is capped at 78vw, which at a 400 px phone and
// the HUD's 11 px monospace is about 47 characters a line; 128 leaves a line of margin rather than
// silently clipping. Raising this number means widening the bubble in styles.css, not letting copy grow.
export const MAX_BEAT_CHARS = 128;

// The phase machine:
//
//   "line"   - he is saying the introduction (typed out, tap to skip ahead)
//   "choice" - the introduction is done; the visitor picks ask or move on
//   "done"   - the visitor chose to move on; the scroll is his again
//
// No DOM, no clock, no drei: the caller supplies dt, so the checker can walk every intro without mounting
// anything.
const CPS = 17;   // ~12-15 char/s reads as a person; faster reads as a machine

export function createScript(convo) {
  return { convo, phase: "line", beats: convo.intro.beats, beat: 0, chars: 0 };
}

export function advance(s, dt) {
  if (s.phase !== "line") return false;
  const cur = s.beats[s.beat];
  if (cur === undefined || s.chars >= cur.length) return false;
  s.chars = Math.min(cur.length, s.chars + CPS * dt);
  return true;
}

// A tap either finishes the current caption or moves to the next one. The last tap hands over to the
// choice panel; the scroll stays held until the visitor picks "move on".
export function tapped(s) {
  if (s.phase !== "line") return false;
  const cur = s.beats[s.beat];
  if (cur === undefined) return false;
  if (s.chars < cur.length) {
    s.chars = cur.length;
    return true;
  }
  if (s.beat < s.beats.length - 1) {
    s.beat++;
    s.chars = 0;
    return true;
  }
  s.phase = "choice";
  s.beats = [];
  return true;
}

// The visitor chose the next objective. Only valid once the introduction has handed over, so a stray call
// cannot release the scroll while the man is still mid-sentence.
export function finish(s) {
  if (s.phase !== "choice") return false;
  s.phase = "done";
  s.beats = [];
  return true;
}

export const visibleText = (s) => (s.beats[s.beat] ?? "").slice(0, Math.floor(s.chars));
export const isTalking = (s) => s.phase === "line" && (s.beats[s.beat] ?? "").length > Math.floor(s.chars);

// True only once the current line has finished typing - the point at which the provenance mark belongs,
// not the moment the bubble first appears with half a sentence.
export const isComplete = (s) => s.phase === "line" && !isTalking(s) && (s.beats[s.beat] ?? "").length > 0;
