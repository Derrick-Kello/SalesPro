import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import Modal from '../Modal'
import { LoadingRow, SaveBtn } from '../LoadingRow'
import { useAsync } from '../../hooks/useAsync'
import { useTabRefresh } from '../../hooks/useTabRefresh'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'

const EMPTY = { name: '', phone: '', email: '', address: '', company: '' }

export default function Suppliers() {
  const [suppliers, setSuppliers]       = useState([])
  const [search, setSearch]             = useState('')
  const [modal, setModal]               = useState(false)
  const [form, setForm]                 = useState(EMPTY)
  const [editId, setEditId]             = useState(null)
  const [tableLoading, setTableLoading] = useState(true)
  const [saving, saveError, runSave, setSaveError] = useAsync()

  async function load(silent) {
    if (!silent) setTableLoading(true)
    try { setSuppliers(await api.get('/suppliers')) } catch {} finally { if (!silent) setTableLoading(false) }
  }

  useEffect(() => { load() }, [])
  useTabRefresh('suppliers', () => load(true))

  function openAdd() { setForm(EMPTY); setEditId(null); setSaveError(''); setModal(true) }
  function openEdit(s) {
    setForm({ name: s.name, phone: s.phone || '', email: s.email || '', address: s.address || '', company: s.company || '' })
    setEditId(s.id); setSaveError(''); setModal(true)
  }

  async function save() {
    if (!form.name) { setSaveError('Name is required'); return }
    await runSave(async () => {
      const payload = { ...form, phone: form.phone || null, email: form.email || null, address: form.address || null, company: form.company || null }
      if (editId) await api.put(`/suppliers/${editId}`, payload)
      else await api.post('/suppliers', payload)
      setModal(false); load()
    })
  }

  async function remove(id) {
    if (!confirm('Remove this supplier?')) return
    await api.delete(`/suppliers/${id}`)
    load()
  }

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.company && s.company.toLowerCase().includes(search.toLowerCase())) ||
    (s.phone && s.phone.includes(search))
  )

  return (
    <div>
      <div className="section-header">
        <h2>Suppliers</h2>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={15} strokeWidth={2.5} /> Add Supplier</button>
      </div>

      <div className="search-bar">
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search suppliers…" style={{ paddingLeft: 36 }} />
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Company</th><th>Phone</th><th>Email</th><th>Address</th><th>Actions</th></tr></thead>
          <tbody>
            {tableLoading && <LoadingRow cols={6} />}
            {!tableLoading && filtered.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>No suppliers found</td></tr>}
            {!tableLoading && filtered.map(s => (
              <tr key={s.id}>
                <td style={{ fontWeight: 600 }}>{s.name}</td>
                <td style={{ color: 'var(--text-muted)' }}>{s.company || '—'}</td>
                <td style={{ color: 'var(--text-muted)' }}>{s.phone || '—'}</td>
                <td style={{ color: 'var(--text-muted)' }}>{s.email || '—'}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{s.address || '—'}</td>
                <td>
                  <div className="action-group">
                    <button className="icon-btn primary" title="Edit" onClick={() => openEdit(s)}><Pencil size={13} strokeWidth={2} /></button>
                    <button className="icon-btn danger" title="Remove" onClick={() => remove(s.id)}><Trash2 size={13} strokeWidth={2} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={editId ? 'Edit Supplier' : 'Add Supplier'} onClose={() => setModal(false)}
          footer={<><button className="btn btn-outline" onClick={() => setModal(false)} disabled={saving}>Cancel</button><SaveBtn loading={saving} onClick={save} /></>}>
          <div className="form-row">
            <div className="form-group"><label>Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Supplier name" autoFocus /></div>
            <div className="form-group"><label>Company</label><input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Company name" /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 234 567 8900" /></div>
            <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" /></div>
          </div>
          <div className="form-group"><label>Address</label><input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Street address" /></div>
          {saveError && <div className="error-message">{saveError}</div>}
        </Modal>
      )}
    </div>
  )
}
