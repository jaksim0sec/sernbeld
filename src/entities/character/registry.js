// Public character catalog. Import this file from future character/NPC creation code.
// Merely registering assets must not change currently spawned models in game.js.
import {STANDARD_SKIN, STANDARD_SKIN_ID} from '../../render/materials/standard-skin.js';
import {FEMALE_BASE_ID, FEMALE_BASE_URL, loadFemaleBase} from './female-base.js';

export const DEFAULT_CHARACTER_SKIN = STANDARD_SKIN_ID;
export const CHARACTER_SKINS = Object.freeze({
  [STANDARD_SKIN_ID]: STANDARD_SKIN
});
export const CHARACTER_MODELS = Object.freeze({
  [FEMALE_BASE_ID]: Object.freeze({
    id: FEMALE_BASE_ID,
    label: '여성 기본 인체 v1',
    meshUrl: FEMALE_BASE_URL,
    skinId: STANDARD_SKIN_ID,
    rig: 'custom-47-bone',
    vertexCount: 34812,
    triangleCount: 69556,
    parts: 17
  })
});

export function getCharacterModel(id) { return CHARACTER_MODELS[id] ?? null; }
export function getCharacterSkin(id=DEFAULT_CHARACTER_SKIN) { return CHARACTER_SKINS[id] ?? null; }

export async function loadRegisteredCharacter(THREE, {
  modelId=FEMALE_BASE_ID, skinId=DEFAULT_CHARACTER_SKIN, pose={}, fetchImpl=fetch
}={}) {
  const model=getCharacterModel(modelId);
  if (!model) throw new Error('Unknown character model: '+modelId);
  if (!getCharacterSkin(skinId)) throw new Error('Unknown character skin: '+skinId);
  if (modelId === FEMALE_BASE_ID) return loadFemaleBase(THREE, {fetchImpl,pose});
  throw new Error('No loader for character model: '+modelId);
}
