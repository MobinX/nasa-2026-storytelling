// Shape and flow of every stop's spoken introduction, without mounting anything: src/lib/dialogue.js is a
// phase machine and src/data/objects.json is its content, so the two together can be walked here. This
// exists because the content is the part most likely to be edited by someone who never reads the render
// path - a missing beat, a four hundred character caption - and each of those passes every other suite and
// shows up as an overflowed bubble on a phone nobody has plugged in.
//
// The four-round quiz this used to walk is gone. What is checked now is the intro that hands over to the
// ask/move-on choice, and the briefing the answer service reads for questions asked in the visitor's own
// words.
import { apply, OBJECTS, conversationFor, MIN_BRIEFING_FACTS, MAX_TOPIC_CHARS, MAX_QUESTION_CHARS, MAX_ANSWER_CHARS } from "../src/data/objects.js";
import { MAX_BEAT_CHARS, createScript, advance, tapped, finish, visibleText, isTalking, isComplete } from "../src/lib/dialogue.js";

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

let reading = 0;
let facts = 0;
for (const convo of conversations) {
  const at = (m) => `${convo.id}: ${m}`;
  const object = OBJECTS.find((o) => o.id === convo.id);
  ok(!!object, at("no object in objects.json"));
  if (!object) continue;

  ok(convo.intro.beats.length >= 1 && convo.intro.beats.length <= 3, at(`${convo.intro.beats.length} intro beats, expected 1-3`));

  // The (NASA) mark belongs to a finished line, not to an empty bubble. Each beat is a separate line, so it
  // must be absent while typing, present when the line lands, and absent again when the next one starts.
  const typed = createScript(convo);
  ok(!isComplete(typed), at("the NASA mark would show before any text"));
  for (let i = 0; i < 20000 && advance(typed, 1 / 60); i++);
  ok(isComplete(typed), at("the first beat never finishes typing"));
  ok(visibleText(typed) === convo.intro.beats[0], at("the typed line does not match its beat"));
  tapped(typed);
  ok(typed.phase === "line" && !isComplete(typed), at("the next line starts with the NASA mark already visible"));
  for (const b of convo.intro.beats) ok(b.length <= MAX_BEAT_CHARS, at(`a ${b.length}-char intro beat overflows the bubble (limit ${MAX_BEAT_CHARS})`));
  ok(/^https:\/\/([a-z0-9-]+\.)*nasa\.gov\//.test(convo.source), at("no official NASA source page for the (NASA) mark"));
  ok(!/four rounds|one question each|round [1-4] of/i.test(convo.intro.beats.join(" ")), at("the introduction still advertises the removed round system"));

  ok(Array.isArray(object.QA.briefing) && object.QA.briefing.length >= MIN_BRIEFING_FACTS, at(`${object.QA.briefing?.length ?? 0} briefing facts, expected at least ${MIN_BRIEFING_FACTS}`));
  const seen = new Set();
  for (const [i, f] of object.QA.briefing.entries()) {
    ok(typeof f.topic === "string" && f.topic.length > 0 && f.topic.length <= MAX_TOPIC_CHARS, at(`briefing fact ${i + 1} has a bad topic`));
    ok(typeof f.q === "string" && f.q.length >= 6 && f.q.length <= MAX_QUESTION_CHARS, at(`briefing fact ${i + 1} has a ${f.q?.length ?? 0}-char question`));
    ok(typeof f.a === "string" && f.a.trim().length > 0 && f.a.length <= MAX_ANSWER_CHARS, at(`briefing fact ${i + 1} has a bad answer`));
    ok(!seen.has(f.q), at(`briefing repeats "${f.q}"`));
    seen.add(f.q);
    facts++;
  }

  // Walk the intro exactly as the HUD does: type each beat, tap to skip/finish it, and hand over to the
  // choice panel on the last one.
  const s = createScript(convo);
  ok(s.phase === "line" && s.beat === 0, at("a fresh script should open on the intro line"));
  ok(finish(s) === false && s.phase === "line", at("finish() released the scroll before the introduction was over"));
  let taps = drain(s);
  ok(s.phase === "choice", at(`the intro did not hand to the choice panel (phase=${s.phase})`));
  ok(visibleText(s) === "", at("the choice phase still owns visible caption text"));
  ok(tapped(s) === false, at("a caption tap after the intro tried to move the phase machine"));
  ok(advance(s, 1) === false, at("time kept typing in the choice phase"));
  ok(finish(s) === true && s.phase === "done", at("finish() did not move the choice to done"));
  ok(finish(s) === false, at("finish() can be called twice"));
  ok(tapped(s) === false, at("a caption tap after moving on tried to start the intro again"));

  // A tap mid-sentence completes that beat and stays in the line: it must never jump the visitor past the
  // briefing, and a skipped beat must still be readable in full.
  const mid = createScript(convo);
  advance(mid, 0.05);
  ok(isTalking(mid), at("typing did not start on the first advance"));
  const shown = visibleText(mid);
  tapped(mid);
  ok(mid.phase === "line" && visibleText(mid).length > shown.length, at("a mid-sentence tap did not finish the beat in place"));

  // Reading time with nobody tapping to skip: a visitor who never touches the screen still has to be able
  // to get past the astronaut. One step per quarter second is deliberately slower than the renderer.
  const timed = createScript(convo);
  let seconds = 0;
  while (timed.phase === "line" && seconds < 300) {
    seconds += 0.25;
    advance(timed, 0.25);
    if (!isTalking(timed)) tapped(timed);
  }
  ok(timed.phase === "choice", at("the timed walk never reached the choice panel"));
  ok(seconds > 5 && seconds < 120, at(`the introduction reads in ${(seconds / 60).toFixed(1)} min; it should cost under two`));
  reading += seconds;
  console.log(`${convo.id}: ${convo.intro.beats.length} intro beats, ${object.QA.briefing.length} briefing facts, ${(seconds / 60).toFixed(1)} min of reading, ${taps} taps walked`);
}

console.log(`the whole walk costs ${(reading / 60).toFixed(1)} min of spoken reading across ${conversations.length} crew members, with ${facts} briefing facts behind the questions`);
console.log(fails.length ? "\nFAIL\n" + fails.map((f) => " - " + f).join("\n") : "\nall dialogue checks passed");
process.exit(fails.length ? 1 : 0);
