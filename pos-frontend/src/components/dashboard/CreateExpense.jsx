import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { Save } from 'lucide-react'

export default function CreateExpense() {
  const [form, setForm] = useState({ title: '', categoryId: '', amount: '', date: new Date().toISOString().slice(0, 10), description: '', status: 'PENDING' })
  const [categories, setCategories] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/expense-categories').then(setCategories).catch(() => setCategories([]))
  }, [])

  async function submit() {
    setError(''); setSuccess('')
    if (!form.title) { setError('Title is required'); return }
    if (!form.amount || Number(form.amount) <= 0) { setError('Amount must be greater than 0'); return }
    if (!form.categoryId) { setError('Please select a category'); return }

    setSaving(true)
    try {
      await api.post('/expenses', {
        title: form.title,
        categoryId: Number(form.categoryId),
        amount: Number(form.amount),
        date: form.date,
        description: form.description || null,
        status: form.status,
      })
      setSuccess('Expense created successfully!')
      setForm({ title: '', categoryId: '', amount: '', date: new Date().toISOString().slice(0, 10), description: '', status: 'PENDING' })
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div className="section-header">
        <h2>Create Expense</h2>
      </div>

      {success && (
        <div style={{ background: 'var(--success-light)', border: '1px solid #A7F3D0', borderRadius: 10, padding: '12px 16px', marginBottom: 20, color: 'var(--success)', fontWeight: 600, fontSize: 13 }}>
          {success}
        </div>
      )}

      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24, maxWidth: 640 }}>
        <div className="form-group">
          <label>Expense Title *</label>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Office Supplies" autoFocus />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Category *</label>
            <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}>
              <option value="">— Select category —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Amount *</label>
            <input type="number" min={0} step={0.01} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Date</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="PAID">Paid</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional details…" rows={3} style={{ resize: 'vertical', width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 14, fontFamily: 'inherit' }} />
        </div>

        {error && <div className="error-message">{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            <Save size={15} /> {saving ? 'Saving…' : 'Create Expense'}
          </button>
        </div>
      </div>
    </div>
  )
}
