// NASA publishes a Lunar Module, a Viking, an InSight, a Mars Global Surveyor and a Pioneer. It does not
// publish a Surveyor: the whole 3D Resources catalog was enumerated and there is no lander model in any
// format, so Surveyor 3 - the probe Apollo 12 astronauts visited, the only spacecraft on another world that
// humans have taken parts off - is built here instead, from the published dimensions:
//
//   3.4 m overall, 4.32 m across the three footpads, spherical pads 0.3 m in diameter, legs of hollow
//   fibreglass struts with a steel shoe; a 1.22 m square equipment box 0.76 m deep carrying 27 kg of
//   electronics; a 14 x 14 x 48 cm TV camera under the box looking out; a 1.08 m parabolic high-gain
//   antenna black-baffled inside on its mast; a surface sampler with a 7.6 cm scoop on three axes.
//
// Same three-material primitive soup and the same glTF 2.0 writer as the rover, the ALSEP and Sojourner, so
// all four go through the same loader as the real NASA files. Run: node tools/build-surveyor.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prim, box, drum, strut, gltf, report } from "./gltfkit.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "models", "surveyor-3.gltf");

// ---- Surveyor 3 ------------------------------------------------------------
// silver is the structure and the electronics box, gold the Kapton on the legs, dark the dish interior,
// the TV camera's light baffle and the sampler's shadowed joints.
const SURVEYOR = () => {
  const silver = prim(), gold = prim(), dark = prim();
  const LEG_TIP = 2.16; //  4.32 m footpad to footpad
  const DECK_Y = 1.55;

  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const fx = Math.cos(a) * LEG_TIP, fz = Math.sin(a) * LEG_TIP;
    strut(gold, [Math.cos(a) * 0.45, DECK_Y + 0.25, Math.sin(a) * 0.45], [fx, 0.16, fz], 0.045);
    strut(silver, [Math.cos(a) * 0.62, DECK_Y - 0.35, Math.sin(a) * 0.62], [fx, 0.16, fz], 0.03);
    drum(silver, 12, 0.15, 0.15, 0.09, [fx, 0.09, fz]); //  the 0.3 m spherical footpad, flattened by its own landing
    // The three vernier thruster nozzles on the box's corners, canted outward the way they were.
    drum(dark, 8, 0.055, 0.085, 0.14, [Math.cos(a) * 0.68, DECK_Y + 0.62, Math.sin(a) * 0.68]);
  }

  box(gold, [1.22, 0.76, 1.22], [0, DECK_Y, 0]); //  the equipment box, 27 kg of electronics inside
  box(silver, [1.22, 0.1, 1.22], [0, DECK_Y + 0.44, 0]); //  the top deck the HGA and batteries sat on
  box(dark, [0.48, 0.14, 0.14], [0.2, DECK_Y - 0.5, 0]); //  the television camera, under the box, looking out
  drum(dark, 10, 0.07, 0.05, 0.1, [0.46, DECK_Y - 0.5, 0], 0);

  strut(silver, [0, DECK_Y + 0.5, 0], [0, 2.9, 0], 0.03); //  the antenna mast
  drum(dark, 16, 0.54, 0.06, 0.2, [0, 3.05, 0]); //  the 1.08 m parabolic high-gain antenna, black-baffled
  drum(silver, 16, 0.56, 0.56, 0.02, [0, 2.95, 0]);

  // The surface sampler: three axes and a 7.6 cm scoop, parked at full extension toward the 14 degree slope
  // it stopped digging on, 105 seconds before the engines were cut from Earth.
  const sx = Math.cos(Math.PI / 2 + 2.09), sz = Math.sin(Math.PI / 2 + 2.09);
  strut(silver, [sx * 0.6, DECK_Y - 0.2, sz * 0.6], [sx * 1.15, 0.85, sz * 1.15], 0.035);
  strut(silver, [sx * 1.15, 0.85, sz * 1.15], [sx * 1.5, 0.34, sz * 1.5], 0.03);
  box(dark, [0.16, 0.05, 0.13], [sx * 1.55, 0.3, sz * 1.55]);
  return { silver, gold, dark };
};

const MATERIALS = {
  silver: { baseColorFactor: [0.72, 0.72, 0.75, 1], metallicFactor: 0.2, roughnessFactor: 0.7 },
  gold: { baseColorFactor: [0.73, 0.53, 0.19, 1], metallicFactor: 0.7, roughnessFactor: 0.45 },
  dark: { baseColorFactor: [0.06, 0.06, 0.07, 1], metallicFactor: 0.1, roughnessFactor: 0.9 },
};

const doc = gltf(SURVEYOR(), "surveyor-3", MATERIALS, "tools/build-surveyor.mjs");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(doc));
report(doc, "surveyor-3.gltf");
