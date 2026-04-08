import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import Modal from '../Modal'
import { LoadingRow, SaveBtn } from '../LoadingRow'
import { useAsync } from '../../hooks/useAsync'
import { useTabRefresh } from '../../hooks/useTabRefresh'
import { Plus, Pencil, PowerOff } from 'lucide-react'

const EMPTY = { name: '', location: '', branchId: '' }

export default function Warehouses() {
  const [warehouses, setWarehouses]     = useState([])
  const [branches, setBranches]         = useState([])
  const [modal, setModal]               = useState(false)
  const [form, setForm]                 = useState(EMPTY)
  const [editId, setEditId]             = useState(null)
  const [tableLoading, setTableLoading] = useState(true)
  const [saving, saveError, runSave, setSaveError] = useAsync()

  async function load(silent) {
    if (!silent) setTableLoading(true)
    try {
      const [wh, br] = await Promise.all([api.get('/warehouses'), api.get('/branches')])
      setWarehouses(wh); setBranches(br)
    } catch {} finally { if (!silent) setTableLoading(false) }
  }

  useEffect(() => { load() }, [])
  useTabRefresh('warehouses', () => load(true))

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
                    <button className="icon-btn primary" title="Edit" onClick={() => openEdit(w)}><Pencil size={13} strokeWidth={2} /></button>
                    {w.isActive && <button className="icon-btn danger" title="Deactivate" onClick={() => deactivate(w.id)}><PowerOff size={13} strokeWidth={2} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
