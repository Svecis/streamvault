import path from 'path'

/**
 * Torrent service URL — read from env or default to localhost.
 * In production on VPS, the torrent service runs as a separate
 * systemd service on port 3001.
 */
export const TORRENT_SERVICE_URL =
  process.env.TORRENT_SERVICE_URL || 'http://127.0.0.1:3001'

// Singleton: track if we've verified the torrent service is reachable
let torrentServiceVerified = false

/**
 * Ensures the torrent service is running.
 * In production: the service is managed by systemd, so we just verify it's reachable.
 * In development: logs a warning if the service isn't running.
 */
export async function ensureTorrentService(): Promise<void> {
  if (torrentServiceVerified) return

  // Check if the torrent service is already running
  try {
    const res = await fetch(`${TORRENT_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    })
    if (res.ok) {
      torrentServiceVerified = true
      return
    }
  } catch {
    // Service not reachable
  }

  // Service isn't running — in production, systemd should handle this.
  // Try waiting a few seconds in case it's still starting up.
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    try {
      const res = await fetch(`${TORRENT_SERVICE_URL}/health`, {
        signal: AbortSignal.timeout(2000),
        cache: 'no-store',
      })
      if (res.ok) {
        console.log('[torrent-client] Torrent service is ready')
        torrentServiceVerified = true
        return
      }
    } catch {
      // Still not ready
    }
  }

  console.error('[torrent-client] Torrent service is not reachable at', TORRENT_SERVICE_URL)
}
