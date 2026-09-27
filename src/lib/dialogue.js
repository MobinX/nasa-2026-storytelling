// The conversation, as data. Deliberately React-free and clock-free: the HUD owns when time passes and
// this owns what is said, so tools/check-dialogue.mjs can verify the shape (four rounds, four questions,
// nothing too long for a phone) without mounting anything.
//
// Answers are split into beats rather than paragraphs because the caption is a floating bubble above one
// astronaut's head, not a subtitle track: a beat has to be readable in one glance at arm's length.

export const MAX_BEATS = 3;
// Three wrapped lines of the caption bubble. The bubble is capped at 78vw, which at a 400 px phone and
// the HUD's 11 px monospace is about 47 characters a line; 128 leaves a line of margin rather than
// silently clipping. Raising this number means widening the bubble in styles.css, not letting copy grow.
export const MAX_BEAT_CHARS = 128;

export const INTRO = {
  id: "intro",
  beats: [
    "Captain. Watch your step — that's the footpad.",
    "Sixty hours ago this was the only thing between two men and the vacuum.",
    "Ask me about her. Four rounds, four questions each.",
  ],
};

export const ROUNDS = [
  {
    title: "What is this machine",
    questions: [
      { id: "what", q: "What is this machine?", a: [
        "Eagle. A Lunar Module — two stages stacked. The descent stage you're standing on stays here, permanently.",
        "The ascent stage on top carries two men back to orbit. Nobody ever flew the bottom half again.",
      ] },
      { id: "who", q: "Who came down in it?", a: [
        "Armstrong and Aldrin. Four hundred and five thousand people put them in it.",
        "Collins stayed above in Columbia — alone, twelve minutes out of radio contact on every single orbit.",
      ] },
      { id: "size", q: "How big is it?", a: [
        "Nine metres tall, four and a half across the footpads, fifteen thousand kilograms.",
        "Which on the Moon weighs the same as two and a half tonnes of Earth. That's the only reason it flies at all.",
      ] },
      { id: "shape", q: "Why does it look like a spider?", a: [
        "There's no air, so there's no wing, no brake, no runway, and no streamlining. Nothing aerodynamic survives here.",
        "So it grows legs, lands on them, burns the bottom half as fuel, and stands up on the top. Ugly is correct.",
      ] },
    ],
  },
  {
    title: "Getting down",
    questions: [
      { id: "how", q: "How did you land it?", a: [
        "Mostly by hand. The computer was flying toward a field of boulders the size of cars.",
        "Armstrong took the control hand, overshot the crater and flew east until the ground told him it was clear.",
      ] },
      { id: "fuel", q: "How much fuel was left?", a: [
        "About twenty-five seconds of margin at touch-down.",
        "Below that the procedure was an abort: the ascent engine fires either way, and you never come down.",
      ] },
      { id: "alarm", q: "What were the alarms?", a: [
        "A twelve02 and a twelve01 — computer overflow. A rendezvous radar was feeding it data nobody needed.",
        "The fix was already written on the ground. They called it up, and the computer kept flying.",
      ] },
      { id: "dust", q: "Why is it covered in grey dust?", a: [
        "There's no weather, so nothing washes away. The dust is pulverised glass and rock, ground fine for four billion years.",
        "And it clings — electrostatically, from bombardment. It got inside the suits and smelled like spent gunpowder.",
      ] },
    ],
  },
  {
    title: "Living here",
    questions: [
      { id: "stay", q: "How long could you stay?", a: [
        "Roughly sixty hours on consumables. They spent twenty-one and a half, and nearly every minute was scheduled in advance.",
        "Twenty-two seconds of that schedule is all the margin there was between a sample return and a scrub.",
      ] },
      { id: "sleep", q: "How do you sleep in that?", a: [
        "Standing up, in a cabin with no seats. One on the engine cover, one curled in the equipment bay.",
        "It is the worst bed ever designed and it still beat not sleeping before a moonwalk.",
      ] },
      { id: "suit", q: "What is the suit doing?", a: [
        "It's a personal spacecraft: twenty-one kilopascals of pure oxygen, a water-cooled undershirt, and four hours of nothing else.",
        "Try opening a jar with oven mitts on, underwater, while wearing a fishbowl. That is the glove.",
      ] },
      { id: "walk", q: "Why does walking here look like bouncing?", a: [
        "One sixth of Earth's weight. A step becomes a hop, so the crew developed a lope — lead with one foot, float the other.",
        "Every tool needs two hands, because a stiff glove gives you no feel at the fingertips.",
      ] },
    ],
  },
  {
    title: "What stays",
    questions: [
      { id: "left", q: "What did you leave behind?", a: [
        "The descent stage, a flag, and a laser reflector still used to range the Earth–Moon distance to the centimetre.",
        "A passive seismometer, a solar wind collector, and a disc with messages from forty nations.",
      ] },
      { id: "brought", q: "What did you take with you?", a: [
        "Twenty-one point seven kilograms of rock and soil, sealed before anyone opened it.",
        "Sealed both ways — so nothing from here could get out, either.",
      ] },
      { id: "visit", q: "Is any of this still working?", a: [
        "The reflector: observatories still range off it. The seismometer recorded until the power budget closed it out.",
        "Everything else is in vacuum, so it doesn't rust and nothing grows over it. It will outlast the buildings that made it.",
      ] },
      { id: "why", q: "Who built this?", a: [
        "Grumman, on Long Island — about twelve thousand people, and they argued for two years over whether the legs should fold.",
        "The program manager's own verdict: the ugliest thing he'd ever been proud of. It brought them home every time.",
      ] },
    ],
  },
];

