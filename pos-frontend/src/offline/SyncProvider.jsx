import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { syncQueue } from './saleQueue'
import { queueCounts } from './db'
import { bumpQueueVersion, subscribeQueue } from './queueEvents'
import { subscribe as subscribeConnectivity, isOnline } from './connectivity'
import { useAuth } from '../context/AuthContext'

const SyncContext = createContext(null)

/** Retry pacing while sales are stuck in the queue. */
const RETRY_MS = 30_000

/**
 * Drives replay of offline sales.
 *
 * Runs a sync when the connection returns, when a sale is queued, and on a slow
 * timer while anything is still pending. Only one pass runs at a time — sales
 * decrement shared stock, so overlapping passes could race for the last units.
 */
export function SyncProvider({ children }) {
  const { token } = useAuth()
  const [counts, setCounts] = useState({ total: 0, pending: 0, failed: 0, value: 0 })
  const [syncing, setSyncing] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const running = useRef(false)

  const refreshCounts = useCallback(async () => {
    try { setCounts(await queueCounts()) } catch { /* storage unavailable */ }
  }, [])

  const runSync = useCallback(async () => {
    // Never replay without a session — the POST would 401 and park good sales
    // as permanently failed.
    if (running.current || !isOnline() || !token) return
    const { pending } = await queueCounts().catch(() => ({ pending: 0 }))
    if (!pending) { await refreshCounts(); return }

    running.current = true
    setSyncing(true)
    try {
      const result = await syncQueue()
      setLastResult({ ...result, at: new Date().toISOString() })
    } catch { /* surfaced through counts */ } finally {
      running.current = false
      setSyncing(false)
      await refreshCounts()
      bumpQueueVersion()
    }
  }, [refreshCounts, token])

  useEffect(() => { refreshCounts() }, [refreshCounts])
  useEffect(() => subscribeQueue(() => refreshCounts()), [refreshCounts])

  // Connection came back — drain the queue.
  useEffect(() => subscribeConnectivity((online) => { if (online) runSync() }), [runSync])

  // A sale was just queued, or a previous pass left work behind.
  useEffect(() => {
    if (!counts.pending) return undefined
    const id = setInterval(runSync, RETRY_MS)
    return () => clearInterval(id)
  }, [counts.pending, runSync])

  useEffect(() => { if (token) runSync() }, [token, runSync])

  return (
    <SyncContext.Provider
      value={{ ...counts, syncing, lastResult, syncNow: runSync, refreshCounts }}
    >
      {children}
    </SyncContext.Provider>
  )
}

export function useSync() {
  return useContext(SyncContext) ?? {
    total: 0, pending: 0, failed: 0, value: 0,
    syncing: false, lastResult: null,
    syncNow: () => {}, refreshCounts: () => {},
  }
}
