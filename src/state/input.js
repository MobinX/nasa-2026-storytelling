// Input singleton. Sources only ever ADD to look.dx/dy and only ever WRITE move; the camera rig is
// the single reader and the single thing allowed to zero the accumulators. `move` is a held level,
// `look` is a consumed rate - that asymmetry is what prevents both sticky strafe and lost mouse ticks.
export const input = {
  move: { x: 0, y: 0 },
  look: { dx: 0, dy: 0 },
  active: false,
  enabled: false,
};

export const consumeLook = (accum) => {
  accum.dx += input.look.dx;
  accum.dy += input.look.dy;
  input.look.dx = 0;
  input.look.dy = 0;
  return accum;
};
