export function getMotherVariantName(name) {
  const raw = String(name || '').trim()
  if (!raw) return 'Unknown variant'

  const dashIdx = raw.indexOf('-')
  if (dashIdx > 0) {
    const prefix = raw.slice(0, dashIdx).trim()
    const after = raw.slice(dashIdx + 1).trim()
    const hasDigitPrefix = /\d/.test(prefix)
    const isShortUpperSizeCode =
      prefix.length >= 2 &&
      prefix.length <= 6 &&
      !/[a-z]/.test(prefix) &&
      /[A-Z]/.test(prefix)

    // Treat "31-Loafer(Black)" / "XL-Loafer(Black)" as sub-variants.
    // Avoid stripping normal product names like "T-Shirt (Black)".
    if (after && (hasDigitPrefix || isShortUpperSizeCode)) return after
  }
  return raw
}

export function normalizeMotherName(name) {
  return String(getMotherVariantName(name))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildMotherGroupKey(row) {
  const mother = normalizeMotherName(row?.product?.name)
  const wh = row?.warehouse?.id ? String(row.warehouse.id) : 'na'
  return `${wh}::${mother}`
}

