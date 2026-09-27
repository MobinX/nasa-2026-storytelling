// The dpr floors are set against the panel, not against CSS pixels: at 1.0 a 2.5x phone draws one frame
// pixel per 6.25 device pixels, which is what read as a low-res raster on every planet silhouette.
// Only the last entry renders by default; the rest exist for ?tier= and for a software GL.
export const TIERS = [
  { dpr: 0.8, stars: 700, labels: false, rocks: 0, grid: 64, aniso: 0, normalMap: false, glow: 1 },
  { dpr: 1.1, stars: 1200, labels: false, rocks: 90, grid: 80, aniso: 2, normalMap: true, glow: 1 },
  { dpr: 1.6, stars: 1800, labels: true, rocks: 150, grid: 96, aniso: 4, normalMap: true, glow: 2 },
  { dpr: 2.0, stars: 2400, labels: true, rocks: 220, grid: 96, aniso: 8, normalMap: true, glow: 2 },
];

export const MAX_TIER = TIERS.length - 1;

// Past the panel's native ratio every extra pixel is fill-rate with nothing to show for it. This is also
// the only ceiling that holds, since drivers are free to ignore the context's antialias request.
export const resolveDpr = (tier) => Math.min(TIERS[tier].dpr, (typeof window !== "undefined" && window.devicePixelRatio) || 1);

export function isSoftwareRenderer(gl) {
  const dbg = gl.getContext().getExtension("WEBGL_debug_renderer_info");
  return /swiftshader|llvmpipe|software|basic render/i.test(dbg ? String(gl.getContext().getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "");
}
