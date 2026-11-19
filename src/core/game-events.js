// Session-only notifications. Actions must commit state before emitting events.
export function createGameEvents({onError = error => console.error('[GameEvents]', error)} = {}) {
  const listeners = new Map();
  const valid = type => typeof type === 'string' && type.trim().length > 0;
  return {
    on(type, handler) {
      if (!valid(type)) throw new TypeError('Event type must be a non-empty string');
      if (typeof handler !== 'function') throw new TypeError('Event handler must be a function');
      if (!listeners.has(type)) listeners.set(type, new Set());
      const set = listeners.get(type);
      set.add(handler);
      return () => {
        set.delete(handler);
        if (!set.size && listeners.get(type) === set) listeners.delete(type);
      };
    },
    emit(type, detail) {
      if (!valid(type)) throw new TypeError('Event type must be a non-empty string');
      const handlers = [...(listeners.get(type) || [])];
      for (const handler of handlers) {
        try { handler(detail); }
        catch (error) { onError(error); }
      }
      return handlers.length;
    }
  };
}
