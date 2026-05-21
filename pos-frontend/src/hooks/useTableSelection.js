import { useState } from 'react'

/** Checkbox selection for data tables (row numbers are separate — use displayRowNumber). */
export function useTableSelection(rows, getId = (r) => r.id) {
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkDeleting, setBulkDeleting] = useState(false)

  function toggle(id, checked) {
    setSelectedIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id]
      return prev.filter((x) => x !== id)
    })
  }

  function toggleAll(checked) {
    if (!checked) {
      setSelectedIds([])
      return
    }
    setSelectedIds(rows.map((r) => getId(r)))
  }

  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.includes(getId(r)))

  function clear() {
    setSelectedIds([])
  }

  return {
    selectedIds,
    setSelectedIds,
    bulkDeleting,
    setBulkDeleting,
    toggle,
    toggleAll,
    allSelected,
    clear,
  }
}

export function displayRowNumber(index) {
  return index + 1
}
