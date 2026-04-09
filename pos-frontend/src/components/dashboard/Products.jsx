import { useEffect, useState, useRef } from 'react'
import { api } from '../../api/client'
import { useCurrency } from '../../context/CurrencyContext'
import { usePermissions } from '../../context/PermissionContext'
import Modal from '../Modal'
import { LoadingRow, SaveBtn } from '../LoadingRow'
import { useAsync } from '../../hooks/useAsync'
import { useTabRefresh } from '../../hooks/useTabRefresh'
import BarcodeDisplay from '../BarcodeDisplay'
import BarcodePrintSheet from '../BarcodePrintSheet'
import { Plus, Pencil, Trash2, Search, Barcode, FileDown, FileUp, FileText } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

function generateUPCA() {
  const digits = Array.from({ length: 11 }, () => Math.floor(Math.random() * 10))
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8] + digits[10]
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7] + digits[9]
  const check = (10 - ((oddSum * 3 + evenSum) % 10)) % 10
  return [...digits, check].join('')
}

const EMPTY = { name: '', category: '', price: '', costPrice: '', barcode: '', description: '', quantity: 0, lowStockAlert: 10, supplier: '', branchIds: [] }

export default function Products({ mode = 'all' }) {
  const { fmt } = useCurrency()
  const { can } = usePermissions()
  const canEdit = can('products.edit') || can('products.create')
  const [products, setProducts] = useState([])
  const [branches, setBranches] = useState([])
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(mode === 'create')
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [printOpen, setPrintOpen] = useState(mode === 'labels')
  const [importError, setImportError] = useState('')
  const [tableLoading, setTableLoading] = useState(true)
  const [saving, saveError, runSave, setSaveError] = useAsync()
  const fileRef = useRef(null)

  async function load(silent) {
    if (!silent) setTableLoading(true)
    try {
      const [p, b] = await Promise.all([
        api.get('/products'),
        api.get('/branches').catch(() => []),
      ])
      setProducts(p)
      setBranches(b.filter(br => br.isActive))
    } catch {} finally { if (!silent) setTableLoading(false) }
  }

  useEffect(() => { load() }, [])
  useTabRefresh('products-all', () => load(true))

  // Open create modal when mode switches to 'create'
  useEffect(() => {
    if (mode === 'create') { setForm(EMPTY); setEditId(null); setSaveError(''); setModal(true) }
    if (mode === 'labels') { setPrintOpen(true) }
  }, [mode])

  function openAdd() { setForm(EMPTY); setEditId(null); setSaveError(''); setModal(true) }

  function openEdit(p) {
    setForm({
      name: p.name, category: p.category, price: p.price,
      costPrice: p.costPrice != null ? p.costPrice : '',
      barcode: p.barcode || '', description: p.description || '',
      quantity: p.inventory?.quantity ?? 0,
      lowStockAlert: p.inventory?.lowStockAlert ?? 10,
      supplier: p.inventory?.supplier || '',
      branchIds: (p.branches || []).map(b => b.id),
    })
    setEditId(p.id); setSaveError(''); setModal(true)
  }

  async function save() {
    if (!form.name || !form.category || !form.price || form.costPrice === '' || form.costPrice === undefined) { setSaveError('Name, category, selling price, and cost price are required'); return }
    await runSave(async () => {
      if (editId) await api.put(`/products/${editId}`, form)
      else await api.post('/products', form)
      setModal(false); load()
    })
  }

  async function remove(id) {
    if (!confirm('Remove this product?')) return
    await api.delete(`/products/${id}`)
    load()
  }

  // ── Export PDF ──
  function exportPDF() {
    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text('Products List', 14, 16)
    autoTable(doc, {
      startY: 22,
      head: [['#', 'Name', 'Category', 'Cost Price', 'Selling Price', 'Barcode', 'Stock']],
      body: filtered.map(p => [
        p.id, p.name, p.category,
        fmt(p.costPrice ?? 0),
        fmt(p.price),
        p.barcode || '—',
        p.inventory?.quantity ?? 0,
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [0, 102, 204] },
    })
    doc.save('products.pdf')
  }

  // ── Export Excel ──
  function exportExcel() {
    const rows = filtered.map(p => ({
      ID: p.id,
      Name: p.name,
      Category: p.category,
      CostPrice: p.costPrice ?? 0,
      SellingPrice: p.price,
      Barcode: p.barcode || '',
      Stock: p.inventory?.quantity ?? 0,
      LowStockAlert: p.inventory?.lowStockAlert ?? 10,
      Supplier: p.inventory?.supplier || '',
      Description: p.description || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Products')
    XLSX.writeFile(wb, 'products.xlsx')
  }

  // ── Import CSV/Excel ──
  function handleImport(e) {
    const file = e.target.files[0]
    if (!file) return
    setImportError('')
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws)
        let imported = 0, skipped = 0
        for (const row of rows) {
          const name = row.Name || row.name
          const category = row.Category || row.category
          const price = parseFloat(row.SellingPrice || row.Price || row.price)
          const costPrice = parseFloat(row.CostPrice || row.costPrice || 0)
          if (!name || !category || isNaN(price) || isNaN(costPrice)) { skipped++; continue }
          try {
            await api.post('/products', {
              name, category, price, costPrice,
              barcode: row.Barcode || row.barcode || undefined,
              description: row.Description || row.description || '',
              quantity: parseInt(row.Stock || row.stock) || 0,
              lowStockAlert: parseInt(row.LowStockAlert || row.lowStockAlert) || 10,
              supplier: row.Supplier || row.supplier || '',
            })
            imported++
          } catch { skipped++ }
        }
        await load()
        alert(`Import complete: ${imported} added, ${skipped} skipped.`)
      } catch (err) {
        setImportError('Failed to parse file. Make sure it is a valid CSV or Excel file.')
      }
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.barcode && p.barcode.includes(search)) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="section-header">
        <h2>All Products</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Export buttons */}
          <button className="btn btn-outline" onClick={exportPDF} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <FileText size={14} strokeWidth={2} /> PDF
          </button>
          <button className="btn btn-outline" onClick={exportExcel} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <FileDown size={14} strokeWidth={2} /> Excel
          </button>
          {canEdit && (
            <>
              <button className="btn btn-outline" onClick={() => fileRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <FileUp size={14} strokeWidth={2} /> Import
              </button>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleImport} />
              <button className="btn btn-primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Plus size={15} strokeWidth={2.5} /> Add Product
              </button>
            </>
          )}
        </div>
      </div>

      {importError && <div className="error-message" style={{ marginBottom: 12 }}>{importError}</div>}

      <div className="search-bar">
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, barcode or category…" style={{ paddingLeft: 36 }} />
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th><th>Name</th><th>Category</th><th>Cost Price</th><th>Selling Price</th><th>Barcode</th><th>Stock</th><th>Branches</th>
              {canEdit && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {tableLoading && <LoadingRow cols={canEdit ? 9 : 8} />}
            {!tableLoading && filtered.length === 0 && (
              <tr><td colSpan={canEdit ? 9 : 8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>No products found</td></tr>
            )}
            {!tableLoading && filtered.map(p => (
              <tr key={p.id}>
                <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>#{p.id}</td>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td><span className="badge badge-info">{p.category}</span></td>
                <td style={{ color: 'var(--text-muted)' }}>{fmt(p.costPrice ?? 0)}</td>
                <td style={{ fontWeight: 700 }}>{fmt(p.price)}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{p.barcode || '—'}</td>
                <td>
                  <span className={`badge ${(p.inventory?.quantity ?? 0) <= (p.inventory?.lowStockAlert ?? 10) ? 'badge-warning' : 'badge-success'}`}>
                    {p.inventory?.quantity ?? 0}
                  </span>
                </td>
                <td>
                  {p.branches?.length ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {p.branches.map(b => <span key={b.id} className="badge badge-info" style={{ fontSize: 11 }}>{b.name}</span>)}
                    </div>
                  ) : (
                    <span className="badge badge-success" style={{ fontSize: 11 }}>All</span>
                  )}
                </td>
                {canEdit && (
                  <td>
                    <div className="action-group">
                      <button className="icon-btn primary" title="Edit" onClick={() => openEdit(p)}><Pencil size={13} strokeWidth={2} /></button>
                      <button className="icon-btn danger" title="Delete" onClick={() => remove(p.id)}><Trash2 size={13} strokeWidth={2} /></button>
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
          footer={<><button className="btn btn-outline" onClick={() => setModal(false)} disabled={saving}>Cancel</button><SaveBtn loading={saving} onClick={save}>Save Product</SaveBtn></>}
        >
          <div className="form-row">
            <div className="form-group"><label>Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Product name" autoFocus /></div>
            <div className="form-group"><label>Category *</label><input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Beverages" /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Cost Price *</label><input type="number" step="0.01" min="0" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} placeholder="0.00" /></div>
            <div className="form-group"><label>Selling Price *</label><input type="number" step="0.01" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" /></div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Barcode (UPC-A)</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} placeholder="12-digit UPC-A" maxLength={12} style={{ flex: 1 }} />
                <button type="button" className="btn btn-outline" onClick={() => setForm(f => ({ ...f, barcode: generateUPCA() }))} style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                  <Barcode size={14} strokeWidth={2} /> Generate
                </button>
              </div>
              <BarcodeDisplay value={form.barcode} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Initial Stock</label><input type="number" min="0" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} /></div>
            <div className="form-group"><label>Low Stock Alert</label><input type="number" min="0" value={form.lowStockAlert} onChange={e => setForm(f => ({ ...f, lowStockAlert: e.target.value }))} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Supplier</label><input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="Supplier name" /></div>
            <div className="form-group"><label>Description</label><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" /></div>
          </div>
          {branches.length > 0 && (
            <div className="form-group">
              <label>Available at Branches {!form.branchIds.length && <span style={{ color: 'var(--text-light)', fontWeight: 400 }}>(all branches if none selected)</span>}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {branches.map(b => (
                  <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 13, padding: '4px 10px', borderRadius: 6, background: form.branchIds.includes(b.id) ? 'var(--primary-light, #e8f0fe)' : 'var(--bg-card)', border: `1px solid ${form.branchIds.includes(b.id) ? 'var(--primary)' : 'var(--border)'}` }}>
                    <input
                      type="checkbox"
                      checked={form.branchIds.includes(b.id)}
                      onChange={() => setForm(f => ({
                        ...f,
                        branchIds: f.branchIds.includes(b.id)
                          ? f.branchIds.filter(id => id !== b.id)
                          : [...f.branchIds, b.id],
                      }))}
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    {b.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          {saveError && <div className="error-message">{saveError}</div>}
        </Modal>
      )}

      {printOpen && <BarcodePrintSheet products={products} onClose={() => setPrintOpen(false)} />}
    </div>
  )
}
