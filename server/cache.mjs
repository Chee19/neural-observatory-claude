export function createTtlCache({ ttlMs, now = Date.now }) {
  const entries = new Map();

  function getFreshEntry(key) {
    const entry = entries.get(key);
    if (!entry) return null;

    const ageMs = Math.max(0, now() - entry.cachedAt);
    if (ageMs > ttlMs) {
      entries.delete(key);
      return null;
    }

    return {
      value: entry.value,
      cachedAt: entry.cachedAt,
      ageMs,
    };
  }

  return {
    get(key) {
      return getFreshEntry(key);
    },
    set(key, value) {
      entries.set(key, {
        value,
        cachedAt: now(),
      });
    },
    hasFreshEntries() {
      for (const key of entries.keys()) {
        if (getFreshEntry(key)) return true;
      }
      return false;
    },
  };
}
