// Canonical SERNBELD character skin, extracted from the supplied female model viewer.
// View-space two-tone face lighting. Do not replace world/terrain materials with this.
export const STANDARD_SKIN_ID = 'standard-toon-skin-v1';
export const STANDARD_SKIN = Object.freeze({
  id: STANDARD_SKIN_ID,
  bright: Object.freeze([0.988, 0.847, 0.769]), // #FCD8C4 approx
  shadow: Object.freeze([0.914, 0.675, 0.596]), // #E9AC98 approx
  outline: Object.freeze([0.69, 0.44, 0.39]),   // #B0705F approx
  viewLight: Object.freeze([0.25, 0.62, 0.75]),
  terminator: Object.freeze([-0.215, -0.185]),
  rimStart: 0.55,
  rimEnd: 0.75,
  rimStrength: 0.04,
  outlineThickness: 0.00085,
  vertexUnit: 32 * 1428,
  maxJointsPerPart: 16
});

// The supplied WebGL shader uses local part-specific skinning palettes (<=16 joints).
// Keep these materials separate per part so their pose uniforms cannot bleed.
const vertexShader = `
  precision highp float;
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  attribute vec4 aJoints;
  attribute vec4 aWeights;
  uniform mat4 uSkin[16];
  uniform float uOutline;
  uniform float uVertexUnit;
  varying vec3 vViewNormal;
  void main() {
    mat4 skin = aWeights.x * uSkin[int(aJoints.x)]
              + aWeights.y * uSkin[int(aJoints.y)]
              + aWeights.z * uSkin[int(aJoints.z)]
              + aWeights.w * uSkin[int(aJoints.w)];
    vec3 localNormal = normalize(aNormal);
    vec3 skinned = (skin * vec4(aPosition / uVertexUnit + localNormal * uOutline, 1.0)).xyz;
    vViewNormal = normalize(normalMatrix * normalize(mat3(skin) * localNormal));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(skinned, 1.0);
  }
`;
const fragmentShader = `
  precision highp float;
  varying vec3 vViewNormal;
  uniform float uOutline;
  uniform vec3 uBright;
  uniform vec3 uShadow;
  uniform vec3 uOutlineColor;
  uniform vec3 uViewLight;
  uniform vec2 uTerminator;
  uniform vec2 uRimEdges;
  uniform float uRimStrength;
  void main() {
    if (uOutline > 0.0) {
      gl_FragColor = vec4(uOutlineColor, 1.0);
      return;
    }
    vec3 n = normalize(vViewNormal);
    float d = dot(n, normalize(uViewLight));
    float shade = smoothstep(uTerminator.x, uTerminator.y, d);
    vec3 col = mix(uShadow, uBright, shade);
    col += smoothstep(uRimEdges.x, uRimEdges.y, 1.0 - abs(n.z)) * uRimStrength * shade;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createStandardSkinMaterials(THREE, options = {}) {
  const style = {...STANDARD_SKIN, ...options};
  const palette = Array.from({length: STANDARD_SKIN.maxJointsPerPart}, () => new THREE.Matrix4());
  const baseUniforms = () => ({
    uSkin: {value: palette.map(m => m.clone())},
    uVertexUnit: {value: style.vertexUnit},
    uBright: {value: new THREE.Vector3(...style.bright)},
    uShadow: {value: new THREE.Vector3(...style.shadow)},
    uOutlineColor: {value: new THREE.Vector3(...style.outline)},
    uViewLight: {value: new THREE.Vector3(...style.viewLight)},
    uTerminator: {value: new THREE.Vector2(...style.terminator)},
    uRimEdges: {value: new THREE.Vector2(style.rimStart, style.rimEnd)},
    uRimStrength: {value: style.rimStrength},
  });
  const solid = new THREE.ShaderMaterial({
    uniforms: {...baseUniforms(), uOutline: {value: 0}},
    vertexShader, fragmentShader, side: THREE.DoubleSide, depthTest: true, depthWrite: true
  });
  const hull = new THREE.ShaderMaterial({
    uniforms: {...baseUniforms(), uOutline: {value: style.outlineThickness}},
    vertexShader, fragmentShader, side: THREE.BackSide, depthTest: true, depthWrite: false
  });
  function updateSkin(matrices) {
    if (matrices.length > STANDARD_SKIN.maxJointsPerPart) {
      throw new RangeError('Skin palette exceeds 16 joints');
    }
    for (const material of [solid, hull]) {
      const target = material.uniforms.uSkin.value;
      matrices.forEach((matrix, i) => target[i].copy(matrix));
      material.uniformsNeedUpdate = true;
    }
  }
  return {solid, outline: hull, updateSkin, dispose() {solid.dispose();hull.dispose();}};
}
