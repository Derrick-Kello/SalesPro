/**
 * Shared date formatting helpers.
 * All display functions use dd/mm/yy format as requested.
 */

/**
 * Format an ISO string or Date as dd/mm/yy  (e.g. 08/06/26)
 */
export function fmtDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(2)
  return `${dd}/${mm}/${yy}`
}

/**
 * Format an ISO string or Date as dd/mm/yy HH:MM  (e.g. 08/06/26 14:35)
 */
export function fmtDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(2)
  const HH = String(d.getHours()).padStart(2, '0')
  const MM = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yy} ${HH}:${MM}`
}
