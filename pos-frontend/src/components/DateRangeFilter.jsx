/**
 * DateRangeFilter — unified date range picker with quick-select presets.
 *
 * Preset buttons: Today · Yesterday · This Week · Last Month · Last Year
 * Auto-fires onChange(startDate, endDate) when both values are complete
 * (full YYYY-MM-DD) or when both are cleared. No separate Filter button needed.
 */
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

// ── helpers ───────────────────────────────────────────────────────────────────
function toYMD(d) {
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const dd   = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function getPresetRange(preset) {
  const now   = new Date()
  const today = toYMD(now)
  switch (preset) {
    case 'today':
      return { start: today, end: today }
    case 'yesterday': {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      const ymd = toYMD(y)
      return { start: ymd, end: ymd }
    }
    case 'this-week': {
      const dow = now.getDay()          // 0 = Sun
      const mon = new Date(now)
      mon.setDate(now.getDate() - ((dow + 6) % 7))
      mon.setHours(0, 0, 0, 0)
      return { start: toYMD(mon), end: today }
    }
    case 'last-month': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last  = new Date(now.getFullYear(), now.getMonth(), 0)
      return { start: toYMD(first), end: toYMD(last) }
    }
    case 'last-year': {
      const y = now.getFullYear() - 1
      return { start: `${y}-01-01`, end: `${y}-12-31` }
    }
    default:
      return null
  }
}

const PRESETS = [
  { id: 'today',      label: 'Today' },
  { id: 'yesterday',  label: 'Yesterday' },
  { id: 'this-week',  label: 'This Week' },
  { id: 'last-month', label: 'Last Month' },
  { id: 'last-year',  label: 'Last Year' },
]

// ── component ─────────────────────────────────────────────────────────────────
export default function DateRangeFilter({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  onChange,
  loading = false,
}) {
  // Track which preset the user last explicitly clicked — never inferred from dates.
  // Reset to null when the user edits the inputs manually or clears.
  const [activePreset, setActivePreset] = useState(null)

  // Track the last dispatched pair so the useEffect never double-fires
  const lastFiredRef = useRef({ start: null, end: null })

  function isComplete(v) {
    return v === '' || v.length === 10
  }

  function fire(s, e) {
    if (lastFiredRef.current.start === s && lastFiredRef.current.end === e) return
    lastFiredRef.current = { start: s, end: e }
    onChange?.(s, e)
  }

  // Auto-fire when user edits the date inputs directly (both must be complete)
  useEffect(() => {
    if (!isComplete(startDate) || !isComplete(endDate)) return
    fire(startDate, endDate)
  }, [startDate, endDate])

  function applyPreset(id) {
    const r = getPresetRange(id)
    if (!r) return
    setActivePreset(id)
    onStartChange?.(r.start)
    onEndChange?.(r.end)
    fire(r.start, r.end)
  }

  function handleClear() {
    setActivePreset(null)
    onStartChange?.('')
    onEndChange?.('')
    fire('', '')
  }

  // Deactivate preset highlight when user manually changes either date input
  function handleStartChange(val) {
    setActivePreset(null)
    onStartChange?.(val)
  }

  function handleEndChange(val) {
    setActivePreset(null)
    onEndChange?.(val)
  }

  const hasFilter = startDate || endDate

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

      {/* ── Preset buttons ── */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {PRESETS.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => applyPreset(p.id)}
            style={{
              fontSize: 11,
              fontWeight: activePreset === p.id ? 700 : 500,
              padding: '3px 9px',
              borderRadius: 20,
              border: '1px solid',
              borderColor: activePreset === p.id ? 'var(--primary)' : 'var(--border)',
              background: activePreset === p.id ? 'var(--primary)' : 'var(--surface2)',
              color: activePreset === p.id ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ── From → To inputs ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '4px 10px',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', fontWeight: 500 }}>From</span>
          <input
            type="date"
            value={startDate}
            max={endDate || undefined}
            onChange={e => handleStartChange(e.target.value)}
            style={{ border: 'none', background: 'transparent', fontSize: 13, padding: 0, outline: 'none', minWidth: 120, color: 'var(--text)' }}
            aria-label="Start date"
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 2px' }}>→</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', fontWeight: 500 }}>To</span>
          <input
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={e => handleEndChange(e.target.value)}
            style={{ border: 'none', background: 'transparent', fontSize: 13, padding: 0, outline: 'none', minWidth: 120, color: 'var(--text)' }}
            aria-label="End date"
          />
          {hasFilter && (
            <button
              onClick={handleClear}
              title="Clear date filter"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}
              aria-label="Clear date filter"
            >
              <X size={13} strokeWidth={2.5} />
            </button>
          )}
        </div>
        {loading && (
          <span
            className="spin"
            style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid var(--border2)', borderTopColor: 'var(--primary)', borderRadius: '50%', flexShrink: 0 }}
          />
        )}
      </div>
    </div>
  )
}
