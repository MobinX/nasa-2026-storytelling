# Solar System → Moon → Lunar Walk

A single scroll-driven React Three Fiber scene. It opens on a readable diagram of the solar system, and
scrolling flies the camera through the inner planets, into the Moon, out to low lunar orbit, down through
the terminator and onto the surface at 0.67°N 23.5°E — Mare Tranquillitatis. Scrolling keeps driving
forward motion on the ground all the way to the lunar module: the astronaut auto-walks the authored route,
closing from 60 m to 15 m on the LM and ending with the flag in the foreground. There is nothing to
steer with.

Built to run in a phone browser (it is developed on a Termux/Android box and viewed over the LAN), so the
render budget, gesture handling and texture memory are all sized for that, not for a desktop GPU.

## Run

```
npm install
npm run dev --host        # http://<box-ip>:5173/
npm run build && npm run preview --host   # :4173 — measure performance here, not in dev
npm run check             # six headless suites: auditor self-test, dialogue, boot, journey, UVs, frame
```

Add `?debug`-style params: `?plain` hides the diagnostics readout, `?tier=0..3` forces a quality tier (the budget is pinned to the top tier at boot and nothing degrades it live),
`?freeze=0.699` parks the camera on a seam frame so either side of a cut can be screenshotted.

There are no controls. Scroll is the only input: it drives the rail forward, and the head turn along the
way is authored rather than aimed. The gait bob is driven by scroll velocity, so a fast flick reads as a
glide and a deliberate one as a lope, and stopping stops the walking.

When the walk finishes, a second astronaut waiting by the LM starts talking — a floating caption above
his head, hands moving with the sentence, then four questions to choose from. Four rounds of that, then
an end card and the scroll is yours again. Tapping a question interrupts whatever he is mid-way through
saying, and every surface in that panel is `touch-action: pan-y` so a drag starting on it still scrolls
the journey.

## How it is put together

`scroll.offset` in [0,1] is the only timeline input and camera pose is a pure function of it, so scrubbing
backwards is exact. drei's internal scroll damping is the entire smoothing budget — nothing derived from
the offset is damped again. The gait amplitude is the one thing derived from scroll velocity, and it is a shaping curve, not a filter.

Three scene graphs, never co-rendered, because one continuous zoom is arithmetically impossible: a unit
goes from ~145 km (Moon sphere, r = 12) to 1 m (the walking field), which needs a near/far ratio of ~10⁸
and destroys float32 vertex precision. So position is **cut** at two boundaries and only orientation —
which is unitless — is handed off. Both cuts land on frames that are 100 % regolith, the star field and
sun disc live in a camera-following rig that is identical either side, and the sun direction is re-expressed
into the landing-site frame so the terminator matches. `tools/check-journey.mjs` asserts the orbit→ground
cut is 0.0000 m apart with a heading error under 1e-5 rad and no roll at all, and that the terrain is
levelled so the hand-off eye height lands exactly where the descent authored it.

Other choices worth knowing: orbit rings are one instanced draw with an analytic `fwidth` antialiased ring
shader (`THREE.LineLoop` is 1 px and hard-aliased; drei `<Line>` rebuilds its geometry on every phone
rotation); labels are one instanced canvas atlas, because troika `<Text>` fetches a font from a CDN and
reallocates its SDF atlas mid-scroll; the star dome is custom because drei `<Stars>` ties point size to
world distance and centres on the origin, which would be inside the terrain in Act III; `shadows` are off in
favour of a multiply-blended blob, while `antialias` is on and the render sits at dpr 2.0; the terrain is displaced once on the
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

Still open: on-device frame-rate and thermal soak — nothing degrades the picture automatically any more, so a hot device has no fallback short of `?tier=` — and a look at the two cuts at real scroll speeds.
