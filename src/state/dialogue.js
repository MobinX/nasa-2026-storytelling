// The one thing the HUD has to tell the scene: whether the crew member is mid-sentence right now, which
// is what his hands animate to, and whether the answer service is currently streaming a reply, which keeps
// the same gesture alive through words that have no local script behind them. Deliberately not React state -
// setState in anything inside <Canvas> is how ScrollControls loses its listener and the journey freezes.
export const dialogue = { talking: 0, generating: 0 };
