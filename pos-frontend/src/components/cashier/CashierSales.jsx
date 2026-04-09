import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { useCurrency } from '../../context/CurrencyContext'
import { usePermissions } from '../../context/PermissionContext'
import Modal from '../Modal'
import { Printer, Filter, Trash2 } from 'lucide-react'

const STORE_NAME = 'SalesPro'

export default function CashierSales() {
  const { fmt } = useCurrency()
  const { can } = usePermissions()
  const [view, setView]           = useState('all')
  const [sales, setSales]         = useState([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [receiptSale, setReceiptSale] = useState(null)
  const [receiptOpen, setReceiptOpen] = useState(false)

  async function load(currentView) {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (currentView === 'mine') params.append('mine', 'true')
      if (startDate) params.append('startDate', startDate)
      if (endDate)   params.append('endDate', endDate)
      const data = await api.get(`/sales${params.toString() ? '?' + params : ''}`)
      setSales(data)
    } catch (err) {
      console.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(view) }, [view])

  async function openReceipt(id) {
    try {
      const sale = await api.get(`/sales/${id}`)
      setReceiptSale(sale); setReceiptOpen(true)
    } catch { alert('Could not load receipt') }
  }

  function printReceipt() {
    const el = document.getElementById('receipt-print')
    if (!el) return
    const win = window.open('', '_blank', 'width=320,height=600')
    win.document.write(`<!DOCTYPE html><html><head><title>Receipt</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; padding: 4mm; color: #000; }
.receipt-header { text-align: center; margin-bottom: 8px; }
.receipt-header h2 { font-size: 16px; font-weight: 700; letter-spacing: 1px; margin-bottom: 2px; }
.receipt-branch { font-size: 13px; font-weight: 700; margin-bottom: 2px; }
.receipt-header p { font-size: 11px; color: #555; }
.receipt-meta { font-size: 11px; line-height: 1.6; }
.receipt-divider { border: none; border-top: 1px dashed #000; margin: 6px 0; }
.receipt-items-header { display: flex; justify-content: space-between; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #555; margin-bottom: 2px; }
.receipt-item { display: flex; justify-content: space-between; font-size: 11px; margin: 3px 0; }
.receipt-totals { margin-top: 4px; }
.receipt-total-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; }
.receipt-total-row.final { font-weight: 700; font-size: 14px; border-top: 1px dashed #000; padding-top: 6px; margin-top: 4px; }
.receipt-footer { text-align: center; margin-top: 10px; font-size: 10px; color: #555; }
.receipt-footer p { margin: 2px 0; }
@media print { @page { size: 80mm auto; margin: 0; } body { width: 72mm; padding: 4mm; } }
</style></head><body>`)
    win.document.write(el.innerHTML)
    win.document.write('</body></html>')
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  async function deleteSale(id) {
    if (!confirm('Permanently delete this sale? This cannot be undone.')) return
    try { await api.delete(`/sales/${id}`); load(view) } catch (err) { alert(err.message) }
  }

  const statusClass = s =>
    s === 'COMPLETED' ? 'badge-success' :
    s === 'CANCELLED' ? 'badge-danger'  : 'badge-warning'

  return (
    <div style={{ padding: '20px 24px' }}>
      <div className="section-header" style={{ marginBottom: 16 }}>
        <h2>Sales History</h2>
        <div className="date-filters">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <input type="date" value={endDate}   onChange={e => setEndDate(e.target.value)} />
          <button className="btn btn-outline" onClick={() => load(view)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Filter size={13} strokeWidth={2} /> Filter
          </button>
        </div>
      </div>

      <div className="history-sub-tabs">
        <button className={`history-sub-tab${view === 'all'  ? ' active' : ''}`} onClick={() => setView('all')}>All Sales</button>
        <button className={`history-sub-tab${view === 'mine' ? ' active' : ''}`} onClick={() => setView('mine')}>My Sales</button>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sale #</th>
              <th>Date</th>
              <th>Cashier</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Amount</th>
              <th>Discount</th>
              <th>Tax</th>
              <th>Shipping</th>
              <th>Grand Total</th>
              <th>Payment</th>
              <th>Status</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={13} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>Loading…</td></tr>
            )}
            {!loading && sales.length === 0 && (
              <tr><td colSpan={13} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>No sales found</td></tr>
            )}
            {!loading && sales.map(s => (
              <tr key={s.id}>
                <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>#{s.id}</td>
                <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{new Date(s.createdAt).toLocaleString()}</td>
                <td>{s.user.fullName}</td>
                <td>{s.customer?.name || <span style={{ color: 'var(--text-light)' }}>Walk-in</span>}</td>
                <td style={{ color: 'var(--text-muted)' }}>{s.saleItems?.length ?? 0}</td>
                <td>{fmt(s.totalAmount)}</td>
                <td style={{ color: s.discount > 0 ? 'var(--danger)' : 'var(--text-light)' }}>{s.discount > 0 ? `−${fmt(s.discount)}` : '—'}</td>
                <td style={{ color: 'var(--text-muted)' }}>{s.tax > 0 ? fmt(s.tax) : '—'}</td>
                <td style={{ color: 'var(--text-muted)' }}>{s.shipping > 0 ? fmt(s.shipping) : '—'}</td>
                <td style={{ fontWeight: 700 }}>{fmt(s.grandTotal)}</td>
                <td style={{ color: 'var(--text-muted)' }}>{s.payment?.method?.replace('_', ' ') || '—'}</td>
                <td><span className={`badge ${statusClass(s.status)}`}>{s.status}</span></td>
                <td>
                  <div className="action-group">
                    <button className="btn btn-sm btn-outline" onClick={() => openReceipt(s.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Printer size={12} strokeWidth={2} /> Receipt
                    </button>
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

      {receiptOpen && receiptSale && (
        <Modal
          title="Receipt Reprint"
          onClose={() => setReceiptOpen(false)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => printReceipt()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Printer size={14} strokeWidth={2} /> Print
              </button>
              <button className="btn btn-primary" onClick={() => setReceiptOpen(false)}>Close</button>
            </>
          }
        >
          <div className="receipt" id="receipt-print">
            <div className="receipt-header">
              <h2>{STORE_NAME}</h2>
              {receiptSale.branch?.name && <p className="receipt-branch">{receiptSale.branch.name}</p>}
              <p>Sales Receipt</p>
            </div>
            <hr className="receipt-divider" />
            <div className="receipt-meta">
              <div><strong>Receipt #:</strong> {receiptSale.id}</div>
              <div><strong>Date:</strong> {new Date(receiptSale.createdAt).toLocaleString()}</div>
              <div><strong>Cashier:</strong> {receiptSale.user.fullName}</div>
              {receiptSale.customer && <div><strong>Customer:</strong> {receiptSale.customer.name}</div>}
            </div>
            <hr className="receipt-divider" />
            <div className="receipt-items-header">
              <span>Item</span>
              <span>Amt</span>
            </div>
            {receiptSale.saleItems.map(i => (
              <div key={i.id} className="receipt-item">
                <span>{i.product.name} x{i.quantity} @ {fmt(i.unitPrice)}</span>
                <span>{fmt(i.subtotal)}</span>
              </div>
            ))}
            <hr className="receipt-divider" />
            <div className="receipt-totals">
              <div className="receipt-total-row"><span>Subtotal</span><span>{fmt(receiptSale.totalAmount)}</span></div>
              {receiptSale.discount > 0 && <div className="receipt-total-row"><span>Discount</span><span>-{fmt(receiptSale.discount)}</span></div>}
              {receiptSale.tax > 0 && <div className="receipt-total-row"><span>Tax</span><span>{fmt(receiptSale.tax)}</span></div>}
              {receiptSale.shipping > 0 && <div className="receipt-total-row"><span>Shipping</span><span>{fmt(receiptSale.shipping)}</span></div>}
              <div className="receipt-total-row final"><span>TOTAL</span><span>{fmt(receiptSale.grandTotal)}</span></div>
              <div className="receipt-total-row"><span>Payment</span><span>{receiptSale.payment.method.replace('_', ' ')}</span></div>
              {receiptSale.payment.amountPaid > 0 && <div className="receipt-total-row"><span>Paid</span><span>{fmt(receiptSale.payment.amountPaid)}</span></div>}
              {receiptSale.payment.change > 0 && <div className="receipt-total-row"><span>Change</span><span>{fmt(receiptSale.payment.change)}</span></div>}
            </div>
            <hr className="receipt-divider" />
            <div className="receipt-footer">
              <p>Thank you for your purchase!</p>
              <p>{STORE_NAME}{receiptSale.branch?.name ? ` — ${receiptSale.branch.name}` : ''}</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
