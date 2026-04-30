import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import Modal from '../Modal'
import { LoadingRow, SaveBtn } from '../LoadingRow'
import { useAsync } from '../../hooks/useAsync'
import { useTabRefresh } from '../../hooks/useTabRefresh'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useAlert } from '../../context/AlertContext'

export default function ExpenseCategories() {
  const { showError } = useAlert()
  const [categories, setCategories]     = useState([])
  const [modal, setModal]               = useState(false)
  const [name, setName]                 = useState('')
  const [editId, setEditId]             = useState(null)
  const [tableLoading, setTableLoading] = useState(true)
  const [saving, saveError, runSave, setSaveError] = useAsync()

  async function load(silent) {
    if (!silent) setTableLoading(true)
    try { setCategories(await api.get('/expenses/categories')) } catch {} finally { if (!silent) setTableLoading(false) }
  }

  useEffect(() => { load() }, [])
  useTabRefresh('expenses-categories', () => load(true))

  function openEdit(c) { setEditId(c.id); setName(c.name); setSaveError(''); setModal(true) }

  async function save() {
    if (!name.trim()) { setSaveError('Name is required'); return }
    await runSave(async () => {
      if (editId) await api.put(`/expenses/categories/${editId}`, { name: name.trim() })
      else await api.post('/expenses/categories', { name: name.trim() })
      setModal(false); setName(''); setEditId(null); load()
    })
  }

  async function remove(id) {
    if (!confirm('Delete this category? Expenses using it will be affected.')) return
    try { await api.delete(`/expenses/categories/${id}`); load() } catch (err) { showError(err.message) }
  }

  return (
    <div>
      <div className="section-header">
        <h2>Expense Categories</h2>
        <button className="btn btn-primary" onClick={() => { setName(''); setEditId(null); setSaveError(''); setModal(true) }}><Plus size={15} strokeWidth={2.5} /> Add Category</button>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead><tr><th>Category Name</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>
            {tableLoading && <LoadingRow cols={3} />}
            {!tableLoading && categories.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>No categories yet</td></tr>}
            {!tableLoading && categories.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.name}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{new Date(c.createdAt).toLocaleDateString()}</td>
                <td>
                  <div className="action-group">
                    <button className="icon-btn primary" title="Edit" onClick={() => openEdit(c)}><Pencil size={13} strokeWidth={2} /></button>
                    <button className="icon-btn danger" title="Delete" onClick={() => remove(c.id)}><Trash2 size={13} strokeWidth={2} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={editId ? 'Edit Expense Category' : 'Add Expense Category'} onClose={() => setModal(false)}
          footer={<><button className="btn btn-outline" onClick={() => setModal(false)} disabled={saving}>Cancel</button><SaveBtn loading={saving} onClick={save} /></>}>
          <div className="form-group">
            <label>Category Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Utilities, Rent, Salaries" autoFocus />
          </div>
          {saveError && <div className="error-message">{saveError}</div>}
        </Modal>
      )}
    </div>
  )
}
