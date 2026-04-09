import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '../../api/client'
import { useBranch } from '../../context/BranchContext'
import { useCurrency } from '../../context/CurrencyContext'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from 'recharts'
import { DollarSign, ShoppingBag, TrendingDown, AlertTriangle, RefreshCw } from 'lucide-react'

const PIE_COLORS = ['#0066CC','#28A745','#E07900','#D93025','#0891B2','#6366F1','#EC4899','#14B8A6']
const POLL_INTERVAL = 30_000 // 30 seconds

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="stat-card" style={{ borderTop: `3px solid ${color}` }}>
      <div className="stat-icon" style={{ color }}><Icon size={20} strokeWidth={2} /></div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  )
}

export default function Overview() {
  const [stats, setStats]       = useState(null)
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const timerRef = useRef(null)
  const { selectedBranchId } = useBranch()
  const { fmt } = useCurrency()

  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) setLoading(s => s)
    else setRefreshing(true)
    try {
      const params = selectedBranchId ? `?branchId=${selectedBranchId}` : ''
      const data = await api.get(`/reports/overview-stats${params}`)
      setStats(data)
      setLastUpdated(new Date())
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [selectedBranchId])

  useEffect(() => {
    fetchStats(false)
    timerRef.current = setInterval(() => fetchStats(true), POLL_INTERVAL)
    return () => clearInterval(timerRef.current)
  }, [fetchStats])

  const weeklyData = (stats?.weeklyChart || []).map(d => ({
    ...d,
    date: new Date(d.date + 'T00:00:00').toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }),
    sales: parseFloat((d.sales || 0).toFixed(2)),
    expenses: parseFloat((d.expenses || 0).toFixed(2)),
  }))

  if (loading && !stats) return (
    <div style={{ padding: 32, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 10 }}>
      <RefreshCw size={16} className="spin" /> Loading dashboard…
    </div>
  )

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Dashboard Overview</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lastUpdated && (
            <span style={{ fontSize: 12, color: 'var(--text-light)' }}>
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            className="btn btn-outline btn-sm"
            onClick={() => fetchStats(true)}
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <RefreshCw size={13} strokeWidth={2} className={refreshing ? 'spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <StatCard icon={DollarSign} label="Sales This Month"      value={fmt(stats?.totalSales ?? 0)}    color="var(--primary)" />
        <StatCard icon={ShoppingBag} label="Transactions"          value={stats?.totalTransactions ?? 0}                color="var(--success)" />
        <StatCard icon={TrendingDown} label="Expenses This Month"  value={fmt(stats?.totalExpenses ?? 0)} color="var(--danger)" />
        <StatCard icon={AlertTriangle} label="Low Stock Alerts"    value={stats?.lowStockCount ?? 0}                    color="var(--warning)" />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginBottom: 16 }}>Weekly Sales & Expenses</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeklyData} margin={{ top: 0, right: 8, left: -10, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => fmt(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="sales"    name="Sales"    fill="var(--primary)" radius={[4,4,0,0]} />
              <Bar dataKey="expenses" name="Expenses" fill="var(--danger)"  radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginBottom: 16 }}>Top Selling Products</h3>
          {stats?.topProducts?.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={stats.topProducts} dataKey="qty" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {stats.topProducts.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [`${v} units`, n]} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No sales data yet.</p>}
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginBottom: 12 }}>Top Products This Month</h3>
          {stats?.topProducts?.length
            ? stats.topProducts.slice(0, 6).map((p, i) => (
                <div key={p.id} className="list-item">
                  <span style={{ fontSize: 12, color: 'var(--text-light)', marginRight: 8 }}>#{i+1}</span>
                  <span className="list-item-name">{p.name}</span>
                  <span className="list-item-value">{p.qty} sold</span>
                </div>
              ))
            : <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No sales yet.</p>
          }
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginBottom: 12 }}>Stock Alerts</h3>
          {stats?.lowStockItems?.length
            ? stats.lowStockItems.map((item, idx) => (
                <div key={idx} className="list-item">
                  <span className="list-item-name">{item.name}</span>
                  <span className="list-item-value" style={{ color: item.qty === 0 ? 'var(--danger)' : 'var(--warning)' }}>
                    {item.qty === 0 ? 'Out' : `${item.qty} left`}
                  </span>
                </div>
              ))
            : <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>All stock levels healthy.</p>
          }
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginBottom: 12 }}>Payment Methods</h3>
          {stats?.paymentBreakdown?.length ? (
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={stats.paymentBreakdown} dataKey="amount" nameKey="method" cx="50%" cy="50%" outerRadius={60}>
                  {stats.paymentBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => fmt(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={v => v.replace('_', ' ')} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No payment data yet.</p>}
        </div>
      </div>
    </div>
  )
}
