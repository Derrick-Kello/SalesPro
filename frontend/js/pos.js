// POS register logic - product search, cart management, and checkout.

var STORE_NAME = 'My Store';
var TAX_RATE = 0.10;
var D = '$'; // dollar sign kept as a variable so it survives file writes

var cart = [];
var allProducts = [];
var selectedPaymentMethod = 'CASH';
var currentSaleId = null;

async function initPOS() {
  await loadProducts();
  await loadCustomers();
}

async function loadProducts() {
  try {
    allProducts = await api.get('/products');
    renderProducts(allProducts);
    buildCategoryFilter(allProducts);
  } catch (err) {
    console.error('Could not load products:', err.message);
  }
}

async function loadCustomers() {
  try {
    var customers = await api.get('/customers');
    var select = document.getElementById('customerSelect');
    while (select.options.length > 1) select.remove(1);
    customers.forEach(function(c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name + (c.phone ? ' - ' + c.phone : '');
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Could not load customers:', err.message);
  }
}

function buildCategoryFilter(products) {
  var categories = [...new Set(products.map(function(p) { return p.category; }))].sort();
  var container = document.getElementById('categoryFilter');
  container.innerHTML = '<button class="filter-btn active" onclick="filterCategory(\'all\', this)">All</button>';
  categories.forEach(function(cat) {
    var btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.textContent = cat;
    btn.onclick = function() { filterCategory(cat, this); };
    container.appendChild(btn);
  });
}

function filterCategory(category, btn) {
  document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  if (category === 'all') renderProducts(allProducts);
  else renderProducts(allProducts.filter(function(p) { return p.category === category; }));
}

function renderProducts(products) {
  var grid = document.getElementById('productGrid');
  if (!products.length) {
    grid.innerHTML = '<p style="color:var(--text-muted);padding:20px">No products found</p>';
    return;
  }
  grid.innerHTML = products.map(function(p) {
    var stock = p.inventory ? p.inventory.quantity : 0;
    var outOfStock = stock === 0;
    var clickHandler = outOfStock ? '' : 'onclick="addToCart(' + p.id + ')"';
    return '<div class="product-card ' + (outOfStock ? 'out-of-stock' : '') + '" ' + clickHandler + '>' +
      '<div class="product-name">' + p.name + '</div>' +
      '<div class="product-price">' + D + p.price.toFixed(2) + '</div>' +
      '<div class="product-stock">Stock: ' + stock + '</div>' +
      '</div>';
  }).join('');
}

async function searchProducts() {
  var query = document.getElementById('barcodeInput').value.trim();
  if (!query) { renderProducts(allProducts); return; }

  try {
    var product = await api.get('/products/barcode/' + encodeURIComponent(query));
    addToCart(product.id);
    document.getElementById('barcodeInput').value = '';
    return;
  } catch (_) {}

  var filtered = allProducts.filter(function(p) {
    return p.name.toLowerCase().includes(query.toLowerCase()) ||
      (p.barcode && p.barcode.includes(query));
  });
  renderProducts(filtered);
}

document.getElementById('barcodeInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') searchProducts();
});

function addToCart(productId) {
  var product = allProducts.find(function(p) { return p.id === productId; });
  if (!product) return;

  var stock = product.inventory ? product.inventory.quantity : 0;
  var existing = cart.find(function(i) { return i.productId === productId; });
  var currentQty = existing ? existing.quantity : 0;

  if (currentQty >= stock) {
    alert('Only ' + stock + ' units available for ' + product.name);
    return;
  }

  if (existing) {
    existing.quantity += 1;
    existing.subtotal = existing.quantity * existing.unitPrice;
  } else {
    cart.push({ productId: productId, name: product.name, unitPrice: product.price, quantity: 1, subtotal: product.price });
  }
  renderCart();
}

function updateQty(productId, delta) {
  var item = cart.find(function(i) { return i.productId === productId; });
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) {
    cart = cart.filter(function(i) { return i.productId !== productId; });
  } else {
    item.subtotal = item.quantity * item.unitPrice;
  }
  renderCart();
}

function removeFromCart(productId) {
  cart = cart.filter(function(i) { return i.productId !== productId; });
  renderCart();
}

function clearCart() {
  cart = [];
  document.getElementById('discountInput').value = 0;
  renderCart();
}

