import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import Modal from '../Modal'
import { LoadingRow, SaveBtn } from '../LoadingRow'
import { useAsync } from '../../hooks/useAsync'
import { useTabRefresh } from '../../hooks/useTabRefresh'
import { usePermissions } from '../../context/PermissionContext'
import { Plus, Pencil, PowerOff, Boxes } from 'lucide-react'

const EMPTY = { name: '', location: '', branchId: '' }

export default function Warehouses() {
  const { can } = usePermissions()
  const canAdjustInv = can('inventory.adjust')

  const [warehouses, setWarehouses]         = useState([])
  const [branches, setBranches]             = useState([])
  const [products, setProducts]             = useState([])
  const [modal, setModal]                   = useState(false)
  const [form, setForm]                     = useState(EMPTY)
  const [editId, setEditId]                 = useState(null)
  const [tableLoading, setTableLoading]     = useState(true)

  const [stockModal, setStockModal]       = useState(false)
  const [stockWh, setStockWh]             = useState(null)
  const [wiRows, setWiRows]               = useState([])
  const [wiTableLoading, setWiTableLoading] = useState(false)
  const [addProductId, setAddProductId]   = useState('')
  const [addQty, setAddQty]               = useState('')
  const [wiSaveErr, setWiSaveErr]         = useState('')

  const [saving, saveError, runSave, setSaveError] = useAsync()
  const [wiSaving, wiErr, runWi, setWiErr] = useAsync()

  async function load(silent) {
    if (!silent) setTableLoading(true)
    try {
      const [wh, br] = await Promise.all([api.get('/warehouses'), api.get('/branches')])
      setWarehouses(wh); setBranches(br)
    } catch {} finally { if (!silent) setTableLoading(false) }
  }

  useEffect(() => { load() }, [])
  useEffect(() => { api.get('/products').then(setProducts).catch(() => {}) }, [])
  useTabRefresh('warehouses', () => load(true))

  async function loadWarehouseStock(wId) {
    setWiTableLoading(true)
    setWiRows([])
    try {
      const rows = await api.get(`/warehouses/${wId}/inventory`)
      setWiRows(rows)
    } catch {
      setWiRows([])
    } finally {
      setWiTableLoading(false)
    }
  }

  function openStockModal(w) {
    setWiSaveErr('')
    setWiErr('')
    setAddProductId('')
    setAddQty('')
    setStockWh(w)
    setStockModal(true)
    loadWarehouseStock(w.id)
  }

  async function receiveIntoWarehouse(e) {
    e?.preventDefault()
    if (!stockWh) return
    if (!addProductId || !addQty || parseInt(addQty, 10) <= 0) {
      setWiSaveErr('Choose a product and a positive quantity')
      return
    }
    setWiSaveErr('')
    await runWi(async () => {
      await api.put(`/warehouses/${stockWh.id}/inventory/restock`, {
        productId: parseInt(addProductId, 10),
        addQuantity: parseInt(addQty, 10),
      })
      setAddQty('')
      await loadWarehouseStock(stockWh.id)
    }).catch(() => {})
  }

  function openAdd() { setForm(EMPTY); setEditId(null); setSaveError(''); setModal(true) }
  function openEdit(w) {
    setForm({ name: w.name, location: w.location || '', branchId: w.branchId ? String(w.branchId) : '' })
    setEditId(w.id); setSaveError(''); setModal(true)
  }

  async function save() {
    if (!form.name) { setSaveError('Warehouse name is required'); return }
    await runSave(async () => {
      const payload = { name: form.name, location: form.location || null, branchId: form.branchId || null }
      if (editId) await api.put(`/warehouses/${editId}`, payload)
      else await api.post('/warehouses', payload)
      setModal(false); load()
    })
  }

  async function deactivate(id) {
    if (!confirm('Deactivate this warehouse?')) return
    await api.put(`/warehouses/${id}`, { isActive: false }); load()
  }

  return (
    <div>
      <div className="section-header">
        <h2>Warehouses</h2>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={15} strokeWidth={2.5} /> Add Warehouse</button>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Location</th><th>Linked Branch</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {tableLoading && <LoadingRow cols={5} />}
            {!tableLoading && warehouses.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>No warehouses yet</td></tr>}
            {!tableLoading && warehouses.map(w => (
              <tr key={w.id}>
                <td style={{ fontWeight: 600 }}>{w.name}</td>
                <td style={{ color: 'var(--text-muted)' }}>{w.location || '—'}</td>
                <td>{w.branch ? <span className="badge badge-info">{w.branch.name}</span> : <span style={{ color: 'var(--text-light)' }}>Standalone</span>}</td>
                <td><span className={`badge ${w.isActive ? 'badge-success' : 'badge-danger'}`}>{w.isActive ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <div className="action-group">
                    {canAdjustInv && w.isActive && (
                      <button
                        type="button"
                        className="icon-btn"
                        title="Warehouse stock — receive goods here before transferring to outlets"
                        onClick={() => openStockModal(w)}
                      >
                        <Boxes size={13} strokeWidth={2} />
                      </button>
                    )}
                    <button className="icon-btn primary" title="Edit" onClick={() => openEdit(w)}><Pencil size={13} strokeWidth={2} /></button>
                    {w.isActive && <button className="icon-btn danger" title="Deactivate" onClick={() => deactivate(w.id)}><PowerOff size={13} strokeWidth={2} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {stockModal && stockWh && (
        <Modal title={`Warehouse stock — ${stockWh.name}`} onClose={() => { setStockModal(false); setStockWh(null) }}
          footer={
            <>
              <button type="button" className="btn btn-outline" onClick={() => { setStockModal(false); setStockWh(null) }} disabled={wiSaving}>Close</button>
              <SaveBtn loading={wiSaving} onClick={receiveIntoWarehouse}>Receive stock</SaveBtn>
            </>
          }
        >
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.45 }}>
            Goods logged here belong to this warehouse ledger only.
            Outlet (branch) quantities move only via <strong>Stock Transfers</strong>.
          </p>
          <form onSubmit={receiveIntoWarehouse} className="form-row" style={{ marginBottom: 16 }}>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Product</label>
              <select value={addProductId} onChange={e => setAddProductId(e.target.value)}>
                <option value="">Select product</option>
                {products.filter(p => p.isActive).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Quantity to receive</label>
              <input type="number" min={1} value={addQty} onChange={e => setAddQty(e.target.value)} placeholder="Qty" />
            </div>
          </form>
          {(wiSaveErr || wiErr) && <div className="error-message">{wiSaveErr || wiErr}</div>}
          <div className="table-container" style={{ maxHeight: 360, overflowY: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Product</th><th style={{ textAlign: 'right' }}>Qty</th><th>Status</th></tr></thead>
              <tbody>
                {wiTableLoading && <LoadingRow cols={3} />}
                {!wiTableLoading && wiRows.filter(r => r.quantity > 0).length === 0 && (
                  <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>No quantities yet — receive stock above.</td></tr>
                )}
                {!wiTableLoading && wiRows.filter(r => r.quantity > 0).map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.product?.name ?? '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.quantity}</td>
                    <td>
                      <span className={`badge ${r.isLowStock ? 'badge-warning' : 'badge-success'}`}>
                        {r.isLowStock ? 'Low' : 'OK'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {modal && (
        <Modal title={editId ? 'Edit Warehouse' : 'Add Warehouse'} onClose={() => setModal(false)}
          footer={<><button className="btn btn-outline" onClick={() => setModal(false)} disabled={saving}>Cancel</button><SaveBtn loading={saving} onClick={save}>{editId ? 'Update' : 'Create'} Warehouse</SaveBtn></>}>
          <div className="form-group"><label>Warehouse Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Main Warehouse" autoFocus /></div>
          <div className="form-row">
            <div className="form-group"><label>Location</label><input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Street address" /></div>
            <div className="form-group">
              <label>Linked Branch</label>
              <select value={form.branchId} onChange={e => setForm(f => ({ ...f, branchId: e.target.value }))}>
                <option value="">Standalone (no branch)</option>
                {branches.filter(b => b.isActive).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          {saveError && <div className="error-message">{saveError}</div>}
        </Modal>
      )}
    </div>
  )
}
