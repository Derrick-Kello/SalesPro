// Handles login, logout, and protecting pages from unauthenticated access.

const PUBLIC_PAGES = ['index.html', ''];

// Pages that only cashiers can access
const CASHIER_PAGES = ['cashier.html'];

// Pages that only admins and managers can access
const MANAGER_PAGES = ['dashboard.html'];

function getCurrentPage() {
  return window.location.pathname.split('/').pop();
}

function requireAuth() {
  const page = getCurrentPage();
  if (PUBLIC_PAGES.includes(page)) return;

  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'index.html';
    return;
  }

  const user = JSON.parse(localStorage.getItem('user') || '{}');

  // Admins and managers should not be on the cashier register
  if (CASHIER_PAGES.includes(page) && user.role !== 'CASHIER') {
    window.location.href = 'dashboard.html';
    return;
  }

  // Cashiers should not be on the admin/manager dashboard
  if (MANAGER_PAGES.includes(page) && user.role === 'CASHIER') {
    window.location.href = 'cashier.html';
    return;
  }

  // Fill in the navbar user info
  const nameEl = document.getElementById('navUserName');
  const roleEl = document.getElementById('navUserRole');
  if (nameEl) nameEl.textContent = user.fullName || user.username || '';
  if (roleEl) roleEl.textContent = user.role || '';

  applyRoleVisibility(user.role);
}

function applyRoleVisibility(role) {
  document.querySelectorAll('.admin-only').forEach(function(el) {
    if (role === 'ADMIN') el.classList.remove('hidden');
    else el.classList.add('hidden');
  });

  document.querySelectorAll('.manager-only').forEach(function(el) {
    if (role === 'ADMIN' || role === 'MANAGER') el.classList.remove('hidden');
    else el.classList.add('hidden');
  });
}

function logout() {
  localStorage.clear();
  window.location.href = 'index.html';
}

// Login form - only active on the login page
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');

    errorEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
      const data = await api.post('/auth/login', { username: username, password: password });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      // Each role lands on the right page after login
      if (data.user.role === 'CASHIER') {
        window.location.href = 'cashier.html';
      } else {
        window.location.href = 'dashboard.html';
      }
    } catch (err) {
      errorEl.textContent = err.message || 'Login failed';
      errorEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });
}

requireAuth();
