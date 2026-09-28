import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { preloadMaps } from "./lib/textures.js";
import { buildTerrain, deriveNormalMap, levelTerrain, flattenAlongCorridor } from "./lib/terrain.js";
import { MOON, MARS } from "./journey/worlds.js";
import { CORRIDOR_BY_WORLD } from "./journey/corridor.js";
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
    const terrains = {};
    for (const world of [MOON, MARS]) {
      say("shaping " + world.id + " from space");
      const t = buildTerrain({ seg: 96, avoid: CORRIDOR_BY_WORLD[world.id], relief: world.relief });
      flattenAlongCorridor(t, CORRIDOR_BY_WORLD[world.id]);
      levelTerrain(t, world.cut[0], world.cut[2]);
      t.normalMap = deriveNormalMap(t.heights, 512);
      terrains[world.id] = t;
    }
    journey.bootMs = performance.now() - t0;
    if (boot) boot.remove();
    createRoot(document.getElementById("root")).render(<App terrains={terrains} />);
  } catch (err) {
    say("failed to start: " + err.message);
    throw err;
  }
}

start();
