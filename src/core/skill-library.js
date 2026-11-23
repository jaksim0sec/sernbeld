import {validateSkill} from './skill-engine.js';

// V1 physical configurations stay editable; v2 stores ordered action compositions.
// Unknown saved versions survive intact.
const FREE_ACTOR = Object.freeze({
  stamina: Number.MAX_SAFE_INTEGER, mana: Number.MAX_SAFE_INTEGER,
  maxMana: Number.MAX_SAFE_INTEGER, physicalControl: 3, magicControl: 3
});
const clone = value => JSON.parse(JSON.stringify(value));
const idValid = id => typeof id === 'string' && id.length > 0 && id.length <= 64 && id !== '__proto__';

export function createSkillLibrary(save, events) {
  if (!save || !save.data) throw new TypeError('Skill library requires save');
  const read = () => Array.isArray(save.data.customSkills) ? save.data.customSkills : [];
  const entryAt = id => read().findIndex(entry => entry && entry.id === id);
  return {
    list() { return clone(read()); },
    get(id) { const match = read().find(entry => entry?.id === id); return match ? clone(match) : null; },
    put(entry) {
      if (!entry || !idValid(entry.id) || typeof entry.name !== 'string' ||
          !entry.name.trim() || entry.name.length > 64 || ![1,2].includes(entry.version) ||
          entry.discipline !== 'physical' || entry.config?.discipline !== entry.discipline ||
          !validateSkill(entry.config, FREE_ACTOR).ok ||
          (entry.version === 1 && Object.hasOwn(entry.config,'actions')) ||
          (entry.version === 2 && !Object.hasOwn(entry.config,'actions'))) {
        throw new TypeError('Invalid skill entry');
      }
      const index = entryAt(entry.id);
      if (index !== -1 && ![1,2].includes(read()[index].version)) throw new TypeError('Invalid skill version');
      const record = clone({id: entry.id, name: entry.name, discipline: entry.discipline, version: entry.version, config: entry.config});
      const entries = read().slice();
      if (index === -1) entries.push(record);
      else entries[index] = record;
      save.data.customSkills = entries;
      save.write?.();
      events?.emit('skill.saved', {id:record.id, discipline:record.discipline});
      return clone(record);
    },
    remove(id) {
      const index = entryAt(id);
      if (index < 0) return false;
      const record = read()[index];
      if (![1,2].includes(record.version)) throw new TypeError('Cannot remove unsupported skill version');
      save.data.customSkills = read().filter((_,i)=>i !== index);
      save.write?.();
      events?.emit('skill.removed',{id:record.id,discipline:record.discipline});
      return true;
    }
  };
}
