import { useEffect, useState } from 'react'
import bwipjs from 'bwip-js'
import Modal from './Modal'
import { Printer } from 'lucide-react'
import { useCurrency } from '../context/CurrencyContext'

// Each individual label renders barcode as an <img> (prints reliably vs canvas)
function SingleLabel({ product }) {
  const { fmt } = useCurrency()
  const [src, setSrc] = useState(null)

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas')
      bwipjs.toCanvas(canvas, {
        bcid: 'upca',
        text: product.barcode,
        scale: 3,
        height: 10,
        includetext: true,
        textxalign: 'center',
      })
      setSrc(canvas.toDataURL('image/png'))
    } catch (e) {
      console.error('Barcode render error:', e)
    }
  }, [product.barcode])

  return (
    <div className="barcode-label">
      <div className="barcode-label-name">{product.name}</div>
      {src && <img src={src} alt={product.barcode} style={{ maxWidth: '100%' }} />}
      <div className="barcode-label-price">{fmt(product.price)}</div>
    </div>
  )
}

// Renders N copies of a label for a product
function BarcodeLabel({ product, copies }) {
  if (!product.barcode || product.barcode.length !== 12) return null
  return (
    <>
      {Array.from({ length: copies }).map((_, i) => (
        <SingleLabel key={`${product.id}-${i}`} product={product} />
      ))}
    </>
  )
}

export default function BarcodePrintSheet({ products, onClose }) {
  // Only products that have a valid UPC-A barcode
  const eligible = products.filter(p => p.barcode && p.barcode.length === 12)

  const [selected, setSelected] = useState(() =>
    Object.fromEntries(eligible.map(p => [p.id, { checked: true, copies: 1 }]))
  )

  function toggle(id) {
    setSelected(s => ({ ...s, [id]: { ...s[id], checked: !s[id].checked } }))
  }

  function setCopies(id, val) {
    const n = Math.max(1, Math.min(20, Number(val) || 1))
    setSelected(s => ({ ...s, [id]: { ...s[id], copies: n } }))
  }

  function selectAll(val) {
    setSelected(s => Object.fromEntries(Object.entries(s).map(([id, v]) => [id, { ...v, checked: val }])))
  }

  const toPrint = eligible.filter(p => selected[p.id]?.checked)

  function handlePrint() {
    window.print()
  }

  return (
    <Modal
      title="Print Barcodes"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handlePrint}
            disabled={toPrint.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Printer size={14} strokeWidth={2} /> Print {toPrint.length} label{toPrint.length !== 1 ? 's' : ''}
          </button>
        </>
      }
    >
      {eligible.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
          No products with UPC-A barcodes found. Generate barcodes for products first.
        </p>
      ) : (
        <>
          {/* Selection controls */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className="btn btn-sm btn-outline" onClick={() => selectAll(true)}>Select All</button>
            <button className="btn btn-sm btn-outline" onClick={() => selectAll(false)}>Deselect All</button>
            <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-muted)', alignSelf: 'center' }}>
              {toPrint.length} of {eligible.length} selected
            </span>
          </div>

          {/* Product selection list */}
          <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16 }}>
            {eligible.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                <input
                  type="checkbox"
                  checked={selected[p.id]?.checked ?? true}
                  onChange={() => toggle(p.id)}
                  style={{ width: 15, height: 15, cursor: 'pointer' }}
                />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{p.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{p.barcode}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Copies:</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={selected[p.id]?.copies ?? 1}
                    onChange={e => setCopies(p.id, e.target.value)}
                    style={{ width: 48, padding: '2px 6px', fontSize: 12 }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Print preview */}
          {toPrint.length > 0 && (
            <>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Preview (prints on A4):</p>
              <div className="barcode-print-sheet">
                {toPrint.map(p => (
                  <BarcodeLabel key={p.id} product={p} copies={selected[p.id]?.copies ?? 1} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  )
}
