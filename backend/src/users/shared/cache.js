// In-memory cache (Lambda container reuse - FREE)
const cache = new Map();
const TTL = 5 * 60 * 1000; // 5 minutes

const set = (key, value, ttl = TTL) => {
  cache.set(key, { value, expires: Date.now() + ttl });
  // Auto-cleanup to prevent memory leaks
  if (cache.size > 1000) {
    const oldestKeys = Array.from(cache.keys()).slice(0, 100);
    oldestKeys.forEach(k => cache.delete(k));
  }
};

const get = (key) => {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expires) {
    cache.delete(key);
    return null;
  }
  return item.value;
};

const del = (key) => cache.delete(key);
const clear = () => cache.clear();

module.exports = { set, get, del, clear };
