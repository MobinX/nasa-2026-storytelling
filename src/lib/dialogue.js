// The companion conversations, as data. Deliberately React-free and clock-free: the HUD owns when time
// passes and this owns what is said, so tools/check-dialogue.mjs can verify the shape (two worlds, four
// rounds each, one question per round, nothing too long for a phone) without mounting anything.
//
// One question per round rather than four. Four chips across a 400 px phone is a cramped grid, and the
// visitor has to choose before they have any idea what they are choosing between; one question, asked by
// the man who landed the machine, keeps the conversation a conversation.
//
// Answers are split into beats rather than paragraphs because the caption is a floating bubble above one
// astronaut's head, not a subtitle track: a beat has to be readable in one glance at arm's length.

export const MAX_BEATS = 3;
// Three wrapped lines of the caption bubble. The bubble is capped at 78vw, which at a 400 px phone and
// the HUD's 11 px monospace is about 47 characters a line; 128 leaves a line of margin rather than
// silently clipping. Raising this number means widening the bubble in styles.css, not letting copy grow.
export const MAX_BEAT_CHARS = 128;

export const MOON = {
  id: "moon",
  intro: {
    id: "intro",
    beats: [
      "Captain. Watch your step — that's the footpad.",
      "Sixty hours ago this was the only thing between two men and the vacuum.",
      "Ask me about her. Four rounds, one question each.",
    ],
  },
  rounds: [
    {
      title: "What is this machine",
      questions: [
        { id: "what", q: "What is this machine?", a: [
          "Eagle. A Lunar Module — two stages stacked. The descent stage you're standing on stays here, permanently.",
          "The ascent stage on top carries two men back to orbit. Nobody ever flew the bottom half again.",
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
      ],
    },
    {
      title: "Living here",
      questions: [
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
      ],
    },
  ],
  outro: {
    id: "outro",
    beats: [
      "That's everything I have on her.",
      "The descent stage is still here. It isn't going anywhere.",
      "Now get back aboard. There's a harder fall in front of you, and an atmosphere at the bottom of it.",
    ],
  },
  endCard: { title: "Eagle · Tranquillity Base · 20 July 1969", hint: "keep scrolling — Mars is next" },
};

export const MARS = {
  id: "mars",
  intro: {
    id: "intro",
    beats: [
      "Captain. Easy — that dark ring is your own bootprint.",
      "Everything under your boots is iron oxide. It is the only colour this planet has.",
      "Ask me about it. Four rounds, one question each.",
    ],
  },
  rounds: [
    {
      title: "Getting down",
      questions: [
        { id: "entry", q: "How did you land this time?", a: [
          "The Moon was flown by hand. Mars is flown by a machine you cannot argue with for seven minutes.",
          "Aeroshell, a supersonic parachute, then a skycrane that lowers you on a cable and flies off to crash itself.",
        ] },
      ],
    },
    {
      title: "The wrong sky",
      questions: [
        { id: "sky", q: "Why is the sky the wrong colour?", a: [
          "Fine dust, all day, in suspension. It scatters the blue out of the light and leaves butterscotch.",
          "And it runs backwards at sunset: the same dust piles blue into a halo round the sun, so evenings here are blue.",
        ] },
      ],
    },
    {
      title: "Twice the weight",
      questions: [
        { id: "gravity", q: "Is walking harder than on the Moon?", a: [
          "Thirty-eight percent of Earth, against the Moon's sixteen. Your hop is gone — you walk like a person again.",
          "Same suit, so every movement you trained for is wrong. The lope that worked out there looks ridiculous here.",
        ] },
      ],
    },
    {
      title: "Who else is here",
      questions: [
        { id: "robots", q: "Who else is out here with us?", a: [
          "Robots. One has been driving the same crater rim for fourteen years — longer than anyone has been off Earth.",
          "It will still be working when the last of us is a name here. That is not a joke, it is the design requirement.",
        ] },
      ],
    },
  ],
  outro: {
    id: "outro",
    beats: [
      "That's the short of it. Eighteen months here, then a ninety-day window and a fall back home.",
      "Nobody has ever used that window with a person in it. We are the paperwork.",
    ],
  },
  endCard: { title: "Ares · Jezero West · Sol 1", hint: "scroll up to fly home" },
};

export const CONVERSATIONS = [MOON, MARS];

// The old exports stay for anything that only ever means the Moon.
export const ROUNDS = MOON.rounds;
export const INTRO = MOON.intro;
export const OUTRO = MOON.outro;
export const END_CARD = MOON.endCard;
export const TOTAL_ROUNDS = MOON.rounds.length;
export const TOTAL_QUESTIONS = MOON.rounds.length;
export const questionTotal = (convo) => convo.rounds.reduce((n, r) => n + r.questions.length, 0);

// The phase machine. Explicit rather than inferred, because the first version of this derived "may the
// question chips be tapped" from "is the line finished" in two different places, and they disagreed: the
// HUD showed chips that the model then refused. One field decides both.
//
//   "line" - he is saying something (typed out, tap to skip ahead)
//   "ask"  - waiting for a question chip, at the start of a round or after an answer
//   "end"  - the end card
//
// No DOM, no clock, no drei: the caller supplies dt, so the checker can walk every answer without
// mounting anything. The conversation travels on the script, because there are now two of them live.
const CPS = 17;   // ~12-15 char/s reads as a person; faster reads as a machine

export function createScript(convo = MOON) {
  return { convo, phase: "line", round: -1, asked: [], beats: convo.intro.beats, beat: 0, chars: 0, lastQuestion: null };
}

// The questions still unasked in the current round. Deliberately phase-agnostic: the round-advance rule
// below asks "is this round empty", and if that query also depended on the phase it would answer yes
// every time it was called from inside a line - which is exactly how the first version skipped a round.
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
  if (questionsOf(s).length === 0) s.round++;
  s.phase = "ask";
  s.beats = [];
  return true;
}

export const visibleText = (s) => (s.beats[s.beat] ?? "").slice(0, Math.floor(s.chars));
export const isTalking = (s) => s.phase === "line" && (s.beats[s.beat] ?? "").length > Math.floor(s.chars);
export const roundTitle = (s) => (s.round >= 0 && s.round < s.convo.rounds.length ? s.convo.rounds[s.round].title : "");
