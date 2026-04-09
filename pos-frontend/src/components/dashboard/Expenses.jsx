import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { useCurrency } from '../../context/CurrencyContext'
import Modal from '../Modal'
import { SaveBtn } from '../LoadingRow'
import { useAsync } from '../../hooks/useAsync'
import { Search, Eye, Pencil, Trash2 } from 'lucide-react'

const STATUS_BADGE = {
  PENDING:  'badge-warning',
  APPROVED: 'badge-success',
  REJECTED: 'badge-danger',
  PAID:     'badge-info',
}

export default function Expenses() {
  const { fmt } = useCurrency()
  const [expenses, setExpenses] = useState([])
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [viewModal, setViewModal] = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [selected, setSelected] = useState(null)
  const [editForm, setEditForm] = useState({ title: '', amount: '', categoryId: '', note: '', date: '' })
  const [editId, setEditId] = useState(null)
  const [saving, saveError, runSave, setSaveError] = useAsync()

  async function load() {
    try {
      const [data, cats] = await Promise.all([api.get('/expenses'), api.get('/expenses/categories')])
      setExpenses(data); setCategories(cats)
    } catch { setExpenses([]) }
  }

  useEffect(() => { load() }, [])

  function openEdit(e) {
    setEditId(e.id)
    setEditForm({
      title: e.title || '',
      amount: e.amount ?? '',
      categoryId: e.categoryId || e.category?.id || '',
      note: e.note || '',
      date: e.date ? new Date(e.date).toISOString().slice(0, 10) : '',
    })
    setSaveError(''); setEditModal(true)
  }

  async function saveEdit() {
    if (!editForm.title || !editForm.amount || !editForm.categoryId) {
      setSaveError('Title, amount and category are required'); return
    }
    await runSave(async () => {
      await api.put(`/expenses/${editId}`, {
        title: editForm.title,
        amount: parseFloat(editForm.amount),
        categoryId: parseInt(editForm.categoryId),
        note: editForm.note || null,
        date: editForm.date || null,
      })
      setEditModal(false); setEditId(null); load()
    })
  }

  async function remove(id) {
    if (!confirm('Delete this expense?')) return
    await api.delete(`/expenses/${id}`)
    load()
  }

  const filtered = expenses.filter(e => {
    const matchSearch = (e.title || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.category?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.referenceNo || '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || e.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div>
      <div className="section-header">
        <h2>All Expenses</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ minWidth: 130 }}>
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="PAID">Paid</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>

      <div className="search-bar">
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search expenses…" style={{ paddingLeft: 36 }} />
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Date</th>
              <th>Title</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>No expenses found</td></tr>
            )}
            {filtered.map(e => (
              <tr key={e.id}>
                <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{e.referenceNo || `EXP-${e.id}`}</td>
                <td style={{ color: 'var(--text-muted)' }}>{new Date(e.date || e.createdAt).toLocaleDateString()}</td>
                <td style={{ fontWeight: 600 }}>{e.title}</td>
                <td><span className="badge badge-info">{e.category?.name || e.categoryName || '—'}</span></td>
                <td style={{ fontWeight: 700, color: 'var(--danger)' }}>{fmt(e.amount ?? 0)}</td>
                <td><span className={`badge ${STATUS_BADGE[e.status] || 'badge-info'}`}>{e.status || 'PENDING'}</span></td>
                <td>
                  <div className="action-group">
                    <button className="icon-btn primary" title="View" onClick={() => { setSelected(e); setViewModal(true) }}><Eye size={13} /></button>
                    <button className="icon-btn primary" title="Edit" onClick={() => openEdit(e)}><Pencil size={13} /></button>
                    <button className="icon-btn danger" title="Delete" onClick={() => remove(e.id)}><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewModal && selected && (
        <Modal
          title={`Expense: ${selected.title}`}
          onClose={() => setViewModal(false)}
          footer={<button className="btn btn-outline" onClick={() => setViewModal(false)}>Close</button>}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div><strong style={{ fontSize: 12, color: 'var(--text-muted)' }}>Reference</strong><div style={{ fontFamily: 'monospace' }}>{selected.referenceNo || `EXP-${selected.id}`}</div></div>
            <div><strong style={{ fontSize: 12, color: 'var(--text-muted)' }}>Date</strong><div>{new Date(selected.date || selected.createdAt).toLocaleDateString()}</div></div>
            <div><strong style={{ fontSize: 12, color: 'var(--text-muted)' }}>Category</strong><div>{selected.category?.name || selected.categoryName || '—'}</div></div>
            <div><strong style={{ fontSize: 12, color: 'var(--text-muted)' }}>Status</strong><div><span className={`badge ${STATUS_BADGE[selected.status] || 'badge-info'}`}>{selected.status || 'PENDING'}</span></div></div>
            <div><strong style={{ fontSize: 12, color: 'var(--text-muted)' }}>Amount</strong><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--danger)' }}>{fmt(selected.amount ?? 0)}</div></div>
          </div>
          {selected.description && (
            <div style={{ padding: 12, background: 'var(--surface2)', borderRadius: 8, fontSize: 13 }}>
              <strong>Description:</strong> {selected.description}
            </div>
          )}
        </Modal>
      )}

      {editModal && (
        <Modal title="Edit Expense" onClose={() => setEditModal(false)}
          footer={<><button className="btn btn-outline" onClick={() => setEditModal(false)} disabled={saving}>Cancel</button><SaveBtn loading={saving} onClick={saveEdit}>Save</SaveBtn></>}>
          <div className="form-group">
            <label>Title *</label>
            <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} autoFocus />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Amount *</label>
              <input type="number" step="0.01" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Category *</label>
              <select value={editForm.categoryId} onChange={e => setEditForm(f => ({ ...f, categoryId: e.target.value }))}>
                <option value="">Select category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Note</label>
              <input value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional note" />
            </div>
          </div>
          {saveError && <div className="error-message">{saveError}</div>}
        </Modal>
      )}
    </div>
  )
}
