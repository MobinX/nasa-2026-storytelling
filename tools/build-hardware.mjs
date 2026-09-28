// The three machines NASA never modelled, built from the dimensions NASA did publish.
//
// Every number commented here is a published one, so that a silhouette can be argued with:
//
//   LUNAR ROVER 1 - frame 3.1 m long, wheelbase 2.3 m, max height 1.14 m, 1.8 m wide, 210 kg with 490 kg of
//     designed payload and 36 cm of ground clearance loaded; tyres 81.8 cm across and 23 cm wide, woven from
//     0.83 mm zinc-coated steel cable with formed-aluminium discs and titanium chevrons over half the contact
//     patch, inside a 64.8 cm bump-stop frame, on spun-aluminium hubs. (NSSDC, "The Apollo Lunar Roving
//     Vehicle", nssdc.gsfc.nasa.gov/planetary/lunar/apollo_lrv.html; width from LROC's 6 ft.)
//   ALSEP (Apollo 16, Descartes Highlands) - a 25 kg Central Station box on a leg frame, its carrybar left
//     standing as the antenna mast carrying a 58 x 3.8 cm modified axial-helical antenna Earth-pointed by the
//     crew; a SNAP-27 RTG beside it, finned and dark-grey, ~70 W at 16 V; the Passive Seismic Experiment, the
//     Lunar Surface Magnetometer with its distinctive gold arms, the Solar Wind Composition collector on a
//     pole, the Heat Flow canister, four Active Seismic geophones in a line with the mortar that threw the
//     first three of four charges, and the flat network cable laid between all of it. Box dimensions for the
//     individual experiments are not published; they are built here at the size the Apollo 16 Preliminary
//     Science Report drawings imply, and the station is drawn clustered rather than at the 15-100 m spacing
//     the crew really used, because a walk has to see the whole instrument package in one portrait frame.
//   PATHFINDER + SOJOURNER (Ares Vallis) - the lander is a tetrahedral core about 1.5 m across whose three
//     triangular solar-array petals folded down as ramps, with a 0.8 m pop-up mast camera and the
//     atmospheric boom and its three windsocks above the deck; the spacecraft went to Mars at 463 kg.
//     Sojourner is 11.5 kg, "the size of a milk crate", about 30 cm tall, on six 13 cm aluminium wheels
//     through a rocker-bogie with no axles or springs, front and rear wheels steered so it could turn in
//     place, a flip-up stereo camera head at each end, the Alpha-Proton X-Ray Spectrometer under the nose,
//     the Gamma-Ray Spectrometer behind, and one flat array of thirteen strings of eighteen gallium-
//     arsenide cells on its back over the gold electronics box the batteries lived in. It ran 0.4 m/min,
//     rolled down a 20 degree ramp on sol 2, made 550 images and fifteen-odd APXS analyses, and outlived a
//     seven-sol plan by eighty-three sols. (JPL roverpwr/rover descrip pages via the 1998 archive; NSSDC
//     1996-068A. NASA publishes no body length or width for it, and no odometer total.)
//
// Run: node tools/build-hardware.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prim, box, drum, strut, part, carry, gltf, report } from "./gltfkit.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "public", "models");
const DEG = Math.PI / 180;

// Three buckets per machine: bare metal, Kapton and painted white read as silver; anything wrapped in
// gold-coloured thermal blanket read as gold; solar cells, mesh dishes, tyres, cables and instrument faces
// read as dark. That is the same palette the Surveyor uses, so all four hand-built vehicles light alike.
const SILVER = { baseColorFactor: [0.72, 0.72, 0.75, 1], metallicFactor: 0.2, roughnessFactor: 0.7 };
const GOLD = { baseColorFactor: [0.73, 0.53, 0.19, 1], metallicFactor: 0.7, roughnessFactor: 0.45 };
const DARK = { baseColorFactor: [0.06, 0.06, 0.07, 1], metallicFactor: 0.1, roughnessFactor: 0.9 };
const MATERIALS = { silver: SILVER, gold: GOLD, dark: DARK };

