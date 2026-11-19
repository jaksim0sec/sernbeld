// Live entity directory; persistent state belongs to the save system, not here.
export function createEntityRegistry() {
  const entries = new Map();
  return {
    register({id, kind, region, ref}) {
      if (typeof id !== 'string' || !id || typeof kind !== 'string' || !kind ||
          typeof region !== 'string' || !region || ref == null)
        throw new TypeError('Entity requires id, kind, region and ref');
      if (entries.has(id)) throw new Error('Duplicate entity ID: ' + id);
      const record = {id, kind, region, ref};
      entries.set(id, record);
      return record;
    },
    get(id) { return entries.get(id) ?? null; },
    remove(id) { return entries.delete(id); },
    removeRegion(region) {
      let count = 0;
      for (const [id, record] of entries) if (record.region === region) {
        entries.delete(id);
        count++;
      }
      return count;
    },
    list({region, kind} = {}) {
      return [...entries.values()].filter(record =>
        (region === undefined || record.region === region) &&
        (kind === undefined || record.kind === kind));
    }
  };
}
