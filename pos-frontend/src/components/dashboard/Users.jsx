import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import Modal from '../Modal'
import { Plus, Pencil, UserX } from 'lucide-react'

const EMPTY = { fullName: '', username: '', password: '', role: 'CASHIER' }

const ROLE_COLORS = {
  ADMIN:   'badge-danger',
  MANAGER: 'badge-warning',
  CASHIER: 'badge-info',
}

export default function Users() {
  const [users, setUsers]   = useState([])
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [error, setError]   = useState('')

  async function load() {
    const data = await api.get('/users')
    setUsers(data)
  }

  useEffect(() => { load() }, [])

  function openAdd() { setForm(EMPTY); setEditId(null); setError(''); setModal(true) }

  function openEdit(u) {
    setForm({ fullName: u.fullName, username: u.username, password: '', role: u.role })
    setEditId(u.id); setError(''); setModal(true)
  }

  async function save() {
    if (!form.fullName || !form.username) { setError('Full name and username are required'); return }
    if (!editId && !form.password) { setError('Password is required for new users'); return }
    try {
      const payload = { fullName: form.fullName, role: form.role }
      if (!editId) { payload.username = form.username; payload.password = form.password }
      if (editId && form.password) payload.password = form.password
      if (editId) await api.put(`/users/${editId}`, payload)
      else await api.post('/users', payload)
      setModal(false); load()
    } catch (err) { setError(err.message) }
  }

  async function deactivate(id) {
    if (!confirm('Deactivate this user?')) return
    await api.delete(`/users/${id}`)
    load()
  }

  return (
    <div>
      <div className="section-header">
        <h2>User Management</h2>
        <button className="btn btn-primary" onClick={openAdd}>
          <Plus size={15} strokeWidth={2.5} /> Add User
        </button>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Full Name</th>
              <th>Username</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>No users found</td></tr>
            )}
            {users.map(u => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>{u.fullName}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-muted)' }}>{u.username}</td>
                <td><span className={`badge ${ROLE_COLORS[u.role] ?? 'badge-info'}`}>{u.role}</span></td>
                <td>
                  <span className={`badge ${u.isActive ? 'badge-success' : 'badge-danger'}`}>
                    {u.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <div className="action-group">
                    <button className="icon-btn primary" title="Edit user" onClick={() => openEdit(u)}>
                      <Pencil size={13} strokeWidth={2} />
                    </button>
                    {u.isActive && (
                      <button className="icon-btn danger" title="Deactivate" onClick={() => deactivate(u.id)}>
                        <UserX size={13} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title={editId ? 'Edit User' : 'Add User'}
          onClose={() => setModal(false)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>Save User</button>
            </>
          }
        >
          <div className="form-row">
            <div className="form-group">
              <label>Full Name *</label>
              <input
                value={form.fullName}
                onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                placeholder="e.g. Jane Smith"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Username *</label>
              <input
                value={form.username}
                disabled={!!editId}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="login username"
                style={editId ? { opacity: 0.55 } : {}}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Password {editId ? '(leave blank to keep)' : '*'}</label>
              <input
                type="password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder={editId ? '••••••••' : 'New password'}
              />
            </div>
            <div className="form-group">
              <label>Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="CASHIER">Cashier</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
          </div>
          {error && <div className="error-message">{error}</div>}
        </Modal>
      )}
    </div>
  )
}