function renderCart() {
  var container = document.getElementById('cartItems');
  if (!cart.length) {
    container.innerHTML = '<div class="cart-empty">No items in cart</div>';
  } else {
    container.innerHTML = cart.map(function(item) {
      return '<div class="cart-item">' +
        '<div class="cart-item-name">' + item.name + '</div>' +
        '<div class="cart-item-controls">' +
          '<button class="qty-btn" onclick="updateQty(' + item.productId + ', -1)">-</button>' +
          '<span class="cart-item-qty">' + item.quantity + '</span>' +
          '<button class="qty-btn" onclick="updateQty(' + item.productId + ', 1)">+</button>' +
        '</div>' +
        '<div class="cart-item-price">' + D + item.subtotal.toFixed(2) + '</div>' +
        '<button class="cart-item-remove" onclick="removeFromCart(' + item.productId + ')">&times;</button>' +
        '</div>';
    }).join('');
  }
  recalculate();
}

function recalculate() {
  var subtotal = cart.reduce(function(sum, i) { return sum + i.subtotal; }, 0);
  var discount = parseFloat(document.getElementById('discountInput').value) || 0;
  var taxable = Math.max(0, subtotal - discount);
  var tax = taxable * TAX_RATE;
  var grand = taxable + tax;

  document.getElementById('subtotal').textContent
 = D + subtotal.toFixed(2);
  document.getElementById('taxAmount').textContent = D + tax.toFixed(2);
  document.getElementById('grandTotal').textContent = D + grand.toFixed(2);
}

function openCheckout() {
  if (!cart.length) { alert('Cart is empty'); return; }
  var grand = parseFloat(document.getElementById('grandTotal').textContent.replace(D, ''));
  document.getElementById('checkoutTotal').textContent = D + grand.toFixed(2);
  document.getElementById('amountPaid').value = '';
  document.getElementById('paymentReference').value = '';
  document.getElementById('changeDisplay').classList.add('hidden');
  document.getElementById('checkoutError').classList.add('hidden');
  selectedPaymentMethod = 'CASH';
  document.querySelectorAll('.payment-btn').forEach(function(b) { b.classList.remove('active'); });
  document.querySelector('[data-method="CASH"]').classList.add('active');
  document.getElementById('amountPaidGroup').style.display = 'block';
  document.getElementById('referenceGroup').style.display = 'none';
  document.getElementById('checkoutModal').classList.remove('hidden');
}

