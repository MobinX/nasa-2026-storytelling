// Shape and flow of both companion conversations, without mounting anything: src/lib/dialogue.js is data
// plus a phase machine, so the whole thing can be walked here. This exists because the content is the
// part most likely to be edited by someone who never reads the render path - a second question in a
// round, or a four hundred character answer, passes every other suite and only shows up as an overflowed
// caption bubble on a phone that nobody has plugged in.
import { CONVERSATIONS, MAX_BEAT_CHARS, createScript, questionsOf, pick, advance, tapped, visibleText, isTalking, roundTitle, questionTotal } from "../src/lib/dialogue.js";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const type = (s) => {
  let g = 0;
  while (advance(s, 1 / 60)) if (++g > 20000) { ok(false, "advance() never terminates"); break; }
  return visibleText(s);
};
const drain = (s) => {
  let taps = 0;
  let guard = 0;
  while (s.phase === "line" && guard++ < 60) {
    type(s);
    taps++;
    ok(taps++ < 4000, "the conversation never terminates");
    tapped(s);
  }
  return taps;
};

ok(CONVERSATIONS.length === 2, `expected two conversations (Moon, Mars), found ${CONVERSATIONS.length}`);
const allIds = new Set();

for (const convo of CONVERSATIONS) {
  const at = (m) => `${convo.id}: ${m}`;
  ok(convo.rounds.length === 4, at(`${convo.rounds.length} rounds, expected 4`));
  ok(typeof convo.endCard?.title === "string" && /\d/.test(convo.endCard.title), at("the end card should date or number the landing"));

  for (const [r, round] of convo.rounds.entries()) {
    ok(round.questions.length === 1, at(`round ${r + 1} offers ${round.questions.length} questions, expected one chip`));
    ok(typeof round.title === "string" && round.title.length > 2, at(`round ${r + 1} has no title`));
    for (const q of round.questions) {
      ok(!allIds.has(q.id), at(`question id "${q.id}" is used twice across the piece - pick() would answer the wrong one`));
      allIds.add(q.id);
      ok(q.q.length > 6 && q.q.length <= 46, at(`${q.id}: question is ${q.q.length} chars; a chip has to fit across a phone`));
      ok(Array.isArray(q.a) && q.a.length >= 1 && q.a.length <= 3, at(`${q.id}: ${q.a?.length} beats, expected 1-3`));
      ok(q.a[q.a.length - 1].endsWith("."), at(`${q.id}: the last beat should end a sentence, not trail off`));
      for (const b of q.a) ok(b.length <= MAX_BEAT_CHARS, at(`${q.id}: a ${b.length}-char beat overflows the bubble (limit ${MAX_BEAT_CHARS})`));
    }
  }
  for (const [where, beats] of [["intro", convo.intro.beats], ["outro", convo.outro.beats]]) {
    ok(beats.length >= 1 && beats.length <= 3, at(`${where} has ${beats.length} beats`));
    for (const b of beats) ok(b.length <= MAX_BEAT_CHARS, at(`${where}: a ${b.length}-char beat overflows the bubble`));
  }

  // Walk it, always tapping the only chip on offer, and check the machine terminates in "end".
  const s = createScript(convo);
  ok(s.phase === "line" && s.round < 0, at("a fresh script should open on the intro line"));
  let taps = drain(s);
  ok(s.phase === "ask" && s.round === 0, at(`intro did not hand to round 1 (phase=${s.phase}, round=${s.round})`));
  let seen = 0, expectedRound = 0;
  while (s.phase !== "end") {
    const qs = questionsOf(s);
    ok(qs.length === 1, at(`round ${expectedRound + 1} offered ${qs.length} chips`));
    if (!qs.length) break;
    const q = qs[0];
    ok(roundTitle(s) === convo.rounds[expectedRound].title, at(`round title drifted at ${q.id}`));
    ok(pick(s, q.id), at(`pick refused ${q.id} in phase ${s.phase}`));
    ok(s.phase === "line", at("a picked question must start speaking immediately"));
    type(s);
    seen++;
    const before = s.round;
    taps += drain(s);
    if (s.round !== before) ok(before === expectedRound && s.round === before + 1, at(`round jumped ${before} -> ${s.round} too early`));
    if (s.round !== expectedRound) { expectedRound = s.round; ok(expectedRound < convo.rounds.length, at("walked past the last round")); }
    ok(pick(s, q.id) === false, at(`re-picking the answered question ${q.id} must be refused`));
  }
  ok(seen === questionTotal(convo), at(`walked ${seen} answers, expected ${questionTotal(convo)}`));
  ok(s.asked.length === questionTotal(convo), at(`asked ${s.asked.length} of ${questionTotal(convo)}`));
  ok(s.phase === "end" && s.pendingEnd, at(`ended in phase ${s.phase}`));

  // Interrupting must be allowed: a tap on a chip mid-sentence is the common case on a phone.
  const t = createScript(convo);
  t.round = 0;
  t.phase = "ask";
  t.beats = [];
  ok(pick(t, convo.rounds[0].questions[0].id), at("first pick failed"));
  advance(t, 1);
  ok(visibleText(t).length > 0 && isTalking(t), at("typing should have started"));

  // Reading time with nobody tapping to skip, which is the only honest way to size the ending: a visitor
  // who never touches the screen still has to be able to get through it. One step per quarter second -
  // looping advance() until the beat fills would type it instantly and report the whole conversation as
  // a few seconds.
  const timed = createScript(convo);
  let seconds = 0;
  while (timed.phase !== "end" && seconds < 6000) {
    seconds += 0.25;
    advance(timed, 0.25);
    if (timed.phase === "ask") {
      const q = questionsOf(timed)[0];
      if (!q) { ok(false, at("the timed walk stalled with no question to ask")); break; }
      pick(timed, q.id);
      continue;
    }
    if (!isTalking(timed)) tapped(timed);
  }
  ok(timed.phase === "end", at("the timed walk never reached the end card"));
  ok(seconds > 40 && seconds < 900, at(`the conversation reads in ${(seconds / 60).toFixed(1)} min; that is the ending's cost`));
  console.log(`dialogue ${convo.id}: ${convo.rounds.length} rounds / ${questionTotal(convo)} questions, ${(seconds / 60).toFixed(1)} min of reading, ${taps} taps walked`);
}

console.log(fails.length ? "\nFAIL\n" + fails.map((f) => " - " + f).join("\n") : "\nall dialogue checks passed");
process.exit(fails.length ? 1 : 0);
