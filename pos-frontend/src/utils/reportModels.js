/**
 * Builds the export model (see reportExport.js) for each report on the
 * Reports tab. Kept free of React so it can be unit-tested directly.
 */
import { fmtDate, fmtDateTime } from './dateFormat'
import { groupProductsBySize } from './sizeBreakdown'

const num = (n) => Number(n) || 0
const sum = (rows, pick) => rows.reduce((acc, r) => acc + num(pick(r)), 0)
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const pieces = (n) => `${num(n)} ${num(n) === 1 ? 'pc' : 'pcs'}`

/**
 * Turn a loaded report payload into the shared export model
 * (see utils/reportExport.js). Used by both the CSV and the PDF download.
 */
export function buildReportModel({ type, data, title, meta, money, layout = 'both' }) {
  const model = { title, filename: type, meta, sections: [] }

  if (type === 'sales-report') {
    const rows = Array.isArray(data) ? data : []
    const groups = groupProductsBySize(
      rows.map((p) => ({
        name: p.name,
        category: p.category,
        quantity: p.totalQuantity,
        value: p.totalRevenue,
      })),
    )
    const totalQty = sum(rows, (p) => p.totalQuantity)
    const totalRevenue = sum(rows, (p) => p.totalRevenue)

    // The size grids are wide but short; keep the whole report on portrait pages.
    model.orientation = 'portrait'

    model.sections.push({
      kind: 'stats',
      title: 'Summary',
      items: [
        { label: 'Products sold', value: groups.length },
        { label: 'Size lines', value: sum(groups, (g) => g.cells.length) },
        { label: 'Pieces sold', value: totalQty },
        { label: 'Revenue', value: money(totalRevenue) },
      ],
    })

    // 'grids' = the size blocks only, 'lines' = the flat table only, 'both'.
    const wantGrids = layout !== 'lines'
    const wantLines = layout !== 'grids'
    model.filename = layout === 'both' ? type : `${type}-${layout}`

    if (wantGrids) model.sections.push({
      kind: 'matrix',
      title: 'Quantity sold by product and size',
      groups: groups.map((g) => ({
        title: g.product,
        subtitle: [g.category, pieces(g.totalQuantity), money(g.totalValue).text]
          .filter(Boolean)
          .join(' · '),
        cells: g.cells.map((c) => ({ label: c.label, value: num(c.quantity) })),
        total: num(g.totalQuantity),
      })),
    })

    if (wantLines) {
      const detail = groups.flatMap((g) =>
        g.cells.map((c) => [g.product, c.label, g.category ?? '—', num(c.quantity), money(c.value)]),
      )
      model.sections.push({
        kind: 'table',
        title: 'Size lines (detail)',
        columns: ['#', 'Product', 'Size', 'Category', 'Qty sold', 'Revenue'],
        align: ['right', 'left', 'left', 'left', 'right', 'right'],
        rows: detail.map((r, i) => [i + 1, ...r]),
        footer: detail.length ? ['', 'Total', '', '', totalQty, money(totalRevenue)] : null,
      })
    }
    return model
  }

  if (type === 'payments') {
    const days = data.dailyBreakdown || []
    model.sections.push({
      kind: 'stats',
      title: 'Summary',
      items: [
        { label: 'Weekly revenue', value: money(data.totalRevenue) },
        { label: 'Transactions', value: num(data.totalTransactions) },
      ],
    })
    model.sections.push({
      kind: 'table',
      title: 'Daily revenue',
      columns: ['Date', 'Transactions', 'Revenue'],
      align: ['left', 'right', 'right'],
      rows: days.map((d) => [
        { text: fmtDate(d.date), value: d.date },
        num(d.transactions),
        money(d.revenue),
      ]),
      footer: days.length
        ? ['Total', sum(days, (d) => d.transactions), money(sum(days, (d) => d.revenue))]
        : null,
    })
    return model
  }

  if (type === 'profit-loss') {
    model.sections.push({
      kind: 'stats',
      title: 'Summary',
      items: [
        { label: 'Sales (completed)', value: money(data.salesMade) },
        { label: 'Sales returns', value: money(data.salesReturns) },
        { label: 'Net revenue', value: money(data.netRevenue) },
        { label: 'Total discounts (on sales)', value: money(data.totalDiscountApplied) },
        { label: 'Total shipping (charged)', value: money(data.totalShippingCharges) },
        { label: 'Outstanding (partial invoices)', value: money(data.outstandingReceivables) },
        { label: 'Open partial invoices #', value: num(data.partiallyPaidSalesCount) },
        { label: 'Inventory purchases', value: money(data.inventoryPurchases) },
        { label: 'Purchase returns', value: money(data.purchaseReturns) },
        { label: 'Total expenses', value: money(data.totalExpenses) },
        { label: 'Payments received', value: money(data.totalPaymentsReceived) },
        { label: 'Cost of goods sold', value: money(data.costOfGoodsSold) },
        { label: 'Gross profit', value: money(data.grossProfit) },
        { label: 'Net profit', value: money(data.netProfit) },
        { label: 'Completed sales #', value: num(data.completedTransactionCount) },
        { label: 'Refunded sales #', value: num(data.refundedTransactionCount) },
      ],
    })
    if (num(data.outstandingReceivables) > 0.02) {
      model.sections.push({
        kind: 'note',
        text: `Open balances on partial checkouts: ${money(data.outstandingReceivables).text} still owed across ${num(data.partiallyPaidSalesCount)} invoice(s). That cash is not reflected in Payments received until it is settled.`,
      })
    }
    const rows = data.discountShippingByBranch || []
    if (rows.length) {
      model.sections.push({
        kind: 'table',
        title: `Discounts & shipping ${data.branchId == null ? 'by branch' : 'for branch'}`,
        columns: ['Branch', 'Discounts applied', 'Shipping charged'],
        align: ['left', 'right', 'right'],
        rows: rows.map((r) => [r.branchName, money(r.totalDiscount), money(r.totalShipping)]),
        footer: [
          `Total (${data.branchId == null ? 'all branches' : 'this branch'})`,
          money(data.totalDiscountApplied),
          money(data.totalShippingCharges),
        ],
      })
    }
    return model
  }

  if (type === 'user-report') {
    const rows = Array.isArray(data) ? data : []
    model.sections.push({
      kind: 'table',
      title: 'Sales by user',
      columns: ['#', 'Name', 'Username', 'Sales', 'Revenue'],
      align: ['right', 'left', 'left', 'right', 'right'],
      rows: rows.map((c, i) => [i + 1, c.fullName, c.username, num(c.totalSales), money(c.totalRevenue)]),
      footer: rows.length
        ? ['', 'Total', '', sum(rows, (c) => c.totalSales), money(sum(rows, (c) => c.totalRevenue))]
        : null,
    })
    return model
  }

  if (type === 'stock-alerts') {
    const rows = data.inventory || []
    model.sections.push({
      kind: 'stats',
      title: 'Summary',
      items: [
        { label: 'Low stock items', value: num(data.lowStockCount) },
        { label: 'Stock lines listed', value: rows.length },
        { label: 'Pieces on hand', value: sum(rows, (i) => i.quantity) },
      ],
    })
    model.sections.push({
      kind: 'table',
      title: 'Stock levels',
      columns: ['#', 'Product', 'Category', 'Branch', 'Stock', 'Alert level', 'Supplier', 'Status'],
      align: ['right', 'left', 'left', 'left', 'right', 'right', 'left', 'left'],
      rows: rows.map((i, idx) => [
        idx + 1,
        i.product?.name ?? '—',
        i.product?.category ?? '—',
        i.branch?.name ?? '—',
        num(i.quantity),
        num(i.lowStockAlert),
        i.supplier || '—',
        i.isLowStock ? 'Low' : 'OK',
      ]),
    })
    return model
  }

  if (type === 'warehouse-report') {
    const r = data.rollup || {}
    const te = data.transferEconomics || {}
    const sums = data.summaries || []
    const lines = data.productLines || []
    const xfers = data.transferHistory || []

    model.sections.push({
      kind: 'stats',
      title: 'Summary',
      items: [
        { label: 'Warehouses listed', value: num(r.warehousesListed ?? sums.length) },
        { label: 'SKU lines (sum of rows)', value: r.distinctSkusHedged ?? '—' },
        { label: 'Pieces on hand', value: num(r.totalPieces) },
        { label: 'Warehouse stock value', value: money(r.totalCostValue) },
      ],
    })
    model.sections.push({
      kind: 'stats',
      title: 'Transfer economics (filtered period × scope)',
      items: [
        { label: 'Transfers in view', value: num(te.totalLines) },
        { label: 'Total movement value', value: money(te.totalCostRecorded) },
        { label: 'Cost arriving at warehouses', value: money(te.inboundToWarehouseCost) },
        { label: 'Cost leaving warehouses', value: money(te.outboundFromWarehouseCost) },
        { label: 'Warehouse → Warehouse', value: money(te.warehouseToWarehouseCost) },
        { label: 'Warehouse → Branch', value: money(te.warehouseToBranchCost) },
        { label: 'Branch → Warehouse', value: money(te.branchToWarehouseCost) },
      ],
    })
    model.sections.push({
      kind: 'table',
      title: 'Warehouse balances',
      columns: ['#', 'Warehouse', 'Linked outlet', 'SKU lines', 'Pieces', 'Value (cost)', 'Note'],
      align: ['right', 'left', 'left', 'right', 'right', 'right', 'left'],
      rows: sums.map((s, i) => [
        i + 1,
        s.warehouseName,
        [s.branchName ?? '—', s.location].filter(Boolean).join(' · '),
        num(s.distinctSkus),
        num(s.totalPieces),
        money(s.totalCostValue),
        oneLine(s.stockNote) || '—',
      ]),
    })
    if (lines.length) {
      model.sections.push({
        kind: 'table',
        title: 'Product detail (single warehouse)',
        columns: ['#', 'Product', 'Category', 'Qty', 'Unit cost', 'Line value'],
        align: ['right', 'left', 'left', 'right', 'right', 'right'],
        rows: lines.map((p, i) => [
          i + 1, p.name, p.category ?? '—', num(p.quantity), money(p.unitCostPrice), money(p.lineCostValue),
        ]),
      })
    }
    model.sections.push({
      kind: 'table',
      title: 'Transfer history',
      columns: ['#', 'When', 'Route', 'Product', 'Qty', 'Cost', 'From', 'To', 'By', 'Note'],
      align: ['right', 'left', 'left', 'left', 'right', 'right', 'left', 'left', 'left', 'left'],
      rows: xfers.map((t, i) => [
        i + 1,
        { text: fmtDateTime(t.createdAt), value: t.createdAt ?? '' },
        t.routeHint || 'Transfer',
        t.productName,
        num(t.quantity),
        money(t.totalCostRecorded),
        t.fromLabel ?? '—',
        t.toLabel ?? '—',
        t.transferredByName ?? '—',
        oneLine(t.note) || '—',
      ]),
    })
    return model
  }

  return model
}