function selectPayment(method, btn) {
  selectedPaymentMethod = method;
  document.querySelectorAll('.payment-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  document.getElementById('referenceGroup').style.display = method === 'CASH' ? 'none' : 'block';
  document.getElementById('amountPaidGroup').style.display = method === 'CASH' ? 'block' : 'none';
  document.getElementById('changeDisplay').classList.add('hidden');
}

function calculateChange() {
  var total = parseFloat(document.getElementById('checkoutTotal').textContent.replace(D, ''));
  var paid = parseFloat(document.getElementById('amountPaid').value) || 0;
  var change = paid - total;
  var changeEl = document.getElementById('changeDisplay');
  if (paid > 0) {
    document.getElementById('changeAmount').textContent = D + Math.max(0, change).toFixed(2);
    changeEl.classList.remove('hidden');
    changeEl.style.background = change < 0 ? '#fee2e2' : '#dcfce7';
    changeEl.style.color = change < 0 ? 'var(--danger)' : 'var(--success)';
  } else {
    changeEl.classList.add('hidden');
  }
}

async function processPayment() {
  var total = parseFloat(document.getElementById('checkoutTotal').textContent.replace(D, ''));
  var amountPaid = parseFloat(document.getElementById('amountPaid').value) || total;
  var errorEl = document.getElementById('checkoutError');
  errorEl.classList.add('hidden');

  if (selectedPaymentMethod === 'CASH' && amountPaid < total) {
    errorEl.textContent = 'Amount tendered is less than the total';
    errorEl.classList.remove('hidden');
    return;
  }

  var subtotal = cart.reduce(function(sum, i) { return sum + i.subtotal; }, 0);
  var discount = parseFloat(document.getElementById('discountInput').value) || 0;
  var taxable = Math.max(0, subtotal - discount);
  var tax = taxable * TAX_RATE;
  var customerId = document.getElementById('customerSelect').value;

  var payload = {
    customerId: customerId || null,
    items: cart.map(function(i) { return { productId: i.productId, quantity: i.quantity }; }),
    discount: discount,
    tax: tax,
    paymentMethod: selectedPaymentMethod,
    amountPaid: amountPaid,
    paymentReference: document.getElementById('paymentReference').value || null,
  };

  try {
    var sale = await api.post('/sales', payload);
    currentSaleId = sale.id;
    closeModal('checkoutModal');
    showReceipt(sale);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
}

function showReceipt(sale) {
  var date = new Date(sale.createdAt).toLocaleString();
  var itemRows = sale.saleItems.map(function(i) {
    return '<div class="receipt-item">' +
      '<span>' + i.product.name + ' x' + i.quantity + ' @ ' + D + i.unitPrice.toFixed(2) + '</span>' +
      '<span>' + D + i.subtotal.toFixed(2) + '</span>' +
      '</div>';
  }).join('');

  var discountRow = sale.discount > 0
    ? '<div class="receipt-total-row"><span>Discount</span><span>-' + D + sale.discount.toFixed(2) + '</span></div>'
    : '';
  var changeRow = (sale.payment && sale.payment.change > 0)
    ? '<div class="receipt-total-row"><span>Change</span><span>' + D + sale.payment.change.toFixed(2) + '</span></div>'
    : '';
  var customerRow = sale.customer
    ? '<div><strong>Customer:</strong> ' + sale.customer.name + '</div>'
    : '';

  document.getElementById('receiptContent').innerHTML =
    '<div class="receipt">' +
      '<div class="receipt-header"><h2>' + STORE_NAME + '</h2><p>Official Receipt</p></div>' +
      '<hr class="receipt-divider" />' +
      '<div><strong>Transaction #:</strong> ' + sale.id + '</div>' +
      '<div><strong>Date:</strong> ' + date + '</div>' +
      '<div><strong>Cashier:</strong> ' + sale.user.fullName + '</div>' +
      customerRow +
      '<hr class="receipt-divider" />' +
      itemRows +
      '<hr class="receipt-divider" />' +
      '<div class="receipt-totals">' +
        '<div class="receipt-total-row"><span>Subtotal</span><span>' + D + sale.totalAmount.toFixed(2) + '</span></div>' +
        discountRow +
        '<div class="receipt-total-row"><span>Tax (10%)</span><span>' + D + sale.tax.toFixed(2) + '</span></div>' +
        '<div class="receipt-total-row final"><span>TOTAL</span><span>' + D + sale.grandTotal.toFixed(2) + '</span></div>' +
        '<div class="receipt-total-row"><span>Payment Method</span><span>' + sale.payment.method.replace('_', ' ') + '</span></div>' +
        (sale.payment.amountPaid ? '<div class="receipt-total-row"><span>Amount Paid</span><span>' + D + sale.payment.amountPaid.toFixed(2) + '</span></div>' : '') +
        changeRow +
      '</div>' +
      '<hr class="receipt-divider" />' +
      '<div class="receipt-footer"><p>Thank you for shopping at ' + STORE_NAME + '!</p></div>' +
    '</div>';

  document.getElementById('receiptModal').classList.remove('hidden');
}

function printReceipt() { window.print(); }

function newSale() {
  cart = [];
  currentSaleId = null;
  document.getElementById('discountInput').value = 0;
  document.getElementById('customerSelect').value = '';
  document.getElementById('barcodeInput').value = '';
  closeModal('receiptModal');
  renderCart();
  loadProducts();
}

function openCustomerModal() {
  document.getElementById('newCustomerName').value = '';
  document.getElementById('newCustomerPhone').value = '';
  document.getElementById('newCustomerEmail').value = '';
  document.getElementById('customerModal').classList.remove('hidden');
}

async function registerCustomer() {
  var name = document.getElementById('newCustomerName').value.trim();
  var phone = document.getElementById('newCustomerPhone').value.trim();
  var email = document.getElementById('newCustomerEmail').value.trim();

  if (!name) { alert('Customer name is required'); return; }

  try {
    var customer = await api.post('/customers', { name: name, phone: phone || null, email: email || null });
    var select = document.getElementById('customerSelect');
    var opt = document.createElement('option');
    opt.value = customer.id;
    opt.textContent = customer.name + (customer.phone ? ' - ' + customer.phone : '');
    select.appendChild(opt);
    select.value = customer.id;
    closeModal('customerModal');
  } catch (err) {
    alert(err.message);
  }
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

initPOS();
