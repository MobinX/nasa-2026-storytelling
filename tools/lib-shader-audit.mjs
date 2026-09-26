// Static audit of everything the harness actually constructed: blind-written GLSL never gets compiled
// here, and colour-space mistakes on map slots are the classic cause of a scene rendering washed out or
// muddy. Both are checkable without a GPU.
const INJECTED_ATTRS = new Set(["position", "normal", "uv", "uv1", "uv2", "uv3", "tangent", "color", "skinIndex", "skinWeight", "instanceMatrix", "instanceColor"]);
const INJECTED_UNIFORMS = new Set(["modelMatrix", "modelViewMatrix", "projectionMatrix", "viewMatrix", "normalMatrix", "cameraPosition", "isOrthographic", "logDepthBufFC"]);
const ALBEDO = ["map", "emissiveMap", "specularMap", "gradientMap"];
const DATA = ["normalMap", "roughnessMap", "metalnessMap", "aoMap", "alphaMap", "bumpMap", "displacementMap", "clearcoatNormalMap", "envMap"];
const FRAG_ONLY_BUILTINS = ["position", "normal", "uv", "uv1", "uv2"];

const balanced = (s) => {
  let depth = 0;
  let par = 0;
  for (const c of s) {
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === "(") par++;
    else if (c === ")") par--;
    if (depth < 0 || par < 0) return false;
  }
  return depth === 0 && par === 0;
};

const decls = (src, kind) => {
  const out = new Map();
  // Not anchored to a line start: "uniform vec3 uColor; uniform float uTime, uOpacity;" is two real
  // declarations and anchoring silently hides the second one, which is exactly a missing-uniform bug.
  const re = new RegExp("\\b" + kind + "\\s+(\\w+)\\s+([^;{}()]+);", "g");
  let m;
  while ((m = re.exec(src))) for (const name of m[2].split(",")) out.set(name.trim(), m[1]);
  return out;
};

const identifiers = (src) => new Set((src.match(/\b[A-Za-z_]\w*\b/g) || []));

