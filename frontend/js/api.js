// Central API helper - all fetch calls go through here.
// This keeps auth headers and error handling in one place.

const API_BASE = 'http://localhost:3000/api';

// Attach the JWT token to every request automatically
function getHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// Generic request wrapper - handles errors consistently
async function request(method, path, body = null) {
  const options = { method, headers: getHeaders() };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, options);

  // If the token expired, kick the user back to login
  if (res.status === 401) {
    localStorage.clear();
    window.location.href = 'index.html';
    return;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  delete: (path) => request('DELETE', path),
};
