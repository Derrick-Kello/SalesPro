/**
 * Connectivity state for the till.
 *
 * `navigator.onLine` only says whether the device has *a* network — it happily
 * reports true behind a captive portal or when the backend is down, which is
 * exactly when a cashier would lose a sale. So the source of truth is what the
 * API client actually observes, with the browser events as hints.
 */

let online = typeof navigator === 'undefined' ? true : navigator.onLine !== false
const listeners = new Set()

function emit() {
  for (const fn of listeners) {
    try { fn(online) } catch { /* a bad listener must not break the till */ }
  }
}

export function isOnline() {
  return online
}

export function subscribe(fn) {
  listeners.add(fn)
  fn(online)
  return () => listeners.delete(fn)
}

/** Called by the API client when a request completes without a network error. */
export function reportReachable() {
  if (!online) {
    online = true
    emit()
  }
}

/** Called by the API client when fetch itself throws (server unreachable). */
export function reportUnreachable() {
  if (online) {
    online = false
    emit()
  }
}

if (typeof window !== 'undefined') {
  // The browser losing its network is definitive; regaining it only means we
  // should re-test, so let the next real request confirm.
  window.addEventListener('offline', reportUnreachable)
  window.addEventListener('online', () => {
    if (navigator.onLine) reportReachable()
  })
}
