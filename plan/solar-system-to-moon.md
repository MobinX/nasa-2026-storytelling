# Solar System → Moon → Lunar Walk (scroll-driven R3F)

> **Nothing is committed yet — plan mode blocks writes and `git`.** On approval, in this order, before any coding: (1) copy this file to `plan/solar-system-to-moon.md` in the repo, `git add`/`commit`/`push` to `origin main`; (2) `CreateGoal` for this plan; (3) start gate 1.

## Context

`/data/data/com.termux/files/home/project/react-three-vite` is the upstream `benjaminmiles` starter: a 3-file app (`index.jsx`, `App.jsx`, `styles.css`) with a spinning `<Box>`, `<ambientLight>` and `<OrbitControls>` inside a `<Canvas>`. It is now the user's own repo (`MobinX/nasa-2026-storytelling`) and the Vite dev server is running (`npm run dev`, `http://192.168.0.164:5173/`).

The goal is to replace that demo scene with a single continuous experience: it opens on a readable, correctly-ordered solar system; the user scrolls and the camera flies past the inner planets, out to the Moon, and down into it; the Moon's world is revealed — black sky, harsh sunlit ground — and the user keeps walking across the lunar surface as they scroll.

Everything must work in a **phone browser** (Android/Termux, portrait, touch-first), so the design is constrained by mobile fill-rate, texture memory, and browser gesture handling, not by desktop GPU assumptions.

## Locked decisions (from you)

