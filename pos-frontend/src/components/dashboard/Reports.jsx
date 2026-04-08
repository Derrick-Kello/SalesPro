import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useBranch } from '../../context/BranchContext'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

export default function Reports({ subSection = 'sales-report' }) {
  const { user } = useAuth()
  const { selectedBranchId } = useBranch()
  const isAdmin = user?.role === 'ADMIN'
  const isManager = user?.role === 'MANAGER'

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [branches, setBranches] = useState([])
  const [reportBranchId, setReportBranchId] = useState(null)

  // Determine effective branchId: admin uses dropdown, manager uses their own
  const effectiveBranchId = isAdmin ? (reportBranchId ?? selectedBranchId) : (isManager ? user?.branchId : null)

  useEffect(() => {
    if (isAdmin) {
      api.get('/branches').then(setBranches).catch(() => {})
    }
  }, [isAdmin])

  useEffect(() => { load() }, [subSection, effectiveBranchId])

  async function load() {
    setLoading(true); setData(null)
    try {
      const params = new URLSearchParams()
      if (startDate) params.append('startDate', startDate)
      if (endDate) params.append('endDate', endDate)
      if (effectiveBranchId) params.append('branchId', effectiveBranchId)
      const qs = params.toString() ? '?' + params : ''

      if (subSection === 'sales-report') {
        setData(await api.get(`/reports/products${qs}`))
      } else if (subSection === 'payments') {
        setData(await api.get(`/reports/weekly${qs}`))
      } else if (subSection === 'profit-loss') {
        setData(await api.get(`/reports/overview-stats${qs}`))
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
          {(subSection === 'sales-report' || subSection === 'payments') && (
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
      {!loading && data && !data.error && <ReportBody type={subSection} data={data} />}
    </div>
  )
}

function ReportBody({ type, data }) {
  if (type === 'sales-report') return (
    <div className="table-container">
      <table className="data-table">
        <thead><tr><th>Product</th><th>Category</th><th>Qty Sold</th><th>Revenue</th></tr></thead>
        <tbody>
          {data.length
            ? data.map(p => <tr key={p.productId}><td>{p.name}</td><td><span className="badge badge-info">{p.category}</span></td><td>{p.totalQuantity}</td><td style={{ fontWeight: 700 }}>${p.totalRevenue.toFixed(2)}</td></tr>)
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
          <div className="stat-card"><div className="stat-label">Weekly Revenue</div><div className="stat-value">${data.totalRevenue?.toFixed(2)}</div></div>
          <div className="stat-card success"><div className="stat-label">Transactions</div><div className="stat-value">{data.totalTransactions}</div></div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginBottom: 16 }}>Daily Revenue</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => `${v}`} />
              <Bar dataKey="revenue" name="Revenue" fill="var(--primary)" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </>
    )
  }

  if (type === 'profit-loss') return (
    <div className="stats-grid">
      <div className="stat-card"><div className="stat-label">Total Sales</div><div className="stat-value" style={{ color: 'var(--success)' }}>${data.totalSales?.toFixed(2)}</div></div>
      <div className="stat-card"><div className="stat-label">Total Expenses</div><div className="stat-value" style={{ color: 'var(--danger)' }}>${data.totalExpenses?.toFixed(2)}</div></div>
      <div className="stat-card"><div className="stat-label">Net Profit</div>
        <div className="stat-value" style={{ color: (data.totalSales - data.totalExpenses) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
          ${(data.totalSales - data.totalExpenses).toFixed(2)}
        </div>
      </div>
      <div className="stat-card"><div className="stat-label">Transactions</div><div className="stat-value">{data.totalTransactions}</div></div>
    </div>
  )

  if (type === 'user-report') return (
    <div className="table-container">
      <table className="data-table">
        <thead><tr><th>Name</th><th>Username</th><th>Sales</th><th>Revenue</th></tr></thead>
        <tbody>
          {data.length
            ? data.map(c => <tr key={c.userId}><td style={{ fontWeight: 600 }}>{c.fullName}</td><td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{c.username}</td><td>{c.totalSales}</td><td style={{ fontWeight: 700 }}>${c.totalRevenue.toFixed(2)}</td></tr>)
            : <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>No data</td></tr>}
        </tbody>
      </table>
    </div>
  )

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
