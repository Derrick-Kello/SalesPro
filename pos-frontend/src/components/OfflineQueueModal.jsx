import { useCallback, useEffect, useState } from 'react'
import { CloudOff, RefreshCw, Trash2, TriangleAlert } from 'lucide-react'
import Modal from './Modal'
import { allQueuedSales, FAILED } from '../offline/db'
import { discardQueued, retryFailed } from '../offline/saleQueue'
import { bumpQueueVersion, subscribeQueue } from '../offline/queueEvents'
import { useSync } from '../offline/SyncProvider'
import { useCurrency } from '../context/CurrencyContext'
import { useAlert } from '../context/AlertContext'
import { fmtDateTime } from '../utils/dateFormat'

/**
 * Reconciliation view for sales that were taken at the till but are not on the
 * server yet.
 *
 * Discarding is intentionally a two-step confirmation: the cash was already
 * collected, so throwing the record away loses the only trace of it.
 */
export default function OfflineQueueModal({ open, onClose }) {
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState('')
  const { syncing, syncNow } = useSync()
  const { fmt } = useCurrency()
  const { showError, showSuccess } = useAlert()

  const load = useCallback(async () => {
    try { setRows(await allQueuedSales()) } catch (err) { showError(err.message) }
  }, [showError])

  useEffect(() => { if (open) load() }, [open, load])
  useEffect(() => subscribeQueue(load), [load])

  async function onRetry(clientRef) {
    setBusy(clientRef)
    try {
      const { outcome, error } = await retryFailed(clientRef)
      if (outcome === 'synced' || outcome === 'duplicate') showSuccess('Sale synced to the server.')
      else if (outcome === 'retry') showError('Still no connection to the server.')
      else showError(error?.message || 'The server rejected this sale again.')
    } finally {
      setBusy('')
      bumpQueueVersion()
      load()
    }
  }

  async function onDiscard(clientRef) {
    setBusy(clientRef)
    try {
      await discardQueued(clientRef)
      showSuccess('Queued sale discarded.')
    } catch (err) {
      showError(err.message)
    } finally {
      setBusy('')
      setConfirmDiscard('')
      bumpQueueVersion()
      load()
    }
  }

  if (!open) return null

  const pending = rows.filter((r) => r.status !== FAILED)
  const failed = rows.filter((r) => r.status === FAILED)

  return (
    <Modal onClose={onClose} title="Offline sales">
      <div style={{ minWidth: 'min(760px, 82vw)', maxHeight: '70vh', overflowY: 'auto' }}>
        {!rows.length && (
          <p style={{ color: 'var(--text-muted)', padding: '24px 0', textAlign: 'center' }}>
            Nothing waiting — every sale on this device has reached the server.
          </p>
        )}

        {failed.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <TriangleAlert size={16} strokeWidth={2.2} color="var(--danger)" />
              Rejected by the server ({failed.length})
            </h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
              The money was collected at the till but the server refused the sale — usually because
              stock ran out while this device was offline. Fix the cause (restock, adjust inventory)
              then retry, or discard if the sale was reversed and the customer refunded.
            </p>
            {failed.map((r) => (
              <QueueRow
                key={r.clientRef}
                row={r}
                fmt={fmt}
                busy={busy === r.clientRef}
                confirming={confirmDiscard === r.clientRef}
                onRetry={() => onRetry(r.clientRef)}
                onAskDiscard={() => setConfirmDiscard(r.clientRef)}
                onCancelDiscard={() => setConfirmDiscard('')}
                onDiscard={() => onDiscard(r.clientRef)}
                danger
              />
            ))}
          </section>
        )}

        {pending.length > 0 && (
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CloudOff size={16} strokeWidth={2.2} color="var(--warning)" />
                Waiting to sync ({pending.length})
              </h3>
              <button type="button" className="btn btn-outline btn-sm" onClick={syncNow} disabled={syncing}>
                <RefreshCw size={13} strokeWidth={2.2} /> {syncing ? 'Syncing…' : 'Sync now'}
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
              Saved on this device. They upload automatically when the connection returns — keep this
              device powered on and signed in until the list is empty.
            </p>
            {pending.map((r) => (
              <QueueRow
                key={r.clientRef}
                row={r}
                fmt={fmt}
                busy={busy === r.clientRef}
                confirming={confirmDiscard === r.clientRef}
                onAskDiscard={() => setConfirmDiscard(r.clientRef)}
                onCancelDiscard={() => setConfirmDiscard('')}
                onDiscard={() => onDiscard(r.clientRef)}
              />
            ))}
          </section>
        )}
      </div>
    </Modal>
  )
}

function QueueRow({ row, fmt, busy, confirming, onRetry, onAskDiscard, onCancelDiscard, onDiscard, danger }) {
  const items = row.payload?.items || []
  const pieces = items.reduce((s, i) => s + Number(i.quantity || 0), 0)

  return (
    <div
      style={{
        border: `1px solid ${danger ? 'var(--danger)' : 'var(--border)'}`,
        background: danger ? 'var(--danger-light)' : 'var(--surface)',
        borderRadius: 10,
        padding: '10px 12px',
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>
            {fmt(row.grandTotal)}{' '}
            <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12.5 }}>
              · {items.length} line{items.length === 1 ? '' : 's'} / {pieces} pc
              {' · '}{(row.payload?.paymentMethod || '').replace(/_/g, ' ').toLowerCase()}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Rung up {fmtDateTime(row.createdAt)} · ref {row.clientRef.slice(-8).toUpperCase()}
            {row.attempts > 0 && ` · ${row.attempts} attempt${row.attempts === 1 ? '' : 's'}`}
          </div>
          {row.lastError && (
            <div style={{ fontSize: 12.5, color: 'var(--danger-dark)', marginTop: 4, fontWeight: 600 }}>
              {row.lastError}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {onRetry && (
            <button type="button" className="btn btn-primary btn-sm" onClick={onRetry} disabled={busy}>
              <RefreshCw size={13} strokeWidth={2.2} /> Retry
            </button>
          )}
          {confirming ? (
            <>
              <button type="button" className="btn btn-danger btn-sm" onClick={onDiscard} disabled={busy}>
                Discard for good
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelDiscard} disabled={busy}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onAskDiscard} disabled={busy}>
              <Trash2 size={13} strokeWidth={2.2} /> Discard
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
