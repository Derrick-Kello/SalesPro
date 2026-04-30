import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useBranch } from '../../context/BranchContext'
import { useCurrency } from '../../context/CurrencyContext'
import { useAlert } from '../../context/AlertContext'
import Modal from '../Modal'
import BarcodeDisplay from '../BarcodeDisplay'
import { Search, ShoppingCart, UserPlus, Trash2, Banknote, CreditCard, Smartphone, Printer, X, Barcode, AlertTriangle, Wallet } from 'lucide-react'
import QRCode from 'react-qr-code'
import { productDisplayName } from '../../utils/productDisplay'

const STORE_NAME = 'SalesPro'

/** Must match backend `paystack.SUPPORTED` for a sane cashier experience */
const PAYSTACK_CURRENCIES = new Set(['NGN', 'GHS', 'ZAR', 'USD', 'KES', 'XOF', 'EUR', 'GBP'])

const PAY_METHODS = [
  { key: 'CASH',         label: 'Cash',         icon: Banknote },
  { key: 'MOBILE_MONEY', label: 'Mobile Money',  icon: Smartphone },
  { key: 'CARD',         label: 'Card',          icon: CreditCard },
  { key: 'PAYSTACK',     label: 'Paystack',      icon: Wallet },
]

function countedTagsOnProduct(p) {
  return (p.tags || []).filter(
    (t) => t.quantity != null && Number.isFinite(Number(t.quantity)),
  )
}

function usesCountedTags(p) {
  return countedTagsOnProduct(p).length > 0
}

/** Tags the cashier must choose among at sale time (tracked qty tags, or all tags if label-only). */
function sellableTagsForSale(p) {
  const tags = (p.tags || []).filter(Boolean)
  if (!tags.length) return []
  if (usesCountedTags(p)) return countedTagsOnProduct(p)
  return [...tags].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), undefined, {
      sensitivity: 'base',
    }),
  )
}

function tagStockCount(p, tagId) {
  if (!tagId) return 0
  const row = p.tags?.find((t) => String(t.id) === String(tagId))
  if (!row || row.quantity == null || !Number.isFinite(Number(row.quantity))) return 0
  return Number(row.quantity)
}

function lineAvailableQty(p, branchStock, tagId) {
  if (!usesCountedTags(p)) return branchStock
  const tid = tagId != null && tagId !== '' ? String(tagId) : ''
  if (!tid) return 0
  return Math.min(branchStock, tagStockCount(p, tid))
}

