# Solar System → Moon → Mars → Deep Space

A single scroll-driven React Three Fiber scene. It opens on a readable diagram of the solar system, and
scrolling flies the camera through the inner planets, into the Moon, and straight down onto the surface at
0.67°N 23.5°E — Mare Tranquillitatis. The lunar act is one pass down onto the landing site, never a lap of
the Moon, and the last eight metres of it happen in the surface graph, where the ground has relief and a
horizon: contact throws the view into a rumble, the camera stands up, and only then does the scroll start
carrying you forward. On the ground it keeps driving the same way along a route of four instruments, and at
each one the scroll stops working: a crew member is standing there, and he talks until you have asked him
your four questions. Then the ascent, a trans-Mars coast, the same landing played again at Jezero West
against a butterscotch sky and a different gait, four more machines, and finally the two that nobody stands
next to — an orbiter that mapped the planet, and a probe with a message bolted to its dish, met on a tether in the dark. The whole journey is 46 screens of
scroll, which is long on purpose — at 10 a single flick swept a tenth of the story and blew past the landing.

Built to run in a phone browser (it is developed on a Termux/Android box and viewed over the LAN), so the
render budget, gesture handling and texture memory are all sized for that, not for a desktop GPU.

## Run

```
npm install
npm run dev --host        # http://<box-ip>:5173/
npm run build && npm run preview --host   # :4173 — measure performance here, not in dev
npm run check             # eight headless suites: auditor self-test, content, models, dialogue, boot, journey, UVs, frame
node tools/build-surveyor.mjs   # regenerates the one model NASA does not publish (Surveyor 3)
node tools/prepare-models.mjs .dl-scratch public/models   # re-reduces the NASA downloads; see the file header
```

Add `?debug`-style params: `?plain` hides the diagnostics readout, `?tier=0..3` forces a quality tier (the budget is pinned to the top tier at boot and nothing degrades it live),
`?freeze=0.699` parks the camera on a seam frame so either side of a cut can be screenshotted, `?seam` adds a
scrub thumb for finding a stop on a phone.

There are no controls. Scroll is the only input: it drives the rail forward, and the head turn along the
way is authored rather than aimed. The gait bob is driven by scroll velocity, so a fast flick reads as a
glide and a deliberate one as a lope, and stopping stops the walking.

Ten objects the visitor walks up to are content, not code: `src/data/objects.json` names each one, names the
glTF that draws it, and gives the crew member beside it an opening line and four rounds of four questions
with an answer for every option. It is bundled at build and validated before the first frame renders,
because the rail is authored and the copy is not and they have to agree about the id list. The conversation
asks one question per round — the other three options are questions you did not ask — so a stop is four
answers, not sixteen, and reads in under a minute. Finishing it is the only way past it.

## How it is put together

`scroll.offset` in [0,1] is the only timeline input and camera pose is a pure function of it, so scrubbing
backwards is exact. drei's internal scroll damping is the entire smoothing budget — nothing derived from
the offset is damped again. The touchdown rumble is a function of the offset, not of the clock, so contact
can be re-lived by scrolling back up. The gait amplitude is the one thing derived from scroll velocity, and
it is a shaping curve, not a filter; it reads the rail's real metres-per-second, so the parked contact leg
that the rumble runs on gets no bob at all.

Seven camera spaces over six scene graphs, never co-rendered, because one continuous zoom is arithmetically
impossible: a unit goes from ~145 km (the Moon sphere, r = 12) to 1 m (a walking field), which needs a
near/far ratio of ~10⁸ and destroys float32 vertex precision. So position is **cut** at five of the six
boundaries and only orientation — which is unitless — is handed off. Every cut lands on a frame that is
100 % regolith: on the sphere side that means aiming down and staying inside the limb even at the portrait
corners, which is also why no sphere act can show a horizon. The corollary is what sets the surface hand-offs
apart from the dot/sphere swap: from 0.42u a frame that is only ground is an aim 35° off the vertical, and
inheriting that as an eye height of 0.42 metres means staring at 40 cm of albedo the map crop cannot resolve
at any scale — dark, featureless, and nothing for an impact to visibly shake. So the last eight metres of each
landing are flown in the surface graph, where the terrain has relief, rocks and a horizon, and the cut jumps
position by seven metres to make that possible. `tools/check-journey.mjs` holds every boundary to heading, fov
and roll rather than to position, measures the limb margin at the tightest frame of both descents (2.5° and
2.5°), and fails if either descent reverses its travel — which is the assertion that keeps a lap of the planet
from creeping back in.

A surface act is one leg of rail per screen of scroll: four to get down and stand up, then a walking leg and a
hold leg for every object, then the ascent. The hold leg is six centimetres against a whole screen, which is
the mechanism the whole walk runs on — the picture stops, so a man can talk to you about the thing in front of
you. `CameraRig` clamps the offset to that leg's start while the conversation is unfinished and pins the
scroller to the same number, so a flick cannot run ahead of the hold and the release cannot jump; the frame
after `journey.done[id]` the offset is the visitor's again. It is the rig's one deviation from being a pure
function of the offset, and it stays out of the pose maths because it only clamps the input — scrub-back
purity is asserted for every offset that is not currently being argued about, and `tools/render-smoke.mjs`
flicks past an unanswered crew member to prove both halves of the trap.

