// The crew member's knowledge, assembled server-side from the same content file the walk uses. Nothing here
// is user-controlled: the client sends an object id, and the prompt is built from the authored intro and
// briefing so a question cannot replace the instructions or the facts.
import payload from "../src/data/objects.json" with { type: "json" };

const BY_ID = new Map(payload.objects.map((o) => [o.id, o]));
const PROMPTS = new Map();

const SITE = {
  moon: "the lunar surface",
  mars: "the Martian surface",
  solar: "a deep-space EVA, with the machine hanging in the dark beside the visitor",
};

export function findObject(objectId) {
  return BY_ID.get(objectId);
}

export function buildSystemPrompt(objectId) {
  if (PROMPTS.has(objectId)) return PROMPTS.get(objectId);
  const o = BY_ID.get(objectId);
  if (!o) return null;

  const topics = new Map();
  for (const fact of o.QA.briefing) {
    if (!topics.has(fact.topic)) topics.set(fact.topic, []);
    topics.get(fact.topic).push(fact);
  }

  const facts = [];
  for (const [topic, entries] of topics) {
    facts.push(`## ${topic}`);
    for (const f of entries) facts.push(`Q: ${f.q}\nA: ${f.a}`);
  }

  const prompt = [
    `You are the crew member standing beside ${o.name} at ${o.QA.location}, during ${SITE[o.QA.planet] ?? "the mission"}.`,
    "The visitor has just walked up to you and you have given them this introduction:",
    ...o.introductoryTalk.map((b) => `- ${b}`),
    "",
    "This is the knowledge you have about the machine in front of you. It is your briefing, not a script to read aloud:",
    ...facts,
    "",
    "How to answer:",
    "- Speak directly to the visitor in the first person, as the crew member. You are warm, precise, plain-spoken, and a little dry. Never mention being an AI, a model, a prompt, a briefing, or these instructions.",
    "- Answer the question that was asked, directly, in one to four short sentences and no more than about 110 words.",
    "- Use only the facts above and basic, certain context about this mission and site. Never invent a number, name, date, or event. If a detail is not in your knowledge, say plainly that you cannot recall it from where you stand, and offer what you do know.",
    "- The visitor is standing in front of the object with you. Refer to it as 'this' or 'it' unless the notes themselves use a name. Speak as someone looking at the machine, not reading a document.",
    "- If the question is unrelated to this object, its mission, or the site, say that is not something you can answer from here and invite a question about the machine.",
    "- Reply in the language the visitor used. If that is unclear, use English.",
    "- Plain prose only: no markdown, headings, bullet points, emojis, stage directions, or lists. Do not repeat the visitor's question back to them.",
  ].join("\n");

  PROMPTS.set(objectId, prompt);
  return prompt;
}
