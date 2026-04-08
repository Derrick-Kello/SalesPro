// Simple in-memory TTL cache shared across routes
const store = new Map();
const TTL = 60_000; // 60 seconds

function get(key) {
  const hit = store.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;
  return null;
}

function set(key, data) {
  store.set(key, { data, ts: Date.now() });
}

function invalidate(prefix) {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

module.exports = { get, set, invalidate };
