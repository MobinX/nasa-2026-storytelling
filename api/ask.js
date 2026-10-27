// Vercel Function: POST /api/ask. Node runtime, same handler shape as the dev middleware in vite.config.js.
// The reply is an incremental UTF-8 text stream, not JSON, so the HUD can show the crew member thinking and
// then append words as they arrive.
import { streamAnswer, validateAsk } from "../server/answer.js";

export const config = { maxDuration: 60 };

const sendJson = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
};

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString("utf8"));
    return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Use POST to ask a question." });
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { error: "The question could not be read." });
  }

  const ask = validateAsk(body);
  if (ask.error) return sendJson(res, 400, { error: ask.error });

  const controller = new AbortController();
  const onClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on?.("close", onClose);

  try {
    const result = streamAnswer({ ...ask, abortSignal: controller.signal });
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    for await (const chunk of result.textStream) {
      if (res.writableEnded) break;
      res.write(chunk);
    }
    res.end();
  } catch (error) {
    if (error?.name !== "AbortError") console.error("ask:", error?.message ?? error);
    if (!res.headersSent) sendJson(res, 503, { error: "The crew link is down. Try again in a moment." });
    else if (!res.writableEnded) res.end();
  } finally {
    res.off?.("close", onClose);
  }
}
