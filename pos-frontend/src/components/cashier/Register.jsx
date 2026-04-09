import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useBranch } from '../../context/BranchContext'
import { useCurrency } from '../../context/CurrencyContext'
import Modal from '../Modal'
import BarcodeDisplay from '../BarcodeDisplay'
import { Search, ShoppingCart, UserPlus, Trash2, Banknote, CreditCard, Smartphone, Printer, X, Barcode, AlertTriangle } from 'lucide-react'

const STORE_NAME = 'SalesPro'

const PAY_METHODS = [
  { key: 'CASH',         label: 'Cash',         icon: Banknote },
  { key: 'MOBILE_MONEY', label: 'Mobile Money',  icon: Smartphone },
  { key: 'CARD',         label: 'Card',          icon: CreditCard },
]

export default function Register() {
  const { user } = useAuth()
  const { fmt, currency } = useCurrency()
  const branchCtx = useBranch()
  const selectedBranchId = branchCtx?.selectedBranchId ?? null
  const branchId =
    user?.role === 'ADMIN'
      ? selectedBranchId
      : (user?.branchId ?? null)
  const [allProducts, setAllProducts] = useState([])
  const [products, setProducts]       = useState([])
  const [customers, setCustomers]     = useState([])
  const [cart, setCart]               = useState([])
  const [category, setCategory]       = useState('all')
  const [search, setSearch]           = useState('')
  const [customerId, setCustomerId]   = useState('')
  const [discount, setDiscount]       = useState(0)
  const [taxInput, setTaxInput]       = useState(0)
  const [shippingInput, setShippingInput] = useState(0)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [receiptOpen, setReceiptOpen]   = useState(false)
  const [customerOpen, setCustomerOpen] = useState(false)
  const [lastSale, setLastSale]         = useState(null)
  const [payMethod, setPayMethod]       = useState('CASH')
  const [amountPaid, setAmountPaid]     = useState('')
  const [payRef, setPayRef]             = useState('')
  const [checkoutError, setCheckoutError] = useState('')
  const [newCust, setNewCust]           = useState({ name: '', phone: '', email: '' })
  const [barcodePreview, setBarcodePreview] = useState(null)
  const [processing, setProcessing]     = useState(false)
  const scanTimerRef = useRef(null)
  const lastKeyTime  = useRef(0)
  const submittingRef = useRef(false) // hard guard against double-submit

  const loadProducts = useCallback(async () => {
    try {
      const params = branchId ? `?branchId=${branchId}` : ''
      setAllProducts(await api.get(`/products${params}`))
    } catch (err) { console.error(err.message) }
  }, [branchId])

  function stockForProduct(p) {
    if (branchId) {
      if (p.branchInventory?.length) return p.branchInventory[0].quantity
      return p.inventory ? p.inventory.quantity : 0
    }
    return p.inventory ? p.inventory.quantity : 0
  }

  const loadCustomers = useCallback(async () => {
    try { setCustomers(await api.get('/customers')) } catch (err) { console.error(err.message) }
  }, [])

  useEffect(() => { loadProducts(); loadCustomers() }, [loadProducts, loadCustomers])

  useEffect(() => {
    let filtered = allProducts
    if (category !== 'all') filtered = filtered.filter(p => p.category === category)
    if (search) filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode && p.barcode.includes(search))
    )
    setProducts(filtered)
  }, [category, search, allProducts])

  const categories = ['all', ...[...new Set(allProducts.map(p => p.category))].sort()]

  async function handleBarcodeEnter(e) {
    if (e.key !== 'Enter' || !search.trim()) return
    try {
      const raw = await api.get('/products/barcode/' + encodeURIComponent(search.trim()))
      const product = allProducts.find(p => p.id === raw.id) || raw
      addToCart(product)
      setSearch('')
    } catch (_) {}
  }

  // Detect hardware scanner: keys arrive < 50ms apart, auto-submit after 100ms idle
  function handleScannerInput(e) {
    const now = Date.now()
    const delta = now - lastKeyTime.current
    lastKeyTime.current = now

    if (e.key === 'Enter') {
      clearTimeout(scanTimerRef.current)
      handleBarcodeEnter(e)
      return
    }

    // If keys are coming in fast (scanner speed), set a short auto-submit timer
    if (delta < 50) {
      clearTimeout(scanTimerRef.current)
      scanTimerRef.current = setTimeout(async () => {
        const val = e.target.value
        if (!val.trim()) return
        try {
          const raw = await api.get('/products/barcode/' + encodeURIComponent(val.trim()))
          const product = allProducts.find(p => p.id === raw.id) || raw
          addToCart(product)
          setSearch('')
        } catch (_) {}
      }, 100)
    }
  }

  function addToCart(product) {
    const stock = stockForProduct(product)
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id)
      const currentQty = existing ? existing.quantity : 0
      if (currentQty >= stock) {
        alert('Only ' + stock + ' units available for ' + product.name)
        return prev
      }
      if (existing) {
        return prev.map(i => i.productId === product.id
          ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.unitPrice }
          : i)
      }
      return [...prev, {
        productId: product.id,
        name: product.name,
        unitPrice: product.price,
        quantity: 1,
        subtotal: product.price,
      }]
    })
  }

  function updateQty(productId, delta) {
    setCart(prev =>
      prev
        .map(i => i.productId === productId
          ? { ...i, quantity: i.quantity + delta, subtotal: (i.quantity + delta) * i.unitPrice }
          : i)
        .filter(i => i.quantity > 0)
    )
  }

  function removeItem(productId) { setCart(prev => prev.filter(i => i.productId !== productId)) }

  function clearCart() { setCart([]); setDiscount(0); setTaxInput(0); setShippingInput(0); setCustomerId('') }

  const subtotal   = cart.reduce((s, i) => s + i.subtotal, 0)
  const tax        = Number(taxInput) || 0
  const shippingAmt = Number(shippingInput) || 0
  const grandTotal = Math.max(0, subtotal - Number(discount)) + tax + shippingAmt
  const change     = Number(amountPaid) - grandTotal

  function openCheckout() {
    if (!cart.length) { alert('Cart is empty'); return }
    setPayMethod('CASH'); setAmountPaid(''); setPayRef(''); setCheckoutError('')
    setCheckoutOpen(true)
  }

  async function processPayment() {
    if (submittingRef.current) return   // block any concurrent call
    submittingRef.current = true
    setProcessing(true)
    setCheckoutError('')
    if (payMethod === 'CASH' && Number(amountPaid) < grandTotal) {
      setCheckoutError('Amount tendered is less than the total')
      setProcessing(false)
      submittingRef.current = false
      return
    }
    try {
      const sale = await api.post('/sales', {
        customerId: customerId || null,
        items: cart.map(i => ({ productId: i.productId, quantity: i.quantity })),
        discount: Number(discount),
        tax,
        shipping: shippingAmt,
        paymentMethod: payMethod,
        amountPaid: payMethod === 'CASH' ? Number(amountPaid) : grandTotal,
        paymentReference: payRef || null,
        ...(user?.role === 'ADMIN' && branchId ? { branchId } : {}),
      })
      setLastSale(sale)
      setCheckoutOpen(false)
      setReceiptOpen(true)
      clearCart()
      loadProducts()
    } catch (err) {
      setCheckoutError(err.message)
    } finally {
      setProcessing(false)
      submittingRef.current = false
    }
  }

  async function registerCustomer() {
    if (!newCust.name.trim()) { alert('Name is required'); return }
    try {
      const c = await api.post('/customers', {
        name: newCust.name,
        phone: newCust.phone || null,
        email: newCust.email || null,
      })
      setCustomers(prev => [...prev, c])
      setCustomerId(String(c.id))
      setCustomerOpen(false)
      setNewCust({ name: '', phone: '', email: '' })
    } catch (err) { alert(err.message) }
  }

  function printReceipt() {
    const el = document.getElementById('receipt-print')
    if (!el) return
    const win = window.open('', '_blank', 'width=320,height=600')
    win.document.write(`<!DOCTYPE html><html><head><title>Receipt</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; padding: 4mm; color: #000; }
.receipt-header { text-align: center; margin-bottom: 8px; }
.receipt-header h2 { font-size: 16px; font-weight: 700; letter-spacing: 1px; margin-bottom: 2px; }
.receipt-branch { font-size: 13px; font-weight: 700; margin-bottom: 2px; }
.receipt-header p { font-size: 11px; color: #555; }
.receipt-meta { font-size: 11px; line-height: 1.6; }
.receipt-divider { border: none; border-top: 1px dashed #000; margin: 6px 0; }
.receipt-items-header { display: flex; justify-content: space-between; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #555; margin-bottom: 2px; }
.receipt-item { display: flex; justify-content: space-between; font-size: 11px; margin: 3px 0; }
.receipt-totals { margin-top: 4px; }
.receipt-total-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; }
.receipt-total-row.final { font-weight: 700; font-size: 14px; border-top: 1px dashed #000; padding-top: 6px; margin-top: 4px; }
.receipt-footer { text-align: center; margin-top: 10px; font-size: 10px; color: #555; }
.receipt-footer p { margin: 2px 0; }
@media print { @page { size: 80mm auto; margin: 0; } body { width: 72mm; padding: 4mm; } }
</style></head><body>`)
    win.document.write(el.innerHTML)
    win.document.write('</body></html>')
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  return (
    <>
    {!branchId && (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <AlertTriangle size={40} color="var(--warning)" style={{ marginBottom: 16 }} />
        <h3 style={{ marginBottom: 8 }}>{user?.role === 'ADMIN' ? 'Select a branch' : 'No Branch Assigned'}</h3>
        <p style={{ color: 'var(--text-muted)' }}>
          {user?.role === 'ADMIN'
            ? 'Use the branch selector in the top bar to choose where this sale will be recorded, then add items to the cart.'
            : 'Your account is not assigned to a branch. Please contact an administrator.'}
        </p>
      </div>
    )}
    {branchId && (
    <div className="pos-layout">
      {/* ── Products Panel ── */}
      <div className="pos-products">
        {/* Search */}
        <div className="search-bar">
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={15}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', pointerEvents: 'none' }}
            />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleScannerInput}
              placeholder="Scan barcode or search product…"
              autoFocus
              style={{ paddingLeft: 36 }}
            />
          </div>
        </div>

        {/* Category filters */}
        <div className="category-filter">
          {categories.map(cat => (
            <button
              key={cat}
              className={'filter-btn' + (category === cat ? ' active' : '')}
              onClick={() => setCategory(cat)}
            >
              {cat === 'all' ? 'All Categories' : cat}
            </button>
          ))}
        </div>

        {/* Product grid */}
        <div className="product-grid">
          {products.map(p => {
            const stock = stockForProduct(p)
            return (
              <div
                key={p.id}
                className={'product-card' + (stock === 0 ? ' out-of-stock' : '')}
                onClick={() => stock > 0 && addToCart(p)}
              >
                <div className="product-name">{p.name}</div>
                <div className="product-price">{fmt(p.price)}</div>
                <div className="product-stock">
                  {stock === 0 ? 'Out of stock' : `${stock} in stock`}
                </div>
                {p.barcode && (
                  <button
                    className="btn btn-sm"
                    style={{ marginTop: 4, fontSize: 10, padding: '2px 6px', opacity: 0.6 }}
                    onClick={e => { e.stopPropagation(); setBarcodePreview(p) }}
                    title="View barcode"
                  >
                    <Barcode size={11} strokeWidth={2} />
                  </button>
                )}
              </div>
            )
          })}
          {products.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-light)', paddingTop: 40, fontSize: 13 }}>
              No products match your search
            </div>
          )}
        </div>
      </div>

      {/* ── Cart Panel ── */}
      <div className="pos-cart">
        <div className="cart-header">
          <h3>Current Sale</h3>
          <div className="customer-select">
            <select value={customerId} onChange={e => setCustomerId(e.target.value)}>
              <option value="">Walk-in Customer</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.phone ? ` · ${c.phone}` : ''}
                </option>
              ))}
            </select>
            <button
              className="btn btn-sm btn-outline"
              onClick={() => setCustomerOpen(true)}
              title="Register new customer"
            >
              <UserPlus size={13} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Cart items */}
        <div className="cart-items">
          {cart.length === 0
            ? (
              <div className="cart-empty">
                <ShoppingCart size={32} color="var(--border2)" strokeWidth={1.5} />
                <p>No items in cart</p>
              </div>
            )
            : cart.map(item => (
              <div key={item.productId} className="cart-item">
                <div className="cart-item-name">{item.name}</div>
                <div className="cart-item-controls">
                  <button className="qty-btn" onClick={() => updateQty(item.productId, -1)}>−</button>
                  <span className="cart-item-qty">{item.quantity}</span>
                  <button className="qty-btn" onClick={() => updateQty(item.productId, 1)}>+</button>
                </div>
                <div className="cart-item-price">{fmt(item.subtotal)}</div>
                <button className="cart-item-remove" onClick={() => removeItem(item.productId)}>
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>
            ))
          }
        </div>

        {/* Totals */}
        <div className="cart-totals">
          <div className="total-row">
            <span>Subtotal</span>
            <span>{fmt(subtotal)}</span>
          </div>
          <div className="total-row">
            <span>Discount ({currency.symbol})</span>
            <div className="discount-input">
              <input
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={e => setDiscount(e.target.value)}
              />
            </div>
          </div>
          <div className="total-row">
            <span>Tax ({currency.symbol})</span>
            <div className="discount-input">
              <input
                type="number"
                min="0"
                step="0.01"
                value={taxInput}
                onChange={e => setTaxInput(e.target.value)}
              />
            </div>
          </div>
          <div className="total-row">
            <span>Shipping ({currency.symbol})</span>
            <div className="discount-input">
              <input
                type="number"
                min="0"
                step="0.01"
                value={shippingInput}
                onChange={e => setShippingInput(e.target.value)}
              />
            </div>
          </div>
          <div className="total-row grand-total">
            <span>Total</span>
            <span>{fmt(grandTotal)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="cart-actions">
          <button
            className="btn btn-outline btn-full"
            onClick={clearCart}
            disabled={cart.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Trash2 size={13} strokeWidth={2} /> Clear
          </button>
          <button
            className="btn btn-success btn-full"
            onClick={openCheckout}
            disabled={cart.length === 0}
            style={{ fontWeight: 700 }}
          >
            Checkout
          </button>
        </div>
      </div>

      {/* ── Checkout Modal ── */}
      {checkoutOpen && (
        <Modal
          title="Complete Payment"
          onClose={() => setCheckoutOpen(false)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setCheckoutOpen(false)} disabled={processing}>Cancel</button>
              <button
                className="btn btn-success"
                onClick={processPayment}
                disabled={processing}
                style={{ fontWeight: 700, minWidth: 160, display: 'flex', alignItems: 'center', gap: 7 }}
              >
                {processing
                  ? <><span className="spin" style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%' }} /> Processing…</>
                  : 'Confirm Payment'
                }
              </button>
            </>
          }
        >
          <div className="payment-summary">
            Total Amount: <strong>{fmt(grandTotal)}</strong>
          </div>

          <div className="form-group" style={{ marginTop: 16 }}>
            <label>Payment Method</label>
            <div className="payment-methods">
              {PAY_METHODS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  className={'payment-btn' + (payMethod === key ? ' active' : '')}
                  onClick={() => setPayMethod(key)}
                  disabled={processing}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
                >
                  <Icon size={18} strokeWidth={1.8} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {payMethod === 'CASH' && (
            <div className="form-group">
              <label>Amount Tendered</label>
              <input
                type="number"
                step="0.01"
                value={amountPaid}
                onChange={e => setAmountPaid(e.target.value)}
                placeholder="0.00"
                disabled={processing}
                autoFocus
              />
              {Number(amountPaid) > 0 && (
                <div
                  className="change-display"
                  style={{
                    background: change < 0 ? 'var(--danger-light)' : 'var(--success-light)',
                    color: change < 0 ? 'var(--danger)' : 'var(--success)',
                    marginTop: 8,
                  }}
                >
                  Change: <strong>{fmt(Math.max(0, change))}</strong>
                </div>
              )}
            </div>
          )}

          {payMethod !== 'CASH' && (
            <div className="form-group">
              <label>Reference / Transaction ID</label>
              <input
                value={payRef}
                onChange={e => setPayRef(e.target.value)}
                placeholder="Enter reference number"
              />
            </div>
          )}

          {checkoutError && <div className="error-message">{checkoutError}</div>}
        </Modal>
      )}

      {/* ── Receipt Modal ── */}
      {receiptOpen && lastSale && (
        <Modal
          title="Receipt"
          onClose={() => setReceiptOpen(false)}
          footer={
            <>
              <button
                className="btn btn-outline"
                onClick={() => printReceipt()}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Printer size={14} strokeWidth={2} /> Print
              </button>
              <button className="btn btn-primary" onClick={() => setReceiptOpen(false)}>
                New Sale
              </button>
            </>
          }
        >
          <div className="receipt" id="receipt-print">
            <div className="receipt-header">
              <h2>{STORE_NAME}</h2>
              {lastSale.branch?.name && <p className="receipt-branch">{lastSale.branch.name}</p>}
              <p>Sales Receipt</p>
            </div>
            <hr className="receipt-divider" />
            <div className="receipt-meta">
              <div><strong>Receipt #:</strong> {lastSale.id}</div>
              <div><strong>Date:</strong> {new Date(lastSale.createdAt).toLocaleString()}</div>
              <div><strong>Cashier:</strong> {lastSale.user.fullName}</div>
              {lastSale.customer && <div><strong>Customer:</strong> {lastSale.customer.name}</div>}
            </div>
            <hr className="receipt-divider" />
            <div className="receipt-items-header">
              <span>Item</span>
              <span>Amt</span>
            </div>
            {lastSale.saleItems.map(i => (
              <div key={i.id} className="receipt-item">
                <span>{i.product.name} x{i.quantity} @ {fmt(i.unitPrice)}</span>
                <span>{fmt(i.subtotal)}</span>
              </div>
            ))}
            <hr className="receipt-divider" />
            <div className="receipt-totals">
              <div className="receipt-total-row"><span>Subtotal</span><span>{fmt(lastSale.totalAmount)}</span></div>
              {lastSale.discount > 0 && <div className="receipt-total-row"><span>Discount</span><span>-{fmt(lastSale.discount)}</span></div>}
              {lastSale.tax > 0 && <div className="receipt-total-row"><span>Tax</span><span>{fmt(lastSale.tax)}</span></div>}
              {lastSale.shipping > 0 && <div className="receipt-total-row"><span>Shipping</span><span>{fmt(lastSale.shipping)}</span></div>}
              <div className="receipt-total-row final"><span>TOTAL</span><span>{fmt(lastSale.grandTotal)}</span></div>
              <div className="receipt-total-row"><span>Payment</span><span>{lastSale.payment.method.replace('_', ' ')}</span></div>
              {lastSale.payment.amountPaid > 0 && <div className="receipt-total-row"><span>Paid</span><span>{fmt(lastSale.payment.amountPaid)}</span></div>}
              {lastSale.payment.change > 0 && <div className="receipt-total-row"><span>Change</span><span>{fmt(lastSale.payment.change)}</span></div>}
            </div>
            <hr className="receipt-divider" />
            <div className="receipt-footer">
              <p>Thank you for your purchase!</p>
              <p>{STORE_NAME}{lastSale.branch?.name ? ` — ${lastSale.branch.name}` : ''}</p>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Register Customer Modal ── */}
      {customerOpen && (
        <Modal
          title="Register Customer"
          onClose={() => setCustomerOpen(false)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setCustomerOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={registerCustomer}>Register</button>
            </>
          }
        >
          <div className="form-group">
            <label>Full Name *</label>
            <input value={newCust.name} onChange={e => setNewCust(f => ({ ...f, name: e.target.value }))} placeholder="Customer name" autoFocus />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input value={newCust.phone} onChange={e => setNewCust(f => ({ ...f, phone: e.target.value }))} placeholder="+1 234 567 8900" />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={newCust.email} onChange={e => setNewCust(f => ({ ...f, email: e.target.value }))} placeholder="customer@email.com" />
          </div>
        </Modal>
      )}
      {/* ── Barcode Preview Modal ── */}
      {barcodePreview && (
        <Modal
          title={barcodePreview.name}
          onClose={() => setBarcodePreview(null)}
          footer={<button className="btn btn-primary" onClick={() => setBarcodePreview(null)}>Close</button>}
        >
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: 8 }}>
            UPC-A: <strong style={{ fontFamily: 'monospace' }}>{barcodePreview.barcode}</strong>
          </p>
          <BarcodeDisplay value={barcodePreview.barcode} />
        </Modal>
      )}
    </div>
    )}
    </>
  )
}
