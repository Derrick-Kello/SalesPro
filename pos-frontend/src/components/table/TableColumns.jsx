/** Sequential row index (#1, #2, …) — not entity ids from data. */
export function TableNumberCell({ index }) {
  return (
    <td
      className="table-row-num"
      style={{
        width: 44,
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: 12.5,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {index + 1}
    </td>
  )
}

export function TableSelectHeader({ checked, onChange, disabled }) {
  return (
    <th style={{ width: 40, textAlign: 'center' }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label="Select all rows"
      />
    </th>
  )
}

export function TableSelectCell({ checked, onChange, disabled }) {
  return (
    <td style={{ textAlign: 'center', width: 40 }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label="Select row"
      />
    </td>
  )
}

export function TableBulkBar({
  selectedCount,
  onDelete,
  onClear,
  deleting,
  canDelete = true,
  entityLabel = 'item',
}) {
  if (selectedCount === 0 && !deleting) return null
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        marginBottom: 12,
      }}
    >
      <button
        type="button"
        className="btn btn-danger btn-sm"
        disabled={!canDelete || selectedCount === 0 || deleting}
        onClick={onDelete}
      >
        {deleting ? 'Deleting…' : `Delete selected (${selectedCount})`}
      </button>
      {selectedCount > 0 && (
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={onClear}
          disabled={deleting}
        >
          Clear selection
        </button>
      )}
      <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
        Select rows, then bulk delete. Numbers are list order only.
      </span>
    </div>
  )
}
