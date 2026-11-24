// Two development fixtures. Import this module explicitly to register them.
import {registerClothing} from '../../src/entities/character/clothing/registry.js';
import {acquireGarmentBinding} from '../../src/entities/character/clothing/garment-binding.js';
import {createGarmentPart} from '../../src/entities/character/clothing/garment-pose.js';

const rigidHead = {
  constrain(_vertex, _asset, weights, bones) {
    weights.fill(0);
    weights[bones.get('head')] = 1;
    return true;
  },
  fit: () => false
};

function hatDefinition(id, name, top, bottom, height, y, color) {
  return registerClothing({
    id, slot:'hat', name,
    build(T, actor, fullIndex) {
      const shape = new T.CylinderGeometry(top, bottom, height, 24, 1, id === 'hat.preview-crown');
      shape.translate(0, y, actor.data.bones.find(b => b.id === 'head').pivot[2] * actor.units / 1428);
      const asset = {position:shape.attributes.position.array, normal:shape.attributes.normal.array, index:shape.index.array};
      shape.dispose();
      const lease = acquireGarmentBinding(T, actor, asset, rigidHead, fullIndex);
      return createGarmentPart(T, actor, lease, 'main', (uniforms, skin) => new T.ShaderMaterial({
        uniforms:{...uniforms, uColor:{value:new T.Color(color)}},
        side:T.DoubleSide,
        vertexShader:`${skin}
          varying vec3 vNormal;
          void main() {
            vec3 p, n;
            garmentPose(p, n);
            vNormal = normalize(normalMatrix * n);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
          }`,
        fragmentShader:`uniform vec3 uColor;
          varying vec3 vNormal;
          void main() {
            float light = max(0., dot(normalize(vNormal), normalize(vec3(-.5, .7, .5))));
            gl_FragColor = vec4(uColor * (.55 + .45 * light), 1.);
            #include <colorspace_fragment>
          }`
      }));
    }
  });
}

hatDefinition('hat.preview-cap', '시험용 챙모자', .085, .114, .05, 1.772, 0x385565);
hatDefinition('hat.preview-crown', '시험용 머리띠', .102, .111, .025, 1.755, 0x996247);
