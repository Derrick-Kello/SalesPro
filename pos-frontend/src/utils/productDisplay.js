/**
 * Listing / tile label — product name only. Variants shown per line when a tag is chosen (POS cart, receipt).
 * Legacy DB rows keep a separate variant field until migrated to tags.
 */
export function productDisplayName(p) {
  if (!p) return ''
  const base = (p.name || '').trim()
  const v = p.variant
  if (v && String(v).trim() && v !== 'Standard') return `${base} (${v})`
  return base
}
