// Keeps legacy count-based inventory intact; detailed keepsakes live separately.
// The store reads save.data on every call so Save.reset/load don't leave stale refs.
export function createInventory(save, events) {
  const data = () => save.data;
  const validId = id => typeof id === 'string' && id.length > 0 && id !== '__proto__';
  const validQty = qty => Number.isSafeInteger(qty) && qty > 0;
  function stacks() {
    if (!data().inv || typeof data().inv !== 'object' || Array.isArray(data().inv)) data().inv = {};
    return data().inv;
  }
  function uniques() {
    if (!Array.isArray(data().uniqueItems)) data().uniqueItems = [];
    return data().uniqueItems;
  }
  const clone = value => JSON.parse(JSON.stringify(value));
  const committed = (action, itemId, instanceId) => {
    // Detailed-item mutations are standalone operations. Legacy bulk
    // transactions continue to write once in their existing game handlers.
    save.write?.();
    events?.emit('inventory.changed', {action, itemId, quantity: 1, instanceId});
  };
  const notify = (action, itemId, quantity, instanceId = null) =>
    events?.emit('inventory.changed', {action, itemId, quantity, instanceId});
  function nextId() {
    let serial = Number.isSafeInteger(data().nextItemSerial) && data().nextItemSerial > 0 ? data().nextItemSerial : 1;
    const existing = new Set(uniques().map(item => item.id));
    while (existing.has('unique:' + serial)) serial++;
    if (!Number.isSafeInteger(serial + 1)) throw new RangeError('Unique item ID range exhausted');
    data().nextItemSerial = serial + 1;
    return 'unique:' + serial;
  }
  function allocateUnique(itemId, state = {}) {
    if (!validId(itemId)) throw new TypeError('Invalid item ID');
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('Unique state must be an object');
    const snapshot = clone(state);
    const item = {id: nextId(), itemId, state: snapshot};
    uniques().push(item);
    return item;
  }
  function makeUnique(itemId, state = {}) {
    const item = allocateUnique(itemId, state);
    committed('unique-added', itemId, item.id);
    return clone(item);
  }
  const ownCount = itemId => Object.hasOwn(stacks(), itemId) && Number.isSafeInteger(stacks()[itemId]) && stacks()[itemId] > 0 ? stacks()[itemId] : 0;
  return {
    add(itemId, quantity = 1) {
      if (!validId(itemId) || !validQty(quantity)) throw new TypeError('Invalid inventory item ID or quantity');
      const list = stacks();
      const next = ownCount(itemId) + quantity;
      if (!Number.isSafeInteger(next)) throw new RangeError('Inventory quantity overflow');
      Object.defineProperty(list, itemId, {value: next, enumerable: true, configurable: true, writable: true});
      notify('added', itemId, quantity);
      return next;
    },
    take(itemId, quantity) {
      if (!validId(itemId) || !validQty(quantity)) throw new TypeError('Invalid inventory item ID or quantity');
      const list = stacks();
      if (ownCount(itemId) < quantity) return false;
      list[itemId] -= quantity;
      if (list[itemId] === 0) delete list[itemId];
      notify('removed', itemId, quantity);
      return true;
    },
    count(itemId) { return validId(itemId) ? ownCount(itemId) : 0; },
    entries() { return Object.entries(stacks()).filter(([,n]) => Number.isSafeInteger(n) && n > 0); },
    makeUnique,
    getUnique(id) { const item = uniques().find(item => item.id === id); return item ? clone(item) : null; },
    uniqueEntries() { return uniques().map(clone); },
    updateUnique(id, state) {
      if (!state || typeof state !== 'object' || Array.isArray(state))
        throw new TypeError('Unique state patch must be an object');
      const item = uniques().find(entry => entry.id === id);
      if (!item) return null;
      const patch = clone(state);
      item.state = {...item.state, ...patch};
      committed('unique-updated', item.itemId, item.id);
      return clone(item);
    },
    promote(itemId, state = {}) {
      if (!validId(itemId) || ownCount(itemId) < 1) return null;
      // Persist both sides before broadcasting their shared outcome.
      const item = allocateUnique(itemId, state);
      stacks()[itemId]--;
      if (!stacks()[itemId]) delete stacks()[itemId];
      committed('promoted', itemId, item.id);
      return clone(item);
    },
    removeUnique(id) {
      const list = uniques(), index = list.findIndex(item => item.id === id);
      if (index < 0) return false;
      const [item] = list.splice(index, 1);
      committed('unique-removed', item.itemId, id);
      return true;
    }
  };
}
