/**
 * DateRangeFilter — a clean "From … To …" date range picker.
 *
 * - Labels are human-readable ("From" / "To") instead of bare date inputs.
 * - Calls onChange(startDate, endDate) automatically once BOTH dates are
 *   fully entered (10-char YYYY-MM-DD), or when either is cleared.
 * - A "Clear" button resets both and triggers onChange('', '').
 * - No "Filter" button required — the user just picks dates and results update.
 */
import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export default function DateRangeFilter({ startDate, endDate, onStartChange, onEndChange, onChange, loading = false }) {
  const timerRef = useRef(null)

  // Debounce: only fire onChange when values are complete or cleared.
  // A complete date value is exactly 10 chars (YYYY-MM-DD) or empty string.
  function isComplete(v) {
    return v === '' || v.length === 10
  }

  useEffect(() => {
    if (!isComplete(startDate) || !isComplete(endDate)) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onChange?.(startDate, endDate)
    }, 120) // tiny delay so rapid clearing doesn't double-fire
    return () => clearTimeout(timerRef.current)
  }, [startDate, endDate])

  function handleClear() {
    onStartChange?.('')
    onEndChange?.('')
    onChange?.('', '')
  }

  const hasFilter = startDate || endDate

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', fontWeight: 500 }}>From</span>
        <input
          type="date"
          value={startDate}
          max={endDate || undefined}
          onChange={e => onStartChange?.(e.target.value)}
          style={{ border: 'none', background: 'transparent', fontSize: 13, padding: 0, outline: 'none', minWidth: 120, color: 'var(--text)' }}
          aria-label="Start date"
        />
        <span style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 2px' }}>→</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', fontWeight: 500 }}>To</span>
        <input
          type="date"
          value={endDate}
          min={startDate || undefined}
          onChange={e => onEndChange?.(e.target.value)}
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
  )
}
