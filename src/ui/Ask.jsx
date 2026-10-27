import { useEffect, useRef, useState } from "react";
import { dialogue } from "../state/dialogue.js";
import NasaLink from "./NasaLink.jsx";

// The conversation after the briefing: two decisions and one open channel. The panel is DOM and lives in the
// HUD, because a React state change inside <Canvas> is what unhooks ScrollControls. `dialogue.generating` is
// the only thing this panel tells the scene: it keeps the crew member's hands moving while the answer service
// streams, and it is reset on unmount so a moved-on stop does not leave him gesturing at nobody.
const MAX_QUESTION = 500;

const Arrow = () => (
  <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
    <path d='M3 8h9M8.5 4.5 12 8l-3.5 3.5' />
  </svg>
);

export default function Ask({ stop, onMoveOn, onLeave }) {
  const [mode, setMode] = useState("choice");
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const abort = useRef(null);
  const input = useRef(null);
  const body = useRef(null);
  const panel = useRef(null);

  const busy = status === "thinking" || status === "streaming";

  // On a phone the keyboard covers the bottom of the layout viewport, and a fixed panel parked there sits
  // behind it. The visual viewport is the only thing that knows how tall the keyboard is, so the panel
  // rides on top of it while it is up and drops back when it is gone. Coarse pointers only - a desktop
  // keyboard never resizes the viewport, and a hardware one should not move anything either.
  useEffect(() => {
    const el = panel.current;
    const vv = window.visualViewport;
    if (!el || !vv || !window.matchMedia("(pointer: coarse)").matches) return;
    const fit = () => {
      const open = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      const room = Math.max(0, window.innerHeight - el.offsetHeight - 24);
      el.style.setProperty("--kb", Math.min(open > 80 ? open : 0, room) + "px");
    };
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
    };
  }, []);

  useEffect(() => {
    if (mode === "ask" && status === "idle") input.current?.focus({ preventScroll: true });
  }, [mode, status]);

  useEffect(() => {
    const el = body.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [answer, status]);

  useEffect(
    () => () => {
      abort.current?.abort();
      dialogue.generating = 0;
    },
    [],
  );

  const send = async (event) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setAsked(text);
    setQuestion("");
    setAnswer("");
    setError("");
    setStatus("thinking");
    dialogue.generating = 1;
    let acc = "";
    let started = false;
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectId: stop.id, question: text, history }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error || "The crew link is down. Try again in a moment.");
      }
      if (!response.body) throw new Error("The crew link returned no voice.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        if (!started) {
          started = true;
          setStatus("streaming");
        }
        acc += chunk;
        setAnswer(acc);
      }
      const final = (acc + decoder.decode()).trim();
      setAnswer(final);
      if (final) {
        setHistory((rows) => [...rows, { role: "user", content: text }, { role: "assistant", content: final }].slice(-8));
        setStatus("done");
      } else {
        throw new Error("The crew link went quiet. Try again.");
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
      setError(err?.message || "The crew link is down. Try again in a moment.");
      setStatus("error");
    } finally {
      dialogue.generating = 0;
      if (abort.current === controller) abort.current = null;
    }
  };

  const moveOn = () => {
    abort.current?.abort();
    dialogue.generating = 0;
    onMoveOn();
  };

  if (mode === "choice") {
    return (
      <section ref={panel} className='ask ask-choice' aria-label='Conversation options'>
        <header className='ask-head'>
          <span className='ask-led' />
          <b>CREW LINK</b>
          <span className='ask-id'>{stop.name}</span>
        </header>
        <div className='ask-choice-copy'>
          <b>He has finished the briefing.</b>
          <span>Ask him something about the machine, or move on when you are ready.</span>
        </div>
        <div className='ask-choice-actions'>
          <button type='button' className='ask-cta' onClick={() => setMode("ask")}>
            Ask a question
          </button>
          <button type='button' className='ask-secondary' onClick={moveOn}>
            Move to next objective
          </button>
        </div>
      </section>
    );
  }

  const stateLabel = status === "thinking" ? "THINKING" : status === "streaming" ? "RECEIVING" : status === "error" ? "SIGNAL LOST" : "CHANNEL OPEN";

  return (
    <section ref={panel} className='ask' aria-label='Ask the crew member'>
      <header className='ask-head'>
        <span className={"ask-led" + (busy ? " ask-led-live" : "") + (status === "error" ? " ask-led-bad" : "")} />
        <b>{stateLabel}</b>
        <span className='ask-id'>{stop.name}</span>
      </header>

      {(asked || answer || busy || error) && (
        <div className='ask-body' ref={body} aria-live='polite' aria-busy={busy}>
          {asked ? (
            <p className='ask-q'>
              <span>YOU</span>
              {asked}
            </p>
          ) : null}
          {status === "thinking" ? (
            <p className='ask-thinking'>
              The astronaut is thinking
              <i />
              <i />
              <i />
            </p>
          ) : null}
          {answer ? (
            <p className='ask-answer'>
              {answer}
              {status === "streaming" ? <span className='ask-caret' /> : null}
              <NasaLink source={stop.convo.source} name={stop.name} onLeave={onLeave} />
            </p>
          ) : null}
          {error ? <p className='ask-error'>{error}</p> : null}
        </div>
      )}

      <form className='ask-form' onSubmit={send}>
        <span className='ask-glyph' aria-hidden='true'>
          &gt;
        </span>
        <input
          ref={input}
          className='ask-input'
          type='text'
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={MAX_QUESTION}
          placeholder={history.length ? "Ask a follow-up…" : "Ask the astronaut…"}
          aria-label='Ask the astronaut a question'
          autoComplete='off'
          enterKeyHint='send'
          disabled={busy}
        />
        <button type='submit' className='ask-send' disabled={busy || !question.trim()} aria-label='Send question'>
          <Arrow />
        </button>
      </form>

      <footer className='ask-foot'>
        <span>Grounded in the site briefing.</span>
        <button type='button' className='ask-move' onClick={moveOn}>
          Move to next objective
          <Arrow />
        </button>
      </footer>
    </section>
  );
}
