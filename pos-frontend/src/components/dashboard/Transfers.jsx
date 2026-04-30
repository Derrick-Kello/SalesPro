import { useEffect, useState, useMemo } from 'react'
import { api } from '../../api/client'
import Modal from '../Modal'
import { LoadingRow, SaveBtn } from '../LoadingRow'
import { useAsync } from '../../hooks/useAsync'
import { useTabRefresh } from '../../hooks/useTabRefresh'
import { Plus, ArrowRight, Trash2 } from 'lucide-react'
import { usePermissions } from '../../context/PermissionContext'
import { useCurrency } from '../../context/CurrencyContext'
import { useAlert } from '../../context/AlertContext'
import { productDisplayName } from '../../utils/productDisplay'

const EMPTY = {
  productId: '',
  quantity: '',
  fromType: 'branch',
  fromBranchId: '',
  fromWarehouseId: '',
  toType: 'branch',
  toBranchId: '',
  toWarehouseId: '',
  note: '',
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
  const [tableLoading, setTableLoading] = useState(true)
  const [saving, saveError, runSave, setSaveError] = useAsync()

  const productMap = useMemo(() => {
    const m = {}
    products.forEach(p => { m[p.id] = p })
    return m
  }, [products])

  const selectedProduct = productMap[form.productId] || null
  const previewQty = parseInt(form.quantity) || 0
  const previewTotalValue = selectedProduct ? (selectedProduct.costPrice || 0) * previewQty : 0

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

  function f(key, val) { setForm(prev => ({ ...prev, [key]: val })) }

  async function save() {
    const fromId = form.fromType === 'branch' ? form.fromBranchId : form.fromWarehouseId
    const toId   = form.toType   === 'branch' ? form.toBranchId   : form.toWarehouseId

    if (!form.productId || !form.quantity || !fromId || !toId) {
      setSaveError('Product, quantity, source and destination are all required'); return
    }
    if (form.fromType === 'branch' && form.toType === 'branch' && form.fromBranchId === form.toBranchId) {
      setSaveError('Source and destination branches must be different'); return
    }
    if (form.fromType === 'warehouse' && form.toType === 'warehouse' && form.fromWarehouseId === form.toWarehouseId) {
      setSaveError('Choose two different warehouses'); return
    }

    await runSave(async () => {
      await api.post('/transfers', {
        productId:       parseInt(form.productId),
        quantity:        parseInt(form.quantity),
        fromBranchId:    form.fromType === 'branch' ? parseInt(form.fromBranchId) : null,
        fromWarehouseId: form.fromType === 'warehouse' ? parseInt(form.fromWarehouseId) : null,
        toBranchId:      form.toType === 'branch' ? parseInt(form.toBranchId) : null,
        toWarehouseId:   form.toType === 'warehouse' ? parseInt(form.toWarehouseId) : null,
        note:            form.note || null,
      })
      setModal(false); setForm(EMPTY); load()
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

  return (
    <div>
      <div className="section-header">
        <h2>Stock Transfers</h2>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setSaveError(''); setModal(true) }}>
          <Plus size={15} strokeWidth={2.5} /> New Transfer
        </button>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th><th>Product</th><th>Qty</th>
              <th>Cost Price</th><th>Unit Price</th><th>Total Value</th>
              <th>From</th><th>To</th><th>By</th><th>Note</th>
              {canDelete && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {tableLoading && <LoadingRow cols={canDelete ? 11 : 10} />}
            {!tableLoading && transfers.length === 0 && (
              <tr><td colSpan={canDelete ? 11 : 10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>No transfers yet</td></tr>
            )}
            {!tableLoading && transfers.map(t => (
              <tr key={t.id}>
                <td style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(t.createdAt).toLocaleString()}</td>
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
        <Modal title="New Stock Transfer" onClose={() => setModal(false)}
          footer={<><button className="btn btn-outline" onClick={() => setModal(false)} disabled={saving}>Cancel</button><SaveBtn loading={saving} onClick={save}>Transfer Stock</SaveBtn></>}>

          <div className="form-row">
            <div className="form-group">
              <label>Product *</label>
              <select value={form.productId} onChange={e => f('productId', e.target.value)}>
                <option value="">Select product</option>
                {products.map(p => <option key={p.id} value={p.id}>{productDisplayName(p)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Quantity *</label>
              <input type="number" min="1" value={form.quantity} onChange={e => f('quantity', e.target.value)} placeholder="Units to transfer" />
            </div>
          </div>

          {selectedProduct && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, margin: '8px 0 12px', padding: '10px 14px', background: 'var(--bg-secondary, #f5f6fa)', borderRadius: 8, fontSize: 13 }}>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: 11, display: 'block' }}>Cost Price</span>
                <strong>{fmt(selectedProduct.costPrice || 0)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: 11, display: 'block' }}>Selling Price</span>
                <strong>{fmt(selectedProduct.price || 0)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: 11, display: 'block' }}>Transfer Value</span>
                <strong style={{ color: 'var(--primary)' }}>{fmt(previewTotalValue)}</strong>
                {previewQty > 0 && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}> ({previewQty} × {fmt(selectedProduct.costPrice || 0)})</span>}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'flex-start', marginTop: 4 }}>
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

          <div className="form-group" style={{ marginTop: 14 }}>
            <label>Note</label>
            <input value={form.note} onChange={e => f('note', e.target.value)} placeholder="Optional reason for transfer" />
          </div>
          {saveError && <div className="error-message">{saveError}</div>}
        </Modal>
      )}
    </div>
  )
}
