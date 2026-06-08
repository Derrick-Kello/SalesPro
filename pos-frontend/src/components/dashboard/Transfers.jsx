import { useEffect, useState, useMemo } from 'react'
import { api } from '../../api/client'
import Modal from '../Modal'
import { LoadingRow, SaveBtn } from '../LoadingRow'
import { useAsync } from '../../hooks/useAsync'
import { useTabRefresh } from '../../hooks/useTabRefresh'
import { Plus, ArrowRight, Trash2, Search, ChevronLeft } from 'lucide-react'
import { usePermissions } from '../../context/PermissionContext'
import { useCurrency } from '../../context/CurrencyContext'
import { useAlert } from '../../context/AlertContext'
import { fmtDateTime } from '../../utils/dateFormat'
import { productDisplayName } from '../../utils/productDisplay'
import { useTableSelection } from '../../hooks/useTableSelection'
import { TableBulkBar, TableNumberCell, TableSelectCell, TableSelectHeader } from '../table/TableColumns'
import { bulkDeleteLoop } from '../../utils/bulkDelete'

const EMPTY = {
  fromType: 'branch',
  fromBranchId: '',
  fromWarehouseId: '',
  toType: 'branch',
  toBranchId: '',
  toWarehouseId: '',
  note: '',
  lines: [],
}

function LocationSelector({ label, type, onTypeChange, branchValue, onBranchChange, warehouseValue, onWarehouseChange, branches, warehouses, excludeBranchId }) {
  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label>{label} *</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <button
          type="button"
          className={`filter-btn${type === 'branch' ? ' active' : ''}`}
          style={{ padding: '4px 12px', fontSize: 12 }}
          onClick={() => onTypeChange('branch')}
        >Branch</button>
        <button
          type="button"
          className={`filter-btn${type === 'warehouse' ? ' active' : ''}`}
          style={{ padding: '4px 12px', fontSize: 12 }}
          onClick={() => onTypeChange('warehouse')}
        >Warehouse</button>
      </div>
      {type === 'branch' ? (
        <select value={branchValue} onChange={e => onBranchChange(e.target.value)}>
          <option value="">Select branch</option>
          {branches.filter(b => b.isActive && String(b.id) !== excludeBranchId).map(b =>
            <option key={b.id} value={b.id}>{b.name}</option>
          )}
        </select>
      ) : (
        <select value={warehouseValue} onChange={e => onWarehouseChange(e.target.value)}>
          <option value="">Select warehouse</option>
          {warehouses.filter(w => w.isActive).map(w =>
            <option key={w.id} value={w.id}>{w.name}{w.branch ? ` (${w.branch.name})` : ''}</option>
          )}
        </select>
      )}
    </div>
  )
}

