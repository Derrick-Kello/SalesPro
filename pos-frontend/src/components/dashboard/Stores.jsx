import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import Modal from '../Modal'
import { Plus, Pencil, Trash2, Search, Store, MapPin } from 'lucide-react'

const EMPTY = { name: '', address: '', phone: '', email: '', managerId: '' }

export default function Stores() {
  const [stores, setStores] = useState([])
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    try {
      const [s, u] = await Promise.all([
        api.get('/stores').catch(() => []),
        api.get('/users').catch(() => []),
      ])
      setStores(s)
      setUsers(u.filter(u => u.role === 'MANAGER' && u.isActive))
    } catch { setStores([]); setUsers([]) }
  }

  useEffect(() => { load() }, [])

  function openAdd() { setForm(EMPTY); setEditId(null); setError(''); setModal(true) }

  function openEdit(s) {
    setForm({ name: s.name, address: s.address || '', phone: s.phone || '', email: s.email || '', managerId: s.managerId || '' })
    setEditId(s.id); setError(''); setModal(true)
  }

  async function save() {
    if (!form.name) { setError('Store name is required'); return }
    try {
      const payload = { ...form, managerId: form.managerId || null }
      if (editId) await api.put(`/stores/${editId}`, payload)
      else await api.post('/stores', payload)
      setModal(false); load()
    } catch (err) { setError(err.message) }
  }

  async function remove(id) {
    if (!confirm('Delete this store?')) return
    await api.delete(`/stores/${id}`)
    load()
  }

  const filtered = stores.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.address && s.address.toLowerCase().includes(search.toLowerCase()))
  )

  const getManagerName = (id) => {
    const u = users.find(u => u.id === id)
    return u ? u.fullName : '—'
  }

  return (
    <div>
      <div className="section-header">
        <h2>Stores</h2>
        <button className="btn btn-primary" onClick={openAdd}>
          <Plus size={15} strokeWidth={2.5} /> Add Store
        </button>
      </div>

      <div className="search-bar">
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search stores…" style={{ paddingLeft: 36 }} />
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Store Name</th>
              <th>Address</th>
              <th>Phone</th>
              <th>Manager</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>No stores found</td></tr>
            )}
            {filtered.map(s => (
              <tr key={s.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Store size={14} style={{ color: 'var(--primary)' }} />
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                  </div>
                </td>
                <td style={{ color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MapPin size={12} /> {s.address || '—'}
                  </div>
                </td>
                <td style={{ color: 'var(--text-muted)' }}>{s.phone || '—'}</td>
                <td><span className="badge badge-warning">{s.managerId ? getManagerName(s.managerId) : 'Unassigned'}</span></td>
                <td>
                  <div className="action-group">
                    <button className="icon-btn primary" title="Edit" onClick={() => openEdit(s)}><Pencil size={13} /></button>
                    <button className="icon-btn danger" title="Delete" onClick={() => remove(s.id)}><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title={editId ? 'Edit Store' : 'Add Store'}
          onClose={() => setModal(false)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save Store</button>
          </>}
        >
          <div className="form-group">
            <label>Store Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Downtown Branch" autoFocus />
          </div>
          <div className="form-group">
            <label>Address</label>
            <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Street address" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Phone</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 234 567 8900" />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="store@example.com" />
            </div>
          </div>
          <div className="form-group">
            <label>Assign Manager</label>
            <select value={form.managerId} onChange={e => setForm(f => ({ ...f, managerId: e.target.value }))}>
              <option value="">— No manager assigned —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
          </div>
          {error && <div className="error-message">{error}</div>}
        </Modal>
      )}
    </div>
  )
}
