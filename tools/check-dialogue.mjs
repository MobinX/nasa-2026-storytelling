// Shape and flow of the companion conversation, without mounting anything: src/lib/dialogue.js is data
// plus a phase machine, so the whole thing can be walked here. This exists because the content is the
// part most likely to be edited by someone who never reads the render path - a fifth option, or a four
// hundred character answer, passes every other suite and only shows up as an overflowed caption bubble
// on a phone that nobody has plugged in.
import { ROUNDS, INTRO, OUTRO, END_CARD, TOTAL_ROUNDS, TOTAL_QUESTIONS, createScript, questionsOf, pick, advance, tapped, visibleText, isTalking, roundTitle } from "../src/lib/dialogue.js";
import { MAX_BEAT_CHARS } from "../src/lib/dialogue.js";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const type = (s) => {
  let g = 0;
  while (advance(s, 1 / 60)) if (++g > 20000) { ok(false, "advance() never terminates"); break; }
  return visibleText(s);
};

ok(ROUNDS.length === TOTAL_ROUNDS, `TOTAL_ROUNDS is ${TOTAL_ROUNDS} but ${ROUNDS.length} rounds are defined`);
ok(TOTAL_QUESTIONS === TOTAL_ROUNDS * 4, "TOTAL_QUESTIONS must be 4 per round");

const ids = new Set();
for (const [r, round] of ROUNDS.entries()) {
  ok(round.questions.length === 4, `round ${r + 1} offers ${round.questions.length} questions, not 4`);
  ok(typeof round.title === "string" && round.title.length > 2, `round ${r + 1} has no title`);
  for (const q of round.questions) {
    ok(!ids.has(q.id), `question id "${q.id}" is used twice - pick() would answer the wrong one`);
    ids.add(q.id);
    ok(q.q.length > 6 && q.q.length <= 46, `${q.id}: question is ${q.q.length} chars; a chip has to fit across a phone`);
    ok(Array.isArray(q.a) && q.a.length >= 1 && q.a.length <= 3, `${q.id}: ${q.a?.length} beats, expected 1-3`);
    ok(q.a[q.a.length - 1].endsWith("."), `${q.id}: the last beat should end a sentence, not trail off`);
  }
}
for (const [where, beats] of [["INTRO", INTRO.beats], ["OUTRO", OUTRO.beats]]) {
  ok(beats.length >= 1 && beats.length <= 3, `${where} has ${beats.length} beats`);
}
for (const [where, list] of [["INTRO", INTRO.beats], ["OUTRO", OUTRO.beats], ...ROUNDS.flatMap((r) => r.questions.map((q) => [q.id, q.a]))]) {
  for (const b of list) ok(b.length <= MAX_BEAT_CHARS, `${where}: a ${b.length}-char beat overflows the bubble (limit ${MAX_BEAT_CHARS})`);
}
ok(typeof END_CARD.title === "string" && END_CARD.title.includes("1969"), "the end card should date the landing");

// Now walk it, always tapping the oldest available chip, and check the machine terminates in "end".
const s = createScript();
ok(s.phase === "line" && s.round < 0, "a fresh script should open on the intro line");
const seen = [];
let taps = 0;
const drain = () => {
  let guard = 0;
  while (s.phase === "line" && guard++ < 60) {
    type(s);
    taps++;
    ok(taps++ < 4000, "the conversation never terminates");
    tapped(s);
  }
};
drain();
ok(s.phase === "ask" && s.round === 0, `intro did not hand to round 1 (phase=${s.phase}, round=${s.round})`);
let expectedRound = 0;
while (s.phase !== "end") {
  const qs = questionsOf(s);
  ok(qs.length > 0, `round ${expectedRound + 1} offered no questions`);
  if (!qs.length) break;
  const q = qs[0];
  ok(roundTitle(s) === ROUNDS[expectedRound].title, `round title drifted at ${q.id}`);
  ok(pick(s, q.id), `pick refused ${q.id} in phase ${s.phase}`);
  ok(s.phase === "line", "a picked question must start speaking immediately");
  seen.push(type(s));
  const before = s.round;
  drain();
  if (s.round !== before) ok(before === expectedRound && s.round === before + 1 && questionsOf({ ...s, round: before }).length === 0, `round jumped ${before} -> ${s.round} too early`);
  if (s.round !== expectedRound) { expectedRound = s.round; ok(expectedRound < TOTAL_ROUNDS, "walked past the last round"); }
  ok(pick(s, q.id) === false, `re-picking the answered question ${q.id} must be refused`);
}
ok(seen.length === TOTAL_QUESTIONS, `walked ${seen.length} answers, expected ${TOTAL_QUESTIONS}`);
ok(s.asked.length === TOTAL_QUESTIONS, `asked ${s.asked.length} of ${TOTAL_QUESTIONS}`);
ok(s.phase === "end", `ended in phase ${s.phase}`);

// Interrupting must be allowed: a tap on a chip mid-sentence is the common case on a phone, and refusing
// it silently is what the first version of pick() did.
const t = createScript();
t.round = 0;
t.phase = "ask";
t.beats = [];
ok(pick(t, ROUNDS[0].questions[0].id), "first pick failed");
advance(t, 1);
ok(visibleText(t).length > 0 && isTalking(t), "typing should have started");
ok(pick(t, ROUNDS[0].questions[1].id), "an interruption must be accepted, not queued");
ok(visibleText(t).length === 0, "an interrupted answer should restart the new one from nothing");

// Timing: the whole thing must be over in a plausible window, and one beat must not take forever.
// Reading time with nobody tapping to skip, which is the only honest way to size the ending: a visitor
// who never touches the screen still has to be able to get through it. The first version of this loop
// stalled in "ask" forever and reported its own iteration cap as if it were a measurement.
const timed = createScript();
let seconds = 0;
while (timed.phase !== "end" && seconds < 6000) {
  seconds += 0.25;
  // One step per quarter second. Looping advance() until the beat fills would type the whole beat
  // instantly and report the entire conversation as a few seconds of reading.
  advance(timed, 0.25);
  if (timed.phase === "ask") {
    const q = questionsOf(timed)[0];
    if (!q) {
      ok(false, "the timed walk stalled with no question to ask");
      break;
    }
    pick(timed, q.id);
    continue;
  }
  if (!isTalking(timed)) tapped(timed);
}
ok(timed.phase === "end", "the timed walk never reached the end card");
ok(seconds > 120 && seconds < 900, `the whole conversation reads in ${(seconds / 60).toFixed(1)} min; that is the ending's cost`);
console.log(`dialogue: ${TOTAL_ROUNDS} rounds / ${TOTAL_QUESTIONS} questions, fully typed in ${(seconds / 60).toFixed(1)} min of reading, ${taps} taps walked`);
console.log(fails.length ? "\nFAIL\n" + fails.map((f) => " - " + f).join("\n") : "\nall dialogue checks passed");
process.exit(fails.length ? 1 : 0);