export default function Transfers() {
  const { can } = usePermissions()
  const { fmt } = useCurrency()
  const { showError } = useAlert()
  const canDelete = can('transfers.delete')
  const [transfers, setTransfers]       = useState([])
  const [branches, setBranches]         = useState([])
  const [warehouses, setWarehouses]     = useState([])
  const [products, setProducts]         = useState([])
  const [modal, setModal]               = useState(false)
  const [form, setForm]                 = useState(EMPTY)
  const [transferStep, setTransferStep]   = useState('select')
  const [pickerIds, setPickerIds]       = useState([])
  const [productSearch, setProductSearch] = useState('')
  const [tableLoading, setTableLoading] = useState(true)
  const [saving, saveError, runSave, setSaveError] = useAsync()

  const productMap = useMemo(() => {
    const m = {}
    products.forEach(p => { m[p.id] = p })
    return m
  }, [products])

  const activeProducts = useMemo(
    () => products.filter(p => p.isActive !== false),
    [products]
  )

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    if (!q) return activeProducts
    return activeProducts.filter((p) => {
      const name = productDisplayName(p).toLowerCase()
      return (
        name.includes(q) ||
        String(p.id).includes(q) ||
        (p.barcode && String(p.barcode).toLowerCase().includes(q))
      )
    })
  }, [activeProducts, productSearch])

  const allFilteredSelected = useMemo(
    () =>
      filteredProducts.length > 0 &&
      filteredProducts.every((p) => pickerIds.includes(String(p.id))),
    [filteredProducts, pickerIds]
  )

  const previewTotalValue = useMemo(() => {
    return form.lines.reduce((sum, line) => {
      const qty = parseInt(line.quantity, 10) || 0
      const product = productMap[line.productId]
      if (!product || qty <= 0) return sum
      return sum + (product.costPrice || 0) * qty
    }, 0)
  }, [form.lines, productMap])

  const validLineCount = useMemo(() => {
    return form.lines.filter((line) => {
      const qty = parseInt(line.quantity, 10)
      return line.productId && Number.isFinite(qty) && qty > 0
    }).length
  }, [form.lines])

  async function load(silent) {
    if (!silent) setTableLoading(true)
    try {
      const [tr, br, wh, pr] = await Promise.all([
        api.get('/transfers'),
        api.get('/branches'),
        api.get('/warehouses'),
        api.get('/products'),
      ])
      setTransfers(tr); setBranches(br); setWarehouses(wh); setProducts(pr)
    } catch (err) {
      console.error('Transfers load error:', err)
    } finally { if (!silent) setTableLoading(false) }
  }

  useEffect(() => { load() }, [])
  useTabRefresh('transfers', () => load(true))

  function openModal() {
    setForm(EMPTY)
    setTransferStep('select')
    setPickerIds([])
    setProductSearch('')
    setSaveError('')
    setModal(true)
  }

  function closeModal() {
    setModal(false)
    setTransferStep('select')
    setPickerIds([])
    setProductSearch('')
  }

  function f(key, val) { setForm(prev => ({ ...prev, [key]: val })) }

  function togglePickerProduct(id) {
    const sid = String(id)
    setPickerIds((prev) =>
      prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]
    )
  }

  function toggleSelectAllFiltered() {
    const filteredSet = new Set(filteredProducts.map((p) => String(p.id)))
    if (allFilteredSelected) {
      setPickerIds((prev) => prev.filter((id) => !filteredSet.has(id)))
    } else {
      setPickerIds((prev) => [...new Set([...prev, ...filteredSet])])
    }
  }

  function selectAllProducts() {
    setPickerIds(activeProducts.map((p) => String(p.id)))
  }

  function clearProductSelection() {
    setPickerIds([])
  }

  function confirmProductSelection() {
    if (!pickerIds.length) {
      setSaveError('Select at least one product')
      return
    }
    setSaveError('')
    const existingQty = Object.fromEntries(
      form.lines.map((line) => [String(line.productId), line.quantity])
    )
    const lines = pickerIds.map((id) => ({
      productId: id,
      quantity: existingQty[id] ?? '',
    }))
    setForm((prev) => ({ ...prev, lines }))
    setTransferStep('quantities')
  }

  function backToSelection() {
    setPickerIds(form.lines.map((line) => String(line.productId)))
    setSaveError('')
    setTransferStep('select')
  }

  function updateLine(idx, field, value) {
    setForm(prev => ({
      ...prev,
      lines: prev.lines.map((line, i) => (i === idx ? { ...line, [field]: value } : line)),
    }))
  }

  function removeLine(idx) {
    setForm((prev) => {
      const nextLines = prev.lines.filter((_, i) => i !== idx)
      setPickerIds(nextLines.map((line) => String(line.productId)))
      return { ...prev, lines: nextLines }
    })
  }

  async function save() {
    const fromId = form.fromType === 'branch' ? form.fromBranchId : form.fromWarehouseId
    const toId   = form.toType   === 'branch' ? form.toBranchId   : form.toWarehouseId

    const lines = form.lines
      .map((line) => ({
        productId: parseInt(line.productId, 10),
        quantity: parseInt(line.quantity, 10),
      }))
      .filter((line) => Number.isFinite(line.productId) && line.productId > 0 && Number.isFinite(line.quantity) && line.quantity > 0)

    if (!lines.length || !fromId || !toId) {
      setSaveError('Enter a quantity for at least one product, and choose source and destination'); return
    }
    if (form.fromType === 'branch' && form.toType === 'branch' && form.fromBranchId === form.toBranchId) {
      setSaveError('Source and destination branches must be different'); return
    }
    if (form.fromType === 'warehouse' && form.toType === 'warehouse' && form.fromWarehouseId === form.toWarehouseId) {
      setSaveError('Choose two different warehouses'); return
    }

    await runSave(async () => {
      const payload = {
        fromBranchId:    form.fromType === 'branch' ? parseInt(form.fromBranchId) : null,
        fromWarehouseId: form.fromType === 'warehouse' ? parseInt(form.fromWarehouseId) : null,
        toBranchId:      form.toType === 'branch' ? parseInt(form.toBranchId) : null,
        toWarehouseId:   form.toType === 'warehouse' ? parseInt(form.toWarehouseId) : null,
        note:            form.note || null,
        lines,
      }

      if (lines.length === 1) {
        await api.post('/transfers', { ...payload, productId: lines[0].productId, quantity: lines[0].quantity })
      } else {
        await api.post('/transfers/bulk', payload)
      }

      closeModal()
      setForm(EMPTY)
      load()
    })
  }

  async function deleteTransfer(id) {
    if (!confirm('Delete this transfer record? Inventory changes will be reversed.')) return
    try { await api.delete(`/transfers/${id}`); load() } catch (err) { showError(err.message) }
  }

  function locationLabel(t) {
    return t.fromWarehouse?.name
      ? `${t.fromWarehouse.name} (WH)`
      : t.fromBranch?.name || '—'
  }
  function destLabel(t) {
    return t.toWarehouse?.name
      ? `${t.toWarehouse.name} (WH)`
      : t.toBranch?.name || '—'
  }

  const { selectedIds, bulkDeleting, setBulkDeleting, toggle, toggleAll, allSelected, clear } =
    useTableSelection(transfers)
  const colCount = canDelete ? 13 : 11

  async function deleteSelected() {
    if (!selectedIds.length) return
    if (!confirm(`Delete ${selectedIds.length} transfer(s)? Inventory will be reversed.`)) return
    setBulkDeleting(true)
    try {
      await bulkDeleteLoop(api, '/transfers', selectedIds)
      clear()
      load()
    } catch (err) {
      showError(err.message || 'Bulk delete failed')
    } finally {
      setBulkDeleting(false)
    }
  }

  return (
    <div>
      <div className="section-header">
        <h2>Stock Transfers</h2>
        <button className="btn btn-primary" onClick={openModal}>
          <Plus size={15} strokeWidth={2.5} /> New Transfer
        </button>
      </div>

      {canDelete && (
        <TableBulkBar selectedCount={selectedIds.length} onDelete={deleteSelected} onClear={clear} deleting={bulkDeleting} />
      )}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              {canDelete && (
                <TableSelectHeader checked={allSelected} disabled={tableLoading || !transfers.length} onChange={toggleAll} />
              )}
              <th style={{ width: 44, textAlign: 'center' }}>#</th>
              <th>Date</th><th>Product</th><th>Qty</th>
              <th>Cost Price</th><th>Unit Price</th><th>Total Value</th>
              <th>From</th><th>To</th><th>By</th><th>Note</th>
              {canDelete && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {tableLoading && <LoadingRow cols={colCount} />}
            {!tableLoading && transfers.length === 0 && (
              <tr><td colSpan={colCount} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>No transfers yet</td></tr>
            )}
            {!tableLoading && transfers.map((t, idx) => (
              <tr key={t.id}>
                {canDelete && (
                  <TableSelectCell checked={selectedIds.includes(t.id)} onChange={(c) => toggle(t.id, c)} />
                )}
                <TableNumberCell index={idx} />
                <td style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDateTime(t.createdAt)}</td>
                <td style={{ fontWeight: 600 }}>{t.product ? productDisplayName(t.product) : '—'}</td>
                <td style={{ fontWeight: 700 }}>{t.quantity}</td>
                <td style={{ fontSize: 13 }}>{fmt(t.costPrice || 0)}</td>
                <td style={{ fontSize: 13 }}>{fmt(t.unitPrice || 0)}</td>
                <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{fmt(t.totalValue || 0)}</td>
                <td><span className="badge badge-warning">{locationLabel(t)}</span></td>
                <td><span className="badge badge-success">{destLabel(t)}</span></td>
                <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t.transferredBy?.fullName}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t.note || '—'}</td>
                {canDelete && (
                  <td>
                    <button className="icon-btn danger" title="Delete transfer" onClick={() => deleteTransfer(t.id)}>
                      <Trash2 size={13} strokeWidth={2} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title={transferStep === 'select' ? 'New Transfer — Select Products' : 'New Transfer — Enter Quantities'}
          size="lg"
          onClose={closeModal}
          footer={
            transferStep === 'select' ? (
              <>
                <button className="btn btn-outline" onClick={closeModal}>Cancel</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!pickerIds.length}
                  onClick={confirmProductSelection}
                >
                  Continue ({pickerIds.length} selected)
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-outline" onClick={backToSelection} disabled={saving}>
                  <ChevronLeft size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                  Change products
                </button>
                <button className="btn btn-outline" onClick={closeModal} disabled={saving}>Cancel</button>
                <SaveBtn loading={saving} onClick={save}>
                  {validLineCount > 1 ? `Transfer ${validLineCount} products` : 'Transfer Stock'}
                </SaveBtn>
              </>
            )
          }
        >

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'flex-start', marginBottom: 16 }}>
            <LocationSelector
              label="From"
              type={form.fromType}
              onTypeChange={v => f('fromType', v)}
              branchValue={form.fromBranchId}
              onBranchChange={v => f('fromBranchId', v)}
              warehouseValue={form.fromWarehouseId}
              onWarehouseChange={v => f('fromWarehouseId', v)}
              branches={branches}
              warehouses={warehouses}
            />
            <ArrowRight size={18} color="var(--text-muted)" style={{ marginTop: 44 }} />
            <LocationSelector
              label="To"
              type={form.toType}
              onTypeChange={v => f('toType', v)}
              branchValue={form.toBranchId}
              onBranchChange={v => f('toBranchId', v)}
              warehouseValue={form.toWarehouseId}
              onWarehouseChange={v => f('toWarehouseId', v)}
              branches={branches}
              warehouses={warehouses}
              excludeBranchId={form.fromType === 'branch' ? form.fromBranchId : ''}
            />
          </div>

          {transferStep === 'select' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontWeight: 600, fontSize: 13 }}>Select products to transfer</label>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {pickerIds.length} of {activeProducts.length} selected
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-sm btn-outline" onClick={selectAllProducts}>
                  Select all products
                </button>
                <button type="button" className="btn btn-sm btn-outline" onClick={clearProductSelection}>
                  Clear selection
                </button>
              </div>

              <div style={{ position: 'relative', marginBottom: 10 }}>
                <Search
                  size={15}
                  style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                />
                <input
                  type="search"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search by name, ID, or barcode…"
                  style={{ paddingLeft: 34, width: '100%' }}
                />
              </div>

              <div
                style={{
                  maxHeight: 320,
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--bg-secondary, #f5f6fa)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 13,
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    disabled={!filteredProducts.length}
                    style={{ width: 15, height: 15, cursor: 'pointer' }}
                  />
                  Select all {productSearch.trim() ? 'matching' : 'shown'} ({filteredProducts.length})
                </label>

                {!filteredProducts.length && (
                  <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    No products match your search.
                  </div>
                )}

                {filteredProducts.map((p) => {
                  const sid = String(p.id)
                  const checked = pickerIds.includes(sid)
                  return (
                    <label
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '9px 12px',
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePickerProduct(p.id)}
                        style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }}
                      />
                      <span style={{ flex: 1, fontWeight: checked ? 600 : 400 }}>
                        {productDisplayName(p)}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        Cost {fmt(p.costPrice || 0)}
                      </span>
                    </label>
                  )
                })}
              </div>
            </>
          )}

          {transferStep === 'quantities' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <label style={{ fontWeight: 600, fontSize: 13 }}>
                  Enter quantity for each product ({form.lines.length})
                </label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
                {form.lines.map((line, idx) => {
                  const product = productMap[line.productId]
                  const qty = parseInt(line.quantity, 10) || 0
                  const lineValue = product && qty > 0 ? (product.costPrice || 0) * qty : 0
                  return (
                    <div
                      key={line.productId}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 100px 110px 36px',
                        gap: 8,
                        alignItems: 'center',
                        padding: '10px 12px',
                        background: 'var(--bg-secondary, #f5f6fa)',
                        borderRadius: 8,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {product ? productDisplayName(product) : `Product #${line.productId}`}
                        </div>
                        {product && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            Cost {fmt(product.costPrice || 0)} · Sell {fmt(product.price || 0)}
                          </div>
                        )}
                      </div>
                      <input
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={e => updateLine(idx, 'quantity', e.target.value)}
                        placeholder="Qty"
                        aria-label={`Quantity for ${product ? productDisplayName(product) : line.productId}`}
                      />
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {lineValue > 0 ? (
                          <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{fmt(lineValue)}</span>
                        ) : (
                          '—'
                        )}
                      </div>
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Remove product"
                        onClick={() => removeLine(idx)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>

              {previewTotalValue > 0 && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg-secondary, #f5f6fa)', borderRadius: 8, fontSize: 13, textAlign: 'right' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Total transfer value: </span>
                  <strong style={{ color: 'var(--primary)' }}>{fmt(previewTotalValue)}</strong>
                  {validLineCount > 0 && (
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}> ({validLineCount} with quantity)</span>
                  )}
                </div>
              )}

              <div className="form-group" style={{ marginTop: 14 }}>
                <label>Note</label>
                <input value={form.note} onChange={e => f('note', e.target.value)} placeholder="Optional reason for transfer" />
              </div>
            </>
          )}

          {saveError && <div className="error-message">{saveError}</div>}
        </Modal>
      )}
    </div>
  )
}
