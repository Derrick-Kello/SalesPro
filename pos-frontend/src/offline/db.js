/**
 * IndexedDB store backing offline mode.
 *
 * Two object stores:
 *  - `queue`     sales rung up with no connection, awaiting sync. This is the
 *                only record of that money until it reaches the server, so
 *                nothing in here is ever dropped without an explicit decision.
 *  - `refcache`  last good copy of read-only reference data (products,
 *                customers, tags) plus the time it was fetched, so the UI can
 *                say how stale it is.
 *
 * Written against the raw IndexedDB API rather than a wrapper — the surface
 * used here is small and it keeps the till free of another dependency.
 */

const DB_NAME = 'salespro-offline'
const DB_VERSION = 1
export const QUEUE_STORE = 'queue'
export const REF_STORE = 'refcache'

/** Queued sale lifecycle. `failed` means the server rejected it — needs a human. */
export const QUEUED = 'queued'
export const SYNCING = 'syncing'
export const FAILED = 'failed'

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser has no IndexedDB — offline mode is unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const store = db.createObjectStore(QUEUE_STORE, { keyPath: 'clientRef' })
        store.createIndex('status', 'status', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(REF_STORE)) {
        db.createObjectStore(REF_STORE, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('Could not open offline storage'))
  })
  return dbPromise
}

function tx(store, mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        t.oncomplete = () => resolve(req ? req.result : undefined)
        t.onerror = () => reject(t.error || new Error('Offline storage write failed'))
        t.onabort = () => reject(t.error || new Error('Offline storage transaction aborted'))
      }),
  )
}

/** Crypto-strong id; matches the backend's CLIENT_REF_RE. */
export function newClientRef() {
  const uuid =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
  return `off-${uuid}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
}

// ── Queued sales ────────────────────────────────────────────────────────────

export async function enqueueSale(entry) {
  await tx(QUEUE_STORE, 'readwrite', (s) => s.put(entry))
  return entry
}

export function getQueuedSale(clientRef) {
  return tx(QUEUE_STORE, 'readonly', (s) => s.get(clientRef))
}

export function allQueuedSales() {
  return tx(QUEUE_STORE, 'readonly', (s) => s.getAll()).then((rows) =>
    (rows || []).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
  )
}

/** Merge fields into a queued sale. No-op if it is already gone. */
export async function updateQueuedSale(clientRef, patch) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(QUEUE_STORE, 'readwrite')
    const store = t.objectStore(QUEUE_STORE)
    const get = store.get(clientRef)
    get.onsuccess = () => {
      const current = get.result
      if (!current) return
      store.put({ ...current, ...patch })
    }
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}

export function removeQueuedSale(clientRef) {
  return tx(QUEUE_STORE, 'readwrite', (s) => s.delete(clientRef))
}

export async function queueCounts() {
  const rows = await allQueuedSales()
  return {
    total: rows.length,
    pending: rows.filter((r) => r.status === QUEUED || r.status === SYNCING).length,
    failed: rows.filter((r) => r.status === FAILED).length,
    value: rows
      .filter((r) => r.status !== FAILED)
      .reduce((sum, r) => sum + (Number(r.grandTotal) || 0), 0),
  }
}

// ── Reference data cache ────────────────────────────────────────────────────

export function putRef(key, data) {
  return tx(REF_STORE, 'readwrite', (s) => s.put({ key, data, cachedAt: new Date().toISOString() }))
}

export function getRef(key) {
  return tx(REF_STORE, 'readonly', (s) => s.get(key))
}

export async function clearRefCache() {
  await tx(REF_STORE, 'readwrite', (s) => s.clear())
}
