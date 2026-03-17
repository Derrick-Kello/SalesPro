// Dashboard logic - handles all sections: products, inventory, customers, sales, reports, users.

let currentSection = 'overview';
let editingProductId = null;
let editingCustomerId = null;
let editingUserId = null;
let currentSaleIdForCancel = null;

// Switch between sidebar sections
function showSection(name, linkEl) {
  document.querySelectorAll('.dashboard-section').forEach((s) => s.classList.add('hidden'));
  document.getElementById('section-' + name).classList.remove('hidden');
  document.querySelectorAll('.sidebar-menu a').forEach((a) => a.classList.remove('active'));
  if (linkEl) linkEl.classList.add('active');
  currentSection = name;

  const loaders = {
    overview: loadOverview,
    products: loadProductsAdmin,
    inventory: loadInventory,
    customers: loadCustomersAdmin,
    sales: loadSales,
    reports: function() { showReport('daily', document.querySelector('.tab-btn')); },
    users: loadUsers,
  };
  if (loaders[name]) loaders[name]();
}

// ---- Overview ----

async function loadOverview() {
  try {
    const daily = await api.get('/reports/daily');
    const products = await api.get('/products');
    const inventory = await api.get('/inventory');

    document.getElementById('statRevenue').textContent = '$' + daily.totalRevenue.toFixed(2);
    document.getElementById('statTransactions').textContent = daily.totalTransactions;
    document.getElementById('statProducts').textContent = products.length;

    const lowStock = inventory.filter(function(i) { return i.quantity <= i.lowStockAlert; });
    document.getElementById('statLowStock').textContent = lowStock.length;

    const topEl = document.getElementById('topProductsList');
    if (daily.topProducts.length) {
      topEl.innerHTML = daily.topProducts.slice(0, 5).map(function(p) {
        return '<div class="list-item"><span class="list-item-name">' + p.name + '</span><span class="list-item-value">$' + p.revenue.toFixed(2) + '</span></div>';
      }).join('');
    } else {
      topEl.innerHTML = '<p style="color:var(--text-muted);font-size:13px">No sales today yet</p>';
    }

    const lowEl = document.getElementById('lowStockList');
    if (lowStock.length) {
      lowEl.innerHTML = lowStock.slice(0, 5).map(function(i) {
        return '<div class="list-item"><span class="list-item-name">' + i.product.name + '</span><span class="list-item-value danger">' + i.quantity + ' left</span></div>';
      }).join('');
    } else {
      lowEl.innerHTML = '<p style="color:var(--text-muted);font-size:13px">All stock levels are fine</p>';
    }
  } catch (err) {
    console.error('Overview load failed:', err.message);
  }
}

// ---- Products ----

async function loadProductsAdmin() {
  try {
    const products = await api.get('/products');
    renderProductsTable(products);
  } catch (err) {
    console.error('Products load failed:', err.message);
  }
}

function renderProductsTable(products) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const canEdit = user.role === 'ADMIN' || user.role === 'MANAGER';
  const actionCol = canEdit
    ? '<button class="btn btn-sm btn-outline" onclick="openProductModal(' + p_id + ')">Edit</button> <button class="btn btn-sm btn-danger" onclick="deleteProduct(' + p_id + ')">Delete</button>'
    : '';

  document.getElementById('productsTableBody').innerHTML = products.map(function(p) {
    const actions = canEdit
      ? '<button class="btn btn-sm btn-outline" onclick="openProductModal(' + p.id + ')">Edit</button> <button class="btn btn-sm btn-danger" onclick="deleteProduct(' + p.id + ')">Delete</button>'
      : '';
    return '<tr>' +
      '<td>' + p.id + '</td>' +
      '<td>' + p.name + '</td>' +
      '<td>' + p.category + '</td>' +
      '<td>$' + p.price.toFixed(2) + '</td>' +
      '<td>' + (p.barcode || '-') + '</td>' +
      '<td>' + (p.inventory ? p.inventory.quantity : 0) + '</td>' +
      '<td>' + actions + '</td>' +
      '</tr>';
  }).join('');
}

