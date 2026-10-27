// objects.json against the walk: the same validation and binding the app runs at boot, plus the one thing
// only a checker can see - that every model the file names is actually on disk. This is the gate that keeps
// a prose edit from being a runtime surprise, because the rail is authored and the content is not: they meet
// at the id list, and nothing renders until both agree.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apply, OBJECTS, PLANETS, modelPaths } from "../src/data/objects.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const problems = apply(OBJECTS);

for (const p of modelPaths()) {
  if (!fs.existsSync(path.join(root, "public", p))) problems.push(`${p}: named by objects.json and not on disk`);
}
for (const planet of PLANETS) {
  const n = OBJECTS.filter((o) => o.QA.planet === planet).length;
  if (!n) problems.push(`${planet}: no objects at all`);
  console.log(`${planet}: ${n} objects`);
}
const facts = OBJECTS.reduce((n, o) => n + o.QA.briefing.length, 0);
const chars = OBJECTS.reduce((n, o) => n + o.introductoryTalk.join("").length + o.QA.briefing.reduce((m, f) => m + f.q.length + f.a.length, 0), 0);
console.log(`objects.json: ${OBJECTS.length} objects, ${facts} briefing facts, ${(chars / 1000).toFixed(1)}k chars of copy`);
console.log(problems.length ? "\nFAIL\n" + problems.map((m) => " - " + m).join("\n") : "\nobjects.json verified against the walk");
process.exit(problems.length ? 1 : 0);
