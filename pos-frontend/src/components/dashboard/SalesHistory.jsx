import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { useBranch } from '../../context/BranchContext'
import { useCurrency } from '../../context/CurrencyContext'
import { usePermissions } from '../../context/PermissionContext'
import Modal from '../Modal'
import { LoadingRow } from '../LoadingRow'
import { useAsync } from '../../hooks/useAsync'
import { useTabRefresh } from '../../hooks/useTabRefresh'
import { useAuth } from '../../context/AuthContext'
import { useAlert } from '../../context/AlertContext'
import { Eye, Filter, Trash2, Pencil } from 'lucide-react'

export default function SalesHistory() {
  const { user } = useAuth()
  const { showError } = useAlert()
  const { selectedBranchId } = useBranch()
  const { fmt } = useCurrency()
  const { can } = usePermissions()
  const [sales, setSales]             = useState([])
  const [startDate, setStartDate]     = useState('')
  const [endDate, setEndDate]         = useState('')
  const [detail, setDetail]           = useState(null)
  const [detailModal, setDetailModal] = useState(false)
  const [tableLoading, setTableLoading] = useState(true)
  const [filtering, setFiltering]     = useState(false)
  const [viewLoading,, runView]       = useAsync()
  const [cancelling,, runCancel]      = useAsync()
  const [editOpen, setEditOpen]        = useState(false)
  const [editAddition, setEditAddition]= useState('')
  const [editSaving, setEditSaving]    = useState(false)
  const [selectedIds, setSelectedIds]  = useState(() => ([]))
  const [bulkDeleting, setBulkDeleting]= useState(false)

  async function load(showFilter = false, silent = false) {
    if (!silent) {
      if (showFilter) setFiltering(true); else setTableLoading(true)
    }
    try {
      const params = new URLSearchParams()
      if (startDate) params.append('startDate', startDate)
      if (endDate)   params.append('endDate', endDate)
      if (selectedBranchId) params.append('branchId', selectedBranchId)
      setSales(await api.get(`/sales${params.toString() ? '?' + params : ''}`))
      if (!silent) setSelectedIds([])
    } catch {} finally { if (!silent) { setTableLoading(false); setFiltering(false) } }
  }

  useEffect(() => { load() }, [selectedBranchId])
  useTabRefresh('sales', () => load(false, true))

  async function viewSale(id) {
    const data = await runView(() => api.get(`/sales/${id}`))
    setDetail(data); setDetailModal(true)
  }

  async function cancelSale(id) {
    if (!confirm('Cancel this sale and restore stock?')) return
    await runCancel(() => api.put(`/sales/${id}/cancel`, {}))
    setDetailModal(false); load()
  }

  async function deleteSale(id) {
    if (!confirm('Permanently delete this sale? This cannot be undone.')) return
    try {
      await api.delete(`/sales/${id}`)
      setSelectedIds((prev) => prev.filter((i) => i !== id))
      load()
    } catch (err) { showError(err.message) }
  }

  async function deleteSelectedSales() {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    if (!confirm(`Permanently delete ${ids.length} sale(s)? This cannot be undone.`)) return
    setBulkDeleting(true)
    try {
      await api.post('/sales/bulk-delete', { ids })
      setSelectedIds([])
      load()
    } catch (err) {
      showError(err.message || 'Bulk delete failed')
    } finally {
      setBulkDeleting(false)
    }
  }

  function toggleSaleSelected(id, checked) {
    setSelectedIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id]
      return prev.filter((x) => x !== id)
    })
  }

  function toggleSelectAllVisible(checked) {
    if (!checked) {
      setSelectedIds([])
      return
    }
    setSelectedIds(sales.map((s) => s.id))
  }

  const canBulkDelete = can('sales.delete') && selectedIds.length > 0 && !tableLoading && !bulkDeleting
  const allVisibleSelected = sales.length > 0 && sales.every((s) => selectedIds.includes(s.id))

  const statusClass = s =>
    s === 'COMPLETED' ? 'badge-success'
    : s === 'PARTIALLY_PAID' ? 'badge-warning'
    : s === 'CANCELLED' ? 'badge-danger'
    : 'badge-warning'

  const isAdmin = user?.role === 'ADMIN'

  async function openPaymentEdit(row) {
    try {
      const fresh = await api.get(`/sales/${row.id}`)
      setDetail(fresh)
      setEditAddition('')
      setEditOpen(true)
    } catch (_) { showError('Could not load sale') }
  }

  async function saveAdditionalPayment() {
    if (!detail) return
    const n = parseFloat(editAddition)
    if (Number.isNaN(n) || n <= 0) {
      showError('Enter a positive additional amount')
      return
    }
    setEditSaving(true)
    try {
      const updated = await api.patch(`/sales/${detail.id}/payment`, { additionalAmountPaid: n })
      setDetail(updated)
      setEditOpen(false)
      setEditAddition('')
      await load(false, true)
    } catch (e) {
      showError(e.message || 'Could not save payment')
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <div>
      <div className="section-header">
        <h2>Sales History</h2>
        <div className="date-filters">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          <button className="btn btn-outline" onClick={() => load(true)} disabled={filtering} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            {filtering
              ? <span className="spin" style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid var(--border2)', borderTopColor: 'var(--primary)', borderRadius: '50%' }} />
              : <Filter size={13} strokeWidth={2} />
            }
            Filter
          </button>
        </div>
      </div>

      {can('sales.delete') && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={!canBulkDelete || bulkDeleting}
            onClick={deleteSelectedSales}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {bulkDeleting ? 'Deleting…' : `Delete selected (${selectedIds.length})`}
          </button>
          {selectedIds.length > 0 && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelectedIds([])} disabled={bulkDeleting}>
              Clear selection
            </button>
          )}
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            Tick rows below, then delete in one step.
          </span>
        </div>
      )}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              {can('sales.delete') && (
                <th style={{ width: 36, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    title="Select all on this page"
                    checked={allVisibleSelected}
                    disabled={tableLoading || sales.length === 0 || bulkDeleting}
                    onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                  />
                </th>
              )}
              <th>ID</th>
              <th>Date</th>
              <th>Cashier</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Discount</th>
              <th>Tax</th>
              <th>Shipping</th>
              <th>Paid</th>
              <th>Balance</th>
              <th>Grand Total</th>
              <th>Payment</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tableLoading && <LoadingRow cols={can('sales.delete') ? 15 : 14} />}
            {!tableLoading && sales.length === 0 && <tr><td colSpan={can('sales.delete') ? 15 : 14} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>No sales found</td></tr>}
            {!tableLoading && sales.map(s => (
              <tr key={s.id}>
                {can('sales.delete') && (
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(s.id)}
                      disabled={bulkDeleting}
                      onChange={(e) => toggleSaleSelected(s.id, e.target.checked)}
                      aria-label={`Select sale ${s.id}`}
                    />
                  </td>
                )}
                <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>#{s.id}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(s.createdAt).toLocaleString()}</td>
                <td>{s.user.fullName}</td>
                <td>{s.customer?.name || <span style={{ color: 'var(--text-light)' }}>Walk-in</span>}</td>
                <td>{fmt(s.totalAmount)}</td>
                <td style={{ color: s.discount > 0 ? 'var(--danger)' : 'var(--text-light)' }}>{s.discount > 0 ? `−${fmt(s.discount)}` : '—'}</td>
                <td style={{ color: 'var(--text-muted)' }}>{s.tax > 0 ? fmt(s.tax) : '—'}</td>
                <td style={{ color: 'var(--text-muted)' }}>{s.shipping > 0 ? fmt(s.shipping) : '—'}</td>
                <td style={{ fontWeight: 600, color: 'var(--success)' }}>{fmt(s.paidToDate ?? s.payment?.amountPaid ?? 0)}</td>
                <td style={{
                  fontWeight: 600,
                  color: (s.balanceDue ?? 0) > 0.02 ? 'var(--warning)' : 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                }}>{(s.balanceDue ?? 0) > 0.02 ? fmt(s.balanceDue) : '—'}</td>
                <td style={{ fontWeight: 700 }}>{fmt(s.grandTotal)}</td>
                <td style={{ color: 'var(--text-muted)' }}>{s.payment?.method?.replace('_', ' ') || '—'}</td>
                <td><span className={`badge ${statusClass(s.status)}`}>{s.status}</span></td>
                <td>
                  <div className="action-group">
                    <button className="icon-btn primary" title="View details" disabled={viewLoading} onClick={() => viewSale(s.id)}>
                      <Eye size={13} strokeWidth={2} />
                    </button>
                    {isAdmin && s.status === 'PARTIALLY_PAID' && (s.balanceDue ?? 0) > 0.02 && (
                      <button type="button" className="icon-btn primary" title="Record additional payment" onClick={() => openPaymentEdit(s)}>
                        <Pencil size={13} strokeWidth={2} />
                      </button>
                    )}
                    {can('sales.delete') && (
                      <button className="icon-btn danger" title="Delete sale" onClick={() => deleteSale(s.id)}>
                        <Trash2 size={13} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detailModal && detail && (
        <Modal title="Sale Details" onClose={() => setDetailModal(false)} size="lg"
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setDetailModal(false)}>Close</button>
              {can('sales.cancel') && (detail.status === 'COMPLETED' || detail.status === 'PARTIALLY_PAID') && (
                <button className="btn btn-warning" onClick={() => cancelSale(detail.id)} disabled={cancelling}>
                  {cancelling ? 'Cancelling…' : 'Cancel Sale'}
                </button>
              )}
            </>
          }>
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
          <table className="report-table" style={{ marginBottom: 20 }}>
            <thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Line total</th></tr></thead>
            <tbody>
              {detail.saleItems.map(i => (
                <tr key={i.id}>
                  <td>{i.product.name}</td><td>{i.quantity}</td>
                  <td>{fmt(i.unitPrice)}</td>
                  <td style={{ fontWeight: 600 }}>{fmt(i.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h4 style={{ fontSize: 14, marginBottom: 10, fontWeight: 700 }}>Pricing summary</h4>
          <div className="table-container" style={{ marginBottom: 14 }}>
            <table className="data-table">
              <tbody>
                <tr><td>Line items (before discount)</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(detail.totalAmount)}</td></tr>
                {detail.discount > 0 && (
                  <tr><td style={{ color: 'var(--danger)' }}>Discount (−)</td><td style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: 600 }}>−{fmt(detail.discount)}</td></tr>
                )}
                {detail.tax > 0 && <tr><td>Tax</td><td style={{ textAlign: 'right' }}>{fmt(detail.tax)}</td></tr>}
                {detail.shipping > 0 && <tr><td>Shipping</td><td style={{ textAlign: 'right' }}>{fmt(detail.shipping)}</td></tr>}
                <tr style={{ background: 'var(--surface2)', fontWeight: 800 }}>
                  <td>Invoice total (owed)</td><td style={{ textAlign: 'right' }}>{fmt(detail.grandTotal)}</td></tr>
                <tr style={{ background: 'var(--surface2)', color: 'var(--success)' }}>
                  <td>Paid toward invoice</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(detail.paidToDate ?? detail.payment?.amountPaid ?? 0)}</td></tr>
                <tr style={{ background: detail.balanceDue > 0.02 ? 'var(--warning-light)' : undefined }}>
                  <td style={{ fontWeight: 700 }}>Remaining balance</td>
                  <td style={{ textAlign: 'right', fontWeight: 800 }}>
                    {(detail.balanceDue ?? 0) > 0.02 ? fmt(detail.balanceDue) : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {detail.payment?.change > 0 && (
            <p style={{ textAlign: 'right', marginTop: -6, marginBottom: 12, fontSize: 13, color: 'var(--text-muted)' }}>
              Change given at checkout: <strong>{fmt(detail.payment.change)}</strong>
            </p>
          )}
          {isAdmin && detail.status === 'PARTIALLY_PAID' && (detail.balanceDue ?? 0) > 0.02 && (
            <button type="button" className="btn btn-primary btn-full" style={{ marginBottom: 8 }} onClick={() => { setDetailModal(false); openPaymentEdit(detail); }}>
              Record additional payment
            </button>
          )}
        </Modal>
      )}

      {editOpen && detail && (
        <Modal
          title={`Record payment #${detail.id}`}
          onClose={() => { setEditOpen(false); setEditAddition('') }}
          footer={
            <>
              <button className="btn btn-outline" type="button" onClick={() => { setEditOpen(false); setEditAddition('') }}>Cancel</button>
              <button className="btn btn-success" type="button" disabled={editSaving} onClick={saveAdditionalPayment}>
                {editSaving ? 'Saving…' : 'Apply payment'}
              </button>
            </>
          }
        >
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 12 }}>
            Invoice total <strong>{fmt(detail.grandTotal)}</strong>
            {' · '}Already paid <strong>{fmt(detail.paidToDate ?? detail.payment?.amountPaid ?? 0)}</strong>
          </p>
          <p style={{ fontSize: 15, marginBottom: 16, fontWeight: 700 }}>Outstanding: {fmt(detail.balanceDue ?? 0)}</p>
          <div className="form-group">
            <label>Additional amount received now</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              max={detail.balanceDue}
              value={editAddition}
              onChange={(e) => setEditAddition(e.target.value)}
              placeholder="Amount"
              autoFocus
            />
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 12 }}>
            When this covers the remainder, the sale will show as Completed.
          </p>
        </Modal>
      )}
    </div>
  )
}
