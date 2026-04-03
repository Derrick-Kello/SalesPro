import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import Modal from '../Modal'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'

const EMPTY = {
  name: '', category: '', price: '', barcode: '',
  description: '', quantity: 0, lowStockAlert: 10, supplier: '',
}

export default function Products() {
  const { user } = useAuth()
  const canEdit = user?.role === 'ADMIN' || user?.role === 'MANAGER'
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    const data = await api.get('/products')
    setProducts(data)
  }

  useEffect(() => { load() }, [])

  function openAdd() {
    setForm(EMPTY); setEditId(null); setError(''); setModal(true)
  }

  function openEdit(p) {
    setForm({
      name: p.name, category: p.category, price: p.price,
      barcode: p.barcode || '', description: p.description || '',
      quantity: p.inventory?.quantity ?? 0,
      lowStockAlert: p.inventory?.lowStockAlert ?? 10,
      supplier: p.inventory?.supplier || '',
    })
    setEditId(p.id); setError(''); setModal(true)
  }

  async function save() {
    if (!form.name || !form.category || !form.price) {
      setError('Name, category and price are required'); return
    }
    try {
      if (editId) await api.put(`/products/${editId}`, form)
      else await api.post('/products', form)
      setModal(false); load()
    } catch (err) { setError(err.message) }
  }

  async function remove(id) {
    if (!confirm('Remove this product?')) return
    await api.delete(`/products/${id}`)
    load()
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.barcode && p.barcode.includes(search)) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="section-header">
        <h2>Products</h2>
        {canEdit && (
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={15} strokeWidth={2.5} /> Add Product
          </button>
        )}
      </div>

      <div className="search-bar">
        <div style={{ position: 'relative', flex: 1 }}>
          <Search
            size={15}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', pointerEvents: 'none' }}
          />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, barcode or category…"
            style={{ paddingLeft: 36 }}
          />
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Category</th>
              <th>Price</th>
              <th>Barcode</th>
              <th>Stock</th>
              {canEdit && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 7 : 6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>
                  No products found
                </td>
              </tr>
            )}
            {filtered.map(p => (
              <tr key={p.id}>
                <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>#{p.id}</td>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td>
                  <span className="badge badge-info">{p.category}</span>
                </td>
                <td style={{ fontWeight: 700 }}>${p.price.toFixed(2)}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>
                  {p.barcode || '—'}
                </td>
                <td>
                  <span className={`badge ${(p.inventory?.quantity ?? 0) <= (p.inventory?.lowStockAlert ?? 10) ? 'badge-warning' : 'badge-success'}`}>
                    {p.inventory?.quantity ?? 0}
                  </span>
                </td>
                {canEdit && (
                  <td>
                    <div className="action-group">
                      <button className="icon-btn primary" title="Edit" onClick={() => openEdit(p)}>
                        <Pencil size={13} strokeWidth={2} />
                      </button>
                      <button className="icon-btn danger" title="Delete" onClick={() => remove(p.id)}>
                        <Trash2 size={13} strokeWidth={2} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title={editId ? 'Edit Product' : 'Add Product'}
          onClose={() => setModal(false)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>Save Product</button>
            </>
          }
        >
          <div className="form-row">
            <div className="form-group">
              <label>Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Product name" />
            </div>
            <div className="form-group">
              <label>Category *</label>
              <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Beverages" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Price *</label>
              <input type="number" step="0.01" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="form-group">
              <label>Barcode</label>
              <input value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} placeholder="SKU / barcode" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Initial Stock</label>
              <input type="number" min="0" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Low Stock Alert</label>
              <input type="number" min="0" value={form.lowStockAlert} onChange={e => setForm(f => ({ ...f, lowStockAlert: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Supplier</label>
              <input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="Supplier name" />
            </div>
            <div className="form-group">
              <label>Description</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
            </div>
          </div>
          {error && <div className="error-message">{error}</div>}
        </Modal>
      )}
    </div>
  )
}
