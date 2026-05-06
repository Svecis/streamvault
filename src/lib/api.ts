/**
 * Authenticated fetch wrapper that sends session token via both
 * cookies (credentials: 'include') and a custom header as fallback.
 */
export function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('sv_session') : null

  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...options.headers,
      ...(token ? { 'x-session-token': token } : {}),
    },
  })
}

/**
 * Always returns a plain array. Never throws. Never returns null or undefined.
 * Unwraps common envelope shapes like { torrents: [...] } or { files: [...] }.
 */
export async function fetchList(url: string, options: RequestInit = {}): Promise<any[]> {
  try {
    const res = await apiFetch(url, options)
    if (!res.ok) {
      console.warn(`fetchList ${url} → HTTP ${res.status}`)
      return []
    }
    const data = await res.json()
    if (Array.isArray(data)) return data
    if (data === null || data === undefined) return []
    if (typeof data !== 'object') return []
    // Unwrap common envelope shapes
    for (const key of ['items', 'results', 'data', 'torrents', 'files', 'users', 'invites', 'inviteCodes']) {
      if (Array.isArray(data[key])) return data[key]
    }
    console.warn('fetchList: unexpected shape from', url, data)
    return []
  } catch (err) {
    console.error('fetchList error:', url, err)
    return []
  }
}

/**
 * Returns null on any error. Never throws.
 * Use for single-object endpoints like /api/admin/stats.
 */
export async function fetchOne(url: string, options: RequestInit = {}): Promise<any | null> {
  try {
    const res = await apiFetch(url, options)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Store session token after login (both cookie is set by server + localStorage)
 */
export function storeSession(token: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('sv_session', token)
  }
}

/**
 * Clear session token on logout
 */
export function clearSession() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('sv_session')
  }
}
