// Cashier page: tab switching, all-sales view, my-sales view, receipt reprint.

var STORE_NAME = 'My Store';
var D = '$'; // dollar sign as a variable so it never gets stripped during file writes

function switchTab(tab) {
  document.getElementById('tabContentRegister').classList.toggle('hidden', tab !== 'register');
  document.getElementById('tabContentHistory').classList.toggle('hidden', tab !== 'history');
  document.getElementById('tabRegister').classList.toggle('active', tab === 'register');
  document.getElementById('tabHistory').classList.toggle('active', tab === 'history');

  if (tab === 'history') {
    // Open on All Sales by default
    showHistoryView('all', document.getElementById('historyTabAll'));
  }
}

// Toggle between All Sales and My Sales inside the history tab
function showHistoryView(view, btn) {
  document.querySelectorAll('.history-sub-tab').forEach(function(b) {
    b.classList.remove('active');
  });
  if (btn) btn.classList.add('active');
  loadSalesHistory(view === 'mine');
}

// Fetch sales from the API - mineOnly adds ?mine=true so the backend filters by userId
async function loadSalesHistory(mineOnly) {
  var start = document.getElementById('historyStartDate').value;
  var end = document.getElementById('historyEndDate').value;

  var path = '/sales';
  var params = [];
  if (mineOnly) params.push('mine=true');
  if (start) params.push('startDate=' + start);
  if (end) params.push('endDate=' + end);
  if (params.length) path += '?' + params.join('&');

  var tbody = document.getElementById('historyTableBody');
  tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted)">Loading...</td></tr>';

  try {
    var sales = await api.get(path);

    if (!sales.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted)">No sales found</td></tr>';
      return;
    }

    tbody.innerHTML = sales.map(function(s) {
      var statusClass = s.status === 'COMPLETED' ? 'badge-success'
        : s.status === 'CANCELLED' ? 'badge-danger' : 'badge-warning';
      var itemCount = s.saleItems ? s.saleItems.length : 0;
      return '<tr>' +
        '<td>#' + s.id + '</td>' +
        '<td>' + new Date(s.createdAt).toLocaleString() + '</td>' +
        '<td>' + s.user.fullName + '</td>' +
        '<td>' + (s.customer ? s.customer.name : 'Walk-in') + '</td>' +
        '<td>' + itemCount + ' item(s)</td>' +
        '<td>' + D + s.grandTotal.toFixed(2) + '</td>' +
        '<td>' + (s.payment ? s.payment.method.replace('_', ' ') : '-') + '</td>' +
        '<td><span class="badge ' + statusClass + '">' + s.status + '</span></td>' +
        '<td><button class="btn btn-sm btn-outline" onclick="reprintReceipt(' + s.id + ')">Receipt</button></td>' +
        '</tr>';
    }).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--danger)">' + err.message + '</td></tr>';
  }
}

// Re-run the active sub-tab when the date filter button is clicked
function applyHistoryFilter() {
  var activeBtn = document.querySelector('.history-sub-tab.active');
  var isMine = activeBtn && activeBtn.id === 'historyTabMine';
  loadSalesHistory(isMine);
}

// Pull a full sale and render it as a receipt in the reprint modal
async function reprintReceipt(saleId) {
  try {
    var sale = await api.get('/sales/' + saleId);
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
    var amountPaidRow = (sale.payment && sale.payment.amountPaid)
      ? '<div class="receipt-total-row"><span>Amount Paid</span><span>' + D + sale.payment.amountPaid.toFixed(2) + '</span></div>'
      : '';

    document.getElementById('reprintContent').innerHTML =
      '<div class="receipt">' +
        '<div class="receipt-header"><h2>' + STORE_NAME + '</h2><p>Official Receipt</p></div>' +
        '<hr class="receipt-divider" />' +
        '<div><strong>Transaction #:</strong> ' + sale.id + '</div>' +
        '<div><strong>Date:</strong> ' + date + '</div>' +
        '<div><strong>Cashier:</strong> ' + sale.user.fullName + '</div>' +
        (sale.customer ? '<div><strong>Customer:</strong> ' + sale.customer.name + '</div>' : '') +
        '<hr class="receipt-divider" />' +
        itemRows +
        '<hr class="receipt-divider" />' +
        '<div class="receipt-totals">' +
          '<div class="receipt-total-row"><span>Subtotal</span><span>' + D + sale.totalAmount.toFixed(2) + '</span></div>' +
          discountRow +
          '<div class="receipt-total-row"><span>Tax (10%)</span><span>' + D + sale.tax.toFixed(2) + '</span></div>' +
          '<div class="receipt-total-row final"><span>TOTAL</span><span>' + D + sale.grandTotal.toFixed(2) + '</span></div>' +
          '<div class="receipt-total-row"><span>Payment Method</span><span>' + sale.payment.method.replace('_', ' ') + '</span></div>' +
          amountPaidRow +
          changeRow +
        '</div>' +
        '<hr class="receipt-divider" />' +
        '<div class="receipt-footer"><p>Thank you for shopping at ' + STORE_NAME + '!</p></div>' +
      '</div>';

    document.getElementById('reprintModal').classList.remove('hidden');
  } catch (err) {
    alert('Could not load receipt');
  }
}
