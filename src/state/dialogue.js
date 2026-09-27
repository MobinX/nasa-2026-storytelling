// The one thing the HUD has to tell the scene: whether the crew member is mid-sentence right now, which
// is what his hands animate to. Deliberately not React state - setState in anything inside <Canvas> is
// how ScrollControls loses its listener and the journey freezes.
export const dialogue = { talking: 0 };