// ---- Apollo 15 Lunar Roving Vehicle ---------------------------------------
// Built facing +z. The silhouette that makes it read as a rover and not a box is the four wire mesh wheels,
// the two open seats side by side, and the mesh dish on its mast at the front centre.
const ROVER = () => {
  const silver = prim(), gold = prim(), dark = prim();
  const R = 0.409, TW = 0.23, ZX = 0.78, ZF = 1.15; // 81.8 cm tyres, 1.56 m track, 2.3 m wheelbase

  const tyre = part((P) => drum(P, 16, R, R, TW)); //  the woven steel-cable tyre, 81.8 cm by 23 cm
  const hub = part((P) => drum(P, 12, R - 0.13, R - 0.13, TW + 0.012)); //  the spun-aluminium disc the
  const guard = part((P) => { box(P, [0.34, 0.02, 0.78]); }); //  titanium chevrons rode on. Apollo 15 ran
  for (const [x, z] of [[-ZX, ZF], [ZX, ZF], [-ZX, -ZF], [ZX, -ZF]]) { //  without fender extensions
    carry(dark, tyre, { at: [x, R, z], roll: 90 * DEG });
    carry(silver, hub, { at: [x, R, z], roll: 90 * DEG });
    carry(silver, guard, { at: [x, 0.87, z], roll: (x > 0 ? -4 : 4) * DEG });
  }

  //  Three articulating sections on a tubular spaceframe: instrument bay, seats, cargo bed.
  for (const z of [1.05, 0, -1.05]) {
    for (const x of [-0.44, 0.44]) box(silver, [0.05, 0.07, 1.0], [x, 0.5, z]); //  the side rails
    box(silver, [0.94, 0.03, 0.96], [0, 0.54, z]); //  the aluminium floor panels
    box(silver, [0.9, 0.05, 0.05], [0, 0.47, z + 0.45]); //  cross members
    box(silver, [0.9, 0.05, 0.05], [0, 0.47, z - 0.45]);
  }

  //  Two seats side by side: tube frames with nylon webbing, an armrest between them, hook-and-loop belts.
  const pan = part((P) => box(P, [0.42, 0.045, 0.44]));
  const back = part((P) => box(P, [0.42, 0.46, 0.045]));
  for (const x of [-0.24, 0.24]) {
    carry(dark, pan, { at: [x, 0.7, -0.02], pitch: -6 * DEG });
    carry(dark, back, { at: [x, 0.94, -0.3], pitch: -14 * DEG });
  }
  box(silver, [0.08, 0.07, 0.52], [0, 0.79, -0.02]); //  the armrest, and the hand controller on it

  //  Front: the instrument compartment with its control and display module, the Sun-shadow device, and a
  //  36 V outlet the television camera plugged into.
  box(gold, [0.64, 0.32, 0.36], [0, 0.72, 1.3]);
  box(dark, [0.5, 0.18, 0.03], [0, 0.79, 1.49]);
  const sunsh = part((P) => drum(P, 12, 0.075, 0.075, 0.02));
  carry(dark, sunsh, { at: [0.28, 0.94, 1.32], pitch: -32 * DEG });
  strut(silver, [0, 0.66, 1.02], [0, 0.9, 0.9], 0.018); //  the T-shaped hand controller: pull it all the
  box(dark, [0.22, 0.03, 0.03], [0, 0.91, 0.88]);      //  way back and it is the parking brake

  //  The mesh high-gain antenna on its mast at the front centre, tipped up toward Earth.
  strut(silver, [0, 0.58, 0.6], [0, 1.32, 0.82], 0.024);
  const dish = part((P) => {
    drum(P, 18, 0.06, 0.34, 0.17); //  the parabola, open upward
    drum(P, 18, 0.35, 0.35, 0.02, [0, 0.085, 0]);
    strut(P, [0, 0.02, 0], [0, 0.3, 0], 0.016); //  the feed
  });
  carry(dark, dish, { at: [0, 1.42, 0.86], pitch: -22 * DEG });
  carry(silver, dish, { at: [0, 1.44, 0.84], pitch: -22 * DEG });

  //  Rear: the cargo bed with its four fanny packs, the television camera that filmed Apollo 16's liftoff,
  //  and the wax thermal-capacitor radiator on the top deck.
  for (const [x, z] of [[-0.3, -1.24], [0.3, -1.24], [-0.3, -0.86], [0.3, -0.86]]) box(gold, [0.2, 0.18, 0.3], [x, 0.66, z]);
  box(dark, [0.22, 0.24, 0.26], [0, 0.72, -1.42]); //  the TV camera, facing back over the seat
  box(silver, [0.72, 0.02, 0.46], [0, 0.62, -1.05]); //  the radiator that boiled the wax out
  box(gold, [0.2, 0.11, 0.012], [0.34, 0.6, 1.49]); //  the plaque: Man's First Wheels on the Moon
  return { silver, gold, dark };
};

