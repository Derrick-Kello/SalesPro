/** List/catalog unit price stored on the line (or product fallback for legacy rows). */
export function catalogUnitPriceForLine(item) {
  if (item?.catalogUnitPrice != null && Number.isFinite(Number(item.catalogUnitPrice))) {
    return Number(item.catalogUnitPrice)
  }
  return Number(item?.product?.price ?? item?.unitPrice ?? 0)
}

export function saleLineHasMarkup(item) {
  const catalog = catalogUnitPriceForLine(item)
  const sold = Number(item?.unitPrice ?? 0)
  return sold > catalog + 0.009
}

export function saleLineHasDiscount(item) {
  const catalog = catalogUnitPriceForLine(item)
  const sold = Number(item?.unitPrice ?? 0)
  return sold < catalog - 0.009
}

export function saleHasMarkup(sale) {
  return (sale?.saleItems || []).some(saleLineHasMarkup)
}
