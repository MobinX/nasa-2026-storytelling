// The crew member's conversations, as a machine. Deliberately React-free and clock-free: the HUD owns when
// time passes and this owns how a conversation moves, so tools/check-dialogue.mjs can walk every one of the
// ten conversations in objects.json without mounting anything.
//
// Four rounds, and each round offers four questions. One question per round completes it, because the four
// are alternatives - the visitor picks the one they actually want asked - which is what keeps a stop at four
// answers rather than sixteen. The content itself lives in src/data/objects.json.
//
// Answers are split into beats rather than paragraphs because the caption is a floating bubble above one
// astronaut's head, not a subtitle track: a beat has to be readable in one glance at arm's length.

export const MAX_BEATS = 3;
// Three wrapped lines of the caption bubble. The bubble is capped at 78vw, which at a 400 px phone and
// the HUD's 11 px monospace is about 47 characters a line; 128 leaves a line of margin rather than
// silently clipping. Raising this number means widening the bubble in styles.css, not letting copy grow.
export const MAX_BEAT_CHARS = 128;

// A conversation is however many rounds the object was written with; one answered question is one round, so
// this is both the length of the stop and the number the HUD counts up to.
export const questionTotal = (convo) => convo.rounds.length;

// The phase machine. Explicit rather than inferred, because the first version of this derived "may the
// question chips be tapped" from "is the line finished" in two different places, and they disagreed: the
// HUD showed chips that the model then refused. One field decides both.
//
//   "line" - he is saying something (typed out, tap to skip ahead)
//   "ask"  - waiting for a question chip, at the start of a round or after an answer
//   "end"  - the end card
//
// No DOM, no clock, no drei: the caller supplies dt, so the checker can walk every answer without
// mounting anything. The conversation travels on the script, because every stop on the walk has its own.
const CPS = 17;   // ~12-15 char/s reads as a person; faster reads as a machine

export function createScript(convo) {
  return { convo, phase: "line", round: -1, asked: [], beats: convo.intro.beats, beat: 0, chars: 0, lastQuestion: null };
}

// The questions still unasked in the current round. Deliberately phase-agnostic, because the HUD shows the
// chips from this same query: a version that also required phase "ask" disagreed with the round machine
// about whether the visitor was allowed to choose, and offered chips the model then refused.
export function questionsOf(s) {
  if (s.round < 0 || s.round >= s.convo.rounds.length) return [];
  return s.convo.rounds[s.round].questions.filter((q) => !s.asked.includes(q.id));
}

const startLine = (s, beats) => {
  s.phase = "line";
  s.beats = beats;
  s.beat = 0;
  s.chars = 0;
};

// Tapping a chip interrupts whatever he is mid-way through saying. That is deliberate: the alternative -
// queueing it behind the rest of the current answer - makes the panel feel like it is not listening.
export function pick(s, id) {
  if (s.phase === "end") return false;
  if (s.round < 0) return false;
  const q = s.convo.rounds[s.round].questions.find((x) => x.id === id);
  if (!q || s.asked.includes(id)) return false;
  s.asked = s.asked.concat(id);
  s.lastQuestion = id;
  startLine(s, q.a);
  return true;
}

export function advance(s, dt) {
  if (s.phase !== "line") return false;
  const cur = s.beats[s.beat];
  if (cur === undefined || s.chars >= cur.length) return false;
  s.chars = Math.min(cur.length, s.chars + CPS * dt);
  return true;
}

// A tap either finishes the current caption or moves to the next one. When the line runs out, the round
// logic decides what comes next: the chip, the next round's chip, or the outro.
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
  if (s.round < 0) {
    s.round = 0;
    s.phase = "ask";
    s.beats = [];
    return true;
  }
  // Tested before the count that sets it. Both of these are "the answers are done", but the count stays
  // true forever afterwards, so checking it first restarts the outro on every tap and the conversation
  // can never be ended.
  if (s.pendingEnd) {
    s.phase = "end";
    s.beats = [];
    return true;
  }
  if (s.asked.length >= questionTotal(s.convo)) {
    startLine(s, s.convo.outro.beats);
    s.pendingEnd = true;
    return true;
  }
  // One answered question completes a round. The four options in a round are alternatives - questions the
  // visitor could have asked but didn't - so the round moves on whether or not the others were asked, and
  // `asked.length` counts rounds rather than taps. Waiting for the round to empty turned every stop into
  // sixteen questions, which is the thing this design exists to avoid.
  s.round++;
  s.phase = "ask";
  s.beats = [];
  return true;
}

export const visibleText = (s) => (s.beats[s.beat] ?? "").slice(0, Math.floor(s.chars));
export const isTalking = (s) => s.phase === "line" && (s.beats[s.beat] ?? "").length > Math.floor(s.chars);
export const roundTitle = (s) => (s.round >= 0 && s.round < s.convo.rounds.length ? s.convo.rounds[s.round].title : "");
