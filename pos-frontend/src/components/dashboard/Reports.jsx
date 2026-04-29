import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useBranch } from '../../context/BranchContext'
import { useCurrency } from '../../context/CurrencyContext'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Download, Printer } from 'lucide-react'

export default function Reports({ subSection = 'sales-report' }) {
  const { user } = useAuth()
  const { selectedBranchId } = useBranch()
  const { fmt } = useCurrency()
  const isAdmin = user?.role === 'ADMIN'
  const isManager = user?.role === 'MANAGER'

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [branches, setBranches] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [reportBranchId, setReportBranchId] = useState(null)
  const [reportWarehouseId, setReportWarehouseId] = useState(null)

  const effectiveBranchId =
    subSection === 'warehouse-report'
      ? (isAdmin ? (reportBranchId ?? null) : (isManager ? user?.branchId : null))
      : (isAdmin ? (reportBranchId ?? selectedBranchId) : (isManager ? user?.branchId : null))

  useEffect(() => {
    if (isAdmin) {
      api.get('/branches').then(setBranches).catch(() => {})
    }
  }, [isAdmin])

  useEffect(() => {
    if (subSection === 'warehouse-report') {
      api.get('/warehouses').then(setWarehouses).catch(() => setWarehouses([]))
    }
  }, [subSection])

  const warehousesForFilter = warehouses.filter(
    (w) =>
      !effectiveBranchId ||
      w.branchId === effectiveBranchId ||
      w.branchId == null,
  )

  useEffect(() => {
    if (subSection !== 'warehouse-report') return
    if (reportWarehouseId == null) return
    if (!warehousesForFilter.some((w) => w.id === reportWarehouseId)) {
      setReportWarehouseId(null)
    }
  }, [subSection, effectiveBranchId, warehouses, reportWarehouseId])

  useEffect(() => { load() }, [subSection, effectiveBranchId, startDate, endDate, reportWarehouseId])

  async function load() {
    setLoading(true); setData(null)
    try {
      const params = new URLSearchParams()
      if (startDate) params.append('startDate', startDate)
      if (endDate) params.append('endDate', endDate)
      if (effectiveBranchId) params.append('branchId', effectiveBranchId)
      const qs = params.toString() ? '?' + params : ''

      if (subSection === 'warehouse-report') {
        const wp = new URLSearchParams()
        if (reportWarehouseId) wp.append('warehouseId', reportWarehouseId)
        if (startDate) wp.append('startDate', startDate)
        if (endDate) wp.append('endDate', endDate)
        if (effectiveBranchId) wp.append('branchId', effectiveBranchId)
        const wqs = wp.toString() ? '?' + wp : ''
        setData(await api.get(`/reports/warehouse${wqs}`))
        return
      }

      if (subSection === 'sales-report') {
        setData(await api.get(`/reports/products${qs}`))
      } else if (subSection === 'payments') {
        setData(await api.get(`/reports/weekly${qs}`))
      } else if (subSection === 'profit-loss') {
        setData(await api.get(`/reports/profit-loss${qs}`))
      } else if (subSection === 'user-report') {
        setData(await api.get(`/reports/cashiers${qs}`))
      } else if (subSection === 'stock-alerts') {
        setData(await api.get(`/reports/inventory${qs}`))
      }
    } catch (err) {
      setData({ error: err.message })
    } finally {
      setLoading(false)
    }
  }

  const titles = {
    'sales-report': 'Sales Report',
    'payments': 'Payments Report',
    'profit-loss': 'Profit & Loss',
    'user-report': 'User Report',
    'stock-alerts': 'Product Quality & Stock Alerts',
    'warehouse-report': 'Warehouse Report',
  }

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 16 }}>
        <h2>{titles[subSection] || 'Reports'}</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {isAdmin && branches.length > 0 && (
            <select
              value={reportBranchId ?? ''}
              onChange={e => setReportBranchId(e.target.value ? parseInt(e.target.value) : null)}
              style={{ minWidth: 140 }}
            >
              <option value="">All Branches</option>
              {branches.filter(b => b.isActive).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          {subSection === 'warehouse-report' && (
            <>
              <select
                value={reportWarehouseId ?? ''}
                onChange={e =>
                  setReportWarehouseId(e.target.value ? parseInt(e.target.value, 10) : null)
                }
                style={{ minWidth: 180 }}
              >
                <option value="">All warehouses</option>
                {warehousesForFilter.filter((w) => w.isActive !== false).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}{w.branch?.name ? ` · ${w.branch.name}` : ''}
                  </option>
                ))}
              </select>
              <input type="date" aria-label="Transfer history from" value={startDate} onChange={e => setStartDate(e.target.value)} />
              <input type="date" aria-label="Transfer history until" value={endDate} onChange={e => setEndDate(e.target.value)} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 220 }}>
                Dates filter transfer history below; stock totals are live.
              </span>
            </>
          )}
          {(subSection === 'sales-report' || subSection === 'payments' || subSection === 'profit-loss') && (
            <>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </>
          )}
          <button className="btn btn-outline" onClick={load}>Filter</button>
        </div>
      </div>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
      {data?.error && <p style={{ color: 'var(--danger)' }}>{data.error}</p>}
      {!loading && data && !data.error && <ReportBody type={subSection} data={data} fmt={fmt} title={titles[subSection]} />}
    </div>
  )
}

