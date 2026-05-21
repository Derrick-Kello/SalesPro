import { useCurrency } from '../../context/CurrencyContext'

/**
 * Fields editable after receive: supplier, note (same as Purchase → Receive).
 * Quantity, product, warehouse, unit cost, and payment are fixed at receive time.
 */
export default function PurchaseEditForm({
  receipts = [],
  supplier,
  onSupplierChange,
  note,
  onNoteChange,
  suppliers = [],
}) {
  const { fmt } = useCurrency()
  const list = Array.isArray(receipts) ? receipts : []

  return (
    <>
      <div
        style={{
          marginBottom: 16,
          padding: 12,
          borderRadius: 10,
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          fontSize: 13,
          lineHeight: 1.45,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Recorded at receive (not editable here)</div>
        <p style={{ color: 'var(--text-muted)', margin: '0 0 10px' }}>
          Warehouse, product, quantity, unit cost, and payment status are set when stock is received.
          Use <strong>Create Payment</strong> to change payment status.
        </p>
        <div className="table-container" style={{ maxHeight: 160, overflowY: 'auto', boxShadow: 'none' }}>
          <table className="data-table" style={{ fontSize: 12.5 }}>
            <thead>
              <tr>
                <th>Product</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Unit cost</th>
                <th style={{ textAlign: 'right' }}>Line value</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>{r.product?.name ?? `#${r.productId}`}</td>
                  <td style={{ textAlign: 'right' }}>{r.quantity}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(r.unitCostSnapshot ?? 0)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(r.lineValueTotal ?? 0)}</td>
                  <td>
                    <span className="badge badge-info">
                      {String(r.paymentStatus || (r.isPaid ? 'PAID' : 'UNPAID')).toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list[0]?.warehouse?.name && (
          <p style={{ margin: '10px 0 0', color: 'var(--text-muted)', fontSize: 12.5 }}>
            Warehouse: <strong style={{ color: 'var(--text)' }}>{list[0].warehouse.name}</strong>
          </p>
        )}
      </div>

      <div className="form-group">
        <label>Supplier *</label>
        {suppliers.length > 0 ? (
          <select value={supplier} onChange={(e) => onSupplierChange(e.target.value)}>
            <option value="">Select supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
                {s.company ? ` · ${s.company}` : ''}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={supplier}
            onChange={(e) => onSupplierChange(e.target.value)}
            placeholder="Supplier name"
          />
        )}
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>Note</label>
        <input
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Optional note (same as on receive form)"
        />
      </div>
    </>
  )
}
