/** Parse "Base (Variant)" style product names — matches backend. */
export function parseVariantProductName(name) {
  const raw = String(name || '').trim()
  if (!raw) return { base: '', variantLabel: null }
  const m = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
  if (m) return { base: m[1].trim(), variantLabel: m[2].trim() }
  return { base: raw, variantLabel: null }
}

export function variantProductName(base, label) {
  return `${String(base || '').trim()} (${String(label || '').trim()})`
}

export function normalizeProductNameKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function productNameExists(products, name, excludeId = null) {
  const key = normalizeProductNameKey(name)
  if (!key) return false
  return products.some(
    (p) =>
      p.isActive !== false &&
      normalizeProductNameKey(p.name) === key &&
      (excludeId == null || p.id !== excludeId)
  )
}
