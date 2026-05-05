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