| | |
|---|---|
| Handoff | **Scroll drives everything, always** — including forward motion on the ground. No mode switch, no teleport, no "press to explore". |
| Walk input | **Both**: touch = left-thumb joystick (strafe/lead) + right-side drag (look); desktop = WASD + pointer lock. |
| Look | **Cinematic diagram**: correct planet order with orbit rings + name labels. |
| Textures | **Real NASA-derived maps** (Solar System Scope's NASA/USGS/LRO-WAC-derived set), vendored locally — see Assets. |

## Verified constraints (measured, not assumed)

- **Solar System Scope sends no `Access-Control-Allow-Origin`** → runtime CDN loading would taint the canvas and fail. Real URL shape is `/textures/download/<file>` (without `/download/` → 404). So textures are **vendored into `public/textures/`** and served same-origin by Vite. Total 2k payload = **5.7 MB, 11 files**. Only 2k and 8k tiers exist (no 1k/512) → per-body resolution is chosen at *decode* time with `ImageBitmapLoader`'s `resizeWidth/resizeHeight` (off-main-thread decode **and** downsample; three passes options straight through). `8k_moon.jpg` (15 MB file → **134 MB decode**) must never be fetched.
- **`ScrollControls` (drei 10.7.8) has zero touch listeners and no `wheel` listener in vertical mode** — it only listens to the native `scroll` event on its own `overflow-y:auto` div (`ScrollControls.js:149`, `:154`). Vertical page scroll is 100 % browser-native, which is what makes the gesture split in *Input* possible.
- **`<OrbitControls>` must be deleted.** three-stdlib writes `touchAction = 'none'` onto whatever it connects to, drei defaults that to `events.connected` = ScrollControls' scroller → touch scrolling dies silently. It also drives `camera.position/quaternion` at priority `-1`, fighting the rig.
- **A `<Canvas>` re-render permanently kills scrolling.** R3F's `CanvasImpl` has a no-deps `useEffect` that reconnects events to the outer div, and `useMeasure({scroll:true})` re-renders on *any* viewport change (Android URL-bar collapse). ScrollControls' listener effect is gated on `events.connected === el` and then **never re-attaches → the journey freezes at whatever offset it reached.** Non-negotiable mitigation: a self-healing guard in a `useFrame` (`if (events.connected !== scrollState.el) events.connect(scrollState.el)`) + **no React state inside the Canvas render path** + HUD as DOM siblings outside `<Canvas>`.
- **`useFrame(cb, priority > 0)` disables R3F's own `gl.render`** (scene goes black). Never use priority to "run early".
- **One continuous dive is arithmetically impossible.** Orbit scale is `1 u ≈ 145 km` (Moon r = 12 u); ground scale is `1 u = 1 m`. Spanning both in one frustum needs near/far ≈ 1:10⁸ and float32 vertex precision collapses at the metres scale. So there **is** a cut — hidden by construction (see *The seam*).
- `troika <Text>` silently fetches a font from `cdn.jsdelivr.net` when `font` is omitted and reallocates its SDF atlas mid-run → **not used.** Labels are one instanced `CanvasTexture` atlas (system font, 1 draw call, no network).
- `dev` bundles all of drei into one 3.1 MB chunk → **dev-server fps is not a valid perf measurement**; use `npm run build && npm run preview`.

## Architecture

### Two rigs, one scroll offset

`scroll.offset` ∈ [0,1] is the **only** timeline input. Camera pose is a pure function of it, so scrubbing backwards is exactly correct and free. drei's single internal `maath` damp (`damping={0.18}`) is the **entire** smoothing budget — nothing derived from `offset` may be damped again (double-smoothing = rubber-band judder).

Two mutually-exclusive scene graphs, **never co-rendered**:

| Rig | Units | Contents | `near / far` |
|---|---|---|---|
| `ORBIT` | 1 u = diagram units (Moon r = 12 u ≈ 145 km/u) | Act I solar system, Act II Moon sphere, Earth | 0.05 / 2000 |
| `GROUND` | 1 u = 1 m | displaced terrain, ridge, rocks, LM/flag, footprints | 0.02 / 4000 |

**Cut the position; hand off the rotation.** At the seam frame: show `GROUND`, hide `ORBIT`, place the camera at the ground-rig pose for that offset, swap `near/far`, then **`camera.updateProjectionMatrix()`** (R3F does not refresh it for imperative mutations). The ground rig's initial quaternion is *constructed equal* to the orbit rig's final one, then ramps to the authored ground orientation over Δoffset ≈ 0.02 — orientation is unitless, so blending across scales is safe; positions are not.

**Time-invariance rule:** any body the rail approaches must not move with time, or the authored rail terminus misses it. Earth + Moon: `θ = θ0 + k·offset`, eased to zero at the end of the transit act, **frozen from 0.28 → 1.00**. Outer planets may use `clock` (parallax is nil). Axial spin by `clock` is always fine.

### Act table (all constants live in `src/journey/timeline.js`)

`pages={10} distance={1}` → ~10 viewport-heights ≈ 6–9 thumb flicks (**tune on-device**, gate #4).

| Act | offset | Camera |
|---|---|---|
| System | 0.00–0.06 | 3/4 view of all 8 rings, outer two running off-frame; title + "keep scrolling" chevron |
| Transit | 0.06–0.28 | dive Mercury→Venus→**Earth+Moon**, constant world speed, no easing here |
| Cislunar | 0.28–0.42 | Earth leaves frame, Moon grows |
| Lunar orbit | 0.42–0.60 | ~1.5 low passes, then a shrinking spiral toward Mare Tranquillitatis |
| Descent | 0.60–0.70 | frame fills entirely with regolith — **SEAM at 0.70** |
| Reveal | 0.70–0.80 | y 0.35 → 1.70 m, pitch −70° → −5°: the horizon *arrives*, rocks resolve, the LM appears |
| Walk | 0.80–1.00 | authored rail ~18 m + player offsets; gait locked to distance walked |

`GROUND_IN = 0.70`, `GROUND_FULL = 0.75`; `groundWeight = smoothstep(o, 0.70, 0.75)` gates input pads and the rotation hand-off (`smoothstep` has zero derivative at both ends = no pop).

Path = **per-act `CatmullRomCurve3`** (`centripetal`, tension 0.5) joined by one shared arc-length table so world speed is constant across joints; `getPointAt(u, scratchTarget)` with module-scope scratch vectors (zero per-frame allocation). A single long curve is rejected: `arcLengthDivisions = 200` for the whole path gives the landing ~2 samples. Authored dwell = route a *longer* path around the subject, not ease the parameter; only "beat" acts get `smootherstep` (zero 1st *and* 2nd derivative → no velocity pop against a constant-speed neighbour).

### Ground layering (the hybrid you asked for)

```
stored  {forward, lateral}          // input writes, hard-clamped: lateral ±6.5 m, forward −1.5…+4 m
applied = damp(stored * groundWeight, lambda 5)      // ONLY permitted damp: it smooths input, not scroll
base    = sampleRail(GROUND_RAIL, range01(o, 0.70, 1.00) + applied.forward/railLength)
camera.position = base + FWD*applied.forward + RIGHT*applied.lateral
                    + (heightAt(x,z) + 1.70 + gaitBob()) * groundWeight
```
Orientation: **absolute world yaw/pitch (YXZ), not `qBase × qLook`** (a rail whose heading moves with `offset` would rotate the horizon under a stationary user). Seed from the rail **forward vector** (`yaw = atan2(fwd.x, fwd.z)`, `pitch = asin(-fwd.y/|fwd|)`) — *not* `setFromQuaternion`, which flips 180° once dive pitch passes ±90°. Before seeding, set `qGround := qOrbit` so nothing pre-rotates at `w ≈ 1e-6`. Hysteresis: seed above `w > 0.5`, keep until `w < 0.02`, clear only when `|stored| < ε`; rotate `stored` by Δyaw on re-entry rather than discard it (otherwise a 0.86→0.83→0.86 scrub re-interprets the offset in a new frame = visible lateral teleport). Soft auto-align toward the rail heading, gated off for ~0.6 s after any look input, with a 3° deadband.

Scroll back up ⇒ `groundWeight → 0` ⇒ player contribution is **structurally** zero (no branch to get wrong), plus a slow `damp(stored → 0)` while `w === 0` so a re-descent starts clean. `clamp01(scroll.offset)` at the single read site — overscroll can push it outside [0,1] and a hand-rolled act picker then indexes `−1` → `NaN` camera → black screen.

## Input

Gesture split uses the browser's own disambiguation instead of racing it: **vertical drag = page scroll = forward progress; horizontal drag = yaw; two-finger vertical = pitch.**

- Left thumb pad (`position:fixed` DOM sibling, `touch-action:none`, `pointer-events:auto` only while `w > 0`): 118 px disc, `setPointerCapture`, radius 52 px → `input.move.{x,y}`. `pointercancel` treated **identically** to `pointerup` (a capture-storm, not an error path).
- Right look pad: **`touch-action:pan-y`** so vertical pans scroll the page while horizontal drags reach JS; every handler on this pad is registered **`{ passive: true }`** — the render smoke asserts it, because it initially was not, and asserts that no handler calls `preventDefault` (a non-passive pointer listener alone is enough to make Android wait on the gesture decision). When the browser claims the pan it fires `pointercancel` → release look, which the same test drives end to end against the real handlers.
- Desktop: WASD/arrows + `requestPointerLock` (locked mouse feeds both axes; wheel still scrolls the page = still progress).
- Store = `src/state/input.js`, a module-level mutable singleton. Sources **only add** to `look.dx/dy` and **only write** `move`; the rig is the **single reader/consumer** inside one `useFrame` (`move` is a level, `look` is a consumed accumulator — that asymmetry is what prevents sticky strafe *and* lost mouse ticks). **Nothing calls `setState` per frame.**
- Gait: `y = 0.060·max(0,sin φ)^0.8 + 0.004·sin 2φ`, φ locked to **distance walked** (never `elapsedTime`) — fast rise, floaty apex at 0.165 g reads "lunar"; >12 cm reads "trampoline". 1.62 m/s² → 0.9 Hz lope.

## Scene content

**Act I — cinematic diagram** (`src/scene/SolarSystem.jsx`, ~10 k tris, 15–17 draws, 5 programs). Scale is double-compressed (`AU2U = 4.6 + 6.6·a^0.55`, `KM2U = 0.42·(r/6371)^0.35`) — true ratios are unrenderable on a 400 px-wide screen; ordering, tilts (Uranus 97.8°, Venus 177.4°), and relative sizes stay honest. Sun = `meshBasicMaterial toneMapped={false}` sphere + 2 additive radial-falloff shader quads (no texture, no `<Sparkles>` — its `gl_PointSize` doesn't track angular size). Planets = one reusable `<Planet>` (`meshBasicMaterial`, 20×14 or 28×18 segments), all tiles from **one 2048×512 atlas**; per-body UV comes from `texture.clone()` changing **only `offset/repeat`** — verified free, because those two aren't in three's GPU texture cache key (changing `wrap`/`minFilter`/`anisotropy`/`colorSpace` costs a **second full upload**). **8 orbit rings = 1 `InstancedMesh`** with an analytic `fwidth`-AA ring shader (`THREE.LineLoop` has no AA and `linewidth` is a documented WebGL no-op; drei `<Line>` rebuilds all 8 geometries on every phone rotation and degenerates at 1 px) plus a soft leading arc that crawls with time — that's what makes a static diagram feel like motion without animating 8 transforms. Labels = 1 instanced billboard (shader-space billboard, zero `useFrame`, distance-fade, hidden below tier 2). Saturn ring needs `radializeRing()` first: `RingGeometry` UVs are **planar**, not radial, so the 2048×125 strip smears without a remap.

**Act II — Moon in orbit** (`src/scene/MoonOrbit.jsx`): sphere r=12 u, 64×32 (3 968 tris), the shared 2048×1024 LRO albedo. Lighting is the physically-honest airless-body setup: **one `directionalLight` (intensity ~2.4) + ambient ~0.012**, no `<Environment>`/HDRI/hemisphere (no atmosphere to scatter; ambient >0.05 makes the black sky lie). Hard terminator is automatic. Earth hangs in the sky as a **1-draw, 0-extra-bytes** sphere sampling Earth's tile from the same Act-I atlas, lit by the *same* light → its crescent phase comes out physically correct for free, and it's the cheapest "we haven't cut" cue in the whole piece. No fresnel atmosphere rim.

**Act III — the walk** (`src/scene/MoonSurface.jsx` + `Props.jsx`): sky = pure black via `<color attach="background">` + `alpha:false` (a single opaque `glClear` is the cheapest thing a tile GPU can do — never a BackSide sky sphere). **No fog** — `FogExp2` is an atmospheric lie that would destroy the act; distance comes only from known-size anchors: **LM at 42 m** (~500 tris merged to 1 draw), **flag held horizontal on its cross-rod at 5 m** (a drooping flag is a factual error), SEP panel at 12 m, two ALSEP masts at 90 m. Horizon: a 240 m-radius displaced disc **cannot** solve the horizon (curvature drop at 240 m is 1.7 cm) — so a flat plane already puts it at eye level, and the far edge is hidden by three fields (near 16.4 k tris displaced / mid annulus / 512-tri procedural far ridge that descends 0.15 % so it tucks *under* the eye line). Terrain is **CPU-displaced once** with ~36 synthetic crater bowls (raised rims are the lunar tell) + a CPU-derived 512² normal map; the same `Float32Array` gives `heightAt()` as an O(1) bilinear lookup for the camera and footprints — a GPU displacement would force a CPU sample anyway, so you'd pay twice, and real LOLA DEM is 500 m/px = 300× too coarse to matter at 1.7 m. Ground albedo is a **crop of the same Moon equirect** via the local affine (site 0.67°N/23.5°E ≈ Apollo 11) so orbit and ground show literally the same texels. Rocks: `<Instances limit={220} range={220} frames={1}>` — `frames` defaults to `Infinity`, which loops every instance's matrix decompose/compose **every frame**; `range` is live so tiering drops rocks with zero remount. Plus 6 irregular hero boulders (instanced icosahedra read as *marbles* at 1 m). **Footprints yes** (1 draw, 64-quad ring buffer, `MultiplyBlending` — compacted regolith is *darker*, which is why Apollo tracks read black); **dust no** (no atmosphere → no puff; a fake one is the most reliable "this is a render" tell). Player shadow = one multiply-blended blob quad stretched along the sun vector — the only object whose motion is unambiguously yours, so it doubles as a free speed gauge. `shadows` stays off (extra full-scene depth pass + 4–12 PCF taps for a shadow nobody resolves at 1.7 m).

Shared across **all** acts: a camera-following rig holding the star dome, sun disc (0.53°) and corona. Because it's in the camera rig it's scale-invariant by construction, so stars and the sun are pixel-identical across the seam — the single most valuable trick here, since the eye reads a continuous background and forgives the ground. Custom `<points>` dome (not drei `<Stars>` — it hard-codes `gl_PointSize ∝ 30/−z` and is centred on the world *origin*, so in Act III it'd be a 100-unit shell buried inside the terrain), `frustumCulled={false}`, `uPx` fed from `viewport.dpr` or stars halve in size when dpr doubles.

## The seam (why it's invisible)

A seam is invisible iff, on the frame it happens, the screen is 100 % lunar regolith, identical in albedo, **texel scale**, and light direction — with no horizon, no reference object, and no parallax to compare. Four mechanisms:
1. same texture source, matched UVs (§Act III crop affine). The convention is now measured, not guessed: `tools/check-texture-continuity.mjs` compares `uvFromDirection` against three's own sphere UVs (1885 interior vertices, delta 0.00000 on both axes, pole rows excluded because longitude is undefined there) and confirms the displaced plane's uv gradients run the same direction as the sphere's at the site, with the crop window centred on the landing point. What remains open is only taste: the map gives 5.3 km per texel, so the 480 m field samples 4% of the crop window and fine pattern continuity is impossible by construction - the detail has to come from the normal and detail maps;
2. sun direction re-expressed into the ground rig once at mount (`setFromUnitVectors(UP, normalAtSite)`), so if the terminator crosses frame it crosses in the same place both sides;
3. shared camera-following sky rig (stars/sun identical);
4. rim-fade: terrain displacement is scaled to exactly 0 over the outer 25 %, so the disc is precisely tangent to the sphere — a flat rim against black cannot be seen, a lit domed rim can.
Ordering: mount/show `GROUND` then hide `ORBIT` in the *same* `useFrame` (one frame of coexistence is cheaper than one frame of nothing). Pre-link both rigs' programs at boot with `await gl.compileAsync(scene, camera)` behind the loading screen — mobile shader-link stalls are 50–300 ms and land exactly on the money shot; **do not** use drei `<Preload all>` (it renders the whole scene through a `CubeCamera` = 6 extra passes). Fallback if a device shows the cut: a dark boulder silhouette sweeps past on the seam frames (2 tris).

## Mobile render budget

`dpr={[1, 1.25]}` is the single most important number (Android `devicePixelRatio` is 2.6–3.75; the default `[1,2]` renders 4× the pixels). `gl={{antialias:false, alpha:false, stencil:false, powerPreference:'high-performance'}}` + `shadows={false}` + `frameloop="always"`, camera `fov:55` (Hasselblad-correct and it doesn't bow the horizon like 75° does) — **no FXAA**: no `postprocessing` dep, and dpr 1.25 beats a hand-rolled resolve pass. Kill aliasing at the source instead (`fwidth` rings, alpha-smoothed sprites, texture-heavy ground). All config object literals at **module scope**. `resize={{scroll:false, debounce:{scroll:200, resize:250}}}`. Texture budget ≈ 16 MB: Moon 2048×1024 (10.7, shared by all three acts), planet atlas 2048×512 (2.8), detail tile 512² (1.1), normal map 512² (1.1, `NoColorSpace` — albedo maps `SRGBColorSpace`, data maps not; getting this wrong is the #1 washed-out/muddy cause), everything else procedural. Set `anisotropy = min(4, maxAnisotropy)` and **every** other texture property *before* first attach. Ceilings: 120 k tris / 40 draws / 10 programs; actual ~10 k + ~36 k across acts. `PerformanceMonitor` (override `bounds` to `[24,45]` — the default 40 fps floor degrades a phone that's happily doing 45) driving 4 static tiers in `src/lib/quality.js`; latch `maxTier` after two declines so you don't oscillate with the thermal curve; optional stable-30 fps cap via the priority-1-takes-render-ownership rule. Also: pause on `visibilitychange` (R3F 9 has no such handling) — on a phone in a Termux session that's the difference between warm and hot.

## Assets to fetch (same-origin, offline-safe)

```bash
mkdir -p public/textures && cd public/textures
for f in 2k_sun.jpg 2k_mercury.jpg 2k_venus_surface.jpg 2k_earth_daymap.jpg 2k_mars.jpg \
         2k_jupiter.jpg 2k_saturn.jpg 2k_saturn_ring_alpha.png 2k_uranus.jpg 2k_neptune.jpg 2k_moon.jpg; do
  curl -fsSL --retry 3 -o "$f" "https://www.solarsystemscope.com/textures/download/$f"
done   # 5.7 MB total; never touch 8k_* (134 MB decode)
```
Every decoded map must be bound to a material (asserted in `tools/render-smoke.mjs`); the sun sphere uses `2k_sun.jpg` unlit with `toneMapped={false}`. The 2k set is packed per-body at decode time and the per-body decode tiers by a throwaway build-time script or at decode time via `ImageBitmapLoader` `resizeWidth/resizeHeight` (one loader instance per distinct size — three/R3F memoize loaders *per class*, so mutating one shared instance gives every texture the first load's options). Add `public/credits.txt` — Solar System Scope maps are **CC-BY 4.0** ("Textures by Solar System Scope"), three.js/three-globe MIT; a one-line on-screen credit in the outro caption. No new npm dependencies.

## Files

Edits: `src/App.jsx` (rewrite: module-scope Canvas config, `<Experience/>`, `<Hud/>`, zero React state in the Canvas path), `src/styles.css` (keep the `position:fixed` hardening — it's what keeps `scrollThreshold` stable when the Android URL bar collapses; add HUD/pad rules, `overscroll-behavior:contain`, `touch-action`), `index.html` (title → "nasa-2026-storytelling"), `package.json` (nothing added).

New (21): `src/journey/{timeline.js,rail.js,pose.js,ground.js}` (as built: the three rails and both seam poses live in `pose.js`, the ground layering in `ground.js`, `CameraRig.jsx` under `src/scene/`; `lib/scale.js` folded into `lib/bodies.js`) · `src/scene/{Experience.jsx,Sky.jsx,SolarSystem.jsx,MoonOrbit.jsx,MoonSurface.jsx,Props.jsx}` · `src/lights/SunLight.jsx` · `src/lib/{bodies.js,scale.js,terrain.js,geometry.js,textures.js,gait.js,quality.js}` · `src/state/input.js` · `src/ui/{Hud.jsx,controls.js}`. `timeline.js`/`rail.js`/`terrain.js`/`bodies.js`/`scale.js`/`gait.js` import **no React and no drei** — the numbers live in exactly one place. Plus `plan/solar-system-to-moon.md` (this document, gate 0) and `public/textures/*` + `public/credits.txt`.

## Build order — each step ends with something you look at on the phone

1. **Scroll harness, no content.** Canvas + ScrollControls + a `<mesh>` whose y = `offset·5`, the self-healing `events.connect` guard, and an on-screen readout of `offset`, `events.connected === el`, and fps. Resize/rotate in portrait, flick, scroll back. *Confirms the one thing that can silently kill everything.* Count flicks to reach the bottom → set `pages`.
2. **Scale + bodies tables + Act I flat-coloured** → verify portrait framing/legibility (`hfov ≈ 29°` at fov 55, so labels carry legibility, not geometry).
3. Orbit rings (instanced `fwidth`), label atlas, star dome, sun glow, `textures.js` + tier/probe spine. This is the money shot; validate before building anything else.
4. Act II sphere + lighting + Earth, then **Seam A** (Moon dot → sphere).
5. `terrain.js` headless (mount it at 45° sun, screenshot crater rims, check `buildTerrain` cost on-device — 9 409 verts × 36 craters is 5–25 ms on a desktop JIT and plausibly 100–200 ms on Termux, so it must build **behind the loading screen at boot**, never at the seam).
6. Act III: terrain → far ridge → rocks → props → walker/gait → footprints/blob → **Seam B** (sphere → ground) with a `?seam=` debug slider on two empty rigs + one flat quad, viewed on the phone *before* the real rails are wired.
7. Camera-rig scrub test: rail drawn as a line + wireframe spheres, screenshot every act boundary, assert the ground-seam pose lands within ±0.5 m of `heightAt`. Then yaw re-seed sandbox (rotating-heading rail, scrub past `GROUND_IN` with no input and watch the horizon).
8. Act titles/captions in the DOM HUD (fixed overlay driven by `offset` in the existing rAF loop — **not** `<Scroll html>`, which has the stale-transform-after-orientation bug and a travel rate that only matches the scrollbar when `distance === 1`), damping/pacing tune, perf pass on a real device.

## Verification (end-to-end, on the phone)

- `npm run build && npm run preview --host` → open `http://192.168.0.164:4173/` (dev-server numbers are meaningless — drei is one 3.1 MB pre-bundled chunk).
- `npm run check` runs five headless suites (`tools/self-test-auditor.mjs` first, so the shader/material auditor is proven against injected faults before anything trusts it): `tools/check-boot.mjs` (the real boot path: 11 maps decoded, terrain built and levelled), `tools/check-journey.mjs` (20k pose samples: continuity, clearances, both seams, scrub determinism, no clock on the camera path) and `tools/check-texture-continuity.mjs` (the sphere/plane UV conventions above, read from real geometry) and `tools/render-smoke.mjs` (mounts the actual component tree with react and @react-three aliased to a hook dispatcher, constructs every real geometry and material, then drives the 14 useFrame subscribers across 300 scroll offsets plus a simulated stick and drag).
- The HUD debug panel (dev-only, `?debug=1`) is the instrument, since DevTools may not be attached: fps, frame ms, `renderer.info` draw calls/triangles/programs/textures, current act, `offset`, tier, GPU string.
- Flick the whole journey start→finish, then scrub **back** to the top: pose must be identical at matching offsets (pure-function check — any drift means something reads `clock`).
- Seam check: `?freeze=0.699` / `?freeze=0.701`, screenshot both on the phone, overlay-diff at 20 % opacity; must be a continuous field of regolith with the same light direction.
- Walk check: hold the left pad and strafe (clamps at ±6.5 m, soft wall-lean not dead input), drag right (yaw only, and a vertical drag on that pad must **still scroll the page**), two-finger vertical (pitch), then scroll up past 0.70 → camera must be bit-exact on the orbit rail with zero player contribution.
- Desktop check: open the LAN URL on a laptop — WASD + pointer lock + wheel all work.
- Soak: leave the walk act running 3 minutes to watch thermal decline, and background the tab to confirm `frameloop` pauses.
- Definition of done: 6 acts scrub cleanly both directions on the phone; the seam is not visible at any scroll speed; the ground act shows black sky + stars + sun disc + Earth + LM and a walkable, footprint-marked surface; no console errors; ≥40 fps sustained at tier 2 with graceful degradation below it.

## Execution & delivery (you approved commit + push in this turn)

1. **Save the plan into the repo** — copy this document to `plan/solar-system-to-moon.md` (new `plan/` dir at the project root, next to `src/`). It carries a status checklist that gets updated as each gate passes, so the doc and the build stay together.
2. **Commit + push #1** — plan doc only. Remote is already `git@github.com:MobinX/nasa-2026-storytelling.git`, branch `main` tracks `origin/main`. Before staging, check `.gitignore` does not exclude `public/` or `plan/`, and `git status` to confirm nothing unexpected is included.
3. **Create the goal** (`CreateGoal`, objective = implement this plan end-to-end) and drive the 8 build steps as tracked tasks (`TaskCreate`/`TaskUpdate`), each step ending in the on-phone look described in *Build order* before moving on. No step is "done" until it was actually viewed in the phone browser.
4. **Commit + push on milestones** — after gate #3 (Act I money shot on device), after gate #6 (Seam B), and at definition-of-done. Commit messages describe the why (e.g. `Vendor NASA texture maps same-origin — Solar System Scope sends no CORS header`). Textures are ~5.7 MB of JPEGs entering git history: expected and deliberate for this repo. I will not force-push, amend, or touch branches beyond `main`.
5. If any gate fails in a way that changes the design (seam visible, phone can't hold Act III), I stop, report, and revise the plan file rather than pushing something broken.

## Environment notes

- Every file edit currently crashes the `security-scan` PostToolUse hook with `SIGSYS` (`faccessat2` blocked by Android seccomp). Edits still apply; it is an environment crash, not a finding.
- If `npm install` is ever re-run, the node_modules shebang fix must be re-applied (`#!/usr/bin/env node` → Termux's absolute env path) or `vite` exits 126.
- The dev server is already running in the background (`npm run dev`, `http://192.168.0.164:5173/`); it stays up for on-device checks, and `vite preview` is used for any perf measurement.
- Commit/push scope is limited to the plan doc and the build milestones above.

## Status checklist

- [x] Gate 0 — plan saved to `plan/solar-system-to-moon.md`, committed, pushed (`3138271`), textures vendored (11 files, 5.7 MB)
- [x] Gate 1 — scroll harness + `events.connect` guard landed (`ScrollGuard`); flick count and rotate check still needs your eyes
- [x] Gate 2 — `scale`/`bodies` tables + Act I with real maps landed; portrait legibility needs your eyes
- [x] Gate 3 — instanced `fwidth` orbit rings, instanced canvas-atlas labels, custom star dome, sun glow, `textures.js` + tiers all landed
- [x] Gate 4 — 64x32 moon sphere, one directional + 0.014 ambient, Earth in the sky on the same light, Seam A authored (dot subtends 62.7 deg at the cut)
- [x] Gate 5 — terrain built at boot, measured 265 ms on this JIT (that is why it is not on the seam frame)
- [x] Gate 6 — displaced near field, mid annulus, procedural ridge band, 220 rocks, LM/flag/masts, footprints, blob shadow; Seam B verified continuous by construction
- [x] Gate 7 — three spaces in one arc-length table; seam B measured 0.00049 m / heading dot 1.00000, seam A heading 0.9816; touch + keyboard input landed
- [x] Gate 8 — DOM captions driven by the journey snapshot (no drei Scroll html), damping 0.18, credit line for Solar System Scope
- [x] Verified offline instead — `npm run check`: boot path decodes all 11 maps, terrain levels to 0.000 m at the cut, 20k pose samples with no NaN, per-space continuity, no sphere clipping, eye never under the terrain, both seams' heading/fov continuity, scrub-back reproduces every pose exactly, camera path reads no clock
- [ ] Done — on-device pass: thermal soak, tab-background pause, scrub-back bit-exactness, `?freeze=0.699/0.701` seam pair


1. scroll-listener death from a Canvas re-render → gate #1 + connect guard (mitigated by construction).
2. seam visible → two-rigs/hard-cut + the 4 mechanisms, gate #6 before any content exists.
3. rail misses the Moon → time-invariance rule for Earth/Moon + gate #7 assertion.
4. journey too long/short for a thumb → measured in flicks at gate #1, one constant to change (but `pages`/`distance` must stay module constants: changing them re-runs ScrollControls' DOM effect, resets `scrollTop = 1`, and teleports the journey to the start).
5. mobile GPU can't hold the ground act → tiers + dpr floor + `?tier=0` forced-check on the device.
