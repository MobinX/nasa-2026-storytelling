import * as THREE from "three";

export const TIERS = [
  { dpr: 0.6, stars: 700, labels: false, rocks: 0, grid: 64, aniso: 0, normalMap: false, glow: 1 },
  { dpr: 0.85, stars: 1200, labels: false, rocks: 90, grid: 80, aniso: 2, normalMap: true, glow: 1 },
  { dpr: 1.1, stars: 1800, labels: true, rocks: 150, grid: 96, aniso: 4, normalMap: true, glow: 2 },
  { dpr: 1.25, stars: 2400, labels: true, rocks: 220, grid: 96, aniso: 8, normalMap: true, glow: 2 },
];

export function isSoftwareRenderer(gl) {
  const dbg = gl.getContext().getExtension("WEBGL_debug_renderer_info");
  return /swiftshader|llvmpipe|software|basic render/i.test(dbg ? String(gl.getContext().getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "");
}

export function probeTier(gl) {
  const caps = gl.capabilities;
  const dbg = gl.getContext().getExtension("WEBGL_debug_renderer_info");
  const renderer = dbg ? String(gl.getContext().getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "";
  if (/swiftshader|llvmpipe|software/i.test(renderer)) return 0;
  if (caps.maxTextureSize < 4096) return 1;
  const weak = /adreno \(tm\) [345]xx|adreno 5|mali-g[57]2|powervr/i.test(renderer);
  const cores = navigator.hardwareConcurrency || 4;
  if (weak || cores <= 4 || (navigator.deviceMemory || 8) <= 3) return 1;
  return navigator.devicePixelRatio >= 2.5 ? 2 : 3;
}
