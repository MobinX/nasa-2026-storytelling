// Builds the app for SSR with react/@react-three aliased to a headless hook dispatcher, then mounts it
// and runs the real per-frame callbacks. Catches render-path and useFrame crashes that neither the
// bundler nor tools/check-journey.mjs can see.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx2d = () => {
  const noop = () => {};
  const grad = { addColorStop: noop };
  return { fillStyle: "#000", font: "", textAlign: "", textBaseline: "", clearRect: noop, fillRect: noop, fillText: noop, drawImage: noop, beginPath: noop, arc: noop, fill: noop, createLinearGradient: () => grad, createRadialGradient: () => grad, getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(140) }) };
};
globalThis.document = {
  createElement: (tag) => ({ tagName: tag, width: 0, height: 0, style: {}, getContext: () => ctx2d(), addEventListener: noop2, removeEventListener: noop2 }),
  getElementById: () => null,
  addEventListener: noop2,
  removeEventListener: noop2,
  hidden: false,
};
function noop2() {}
globalThis.window = { location: { search: "" }, addEventListener: noop2, removeEventListener: noop2 };
Object.defineProperty(globalThis, "navigator", { value: { hardwareConcurrency: 8, deviceMemory: 8, devicePixelRatio: 3 }, configurable: true });
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.Image = class {
  set src(v) {
    const file = path.join(root, "public", v.replace(/^\//, ""));
    if (!fs.existsSync(file)) return setTimeout(() => this.onerror?.(new Error("missing " + v)), 0);
    setTimeout(() => this.onload?.(), 0);
  }
};

const { build } = await import("vite");
await build({
  configFile: false,
  root,
  logLevel: "error",
  plugins: [(await import("@vitejs/plugin-react")).default()],
  resolve: {
    // Regex finds, so "react" does not prefix-match "react/jsx-runtime" into a bogus path.
    alias: [
      { find: new RegExp("^react[/]jsx-runtime$"), replacement: path.join(root, "tools/stubs/jsx-runtime.js") },
      { find: new RegExp("^react$"), replacement: path.join(root, "tools/stubs/react.js") },
      { find: new RegExp("^@react[/-]three[/]fiber$"), replacement: path.join(root, "tools/stubs/fiber.js") },
      { find: new RegExp("^@react[/-]three[/]drei$"), replacement: path.join(root, "tools/stubs/drei.js") },
    ],
  },
  build: { ssr: path.join(root, "tools/smoke-entry.jsx"), outDir: ".smoke", emptyOutDir: true, minify: false, target: "node22", rollupOptions: { external: ["three"] } },
});

const { run } = await import(path.join(root, ".smoke/smoke-entry.js"));
const out = await run();
const counts = {};
for (const t of out.hosts || []) counts[t] = (counts[t] || 0) + 1;
console.log("mount:", out.passes, "passes,", out.hosts ? Object.keys(counts).length : 0, "host types,", out.frames, "useFrame subscribers");
console.log("hosts:", Object.entries(counts).map(([k, v]) => `${k}x${v}`).join(" "));
out.notes.forEach((n) => console.log(" -", n));
console.log(out.errors.length ? "FAIL\n" + out.errors.map((e) => " ! " + e).join("\n") : "render + frame smoke passed");
process.exit(out.errors.length ? 1 : 0);
