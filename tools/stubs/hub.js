import * as THREE from "three";

// Minimal hook dispatcher + element walker so the real component tree can be executed headlessly:
// three objects are genuine, refs are assigned, and every useFrame callback is actually run.
export const hosts = [];
export const seenMaterials = new Set();
export const seenGeometries = new Set();
export const frames = [];
export const effects = [];
export const scrollState = {
  el: { scrollTop: 1, scrollHeight: 9000, clientHeight: 800, style: {} },
  offset: 0,
  delta: 0,
  scroll: { current: 0 },
  pages: 10,
  eps: 1e-5,
  damping: 0.18,
  horizontal: false,
  fill: {},
  fixed: {},
  range: (from, dist) => Math.min(1, Math.max(0, (scrollState.offset - from) / dist)),
  curve: (from, dist) => Math.sin(scrollState.range(from, dist) * Math.PI),
  visible: (from, dist) => scrollState.offset >= from && scrollState.offset <= from + dist,
};

const instances = new Map();
let scope = null;
let pass = 0;
let dirty = false;

export function beginScope(inst) {
  scope = inst;
  inst.index = 0;
}
export function endScope() {
  scope = null;
}

function slot(kind, init) {
  if (!scope) throw new Error("hook called outside a component render");
  const i = scope.index++;
  if (scope.hooks[i] === undefined) scope.hooks[i] = init();
  return scope.hooks[i];
}

export const useState = (initial) => {
  const box = slot("state", () => ({ v: typeof initial === "function" ? initial() : initial }));
  return [
    box.v,
    (next) => {
      const v = typeof next === "function" ? next(box.v) : next;
      if (v !== box.v) {
        box.v = v;
        dirty = true;
      }
    },
  ];
};
export const useRef = (initial) => slot("ref", () => ({ current: initial === undefined ? null : initial }));
export const useMemo = (fn) => slot("memo", () => ({ v: fn() })).v;
export const useEffect = (fn) => {
  const box = slot("effect", () => ({ queued: true }));
  if (box.queued) {
    box.queued = false;
    effects.push(fn);
  }
};
export const useCallback = (fn) => fn;
export const useContext = () => scrollState;

export function instanceFor(path, type) {
  let inst = instances.get(path);
  if (!inst) {
    inst = { path, type, hooks: [], index: 0 };
    instances.set(path, inst);
  }
  return inst;
}

function assignRef(ref, node) {
  if (typeof ref === "function") ref(node);
  else if (ref && typeof ref === "object") ref.current = node;
}

function flat(children) {
  return children === undefined || children === null ? [] : [children].flat(Infinity).filter((c) => c !== undefined && c !== null && c !== false);
}

// Returns every node created beneath this element so a parent can adopt them all. The first version of
// this walker took hosts[length-1] as "the" child, which silently attached one node per group and made
// the scene-graph budget measurement meaningless.
export function walk(el, path) {
  if (el === undefined || el === null || el === false || el === true) return [];
  if (Array.isArray(el)) return el.flatMap((c, i) => walk(c, path + "#" + i));
  if (typeof el !== "object") return [];
  const { type, props = {} } = el;

  if (typeof type === "function") {
    const name = type.name || "anon";
    const inst = instanceFor(path + "@" + name, type);
    beginScope(inst);
    let out;
    try {
      out = type(props);
    } finally {
      endScope();
    }
    return walk(out, path + "/" + name);
  }

  if (type === "fragment") return flat(props.children).flatMap((c, i) => walk(c, path + "~" + i));

  const node = makeNode(type, props);
  applyProps(node, props);
  for (const kid of flat(props.children).flatMap((c, i) => walk(c, path + "<" + type + i))) {
    if (kid.isMaterial) node.material = kid;
    else if (kid.isBufferGeometry || kid.isGeometry) node.geometry = kid;
    else if (kid.isObject3D) {
      kid.adopted = true;
      node.add(kid);
    }
  }
  assignRef(props.ref, node);
  hosts.push(node);
  return [node];
}

const classFor = (tag) => {
  const Name = tag[0].toUpperCase() + tag.slice(1);
  return THREE[Name] || null;
};

