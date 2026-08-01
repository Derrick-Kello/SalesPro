import { CloudOff, RefreshCw, TriangleAlert, Wifi } from 'lucide-react'
import useOnlineStatus from '../hooks/useOnlineStatus'
import { useSync } from '../offline/SyncProvider'
import { useCurrency } from '../context/CurrencyContext'

const chip = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12.5,
  fontWeight: 600,
  padding: '5px 10px',
  borderRadius: 999,
  border: '1.5px solid transparent',
  whiteSpace: 'nowrap',
}

/**
 * Connection + unsynced-sale indicator.
 *
 * Deliberately always visible when anything is queued: money taken at the till
 * that the server has not acknowledged is exactly the state a cashier must not
 * be able to overlook.
 */
export default function OfflineStatus({ onOpenQueue }) {
  const online = useOnlineStatus()
  const { pending, failed, value, syncing, syncNow } = useSync()
  const { fmt } = useCurrency()

  const clickable = Boolean(onOpenQueue) && (pending > 0 || failed > 0)

  if (online && !pending && !failed) {
    return (
      <span style={{ ...chip, color: 'var(--text-muted)' }} title="Connected — sales save straight to the server">
        <Wifi size={14} strokeWidth={2.2} /> Online
      </span>
    )
  }

  const danger = failed > 0
  const colour = danger ? 'var(--danger)' : !online ? 'var(--warning)' : 'var(--primary)'
  const bg = danger ? 'var(--danger-light)' : !online ? 'var(--warning-light)' : 'var(--primary-light)'

  const label = []
  if (!online) label.push('Offline')
  if (pending) label.push(`${pending} unsynced`)
  if (failed) label.push(`${failed} need${failed === 1 ? 's' : ''} attention`)

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button
        type="button"
        onClick={clickable ? onOpenQueue : undefined}
        title={
          pending
            ? `${pending} sale(s) worth ${fmt(value)} saved on this device, not yet on the server`
            : 'Working offline — sales are saved on this device'
        }
        style={{
          ...chip,
          color: colour,
          background: bg,
          borderColor: colour,
          cursor: clickable ? 'pointer' : 'default',
          fontFamily: 'inherit',
        }}
      >
        {danger ? <TriangleAlert size={14} strokeWidth={2.2} /> : <CloudOff size={14} strokeWidth={2.2} />}
        {label.join(' · ')}
      </button>

      {online && (pending > 0 || failed > 0) && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={syncNow}
          disabled={syncing}
          title="Push queued sales to the server now"
        >
          <RefreshCw
            size={13}
            strokeWidth={2.2}
            style={syncing ? { animation: 'spin 1s linear infinite' } : undefined}
          />
          {syncing ? 'Syncing…' : 'Sync'}
        </button>
      )}
    </span>
  )
}
