/**
 * Cached reads for the data the register cannot run without.
 *
 * `cachedGet` returns the live response and refreshes the cache, or falls back
 * to the last good copy when the server is unreachable. Every result carries
 * `{ data, stale, cachedAt }` so the caller can tell the cashier what they are
 * looking at — a silent fallback would let someone sell at last week's price
 * believing it was current.
 */
import { api } from '../api/client'
import { getRef, putRef } from './db'

/**
 * @param key   cache key; include any branch scope so outlets do not share a copy
 * @param path  API path to fetch
 */
export async function cachedGet(key, path) {
  try {
    const data = await api.get(path)
    await putRef(key, data).catch(() => {})
    return { data, stale: false, cachedAt: new Date().toISOString() }
  } catch (err) {
    if (!err.isNetworkError) throw err
    const hit = await getRef(key).catch(() => null)
    if (!hit) throw err
    return { data: hit.data, stale: true, cachedAt: hit.cachedAt }
  }
}

/** Human-readable age of a cached copy, for the staleness warning. */
export function describeAge(cachedAt) {
  if (!cachedAt) return 'unknown age'
  const ms = Date.now() - new Date(cachedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 'unknown age'
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'moments ago'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}
