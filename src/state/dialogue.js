// The one thing the HUD has to tell the scene: whether the crew member is mid-sentence right now, which
// is what his hands animate to, and how far through the conversation we are, which is one of the two things
// the walking arc in journey/orbit.js is a function of - the other is how long the hold has been open, so a
// visitor reading a question never watches a still picture. Deliberately not React state - setState in
// anything inside <Canvas> is how ScrollControls loses its listener and the journey freezes.
export const dialogue = { talking: 0, progress: 0 };
