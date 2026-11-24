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

// Art-unapproved, deformable regression fixtures: derive two sleeve lengths
// from the approved reference, but bind them independently through the generic
// binder. No production registration, original mesh edit or bake reuse.
import {SHIRT_BINDING_POLICY} from '../../src/entities/character/clothing/shirt-binding.js';
const sleevePolicy={regions:SHIRT_BINDING_POLICY.regions,guide:SHIRT_BINDING_POLICY.guide,constrain:SHIRT_BINDING_POLICY.constrain,fit:SHIRT_BINDING_POLICY.fit,smoothing:10,gradientLimit:16,maxInfluences:8};
function sleeveAsset(source,maxElbow){
 const map=new Map(),position=[],normal=[],influence=[],indices=[];
 const eligible=i=>source.influence[i*4+3]===1&&source.influence[i*4+1]<=maxElbow;
 function add(i){if(map.has(i))return map.get(i);const j=map.size;map.set(i,j);position.push(...source.position.subarray(i*3,i*3+3));normal.push(...source.normal.subarray(i*3,i*3+3));influence.push(...source.influence.subarray(i*4,i*4+4));return j;}
 for(let k=0;k<source.index.length;k+=3){const tri=[source.index[k],source.index[k+1],source.index[k+2]];if(tri.every(eligible))indices.push(...tri.map(add));}
 if(!indices.length)throw Error('Sleeve fixture has no triangles');
 return {position:Float32Array.from(position),normal:Float32Array.from(normal),influence:Uint8Array.from(influence),index:Uint16Array.from(indices)};
}
for(const [id,name,length,color] of [['top.preview-long-sleeves','시험용 긴 소매',255,0x50665b],['top.preview-short-sleeves','시험용 짧은 소매',160,0x977a57]]){
 registerClothing({id,slot:'top',name,validation:{minBones:2},build(T,actor,fullIndex){
  const asset=sleeveAsset(actor.shirtAsset,length);const lease=acquireGarmentBinding(T,actor,asset,sleevePolicy,fullIndex);
  return createGarmentPart(T,actor,lease,'main',(uniforms,skin)=>new T.ShaderMaterial({uniforms:{...uniforms,uColor:{value:new T.Color(color)}},side:T.DoubleSide,vertexShader:skin+' varying vec3 n; void main(){vec3 p,v;garmentPose(p,v);n=normalize(normalMatrix*v);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',fragmentShader:'uniform vec3 uColor; varying vec3 n; void main(){gl_FragColor=vec4(uColor*(.55+.45*abs(n.y)),1.);}' }));
 }});
}
