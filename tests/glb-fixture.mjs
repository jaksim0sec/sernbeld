export function triangleGlb(width, height, transform = {}) {
  const document = {
    asset:{version:'2.0'}, scene:0, scenes:[{nodes:[0]}], nodes:[{mesh:0,...transform}],
    meshes:[{primitives:[{attributes:{POSITION:0}}]}],
    buffers:[{byteLength:36}], bufferViews:[{buffer:0,byteLength:36,target:34962}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[width,height,0]}]
  };
  const json = Buffer.from(JSON.stringify(document));
  const aligned = Math.ceil(json.length / 4) * 4;
  const glb = Buffer.alloc(28 + aligned + 36, 0x20);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(aligned, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  json.copy(glb, 20);
  glb.writeUInt32LE(36, 20 + aligned);
  glb.writeUInt32LE(0x004e4942, 24 + aligned);
  [0,0,0, width,0,0, 0,height,0].forEach((v,i) => glb.writeFloatLE(v, 28 + aligned + i*4));
  return glb;
}
