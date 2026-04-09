// Central API helper - all requests go through here.
// Change VITE_API_URL in .env to point to a different backend.

const BASE = import.meta.env.VITE_API_URL || '/api'

function getToken() {
  return localStorage.getItem('token')
}

async function request(method, path, body, _retries = 0) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (networkErr) {
    if (method === 'GET' && _retries < 2) {
      await new Promise(r => setTimeout(r, 1000 * (_retries + 1)))
      return request(method, path, body, _retries + 1)
    }
    throw networkErr
  }

  if (res.status === 401 && path !== '/auth/login') {
    localStorage.clear()
    window.location.href = '/login'
    return
  }

  const text = await res.text()
  const data = text ? JSON.parse(text) : {}

  if (!res.ok) {
    if (res.status >= 500 && method === 'GET' && _retries < 2) {
      await new Promise(r => setTimeout(r, 1000 * (_retries + 1)))
      return request(method, path, body, _retries + 1)
    }
    throw new Error(data.error || `Request failed (${res.status})`)
  }
  return data
}

export const api = {
  get:    (path)        => request('GET',    path),
  post:   (path, body)  => request('POST',   path, body),
  put:    (path, body)  => request('PUT',    path, body),
  delete: (path)        => request('DELETE', path),
}
