// Region-scoped live entities. Keeps inactive region state, not scene instances, in the save.
// Call unmount() after the caller has disposed a suspended region's actual 3D resources.
export function createRegionLifecycle({registry, save, events} = {}) {
  if (!registry || !save) throw new TypeError('Region lifecycle requires registry and save');
  const regions = new Map();
  const valid = id => typeof id === 'string' && !!id && id !== '__proto__';
  const copy = value => JSON.parse(JSON.stringify(value));
  const savedRegion = id => {
    const root = save.data.regionEntities;
    return root && typeof root === 'object' && !Array.isArray(root) &&
      Object.hasOwn(root, id) && root[id] && typeof root[id] === 'object' ? root[id] : null;
  };
  function mount(id, descriptions) {
    if (!valid(id) || !Array.isArray(descriptions)) throw new TypeError('Invalid region or entries');
    if (regions.has(id)) throw new Error('Region already mounted: ' + id);
    const ids = new Set();
    const entries = descriptions.map(entry => {
      if (!entry || !valid(entry.id) || !valid(entry.kind) || entry.ref == null || ids.has(entry.id) ||
          (entry.getState && typeof entry.getState !== 'function') ||
          (entry.setState && typeof entry.setState !== 'function') ||
          (!!entry.getState !== !!entry.setState) ||
          (entry.setActive && typeof entry.setActive !== 'function'))
        throw new TypeError('Invalid or duplicate region entity');
      if (registry.get(entry.id)) throw new Error('Entity already registered: ' + entry.id);
      ids.add(entry.id);
      return {...entry, baseline: entry.getState ? copy(entry.getState()) : null};
    });
    const state = savedRegion(id);
    const registered = [];
    try {
      for (const e of entries) {
        if (state && Object.hasOwn(state, e.id) && e.setState) e.setState(copy(state[e.id]));
        registry.register({id:e.id,kind:e.kind,region:id,ref:e.ref});
        registered.push(e.id);
      }
    } catch (error) {
      for (const eid of registered) registry.remove(eid);
      throw error;
    }
    regions.set(id,{entries,active:true});
    events?.emit('region.activated',{region:id,count:entries.length});
    return entries.length;
  }
  function checkpoint(id) {
    const region = regions.get(id);
    if (!region || !region.active) return false;
    const prior = savedRegion(id);
    const changes = Object.assign(Object.create(null),prior || {});
    for (const e of region.entries) if (e.getState) {
      const current = copy(e.getState());
      if (JSON.stringify(current) === JSON.stringify(e.baseline)) delete changes[e.id];
      else changes[e.id] = current;
    }
    if (Object.keys(changes).length) {
      if (!save.data.regionEntities || typeof save.data.regionEntities !== 'object' ||
          Array.isArray(save.data.regionEntities)) save.data.regionEntities = {};
      Object.defineProperty(save.data.regionEntities,id,{value:changes,writable:true,configurable:true,enumerable:true});
    } else if (save.data.regionEntities) {
      delete save.data.regionEntities[id];
      if (!Object.keys(save.data.regionEntities).length) delete save.data.regionEntities;
    }
    return true;
  }
  function checkpointActive() {
    for (const [id,region] of regions) if (region.active) checkpoint(id);
  }
  function suspend(id) {
    const region = regions.get(id);
    if (!region || !region.active) return false;
    checkpoint(id);
    region.active = false;
    for (const e of region.entries) {
      registry.remove(e.id);
      e.setActive?.(false);
    }
    save.write?.();
    events?.emit('region.suspended',{region:id,count:region.entries.length});
    return true;
  }
  function resume(id) {
    const region = regions.get(id);
    if (!region || region.active) return false;
    const registered = [];
    try {
      for (const e of region.entries) {
        registry.register({id:e.id,kind:e.kind,region:id,ref:e.ref});
        registered.push(e.id);
      }
    } catch (error) {
      for (const eid of registered) registry.remove(eid);
      throw error;
    }
    const state = savedRegion(id);
    for (const e of region.entries) {
      if (state && Object.hasOwn(state,e.id) && e.setState) e.setState(copy(state[e.id]));
      e.setActive?.(true);
    }
    region.active = true;
    events?.emit('region.activated',{region:id,count:region.entries.length});
    return true;
  }
  function unmount(id) {
    const region = regions.get(id);
    if (!region) return false;
    if (region.active) suspend(id);
    regions.delete(id);
    events?.emit('region.unmounted',{region:id});
    return true;
  }
  return {
    mount, checkpoint, checkpointActive, suspend, resume, unmount,
    isActive(id) {return regions.get(id)?.active === true;},
    isMounted(id) {return regions.has(id);}
  };
}
