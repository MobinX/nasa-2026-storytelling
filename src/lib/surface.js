import { Color } from "three";

// How a surface is made readable in a scene with one directional light and no environment map.
//
// Three numbers, and all of them exist because the picture has no IBL to give a material anything to
// reflect:
//
//   metalness. A glTF metal is a mirror. MetallicFactor's spec default is 1.0 and three of the reduced NASA
//   exports leave the field off entirely, so Opportunity's white body, its dark frame and an unnamed part
//   of InSight arrived as cut-outs - 4/255 and 0/255 measured from where the walk stands. Anodised
//   aluminium and white paint are diffuse surfaces with a thin oxide; the metalness is an exporter artefact.
//
//   albedo. 0.05 linear is black even in full sunlight at this sun elevation, so a part of a machine the
//   visitor is being told about cannot be a hole in the picture. Lifted to a floor by scaling toward it,
//   which keeps the hue: the grey stays grey and the gold stays gold.
//
//   self-fill. Four of the ten stops stand with their night side to the visitor, because the route
//   alternates which side of the walking line a machine is on and there is exactly one sun. Ambient light
//   would fix that and milk the regolith with it, since ambient cannot tell a lander's panels from the
//   ground it stands on. A small fraction of each material's own albedo, added back as emission, stands in
//   for the bounces between a vehicle's own surfaces - which one directional beam cannot show and a real
//   photograph of a lander has in abundance - and touches nothing outside the hardware.
export const MAX_METAL = 0.25;
export const MIN_ALBEDO = 0.2;
export const SELF_FILL = 0.07;

// Rec.709 on linear components: the same weights the renderer's own output encoding uses. Takes a Color or a
// triple, because the checker measures a shader's worth of triples and this module holds Colors.
export const luma = (c) => 0.2126 * (c.r ?? c[0]) + 0.7152 * (c.g ?? c[1]) + 0.0722 * (c.b ?? c[2]);

// Idempotent, and it has to be: `clone(true)` shares materials between every instance of a file, so a model
// that appears twice in a walk would otherwise be lifted twice. Returns the material for callers that want
// to chain.
export function reveal(material) {
  if (!material) return material;
  if (material.metalness > MAX_METAL) material.metalness = MAX_METAL;
  const c = material.color;
  if (c) {
    const y = luma(c);
    if (y > 0 && y < MIN_ALBEDO) c.multiplyScalar(MIN_ALBEDO / y);
    if (material.emissive) material.emissive.copy(c).multiplyScalar(SELF_FILL);
  }
  return material;
}

// A planet's colour in this app is an identity, not an exposure. A hex read as linear multiplies the map by
// its own brightness - Mercury's #8f8a84 keeps 26% of what its map contains, Earth's day side 21%, Neptune
// 20% - so the opening diagram showed the solar system at a fifth to two thirds of its real brightness, and
// the globes on the way down were dark for the same reason.
//
// Lift the tint toward unit luminance so a map is drawn at the brightness it was authored at, and stop as
// soon as the strongest channel reaches 1.9 times the map: past that the hue clips away to white and the
// detail the map carries is gone anyway. Mercury and the Moon end at 100% of their maps, Earth at 83%,
// Neptune at 58% with its blue intact.
export const tint = (hex) => {
  const c = new Color(hex);
  const k = Math.min(1 / Math.max(luma(c), 1e-4), 1.9 / Math.max(c.r, c.g, c.b, 1e-4));
  return c.multiplyScalar(k);
};

// The two colours of one ground, lifted by the single gain that brings the near field up to its map's own
// brightness. One gain for both, because the difference between them is the far field receding - a depth cue
// worth keeping - while the level they share is an exposure error: lunar soil at #a0a0a6 was holding its
// albedo map to a third, Martian dust at #a8674a to a fifth, and a surface act reads as dusk from the ground
// up long before the hardware does.
export function ground(nearHex, farHex) {
  const near = new Color(nearHex), far = new Color(farHex);
  const k = Math.min(1 / Math.max(luma(near), 1e-4), 1.9 / Math.max(near.r, near.g, near.b, 1e-4));
  return { near: near.multiplyScalar(k), far: far.multiplyScalar(k) };
}
