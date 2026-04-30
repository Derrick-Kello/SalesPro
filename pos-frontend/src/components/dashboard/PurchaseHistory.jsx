import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { useCurrency } from '../../context/CurrencyContext'
import { useAlert } from '../../context/AlertContext'
import { useTabRefresh } from '../../hooks/useTabRefresh'
import { LoadingRow } from '../LoadingRow'
import { buildMotherGroupKey, getMotherVariantName } from '../../utils/variantGrouping'
import { MoreVertical } from 'lucide-react'

export default function PurchaseHistory() {
  const { fmt } = useCurrency()
  const { showError, showSuccess } = useAlert()
  const [rows, setRows] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [loading, setLoading] = useState(true)
  const [warehouseId, setWarehouseId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [editGroup, setEditGroup] = useState(null)
  const [paymentGroup, setPaymentGroup] = useState(null)
  const [editSupplier, setEditSupplier] = useState('')
  const [editNote, setEditNote] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('UNPAID')

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

  const groupsMap = new Map()
  for (const r of rows) {
    const key = buildMotherGroupKey(r)
    const motherName = getMotherVariantName(r?.product?.name)
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        key,
        motherName,
        warehouse: r.warehouse || null,
        latestAt: r.createdAt,
        qty: 0,
        value: 0,
        supplierSet: new Set(),
        receiptIds: [],
        paidCount: 0,
        totalCount: 0,
        rows: [],
      })
    }
    const g = groupsMap.get(key)
    g.qty += Number(r.quantity || 0)
    g.value += Number(r.lineValueTotal || 0)
    g.receiptIds.push(r.id)
    g.totalCount += 1
    g.rows.push(r)
    if (r.isPaid) g.paidCount += 1
    if (r.supplier) g.supplierSet.add(r.supplier)
    if (r.createdAt && (!g.latestAt || new Date(r.createdAt) > new Date(g.latestAt))) g.latestAt = r.createdAt
  }
  const groups = [...groupsMap.values()]
    .map((g) => ({ ...g, suppliers: [...g.supplierSet] }))
    .sort((a, b) => new Date(b.latestAt || 0) - new Date(a.latestAt || 0))

  function groupPaymentState(g) {
    const set = new Set(
      (g.rows || []).map((r) =>
        String(r.paymentStatus || (r.isPaid ? 'PAID' : 'UNPAID')).toUpperCase()
      )
    )
    if (set.size === 1) return [...set][0]
    return 'MIXED'
  }

  async function deleteGroup(g) {
    if (!confirm(`Delete ${g.receiptIds.length} receipt line(s) under "${g.motherName}"?`)) return
    try {
      for (const id of g.receiptIds) {
        // eslint-disable-next-line no-await-in-loop
        await api.delete(`/purchase/warehouse-receipts/${id}`)
      }
      showSuccess(`Deleted ${g.receiptIds.length} receipt line(s).`)
      load()
    } catch (err) {
      showError(err.message || 'Could not delete grouped receipts')
    }
  }

  async function saveGroupEdit() {
    if (!editGroup) return
    try {
      await api.patch('/purchase/warehouse-receipts/bulk-edit', {
        ids: editGroup.receiptIds,
        supplier: editSupplier,
        note: editNote,
      })
      showSuccess('Purchase updated')
      setEditGroup(null)
      load(true)
    } catch (err) {
      showError(err.message || 'Could not update purchase')
    }
  }

  async function applyPaymentStatus() {
    if (!paymentGroup) return
    try {
      await api.post('/purchase/warehouse-receipts/bulk-payment', {
        ids: paymentGroup.receiptIds,
        paymentStatus,
      })
      showSuccess('Payment status updated')
      setPaymentGroup(null)
      load(true)
    } catch (err) {
      showError(err.message || 'Could not update payment status')
    }
  }

  async function returnGroup(g) {
    if (!confirm(`Create purchase return for "${g.motherName}"?`)) return
    try {
      await api.post('/purchase/warehouse-receipts/bulk-return', {
        ids: g.receiptIds,
        note: `Returned from mother variant ${g.motherName}`,
      })
      showSuccess('Purchase return recorded')
      load(true)
    } catch (err) {
      showError(err.message || 'Could not process return')
    }
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

      <div className="table-container" style={{ minHeight: 420, paddingBottom: 120 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Warehouse</th>
              <th>Outlet</th>
              <th>Mother Variant</th>
              <th style={{ textAlign: 'right' }}>Qty</th>
              <th style={{ textAlign: 'right' }}>Total value</th>
              <th>Status</th>
              <th>Supplier</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow cols={9} />}
            {!loading && groups.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '36px 0' }}>
                  No receipts yet — use Purchase → Receive to warehouse.
                </td>
              </tr>
            )}
            {!loading && groups.map((g) => (
              <tr key={g.key}>
                <td style={{ fontSize: 12.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {g.latestAt ? new Date(g.latestAt).toLocaleString() : '—'}
                </td>
                <td style={{ fontWeight: 600 }}>{g.warehouse?.name ?? '—'}</td>
                <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {g.warehouse?.branchName ?? '—'}
                </td>
                <td style={{ fontWeight: 600 }}>{g.motherName}</td>
                <td style={{ textAlign: 'right' }}>{g.qty}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(g.value)}</td>
                <td>
                  <span className={`badge ${
                    groupPaymentState(g) === 'PAID'
                      ? 'badge-success'
                      : groupPaymentState(g) === 'MIXED'
                        ? 'badge-info'
                        : 'badge-warning'
                  }`}>
                    {groupPaymentState(g)}
                  </span>
                </td>
                <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{g.suppliers[0] || '—'}{g.suppliers.length > 1 ? ` +${g.suppliers.length - 1}` : ''}</td>
                <td>
                  <details style={{ position: 'relative' }}>
                    <summary
                      className="icon-btn"
                      style={{ listStyle: 'none', cursor: 'pointer' }}
                      title="Actions"
                    >
                      <MoreVertical size={14} strokeWidth={2} />
                    </summary>
                    <div
                      className="card"
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 'calc(100% + 6px)',
                        zIndex: 20,
                        minWidth: 190,
                        maxHeight: 220,
                        overflowY: 'auto',
                        padding: 8,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <Link
                        className="btn btn-sm btn-outline"
                        to={`/dashboard/purchase-history/details?warehouseId=${encodeURIComponent(String(g.warehouse?.id || ''))}&mother=${encodeURIComponent(g.motherName)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`}
                      >
                        Details
                      </Link>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => {
                          setEditGroup(g)
                          setEditSupplier(g.suppliers[0] || '')
                          setEditNote('')
                        }}
                      >
                        Edit Purchase
                      </button>
                      <button className="btn btn-sm btn-outline" onClick={() => returnGroup(g)}>
                        Purchase Return
                      </button>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => {
                          setPaymentGroup(g)
                          const st = groupPaymentState(g)
                          setPaymentStatus(st === 'MIXED' ? 'UNPAID' : st)
                        }}
                      >
                        Create Payment
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => deleteGroup(g)}>
                        Delete Purchase
                      </button>
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editGroup && (
        <div className="card" style={{ marginTop: 14, padding: 14 }}>
          <h4 style={{ marginBottom: 8 }}>Edit Purchase — {editGroup.motherName}</h4>
          <div className="form-row">
            <div className="form-group">
              <label>Supplier</label>
              <input value={editSupplier} onChange={(e) => setEditSupplier(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Note</label>
              <input value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Optional note" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" onClick={() => setEditGroup(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveGroupEdit}>Save</button>
          </div>
        </div>
      )}

      {paymentGroup && (
        <div className="card" style={{ marginTop: 14, padding: 14 }}>
          <h4 style={{ marginBottom: 8 }}>Create Payment — {paymentGroup.motherName}</h4>
          <div className="form-group">
            <label>Status</label>
            <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
              <option value="UNPAID">Unpaid</option>
              <option value="PARTIAL">Partial</option>
              <option value="PAID">Paid</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" onClick={() => setPaymentGroup(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={applyPaymentStatus}>Apply</button>
          </div>
        </div>
      )}
    </div>
  )
}
