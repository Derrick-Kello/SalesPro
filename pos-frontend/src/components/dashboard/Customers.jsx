import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { useCurrency } from '../../context/CurrencyContext'
import Modal from '../Modal'
import { LoadingRow, SaveBtn } from '../LoadingRow'
import { usePermissions } from '../../context/PermissionContext'
import { useAsync } from '../../hooks/useAsync'
import { useTabRefresh } from '../../hooks/useTabRefresh'
import { Plus, Pencil, History, Search, Trash2 } from 'lucide-react'

const EMPTY = { name: '', phone: '', email: '', address: '' }

export default function Customers() {
  const { fmt } = useCurrency()
  const { can } = usePermissions()
  const [customers, setCustomers]       = useState([])
  const [search, setSearch]             = useState('')
  const [modal, setModal]               = useState(false)
  const [historyModal, setHistoryModal] = useState(false)
  const [form, setForm]                 = useState(EMPTY)
  const [editId, setEditId]             = useState(null)
  const [history, setHistory]           = useState(null)
  const [tableLoading, setTableLoading] = useState(true)
  const [saving, saveError, runSave, setSaveError] = useAsync()
  const [histLoading,, runHist] = useAsync()

  async function load(silent) {
    if (!silent) setTableLoading(true)
    try { setCustomers(await api.get('/customers')) } catch {} finally { if (!silent) setTableLoading(false) }
  }

  useEffect(() => { load() }, [])
  useTabRefresh('customers', () => load(true))

  function openAdd() { setForm(EMPTY); setEditId(null); setSaveError(''); setModal(true) }
  function openEdit(c) {
    setForm({ name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '' })
    setEditId(c.id); setSaveError(''); setModal(true)
  }

  async function deleteCustomer(id) {
    if (!confirm('Delete this customer? This cannot be undone.')) return
    try { await api.delete(`/customers/${id}`); load() } catch (err) { alert(err.message) }
  }

  async function viewHistory(id) {
    const data = await runHist(() => api.get(`/customers/${id}`))
    setHistory(data); setHistoryModal(true)
  }

  async function save() {
    if (!form.name) { setSaveError('Name is required'); return }
    await runSave(async () => {
      const payload = { ...form, phone: form.phone || null, email: form.email || null, address: form.address || null }
      if (editId) await api.put(`/customers/${editId}`, payload)
      else await api.post('/customers', payload)
      setModal(false); load()
    })
  }

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone && c.phone.includes(search)) ||
    (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div>
      <div className="section-header">
        <h2>Customers</h2>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={15} strokeWidth={2.5} /> Add Customer</button>
      </div>

      <div className="search-bar">
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone or email…" style={{ paddingLeft: 36 }} />
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Loyalty Points</th><th>Actions</th></tr></thead>
          <tbody>
            {tableLoading && <LoadingRow cols={5} />}
            {!tableLoading && filtered.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>No customers found</td></tr>}
            {!tableLoading && filtered.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.name}</td>
                <td style={{ color: 'var(--text-muted)' }}>{c.phone || '—'}</td>
                <td style={{ color: 'var(--text-muted)' }}>{c.email || '—'}</td>
                <td><span className="badge badge-info">{c.loyaltyPoints} pts</span></td>
                <td>
                  <div className="action-group">
                    <button className="icon-btn primary" title="Edit" onClick={() => openEdit(c)}><Pencil size={13} strokeWidth={2} /></button>
                    <button className="icon-btn" title="Purchase history" disabled={histLoading} onClick={() => viewHistory(c.id)}><History size={13} strokeWidth={2} /></button>
                    {can('customers.delete') && (
                      <button className="icon-btn danger" title="Delete customer" onClick={() => deleteCustomer(c.id)}><Trash2 size={13} strokeWidth={2} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={editId ? 'Edit Customer' : 'Add Customer'} onClose={() => setModal(false)}
          footer={<><button className="btn btn-outline" onClick={() => setModal(false)} disabled={saving}>Cancel</button><SaveBtn loading={saving} onClick={save}>Save Customer</SaveBtn></>}>
          <div className="form-group"><label>Full Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Customer name" autoFocus /></div>
          <div className="form-row">
            <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 234 567 8900" /></div>
            <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" /></div>
          </div>
          <div className="form-group"><label>Address</label><input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Street address" /></div>
          {saveError && <div className="error-message">{saveError}</div>}
        </Modal>
      )}

      {historyModal && history && (
        <Modal title={`${history.name} — Purchase History`} onClose={() => setHistoryModal(false)}
          footer={<button className="btn btn-outline" onClick={() => setHistoryModal(false)}>Close</button>}>
          <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
            <div style={{ background: 'var(--primary-light)', border: '1px solid var(--blue-mid)', borderRadius: 10, padding: '12px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Loyalty Points</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{history.loyaltyPoints}</div>
            </div>
            <div style={{ background: 'var(--success-light)', border: '1px solid #A7F3D0', borderRadius: 10, padding: '12px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Total Purchases</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{history.sales?.length || 0}</div>
            </div>
          </div>
          <table className="report-table">
            <thead><tr><th>Sale #</th><th>Date</th><th>Total</th><th>Payment</th></tr></thead>
            <tbody>
              {history.sales?.length
                ? history.sales.map(s => (
                    <tr key={s.id}>
                      <td style={{ fontFamily: 'monospace' }}>#{s.id}</td>
                      <td>{new Date(s.createdAt).toLocaleDateString()}</td>
                      <td style={{ fontWeight: 700 }}>{fmt(s.grandTotal)}</td>
                      <td>{s.payment?.method?.replace('_', ' ') || '—'}</td>
                    </tr>
                  ))
                : <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No purchases yet</td></tr>}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  )
}
