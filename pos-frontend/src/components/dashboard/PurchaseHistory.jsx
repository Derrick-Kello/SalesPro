import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { useCurrency } from '../../context/CurrencyContext'
import { useAlert } from '../../context/AlertContext'
import { useTabRefresh } from '../../hooks/useTabRefresh'
import { useTableSelection } from '../../hooks/useTableSelection'
import { LoadingRow } from '../LoadingRow'
import Modal from '../Modal'
import {
  TableBulkBar,
  TableNumberCell,
  TableSelectCell,
  TableSelectHeader,
} from '../table/TableColumns'
import { buildMotherGroupKey, getMotherVariantName } from '../../utils/variantGrouping'
import { MoreVertical, Search } from 'lucide-react'
import PurchaseEditForm, { lineFromReceipt } from '../purchase/PurchaseEditForm'

function closeActionsMenu(e) {
  e.target.closest('details')?.removeAttribute('open')
}

export default function PurchaseHistory() {
  const { fmt } = useCurrency()
  const { showError, showSuccess } = useAlert()
  const [rows, setRows] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [editLineEdits, setEditLineEdits] = useState([])
  const [tableSearch, setTableSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [warehouseId, setWarehouseId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [editGroup, setEditGroup] = useState(null)
  const [paymentGroup, setPaymentGroup] = useState(null)
  const [paymentStatus, setPaymentStatus] = useState('PAID')
  const [savingEdit, setSavingEdit] = useState(false)
  const [savingPayment, setSavingPayment] = useState(false)

  async function load(silent) {
    if (!silent) setLoading(true)
    const params = new URLSearchParams()
    if (warehouseId) params.append('warehouseId', warehouseId)
    if (startDate) params.append('startDate', startDate)
    if (endDate) params.append('endDate', endDate)
    const qs = params.toString() ? `?${params}` : ''
    try {
      const list = await api.get(`/purchase/warehouse-receipts${qs}`)
      setRows(Array.isArray(list) ? list : [])
    } catch (err) {
      setRows([])
      showError(err.message || 'Could not load purchase receipts')
    }
    try {
      const [wh, sp, pr] = await Promise.all([
        api.get('/warehouses').catch(() => []),
        api.get('/suppliers').catch(() => []),
        api.get('/products').catch(() => []),
      ])
      setWarehouses(Array.isArray(wh) ? wh : [])
      setSuppliers(Array.isArray(sp) ? sp : [])
      setProducts(Array.isArray(pr) ? pr : [])
    } catch {
      /* receipts already loaded; filters/edit helpers are optional */
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
  const groups = useMemo(
    () =>
      [...groupsMap.values()]
        .map((g) => ({ ...g, suppliers: [...g.supplierSet] }))
        .sort((a, b) => new Date(b.latestAt || 0) - new Date(a.latestAt || 0)),
    [rows]
  )

  function groupPaymentState(g) {
    const set = new Set(
      (g.rows || []).map((r) =>
        String(r.paymentStatus || (r.isPaid ? 'PAID' : 'UNPAID')).toUpperCase()
      )
    )
    if (set.size === 1) return [...set][0]
    return 'MIXED'
  }

  const filteredGroups = useMemo(() => {
    const q = tableSearch.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((g) =>
      [
        g.motherName,
        g.warehouse?.name,
        g.warehouse?.branchName,
        g.suppliers.join(' '),
        groupPaymentState(g),
      ].some((v) => String(v ?? '').toLowerCase().includes(q))
    )
  }, [groups, tableSearch])

  const {
    selectedIds,
    setSelectedIds,
    bulkDeleting,
    setBulkDeleting,
    toggle,
    toggleAll,
    allSelected,
    clear,
  } = useTableSelection(filteredGroups, (g) => g.key)

  function openEditGroup(g, e) {
    closeActionsMenu(e)
    setEditGroup(g)
    setEditLineEdits((g.rows || []).map(lineFromReceipt))
  }

  function onEditLineChange(idx, field, value) {
    setEditLineEdits((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    )
  }

  function openPaymentGroup(g, e) {
    closeActionsMenu(e)
    setPaymentGroup(g)
    const st = groupPaymentState(g)
    setPaymentStatus(st === 'MIXED' || st === 'UNPAID' ? 'PAID' : st)
  }

  async function deleteReceiptIds(ids, confirmMsg) {
    if (!confirm(confirmMsg)) return
    try {
      await api.post('/purchase/warehouse-receipts/bulk-delete', { ids })
      showSuccess(`Deleted ${ids.length} receipt line(s).`)
      clear()
      load(true)
    } catch (err) {
      showError(err.message || 'Could not delete receipts')
    }
  }

  async function deleteGroup(g) {
    await deleteReceiptIds(
      g.receiptIds,
      `Delete ${g.receiptIds.length} receipt line(s) under "${g.motherName}"?`
    )
  }

  async function deleteSelectedGroups() {
    const ids = filteredGroups
      .filter((g) => selectedIds.includes(g.key))
      .flatMap((g) => g.receiptIds)
    if (!ids.length) return
    setBulkDeleting(true)
    try {
      await deleteReceiptIds(ids, `Delete ${ids.length} receipt line(s) from selected groups?`)
    } finally {
      setBulkDeleting(false)
    }
  }

  async function saveGroupEdit() {
    if (!editGroup || !editLineEdits.length) return
    for (const ed of editLineEdits) {
      if (!ed.supplier?.trim()) {
        showError('Supplier is required on every line')
        return
      }
      if (!ed.warehouseId || !ed.productId || !ed.quantity || parseInt(ed.quantity, 10) <= 0) {
        showError('Warehouse, product, and quantity are required on every line')
        return
      }
    }
    setSavingEdit(true)
    try {
      await api.patch('/purchase/warehouse-receipts/bulk-edit', {
        lines: editLineEdits.map((ed) => ({
          id: parseInt(ed.id, 10),
          warehouseId: parseInt(ed.warehouseId, 10),
          productId: parseInt(ed.productId, 10),
          quantity: parseInt(ed.quantity, 10),
          supplier: ed.supplier.trim(),
          note: ed.note?.trim() || '',
          paymentStatus: ed.paymentStatus,
          tagName: ed.tagName?.trim() || '',
        })),
      })
      showSuccess('Purchase updated')
      setEditGroup(null)
      setEditLineEdits([])
      load(true)
    } catch (err) {
      showError(err.message || 'Could not update purchase')
    } finally {
      setSavingEdit(false)
    }
  }

  async function applyPaymentStatus() {
    if (!paymentGroup) return
    setSavingPayment(true)
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
    } finally {
      setSavingPayment(false)
    }
  }

  async function returnGroup(g, e) {
    closeActionsMenu(e)
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

  const colCount = 11

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

      <TableBulkBar
        selectedCount={selectedIds.length}
        onDelete={deleteSelectedGroups}
        onClear={clear}
        deleting={bulkDeleting}
        entityLabel="group"
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
            placeholder="Search mother variant, warehouse, supplier, status…"
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
                disabled={loading || filteredGroups.length === 0}
                onChange={toggleAll}
              />
              <th style={{ width: 44, textAlign: 'center' }}>#</th>
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
            {loading && <LoadingRow cols={colCount} />}
            {!loading && filteredGroups.length === 0 && (
              <tr>
                <td colSpan={colCount} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '36px 0' }}>
                  {groups.length === 0
                    ? 'No receipts yet — use Purchase → Receive to warehouse.'
                    : 'No groups match your search.'}
                </td>
              </tr>
            )}
            {!loading && filteredGroups.map((g, idx) => (
              <tr key={g.key}>
                <TableSelectCell
                  checked={selectedIds.includes(g.key)}
                  onChange={(checked) => toggle(g.key, checked)}
                />
                <TableNumberCell index={idx} />
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
                        onClick={closeActionsMenu}
                      >
                        Details
                      </Link>
                      <button type="button" className="btn btn-sm btn-outline" onClick={(e) => openEditGroup(g, e)}>
                        Edit Purchase
                      </button>
                      <button type="button" className="btn btn-sm btn-outline" onClick={(e) => returnGroup(g, e)}>
                        Purchase Return
                      </button>
                      <button type="button" className="btn btn-sm btn-outline" onClick={(e) => openPaymentGroup(g, e)}>
                        Create Payment
                      </button>
                      <button type="button" className="btn btn-sm btn-danger" onClick={(e) => { closeActionsMenu(e); deleteGroup(g) }}>
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
        <Modal
          size="lg"
          title={`Edit Purchase — ${editGroup.motherName}`}
          onClose={() => {
            if (!savingEdit) {
              setEditGroup(null)
              setEditLineEdits([])
            }
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => { setEditGroup(null); setEditLineEdits([]) }}
                disabled={savingEdit}
              >
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={saveGroupEdit} disabled={savingEdit}>
                {savingEdit ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <PurchaseEditForm
            receipts={editGroup.rows || []}
            lineEdits={editLineEdits}
            onLineChange={onEditLineChange}
            warehouses={warehouses}
            products={products}
            suppliers={suppliers}
          />
        </Modal>
      )}

      {paymentGroup && (
        <Modal
          title={`Create Payment — ${paymentGroup.motherName}`}
          onClose={() => !savingPayment && setPaymentGroup(null)}
          footer={
            <>
              <button type="button" className="btn btn-outline" onClick={() => setPaymentGroup(null)} disabled={savingPayment}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={applyPaymentStatus} disabled={savingPayment}>
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
          <p style={{ marginTop: 12, fontSize: 12.5, color: 'var(--text-muted)' }}>
            Applies to {paymentGroup.receiptIds.length} receipt line(s).
          </p>
        </Modal>
      )}
    </div>
  )
}