function makeNode(tag, props) {
  const Cls = classFor(tag);
  const args = props.args || [];
  if (!Cls) {
    // A host tag three does not know (div, span, i, em) is DOM, not scene graph: give it just enough of
    // an element for the input layer to bind against, and record what it binds with.
    const node = new THREE.Object3D();
    node.tag = tag;
    node.isDomNode = true;
    node.__listeners = {};
    node.addEventListener = (t, fn, opts) => (node.__listeners[t] ||= []).push({ fn, opts });
    node.removeEventListener = (t, fn) => {
      const l = node.__listeners[t] || [];
      const i = l.findIndex((e) => e.fn === fn);
      if (i >= 0) l.splice(i, 1);
    };
    node.className = props.className || "";
    return node;
  }
  try {
    const node = new Cls(...args);
    node.tag = tag;
    return node;
  } catch (e) {
    throw new Error(tag + " constructor failed with " + args.length + " args: " + e.message);
  }
}

export const listenersOf = (node) => (node.__listeners ||= {});

export function emit(target, type, ev = {}) {
  let prevented = false;
  const event = { type, target, preventDefault: () => (prevented = true), stopPropagation: () => {}, pointerId: 1, pointerType: "touch", clientX: 0, clientY: 0, buttons: 1, ...ev };
  for (const entry of (target.__listeners || {})[type] || []) entry.fn.call(target, event);
  return { event, prevented, opts: ((target.__listeners || {})[type] || []).map((e) => e.opts) };
}

export function emitWindow(type, ev = {}) {
  let prevented = false;
  const event = { type, preventDefault: () => (prevented = true), stopPropagation: () => {}, ...ev };
  for (const entry of windowListeners[type] || []) entry.fn(event);
  return { event, prevented };
}

export const windowListeners = {};

function note(value) {
  if (value && value.isMaterial) seenMaterials.add(value);
  if (value && (value.isBufferGeometry || value.isGeometry)) seenGeometries.add(value);
  return value;
}

function applyProps(node, props) {
  note(node);
  for (const [k, v] of Object.entries(props)) {
    if (k === "children" || k === "args" || k === "ref" || k === "key") continue;
    if (v === undefined || v === null || typeof v === "function" || typeof v === "boolean") continue;
    note(v);
    if (Array.isArray(v)) {
      if (typeof node[k]?.set === "function") node[k].set(...v);
      continue;
    }
    // Textures, materials and geometries are all plain objects here; assigning them is the whole point of
    // the audit, so nothing is skipped except React's own plumbing and event handlers.
    try {
      node[k] = v;
    } catch {
      /* read-only on real three objects: fine for a smoke test */
    }
  }
}

export function runEffects() {
  while (effects.length) {
    const fn = effects.shift();
    const cleanup = fn();
    if (typeof cleanup === "function") effects.cleanupFns = (effects.cleanupFns || []).concat(cleanup);
  }
}

export let tree = [];
export function renderTree(element) {
  for (pass = 0; pass < 6; pass++) {
    dirty = false;
    hosts.length = 0;
    tree = walk(element, "r");
    runEffects();
    if (!dirty) break;
  }
  return { passes: pass + 1, hosts: hosts.length, roots: tree.length };
}

export function budgetAt(visibleOnly) {
  const problems = [];
  const roots = (tree.length ? tree : hosts.filter((x) => x.isObject3D)).filter((x) => x.isObject3D);
  let tris = 0;
  let draws = 0;
  let programs = new Set();
  const walkNode = (n) => {
    if (n.visible === false) return;
    if (n.isMesh || n.isPoints || n.isLine) {
      const g = n.geometry;
      const mult = n.isInstancedMesh ? n.count : 1;
      if (g?.index) tris += (g.index.count / 3) * mult;
      else if (g?.attributes?.position) tris += (g.attributes.position.count / 3) * mult;
      // n.isPoints is undefined on a Mesh, so it must be tested with !, not === false.
      if (n.isPoints) {
        draws += 1;
        programs.add(n.material?.type || "none");
      } else if (n.material) {
        // An InstancedMesh is a single draw call no matter how many instances it holds - that is the
        // whole reason rocks and labels are instanced.
        draws += 1;
        programs.add(n.material.type + (n.material.isShaderMaterial ? ":" + (n.material.fragmentShader || "").length : ""));
      } else if (!n.isGroup) {
        problems.push(n.tag);
      }
    }
    (n.children || []).forEach(walkNode);
  };
  roots.forEach(walkNode);
  void visibleOnly;
  return { draws, tris: Math.round(tris), programs: programs.size, roots: roots.length, noMaterial: [...new Set(problems)] };
}

export function setScroll(offset) {
  scrollState.offset = offset;
  scrollState.scroll.current = offset;
  scrollState.delta = 0.001;
}

export function registerFrame(cb, priority = 0) {
  frames.push({ cb, priority });
  frames.sort((a, b) => a.priority - b.priority);
}