// ---- Apollo 16 ALSEP -------------------------------------------------------
// A station, not a vehicle: the low central box, one tall mast with the antenna on it, the finned RTG
// beside it, four instruments spread around on their own legs, and the cable web between them.
const ALSEP = () => {
  const silver = prim(), gold = prim(), dark = prim();
  const leg = (P, x, z, h, r = 0.022) => strut(P, [x, h, z], [x * 1.25, 0, z * 1.25], r);

  //  Central Station: 25 kg of electronics and transmitter on a leg frame, the LM carrybar left standing
  //  behind it as the antenna mast, and the 58 cm helical at the top, pointed at Earth by the crew.
  box(silver, [0.46, 0.42, 0.36], [0, 0.53, 0]);
  box(dark, [0.44, 0.05, 0.34], [0, 0.77, 0]); //  the lid it was unfolded from
  for (const [x, z] of [[-0.18, 0.14], [0.18, 0.14], [0, -0.18]]) leg(silver, x, z, 0.32);
  strut(silver, [0.02, 0.8, -0.02], [0.06, 1.28, 0.06], 0.017);
  const helix = part((P) => { drum(P, 8, 0.019, 0.019, 0.58); drum(P, 8, 0.05, 0.05, 0.02, [0, -0.3, 0]); });
  carry(dark, helix, { at: [0.09, 1.56, 0.09], pitch: -24 * DEG }); //  58 x 3.8 cm, Earth-aimed

  //  The SNAP-27: about 70 W at 16 V out of a plutonium fuel element in an abort-proof cask, cooled by
  //  eleven dark-grey fins. It was placed downwind, and it is the reason this ran for five years.
  const rtg = [-1.32, 0, -0.26];
  drum(dark, 14, 0.155, 0.155, 0.6, [rtg[0], 0.62, rtg[2]]);
  for (let i = 0; i < 7; i++) drum(dark, 14, 0.215, 0.215, 0.014, [rtg[0], 0.36 + i * 0.083, rtg[2]]);
  for (const a of [0, 2.09, 4.19]) strut(silver, [rtg[0] + Math.sin(a) * 0.13, 0.32, rtg[2] + Math.cos(a) * 0.13], [rtg[0] + Math.sin(a) * 0.26, 0, rtg[2] + Math.cos(a) * 0.26], 0.02);

  //  Passive Seismic Experiment: a gold-shelled box on three feet, its cover hinged open.
  const pse = [0.98, 0, 0.5];
  box(gold, [0.5, 0.36, 0.46], [pse[0], 0.34, pse[2]]);
  for (const [x, z] of [[-0.18, 0.16], [0.18, 0.16], [0, -0.2]]) leg(gold, pse[0] + x, pse[2] + z, 0.16, 0.018);
  carry(silver, part((P) => box(P, [0.5, 0.02, 0.46])), { at: [pse[0], 0.58, pse[2] - 0.3], pitch: -68 * DEG });

  //  Lunar Surface Magnetometer: a tripod with two gold arms and the ring-core sensor between them.
  const lsm = [0.34, 0, -1.24];
  for (const a of [0, 2.09, 4.19]) strut(silver, [lsm[0] + Math.sin(a) * 0.17, 0.44, lsm[2] + Math.cos(a) * 0.17], [lsm[0] + Math.sin(a) * 0.3, 0, lsm[2] + Math.cos(a) * 0.3], 0.014);
  box(gold, [0.6, 0.03, 0.05], [lsm[0], 0.46, lsm[2]]);
  box(gold, [0.05, 0.03, 0.44], [lsm[0], 0.46, lsm[2]]);
  drum(dark, 10, 0.055, 0.055, 0.16, [lsm[0], 0.53, lsm[2]]);

  //  Solar Wind Composition collector: a foil panel on a pole, and the subpallet the experiments rode in on,
  //  still carrying the two canisters that were not deployed.
  const swc = [-0.5, 0, 1.22];
  strut(silver, [swc[0], 0.02, swc[2]], [swc[0], 0.86, swc[2]], 0.014);
  const foil = part((P) => box(P, [0.3, 0.38, 0.015]));
  carry(gold, foil, { at: [swc[0], 0.98, swc[2]], pitch: 18 * DEG });
  box(silver, [0.62, 0.1, 0.5], [-0.72, 0.2, -1.06]);
  for (const x of [-0.92, -0.52]) drum(dark, 12, 0.12, 0.12, 0.24, [x, 0.38, -1.06]);

  //  Heat Flow: one probe went in before John Young caught his foot on the cable and pulled the other one
  //  out of the Central Station connector, which ended the experiment rather than repaired it.
  const hf = [0.66, 0, -0.62];
  box(silver, [0.3, 0.26, 0.3], [hf[0], 0.14, hf[2]]);
  drum(dark, 8, 0.03, 0.03, 0.1, [hf[0] + 0.2, 0.05, hf[2] + 0.2]);

  //  Active Seismic: the mortar at one end and four geophones in a line running away from the station, of
  //  which three of the four explosive charges fired before the pitch sensor went off scale.
  drum(dark, 10, 0.09, 0.12, 0.26, [1.28, 0.13, -1.0]);
  for (let i = 0; i < 4; i++) {
    const g = [1.12 - i * 0.42, 0.08, -1.48 - i * 0.12];
    box(dark, [0.1, 0.12, 0.1], g);
    strut(silver, [g[0], 0.02, g[2]], [g[0], 0.03, g[2]], 0.01);
  }

  //  The flat network cable, laid on the surface between everything - the signature of an ALSEP site from
  //  orbit, which is how LROC reads these sites as station plus instruments plus a dark line of disturbed soil.
  const cable = (to) => strut(dark, [to[0] * 0.35, 0.03, to[2] * 0.35], [to[0] * 0.94, 0.02, to[2] * 0.94], 0.013, 5);
  for (const to of [rtg, pse, lsm, swc, hf, [1.28, 0, -1.0]]) cable(to);
  return { silver, gold, dark };
};

