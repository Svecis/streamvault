import { db } from '@/lib/db'

/**
 * Parse cookies from a Request's Cookie header into a Map
 */
function parseCookies(request: Request): Map<string, string> {
  const cookieHeader = request.headers.get('cookie') || ''
  const cookies = new Map<string, string>()
  for (const pair of cookieHeader.split(';')) {
    const trimmed = pair.trim()
    if (!trimmed) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.substring(0, eqIndex).trim()
    const value = trimmed.substring(eqIndex + 1).trim()
    cookies.set(key, value)
  }
  return cookies
}

/**
 * Get the current session user from the request.
 * Checks both the sv_session cookie and x-session-token header.
 * Returns the user record or null if not found / no token.
 */
export async function getSessionUser(request: Request) {
  // Try cookie first
  const cookies = parseCookies(request)
  let sessionToken = cookies.get('sv_session')

  // Fallback to custom header (for sandbox environments where cookies may not work)
  if (!sessionToken) {
    sessionToken = request.headers.get('x-session-token')
  }

  if (!sessionToken) {
    return null
  }

  const user = await db.user.findUnique({
    where: { sessionToken },
  })

  return user
}

/**
 * Require authentication. Returns the user or throws a 401 Response.
 */
export async function requireAuth(request: Request) {
  const user = await getSessionUser(request)

  if (!user) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return user
}