function searchProductsAdmin() {
  const q = document.getElementById('productSearch').value.toLowerCase();
  document.querySelectorAll('#productsTableBody tr').forEach(function(row) {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

async function openProductModal(id) {
  id = id || null;
  editingProductId = id;
  document.getElementById('productModalTitle').textContent = id ? 'Edit Product' : 'Add Product';
  document.getElementById('productError').classList.add('hidden');

  if (id) {
    try {
      const p = await api.get('/products/' + id);
      document.getElementById('productId').value = p.id;
      document.getElementById('productName').value = p.name;
      document.getElementById('productCategory').value = p.category;
      document.getElementById('productPrice').value = p.price;
      document.getElementById('productBarcode').value = p.barcode || '';
      document.getElementById('productDescription').value = p.description || '';
      document.getElementById('productQuantity').value = p.inventory ? p.inventory.quantity : 0;
      document.getElementById('productLowStock').value = p.inventory ? p.inventory.lowStockAlert : 10;
      document.getElementById('productSupplier').value = (p.inventory && p.inventory.supplier) ? p.inventory.supplier : '';
    } catch (err) {
      alert('Could not load product');
      return;
    }
  } else {
    ['productId','productName','productCategory','productPrice','productBarcode','productDescription','productSupplier'].forEach(function(fid) {
      document.getElementById(fid).value = '';
    });
    document.getElementById('productQuantity').value = 0;
    document.getElementById('productLowStock').value = 10;
  }
  document.getElementById('productModal').classList.remove('hidden');
}

async function saveProduct() {
  const name = document.getElementById('productName').value.trim();
  const category = document.getElementById('productCategory').value.trim();
  const price = document.getElementById('productPrice').value;
  const errorEl = document.getElementById('productError');

  if (!name || !category || !price) {
    errorEl.textContent = 'Name, category, and price are required';
    errorEl.classList.remove('hidden');
    return;
  }

  const payload = {
    name: name,
    category: category,
    price: price,
    barcode: document.getElementById('productBarcode').value.trim() || null,
    description: document.getElementById('productDescription').value.trim() || null,
    quantity: document.getElementById('productQuantity').value,
    lowStockAlert: document.getElementById('productLowStock').value,
    supplier: document.getElementById('productSupplier').value.trim() || null,
  };

  try {
    if (editingProductId) {
      await api.put('/products/' + editingProductId, payload);
    } else {
      await api.post('/products', payload);
    }
    closeModal('productModal');
    loadProductsAdmin();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
}

async function deleteProduct(id) {
  if (!confirm('Remove this product?')) return;
  try {
    await api.delete('/products/' + id);
    loadProductsAdmin();
  } catch (err) {
    alert(err.message);
  }
}

// ---- Inventory ----

async function loadInventory() {
  try {
    const inventory = await api.get('/inventory');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const canEdit = user.role === 'ADMIN' || user.role === 'MANAGER';

    document.getElementById('inventoryTableBody').innerHTML = inventory.map(function(i) {
      const stockBadge = i.quantity <= i.lowStockAlert
        ? '<span class="badge badge-danger">' + i.quantity + '</span>'
        : '<span class="badge badge-success">' + i.quantity + '</span>';
      const statusBadge = i.quantity <= i.lowStockAlert
        ? '<span class="badge badge-warning">Low Stock</span>'
        : '<span class="badge badge-success">OK</span>';
      const actions = canEdit
        ? '<button class="btn btn-sm btn-outline" onclick="openInventoryModal(' + i.productId + ', \'' + i.product.name.replace(/'/g, "\\'") + '\')">Adjust</button>'
        : '';
      return '<tr>' +
        '<td>' + i.product.name + '</td>' +
        '<td>' + i.product.category + '</td>' +
        '<td>' + stockBadge + '</td>' +
        '<td>' + i.lowStockAlert + '</td>' +
        '<td>' + (i.supplier || '-') + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td>' + actions + '</td>' +
        '</tr>';
    }).join('');
  } catch (err) {
    console.error('Inventory load failed:', err.message);
  }
}

function openInventoryModal(productId, productName) {
  document.getElementById('invProductId').value = productId;
  document.getElementById('invProductName').textContent = 'Product: ' + productName;
  document.getElementById('invAddQty').value = '';
  document.getElementById('invSetQty').value = '';
  document.getElementById('invSupplier').value = '';
  document.getElementById('inventoryModal').classList.remove('hidden');
}

async function addStock() {
  const productId = document.getElementById('invProductId').value;
  const addQuantity = parseInt(document.getElementById('invAddQty').value);
  const supplier = document.getElementById('invSupplier').value.trim();

  if (!addQuantity || addQuantity <= 0) { alert('Enter a valid quantity to add'); return; }

  try {
    await api.put('/inventory/' + productId + '/restock', { addQuantity: addQuantity, supplier: supplier });
    closeModal('inventoryModal');
    loadInventory();
  } catch (err) {
    alert(err.message);
  }
}

async function setStock() {
  const productId = document.getElementById('invProductId').value;
  const quantity = document.getElementById('invSetQty').value;
  const supplier = document.getElementById('invSupplier').value.trim();

  if (quantity === '') { alert('Enter the quantity to set'); return; }

  try {
    await api.put('/inventory/' + productId + '/adjust', { quantity: parseInt(quantity), supplier: supplier });
    closeModal('inventoryModal');
    loadInventory();
  } catch (err) {
    alert(err.message);
  }
}

// ---- Customers ----

async function loadCustomersAdmin() {
  try {
    const customers = await api.get('/customers');
    renderCustomersTable(customers);
  } catch (err) {
    console.error('Customers load failed:', err.message);
  }
}

function renderCustomersTable(customers) {
  document.getElementById('customersTableBody').innerHTML = customers.map(function(c) {
    return '<tr>' +
      '<td>' + c.name + '</td>' +
      '<td>' + (c.phone || '-') + '</td>' +
      '<td>' + (c.email || '-') + '</td>' +
      '<td>' + c.loyaltyPoints + ' pts</td>' +
      '<td><button class="btn btn-sm btn-outline" onclick="openCustomerFormModal(' + c.id + ')">Edit</button>' +
      ' <button class="btn btn-sm btn-outline" onclick="viewCustomerHistory(' + c.id + ')">History</button></td>' +
      '</tr>';
  }).join('');
}

function searchCustomersAdmin() {
  const q = document.getElementById('customerSearch').value.toLowerCase();
  document.querySelectorAll('#customersTableBody tr').forEach(function(row) {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

async function openCustomerFormModal(id) {
  id = id || null;
  editingCustomerId = id;
  document.getElementById('customerFormTitle').textContent = id ? 'Edit Customer' : 'Add Customer';
  document.getElementById('customerError').classList.add('hidden');

  if (id) {
    try {
      const c = await api.get('/customers/' + id);
      document.getElementById('customerId').value = c.id;
      document.getElementById('customerName').value = c.name;
      document.getElementById('customerPhone').value = c.phone || '';
      document.getElementById('customerEmail').value = c.email || '';
      document.getElementById('customerAddress').value = c.address || '';
    } catch (err) {
      alert('Could not load customer');
      return;
    }
  } else {
    ['customerId','customerName','customerPhone','customerEmail','customerAddress'].forEach(function(fid) {
      document.getElementById(fid).value = '';
    });
  }
  document.getElementById('customerFormModal').classList.remove('hidden');
}

async function saveCustomer() {
  const name = document.getElementById('customerName').value.trim();
  const errorEl = document.getElementById('customerError');

  if (!name) {
    errorEl.textContent = 'Customer name is required';
    errorEl.classList.remove('hidden');
    return;
  }

  const payload = {
    name: name,
    phone: document.getElementById('customerPhone').value.trim() || null,
    email: document.getElementById('customerEmail').value.trim() || null,
    address: document.getElementById('customerAddress').value.trim() || null,
  };

  try {
    if (editingCustomerId) {
      await api.put('/customers/' + editingCustomerId, payload);
    } else {
      await api.post('/customers', payload);
    }
    closeModal('customerFormModal');
    loadCustomersAdmin();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
}

// View a customer's purchase history
async function viewCustomerHistory(id) {
  try {
    const c = await api.get('/customers/' + id);
    const rows = c.sales.map(function(s) {
      return '<tr>' +
        '<td>#' + s.id + '</td>' +
        '<td>' + new Date(s.createdAt).toLocaleDateString() + '</td>' +
        '<td>$' + s.grandTotal.toFixed(2) + '</td>' +
        '<td>' + (s.payment ? s.payment.method.replace('_', ' ') : '-') + '</td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="4">No purchases yet</td></tr>';

    document.getElementById('customerHistoryName').textContent = c.name + ' - Purchase History';
    document.getElementById('customerHistoryPoints').textContent = 'Loyalty Points: ' + c.loyaltyPoints;
    document.getElementById('customerHistoryBody').innerHTML = rows;
    document.getElementById('customerHistoryModal').classList.remove('hidden');
  } catch (err) {
    alert('Could not load customer history');
  }
}

// ---- Sales History ----

async function loadSales() {
  try {
    const start = document.getElementById('salesStartDate').value;
    const end = document.getElementById('salesEndDate').value;
    let path = '/sales';
    const params = [];
    if (start) params.push('startDate=' + start);
    if (end) params.push('endDate=' + end);
    if (params.length) path += '?' + params.join('&');

    const sales = await api.get(path);

    document.getElementById('salesTableBody').innerHTML = sales.map(function(s) {
      const statusClass = s.status === 'COMPLETED' ? 'badge-success' : s.status === 'CANCELLED' ? 'badge-danger' : 'badge-warning';
      return '<tr>' +
        '<td>#' + s.id + '</td>' +
        '<td>' + new Date(s.createdAt).toLocaleString() + '</td>' +
        '<td>' + s.user.fullName + '</td>' +
        '<td>' + (s.customer ? s.customer.name : 'Walk-in') + '</td>' +
        '<td>$' + s.grandTotal.toFixed(2) + '</td>' +
        '<td>' + (s.payment ? s.payment.method.replace('_', ' ') : '-') + '</td>' +
        '<td><span class="badge ' + statusClass + '">' + s.status + '</span></td>' +
        '<td><button class="btn btn-sm btn-outline" onclick="viewSale(' + s.id + ')">View</button></td>' +
        '</tr>';
    }).join('');
  } catch (err) {
    console.error('Sales load failed:', err.message);
  }
}

async function viewSale(id) {
  try {
    const sale = await api.get('/sales/' + id);
    currentSaleIdForCancel = id;

    const items = sale.saleItems.map(function(i) {
      return '<tr><td>' + i.product.name + '</td><td>' + i.quantity + '</td><td>$' + i.unitPrice.toFixed(2) + '</td><td>$' + i.subtotal.toFixed(2) + '</td></tr>';
    }).join('');

    document.getElementById('saleDetailContent').innerHTML =
      '<div style="margin-bottom:12px">' +
        '<strong>Transaction #' + sale.id + '</strong> &nbsp;' +
        '<span class="badge ' + (sale.status === 'COMPLETED' ? 'badge-success' : 'badge-danger') + '">' + sale.status + '</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;font-size:13px">' +
        '<div><strong>Date:</strong> ' + new Date(sale.createdAt).toLocaleString() + '</div>' +
        '<div><strong>Cashier:</strong> ' + sale.user.fullName + '</div>' +
        '<div><strong>Customer:</strong> ' + (sale.customer ? sale.customer.name : 'Walk-in') + '</div>' +
        '<div><strong>Payment:</strong> ' + (sale.payment ? sale.payment.method.replace('_', ' ') : '-') + '</div>' +
      '</div>' +
      '<table class="report-table">' +
        '<thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th></tr></thead>' +
        '<tbody>' + items + '</tbody>' +
      '</table>' +
      '<div style="margin-top:12px;text-align:right;font-size:13px">' +
        '<div>Subtotal: $' + sale.totalAmount.toFixed(2) + '</div>' +
        (sale.discount > 0 ? '<div>Discount: -$' + sale.discount.toFixed(2) + '</div>' : '') +
        '<div>Tax: $' + sale.tax.toFixed(2) + '</div>' +
        '<div style="font-size:16px;font-weight:700;margin-top:6px">Total: $' + sale.grandTotal.toFixed(2) + '</div>' +
        (sale.payment && sale.payment.change > 0 ? '<div>Change: $' + sale.payment.change.toFixed(2) + '</div>' : '') +
      '</div>';

    const cancelBtn = document.getElementById('cancelSaleBtn');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if ((user.role === 'ADMIN' || user.role === 'MANAGER') && sale.status === 'COMPLETED') {
      cancelBtn.classList.remove('hidden');
    } else {
      cancelBtn.classList.add('hidden');
    }

    document.getElementById('saleDetailModal').classList.remove('hidden');
  } catch (err) {
    alert('Could not load sale details');
  }
}

async function cancelSale() {
  if (!confirm('Cancel this sale and restore stock?')) return;
  try {
    await api.put('/sales/' + currentSaleIdForCancel + '/cancel', {});
    closeModal('saleDetailModal');
    loadSales();
  } catch (err) {
    alert(err.message);
  }
}

// ---- Reports ----

async function showReport(type, btn) {
  document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');

  const container = document.getElementById('reportContent');
  container.innerHTML = '<p style="color:var(--text-muted)">Loading...</p>';

  try {
    if (type === 'daily') {
      const data = await api.get('/reports/daily');
      const rows = data.topProducts.map(function(p) {
        return '<tr><td>' + p.name + '</td><td>' + p.quantity + '</td><td>$' + p.revenue.toFixed(2) + '</td></tr>';
      }).join('') || '<tr><td colspan="3">No sales today</td></tr>';
      container.innerHTML =
        '<div class="report-summary">' +
          '<div class="report-summary-card"><div class="label">Revenue</div><div class="value">$' + data.totalRevenue.toFixed(2) + '</div></div>' +
          '<div class="report-summary-card"><div class="label">Transactions</div><div class="value">' + data.totalTransactions + '</div></div>' +
        '</div>' +
        '<h4 style="margin-bottom:10px">Top Products</h4>' +
        '<table class="report-table"><thead><tr><th>Product</th><th>Qty Sold</th><th>Revenue</th></tr></thead><tbody>' + rows + '</tbody></table>';

    } else if (type === 'weekly') {
      const data = await api.get('/reports/weekly');
      const rows = data.dailyBreakdown.map(function(d) {
        return '<tr><td>' + d.date + '</td><td>' + d.transactions + '</td><td>$' + d.revenue.toFixed(2) + '</td></tr>';
      }).join('') || '<tr><td colspan="3">No data</td></tr>';
      container.innerHTML =
        '<div class="report-summary">' +
          '<div class="report-summary-card"><div class="label">Weekly Revenue</div><div class="value">$' + data.totalRevenue.toFixed(2) + '</div></div>' +
          '<div class="report-summary-card"><div class="label">Transactions</div><div class="value">' + data.totalTransactions + '</div></div>' +
        '</div>' +
        '<table class="report-table"><thead><tr><th>Date</th><th>Transactions</th><th>Revenue</th></tr></thead><tbody>' + rows + '</tbody></table>';

    } else if (type === 'products') {
      const data = await api.get('/reports/products');
      const rows = data.map(function(p) {
        return '<tr><td>' + p.name + '</td><td>' + p.category + '</td><td>' + p.totalQuantity + '</td><td>$' + p.totalRevenue.toFixed(2) + '</td></tr>';
      }).join('') || '<tr><td colspan="4">No data</td></tr>';
      container.innerHTML =
        '<table class="report-table"><thead><tr><th>Product</th><th>Category</th><th>Qty Sold</th><th>Revenue</th></tr></thead><tbody>' + rows + '</tbody></table>';

    } else if (type === 'cashiers') {
      const data = await api.get('/reports/cashiers');
      const rows = data.map(function(c) {
        return '<tr><td>' + c.fullName + '</td><td>' + c.username + '</td><td>' + c.totalSales + '</td><td>$' + c.totalRevenue.toFixed(2) + '</td></tr>';
      }).join('') || '<tr><td colspan="4">No data</td></tr>';
      container.innerHTML =
        '<table class="report-table"><thead><tr><th>Cashier</th><th>Username</th><th>Sales</th><th>Revenue</th></tr></thead><tbody>' + rows + '</tbody></table>';

    } else if (type === 'inventory') {
      const data = await api.get('/reports/inventory');
      const rows = data.inventory.map(function(i) {
        return '<tr><td>' + i.product.name + '</td><td>' + i.quantity + '</td><td>' + i.lowStockAlert + '</td><td>' + (i.supplier || '-') + '</td>' +
          '<td><span class="badge ' + (i.isLowStock ? 'badge-warning' : 'badge-success') + '">' + (i.isLowStock ? 'Low' : 'OK') + '</span></td></tr>';
      }).join('');
      container.innerHTML =
        '<div class="report-summary">' +
          '<div class="report-summary-card"><div class="label">Low Stock Items</div><div class="value" style="color:var(--warning)">' + data.lowStockCount + '</div></div>' +
        '</div>' +
        '<table class="report-table"><thead><tr><th>Product</th><th>Stock</th><th>Alert Level</th><th>Supplier</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }
  } catch (err) {
    container.innerHTML = '<p style="color:var(--danger)">' + err.message + '</p>';
  }
}

// ---- Users ----

async function loadUsers() {
  try {
    const users = await api.get('/users');
    document.getElementById('usersTableBody').innerHTML = users.map(function(u) {
      const deactivateBtn = u.isActive
        ? '<button class="btn btn-sm btn-danger" onclick="deactivateUser(' + u.id + ')">Deactivate</button>'
        : '';
      return '<tr>' +
        '<td>' + u.fullName + '</td>' +
        '<td>' + u.username + '</td>' +
        '<td><span class="badge badge-info">' + u.role + '</span></td>' +
        '<td><span class="badge ' + (u.isActive ? 'badge-success' : 'badge-danger') + '">' + (u.isActive ? 'Active' : 'Inactive') + '</span></td>' +
        '<td><button class="btn btn-sm btn-outline" onclick="openUserModal(' + u.id + ')">Edit</button> ' + deactivateBtn + '</td>' +
        '</tr>';
    }).join('');
  } catch (err) {
    console.error('Users load failed:', err.message);
  }
}

async function openUserModal(id) {
  id = id || null;
  editingUserId = id;
  document.getElementById('userModalTitle').textContent = id ? 'Edit User' : 'Add User';
  document.getElementById('userError').classList.add('hidden');

  if (id) {
    try {
      const users = await api.get('/users');
      const u = users.find(function(x) { return x.id === id; });
      if (!u) return;
      document.getElementById('userId').value = u.id;
      document.getElementById('userFullName').value = u.fullName;
      document.getElementById('userUsername').value = u.username;
      document.getElementById('userPassword').value = '';
      document.getElementById('userRole').value = u.role;
    } catch (err) {
      alert('Could not load user');
      return;
    }
  } else {
    ['userId','userFullName','userUsername','userPassword'].forEach(function(fid) {
      document.getElementById(fid).value = '';
    });
    document.getElementById('userRole').value = 'CASHIER';
  }
  document.getElementById('userModal').classList.remove('hidden');
}

async function saveUser() {
  const fullName = document.getElementById('userFullName').value.trim();
  const username = document.getElementById('userUsername').value.trim();
  const password = document.getElementById('userPassword').value;
  const role = document.getElementById('userRole').value;
  const errorEl = document.getElementById('userError');

  if (!fullName || !username) {
    errorEl.textContent = 'Full name and username are required';
    errorEl.classList.remove('hidden');
    return;
  }
  if (!editingUserId && !password) {
    errorEl.textContent = 'Password is required for new users';
    errorEl.classList.remove('hidden');
    return;
  }

  const payload = { fullName: fullName, role: role };
  if (!editingUserId) {
    payload.username = username;
    payload.password = password;
  }
  if (editingUserId && password) {
    payload.password = password;
  }

  try {
    if (editingUserId) {
      await api.put('/users/' + editingUserId, payload);
    } else {
      await api.post('/users', payload);
    }
    closeModal('userModal');
    loadUsers();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
}

async function deactivateUser(id) {
  if (!confirm('Deactivate this user? They will no longer be able to log in.')) return;
  try {
    await api.delete('/users/' + id);
    loadUsers();
  } catch (err) {
    alert(err.message);
  }
}

// ---- Shared utilities ----

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

document.querySelectorAll('.modal').forEach(function(modal) {
  modal.addEventListener('click', function(e) {
    if (e.target === modal) closeModal(modal.id);
  });
});

// Load the overview when the page first opens
loadOverview();
