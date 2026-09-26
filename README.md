# Solar System → Moon → Lunar Walk

A single scroll-driven React Three Fiber scene. It opens on a readable diagram of the solar system, and
scrolling flies the camera through the inner planets, into the Moon, out to low lunar orbit, down through
the terminator and onto the surface at 0.67°N 23.5°E — Mare Tranquillitatis. Scrolling keeps driving
forward motion on the ground; a thumb stick and drag look steer.

Built to run in a phone browser (it is developed on a Termux/Android box and viewed over the LAN), so the
render budget, gesture handling and texture memory are all sized for that, not for a desktop GPU.

## Run

```
npm install
npm run dev --host        # http://<box-ip>:5173/
npm run build && npm run preview --host   # :4173 — measure performance here, not in dev
npm run check             # headless boot path + 20k-sample journey verifier
```

Add `?debug`-style params: `?plain` hides the diagnostics readout, `?tier=0..3` forces a quality tier,
`?freeze=0.699` parks the camera on a seam frame so either side of a cut can be screenshotted.

Controls: scroll or flick always advances the journey. On the ground: left thumb stick to strafe and lead,
drag the right half to look, two fingers for pitch; on a desktop, WASD/arrows plus click for pointer lock.

## How it is put together

`scroll.offset` in [0,1] is the only timeline input and camera pose is a pure function of it, so scrubbing
backwards is exact. drei's internal scroll damping is the entire smoothing budget — nothing derived from
the offset is damped again, except the player's own stick/WASD offsets.

Three scene graphs, never co-rendered, because one continuous zoom is arithmetically impossible: a unit
goes from ~145 km (Moon sphere, r = 12) to 1 m (the walking field), which needs a near/far ratio of ~10⁸
and destroys float32 vertex precision. So position is **cut** at two boundaries and only orientation —
which is unitless — is handed off. Both cuts land on frames that are 100 % regolith, the star field and
sun disc live in a camera-following rig that is identical either side, and the sun direction is re-expressed
into the landing-site frame so the terminator matches. `tools/check-journey.mjs` asserts the orbit→ground
cut is 0.0000 m apart with a heading error under 1e-5 rad, and that the terrain is levelled so the
hand-off eye height lands exactly where the descent authored it.

Other choices worth knowing: orbit rings are one instanced draw with an analytic `fwidth` antialiased ring
shader (`THREE.LineLoop` is 1 px and hard-aliased; drei `<Line>` rebuilds its geometry on every phone
rotation); labels are one instanced canvas atlas, because troika `<Text>` fetches a font from a CDN and
reallocates its SDF atlas mid-scroll; the star dome is custom because drei `<Stars>` ties point size to
world distance and centres on the origin, which would be inside the terrain in Act III; `antialias` and
`shadows` are off in favour of dpr 1.25 and a multiply-blended blob; the terrain is displaced once on the
CPU because the height field is also needed for foot placement.

There is deliberately no `OrbitControls` (it writes `touch-action: none` onto the scroller and kills phone
scrolling) and no drei `<Scroll html>` (its captions keep a stale transform after an orientation change).
The HUD is plain DOM outside `<Canvas>`, driven by a mutable snapshot, because a `<Canvas>` re-render
unhooks `ScrollControls`' scroll listener and permanently freezes the journey — hence the self-healing
`events.connect` guard in `Experience.jsx`.

## Assets

`public/textures/` are NASA-derived (LRO WAC, MESSENGER, Galileo, Cassini, Voyager) maps downloaded from
[Solar System Scope](https://www.solarsystemscope.com/textures/), licensed CC BY 4.0 — see
`public/credits.txt`. They are vendored rather than loaded from a CDN because that host sends no CORS
header, and the per-body resolutions are chosen at decode time because only 2k and 8k tiers exist.
`public/preview.gif` is left over from the starter this repo began as.

## Notes

The plan and gate checklist this was built from is in `plan/solar-system-to-moon.md`. On this device,
after `npm install`, CLI shebangs need `#!/usr/bin/env node` rewritten to Termux's absolute env path or
`vite` exits 126.

Still open: on-device frame-rate and thermal soak, and a look at the two cuts at real scroll speeds.
