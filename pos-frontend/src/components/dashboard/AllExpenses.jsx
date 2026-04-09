import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useBranch } from '../../context/BranchContext'
import { useCurrency } from '../../context/CurrencyContext'
import Modal from '../Modal'
import { LoadingRow, SaveBtn } from '../LoadingRow'
import { useAsync } from '../../hooks/useAsync'
import { useTabRefresh } from '../../hooks/useTabRefresh'
import { Plus, Pencil, Trash2, Filter } from 'lucide-react'

const EMPTY = { title: '', amount: '', categoryId: '', note: '', date: '' }

export default function AllExpenses() {
  const { user } = useAuth()
  const { selectedBranchId } = useBranch()
  const { fmt } = useCurrency()
  const isAdmin = user?.role === 'ADMIN'
  const showBranchCol = isAdmin && !selectedBranchId
  const [expenses, setExpenses]         = useState([])
  const [categories, setCategories]     = useState([])
  const [modal, setModal]               = useState(false)
  const [form, setForm]                 = useState(EMPTY)
  const [editId, setEditId]             = useState(null)
  const [startDate, setStartDate]       = useState('')
  const [endDate, setEndDate]           = useState('')
  const [filterCat, setFilterCat]       = useState('')
  const [tableLoading, setTableLoading] = useState(true)
  const [filtering, setFiltering]       = useState(false)
  const [saving, saveError, runSave, setSaveError] = useAsync()

  async function load(showFilter = false, silent = false) {
    if (!silent) {
      if (showFilter) setFiltering(true); else setTableLoading(true)
    }
    try {
      const params = new URLSearchParams()
      if (startDate) params.append('startDate', startDate)
      if (endDate)   params.append('endDate', endDate)
      if (filterCat) params.append('categoryId', filterCat)
      if (selectedBranchId) params.append('branchId', selectedBranchId)
      const [exp, cats] = await Promise.all([
        api.get(`/expenses${params.toString() ? '?' + params : ''}`),
        api.get('/expenses/categories'),
      ])
      setExpenses(exp); setCategories(cats)
    } catch {} finally { if (!silent) { setTableLoading(false); setFiltering(false) } }
  }

  useEffect(() => { load() }, [selectedBranchId])
  useTabRefresh('expenses-all', () => load(false, true))

  function openAdd() { setForm({ ...EMPTY, date: new Date().toISOString().split('T')[0] }); setEditId(null); setSaveError(''); setModal(true) }
  function openEdit(e) {
    setForm({ title: e.title, amount: e.amount, categoryId: e.categoryId, note: e.note || '', date: e.date.split('T')[0] })
    setEditId(e.id); setSaveError(''); setModal(true)
  }

  async function save() {
    if (!form.title || !form.amount || !form.categoryId) { setSaveError('Title, amount and category are required'); return }
    await runSave(async () => {
      if (editId) await api.put(`/expenses/${editId}`, form)
      else await api.post('/expenses', form)
      setModal(false); load()
    })
  }

  async function remove(id) {
    if (!confirm('Delete this expense?')) return
    await api.delete(`/expenses/${id}`); load()
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0)

  return (
    <div>
      <div className="section-header">
        <h2>All Expenses</h2>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={15} strokeWidth={2.5} /> Add Expense</button>
      </div>

      <div className="date-filters" style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ minWidth: 140 }}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        <button className="btn btn-outline" onClick={() => load(true)} disabled={filtering} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {filtering
            ? <span className="spin" style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid var(--border2)', borderTopColor: 'var(--primary)', borderRadius: '50%' }} />
            : <Filter size={13} />
          }
          Filter
        </button>
        {expenses.length > 0 && <span style={{ marginLeft: 'auto', fontWeight: 700, alignSelf: 'center' }}>Total: {fmt(total)}</span>}
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead><tr><th>Date</th><th>Title</th><th>Category</th>{showBranchCol && <th>Branch</th>}<th>Amount</th><th>Note</th><th>Actions</th></tr></thead>
          <tbody>
            {tableLoading && <LoadingRow cols={showBranchCol ? 7 : 6} />}
            {!tableLoading && expenses.length === 0 && <tr><td colSpan={showBranchCol ? 7 : 6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>No expenses found</td></tr>}
            {!tableLoading && expenses.map(e => (
              <tr key={e.id}>
                <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{new Date(e.date).toLocaleDateString()}</td>
                <td style={{ fontWeight: 600 }}>{e.title}</td>
                <td><span className="badge badge-info">{e.category.name}</span></td>
                {showBranchCol && <td style={{ color: 'var(--text-muted)' }}>{e.branch?.name || '—'}</td>}
                <td style={{ fontWeight: 700, color: 'var(--danger)' }}>{fmt(e.amount)}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{e.note || '—'}</td>
                <td>
                  <div className="action-group">
                    <button className="icon-btn primary" onClick={() => openEdit(e)}><Pencil size={13} strokeWidth={2} /></button>
                    <button className="icon-btn danger" onClick={() => remove(e.id)}><Trash2 size={13} strokeWidth={2} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={editId ? 'Edit Expense' : 'Create Expense'} onClose={() => setModal(false)}
          footer={<><button className="btn btn-outline" onClick={() => setModal(false)} disabled={saving}>Cancel</button><SaveBtn loading={saving} onClick={save} /></>}>
          <div className="form-row">
            <div className="form-group"><label>Title *</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Expense title" autoFocus /></div>
            <div className="form-group"><label>Amount *</label><input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Category *</label>
              <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}>
                <option value="">Select category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Date</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
          </div>
          <div className="form-group"><label>Note</label><input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional note" /></div>
          {saveError && <div className="error-message">{saveError}</div>}
        </Modal>
      )}
    </div>
  )
}
