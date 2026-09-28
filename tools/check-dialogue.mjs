// Shape and flow of every conversation the visitor can have on the walk, without mounting anything:
// src/lib/dialogue.js is a phase machine and src/data/objects.json is its content, so the two together can
// be walked here. This exists because the content is the part most likely to be edited by someone who never
// reads the render path - a fifth option in a round, a missing answer, a four hundred character beat - and
// each of those passes every other suite and shows up as a stuck conversation or an overflowed caption
// bubble on a phone nobody has plugged in.
import { apply, OBJECTS, conversationFor, OPTIONS_PER_ROUND, ROUNDS_PER_OBJECT } from "../src/data/objects.js";
import { MAX_BEAT_CHARS, createScript, questionsOf, pick, advance, tapped, visibleText, isTalking, roundTitle, questionTotal } from "../src/lib/dialogue.js";

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
    tapped(s);
  }
  return taps;
};

// The same binding the app performs, so a conversation is walked as the HUD will actually see it.
for (const m of apply(OBJECTS)) fails.push("objects.json: " + m);
const conversations = OBJECTS.map(conversationFor);
ok(conversations.length === 10, `expected ten conversations (four lunar, four Martian, two in deep space), found ${conversations.length}`);
const allIds = new Set();

let reading = 0;
for (const convo of conversations) {
  const at = (m) => `${convo.id}: ${m}`;
  ok(convo.rounds.length === ROUNDS_PER_OBJECT, at(`${convo.rounds.length} rounds, expected ${ROUNDS_PER_OBJECT}`));

  for (const [r, round] of convo.rounds.entries()) {
    ok(round.questions.length === OPTIONS_PER_ROUND, at(`round ${r + 1} offers ${round.questions.length} questions, expected ${OPTIONS_PER_ROUND}`));
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

  // Walk it, choosing the first chip each round, and check the machine terminates in "end".
  const s = createScript(convo);
  ok(s.phase === "line" && s.round < 0, at("a fresh script should open on the intro line"));
  let taps = drain(s);
  ok(s.phase === "ask" && s.round === 0, at(`intro did not hand to round 1 (phase=${s.phase}, round=${s.round})`));
  let seen = 0, expectedRound = 0;
  while (s.phase !== "end") {
    const qs = questionsOf(s);
    ok(qs.length === OPTIONS_PER_ROUND, at(`round ${expectedRound + 1} offered ${qs.length} chips, expected ${OPTIONS_PER_ROUND}`));
    if (!qs.length) break;
    const q = qs[0];
    ok(roundTitle(s) === convo.rounds[expectedRound].title, at(`round title drifted at ${q.id}`));
    ok(pick(s, q.id), at(`pick refused ${q.id} in phase ${s.phase}`));
    ok(s.phase === "line", at("a picked question must start speaking immediately"));
    type(s);
    seen++;
    taps += drain(s);
    // One answer is a whole round: the other three options were questions the visitor did not ask.
    ok(s.round === expectedRound + 1 || s.phase === "end", at(`round ${expectedRound + 1} did not close after one answer (round=${s.round}, phase=${s.phase})`));
    expectedRound = s.round;
    ok(pick(s, q.id) === false, at(`re-picking the answered question ${q.id} must be refused`));
  }
  ok(seen === questionTotal(convo), at(`walked ${seen} answers, expected ${questionTotal(convo)}`));
  ok(s.asked.length === questionTotal(convo), at(`asked ${s.asked.length} of ${questionTotal(convo)}`));
  ok(s.phase === "end" && s.pendingEnd, at(`ended in phase ${s.phase}`));
  // The outro branch fires on the last answer, so the round index stops on the final round rather than
  // running one past it - which is what keeps the HUD's "round 4 of 4" honest during the wrap-up.
  ok(s.round === convo.rounds.length - 1, at(`ended on round ${s.round + 1} of ${convo.rounds.length}`));

  // Interrupting must be allowed: a tap on a chip mid-sentence is the common case on a phone. The HUD only
  // shows chips in the ask phase, so the other three options of a round are unreachable once one is answered
  // - which is what the round counter above proves as the walk moves on.
  const t = createScript(convo);
  t.round = 0;
  t.phase = "ask";
  t.beats = [];
  ok(pick(t, convo.rounds[0].questions[3].id), at("last-chip pick failed"));
  advance(t, 1);
  ok(visibleText(t).length > 0 && isTalking(t), at("typing should have started"));
  ok(pick(t, convo.rounds[0].questions[0].id), at("a chip tapped while he is still talking must be heard"));
  ok(t.lastQuestion === convo.rounds[0].questions[0].id && t.beats === convo.rounds[0].questions[0].a, at("the interrupting pick did not take over the line"));

  // Reading time with nobody tapping to skip, which is the only honest way to size a stop: a visitor who
  // never touches the screen still has to be able to get past this astronaut and on to the next. One step
  // per quarter second - looping advance() until the beat fills would type it instantly and report the
  // whole conversation as a few seconds.
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
  ok(seconds > 20 && seconds < 300, at(`the conversation reads in ${(seconds / 60).toFixed(1)} min; a stop should cost under five`));
  reading += seconds;
  console.log(`${convo.id}: ${convo.rounds.length} rounds x ${OPTIONS_PER_ROUND} options, ${(seconds / 60).toFixed(1)} min of reading, ${taps} taps walked`);
}

console.log(`the whole walk costs ${(reading / 60).toFixed(0)} min of reading across ${conversations.length} crew members`);
console.log(fails.length ? "\nFAIL\n" + fails.map((f) => " - " + f).join("\n") : "\nall dialogue checks passed");
process.exit(fails.length ? 1 : 0);