export function auditMaterials(materials, hosts) {
  const problems = [];
  const notes = [];
  const instancedMaterials = new Set(hosts.filter((h) => h.isInstancedMesh).map((h) => h.material).filter(Boolean));
  let shaders = 0;

  for (const mat of materials) {
    const label = mat.type + (mat.name ? ":" + mat.name : "");
    if (mat.isShaderMaterial) {
      shaders++;
      const vs = mat.vertexShader || "";
      const fs = mat.fragmentShader || "";
      if (!/void\s+main\s*\(/.test(vs)) problems.push(`${label}: vertexShader has no main()`);
      if (!/void\s+main\s*\(/.test(fs)) problems.push(`${label}: fragmentShader has no main()`);
      if (!balanced(vs)) problems.push(`${label}: unbalanced braces in vertexShader`);
      if (!balanced(fs)) problems.push(`${label}: unbalanced braces in fragmentShader`);

      for (const [name, type] of decls(vs, "attribute")) {
        if (INJECTED_ATTRS.has(name)) problems.push(`${label}: re-declares injected attribute "${type} ${name}" (three already declares it)`);
      }
      const vVary = decls(vs, "varying");
      const fVary = decls(fs, "varying");
      for (const [name, type] of fVary) {
        if (!vVary.has(name)) problems.push(`${label}: fragment varying ${type} ${name} is not declared in the vertex shader`);
        else if (vVary.get(name) !== type) problems.push(`${label}: varying ${name} type mismatch ${vVary.get(name)} vs ${type}`);
      }
      for (const [name] of vVary) if (!fVary.has(name)) notes.push(`${label}: varying ${name} written but never read`);

      const declaredUniforms = decls(vs, "uniform");
      for (const [n] of decls(fs, "uniform")) declaredUniforms.set(n, "uniform");
      for (const [name] of declaredUniforms) {
        if (INJECTED_UNIFORMS.has(name)) continue;
        if (!(name in (mat.uniforms || {}))) problems.push(`${label}: uniform "${name}" is declared in GLSL but missing from material.uniforms`);
      }
      // Undeclared v*/u*/a* identifiers are how a renamed varying typo shows up before any GPU exists.
      const declared = new Set([...vVary.keys(), ...fVary.keys(), ...declaredUniforms.keys(), ...decls(vs, "attribute").keys(), ...decls(fs, "attribute").keys(), ...Object.keys(mat.uniforms || {})]);
      const localConst = (src) => new Set((src.match(/\b(?:float|int|vec2|vec3|vec4|mat3|mat4|bool|sampler2D)\s+(\w+)/g) || []).map((t) => t.split(/\s+/).pop()));
      const localsV = localConst(vs);
      const localsF = localConst(fs);
      for (const [stage, src, locals] of [["vertex", vs, localsV], ["fragment", fs, localsF]]) {
        for (const id of identifiers(src)) {
          if (!/^[vua][A-Z]/.test(id)) continue;
          if (declared.has(id) || locals.has(id) || INJECTED_ATTRS.has(id) || INJECTED_UNIFORMS.has(id)) continue;
          if (["vec2", "vec3", "vec4"].includes(id)) continue;
          problems.push(`${label}: ${stage} shader uses "${id}" which is not declared as a uniform, varying or attribute`);
        }
      }
      for (const name of Object.keys(mat.uniforms || {})) {
        if (!(vs + fs).includes(name)) notes.push(`${label}: uniform "${name}" is supplied but unused`);
      }

      const usedInFrag = identifiers(fs);
      for (const b of FRAG_ONLY_BUILTINS) {
        if (usedInFrag.has(b) && !fVary.has(b)) problems.push(`${label}: fragment uses "${b}", which is a vertex attribute - declare it as a varying`);
      }
      if (/texture2D\s*\(/.test(fs) && !/uniform sampler2D/.test(fs)) problems.push(`${label}: texture2D() used with no sampler declared`);
      if (/\bfwidth\s*\(/.test(fs) && mat.isRawShaderMaterial) problems.push(`${label}: fwidth needs GLSL3 - RawShaderMaterial is not upgraded`);
      if (/instanceMatrix/.test(vs) && !instancedMaterials.has(mat) && !hosts.some((h) => h.isInstancedMesh && h.material === mat)) {
        problems.push(`${label}: uses instanceMatrix but is not attached to an InstancedMesh`);
      }
    }

    for (const slot of ALBEDO) {
      const t = mat[slot];
      if (t && t.isTexture && t.colorSpace !== "srgb") problems.push(`${label}.${slot}: albedo texture must be SRGBColorSpace, got "${t.colorSpace}"`);
    }
    for (const slot of DATA) {
      const t = mat[slot];
      if (t && t.isTexture && t.colorSpace === "srgb") problems.push(`${label}.${slot}: data texture must not be SRGBColorSpace`);
    }
    if (mat.blending === 2 && mat.depthWrite) problems.push(`${label}: AdditiveBlending with depthWrite on will sort badly against other transparents`);
    for (const slot of [...ALBEDO, ...DATA]) {
      const t = mat[slot];
      if (t && t.isTexture && !t.image && !t.source?.data) problems.push(`${label}.${slot}: texture has no image data`);
    }
  }

  for (const h of hosts) {
    if (!h.isInstancedMesh) continue;
    // Drawing fewer instances than allocated is the intended live LOD lever; the reverse would read past the buffer.
    if (h.count > (h.instanceMatrix?.count ?? 0)) problems.push(`${h.tag}: count ${h.count} exceeds instanceMatrix capacity ${h.instanceMatrix?.count}`);
    if (h.geometry?.isBufferGeometry && !Object.keys(h.geometry.attributes).length) problems.push(`${h.tag}: instanced mesh with an empty geometry`);
  }

  return { problems, notes: [...new Set(notes)], shaders, materials: materials.size, hosts: hosts.length };
}