Where a stop's geometry lives is not arbitrary: `src/journey/stops.js` owns the route (where the camera
parks, where the thing stands, where its crew member stands) and derives the two offsets from an *angle*
rather than a number of metres, because the portrait frame is only ~15° wide on a phone. The checker measures
all ten stops for object and crew inside the frame, unobstructed by the ground, far enough apart that neither
hides the other and near enough that the conversation is not a shout across a field.

Everything after the first landing is the same machinery pointed at a second descriptor. `src/journey/worlds.js`
owns the pair: sphere radius, site frame, relief preset, gait profile, ground colours and the offset of each
milestone. The Martian descent rail is the lunar one multiplied by the radius ratio, which is why its
limb coverage is not re-derived but inherited — the ratios are identical by construction. Jezero is placed by
solving for the longitude that puts the single shared sun 22° above its western rim (the latitude is fixed and
real; the longitude is the hour of arrival), and the globe's spin is the quaternion that makes the crop the
ground samples and the sphere the camera flew into agree about which patch of Mars that is — asserted in
`tools/check-texture-continuity.mjs`, which now runs per world.

Lighting is the one place the two worlds must disagree, and they do it honestly. The Moon keeps the airless
setup: a hard directional and effectively no fill. Mars has a thin CO2 atmosphere with suspended dust, so the
directional drops, the ambient climbs, the sky dome goes butterscotch with a blue-white halo around the sun,
the ridge band becomes hills dissolving into haze, and the footprint decals turn light instead of dark because
on Mars a fresh track is bright dust, not compacted shadow. There is one sun: `SunLight` changes its strength
and colour per world, never its direction.

Both fields are also flattened along the walked corridor before they are levelled at the hand-off point,
because a landing site is chosen for being flat. Levelling a single point fixes the eye height at the cut but
leaves the regional swell tilting the field under the walk, and that tilt was what hid hardware behind a rise the mission would never have parked on.

The lunar surface act renders brighter than the sphere act, and not by the same light: the sun is 20° up, so a
horizontal field only catches a third of it and a frame that is all ground and no sky read as under-exposed
on the phone. The surface act lifts the directional for that reason, and `GroundWorld` carries one more
directional light pointed upward from below the site — regolith bounce, the only fill an airless body has,
which raises the shadow sides of the hardware without moving the terminator.

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
`public/preview.gif` is left over from the starter this repo began as, and `.dl-scratch/` holds the
unreduced NASA downloads that `tools/prepare-models.mjs` reads - inputs, not assets, and not committed.

`public/models/*` are the real vehicles, from [NASA's 3D Resources](https://science.nasa.gov/3d-resources/) -
the Apollo Lunar Module, the Mars Exploration Rover, InSight, a Viking lander, Mars Global Surveyor and
Pioneer 10 - reduced by `tools/prepare-models.mjs`, because as published none of them is usable here: every
NASA file is Draco-compressed (three would need a wasm decoder before the first frame), the LM arrives as
134 nodes and 157 primitives, InSight as 143, and both carry 1024² maps. The tool decodes the Draco, bakes
the scene graph into one mesh, buckets materials by colour so the primitives join, simplifies with
meshoptimizer, applies each file's authored unit scale, drops the result onto `y=0`, and re-encodes the
maps to 512² WebP. Six vehicles ship at 2-6k triangles and 3-10 draw calls apiece, which puts the lunar
act at 52 of the 60 draws it is allowed and the Martian act at 49. One exception is on the record: **NASA
publishes no model of a Surveyor** - the whole 1,583-entry catalog was enumerated - so
`tools/build-surveyor.mjs` builds Surveyor 3 from its published dimensions instead, in the same flat
material language.

`tools/check-models.mjs` validates the containers (self-contained, 4-aligned, `min`/`max` present, every
mesh reachable from a node), refuses any file needing an extension three cannot decode without a loader,
and totals the per-act draw and triangle budgets from the shipped files; `tools/check-boot.mjs` parses each
one through the same `GLTFLoader` the browser uses; and `src/lib/models.js` falls back to a proxy box the
size of the authored object if a file ever fails to arrive, so a missing model cannot make an object
invisible.

## Notes

The plan and gate checklist this was built from is in `plan/solar-system-to-moon.md`. On this device,
after `npm install`, CLI shebangs need `#!/usr/bin/env node` rewritten to Termux's absolute env path or
`vite` exits 126.

Still open: on-device frame-rate and thermal soak — nothing degrades the picture automatically any more, so a hot device has no fallback short of `?tier=` — and a look at the two cuts at real scroll speeds. There is no browser on this box, so the walk has been measured and never *seen*: every number in the checkers is real, and none of them is a screenshot.

