import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import Modal from '../Modal'
import { PackagePlus } from 'lucide-react'

export default function Inventory() {
  const { user } = useAuth()
  const canEdit = user?.role === 'ADMIN' || user?.role === 'MANAGER'
  const [inventory, setInventory] = useState([])
  const [modal, setModal]       = useState(false)
  const [selected, setSelected] = useState(null)
  const [addQty, setAddQty]     = useState('')
  const [setQty, setSetQty]     = useState('')
  const [supplier, setSupplier] = useState('')

  async function load() {
    const data = await api.get('/inventory')
    setInventory(data)
  }

  useEffect(() => { load() }, [])

  function openModal(item) {
    setSelected(item); setAddQty(''); setSetQty(''); setSupplier(''); setModal(true)
  }

  async function handleAdd() {
    if (!addQty || addQty <= 0) { alert('Enter a valid quantity'); return }
    await api.put(`/inventory/${selected.productId}/restock`, { addQuantity: parseInt(addQty), supplier })
    setModal(false); load()
  }

  async function handleSet() {
    if (setQty === '') { alert('Enter a quantity'); return }
    await api.put(`/inventory/${selected.productId}/adjust`, { quantity: parseInt(setQty), supplier })
    setModal(false); load()
  }

  return (
    <div>
      <div className="section-header">
        <h2>Inventory</h2>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Stock</th>
              <th>Alert Level</th>
              <th>Supplier</th>
              <th>Status</th>
              {canEdit && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {inventory.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 7 : 6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>
                  No inventory data found
                </td>
              </tr>
            )}
            {inventory.map(i => {
              const low = i.quantity <= i.lowStockAlert
              return (
                <tr key={i.productId}>
                  <td style={{ fontWeight: 600 }}>{i.product.name}</td>
                  <td><span className="badge badge-info">{i.product.category}</span></td>
                  <td>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{i.quantity}</span>
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{i.lowStockAlert}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{i.supplier || '—'}</td>
                  <td>
                    <span className={`badge ${low ? 'badge-warning' : 'badge-success'}`}>
                      {low ? 'Low Stock' : 'In Stock'}
                    </span>
                  </td>
                  {canEdit && (
                    <td>
                      <button className="btn btn-sm btn-outline" onClick={() => openModal(i)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <PackagePlus size={13} strokeWidth={2} /> Adjust
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modal && selected && (
        <Modal
          title="Adjust Stock"
          onClose={() => setModal(false)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-warning" onClick={handleSet}>Set Stock</button>
              <button className="btn btn-primary" onClick={handleAdd}>Add Stock</button>
            </>
          }
        >
          <p className="modal-subtitle">Product: <strong>{selected.product.name}</strong> — Current stock: <strong>{selected.quantity}</strong></p>
          <div className="form-row">
            <div className="form-group">
              <label>Add Stock (restock)</label>
              <input type="number" min="1" value={addQty} onChange={e => setAddQty(e.target.value)} placeholder="Qty to add" />
            </div>
            <div className="form-group">
              <label>Set Stock (override)</label>
              <input type="number" min="0" value={setQty} onChange={e => setSetQty(e.target.value)} placeholder="Exact qty" />
            </div>
          </div>
          <div className="form-group">
            <label>Supplier</label>
            <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier name" />
          </div>
        </Modal>
      )}
    </div>
  )
}
