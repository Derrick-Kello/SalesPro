/**
 * DateRangeFilter — unified date range picker with quick-select presets.
 *
 * Uses <input type="date"> for the calendar picker but hides the browser's
 * format hint text — only the calendar icon is visible.
 *
 * Presets: Today · Yesterday · This Month · Last Month · This Year · Last Year
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
    case 'this-month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      return { start: toYMD(first), end: today }
    }
    case 'last-month': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last  = new Date(now.getFullYear(), now.getMonth(), 0)
      return { start: toYMD(first), end: toYMD(last) }
    }
    case 'this-year':
      return { start: `${now.getFullYear()}-01-01`, end: today }
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
  { id: 'this-month', label: 'This Month' },
  { id: 'last-month', label: 'Last Month' },
  { id: 'this-year',  label: 'This Year' },
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
  const [activePreset, setActivePreset] = useState(null)
  const lastFiredRef = useRef({ start: null, end: null })

  function fire(s, e) {
    if (lastFiredRef.current.start === s && lastFiredRef.current.end === e) return
    lastFiredRef.current = { start: s, end: e }
    onChange?.(s, e)
  }

  useEffect(() => {
    const sOk = !startDate || startDate.length === 10
    const eOk = !endDate   || endDate.length   === 10
    if (!sOk || !eOk) return
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

  function handleStartChange(val) {
    setActivePreset(null)
    onStartChange?.(val)
  }

  function handleEndChange(val) {
    setActivePreset(null)
    onEndChange?.(val)
  }

  const hasFilter = startDate || endDate

  // Shared style: makes the date input show ONLY the calendar icon.
  // We set width to just the icon width and clip the text portion.
  const dateInputStyle = {
    border: 'none',
    background: 'transparent',
    outline: 'none',
    padding: 0,
    margin: 0,
    // Width of just the calendar icon button (~22px) — text part is clipped
    width: 22,
    // Overflow hidden clips the mm/dd/yyyy text
    overflow: 'hidden',
    cursor: 'pointer',
    colorScheme: 'light',
    // Colour scheme so the icon inherits the theme colour
    color: 'var(--text-muted)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

      {/* ── Preset pills ── */}
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

      {/* ── From → To row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '5px 10px',
        }}>

          {/* From */}
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>From</span>
          <span style={{ fontSize: 13, color: startDate ? 'var(--text)' : 'var(--text-muted)', minWidth: 68, whiteSpace: 'nowrap' }}>
            {startDate ? startDate.split('-').reverse().join('/') : 'dd/mm/yyyy'}
          </span>
          <input
            type="date"
            value={startDate}
            max={endDate || undefined}
            onChange={e => handleStartChange(e.target.value)}
            style={dateInputStyle}
            aria-label="Start date"
            title="Pick start date"
          />

          <span style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 2px' }}>→</span>

          {/* To */}
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>To</span>
          <span style={{ fontSize: 13, color: endDate ? 'var(--text)' : 'var(--text-muted)', minWidth: 68, whiteSpace: 'nowrap' }}>
            {endDate ? endDate.split('-').reverse().join('/') : 'dd/mm/yyyy'}
          </span>
          <input
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={e => handleEndChange(e.target.value)}
            style={dateInputStyle}
            aria-label="End date"
            title="Pick end date"
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