// ---- Mars Pathfinder and Sojourner ----------------------------------------
// Three petals folded down as ramps off a tetrahedral body, with a bug of a rover parked at the foot of one
// of them. Nothing else in the walk is this flat and this wide, which is the point.
const PATHFINDER = () => {
  const silver = prim(), gold = prim(), dark = prim();

  //  The lander body: the tetrahedral core, 1.5 m across, on three short legs.
  box(silver, [1.44, 0.46, 1.3], [0, 0.72, 0]);
  box(gold, [1.1, 0.2, 1.0], [0, 1.02, 0]); //  the deck the instruments sat on
  for (const a of [0.61, 2.69, 4.77]) strut(silver, [Math.sin(a) * 0.6, 0.5, Math.cos(a) * 0.6], [Math.sin(a) * 0.78, 0.06, Math.cos(a) * 0.78], 0.05);

  //  The three triangular solar-array petals, hinged along the base edges and folded down to the ground as
  //  ramps at about the twenty degrees Sojourner rolled down. The cells are on the ramp surface, which is why
  //  they were under dust within a sol or two.
  const ramp = part((P) => {
    box(P, [1.5, 0.05, 1.15], [0, 0, 0.575]);
    box(P, [1.5, 0.06, 0.05], [0, 0.02, 1.15]); //  the lip that tripped the dust
    for (let i = 0; i < 5; i++) drum(P, 4, 0.02, 0.02, 0.012, [0, 0.03, 0.13 + i * 0.23]);
  });
  const cells = part((P) => box(P, [1.36, 0.012, 1.0], [0, 0.03, 0.6]));
  for (let i = 0; i < 3; i++) {
    const yaw = i * 120 * DEG + 20 * DEG;
    const at = [Math.sin(yaw) * 0.66, 0.46, Math.cos(yaw) * 0.66];
    carry(silver, ramp, { at, yaw, pitch: 23 * DEG });
    carry(dark, cells, { at, yaw, pitch: 23 * DEG });
  }

  //  The Imaging Lander Instrument on its mast, the meteorology boom with its three windsocks, and the
  //  Instrument Science Assembly at the front corner where the soil was analysed.
  strut(silver, [0.34, 1.05, 0.2], [0.34, 1.78, 0.2], 0.026); //  the 0.8 m pop-up mast it imaged the town with
  box(dark, [0.2, 0.16, 0.18], [0.34, 1.86, 0.2]);
  strut(silver, [-0.4, 1.06, -0.24], [-0.4, 2.0, -0.24], 0.012);
  for (let i = 0; i < 3; i++) carry(dark, part((P) => box(P, [0.3, 0.01, 0.05], [0.16, 0, 0])), { at: [-0.4, 1.62 + i * 0.14, -0.24], yaw: i * 40 * DEG });
  drum(gold, 12, 0.16, 0.16, 0.12, [0, 1.18, 0.42]);

  //  Sojourner: 11.5 kg, the size of a milk crate, 30 cm tall, on six 13 cm aluminium wheels through a
  //  rocker-bogie with no axles or springs, parked a few metres from the ramp it rolled down on sol 2. Built
  //  at the origin in its own buckets, then turned and carried onto the ground beside that petal.
  const rs = prim(), rg = prim(), rd = prim();
  const wheel = part((P) => drum(P, 12, 0.065, 0.065, 0.05));
  const legs = [[-0.22, 0.24], [0.22, 0.24], [-0.22, -0.24], [0.22, -0.24], [-0.22, 0], [0.22, 0]];
  for (const [x, z] of legs) carry(rd, wheel, { at: [x, 0.065, z], roll: 90 * DEG });
  for (const [x, z] of legs) strut(rs, [x * 0.5, 0.2, z], [x, 0.07, z], 0.012);
  box(rg, [0.44, 0.16, 0.62], [0, 0.24, 0]); //  the gold-coloured electronics box the batteries sat in
  carry(rd, part((P) => box(P, [0.46, 0.014, 0.6])), { at: [0, 0.33, 0], pitch: -7 * DEG }); //  its one flat array
  for (const z of [0.33, -0.33]) { //  a flip-up stereo camera head at each end, because it had no front
    strut(rs, [0, 0.3, z * 0.9], [0, 0.4, z], 0.016);
    box(rd, [0.14, 0.11, 0.1], [0, 0.44, z]);
  }
  box(rd, [0.22, 0.03, 0.22], [0, 0.11, 0.28]); //  the Alpha-Proton X-Ray Spectrometer, under the nose
  drum(rg, 10, 0.08, 0.08, 0.06, [0, 0.28, -0.3]); //  the Gamma-Ray Spectrometer behind

  const rove = [0.95, 0, 1.82];
  carry(silver, rs, { at: rove, yaw: -34 * DEG });
  carry(gold, rg, { at: rove, yaw: -34 * DEG });
  carry(dark, rd, { at: rove, yaw: -34 * DEG });
  return { silver, gold, dark };
};

// ---- emit ------------------------------------------------------------------
fs.mkdirSync(dir, { recursive: true });
const build = (fn, name, materials = MATERIALS) => {
  const doc = gltf(fn(), name, materials, "tools/build-hardware.mjs");
  const file = name + ".gltf";
  fs.writeFileSync(path.join(dir, file), JSON.stringify(doc));
  return report(doc, file);
};
build(ROVER, "lunar-rover");
build(ALSEP, "alsep");
build(PATHFINDER, "pathfinder-sojourner");
