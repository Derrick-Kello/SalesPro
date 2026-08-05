/**
 * Size-aware product grouping for the client-facing reports.
 *
 * SKUs in this catalogue carry the size as a prefix on the mother variant —
 * "2XL-ALUO SHIRT (White)", "32-30-WILLIAMS 3PCS (Black)" — so one flat row per
 * SKU reads as noise. These helpers fold the SKUs back into a single line per
 * product/colour with a size -> quantity grid:
 *
 *   ALUO SHIRT (White)
 *   Size   M   L  XL  2XL  3XL
 *   Qty   13  33  26   26   16
 */
import { parseVariantProductName } from './productNames'

const SIZE_RANKS = {
  XXS: 0, XS: 1, S: 2, M: 3, L: 4, XL: 5,
  '2XL': 6, '3XL': 7, '4XL': 8, '5XL': 9, '6XL': 10, '7XL': 11, '8XL': 12,
}

const LETTER_SIZE_RE = /^(?:XXS|XS|S|M|L|X{1,4}L|[2-9]XL)$/i
const NUMERIC_SIZE_RE = /^\d{1,3}$/

const UNSIZED_RANK = 9999
const UNSIZED_LABEL = 'One size'

const num = (n) => Number(n) || 0

/** "XXL" and "2XL" are the same size; store one spelling. */
export function normalizeSizeToken(token) {
  const t = String(token ?? '').trim().toUpperCase()
  const m = t.match(/^(X{2,4})L$/)
  return m ? `${m[1].length}XL` : t
}

export function isSizeToken(token) {
  const t = String(token ?? '').trim()
  return LETTER_SIZE_RE.test(t) || NUMERIC_SIZE_RE.test(t)
}

/**
 * Split "2XL-ALUO SHIRT (White)" into { size: '2XL', base: 'ALUO SHIRT (White)' }.
 * Suits carry two sizes ("32-30-WILLIAMS 3PCS" = jacket 32 / trouser 30), and
 * some rows were typed with the prefix twice ("2XL-2XL-SHIRT ARARE"), so every
 * leading size token is consumed and consecutive repeats collapse to one.
 * Names without a size prefix keep their full name and get a null size.
 */
export function parseSizedProductName(name) {
  const raw = String(name ?? '').replace(/\s+/g, ' ').trim()
  if (!raw) return { size: null, base: '' }

  const tokens = []
  let rest = raw
  for (;;) {
    const dash = rest.indexOf('-')
    if (dash <= 0) break
    const token = rest.slice(0, dash).trim()
    const after = rest.slice(dash + 1).trim()
    if (!after || !isSizeToken(token)) break
    tokens.push(normalizeSizeToken(token))
    rest = after
  }

  if (!tokens.length) return { size: null, base: raw }
  const size = tokens.filter((t, i) => i === 0 || t !== tokens[i - 1]).join('-')
  return { size, base: rest }
}

function sizeRank(size) {
  if (size == null || size === '') return UNSIZED_RANK
  const first = String(size).split('-')[0]
  if (first in SIZE_RANKS) return SIZE_RANKS[first]
  if (NUMERIC_SIZE_RE.test(first)) return 100 + Number(first)
  return UNSIZED_RANK - 1
}

/** S → M → L → XL → 2XL …, then numeric sizes ascending, unsized last. */
export function compareSizes(a, b) {
  const diff = sizeRank(a) - sizeRank(b)
  if (diff !== 0) return diff
  return String(a ?? '').localeCompare(String(b ?? ''))
}

export function sizeLabel(size) {
  return size == null || size === '' ? UNSIZED_LABEL : size
}

/**
 * The product name minus its colour: "ALUO SHIRT (White)" -> "ALUO SHIRT".
 * Groups sort on this so every colour of a product — and every WILLIAMS cut,
 * since they share the leading word — reads as one run in the report.
 */
export function productFamily(productName) {
  const { base } = parseVariantProductName(productName)
  return base || String(productName ?? '')
}

/**
 * Fold `[{ name, category, quantity, value }]` rows into one group per product
 * (mother variant + colour), each holding its sizes in wearing order.
 * Groups run A→Z by family, biggest colour first inside each family.
 */
export function groupProductsBySize(entries) {
  const groups = new Map()

  for (const entry of entries || []) {
    const { size, base } = parseSizedProductName(entry?.name)
    const key = base.toLowerCase()
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        product: base || 'Unnamed product',
        family: productFamily(base || 'Unnamed product'),
        category: entry?.category ?? null,
        cells: new Map(),
        totalQuantity: 0,
        totalValue: 0,
        skuLines: 0,
      }
      groups.set(key, group)
    }
    if (!group.category && entry?.category) group.category = entry.category

    const cellKey = size ?? ''
    const cell = group.cells.get(cellKey) || { size, label: sizeLabel(size), quantity: 0, value: 0 }
    cell.quantity += num(entry?.quantity)
    cell.value += num(entry?.value)
    group.cells.set(cellKey, cell)

    group.totalQuantity += num(entry?.quantity)
    group.totalValue += num(entry?.value)
    group.skuLines += 1
  }

  return [...groups.values()]
    .map((g) => ({
      ...g,
      cells: [...g.cells.values()].sort((a, b) => compareSizes(a.size, b.size)),
    }))
    .sort(
      (a, b) =>
        a.family.localeCompare(b.family, undefined, { numeric: true, sensitivity: 'base' }) ||
        b.totalValue - a.totalValue ||
        b.totalQuantity - a.totalQuantity ||
        a.product.localeCompare(b.product),
    )
}
