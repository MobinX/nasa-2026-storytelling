// The answer service: validate a question, then stream the crew member's reply with the Vercel AI SDK.
// The OpenAI-compatible endpoint is the Azure OpenAI v1 API; the model is the gpt-6-luna deployment. Keep
// this module server-only - the API key must never reach the client bundle.
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { buildSystemPrompt, findObject } from "./prompt.js";

export const MAX_QUESTION_CHARS = 500;
export const MAX_HISTORY_ITEMS = 8;
export const MAX_HISTORY_ITEM_CHARS = 2000;
export const MAX_HISTORY_CHARS = 6000;

let provider;

function getProvider() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  provider ??= createOpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || "https://oryxa.openai.azure.com/openai/v1",
  });
  return provider;
}

export function validateAsk(body) {
  if (!body || typeof body !== "object") return { error: "A question is required." };
  const objectId = typeof body.objectId === "string" ? body.objectId : "";
  if (!findObject(objectId)) return { error: "That machine is not on this walk." };

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return { error: "Ask the crew member something first." };
  if (question.length > MAX_QUESTION_CHARS) return { error: `Keep the question under ${MAX_QUESTION_CHARS} characters.` };

  const raw = Array.isArray(body.history) ? body.history : [];
  if (raw.length > MAX_HISTORY_ITEMS) return { error: "This channel has too much history." };
  let total = 0;
  const history = [];
  for (const message of raw) {
    if (!message || (message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string") {
      return { error: "Malformed conversation history." };
    }
    const content = message.content.trim();
    if (!content || content.length > MAX_HISTORY_ITEM_CHARS) return { error: "Malformed conversation history." };
    total += content.length;
    history.push({ role: message.role, content });
  }
  if (total > MAX_HISTORY_CHARS) return { error: "This channel has too much history." };

  return { objectId, question, history };
}

export function streamAnswer({ objectId, question, history, abortSignal }) {
  const system = buildSystemPrompt(objectId);
  if (!system) throw new Error("Unknown object");
  const model = getProvider().chat(process.env.OPENAI_MODEL || "gpt-6-luna");
  return streamText({
    model,
    system,
    messages: [...history, { role: "user", content: question }],
    abortSignal,
  });
}
