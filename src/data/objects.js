// objects.json, read and made load-bearing.
//
// The file is the content: what each thing is called, which glTF draws it, what the crew member beside it
// says when you arrive, and the four rounds of four questions he can be asked about it. This module is the
// contract: it validates the shape, refuses to let the file and the authored route disagree, and hands each
// stop its conversation.
//
// It is bundled, not fetched: the rail is authored and the content is not, they meet at the id list, and a
// file that is missing at boot is a black screen either way - so it is compiled in and checked at build time
// instead of being asked for over HTTP at runtime. tools/check-objects.mjs runs the same `apply`.
import payload from "./objects.json" with { type: "json" };
import { STOPS, ROUTE_IDS } from "../journey/stops.js";
import { MAX_BEATS, MAX_BEAT_CHARS } from "../lib/dialogue.js";

export const OBJECTS = payload.objects;

export const PLANETS = ["moon", "mars", "solar"];
export const MAX_OPTION_CHARS = 46;   // one chip, across a 400 px phone
export const ROUNDS_PER_OBJECT = 4;
export const OPTIONS_PER_ROUND = 4;

// The one line every conversation ends on, and the one thing it has to get right: where the visitor goes
// next. Four objects a world, then a departure, then a way home - so the last crew member of a world cannot
// point at a next one, and the last of the piece cannot point forward at all.
const LAST_WORD = {
  moon: "Scroll on. The ascent stage is that way, and Mars is beyond it.",
  mars: "Scroll on. Out past the limb of Mars, two machines wait with nobody to visit them.",
  solar: "That is the whole of it. Scroll back down the page to fly home.",
};

export function onwardLine(object) {
  const route = STOPS[object.QA.planet];
  return route.at(-1).id === object.id ? LAST_WORD[object.QA.planet] : "Scroll on. The next one is that way.";
}

// The conversation shape lib/dialogue.js runs: intro beats, four rounds of four options with one answer
// each, then a wrap-up. Question ids are namespaced by object, because one phase machine keeps a list of
// what has been asked and two instruments must not collide over a bare "how".
export function conversationFor(object) {
  const rounds = object.QA.rounds.map((round, i) => ({
    title: round.title ?? "Round " + (i + 1),
    questions: round.questionOptionsForUser.map((q, j) => ({ id: `${object.id}:${i}:${j}`, q, a: round.answerForEachOption[j] })),
  }));
  return {
    id: object.id,
    name: object.name,
    intro: { id: "intro", beats: object.introductoryTalk },
    rounds,
    outro: { id: "outro", beats: [`That is ${object.name}, then.`, onwardLine(object)] },
    endCard: null,
  };
}

function validate(objects) {
  const problems = [];
  const ids = new Set();
  for (const o of objects) {
    const at = (m) => `${o.id}: ${m}`;
    if (ids.has(o.id)) problems.push(at("id used twice"));
    ids.add(o.id);
    if (!/\.(gltf|glb)$/.test(o["3dmodel"] ?? "")) problems.push(at("3dmodel is not a .gltf or .glb"));
    if (!/^[a-z0-9-]+$/.test(o.id)) problems.push(at("id must be a filename-safe slug"));
    if (!Array.isArray(o.introductoryTalk) || o.introductoryTalk.length < 1 || o.introductoryTalk.length > MAX_BEATS) problems.push(at(`${o.introductoryTalk?.length} intro beats, expected 1-${MAX_BEATS}`));
    for (const b of o.introductoryTalk ?? []) if (b.length > MAX_BEAT_CHARS) problems.push(at(`intro beat of ${b.length} chars overflows the bubble (limit ${MAX_BEAT_CHARS})`));
    if (!PLANETS.includes(o.QA?.planet)) problems.push(at(`QA.planet "${o.QA?.planet}" is not ${PLANETS.join("/")}`));
    if (typeof o.QA?.location !== "string" || o.QA.location.length < 8) problems.push(at("QA.location must say where this really is"));
    if (o.QA?.rounds?.length !== ROUNDS_PER_OBJECT) problems.push(at(`${o.QA?.rounds?.length} rounds, expected ${ROUNDS_PER_OBJECT}`));
    for (const [i, round] of (o.QA?.rounds ?? []).entries()) {
      const q = round.questionOptionsForUser ?? [], a = round.answerForEachOption ?? [];
      if (q.length !== OPTIONS_PER_ROUND || a.length !== OPTIONS_PER_ROUND) problems.push(at(`round ${i + 1} has ${q.length} options and ${a.length} answers, expected ${OPTIONS_PER_ROUND} each`));
      if (new Set(q).size !== q.length) problems.push(at(`round ${i + 1} repeats a question`));
      for (const s of q) if (s.length > MAX_OPTION_CHARS) problems.push(at(`round ${i + 1}: a ${s.length}-char option will not fit a chip`));
      for (const [j, beats] of a.entries()) {
        if (!Array.isArray(beats) || beats.length < 1 || beats.length > MAX_BEATS) problems.push(at(`round ${i + 1} option ${j + 1}: ${beats?.length} beats, expected 1-${MAX_BEATS}`));
        for (const b of beats ?? []) if (b.length > MAX_BEAT_CHARS) problems.push(at(`round ${i + 1} option ${j + 1}: beat of ${b.length} chars overflows the bubble`));
        if (beats?.length && !beats[beats.length - 1].trim().endsWith(".")) problems.push(at(`round ${i + 1} option ${j + 1}: the last beat should end the sentence`));
      }
    }
  }
  return problems;
}

// Fill the authored route with the file's content. Returns problems and throws on nothing: the boot screen
// is the right place to say what is wrong, and a checker can print the same list.
export function apply(objects) {
  if (!Array.isArray(objects)) return ['objects.json must be { objects: [...] }'];
  const problems = validate(objects);
  for (const planet of PLANETS) {
    const list = objects.filter((o) => o.QA.planet === planet);
    if (list.length !== STOPS[planet].length) {
      problems.push(`${planet}: objects.json has ${list.length} objects and the walk has ${STOPS[planet].length} stops`);
      continue;
    }
    STOPS[planet].forEach((stop, i) => {
      const o = list[i];
      if (o.id !== stop.id) problems.push(`${planet} stop ${i}: the route expects "${stop.id}" and the file puts "${o.id}" there`);
      Object.assign(stop, { name: o.name, location: o.QA.location, model: o["3dmodel"], convo: conversationFor(o) });
    });
    const want = ROUTE_IDS[planet].join(", ");
    const got = list.map((o) => o.id).join(", ");
    if (want !== got) problems.push(`${planet}: route order is ${want}, file order is ${got}`);
  }
  return problems;
}

// Everything the boot has to hand to GLTFLoader before the first frame. Ten stops, ten different machines,
// so this is ten paths; it is a set rather than a list because tools/check-models.mjs refuses a shared file
// and the boot must not ask for the same bytes twice if that ever changes.
export const modelPaths = () => [...new Set(Object.values(STOPS).flat().map((s) => s.model).filter(Boolean))];
export const allStops = () => Object.values(STOPS).flat();
