import {createViewport, loadGraphics} from './viewport.js';

const field = id => document.getElementById(id);
const status = field('status');
const reference = new URL('../../assets/kael-cutstone-v7.glb.gz', import.meta.url);

function dispose(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of [node.material].flat().filter(Boolean)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const resource of [...geometries, ...materials, ...textures]) resource.dispose();
  root.removeFromParent();
}

async function start() {
  const {T, GLTFLoader} = await loadGraphics();
  const viewport = createViewport(T, document.querySelector('canvas'));
  const loader = new GLTFLoader();
  const objects = {model:null, collision:null};
  const revision = {model:0, collision:0};
  const bounds = new T.Box3();
  const outline = new T.Box3Helper(bounds, 0xeab782);
  outline.visible = false;
  viewport.scene.add(outline);

  function report() {
    const model = objects.model;
    if (!model) return;
    const size = bounds.getSize(new T.Vector3()).toArray().map(value => value.toFixed(2)).join(' × ');
    const collision = objects.collision ? ' · 충돌 ' + objects.collision.name : '';
    status.textContent = model.name + ' · ' + size + ' m · ' + model.triangles + ' 삼각형' + collision;
  }

  function clear(kind) {
    if (objects[kind]) dispose(objects[kind].root);
    objects[kind] = null;
  }

  async function load(kind, name, response) {
    const current = ++revision[kind], oldCollision = revision.collision;
    let root;
    try {
      const input = await response;
      if (!input.ok || !input.body) throw new Error('HTTP ' + input.status);
      const stream = name.endsWith('.gz') ? input.body.pipeThrough(new DecompressionStream('gzip')) : input.body;
      const buffer = await new Response(stream).arrayBuffer();
      if (buffer.byteLength < 12 || new DataView(buffer).getUint32(0,true) !== 0x46546c67) {
        throw new Error('유효한 GLB 파일이 아니야');
      }
      const {scene} = await loader.parseAsync(buffer, '');
      root = scene;
      const extent = new T.Box3().setFromObject(root);
      if (extent.isEmpty() || ![...extent.min.toArray(), ...extent.max.toArray()].every(Number.isFinite)) {
        throw new Error('모델 범위를 계산할 수 없어');
      }
      if (current !== revision[kind]) {
        dispose(root);
        return;
      }
      let triangles = 0;
      root.traverse(node => {
        if (node.isMesh) triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count)/3;
      });
      if (kind === 'collision') {
        const wire = new T.MeshBasicMaterial({color:0x83f0d6, wireframe:true, depthTest:false});
        const before = [];
        root.traverse(node => {
          if (node.isMesh) {
            before.push({material:node.material});
            node.material = wire;
            node.renderOrder = 2;
          }
        });
        dispose({traverse:visit => before.forEach(visit), removeFromParent() {}});
      }
      clear(kind);
      if (kind === 'model' && oldCollision === revision.collision) {
        revision.collision++;
        clear('collision');
        field('collision').value = '';
      }
      objects[kind] = {name, root, triangles};
      viewport.scene.add(root);
      if (kind === 'model') {
        bounds.copy(extent);
        viewport.frame(bounds);
      } else viewport.render();
      report();
    } catch (error) {
      if (root) dispose(root);
      if (current === revision[kind]) {
        status.textContent = (kind === 'model' ? '모델' : '충돌 모델') + '을 열 수 없어. ' + error.message;
      }
    }
  }

  for (const kind of ['model','collision']) {
    field(kind).addEventListener('change', ({target}) => {
      const file = target.files[0];
      if (file) load(kind, file.name, new Response(file));
    });
  }
  field('bounds').addEventListener('change', event => {
    outline.visible = event.target.checked;
    viewport.render();
  });
  await load('model', 'kael-cutstone-v7.glb.gz', fetch(reference));
}

start().catch(error => { status.textContent = '스튜디오를 열 수 없어. ' + error.message; });
