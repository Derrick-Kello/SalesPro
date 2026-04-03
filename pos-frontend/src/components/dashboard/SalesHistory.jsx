import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import Modal from '../Modal'
import { Eye, Filter } from 'lucide-react'

export default function SalesHistory() {
  const { user } = useAuth()
  const canCancel = user?.role === 'ADMIN' || user?.role === 'MANAGER'
  const [sales, setSales]         = useState([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate]     = useState('')
  const [detail, setDetail]       = useState(null)
  const [detailModal, setDetailModal] = useState(false)

  async function load() {
    const params = new URLSearchParams()
    if (startDate) params.append('startDate', startDate)
    if (endDate)   params.append('endDate', endDate)
    const data = await api.get(`/sales${params.toString() ? '?' + params : ''}`)
    setSales(data)
  }

  useEffect(() => { load() }, [])

  async function viewSale(id) {
    const data = await api.get(`/sales/${id}`)
    setDetail(data); setDetailModal(true)
  }

  async function cancelSale(id) {
    if (!confirm('Cancel this sale and restore stock?')) return
    await api.put(`/sales/${id}/cancel`, {})
    setDetailModal(false); load()
  }

  const statusClass = s =>
    s === 'COMPLETED' ? 'badge-success' :
    s === 'CANCELLED' ? 'badge-danger'  : 'badge-warning'

  return (
    <div>
      <div className="section-header">
        <h2>Sales History</h2>
        <div className="date-filters">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          <button className="btn btn-outline" onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Filter size={13} strokeWidth={2} /> Filter
          </button>
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Date</th>
              <th>Cashier</th>
              <th>Customer</th>
              <th>Total</th>
              <th>Payment</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>No sales found</td></tr>
            )}
            {sales.map(s => (
              <tr key={s.id}>
                <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>#{s.id}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(s.createdAt).toLocaleString()}</td>
                <td>{s.user.fullName}</td>
                <td>{s.customer?.name || <span style={{ color: 'var(--text-light)' }}>Walk-in</span>}</td>
                <td style={{ fontWeight: 700 }}>${s.grandTotal.toFixed(2)}</td>
                <td style={{ color: 'var(--text-muted)' }}>{s.payment?.method?.replace('_', ' ') || '—'}</td>
                <td><span className={`badge ${statusClass(s.status)}`}>{s.status}</span></td>
                <td>
                  <button className="icon-btn primary" title="View details" onClick={() => viewSale(s.id)}>
                    <Eye size={13} strokeWidth={2} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detailModal && detail && (
        <Modal
          title="Sale Details"
          onClose={() => setDetailModal(false)}
          size="lg"
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setDetailModal(false)}>Close</button>
              {canCancel && detail.status === 'COMPLETED' && (
                <button className="btn btn-warning" onClick={() => cancelSale(detail.id)}>Cancel Sale</button>
              )}
            </>
          }
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>Transaction #{detail.id}</span>
            <span className={`badge ${statusClass(detail.status)}`}>{detail.status}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', marginBottom: 20, fontSize: 13.5, background: 'var(--surface2)', padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div><span style={{ color: 'var(--text-muted)' }}>Date: </span><strong>{new Date(detail.createdAt).toLocaleString()}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Cashier: </span><strong>{detail.user.fullName}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Customer: </span><strong>{detail.customer?.name || 'Walk-in'}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Payment: </span><strong>{detail.payment?.method?.replace('_', ' ') || '—'}</strong></div>
          </div>

          <table className="report-table">
            <thead>
              <tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th></tr>
            </thead>
            <tbody>
              {detail.saleItems.map(i => (
                <tr key={i.id}>
                  <td>{i.product.name}</td>
                  <td>{i.quantity}</td>
                  <td>${i.unitPrice.toFixed(2)}</td>
                  <td style={{ fontWeight: 600 }}>${i.subtotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ textAlign: 'right', marginTop: 16, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
            <div>Subtotal: <strong>${detail.totalAmount.toFixed(2)}</strong></div>
            {detail.discount > 0 && <div>Discount: <strong>−${detail.discount.toFixed(2)}</strong></div>}
            <div>Tax: <strong>${detail.tax.toFixed(2)}</strong></div>
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 6, paddingTop: 8, borderTop: '1.5px solid var(--border)' }}>
              Total: ${detail.grandTotal.toFixed(2)}
            </div>
            {detail.payment?.change > 0 && <div>Change: <strong>${detail.payment.change.toFixed(2)}</strong></div>}
          </div>
        </Modal>
      )}
    </div>
  )
}