export default function Register() {
  const { user } = useAuth()
  const { showError } = useAlert()
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
  const [checkoutMode, setCheckoutMode] = useState('full') // 'full' | 'partial'
  const [partialAmount, setPartialAmount] = useState('')
  const [partialCashTender, setPartialCashTender] = useState('')
  const [amountPaid, setAmountPaid]     = useState('')
  const [payRef, setPayRef]             = useState('')
  const [checkoutError, setCheckoutError] = useState('')
  const [newCust, setNewCust]           = useState({ name: '', phone: '', email: '' })
  const [barcodePreview, setBarcodePreview] = useState(null)
  const [processing, setProcessing]     = useState(false)
  const [paystackEnabled, setPaystackEnabled] = useState(false)
  /** After initialize: customer scans QR → pays on phone; we poll until success */
  const [paystackQrSession, setPaystackQrSession] = useState(null)
  const scanTimerRef = useRef(null)
  const lastKeyTime  = useRef(0)
  const submittingRef = useRef(false) // hard guard against double-submit

  const [allTags, setAllTags] = useState([])
  const [posTagFilterId, setPosTagFilterId] = useState('')
  const [pendingTagPick, setPendingTagPick] = useState(null)

  const catalog = Array.isArray(allProducts) ? allProducts : []

  function resolveSellTagId(product, explicit) {
    const pool = sellableTagsForSale(product)
    if (!pool.length) return ''

    const exp = explicit != null && explicit !== '' ? String(explicit) : ''
    if (exp && pool.some((t) => String(t.id) === exp)) return exp
    if (
      posTagFilterId &&
      pool.some((t) => String(t.id) === String(posTagFilterId))
    ) {
      return String(posTagFilterId)
    }
    if (pool.length === 1) return String(pool[0].id)
    return null
  }

  const loadProducts = useCallback(async () => {
    try {
      const params = branchId ? `?branchId=${branchId}` : ''
      const raw = await api.get(`/products${params}`)
      setAllProducts(Array.isArray(raw) ? raw : [])
    } catch (err) { console.error(err.message) }
  }, [branchId])

  function stockForProduct(p) {
    if (branchId) {
      if (p.branchInventory?.length) return p.branchInventory[0].quantity
      return 0
    }
    return p.inventory ? p.inventory.quantity : 0
  }

  const loadCustomers = useCallback(async () => {
    try {
      const raw = await api.get('/customers')
      setCustomers(Array.isArray(raw) ? raw : [])
    } catch (err) { console.error(err.message) }
  }, [])

  const clearCart = useCallback(() => {
    setCart([])
    setDiscount(0)
    setTaxInput(0)
    setShippingInput(0)
    setCustomerId('')
  }, [])

  useEffect(() => { loadProducts(); loadCustomers() }, [loadProducts, loadCustomers])

  useEffect(() => {
    api.get('/payments/paystack/status')
      .then((r) => setPaystackEnabled(Boolean(r.enabled)))
      .catch(() => setPaystackEnabled(false))
  }, [])

  useEffect(() => {
    api
      .get('/tags')
      .then((r) => setAllTags(Array.isArray(r) ? r : []))
      .catch(() => setAllTags([]))
  }, [])

  const showPaystack = paystackEnabled && PAYSTACK_CURRENCIES.has(currency.code)
  const payMethodChoices = PAY_METHODS.filter((m) => m.key !== 'PAYSTACK' || showPaystack)
  const selectedCustomer = customers.find((c) => String(c.id) === String(customerId))
  const selectedCustomerHasEmail = Boolean(selectedCustomer?.email?.trim())

  useEffect(() => {
    if (payMethod === 'PAYSTACK' && !showPaystack) setPayMethod('CASH')
  }, [payMethod, showPaystack])

  useEffect(() => {
    if (payMethod === 'PAYSTACK' && checkoutMode === 'partial') setCheckoutMode('full')
  }, [payMethod, checkoutMode])

  useEffect(() => {
    if (!paystackQrSession) return
    const session = paystackQrSession
    let cancelled = false
    let iv

    async function pollOnce() {
      if (cancelled || submittingRef.current) return
      try {
        const q = new URLSearchParams({
          reference: session.reference,
          amount: String(session.grandTotal),
          currency: session.currencyCode,
        })
        const { paid } = await api.get(`/payments/paystack/poll?${q}`)
        if (!paid || cancelled) return
        clearInterval(iv)
        if (submittingRef.current) return
        submittingRef.current = true
        try {
          const sale = await api.post('/sales', {
            customerId: session.customerId,
            items: session.items,
            discount: session.discount,
            tax: session.tax,
            shipping: session.shipping,
            paymentMethod: 'PAYSTACK',
            amountPaid: session.grandTotal,
            paymentReference: session.reference,
            currency: session.currencyCode,
            ...(session.branchId ? { branchId: session.branchId } : {}),
          })
          if (cancelled) return
          setCheckoutError('')
          setLastSale(sale)
          setPaystackQrSession(null)
          setCheckoutOpen(false)
          setReceiptOpen(true)
          clearCart()
          loadProducts()
        } catch (err) {
          if (!cancelled) setCheckoutError(err.message)
        } finally {
          submittingRef.current = false
        }
      } catch (_) { /* network / poll error — retry */ }
    }

    pollOnce()
    iv = setInterval(pollOnce, 2500)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [paystackQrSession, clearCart, loadProducts])

  useEffect(() => {
    let filtered = catalog
    if (category !== 'all') filtered = filtered.filter((p) => p.category === category)
    if (posTagFilterId) {
      filtered = filtered.filter(
        (p) =>
          Array.isArray(p.tags) &&
          p.tags.some((t) => String(t.id) === String(posTagFilterId)),
      )
    }
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(
        (p) =>
          productDisplayName(p).toLowerCase().includes(q) ||
          (p.barcode && p.barcode.includes(search)) ||
          (Array.isArray(p.tags) &&
            p.tags.some(
              (t) => t.name && String(t.name).toLowerCase().includes(q),
            )),
      )
    }
    setProducts(filtered)
  }, [category, search, catalog, posTagFilterId])

  const categories = ['all', ...[...new Set(catalog.map(p => p.category))].sort()]

  async function handleBarcodeEnter(e) {
    if (e.key !== 'Enter' || !search.trim()) return
    try {
      const raw = await api.get('/products/barcode/' + encodeURIComponent(search.trim()))
      const product = catalog.find((p) => p.id === raw.id)
      if (!product) return
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
          const product = catalog.find((p) => p.id === raw.id)
          if (!product) return
          addToCart(product)
          setSearch('')
        } catch (_) {}
      }, 100)
    }
  }

  function lineMatches(a, productId, tagId) {
    const tb = tagId != null && tagId !== '' ? Number(tagId) : null
    const ta = a.tagId != null && a.tagId !== '' ? Number(a.tagId) : null
    return a.productId === productId && ta === tb
  }

  function tagLabelFromLine(productTags, tagId) {
    if (tagId == null || tagId === '') return ''
    const row = (productTags || []).find((t) => String(t.id) === String(tagId))
    return row ? row.name : ''
  }

  function addToCart(product, explicitTagId) {
    const stock = stockForProduct(product)
    const resolved = resolveSellTagId(product, explicitTagId)
    if (resolved === null) {
      setPendingTagPick(product)
      return
    }
    const tagIdNum =
      resolved === '' || resolved == null ? null : parseInt(resolved, 10)
    const avail = lineAvailableQty(product, stock, tagIdNum)

    setCart((prev) => {
      const existing = prev.find((i) => lineMatches(i, product.id, tagIdNum))
      const currentQty = existing ? existing.quantity : 0
      if (currentQty >= avail) {
        showError(
          'Only ' +
            avail +
            ' units available for ' +
            productDisplayName(product) +
            (tagIdNum != null && tagLabelFromLine(product.tags, tagIdNum)
              ? ' · ' + tagLabelFromLine(product.tags, tagIdNum)
              : ''),
        )
        return prev
      }
      const tagLabel = tagIdNum != null ? tagLabelFromLine(product.tags, tagIdNum) : ''
      if (existing) {
        return prev.map((i) =>
          lineMatches(i, product.id, tagIdNum)
            ? {
                ...i,
                quantity: i.quantity + 1,
                subtotal: (i.quantity + 1) * i.unitPrice,
              }
            : i,
        )
      }
      return [
        ...prev,
        {
          productId: product.id,
          tagId: tagIdNum,
          tagLabel,
          productTags: product.tags || [],
          name: productDisplayName(product),
          unitPrice: product.price,
          quantity: 1,
          subtotal: product.price,
        },
      ]
    })
  }

  function updateQty(productId, tagId, delta) {
    setCart((prev) => {
      const p = catalog.find((x) => x.id === productId)
      const stock = p ? stockForProduct(p) : 0
      const tagIdNum = tagId != null && tagId !== '' ? Number(tagId) : null
      const avail = p ? lineAvailableQty(p, stock, tagIdNum) : 0
      return prev
        .map((i) => {
          if (!lineMatches(i, productId, tagId)) return i
          const nextQ = i.quantity + delta
          if (nextQ > avail) {
            showError('Cannot exceed ' + avail + ' units for this line')
            return i
          }
          return {
            ...i,
            quantity: nextQ,
            subtotal: nextQ * i.unitPrice,
          }
        })
        .filter((i) => i.quantity > 0)
    })
  }

  function removeItem(productId, tagId) {
    setCart((prev) => prev.filter((i) => !lineMatches(i, productId, tagId)))
  }

  function saleItemsPayload() {
    return cart.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      ...(i.tagId != null && Number.isFinite(Number(i.tagId)) ? { tagId: i.tagId } : {}),
    }))
  }

  const subtotal   = cart.reduce((s, i) => s + i.subtotal, 0)
  const tax        = Number(taxInput) || 0
  const shippingAmt = Number(shippingInput) || 0
  const grandTotal = Math.max(0, subtotal - Number(discount)) + tax + shippingAmt
  const inst = Number(partialAmount) || 0
  const tenderForPartialCash = partialCashTender === '' ? inst : Number(partialCashTender)
  const changeFull = Number(amountPaid) - grandTotal
  const changePartial = checkoutMode === 'partial' && payMethod === 'CASH'
    ? tenderForPartialCash - inst
    : 0

  function openCheckout() {
    if (!cart.length) { showError('Cart is empty'); return }
    setPayMethod('CASH'); setAmountPaid(''); setPayRef(''); setCheckoutError('')
    setCheckoutMode('full')
    setPartialAmount('')
    setPartialCashTender('')
    setPaystackQrSession(null)
    setCheckoutOpen(true)
  }

  async function processPayment() {
    if (submittingRef.current) return   // block any concurrent call
    submittingRef.current = true
    setProcessing(true)
    setCheckoutError('')
    if (checkoutMode === 'full') {
      if (payMethod === 'CASH' && Number(amountPaid) < grandTotal - 1e-6) {
        setCheckoutError('Amount tendered is less than the total')
        setProcessing(false)
        submittingRef.current = false
        return
      }
    } else {
      if (grandTotal <= 0.01) {
        setCheckoutError('Sale total must be greater than zero for partial payment')
        setProcessing(false)
        submittingRef.current = false
        return
      }
      if (!(inst > 0) || inst > grandTotal - 1e-6) {
        setCheckoutError('Enter an amount collected now that is greater than zero and less than the total')
        setProcessing(false)
        submittingRef.current = false
        return
      }
      if (payMethod === 'PAYSTACK') {
        setCheckoutError('Use full payment or another method for checkout')
        setProcessing(false)
        submittingRef.current = false
        return
      }
      if (payMethod === 'CASH' && tenderForPartialCash + 1e-6 < inst) {
        setCheckoutError('Cash received cannot be less than the amount applying to this sale')
        setProcessing(false)
        submittingRef.current = false
        return
      }
    }
    try {
      const bodyFull = checkoutMode === 'full'
      const sale = await api.post('/sales', {
        customerId: customerId || null,
        items: saleItemsPayload(),
        discount: Number(discount),
        tax,
        shipping: shippingAmt,
        paymentMethod: payMethod,
        partialPayment: !bodyFull,
        amountPaid: bodyFull ? (payMethod === 'CASH' ? Number(amountPaid) : grandTotal) : inst,
        cashTendered: (!bodyFull && payMethod === 'CASH')
          ? (partialCashTender === '' ? inst : tenderForPartialCash)
          : undefined,
        paymentReference: payRef || null,
        currency: currency.code,
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

  async function startPaystackCheckout() {
    if (submittingRef.current) return
    submittingRef.current = true
    setProcessing(true)
    setCheckoutError('')
    try {
      const init = await api.post('/payments/paystack/initialize', {
        amount: grandTotal,
        email: selectedCustomer?.email || undefined,
        currency: currency.code,
      })
      const url = init.authorizationUrl
      if (!url) {
        setCheckoutError('Paystack did not return a checkout link')
        return
      }
      setPaystackQrSession({
        authorizationUrl: url,
        reference: init.reference,
        grandTotal,
        currencyCode: currency.code,
        items: saleItemsPayload(),
        discount: Number(discount),
        tax,
        shipping: shippingAmt,
        customerId: customerId || null,
        branchId: user?.role === 'ADMIN' && branchId ? branchId : undefined,
      })
    } catch (err) {
      setCheckoutError(err.message)
    } finally {
      setProcessing(false)
      submittingRef.current = false
    }
  }

  function confirmCheckout() {
    if (payMethod === 'PAYSTACK') startPaystackCheckout()
    else processPayment()
  }

  async function registerCustomer() {
    if (!newCust.name.trim()) { showError('Name is required'); return }
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
    } catch (err) { showError(err.message) }
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
          {categories.map((cat) => (
            <button
              key={cat}
              className={'filter-btn' + (category === cat ? ' active' : '')}
              onClick={() => setCategory(cat)}
            >
              {cat === 'all' ? 'All Categories' : cat}
            </button>
          ))}
        </div>

        <div className="category-filter" style={{ marginTop: 6 }}>
          <span
            style={{
              alignSelf: 'center',
              fontSize: 12,
              color: 'var(--text-muted)',
              marginRight: 4,
              whiteSpace: 'nowrap',
            }}
          >
            Tag:
          </span>
          <button
            type="button"
            className={'filter-btn' + (!posTagFilterId ? ' active' : '')}
            onClick={() => setPosTagFilterId('')}
          >
            All tags
          </button>
          {allTags.map((t) => (
            <button
              key={t.id}
              type="button"
              className={'filter-btn' + (String(posTagFilterId) === String(t.id) ? ' active' : '')}
              onClick={() => setPosTagFilterId(String(t.id))}
            >
              {t.name}
            </button>
          ))}
        </div>

        {/* Product grid */}
        <div className="product-grid">
          {products.map((p) => {
            const stock = stockForProduct(p)
            const pool = sellableTagsForSale(p)
            const sellPick = resolveSellTagId(p)
            const tagNum =
              sellPick === '' || sellPick == null ? null : parseInt(sellPick, 10)
            const ambiguous =
              pool.length > 1 &&
              sellPick === null &&
              !posTagFilterId
            const avail = ambiguous ? stock : lineAvailableQty(p, stock, tagNum)
            const canAdd = stock > 0 && avail > 0
            return (
              <div
                key={p.id}
                className={'product-card' + (stock === 0 || !canAdd ? ' out-of-stock' : '')}
                onClick={() => canAdd && addToCart(p)}
              >
                <div className="product-name">{productDisplayName(p)}</div>
                <div className="product-price">{fmt(p.price)}</div>
                <div className="product-stock">
                  {stock === 0
                    ? 'Out of stock'
                    : ambiguous
                      ? `${stock} in stock · tap to pick type`
                      : usesCountedTags(p)
                        ? `${avail} available`
                        : `${stock} in stock`}
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
            : cart.map((item) => (
              <div
                key={`${item.productId}-${item.tagId ?? 'x'}`}
                className="cart-item"
              >
                <div className="cart-item-name">
                  {item.name}
                  {item.tagLabel ? (
                    <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                      {' '}
                      · {item.tagLabel}
                    </span>
                  ) : null}
                </div>
                <div className="cart-item-controls">
                  <button
                    className="qty-btn"
                    onClick={() => updateQty(item.productId, item.tagId, -1)}
                  >
                    −
                  </button>
                  <span className="cart-item-qty">{item.quantity}</span>
                  <button
                    className="qty-btn"
                    onClick={() => updateQty(item.productId, item.tagId, 1)}
                  >
                    +
                  </button>
                </div>
                <div className="cart-item-price">{fmt(item.subtotal)}</div>
                <button
                  className="cart-item-remove"
                  onClick={() => removeItem(item.productId, item.tagId)}
                >
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
          title={paystackQrSession ? 'Scan to pay' : 'Complete Payment'}
          onClose={() => { setPaystackQrSession(null); setCheckoutOpen(false) }}
          footer={
            paystackQrSession ? (
              <button
                className="btn btn-outline"
                onClick={() => setPaystackQrSession(null)}
              >
                Back
              </button>
            ) : (
              <>
                <button className="btn btn-outline" onClick={() => setCheckoutOpen(false)} disabled={processing}>Cancel</button>
                <button
                  className="btn btn-success"
                  onClick={confirmCheckout}
                  disabled={processing}
                  style={{ fontWeight: 700, minWidth: 160, display: 'flex', alignItems: 'center', gap: 7 }}
                >
                  {processing
                    ? <><span className="spin" style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%' }} /> Processing…</>
                    : payMethod === 'PAYSTACK' ? 'Show Paystack QR' : 'Confirm Payment'
                  }
                </button>
              </>
            )
          }
        >
          {paystackQrSession ? (
            <div style={{ textAlign: 'center' }}>
              <p className="payment-summary" style={{ marginBottom: 12 }}>
                Total <strong>{fmt(paystackQrSession.grandTotal)}</strong>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 6, fontWeight: 400 }}>
                  Ask the customer to scan with their phone camera. They complete payment in the browser; this screen updates automatically.
                </span>
              </p>
              <div
                style={{
                  display: 'inline-block',
                  padding: 16,
                  background: '#fff',
                  borderRadius: 12,
                  boxShadow: '0 1px 8px rgba(0,0,0,0.08)',
                }}
              >
                <QRCode
                  value={paystackQrSession.authorizationUrl}
                  size={220}
                  style={{ height: 'auto', maxWidth: '100%', width: '100%' }}
                  viewBox="0 0 256 256"
                />
              </div>
              <p style={{ marginTop: 14, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                Ref: {paystackQrSession.reference}
              </p>
              <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                <span className="spin" style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid var(--border2)', borderTopColor: 'var(--primary)', borderRadius: '50%', verticalAlign: 'middle', marginRight: 8 }} />
                Waiting for payment…
              </p>
              {checkoutError && <div className="error-message" style={{ marginTop: 16, textAlign: 'left' }}>{checkoutError}</div>}
            </div>
          ) : (
            <>
          <div className="payment-summary">
            Total Amount: <strong>{fmt(grandTotal)}</strong>
          </div>

          <div className="form-group" style={{ marginTop: 16 }}>
            <label>Payment Method</label>
            <div className="payment-methods">
              {payMethodChoices.map(({ key, label, icon: Icon }) => (
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

          <div className="form-group" style={{ marginTop: 12 }}>
            <label>Checkout</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 20px', marginTop: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="radio"
                  name="checkout-mode"
                  checked={checkoutMode === 'full'}
                  disabled={processing}
                  onChange={() => setCheckoutMode('full')}
                />
                Full payment
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="radio"
                  name="checkout-mode"
                  checked={checkoutMode === 'partial'}
                  disabled={processing || payMethod === 'PAYSTACK'}
                  onChange={() => setCheckoutMode('partial')}
                />
                Partial payment (deposit)
              </label>
            </div>
            {payMethod === 'PAYSTACK' && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Paystack always settles the full invoice amount.</p>
            )}
          </div>

          {checkoutMode === 'partial' && (
            <div className="form-group">
              <label>Amount collecting now ({currency.symbol}) — applied to this sale</label>
              <input
                type="number"
                step="0.01"
                min={0.01}
                max={grandTotal > 0 ? grandTotal : undefined}
                value={partialAmount}
                onChange={e => setPartialAmount(e.target.value)}
                placeholder="0.00"
                disabled={processing}
              />
              {grandTotal > 0 && inst > 0 && inst <= grandTotal && (
                <p style={{ fontSize: 12, marginTop: 6, color: 'var(--text-muted)' }}>
                  Will remain due: <strong>{fmt(Math.max(0, grandTotal - inst))}</strong>
                </p>
              )}
            </div>
          )}

          {payMethod === 'CASH' && checkoutMode === 'full' && (
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
                    background: changeFull < 0 ? 'var(--danger-light)' : 'var(--success-light)',
                    color: changeFull < 0 ? 'var(--danger)' : 'var(--success)',
                    marginTop: 8,
                  }}
                >
                  Change: <strong>{fmt(Math.max(0, changeFull))}</strong>
                </div>
              )}
            </div>
          )}

          {payMethod === 'CASH' && checkoutMode === 'partial' && (
            <div className="form-group">
              <label>Cash received from customer (if more than collecting now, change is calculated)</label>
              <input
                type="number"
                step="0.01"
                value={partialCashTender}
                onChange={e => setPartialCashTender(e.target.value)}
                placeholder={String(inst || 'Same as collecting amount')}
                disabled={processing}
              />
              {inst > 0 && tenderForPartialCash + 1e-6 >= inst && (
                <div
                  className="change-display"
                  style={{
                    background: changePartial >= 0 ? 'var(--success-light)' : 'var(--danger-light)',
                    color: changePartial >= 0 ? 'var(--success)' : 'var(--danger)',
                    marginTop: 8,
                  }}
                >
                  Change: <strong>{fmt(Math.max(0, changePartial))}</strong>
                </div>
              )}
            </div>
          )}

          {payMethod !== 'CASH' && payMethod !== 'PAYSTACK' && (
            <div className="form-group">
              <label>Reference / Transaction ID</label>
              <input
                value={payRef}
                onChange={e => setPayRef(e.target.value)}
                placeholder="Enter reference number"
              />
            </div>
          )}

          {payMethod === 'PAYSTACK' && (
            <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Shows a QR code the customer scans to open Paystack on their phone (card, bank, USSD, mobile money where available).
              {!selectedCustomerHasEmail && (
                <span> Add a customer with an email for best results, or a placeholder email is used.</span>
              )}
            </p>
          )}

          {checkoutError && <div className="error-message">{checkoutError}</div>}
            </>
          )}
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
            {lastSale.saleItems.map((i) => (
              <div key={i.id} className="receipt-item">
                <span>
                  {i.product.name}
                  {i.tag?.name ? ` (${i.tag.name})` : ''} x{i.quantity} @ {fmt(i.unitPrice)}
                </span>
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
              <div className="receipt-total-row"><span>Payment</span><span>{(lastSale.payment?.method ?? '').replace(/_/g, ' ')}</span></div>
              {lastSale.payment && lastSale.payment.amountPaid > 0 && <div className="receipt-total-row"><span>Paid toward invoice</span><span>{fmt(lastSale.payment.amountPaid)}</span></div>}
              {lastSale.payment?.change > 0 && <div className="receipt-total-row"><span>Change</span><span>{fmt(lastSale.payment.change)}</span></div>}
              {lastSale.balanceDue > 0.009 && (
                <div className="receipt-total-row" style={{ borderTop: '1px dashed var(--border)', paddingTop: 6, marginTop: 6 }}>
                  <span>Balance remaining</span><span style={{ fontWeight: 800 }}>{fmt(lastSale.balanceDue)}</span>
                </div>
              )}
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
      {/* ── Pick type (tag) for this line — exactly what the customer is buying ── */}
      {pendingTagPick && (
        <Modal
          title="Choose type"
          onClose={() => setPendingTagPick(null)}
          footer={
            <button type="button" className="btn btn-outline" onClick={() => setPendingTagPick(null)}>
              Cancel
            </button>
          }
        >
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 12 }}>
            Select which tag applies to this sale (the variant the customer is buying) —{' '}
            <strong>{productDisplayName(pendingTagPick)}</strong>.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sellableTagsForSale(pendingTagPick).map((t) => {
              const st = stockForProduct(pendingTagPick)
              const counted = usesCountedTags(pendingTagPick)
              const left = counted
                ? lineAvailableQty(pendingTagPick, st, Number(t.id))
                : st
              return (
                <button
                  key={t.id}
                  type="button"
                  className="btn btn-outline"
                  style={{ justifyContent: 'space-between', textAlign: 'left' }}
                  onClick={() => {
                    const p = pendingTagPick
                    setPendingTagPick(null)
                    addToCart(p, t.id)
                  }}
                >
                  <span>{t.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    {counted ? `${left} left` : `${st} at branch`}
                  </span>
                </button>
              )
            })}
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
