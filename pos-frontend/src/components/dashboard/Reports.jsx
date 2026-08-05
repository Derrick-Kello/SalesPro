import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useBranch } from '../../context/BranchContext'
import { useCurrency } from '../../context/CurrencyContext'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import WarehouseReportSection from './WarehouseReportSection'
import SalesReportSection from './SalesReportSection'
import Modal from '../Modal'
import { fmtDate } from '../../utils/dateFormat'
import DateRangeFilter from '../DateRangeFilter'
import { FileDown, FileText } from 'lucide-react'
import { makeMoney, downloadReportCsv, downloadReportPdf } from '../../utils/reportExport'
import { buildReportModel } from '../../utils/reportModels'

export default function Reports({ subSection = 'sales-report' }) {
  const { user } = useAuth()
  const { selectedBranchId } = useBranch()
  const { fmt, currency } = useCurrency()
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
  const [exportFormat, setExportFormat] = useState(null)
  const [exportLayout, setExportLayout] = useState('both')

  const effectiveBranchId =
    subSection === 'warehouse-report'
      ? (isAdmin ? (reportBranchId ?? null) : (isManager ? user?.branchId : null))
      : (isAdmin ? (reportBranchId ?? selectedBranchId) : (isManager ? user?.branchId : null))

  // Admins pick a branch from this list; managers only need it so exports can
  // name their branch (the picker below stays admin-only).
  useEffect(() => {
    if (isAdmin || isManager) {
      api.get('/branches').then(setBranches).catch(() => {})
    }
  }, [isAdmin, isManager])

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

  // Date inputs are only applied when the user picks a complete date (or on subSection/branch change).
  // Do NOT include startDate/endDate in the effect — DateRangeFilter calls loadWithDates directly
  // once both values are complete, avoiding partial-date requests.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadWithDates(startDate, endDate) }, [subSection, effectiveBranchId, reportWarehouseId])

  async function loadWithDates(s = startDate, e = endDate) {
    setLoading(true); setData(null)
    try {
      const params = new URLSearchParams()
      if (s) params.append('startDate', s)
      if (e) params.append('endDate', e)
      if (effectiveBranchId) params.append('branchId', effectiveBranchId)
      const qs = params.toString() ? '?' + params : ''

      if (subSection === 'warehouse-report') {
        const wp = new URLSearchParams()
        if (reportWarehouseId) wp.append('warehouseId', reportWarehouseId)
        if (s) wp.append('startDate', s)
        if (e) wp.append('endDate', e)
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

  const canExport = !loading && !!data && !data.error

  function currentModel(layout = 'both') {
    const branchLabel = effectiveBranchId
      ? (branches.find(b => b.id === effectiveBranchId)?.name ?? `Branch #${effectiveBranchId}`)
      : 'All branches'
    const warehouseLabel = reportWarehouseId
      ? (warehouses.find(w => w.id === reportWarehouseId)?.name ?? `Warehouse #${reportWarehouseId}`)
      : 'All warehouses'

    const meta = [
      `Period: ${startDate || endDate ? `${startDate ? fmtDate(startDate) : 'start'} → ${endDate ? fmtDate(endDate) : 'today'}` : 'All time'}`,
      `Branch: ${branchLabel}`,
    ]
    if (subSection === 'warehouse-report') meta.push(`Warehouse: ${warehouseLabel}`)
    if (subSection === 'payments') meta[0] = 'Period: last 7 days'
    if (subSection === 'stock-alerts') meta[0] = 'Period: current stock levels'
    meta.push(`Amounts in ${currency?.code || ''}`.trim())
    meta.push(`Exported by: ${user?.fullName || user?.username || '—'}`)

    return buildReportModel({
      type: subSection,
      data,
      title: titles[subSection] || 'Report',
      meta,
      money: makeMoney(currency?.code),
      layout,
    })
  }

  // The sales report ships in two shapes (size grids / size lines), so it asks
  // what to include first; every other report downloads straight away.
  function startExport(format) {
    if (subSection === 'sales-report') { setExportFormat(format); return }
    download(format, 'both')
  }

  function download(format, layout) {
    const model = currentModel(layout)
    if (format === 'csv') downloadReportCsv(model)
    else downloadReportPdf(model)
    setExportFormat(null)
  }

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 16 }}>
        <h2>{titles[subSection] || 'Reports'}</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
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
          )}
          {(subSection === 'sales-report' || subSection === 'payments' || subSection === 'profit-loss' || subSection === 'user-report' || subSection === 'warehouse-report') && (
            <DateRangeFilter
              startDate={startDate}
              endDate={endDate}
              onStartChange={setStartDate}
              onEndChange={setEndDate}
              onChange={(s, e) => loadWithDates(s, e)}
              loading={loading}
            />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-outline"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              disabled={!canExport}
              title={canExport ? 'Download this report as CSV' : 'Nothing to export yet'}
              onClick={() => startExport('csv')}
            >
              <FileDown size={16} strokeWidth={2} /> CSV
            </button>
            <button
              type="button"
              className="btn btn-outline"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              disabled={!canExport}
              title={canExport ? 'Download this report as PDF' : 'Nothing to export yet'}
              onClick={() => startExport('pdf')}
            >
              <FileText size={16} strokeWidth={2} /> PDF
            </button>
          </div>
        </div>
      </div>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
      {data?.error && <p style={{ color: 'var(--danger)' }}>{data.error}</p>}
      {!loading && data && !data.error && (
        <ReportBody type={subSection} data={data} fmt={fmt} title={titles[subSection]} onRefresh={() => loadWithDates()} />
      )}

      {exportFormat && (
        <ExportLayoutModal
          format={exportFormat}
          layout={exportLayout}
          onLayout={setExportLayout}
          onClose={() => setExportFormat(null)}
          onDownload={() => download(exportFormat, exportLayout)}
        />
      )}
    </div>
  )
}

const EXPORT_LAYOUTS = [
  { id: 'grids', label: 'Size grids only', hint: 'One block per product and colour, sizes across the top — the client format.' },
  { id: 'lines', label: 'Size line table only', hint: 'One row per size with quantity and revenue, for reconciling figures.' },
  { id: 'both', label: 'Both', hint: 'Size grids first, then the size line table.' },
]

function ExportLayoutModal({ format, layout, onLayout, onClose, onDownload }) {
  return (
    <Modal
      title={`Download Sales Report (${format.toUpperCase()})`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={onDownload}>
            <FileDown size={15} strokeWidth={2.5} /> Download
          </button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
        Choose what goes into the file. The summary figures are always included.
      </p>
      {EXPORT_LAYOUTS.map((opt) => (
        <label
          key={opt.id}
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
            padding: '12px 14px',
            marginBottom: 8,
            borderRadius: 10,
            cursor: 'pointer',
            border: `1.5px solid ${layout === opt.id ? 'var(--primary)' : 'var(--border)'}`,
            background: layout === opt.id ? 'var(--primary-light)' : 'var(--surface)',
          }}
        >
          <input
            type="radio"
            name="export-layout"
            checked={layout === opt.id}
            onChange={() => onLayout(opt.id)}
            style={{ marginTop: 3, width: 'auto' }}
          />
          <span>
            <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5 }}>{opt.label}</span>
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.45 }}>
              {opt.hint}
            </span>
          </span>
        </label>
      ))}
    </Modal>
  )
}

function ReportBody({ type, data, fmt, title = '', onRefresh }) {
  if (type === 'sales-report') return <SalesReportSection data={data} fmt={fmt} />

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
    return (
      <WarehouseReportSection
        data={data}
        fmt={fmt}
        title={title}
        onRefresh={onRefresh}
      />
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
