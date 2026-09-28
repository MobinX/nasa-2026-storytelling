import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// The objects you walk up to are files, not code: objects.json names a glTF for each and this module owns
// reading them. Loaded once behind the boot screen, cloned per instance, so a model that appears twice in a
// walk shares its buffers and materials.
//
// A missing model is not allowed to make an object invisible - the framing checks measure the stop whether
// or not the file arrived - so `instance` falls back to a proxy the same size as the authored object.
const loader = new GLTFLoader();
export const models = new Map();

export async function loadModels(paths, onProgress) {
  let i = 0;
  for (const p of paths) {
    try {
      models.set(p, await loader.loadAsync(p));
    } catch (err) {
      console.warn("model failed to load:", p, err.message);
      models.set(p, null);
    }
    onProgress && onProgress(++i / paths.length);
  }
  return models;
}

export function instance(path, proxy) {
  const doc = models.get(path);
  if (!doc?.scene) return proxy ?? null;
  const scene = doc.scene.clone(true);
  // glTF hands back MeshStandardMaterials with whatever the authoring tool wrote for doubleSided, and the
  // demo models are open soup: without this the inside of every leg and panel disappears at some angles.
  scene.traverse((o) => { if (o.isMesh && o.material) o.material.side = 2; });
  return scene;
}
