import { spawn } from 'child_process'
import path from 'path'

/**
 * Torrent service URL — read from env or default to localhost.
 * In production on VPS, the torrent service runs as a separate
 * systemd service on port 3001.
 */
export const TORRENT_SERVICE_URL =
  process.env.TORRENT_SERVICE_URL || 'http://127.0.0.1:3001'

// Singleton: ensure we only spawn the torrent service once
let torrentServiceStarted = false

/**
 * Ensures the torrent service is running by spawning it as a child process
 * if it's not already active. Called lazily from API routes.
 */
export async function ensureTorrentService(): Promise<void> {
  if (torrentServiceStarted) return

  // First check if it's already running (e.g., in production via systemd)
  try {
    const res = await fetch(`${TORRENT_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    })
    if (res.ok) {
      torrentServiceStarted = true
      return
    }
  } catch {
    // Service not reachable, need to start it
  }

  // Spawn the torrent service as a detached child process
  const tsPath = path.resolve(process.cwd(), 'mini-services/torrent-service/index.ts')
  const tsCwd = path.resolve(process.cwd(), 'mini-services/torrent-service')

  console.log('[torrent-client] Starting torrent service...')

  const child = spawn('node', ['--import', 'tsx', tsPath], {
    cwd: tsCwd,
    env: { ...process.env, PORT: '3001' },
    detached: true,
    stdio: 'ignore',
  })

  child.unref()

  // Wait for the service to become available
  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    try {
      const res = await fetch(`${TORRENT_SERVICE_URL}/health`, {
        signal: AbortSignal.timeout(2000),
        cache: 'no-store',
      })
      if (res.ok) {
        console.log('[torrent-client] Torrent service is ready')
        torrentServiceStarted = true
        return
      }
    } catch {
      // Not ready yet
    }
  }

  console.error('[torrent-client] Timed out waiting for torrent service to start')
}
