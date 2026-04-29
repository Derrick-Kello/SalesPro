import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { useCurrency } from '../../context/CurrencyContext'
import { useTabRefresh } from '../../hooks/useTabRefresh'
import { LoadingRow } from '../LoadingRow'

export default function PurchaseHistory() {
  const { fmt } = useCurrency()
  const [rows, setRows] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [loading, setLoading] = useState(true)
  const [warehouseId, setWarehouseId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  async function load(silent) {
    if (!silent) setLoading(true)
    try {
      const params = new URLSearchParams()
      if (warehouseId) params.append('warehouseId', warehouseId)
      if (startDate) params.append('startDate', startDate)
      if (endDate) params.append('endDate', endDate)
      const qs = params.toString() ? `?${params}` : ''
      const [wh, list] = await Promise.all([
        api.get('/warehouses'),
        api.get(`/purchase/warehouse-receipts${qs}`),
      ])
      setWarehouses(wh)
      setRows(Array.isArray(list) ? list : [])
    } catch {
      setRows([])
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  useTabRefresh('purchase-history', () => load(true))

  function applyFilter(e) {
    e?.preventDefault()
    load()
  }

  return (
    <div>
      <div className="section-header">
        <h2>Purchase history</h2>
        <button type="button" className="btn btn-outline" onClick={applyFilter}>Filter</button>
      </div>

      <form
        onSubmit={applyFilter}
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          marginBottom: 18,
        }}
      >
        <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
          <label>Warehouse</label>
          <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
            <option value="">All</option>
            {warehouses.filter(w => w.isActive !== false).map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>From</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Until</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
      </form>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Warehouse</th>
              <th>Outlet</th>
              <th>Product</th>
              <th style={{ textAlign: 'right' }}>Qty</th>
              <th style={{ textAlign: 'right' }}>Unit cost</th>
              <th style={{ textAlign: 'right' }}>Line value</th>
              <th>Supplier</th>
              <th>Received by</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow cols={10} />}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '36px 0' }}>
                  No receipts yet — use Purchase → Receive to warehouse.
                </td>
              </tr>
            )}
            {!loading && rows.map((r) => (
              <tr key={r.id}>
                <td style={{ fontSize: 12.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}
                </td>
                <td style={{ fontWeight: 600 }}>{r.warehouse?.name ?? '—'}</td>
                <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {r.warehouse?.branchName ?? '—'}
                </td>
                <td>{r.product?.name ?? '—'}</td>
                <td style={{ textAlign: 'right' }}>{r.quantity}</td>
                <td style={{ textAlign: 'right' }}>{fmt(r.unitCostSnapshot ?? 0)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(r.lineValueTotal ?? 0)}</td>
                <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{r.supplier || '—'}</td>
                <td style={{ fontSize: 13 }}>{r.receivedBy?.fullName ?? '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 160 }}>{r.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