export const OUTRO = {
  id: "outro",
  beats: [
    "That's everything I have on her.",
    "The descent stage is still here. It isn't going anywhere.",
  ],
};

export const END_CARD = { title: "Eagle · Tranquillity Base · 20 July 1969", hint: "scroll up to fly home" };

export const TOTAL_ROUNDS = ROUNDS.length;
export const TOTAL_QUESTIONS = ROUNDS.length * 4;

// The phase machine. Explicit rather than inferred, because the first version of this derived "may the
// question chips be tapped" from "is the line finished" in two different places, and they disagreed: the
// HUD showed chips that the model then refused. One field decides both.
//
//   "line" - he is saying something (typed out, tap to skip ahead)
//   "ask"  - waiting for a question chip, at the start of a round or after an answer
//   "end"  - the end card
//
// No DOM, no clock, no drei: the caller supplies dt, so tools/check-dialogue.mjs can walk all sixteen
// answers without mounting anything.
const CPS = 17;   // ~12-15 char/s reads as a person; faster reads as a machine

export function createScript() {
  return { phase: "line", round: -1, asked: [], beats: INTRO.beats, beat: 0, chars: 0, lastQuestion: null };
}

// The questions still unasked in the current round. Deliberately phase-agnostic: the round-advance rule
// below asks "is this round empty", and if that query also depended on the phase it would answer yes
// every time it was called from inside a line - which is exactly how the first version skipped a round.
export function questionsOf(s) {
  if (s.round < 0 || s.round >= TOTAL_ROUNDS) return [];
  return ROUNDS[s.round].questions.filter((q) => !s.asked.includes(q.id));
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
  const q = ROUNDS[s.round].questions.find((x) => x.id === id);
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
// logic decides what comes next: more chips, the next round's chips, or the outro.
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
  // Tested before the count that sets it. Both of these are "the sixteen answers are done", but the
  // count stays true forever afterwards, so checking it first restarts the outro on every tap and the
  // conversation can never be ended.
  if (s.pendingEnd) {
    s.phase = "end";
    s.beats = [];
    return true;
  }
  if (s.asked.length >= TOTAL_QUESTIONS) {
    startLine(s, OUTRO.beats);
    s.pendingEnd = true;
    return true;
  }
  if (questionsOf(s).length === 0) s.round++;
  s.phase = "ask";
  s.beats = [];
  return true;
}

export const visibleText = (s) => (s.beats[s.beat] ?? "").slice(0, Math.floor(s.chars));
export const isTalking = (s) => s.phase === "line" && (s.beats[s.beat] ?? "").length > Math.floor(s.chars);
export const roundTitle = (s) => (s.round >= 0 && s.round < TOTAL_ROUNDS ? ROUNDS[s.round].title : "");
