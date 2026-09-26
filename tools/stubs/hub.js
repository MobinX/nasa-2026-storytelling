import * as THREE from "three";

// Minimal hook dispatcher + element walker so the real component tree can be executed headlessly:
// three objects are genuine, refs are assigned, and every useFrame callback is actually run.
export const hosts = [];
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

export function walk(el, path) {
  if (typeof el !== "object" || el === null || Array.isArray(el)) {
    if (Array.isArray(el)) el.forEach((c, i) => walk(c, path + "#" + i));
    return;
  }
  const { type, props } = el;
  if (typeof type === "function") {
    const inst = instanceFor(path + "@" + (type.name || "anon"), type);
    beginScope(inst);
    let out;
    try {
      out = type(props);
    } finally {
      endScope();
    }
    walk(out, path + "/" + (type.name || "anon"));
    return;
  }
  const node = makeNode(type, props);
  applyProps(node, props);
  const kids = flat(props.children).map((c, i) => {
    const before = hosts.length;
    walk(c, path + "<" + type + i);
    return hosts.length > before ? hosts[hosts.length - 1] : null;
  });
  for (const kid of kids) {
    if (!kid) continue;
    if (kid.isMaterial) node.material = kid;
    else if (kid.isBufferGeometry || kid.isGeometry) node.geometry = kid;
    else if (kid.isObject3D) node.add(kid);
  }
  assignRef(props.ref, node);
  hosts.push(node);
}

const classFor = (tag) => {
  const Name = tag[0].toUpperCase() + tag.slice(1);
  return THREE[Name] || (Name.endsWith("Light") ? THREE.Object3D : null);
};

function makeNode(tag, props) {
  const Cls = classFor(tag);
  const args = props.args || [];
  if (!Cls) return Object.assign(new THREE.Object3D(), { tag, unknownTag: tag });
  try {
    const node = new Cls(...args);
    node.tag = tag;
    if (!node.isObject3D) node.isPrimitiveNode = true;
    return node;
  } catch (e) {
    throw new Error(tag + " constructor failed with " + args.length + " args: " + e.message);
  }
}

function applyProps(node, props) {
  for (const [k, v] of Object.entries(props)) {
    if (k === "children" || k === "args" || k === "ref" || k === "key") continue;
    if (v === undefined || v === null || typeof v === "function" || typeof v === "boolean") continue;
    if (Array.isArray(v)) {
      if (typeof node[k]?.set === "function") node[k].set(...v);
      continue;
    }
    if (typeof v === "object" && !(v.isObject3D || v.isMaterial || v.isBufferGeometry) && typeof node[k]?.copy !== "function" && k !== "material" && k !== "geometry") continue;
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

export function renderTree(element) {
  for (pass = 0; pass < 6; pass++) {
    dirty = false;
    hosts.length = 0;
    walk(element, "r");
    runEffects();
    if (!dirty) break;
  }
  return { passes: pass + 1, hosts: hosts.length };
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