function csvEscape(cell) {
  const s = cell == null ? '' : String(cell)
  return `"${s.replace(/"/g, '""')}"`
}

function buildWarehouseCsv(d, fmt) {
  const lines = [`Warehouse Report (${new Date().toISOString().slice(0, 10)})`, '']
  lines.push(csvEscape('By warehouse'))
  lines.push([csvEscape('Warehouse'), csvEscape('Branch'), csvEscape('SKUs'), csvEscape('Pieces'), csvEscape('Cost value'), csvEscape('Note')].join(','))
  for (const s of (d.summaries || [])) {
    lines.push([
      csvEscape(s.warehouseName), csvEscape(s.branchName ?? ''), s.distinctSkus, s.totalPieces,
      csvEscape(fmt(s.totalCostValue ?? 0)), csvEscape((s.stockNote || '').replace(/\n/g, ' ')),
    ].join(','))
  }
  const te = d.transferEconomics
  lines.push('')
  lines.push(csvEscape('Transfer economics (filtered period × scope)'))
  if (te) {
    lines.push([csvEscape('Transfer rows (shown)'), te.totalLines].join(','))
    lines.push([csvEscape('Recorded cost sum (movement value)'), csvEscape(fmt(te.totalCostRecorded ?? 0))].join(','))
    lines.push([csvEscape('Cost arriving at warehouses (dest = WH)'), csvEscape(fmt(te.inboundToWarehouseCost ?? 0))].join(','))
    lines.push([csvEscape('Cost leaving warehouses (origin = WH)'), csvEscape(fmt(te.outboundFromWarehouseCost ?? 0))].join(','))
    lines.push([csvEscape('WH → WH'), csvEscape(fmt(te.warehouseToWarehouseCost ?? 0))].join(','))
    lines.push([csvEscape('WH → Branch'), csvEscape(fmt(te.warehouseToBranchCost ?? 0))].join(','))
    lines.push([csvEscape('Branch → WH'), csvEscape(fmt(te.branchToWarehouseCost ?? 0))].join(','))
  }
  lines.push('')
  lines.push(csvEscape('Transfers'))
  lines.push([
    csvEscape('When'), csvEscape('Product'), csvEscape('Qty'), csvEscape('Route'),
    csvEscape('Cost'), csvEscape('From'), csvEscape('To'), csvEscape('By'), csvEscape('Note'),
  ].join(','))
  for (const t of (d.transferHistory || [])) {
    const when = t.createdAt ? new Date(t.createdAt).toLocaleString() : ''
    lines.push([
      csvEscape(when),
      csvEscape(t.productName), t.quantity, csvEscape(t.routeHint || ''),
      csvEscape(fmt(t.totalCostRecorded ?? 0)),
      csvEscape(t.fromLabel), csvEscape(t.toLabel), csvEscape(t.transferredByName),
      csvEscape((t.note || '').replace(/\n/g, ' ')),
    ].join(','))
  }
  return lines.join('\n')
}

