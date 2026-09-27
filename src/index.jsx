import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { preloadMaps } from "./lib/textures.js";
import { buildTerrain, deriveNormalMap, levelTerrain } from "./lib/terrain.js";
import { CUT_LOCAL } from "./journey/pose.js";
import { GROUND_CORRIDOR } from "./journey/corridor.js";
import { journey } from "./state/journey.js";

const boot = document.getElementById("boot");
const say = (msg) => {
  if (boot) boot.textContent = msg;
};

// Texture decode and the 9409-vertex displacement happen once, here, behind the loading screen: on this
// JIT the terrain build alone measures ~270ms, which is invisible at boot and a stall if it lands on the
// orbit-to-surface cut.
async function start() {
  const t0 = performance.now();
  try {
    await preloadMaps(8, (p) => say("loading surface maps " + Math.round(p * 100) + "%"));
    say("shaping the terrain");
    const terrain = buildTerrain({ seg: 96, avoid: GROUND_CORRIDOR });
    levelTerrain(terrain, CUT_LOCAL[0], CUT_LOCAL[2]);
    terrain.normalMap = deriveNormalMap(terrain.heights, 512);
    journey.bootMs = performance.now() - t0;
    if (boot) boot.remove();
    createRoot(document.getElementById("root")).render(<App terrain={terrain} />);
  } catch (err) {
    say("failed to start: " + err.message);
    throw err;
  }
}

start();
