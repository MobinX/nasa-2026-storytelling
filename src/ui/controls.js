import { input } from "../state/input.js";

const STICK_R = 52;

// ScrollControls listens to nothing but the native `scroll` event, so vertical touch scrolling is pure
// browser behaviour. That asymmetry is the whole gesture split: `touch-action:none` on the thumb pad
// claims the drag for walking, and `touch-action:pan-y` on the look pad lets the browser keep vertical
// pans (which scroll the journey) while horizontal drags come to us as yaw.
export function attachControls(stickEl, lookEl) {
  const off = [];
  const on = (el, type, fn, opts) => {
    el.addEventListener(type, fn, opts);
    off.push(() => el.removeEventListener(type, fn, opts));
  };

  let stickId = null, ox = 0, oy = 0;
  const endStick = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    input.move.x = 0;
    input.move.y = 0;
    input.active = false;
  };
  on(stickEl, "pointerdown", (e) => {
    if (stickId !== null || !input.enabled) return;
    stickId = e.pointerId;
    stickEl.setPointerCapture?.(e.pointerId);
    const r = stickEl.getBoundingClientRect();
    ox = r.left + r.width / 2;
    oy = r.top + r.height / 2;
    input.active = true;
    e.preventDefault();
  });
  on(stickEl, "pointermove", (e) => {
    if (e.pointerId !== stickId) return;
    const dx = e.clientX - ox, dy = e.clientY - oy;
    const m = Math.min(Math.hypot(dx, dy), STICK_R) / STICK_R;
    const a = Math.atan2(dy, dx);
    input.move.x = Math.cos(a) * m;
    input.move.y = -Math.sin(a) * m;
  });
  // pointercancel is the browser taking the gesture, not an error: treat it exactly like pointerup.
  on(stickEl, "pointerup", endStick);
  on(stickEl, "pointercancel", endStick);

  let lookId = null, lx = 0, ly = 0, fingers = 0;
  // Passive everywhere on this pad: a non-passive pointer listener is enough to make Android wait on the
  // gesture decision, and calling preventDefault would kill momentum scrolling outright.
  // momentum scrolling on Android.
  on(lookEl, "pointerdown", (e) => {
    if (!input.enabled) return;
    fingers++;
    if (lookId !== null) return;
    lookId = e.pointerId;
    lx = e.clientX;
    ly = e.clientY;
    input.active = true;
  }, { passive: true });
  on(lookEl, "pointermove", (e) => {
    if (e.pointerId !== lookId || !input.enabled) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    input.look.dx += dx;
    // Two fingers is the only vertical gesture that is not page scroll, so it owns pitch.
    if (fingers > 1) input.look.dy += dy;
    lx = e.clientX;
    ly = e.clientY;
  }, { passive: true });
  const endLook = (e) => {
    if (e.pointerId === lookId) {
      lookId = null;
      input.active = false;
      fingers = Math.max(0, fingers - 1);
    }
  };
  on(lookEl, "pointerup", endLook, { passive: true });
  on(lookEl, "pointercancel", endLook, { passive: true });

  const keys = new Set();
  const readKeys = () => {
    if (!input.enabled) {
      input.move.x = 0;
      input.move.y = 0;
      return;
    }
    let x = 0, y = 0;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
    if (keys.has("KeyW") || keys.has("ArrowUp")) y += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) y -= 1;
    input.move.x = x;
    input.move.y = y;
    input.active = x !== 0 || y !== 0;
  };
  const kd = (e) => {
    if (e.repeat || !input.enabled) return;
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
      keys.add(e.code);
      readKeys();
    }
    if (e.code === "ArrowUp" || e.code === "ArrowDown") e.preventDefault();
  };
  const ku = (e) => {
    if (!keys.delete(e.code)) return;
    readKeys();
  };
  window.addEventListener("keydown", kd);
  window.addEventListener("keyup", ku);

  const lockMove = (e) => {
    if (!document.pointerLockElement || !input.enabled) return;
    input.look.dx += e.movementX;
    input.look.dy -= e.movementY;
  };
  window.addEventListener("mousemove", lockMove);
  const lockClick = (e) => {
    if (!input.enabled || e.pointerType === "touch") return;
    if (!document.pointerLockElement) lookEl.requestPointerLock?.();
  };
  on(lookEl, "pointerdown", lockClick, { passive: true });

  return () => {
    off.forEach((f) => f());
    window.removeEventListener("keydown", kd);
    window.removeEventListener("keyup", ku);
    window.removeEventListener("mousemove", lockMove);
  };
}
