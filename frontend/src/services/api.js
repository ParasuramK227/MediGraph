const BASE = '/api'

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch (err) {
    const error = new Error('Cannot reach the API server. Is the Flask backend running?')
    error.network = true
    throw error
  }
  let body = null
  try {
    body = await response.json()
  } catch {
    /* non-JSON response */
  }
  if (!response.ok || (body && body.error)) {
    throw new Error((body && body.error) || `Request failed (${response.status})`)
  }
  return body ? body.data : null
}

export const api = {
  get: (path) => request(path),
  post: (path, payload) =>
    request(path, { method: 'POST', body: JSON.stringify(payload) }),
}
