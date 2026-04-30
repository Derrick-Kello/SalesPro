import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { api } from '../api/client'
import { useCurrency } from '../context/CurrencyContext'
import { useAlert } from '../context/AlertContext'
import { getMotherVariantName, normalizeMotherName } from '../utils/variantGrouping'
import { MoreVertical } from 'lucide-react'

export default function PurchaseMotherDetailsPage() {
  const [params] = useSearchParams()
  const { fmt } = useCurrency()
  const { showError, showSuccess } = useAlert()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [editRow, setEditRow] = useState(null)
  const [editSupplier, setEditSupplier] = useState('')
  const [editNote, setEditNote] = useState('')

  const mother = params.get('mother') || ''
  const warehouseId = params.get('warehouseId') || ''
  const startDate = params.get('startDate') || ''
  const endDate = params.get('endDate') || ''

  async function load() {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (warehouseId) qs.set('warehouseId', warehouseId)
      if (startDate) qs.set('startDate', startDate)
      if (endDate) qs.set('endDate', endDate)
      const list = await api.get(`/purchase/warehouse-receipts${qs.toString() ? `?${qs}` : ''}`)
      const needle = normalizeMotherName(mother)
      const filtered = (Array.isArray(list) ? list : []).filter((r) => normalizeMotherName(r?.product?.name) === needle)
      setRows(filtered)
    } catch (err) {
      showError(err.message || 'Could not load variant details')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [mother, warehouseId, startDate, endDate])

  const summary = useMemo(() => {
    return rows.reduce((acc, r) => {
      acc.qty += Number(r.quantity || 0)
      acc.value += Number(r.lineValueTotal || 0)
      acc.paid += r.isPaid ? 1 : 0
      return acc
    }, { qty: 0, value: 0, paid: 0 })
  }, [rows])

  async function deleteRow(id) {
    if (!confirm('Delete this receipt line?')) return
    try {
      await api.delete(`/purchase/warehouse-receipts/${id}`)
      showSuccess('Receipt line deleted')
      load()
    } catch (err) {
      showError(err.message || 'Could not delete receipt line')
    }
  }

  async function returnRow(row) {
    if (!confirm(`Return purchase line "${row.product?.name || row.id}"?`)) return
    try {
      await api.post('/purchase/warehouse-receipts/bulk-return', { ids: [row.id], note: `Returned from details` })
      showSuccess('Purchase return recorded')
      load()
    } catch (err) {
      showError(err.message || 'Could not process return')
    }
  }

  async function payRow(row, status) {
    try {
      await api.post('/purchase/warehouse-receipts/bulk-payment', { ids: [row.id], paymentStatus: status })
      showSuccess('Payment status updated')
      load()
    } catch (err) {
      showError(err.message || 'Could not update payment')
    }
  }

  async function saveEditRow() {
    if (!editRow) return
    try {
      await api.patch('/purchase/warehouse-receipts/bulk-edit', {
        ids: [editRow.id],
        supplier: editSupplier,
        note: editNote,
      })
      showSuccess('Purchase updated')
      setEditRow(null)
      load()
    } catch (err) {
      showError(err.message || 'Could not update line')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Navbar />
      <main className="dashboard-main" style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div className="section-header">
          <h2>Mother Variant Details</h2>
          <Link className="btn btn-outline" to="/dashboard">Back to Dashboard</Link>
        </div>
        <div style={{ marginBottom: 14, color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text)' }}>{mother || 'Unknown variant'}</strong>
          <span> · Total Qty: {summary.qty} · Total Value: {fmt(summary.value)} · Paid lines: {summary.paid}/{rows.length}</span>
        </div>

        <div className="table-container" style={{ minHeight: 420, paddingBottom: 120 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Warehouse</th>
                <th>Variant Item</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Unit cost</th>
                <th style={{ textAlign: 'right' }}>Line value</th>
                <th>Status</th>
                <th>Supplier</th>
                <th>Received by</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px 0' }}>Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px 0' }}>No items under this mother variant.</td></tr>
              )}
              {!loading && rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontSize: 12.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}
                  </td>
                  <td style={{ fontWeight: 600 }}>{r.warehouse?.name ?? '—'}</td>
                  <td>{r.product?.name ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{r.quantity}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(r.unitCostSnapshot ?? 0)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(r.lineValueTotal ?? 0)}</td>
                  <td>
                    <span className={`badge ${r.isPaid ? 'badge-success' : 'badge-warning'}`}>
                      {r.isPaid ? 'Paid' : 'Unpaid'}
                    </span>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{r.supplier || '—'}</td>
                  <td style={{ fontSize: 13 }}>{r.receivedBy?.fullName ?? '—'}</td>
                  <td>
                    <details style={{ position: 'relative' }}>
                      <summary className="icon-btn" style={{ listStyle: 'none', cursor: 'pointer' }} title="Actions">
                        <MoreVertical size={14} strokeWidth={2} />
                      </summary>
                      <div
                        className="card"
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: 'calc(100% + 6px)',
                          zIndex: 20,
                          minWidth: 180,
                          maxHeight: 220,
                          overflowY: 'auto',
                          padding: 8,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => {
                            setEditRow(r)
                            setEditSupplier(r.supplier || '')
                            setEditNote(r.note || '')
                          }}
                        >
                          Edit Purchase
                        </button>
                        <button className="btn btn-sm btn-outline" onClick={() => returnRow(r)}>
                          Purchase Return
                        </button>
                        <button className="btn btn-sm btn-outline" onClick={() => payRow(r, 'PAID')}>
                          Create Payment
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => deleteRow(r.id)}>
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

        {editRow && (
          <div className="card" style={{ marginTop: 14, padding: 14 }}>
            <h4 style={{ marginBottom: 8 }}>Edit line #{editRow.id}</h4>
            <div className="form-row">
              <div className="form-group">
                <label>Supplier</label>
                <input value={editSupplier} onChange={(e) => setEditSupplier(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Note</label>
                <input value={editNote} onChange={(e) => setEditNote(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setEditRow(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEditRow}>Save</button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

