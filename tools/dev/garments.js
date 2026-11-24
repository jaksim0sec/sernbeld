import {loadStudioSource, loadStudioLod} from '../../src/entities/character/studio-source.js';
import {createStudioGeometry} from '../../src/entities/character/studio-geometry.js';
import {createStudioModel} from '../../src/entities/character/studio-model.js';
import {normalizeStudioCharacter} from '../../src/entities/character/appearance.js';
import {CLOTHING_SLOTS, getClothing, listClothing} from '../../src/entities/character/clothing/registry.js';
import {poseActor, poses} from './poses.js';
import {createViewport, loadGraphics, workspaceUrl} from './viewport.js';

const field = id => document.getElementById(id);
const status = field('status');
const params = new URLSearchParams(location.search);
const labels = {collar:'카라', top:'상의', vest:'조끼', pants:'바지', shoes:'신발', hat:'모자'};
const controls = new Map();
let actor, baseline;

async function start() {
  const modulePath = params.get('module');
  if (modulePath) {
    await import(workspaceUrl(modulePath, ['tools/dev/', 'src/entities/character/clothing/'], '.js').href);
  }
  const [{T}, source, lod] = await Promise.all([loadGraphics(), loadStudioSource(), loadStudioLod()]);
  const factory = createStudioGeometry({...source, lod,
    defaultShirts:source.defaultShirts, defaultPants:source.defaultPants,
    garmentBakes:source.garmentBakes, garmentLayers:source.garmentLayers});
  const viewport = createViewport(T, document.querySelector('canvas'));
  const profile = () => normalizeStudioCharacter({body:field('body').value});
  const reportError = error => { status.textContent = '의상을 표시할 수 없어. ' + error.message; };
  const reconcile = () => {
    for (const [slot, select] of controls) {
      if (select.value) actor.clothing.equip(select.value);
      else actor.clothing.unequip(slot);
    }
  };

  function update() {
    try {
      reconcile();
      const showBase = field('compare').checked;
      actor.group.position.x = showBase ? -.52 : 0;
      baseline.group.position.x = .52;
      baseline.group.visible = showBase;
      const pose = field('pose').value, level = Number(field('lod').value);
      const names = Object.values(actor.clothing.snapshot()).map(id => getClothing(id).name);
      for (const model of [actor, baseline]) {
        model.setLOD(level);
        model.setFirst(field('first').checked);
        // IK input is authored in actor world space at the origin.
        const x = model.group.position.x;
        model.group.position.x = 0;
        poseActor(T, model, pose);
        model.group.position.x = x;
      }
      viewport.render();
      status.textContent = [
        field('body').selectedOptions[0].textContent, poses[pose], 'LOD '+level,
        names.join(', ') || '장착 없음', showBase ? '오른쪽 기준 인체' : ''
      ].filter(Boolean).join(' · ');
    } catch (error) {
      reportError(error);
    }
  }

  function resetBodies() {
    try {
      actor?.dispose();
      baseline?.dispose();
      actor = createStudioModel(T, factory, profile(), {clothing:false});
      baseline = createStudioModel(T, factory, profile(), {clothing:false});
      viewport.scene.add(actor.group, baseline.group);
      update();
    } catch (error) {
      reportError(error);
    }
  }
  for (const [value, label] of Object.entries(poses)) field('pose').add(new Option(label, value));
  for (const slot of Object.values(CLOTHING_SLOTS)) {
    const label = document.createElement('label');
    const select = document.createElement('select');
    label.append(labels[slot], select);
    select.add(new Option('없음', ''));
    for (const entry of listClothing(slot)) select.add(new Option(entry.name, entry.id));
    controls.set(slot, select);
    field('slots').append(label);
    select.addEventListener('change', update);
  }
  const defaultActor = createStudioModel(T, factory, profile());
  for (const [slot, id] of Object.entries(defaultActor.clothing.snapshot())) controls.get(slot).value = id;
  defaultActor.dispose();

  for (const id of (params.get('wear') ?? '').split(',').filter(Boolean)) {
    const entry = getClothing(id);
    if (!entry) throw new Error('등록을 찾을 수 없어 (' + id + ')');
    controls.get(entry.slot).value = id;
  }
  field('body').addEventListener('change', resetBodies);
  for (const id of ['pose','lod','first','compare']) field(id).addEventListener('change', update);
  viewport.frame(new T.Box3(new T.Vector3(-.95,0,-.4), new T.Vector3(.95,1.85,.4)));
  resetBodies();
}

start().catch(error => { status.textContent = '스튜디오를 열 수 없어. ' + error.message; });
