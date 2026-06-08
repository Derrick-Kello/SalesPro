import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { api } from '../api/client'
import { useCurrency } from '../context/CurrencyContext'
import { useAlert } from '../context/AlertContext'
import { useTableSelection } from '../hooks/useTableSelection'
import Modal from '../components/Modal'
import {
  TableBulkBar,
  TableNumberCell,
  TableSelectCell,
  TableSelectHeader,
} from '../components/table/TableColumns'
import { getMotherVariantName, normalizeMotherName } from '../utils/variantGrouping'
import { MoreVertical, Search } from 'lucide-react'
import PurchaseEditForm, { lineFromReceipt } from '../components/purchase/PurchaseEditForm'
import { fmtDateTime } from '../utils/dateFormat'

function closeActionsMenu(e) {
  e.target.closest('details')?.removeAttribute('open')
}

export default function PurchaseMotherDetailsPage() {
  const [params] = useSearchParams()
  const { fmt } = useCurrency()
  const { showError, showSuccess } = useAlert()
  const [rows, setRows] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [tableSearch, setTableSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [editRow, setEditRow] = useState(null)
  const [editLineEdits, setEditLineEdits] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [products, setProducts] = useState([])
  const [paymentRow, setPaymentRow] = useState(null)
  const [paymentStatus, setPaymentStatus] = useState('PAID')
  const [savingEdit, setSavingEdit] = useState(false)
  const [savingPayment, setSavingPayment] = useState(false)

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
      const [sp, wh, pr] = await Promise.all([
        api.get('/suppliers').catch(() => []),
        api.get('/warehouses').catch(() => []),
        api.get('/products').catch(() => []),
      ])
      setSuppliers(Array.isArray(sp) ? sp : [])
      setWarehouses(Array.isArray(wh) ? wh : [])
      setProducts(Array.isArray(pr) ? pr : [])
    } catch (err) {
      showError(err.message || 'Could not load variant details')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [mother, warehouseId, startDate, endDate])

  const filteredRows = useMemo(() => {
    const q = tableSearch.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [
        r.product?.name,
        r.warehouse?.name,
        r.supplier,
        r.note,
        r.receivedBy?.fullName,
        r.paymentStatus,
        r.isPaid ? 'paid' : 'unpaid',
      ].some((v) => String(v ?? '').toLowerCase().includes(q))
    )
  }, [rows, tableSearch])

  const {
    selectedIds,
    bulkDeleting,
    setBulkDeleting,
    toggle,
    toggleAll,
    allSelected,
    clear,
  } = useTableSelection(filteredRows)

  const summary = useMemo(() => {
    return rows.reduce((acc, r) => {
      acc.qty += Number(r.quantity || 0)
      acc.value += Number(r.lineValueTotal || 0)
      acc.paid += r.isPaid ? 1 : 0
      return acc
    }, { qty: 0, value: 0, paid: 0 })
  }, [rows])

  async function deleteReceiptIds(ids, confirmMsg) {
    if (!confirm(confirmMsg)) return
    try {
      await api.post('/purchase/warehouse-receipts/bulk-delete', { ids })
      showSuccess(`Deleted ${ids.length} receipt line(s).`)
      clear()
      load()
    } catch (err) {
      showError(err.message || 'Could not delete receipt lines')
    }
  }

  async function deleteSelected() {
    if (!selectedIds.length) return
    setBulkDeleting(true)
    try {
      await deleteReceiptIds(
        selectedIds,
        `Delete ${selectedIds.length} selected receipt line(s)?`
      )
    } finally {
      setBulkDeleting(false)
    }
  }

  async function deleteRow(id, e) {
    if (e) closeActionsMenu(e)
    await deleteReceiptIds([id], 'Delete this receipt line?')
  }

  async function returnRow(row, e) {
    closeActionsMenu(e)
    if (!confirm(`Return purchase line "${row.product?.name || row.id}"?`)) return
    try {
      await api.post('/purchase/warehouse-receipts/bulk-return', { ids: [row.id], note: 'Returned from details' })
      showSuccess('Purchase return recorded')
      load()
    } catch (err) {
      showError(err.message || 'Could not process return')
    }
  }

  function openPayment(row, e) {
    closeActionsMenu(e)
    setPaymentRow(row)
    const st = String(row.paymentStatus || (row.isPaid ? 'PAID' : 'UNPAID')).toUpperCase()
    setPaymentStatus(st === 'PAID' ? 'PAID' : 'PAID')
  }

  async function applyPayment() {
    if (!paymentRow) return
    setSavingPayment(true)
    try {
      await api.post('/purchase/warehouse-receipts/bulk-payment', {
        ids: [paymentRow.id],
        paymentStatus,
      })
      showSuccess('Payment status updated')
      setPaymentRow(null)
      load()
    } catch (err) {
      showError(err.message || 'Could not update payment')
    } finally {
      setSavingPayment(false)
    }
  }

  function openEdit(row, e) {
    closeActionsMenu(e)
    setEditRow(row)
    setEditLineEdits([lineFromReceipt(row)])
  }

  function onEditLineChange(idx, field, value) {
    setEditLineEdits((prev) =>
      prev.map((line, i) => (i === idx ? { ...line, [field]: value } : line))
    )
  }

  async function saveEditRow() {
    if (!editRow || !editLineEdits[0]) return
    const ed = editLineEdits[0]
    if (!ed.supplier?.trim()) {
      showError('Supplier is required')
      return
    }
    if (!ed.warehouseId || !ed.productId || !ed.quantity || parseInt(ed.quantity, 10) <= 0) {
      showError('Warehouse, product, and quantity are required')
      return
    }
    setSavingEdit(true)
    try {
      await api.patch('/purchase/warehouse-receipts/bulk-edit', {
        lines: [
          {
            id: parseInt(ed.id, 10),
            warehouseId: parseInt(ed.warehouseId, 10),
            productId: parseInt(ed.productId, 10),
            quantity: parseInt(ed.quantity, 10),
            supplier: ed.supplier.trim(),
            note: ed.note?.trim() || '',
            paymentStatus: ed.paymentStatus,
            tagName: ed.tagName?.trim() || '',
          },
        ],
      })
      showSuccess('Purchase updated')
      setEditRow(null)
      setEditLineEdits([])
      load()
    } catch (err) {
      showError(err.message || 'Could not update line')
    } finally {
      setSavingEdit(false)
    }
  }

  const colCount = 12

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

        <TableBulkBar
          selectedCount={selectedIds.length}
          onDelete={deleteSelected}
          onClear={clear}
          deleting={bulkDeleting}
        />

        <div className="search-bar" style={{ marginBottom: 12 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-light)',
                pointerEvents: 'none',
              }}
            />
            <input
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Search variant, warehouse, supplier, note…"
              style={{ paddingLeft: 36, width: '100%' }}
            />
          </div>
        </div>

        <div className="table-container" style={{ minHeight: 420, paddingBottom: 120 }}>
          <table className="data-table">
            <thead>
              <tr>
                <TableSelectHeader
                  checked={allSelected}
                  disabled={loading || filteredRows.length === 0}
                  onChange={toggleAll}
                />
                <th style={{ width: 44, textAlign: 'center' }}>#</th>
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
                <tr><td colSpan={colCount} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px 0' }}>Loading…</td></tr>
              )}
              {!loading && filteredRows.length === 0 && (
                <tr><td colSpan={colCount} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px 0' }}>
                  {rows.length === 0 ? 'No items under this mother variant.' : 'No lines match your search.'}
                </td></tr>
              )}
              {!loading && filteredRows.map((r, idx) => (
                <tr key={r.id}>
                  <TableSelectCell
                    checked={selectedIds.includes(r.id)}
                    onChange={(checked) => toggle(r.id, checked)}
                  />
                  <TableNumberCell index={idx} />
                  <td style={{ fontSize: 12.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {r.createdAt ? fmtDateTime(r.createdAt) : '—'}
                  </td>
                  <td style={{ fontWeight: 600 }}>{r.warehouse?.name ?? '—'}</td>
                  <td>{r.product?.name ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{r.quantity}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(r.unitCostSnapshot ?? 0)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(r.lineValueTotal ?? 0)}</td>
                  <td>
                    <span className={`badge ${r.isPaid ? 'badge-success' : 'badge-warning'}`}>
                      {r.paymentStatus || (r.isPaid ? 'PAID' : 'UNPAID')}
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
                        <button type="button" className="btn btn-sm btn-outline" onClick={(e) => openEdit(r, e)}>
                          Edit Purchase
                        </button>
                        <button type="button" className="btn btn-sm btn-outline" onClick={(e) => returnRow(r, e)}>
                          Purchase Return
                        </button>
                        <button type="button" className="btn btn-sm btn-outline" onClick={(e) => openPayment(r, e)}>
                          Create Payment
                        </button>
                        <button type="button" className="btn btn-sm btn-danger" onClick={(e) => deleteRow(r.id, e)}>
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
          <Modal
            size="lg"
            title={`Edit line — ${editRow.product?.name || editRow.id}`}
            onClose={() => {
              if (!savingEdit) {
                setEditRow(null)
                setEditLineEdits([])
              }
            }}
            footer={
              <>
                <button
                type="button"
                className="btn btn-outline"
                onClick={() => { setEditRow(null); setEditLineEdits([]) }}
                disabled={savingEdit}
              >
                Cancel
              </button>
                <button type="button" className="btn btn-primary" onClick={saveEditRow} disabled={savingEdit}>
                  {savingEdit ? 'Saving…' : 'Save'}
                </button>
              </>
            }
          >
            <PurchaseEditForm
              receipts={[editRow]}
              lineEdits={editLineEdits}
              onLineChange={onEditLineChange}
              warehouses={warehouses}
              products={products}
              suppliers={suppliers}
            />
          </Modal>
        )}

        {paymentRow && (
          <Modal
            title={`Create Payment — ${paymentRow.product?.name || paymentRow.id}`}
            onClose={() => !savingPayment && setPaymentRow(null)}
            footer={
              <>
                <button type="button" className="btn btn-outline" onClick={() => setPaymentRow(null)} disabled={savingPayment}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={applyPayment} disabled={savingPayment}>
                  {savingPayment ? 'Applying…' : 'Record payment'}
                </button>
              </>
            }
          >
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Payment status</label>
              <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
                <option value="UNPAID">Unpaid</option>
                <option value="PARTIAL">Partial</option>
                <option value="PAID">Paid</option>
              </select>
            </div>
          </Modal>
        )}
      </main>
    </div>
  )
}
