// Central API helper - all requests go through here.
// Change VITE_API_URL in .env to point to a different backend.

import { reportReachable, reportUnreachable } from '../offline/connectivity'

export const API_BASE = import.meta.env.VITE_API_URL || '/api'

/** Thrown when the server could not be reached at all (vs. rejecting the request). */
export class NetworkError extends Error {
  constructor(cause) {
    super('No connection to the server')
    this.name = 'NetworkError'
    this.isNetworkError = true
    this.cause = cause
  }
}

function getToken() {
  return localStorage.getItem('token')
}

function parseJsonBody(text, status) {
  const t = (text || '').trim()
  if (!t) return {}
  try {
    return JSON.parse(t)
  } catch {
    throw new Error(
      status === 404
        ? 'API not found — is the backend running and VITE_API_URL correct?'
        : `Server returned non-JSON (${status}). Check the Network tab for this request.`
    )
  }
}

async function request(method, path, body, _retries = 0) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (networkErr) {
    if (method === 'GET' && _retries < 2) {
      await new Promise(r => setTimeout(r, 1000 * (_retries + 1)))
      return request(method, path, body, _retries + 1)
    }
    // fetch threw: the request never reached the server, so a write is safe to
    // queue and replay. Callers distinguish this from a server rejection.
    reportUnreachable()
    throw new NetworkError(networkErr)
  }

  // We got bytes back, so the backend is reachable even if it answers with an error.
  reportReachable()

  const text = await res.text()

  // Must not return undefined: callers do setState(await api.get()) and would crash on .map
  if (res.status === 401 && path !== '/auth/login') {
    localStorage.clear()
    window.location.assign('/login')
    throw new Error('Session expired')
  }

  const data = parseJsonBody(text, res.status)

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
  patch:  (path, body)  => request('PATCH',  path, body),
  delete: (path)        => request('DELETE', path),
}
