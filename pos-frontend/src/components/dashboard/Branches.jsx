import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import Modal from '../Modal'
import { LoadingRow, SaveBtn } from '../LoadingRow'
import { useAsync } from '../../hooks/useAsync'
import { useTabRefresh } from '../../hooks/useTabRefresh'
import { Plus, Pencil, PowerOff } from 'lucide-react'
import { useTableSelection } from '../../hooks/useTableSelection'
import { TableBulkBar, TableNumberCell, TableSelectCell, TableSelectHeader } from '../table/TableColumns'
import { bulkDeleteLoop } from '../../utils/bulkDelete'
import { useAlert } from '../../context/AlertContext'

const EMPTY = { name: '', location: '', phone: '' }

export default function Branches() {
  const { showError } = useAlert()
  const [branches, setBranches]         = useState([])
  const [modal, setModal]               = useState(false)
  const [form, setForm]                 = useState(EMPTY)
  const [editId, setEditId]             = useState(null)
  const [tableLoading, setTableLoading] = useState(true)
  const [saving, saveError, runSave, setSaveError] = useAsync()

  async function load(silent) {
    if (!silent) setTableLoading(true)
    try { setBranches(await api.get('/branches')) } catch {} finally { if (!silent) setTableLoading(false) }
  }

  useEffect(() => { load() }, [])
  useTabRefresh('branches', () => load(true))

  function openAdd() { setForm(EMPTY); setEditId(null); setSaveError(''); setModal(true) }
  function openEdit(b) {
    setForm({ name: b.name, location: b.location || '', phone: b.phone || '' })
    setEditId(b.id); setSaveError(''); setModal(true)
  }

  async function save() {
    if (!form.name) { setSaveError('Branch name is required'); return }
    await runSave(async () => {
      if (editId) await api.put(`/branches/${editId}`, form)
      else await api.post('/branches', form)
      setModal(false); load()
    })
  }

  async function deactivate(id) {
    if (!confirm('Deactivate this branch?')) return
    await api.delete(`/branches/${id}`); load()
  }

  const activeBranches = branches.filter((b) => b.isActive)
  const { selectedIds, bulkDeleting, setBulkDeleting, toggle, toggleAll, allSelected, clear } =
    useTableSelection(activeBranches)

  async function deactivateSelected() {
    if (!selectedIds.length) return
    if (!confirm(`Deactivate ${selectedIds.length} branch(es)?`)) return
    setBulkDeleting(true)
    try {
      await bulkDeleteLoop(api, '/branches', selectedIds)
      clear()
      load()
    } catch (err) {
      showError(err.message || 'Bulk deactivate failed')
    } finally {
      setBulkDeleting(false)
    }
  }

  return (
    <div>
      <div className="section-header">
        <h2>Branches</h2>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={15} strokeWidth={2.5} /> Add Branch</button>
      </div>

      <TableBulkBar
        selectedCount={selectedIds.length}
        onDelete={deactivateSelected}
        onClear={clear}
        deleting={bulkDeleting}
        entityLabel="branch"
      />

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <TableSelectHeader
                checked={allSelected}
                disabled={tableLoading || activeBranches.length === 0}
                onChange={toggleAll}
              />
              <th style={{ width: 44, textAlign: 'center' }}>#</th>
              <th>Name</th><th>Location</th><th>Phone</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tableLoading && <LoadingRow cols={7} />}
            {!tableLoading && branches.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>No branches yet</td></tr>}
            {!tableLoading && branches.map((b, idx) => (
              <tr key={b.id}>
                {b.isActive ? (
                  <TableSelectCell
                    checked={selectedIds.includes(b.id)}
                    onChange={(c) => toggle(b.id, c)}
                  />
                ) : (
                  <td />
                )}
                <TableNumberCell index={idx} />
                <td style={{ fontWeight: 600 }}>{b.name}</td>
                <td style={{ color: 'var(--text-muted)' }}>{b.location || '—'}</td>
                <td style={{ color: 'var(--text-muted)' }}>{b.phone || '—'}</td>
                <td><span className={`badge ${b.isActive ? 'badge-success' : 'badge-danger'}`}>{b.isActive ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <div className="action-group">
                    <button className="icon-btn primary" title="Edit" onClick={() => openEdit(b)}><Pencil size={13} strokeWidth={2} /></button>
                    {b.isActive && <button className="icon-btn danger" title="Deactivate" onClick={() => deactivate(b.id)}><PowerOff size={13} strokeWidth={2} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={editId ? 'Edit Branch' : 'Add Branch'} onClose={() => setModal(false)}
          footer={<><button className="btn btn-outline" onClick={() => setModal(false)} disabled={saving}>Cancel</button><SaveBtn loading={saving} onClick={save}>{editId ? 'Update' : 'Create'} Branch</SaveBtn></>}>
          <div className="form-group"><label>Branch Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Downtown Branch" autoFocus /></div>
          <div className="form-row">
            <div className="form-group"><label>Location</label><input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Street address or area" /></div>
            <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 234 567 8900" /></div>
          </div>
          {saveError && <div className="error-message">{saveError}</div>}
        </Modal>
      )}
    </div>
  )
}