function downloadWarehouseReport(data, fmt) {
  const blob = new Blob([buildWarehouseCsv(data, fmt)], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `warehouse-report-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function ReportBody({ type, data, fmt, title = '' }) {
  if (type === 'sales-report') return (
    <div className="table-container">
      <table className="data-table">
        <thead><tr><th>Product</th><th>Category</th><th>Qty Sold</th><th>Revenue</th></tr></thead>
        <tbody>
          {data.length
            ? data.map(p => <tr key={p.productId}><td>{p.name}</td><td><span className="badge badge-info">{p.category}</span></td><td>{p.totalQuantity}</td><td style={{ fontWeight: 700 }}>{fmt(p.totalRevenue)}</td></tr>)
            : <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>No data</td></tr>}
        </tbody>
      </table>
    </div>
  )

  if (type === 'payments') {
    const chartData = (data.dailyBreakdown || []).map(d => ({ ...d, revenue: parseFloat(d.revenue.toFixed(2)) }))
    return (
      <>
        <div className="stats-grid" style={{ marginBottom: 20 }}>
          <div className="stat-card"><div className="stat-label">Weekly Revenue</div><div className="stat-value">{fmt(data.totalRevenue)}</div></div>
          <div className="stat-card success"><div className="stat-label">Transactions</div><div className="stat-value">{data.totalTransactions}</div></div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginBottom: 16 }}>Daily Revenue</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => fmt(v)} />
              <Bar dataKey="revenue" name="Revenue" fill="var(--primary)" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </>
    )
  }

  if (type === 'profit-loss') {
    const rows = data.discountShippingByBranch || []
    return (
      <>
        {(data.purchaseCategoryMissing || data.purchaseReturnCategoryMissing) && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16, maxWidth: 640 }}>
            Tip: create expense categories named <strong>Inventory Purchases</strong> and <strong>Purchase Returns</strong> under Expenses → Expense Categories to track those lines on this report.
          </p>
        )}
        {data.dateFiltered === false && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16, maxWidth: 640 }}>
            All periods: totals include every completed sale (same scope as Sales History when no start/end date is chosen).
          </p>
        )}
        {(data.outstandingReceivables ?? 0) > 0.02 && (
          <div
            role="note"
            style={{
              border: '1px solid var(--warning)',
              background: 'var(--warning-light)',
              padding: '12px 14px',
              borderRadius: 10,
              marginBottom: 18,
              fontSize: 13.5,
              lineHeight: 1.45,
              color: 'var(--text)',
              maxWidth: 720,
            }}
          >
            <strong>Open balances on partial checkouts:</strong>{' '}
            {fmt(data.outstandingReceivables)} still owed across{' '}
            <strong>{data.partiallyPaidSalesCount ?? 0}</strong>{' '}
            invoice{((data.partiallyPaidSalesCount ?? 0) === 1 ? '' : 's')}.
            That cash is{' '}
            <em>not</em> reflected in Payments received until it is settled at the POS or recorded under{' '}
            <strong>Sales History → Edit (admin)</strong>. Net profit already matches invoice totals (COGS, discounts).
          </div>
        )}
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Sales (completed)</div><div className="stat-value" style={{ color: 'var(--success)' }}>{fmt(data.salesMade)}</div></div>
          <div className="stat-card"><div className="stat-label">Sales returns</div><div className="stat-value">{fmt(data.salesReturns)}</div></div>
          <div className="stat-card"><div className="stat-label">Net revenue</div><div className="stat-value" style={{ fontWeight: 800 }}>{fmt(data.netRevenue)}</div></div>
          <div className="stat-card"><div className="stat-label">Total discounts (on sales)</div><div className="stat-value" style={{ color: 'var(--warning)' }}>{fmt(data.totalDiscountApplied ?? 0)}</div></div>
          <div className="stat-card"><div className="stat-label">Total shipping (charged)</div><div className="stat-value">{fmt(data.totalShippingCharges ?? 0)}</div></div>
          {(data.outstandingReceivables ?? 0) > 0.02 && (
            <div className="stat-card warning">
              <div className="stat-label">Outstanding (partial invoices)</div>
              <div className="stat-value" style={{ color: 'var(--warning)' }}>{fmt(data.outstandingReceivables)}</div>
              <div className="stat-sublabel" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{data.partiallyPaidSalesCount ?? 0} open order(s)</div>
            </div>
          )}
          <div className="stat-card"><div className="stat-label">Inventory purchases</div><div className="stat-value">{fmt(data.inventoryPurchases)}</div></div>
          <div className="stat-card"><div className="stat-label">Purchase returns</div><div className="stat-value">{fmt(data.purchaseReturns)}</div></div>
          <div className="stat-card"><div className="stat-label">Total expenses</div><div className="stat-value" style={{ color: 'var(--danger)' }}>{fmt(data.totalExpenses)}</div></div>
          <div className="stat-card"><div className="stat-label">Payments received</div><div className="stat-value">{fmt(data.totalPaymentsReceived)}</div></div>
          <div className="stat-card"><div className="stat-label">Cost of goods sold</div><div className="stat-value">{fmt(data.costOfGoodsSold)}</div></div>
          <div className="stat-card success"><div className="stat-label">Gross profit</div><div className="stat-value">{fmt(data.grossProfit)}</div></div>
          <div className="stat-card"><div className="stat-label">Net profit</div>
            <div className="stat-value" style={{ color: data.netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmt(data.netProfit)}</div>
          </div>
          <div className="stat-card"><div className="stat-label">Completed sales #</div><div className="stat-value">{data.completedTransactionCount ?? 0}</div></div>
          <div className="stat-card"><div className="stat-label">Refunded sales #</div><div className="stat-value">{data.refundedTransactionCount ?? 0}</div></div>
        </div>

        {rows.length > 0 && (
          <div className="card" style={{ marginTop: 24, padding: 20 }}>
            <h3 style={{ marginBottom: 12, fontSize: 15, fontWeight: 700 }}>
              Discounts &amp; shipping {data.branchId == null ? 'by branch' : 'for branch'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
              {data.branchId == null
                ? (data.dateFiltered === false
                  ? 'Totals from all completed sales, grouped by outlet. Footer matches the figures above.'
                  : 'Totals from completed sales in the selected date range, grouped by outlet. Footer matches the figures above.')
                : (data.dateFiltered === false
                  ? 'Totals for the selected outlet across all periods.'
                  : 'Totals for the selected outlet in the selected date range.')}
            </p>
            <div className="table-container" style={{ boxShadow: 'none' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Branch</th>
                    <th style={{ textAlign: 'right' }}>Discounts applied</th>
                    <th style={{ textAlign: 'right' }}>Shipping charged</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.branchId ?? 'none'}>
                      <td style={{ fontWeight: 600 }}>{r.branchName}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(r.totalDiscount)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(r.totalShipping)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)', background: 'var(--surface2)' }}>
                    <td>Total ({data.branchId == null ? 'all branches' : 'this branch'})</td>
                    <td style={{ textAlign: 'right' }}>{fmt(data.totalDiscountApplied ?? 0)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(data.totalShippingCharges ?? 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </>
    )
  }

  if (type === 'user-report') return (
    <div className="table-container">
      <table className="data-table">
        <thead><tr><th>Name</th><th>Username</th><th>Sales</th><th>Revenue</th></tr></thead>
        <tbody>
          {data.length
            ? data.map(c => <tr key={c.userId}><td style={{ fontWeight: 600 }}>{c.fullName}</td><td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{c.username}</td><td>{c.totalSales}</td><td style={{ fontWeight: 700 }}>{fmt(c.totalRevenue)}</td></tr>)
            : <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>No data</td></tr>}
        </tbody>
      </table>
    </div>
  )

  if (type === 'warehouse-report') {
    const r = data.rollup || {}
    const sums = data.summaries || []
    const lines = data.productLines || []
    const xfers = data.transferHistory || []
    const te = data.transferEconomics || {}

    const fmtDt = (iso) =>
      iso
        ? new Date(iso).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : '—'

    return (
      <>
        <div
          className="no-print-warehouse-report"
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            alignItems: 'stretch',
            marginBottom: 20,
          }}
        >
          <div
            className="card"
            style={{
              flex: '1 1 280px',
              padding: '14px 16px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface2) 100%)',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Export</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => downloadWarehouseReport(data, fmt)}
              >
                <Download size={16} strokeWidth={2} /> Download CSV
              </button>
              <button
                type="button"
                className="btn btn-outline"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => window.print()}
              >
                <Printer size={16} strokeWidth={2} /> Print / Save PDF
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '10px 0 0', lineHeight: 1.4 }}>
              Printed view uses minimal chrome. CSV includes warehouse balances, economics, and transfers.
            </p>
          </div>
        </div>

        <div id="warehouse-report-export-root">
          <style>{`
          @media print {
            body * { visibility: hidden !important; }
            #warehouse-report-export-root, #warehouse-report-export-root * { visibility: visible !important; }
            #warehouse-report-export-root {
              position: absolute; left: 0; top: 0; width: 100%;
              padding: 12px;
            }
          }
          `}</style>

          <h1
            style={{ fontSize: 22, margin: '0 0 14px', fontWeight: 800, letterSpacing: '-0.02em' }}
          >
            {title || 'Warehouse Report'}
          </h1>

          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14, maxWidth: 800, lineHeight: 1.5 }}>
            Stock here is counted per warehouse (isolated ledger). Outlet stock only changes via Transfers —
            warehouse restock is handled under Warehouses → Stock or branch → warehouse transfers.
          </p>

          {data.dateFiltered === true && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14, maxWidth: 720 }}>
              Transfer history filtered from <strong>{data.startDate ?? '…'}</strong> to{' '}
              <strong>{data.endDate ?? '…'}</strong>.
            </p>
          )}
          {data.dateFiltered === false && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14, maxWidth: 720 }}>
              Showing all recorded transfers (latest 750). Pick dates above and Filter to narrow economics and lists.
            </p>
          )}
          {r.rollupHint && (
            <div
              role="note"
              style={{
                border: '1px solid var(--warning)',
                background: 'var(--warning-light)',
                padding: '12px 14px',
                borderRadius: 10,
                marginBottom: 18,
                fontSize: 13,
                maxWidth: 720,
                lineHeight: 1.45,
              }}
            >
              {r.rollupHint}
            </div>
          )}

          <div className="stats-grid" style={{ marginBottom: 22 }}>
            <div className="stat-card"><div className="stat-label">Warehouses listed</div><div className="stat-value">{r.warehousesListed ?? sums.length ?? 0}</div></div>
            <div className="stat-card"><div className="stat-label">SKU lines (Σ rows)</div><div className="stat-value">{r.distinctSkusHedged ?? '—'}</div></div>
            <div className="stat-card"><div className="stat-label">Pieces on hand (Σ)</div><div className="stat-value">{r.totalPieces ?? 0}</div></div>
            <div className="stat-card success"><div className="stat-label">Warehouse stock value</div><div className="stat-value">{fmt(r.totalCostValue ?? 0)}</div></div>
          </div>

          <h3 style={{ margin: '8px 0 12px', fontSize: 15, fontWeight: 700 }}>Transfer economics (recorded cost)</h3>
          <div className="stats-grid" style={{ marginBottom: 24 }}>
            <div className="stat-card"><div className="stat-label">Transfers in view</div><div className="stat-value">{te.totalLines ?? 0}</div></div>
            <div className="stat-card"><div className="stat-label">Total movement value</div><div className="stat-value">{fmt(te.totalCostRecorded ?? 0)}</div></div>
            <div className="stat-card"><div className="stat-label">WH outbound</div><div className="stat-value">{fmt(te.outboundFromWarehouseCost ?? 0)}</div></div>
            <div className="stat-card"><div className="stat-label">Inbound at WH</div><div className="stat-value">{fmt(te.inboundToWarehouseCost ?? 0)}</div></div>
            <div className="stat-card"><div className="stat-label">Warehouse → Warehouse</div><div className="stat-value">{fmt(te.warehouseToWarehouseCost ?? 0)}</div></div>
            <div className="stat-card warning"><div className="stat-label">Warehouse → Branch</div><div className="stat-value">{fmt(te.warehouseToBranchCost ?? 0)}</div></div>
            <div className="stat-card"><div className="stat-label">Branch → Warehouse</div><div className="stat-value">{fmt(te.branchToWarehouseCost ?? 0)}</div></div>
          </div>

          <h3 style={{ margin: '8px 0 12px', fontSize: 15, fontWeight: 700 }}>Warehouse balances</h3>
          <div className="table-container" style={{ marginBottom: lines.length ? 28 : 20 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Warehouse</th>
                  <th>Linked outlet</th>
                  <th style={{ textAlign: 'right' }}>SKU lines</th>
                  <th style={{ textAlign: 'right' }}>Pieces</th>
                  <th style={{ textAlign: 'right' }}>Value (cost)</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {sums.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '28px 0' }}>
                      No warehouses match this filter.
                    </td>
                  </tr>
                )}
                {sums.map((row) => (
                  <tr key={row.warehouseId}>
                    <td style={{ fontWeight: 600 }}>{row.warehouseName}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      {row.branchName ?? '—'}{row.location ? ` · ${row.location}` : ''}
                    </td>
                    <td style={{ textAlign: 'right' }}>{row.distinctSkus ?? 0}</td>
                    <td style={{ textAlign: 'right' }}>{row.totalPieces ?? 0}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(row.totalCostValue ?? 0)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 280 }}>
                      {row.stockNote ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {lines.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Product detail (single warehouse)</h3>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th style={{ textAlign: 'right' }}>Qty</th>
                      <th style={{ textAlign: 'right' }}>Unit cost</th>
                      <th style={{ textAlign: 'right' }}>Line value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((p) => (
                      <tr key={p.productId}>
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
                        <td><span className="badge badge-info">{p.category ?? '—'}</span></td>
                        <td style={{ textAlign: 'right' }}>{p.quantity}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(p.unitCostPrice ?? 0)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(p.lineCostValue ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Transfer history</h3>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Route</th>
                  <th>Product</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Cost</th>
                  <th>From</th>
                  <th>To</th>
                  <th>By</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {xfers.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '28px 0' }}>
                      No transfers found for this filter.
                    </td>
                  </tr>
                )}
                {xfers.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontSize: 12.5, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{fmtDt(t.createdAt)}</td>
                    <td><span className="badge badge-info">{t.routeHint || 'Transfer'}</span></td>
                    <td style={{ fontWeight: 600 }}>{t.productName}</td>
                    <td style={{ textAlign: 'right' }}>{t.quantity}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(t.totalCostRecorded ?? 0)}</td>
                    <td>{t.fromLabel}</td>
                    <td>{t.toLabel}</td>
                    <td style={{ fontSize: 13 }}>{t.transferredByName ?? '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 180 }}>{t.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )
  }

  if (type === 'stock-alerts') return (
    <>
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card warning"><div className="stat-label">Low Stock Items</div><div className="stat-value">{data.lowStockCount}</div></div>
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead><tr><th>Product</th><th>Stock</th><th>Alert Level</th><th>Supplier</th><th>Status</th></tr></thead>
          <tbody>
            {data.inventory?.map(i => (
              <tr key={`${i.branchId}-${i.productId}`}>
                <td style={{ fontWeight: 600 }}>{i.product.name}</td>
                <td>{i.quantity}</td>
                <td>{i.lowStockAlert}</td>
                <td style={{ color: 'var(--text-muted)' }}>{i.supplier || '—'}</td>
                <td><span className={`badge ${i.isLowStock ? 'badge-warning' : 'badge-success'}`}>{i.isLowStock ? 'Low' : 'OK'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )

  return null
}
