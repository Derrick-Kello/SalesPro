/**
 * Tiny pub/sub so anything showing the pending-sale count refreshes the moment
 * the queue changes, instead of polling IndexedDB on a timer.
 */
let version = 0
const listeners = new Set()

export function bumpQueueVersion() {
  version++
  for (const fn of listeners) {
    try { fn(version) } catch { /* ignore */ }
  }
}

export function subscribeQueue(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function queueVersion() {
  return version
}
