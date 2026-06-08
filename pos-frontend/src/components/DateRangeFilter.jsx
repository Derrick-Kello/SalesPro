/**
 * DateRangeFilter — date range picker with:
 *  - Text input: type in dd/mm/yyyy
 *  - Calendar icon: opens the native date picker
 *  - Quick presets: Today · Yesterday · This Month · Last Month · This Year · Last Year
 *  - Auto-fires onChange when a valid complete range is set
 */
import { useEffect, useRef, useState } from 'react'
import { X, CalendarDays } from 'lucide-react'

// ── helpers ───────────────────────────────────────────────────────────────────

function toYMD(d) {
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const dd   = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** YYYY-MM-DD → dd/mm/yyyy */
function ymdToDmy(ymd) {
  if (!ymd || ymd.length !== 10) return ''
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

/**
 * Parse a dd/mm/yyyy (or dd-mm-yyyy, ddmmyyyy) string into YYYY-MM-DD.
 * Returns '' if incomplete or invalid.
 */
function parseDmy(raw) {
  if (!raw) return ''
  const s = raw.trim()

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // Normalise separators
  const parts = s.replace(/[-\.]/g, '/').split('/')
  if (parts.length === 3) {
    const [d, m, y] = parts
    const dd   = d.padStart(2, '0')
    const mm   = m.padStart(2, '0')
    const yyyy = y.length === 2 ? `20${y}` : y
    if (yyyy.length !== 4) return ''
    const date = new Date(`${yyyy}-${mm}-${dd}`)
    if (isNaN(date.getTime())) return ''
    // Sanity-check the parts round-trip (catches 30/02 etc.)
    if (
      date.getFullYear() !== Number(yyyy) ||
      date.getMonth() + 1 !== Number(mm)  ||
      date.getDate()      !== Number(dd)
    ) return ''
    return `${yyyy}-${mm}-${dd}`
  }

  // 8-digit no separator: ddmmyyyy
  if (/^\d{8}$/.test(s)) {
    const dd   = s.slice(0, 2)
    const mm   = s.slice(2, 4)
    const yyyy = s.slice(4)
    const date = new Date(`${yyyy}-${mm}-${dd}`)
    if (isNaN(date.getTime())) return ''
    return `${yyyy}-${mm}-${dd}`
  }

  return ''
}

// ── presets ───────────────────────────────────────────────────────────────────

function getPresetRange(preset) {
  const now   = new Date()
  const today = toYMD(now)
  switch (preset) {
    case 'today':
      return { start: today, end: today }
    case 'yesterday': {
      const y = new Date(now); y.setDate(y.getDate() - 1)
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
    default: return null
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

// ── DateInput ─────────────────────────────────────────────────────────────────
/**
 * Single date field:
 *  - Visible text input accepts dd/mm/yyyy typing with auto-slash insertion
 *  - Calendar icon button opens a hidden <input type="date"> picker
 *  - Both stay in sync; commits a YYYY-MM-DD string via onCommit
 */
function DateInput({ value, ariaLabel, onCommit, minYmd, maxYmd }) {
  const [text, setText]     = useState(() => ymdToDmy(value) || '')
  const pickerRef           = useRef(null)
  const prevValueRef        = useRef(value)

  // Sync display when parent changes value (preset click, clear, etc.)
  useEffect(() => {
    if (value !== prevValueRef.current) {
      prevValueRef.current = value
      setText(ymdToDmy(value) || '')
    }
  }, [value])

  function handleTextChange(e) {
    let raw = e.target.value

    // Allow only digits and slashes
    raw = raw.replace(/[^\d/]/g, '')

    // Auto-insert slashes
    if (raw.length === 2 && text.length === 1 && !raw.includes('/')) raw += '/'
    if (raw.length === 5 && text.length === 4 && raw.split('/').length === 2) raw += '/'

    if (raw.length > 10) return
    setText(raw)

    if (raw === '') { onCommit(''); return }

    if (raw.length === 10) {
      const ymd = parseDmy(raw)
      if (ymd) onCommit(ymd)
    }
  }

  function handleTextBlur() {
    if (!text) { onCommit(''); return }
    const ymd = parseDmy(text)
    if (ymd) {
      setText(ymdToDmy(ymd))
      onCommit(ymd)
    } else {
      // Revert to last good value
      setText(ymdToDmy(value) || '')
    }
  }

  function handlePickerChange(e) {
    const ymd = e.target.value   // already YYYY-MM-DD
    if (!ymd) { setText(''); onCommit(''); return }
    setText(ymdToDmy(ymd))
    onCommit(ymd)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, position: 'relative' }}>
      <input
        type="text"
        inputMode="numeric"
        value={text}
        placeholder="dd/mm/yyyy"
        onChange={handleTextChange}
        onBlur={handleTextBlur}
        aria-label={ariaLabel}
        style={{
          border: 'none',
          background: 'transparent',
          fontSize: 13,
          padding: 0,
          outline: 'none',
          width: 80,
          color: 'var(--text)',
          fontFamily: 'inherit',
        }}
      />
      {/* Calendar icon — clicking it opens the hidden date picker */}
      <button
        type="button"
        tabIndex={-1}
        title="Open calendar"
        onClick={() => pickerRef.current?.showPicker?.() || pickerRef.current?.click()}
        style={{
          background: 'none',
          border: 'none',
          padding: '0 2px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          color: 'var(--text-muted)',
          flexShrink: 0,
        }}
      >
        <CalendarDays size={14} strokeWidth={2} />
      </button>
      {/* Hidden native date picker — used only for calendar UI */}
      <input
        ref={pickerRef}
        type="date"
        value={value || ''}
        min={minYmd || undefined}
        max={maxYmd || undefined}
        onChange={handlePickerChange}
        tabIndex={-1}
        aria-hidden="true"
        style={{
          position: 'absolute',
          opacity: 0,
          pointerEvents: 'none',
          width: 1,
          height: 1,
          overflow: 'hidden',
          top: 0,
          left: 0,
        }}
      />
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

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

  // Auto-fire when both values are valid and complete
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

  function handleStartCommit(ymd) {
    setActivePreset(null)
    onStartChange?.(ymd)
  }

  function handleEndCommit(ymd) {
    setActivePreset(null)
    onEndChange?.(ymd)
  }

  const hasFilter = startDate || endDate

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

      {/* Preset pills */}
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

      {/* From → To */}
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
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>From</span>
          <DateInput
            value={startDate}
            ariaLabel="Start date"
            maxYmd={endDate || undefined}
            onCommit={handleStartCommit}
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 2px' }}>→</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>To</span>
          <DateInput
            value={endDate}
            ariaLabel="End date"
            minYmd={startDate || undefined}
            onCommit={handleEndCommit}
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
