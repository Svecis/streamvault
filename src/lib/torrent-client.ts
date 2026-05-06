/**
 * Torrent service URL — read from env or default to localhost.
 * In production on VPS, the torrent service runs as a separate
 * systemd service on port 3001.
 */
export const TORRENT_SERVICE_URL =
  process.env.TORRENT_SERVICE_URL || 'http://127.0.0.1:3001'
