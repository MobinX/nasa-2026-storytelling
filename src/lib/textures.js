import * as THREE from "three";

// Only 2k source tiers exist, so per-body resolution is chosen here by drawing onto a smaller canvas.
// CanvasTexture (not ImageBitmap) keeps three's flipY + colorSpace handling on the normal code path.
const JOBS = [
  { key: "sun", url: "/textures/2k_sun.jpg", w: 1024, h: 512 },
  { key: "mercury", url: "/textures/2k_mercury.jpg", w: 1024, h: 512 },
  { key: "venus", url: "/textures/2k_venus_surface.jpg", w: 1024, h: 512 },
  { key: "earth", url: "/textures/2k_earth_daymap.jpg", w: 1024, h: 512 },
  { key: "mars", url: "/textures/2k_mars.jpg", w: 1024, h: 512 },
  { key: "jupiter", url: "/textures/2k_jupiter.jpg", w: 1024, h: 512 },
  { key: "saturn", url: "/textures/2k_saturn.jpg", w: 1024, h: 512 },
  { key: "uranus", url: "/textures/2k_uranus.jpg", w: 1024, h: 512 },
  { key: "neptune", url: "/textures/2k_neptune.jpg", w: 1024, h: 512 },
  { key: "moon", url: "/textures/2k_moon.jpg", w: 2048, h: 1024 },
  { key: "saturnRing", url: "/textures/2k_saturn_ring_alpha.png", w: 1024, h: 63 },
];

const decode = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("texture failed: " + url));
    img.src = url;
  });

const fit = (img, w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d").drawImage(img, 0, 0, w, h);
  return c;
};

export const maps = {};

// Takes the anisotropy ceiling directly: the maps have to be decoded before a WebGL context exists, so
// the renderer's getMaxAnisotropy() is not available yet.
export async function preloadMaps(maxAnisotropy = 4, onProgress) {
  const aniso = Math.max(0, Math.min(8, maxAnisotropy));
  let done = 0;
  for (const j of JOBS) {
    const img = await decode(j.url);
    const t = new THREE.CanvasTexture(fit(img, j.w, j.h));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    maps[j.key] = t;
    onProgress && onProgress(++done / JOBS.length);
  }
  maps.detail = makeDetailTile(aniso);
  return maps;
}

// 1k speckle for the regolith near field: craters at boot-print scale, which the 2k equirect cannot show.
export function makeDetailTile(aniso) {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#e2e2e2";
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 5200; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 0.6 + Math.random() * 4.5;
    const up = Math.random() * 0.2 - 0.1;
    ctx.beginPath();
    ctx.fillStyle = "rgba(" + (132 + up * 255).toFixed(0) + "," + (132 + up * 255).toFixed(0) + "," + (137 + up * 255).toFixed(0) + "," + (0.25 + Math.random() * 0.4).toFixed(2) + ")";
    ctx.arc(x, y, r, 0, 6.2832);
    ctx.fill();
  }
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 3 + Math.random() * 16;
    const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    g.addColorStop(0, "rgba(58,58,62,0.5)");
    g.addColorStop(0.55, "rgba(150,150,156,0.35)");
    g.addColorStop(1, "rgba(120,120,126,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.2832);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
