import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import Modal from '../Modal'
import { LoadingRow, SaveBtn } from '../LoadingRow'
import { useAsync } from '../../hooks/useAsync'
import { useTabRefresh } from '../../hooks/useTabRefresh'
import { Plus, Pencil, UserX } from 'lucide-react'

const EMPTY = { fullName: '', username: '', password: '', role: 'CASHIER', branchId: '' }
const ROLE_COLORS = { ADMIN: 'badge-danger', MANAGER: 'badge-warning', CASHIER: 'badge-info' }

export default function Users() {
  const [users, setUsers]               = useState([])
  const [branches, setBranches]         = useState([])
  const [modal, setModal]               = useState(false)
  const [form, setForm]                 = useState(EMPTY)
  const [editId, setEditId]             = useState(null)
  const [tableLoading, setTableLoading] = useState(true)
  const [saving, saveError, runSave, setSaveError] = useAsync()

  async function load(silent) {
    if (!silent) setTableLoading(true)
    try {
      const [u, b] = await Promise.all([api.get('/users'), api.get('/branches')])
      setUsers(u); setBranches(b)
    } catch {} finally { if (!silent) setTableLoading(false) }
  }

  useEffect(() => { load() }, [])
  useTabRefresh('users', () => load(true))

  function openAdd() { setForm(EMPTY); setEditId(null); setSaveError(''); setModal(true) }
  function openEdit(u) {
    setForm({ fullName: u.fullName, username: u.username, password: '', role: u.role, branchId: u.branchId ? String(u.branchId) : '' })
    setEditId(u.id); setSaveError(''); setModal(true)
  }

  async function save() {
    if (!form.fullName || !form.username) { setSaveError('Full name and username are required'); return }
    if (!editId && !form.password) { setSaveError('Password is required for new users'); return }
    await runSave(async () => {
      const payload = {
        fullName: form.fullName,
        role: form.role,
        branchId: form.branchId ? parseInt(form.branchId) : null,
      }
      if (!editId) { payload.username = form.username; payload.password = form.password }
      if (editId && form.password) payload.password = form.password
      if (editId) await api.put(`/users/${editId}`, payload)
      else await api.post('/users', payload)
      setModal(false); load()
    })
  }

  async function deactivate(id) {
    if (!confirm('Deactivate this user?')) return
    await api.delete(`/users/${id}`)
    load()
  }

  const getBranchName = (branchId) => branches.find(b => b.id === branchId)?.name || '—'

  return (
    <div>
      <div className="section-header">
        <h2>User Management</h2>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={15} strokeWidth={2.5} /> Add User</button>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead><tr><th>Full Name</th><th>Username</th><th>Role</th><th>Branch</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {tableLoading && <LoadingRow cols={6} />}
            {!tableLoading && users.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>No users found</td></tr>}
            {!tableLoading && users.map(u => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>{u.fullName}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-muted)' }}>{u.username}</td>
                <td><span className={`badge ${ROLE_COLORS[u.role] ?? 'badge-info'}`}>{u.role}</span></td>
                <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{u.branchId ? getBranchName(u.branchId) : <span style={{ color: 'var(--text-light)' }}>—</span>}</td>
                <td><span className={`badge ${u.isActive ? 'badge-success' : 'badge-danger'}`}>{u.isActive ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <div className="action-group">
                    <button className="icon-btn primary" title="Edit" onClick={() => openEdit(u)}><Pencil size={13} strokeWidth={2} /></button>
                    {u.isActive && <button className="icon-btn danger" title="Deactivate" onClick={() => deactivate(u.id)}><UserX size={13} strokeWidth={2} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={editId ? 'Edit User' : 'Add User'} onClose={() => setModal(false)}
          footer={<><button className="btn btn-outline" onClick={() => setModal(false)} disabled={saving}>Cancel</button><SaveBtn loading={saving} onClick={save}>Save User</SaveBtn></>}>
          <div className="form-row">
            <div className="form-group"><label>Full Name *</label><input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="e.g. Jane Smith" autoFocus /></div>
            <div className="form-group"><label>Username *</label><input value={form.username} disabled={!!editId} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="login username" style={editId ? { opacity: 0.55 } : {}} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Password {editId ? '(leave blank to keep)' : '*'}</label><input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={editId ? '••••••••' : 'New password'} /></div>
            <div className="form-group"><label>Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="CASHIER">Cashier</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
          </div>
          <div className="form-group"><label>Branch Assignment</label>
            <select value={form.branchId} onChange={e => setForm(f => ({ ...f, branchId: e.target.value }))}>
              <option value="">No branch assigned</option>
              {branches.filter(b => b.isActive).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          {saveError && <div className="error-message">{saveError}</div>}
        </Modal>
      )}
    </div>
  )
}
