import Fastify from 'fastify'
import WebTorrent from 'webtorrent'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'

const PORT = parseInt(process.env.PORT || '3001', 10)
const TORRENT_DIR = path.resolve(process.env.TORRENT_DIR || '../../torrents')

// WebTorrent listen port - must match UFW firewall rules
const TORRENT_PORT = parseInt(process.env.TORRENT_PORT || '6881', 10)

// Ensure torrent directory exists
if (!fs.existsSync(TORRENT_DIR)) {
  fs.mkdirSync(TORRENT_DIR, { recursive: true })
  console.log(`Created torrent directory: ${TORRENT_DIR}`)
}

console.log(`Torrent dir: ${TORRENT_DIR}`)
console.log(`API Port: ${PORT}`)
console.log(`Torrent listen port: ${TORRENT_PORT}`)

// Common public trackers to add to magnets that have few/no trackers
const EXTRA_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.tracker.cl:1337/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.tiny-vps.com:6969/announce',
  'udp://tracker.moeking.me:6969/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker.pomf.se:80/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://p4p.arenabg.com:1337/announce',
  'udp://movies.zsw.ca:6969/announce',
  'udp://retracker.lanta-net.ru:2710/announce',
]

// Single global WebTorrent client - bind to specific port in UFW range
const client = new WebTorrent({
  maxConns: 100,
  dht: true,
  tracker: true,
  // Bind to port 6881 (in the UFW-allowed range 6881-6999)
  listenPort: TORRENT_PORT,
})

// Global error handler
client.on('error', (err: Error) => {
  console.error('WebTorrent client error:', err.message)
})

// Log DHT events
const dht = client.dht
if (dht) {
  dht.on('listening', () => {
    console.log('✓ DHT listening')
  })
  dht.on('ready', () => {
    console.log('✓ DHT ready (bootstrap complete)')
  })
  dht.on('error', (err: Error) => {
    console.error('DHT error:', err.message)
  })
}

// Map of infoHash → torrent metadata
const activeTorrents = new Map()

// MIME types for video files
function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const types: Record<string, string> = {
    mp4: 'video/mp4',
    mkv: 'video/x-matroska',
    webm: 'video/webm',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    m4v: 'video/mp4',
  }
  return types[ext] || 'video/mp4'
}

// Find largest video file in torrent
function getVideoFile(torrent: any) {
  return torrent.files
    .filter((f: any) => /\.(mp4|mkv|avi|mov|webm|m4v)$/i.test(f.name))
    .sort((a: any, b: any) => b.length - a.length)[0] || null
}

// Extract infoHash from magnet URI (supports both hex and base32)
function extractInfoHash(magnet: string): string | null {
  const hexMatch = magnet.match(/btih:([a-fA-F0-9]{40})/i)
  if (hexMatch) return hexMatch[1].toLowerCase()
  const b32Match = magnet.match(/btih:([A-Z2-7]{32})/i)
  if (b32Match) return b32Match[1].toLowerCase()
  return null
}

function formatSpeed(bps: number): string {
  if (!bps) return '0 B/s'
  const k = 1024
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  const i = Math.floor(Math.log(bps) / Math.log(k))
  return parseFloat((bps / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// Attach event listeners to a torrent for debugging
function attachTorrentListeners(torrent: any, label: string) {
  torrent.on('warning', (err: Error) => {
    console.warn(`[${label}] Warning: ${err.message}`)
  })
  torrent.on('error', (err: Error) => {
    console.error(`[${label}] Error: ${err.message}`)
  })
  torrent.on('done', () => {
    console.log(`[${label}] ✓ Download complete!`)
  })
  torrent.on('noPeers', (announceType: string) => {
    console.log(`[${label}] No peers from ${announceType}`)
  })

  // Log peer discovery events (throttled)
  let lastPeerLog = 0
  torrent.on('wire', (wire: any) => {
    const now = Date.now()
    if (now - lastPeerLog > 5000) {
      lastPeerLog = now
      console.log(`[${label}] Peer connected: ${wire.peerId?.substring(0, 8) || 'unknown'} | Total: ${torrent.numPeers} peers | Progress: ${Math.round(torrent.progress * 100)}%`)
    }
  })

  // Log progress every 30 seconds
  const progressInterval = setInterval(() => {
    if (torrent.destroyed) {
      clearInterval(progressInterval)
      return
    }
    console.log(`[${label}] Progress: ${Math.round(torrent.progress * 100)}% | Peers: ${torrent.numPeers} | Down: ${formatSpeed(torrent.downloadSpeed)} | Up: ${formatSpeed(torrent.uploadSpeed)}`)
  }, 30000)
}

// Add a torrent (used for both new adds and restoration on startup)
function addTorrentToClient(magnet: string): Promise<any> {
  // Add extra trackers to the magnet for better peer discovery
  const trackerParams = EXTRA_TRACKERS.map(t => `&tr=${encodeURIComponent(t)}`).join('')
  const magnetWithTrackers = magnet.includes('tr=') ? magnet : magnet + trackerParams

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Torrent add timeout (60s) — could not get metadata. The torrent may have 0 seeders.'))
    }, 60000)

    client.add(magnetWithTrackers, { path: TORRENT_DIR }, (torrent: any) => {
      clearTimeout(timeout)
      console.log(`Torrent metadata received: ${torrent.name} (${torrent.infoHash})`)
      resolve(torrent)
    })
  })
}

// Restore torrents from database on startup
async function restoreTorrents() {
  // Support DATABASE_URL env var (e.g. file:/opt/streamvault/db/production.db)
  // or fall back to relative path from TORRENT_DIR
  let DB_PATH: string
  if (process.env.DATABASE_URL) {
    DB_PATH = process.env.DATABASE_URL.replace(/^file:/, '')
  } else {
    DB_PATH = path.resolve(TORRENT_DIR, '../db/production.db')
  }

  if (!fs.existsSync(DB_PATH)) {
    console.log(`No database found at ${DB_PATH}, skipping torrent restoration`)
    return
  }

  console.log(`Restoring torrents from database: ${DB_PATH}`)

  try {
    let rows: any[] = []
    try {
      const output = execSync(`sqlite3 "${DB_PATH}" "SELECT infoHash, name, magnet FROM Torrent ORDER BY addedAt DESC;"`, { encoding: 'utf-8' })
      rows = output.trim().split('\n').filter(Boolean).map(line => {
        const parts = line.split('|')
        return { infoHash: parts[0], name: parts[1], magnet: parts[2] }
      })
    } catch {
      console.log('sqlite3 not available, trying alternative restoration method')
      return
    }

    if (rows.length === 0) {
      console.log('No torrents in database to restore')
      return
    }

    console.log(`Restoring ${rows.length} torrent(s) from database...`)

    for (const row of rows) {
      if (!row.magnet) continue

      try {
        const torrent = await addTorrentToClient(row.magnet)
        const videoFile = getVideoFile(torrent)
        const infoHash = torrent.infoHash

        attachTorrentListeners(torrent, torrent.name.substring(0, 30))

        activeTorrents.set(infoHash, {
          torrent,
          videoFile,
          name: torrent.name,
          infoHash,
          magnet: row.magnet,
          addedAt: Date.now(),
        })

        console.log(`✓ Restored: ${torrent.name} | Peers: ${torrent.numPeers}`)
      } catch (err: any) {
        console.error(`Failed to restore torrent ${row.name}: ${err.message}`)
      }
    }

    console.log(`✓ Restored ${activeTorrents.size} torrent(s)`)
  } catch (err: any) {
    console.error('Torrent restoration error:', err.message)
  }
}

const app = Fastify({ logger: false })

// Fastify 5 only parses application/json by default.
// We need to add a parser for binary uploads (.torrent files).
app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) => {
  done(null, body)
})

// Health check
app.get('/health', async () => {
  return {
    status: 'ok',
    activeTorrents: activeTorrents.size,
    uptime: process.uptime(),
    torrentPort: client.torrentPort || 'unknown',
    dhtReady: dht ? (dht as any).ready : false,
  }
})

// Add torrent by magnet URI
app.post('/torrent/add', async (request: any, reply: any) => {
  const { magnet } = request.body as { magnet?: string }

  if (!magnet) {
    return reply.code(400).send({ error: 'Magnet URI is required' })
  }

  console.log(`Adding magnet: ${magnet.substring(0, 100)}...`)

  // Check if already active
  const existingHash = extractInfoHash(magnet)
  if (existingHash && activeTorrents.has(existingHash)) {
    console.log(`Torrent already active: ${existingHash}`)
    return { infoHash: existingHash, status: 'already_active' }
  }

  try {
    const torrent = await addTorrentToClient(magnet)
    const videoFile = getVideoFile(torrent)
    const infoHash = torrent.infoHash

    attachTorrentListeners(torrent, torrent.name.substring(0, 30))

    activeTorrents.set(infoHash, {
      torrent,
      videoFile,
      name: torrent.name,
      infoHash,
      magnet,
      addedAt: Date.now(),
    })

    console.log(`Torrent added: ${torrent.name} | Video: ${videoFile?.name || 'none'} | Peers: ${torrent.numPeers} | Port: ${client.torrentPort}`)

    const files = torrent.files.map((f: any) => ({
      name: f.name,
      length: f.length,
    }))

    return {
      infoHash,
      name: torrent.name,
      files,
      videoFile: videoFile ? { name: videoFile.name, length: videoFile.length } : null,
      status: 'added',
    }
  } catch (err: any) {
    console.error(`Failed to add torrent: ${err.message}`)
    return reply.code(500).send({ error: err.message })
  }
})

// Add torrent by .torrent file buffer
app.post('/torrent/add-file', async (request: any, reply: any) => {
  const body = request.body as Buffer

  if (!body || !Buffer.isBuffer(body)) {
    return reply.code(400).send({ error: 'Torrent file buffer required' })
  }

  console.log(`Adding .torrent file (${body.length} bytes)`)

  try {
    const torrent = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Torrent add timeout (60s) — could not get metadata. The torrent may have 0 seeders.'))
      }, 60000)

      client.add(body as any, { path: TORRENT_DIR }, (torrent: any) => {
        clearTimeout(timeout)
        console.log(`Torrent metadata received: ${torrent.name} (${torrent.infoHash})`)
        resolve(torrent)
      })
    })

    const videoFile = getVideoFile(torrent)
    const infoHash = torrent.infoHash

    attachTorrentListeners(torrent, torrent.name.substring(0, 30))

    activeTorrents.set(infoHash, {
      torrent,
      videoFile,
      name: torrent.name,
      infoHash,
      magnet: torrent.magnetURI,
      addedAt: Date.now(),
    })

    console.log(`Torrent added: ${torrent.name} | Video: ${videoFile?.name || 'none'} | Peers: ${torrent.numPeers} | Port: ${client.torrentPort}`)

    const files = torrent.files.map((f: any) => ({
      name: f.name,
      length: f.length,
    }))

    return {
      infoHash,
      name: torrent.name,
      files,
      videoFile: videoFile ? { name: videoFile.name, length: videoFile.length } : null,
      status: 'added',
    }
  } catch (err: any) {
    console.error(`Failed to add torrent file: ${err.message}`)
    return reply.code(500).send({ error: err.message })
  }
})

// Stream video file from torrent
app.get('/stream/:infoHash', async (request: any, reply: any) => {
  const { infoHash } = request.params as { infoHash: string }
  const entry = activeTorrents.get(infoHash.toLowerCase())

  if (!entry) {
    return reply.code(404).send({ error: 'Torrent not active' })
  }

  const file = entry.videoFile
  if (!file) {
    return reply.code(404).send({ error: 'No video file in torrent' })
  }

  const fileLength = file.length
  const range = request.headers.range

  reply.raw.on('error', () => {
    // Client disconnected, ignore
  })

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-')
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 1024 * 1024, fileLength - 1)

    if (start >= fileLength || end >= fileLength) {
      reply.code(416).headers({
        'Content-Range': `bytes */${fileLength}`,
      }).send('Range Not Satisfiable')
      return
    }

    reply.code(206).headers({
      'Content-Range': `bytes ${start}-${end}/${fileLength}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': getMimeType(file.name),
    })

    file.createReadStream({ start, end }).pipe(reply.raw)
  } else {
    reply.headers({
      'Content-Length': fileLength,
      'Content-Type': getMimeType(file.name),
      'Accept-Ranges': 'bytes',
    })

    file.createReadStream().pipe(reply.raw)
  }
})

// SSE progress endpoint
app.get('/progress/:infoHash', async (request: any, reply: any) => {
  const { infoHash } = request.params as { infoHash: string }
  const entry = activeTorrents.get(infoHash.toLowerCase())

  if (!entry) {
    return reply.code(404).send({ error: 'Torrent not active' })
  }

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })

  const interval = setInterval(() => {
    const t = entry.torrent
    if (!t) {
      clearInterval(interval)
      return
    }

    const data = JSON.stringify({
      progress: t.progress,
      downloadSpeed: t.downloadSpeed,
      uploadSpeed: t.uploadSpeed,
      peers: t.numPeers,
      ratio: t.ratio,
      timeRemaining: t.timeRemaining,
    })

    reply.raw.write(`data: ${data}\n\n`)
  }, 2000)

  request.raw.on('close', () => {
    clearInterval(interval)
  })
})

// Get torrent progress (one-shot)
app.get('/torrent/status/:infoHash', async (request: any, reply: any) => {
  const { infoHash } = request.params as { infoHash: string }
  const entry = activeTorrents.get(infoHash.toLowerCase())

  if (!entry) {
    return { active: false }
  }

  const t = entry.torrent
  return {
    active: true,
    infoHash: t.infoHash,
    name: t.name,
    progress: t.progress,
    downloadSpeed: t.downloadSpeed,
    uploadSpeed: t.uploadSpeed,
    peers: t.numPeers,
    ratio: t.ratio,
    timeRemaining: t.timeRemaining,
    files: t.files.map((f: any) => ({ name: f.name, length: f.length })),
  }
})

// List active torrents
app.get('/torrent/active', async () => {
  const result = []
  for (const [infoHash, entry] of activeTorrents) {
    const t = entry.torrent
    result.push({
      infoHash,
      name: t.name,
      progress: t.progress,
      downloadSpeed: t.downloadSpeed,
      uploadSpeed: t.uploadSpeed,
      peers: t.numPeers,
      ratio: t.ratio,
      videoFile: entry.videoFile ? { name: entry.videoFile.name, length: entry.videoFile.length } : null,
    })
  }
  return result
})

// Remove torrent
app.delete('/torrent/:infoHash', async (request: any, reply: any) => {
  const { infoHash } = request.params as { infoHash: string }
  const lowerHash = infoHash.toLowerCase()

  if (!activeTorrents.has(lowerHash)) {
    return reply.code(404).send({ error: 'Torrent not active' })
  }

  return new Promise((resolve) => {
    client.remove(lowerHash, () => {
      activeTorrents.delete(lowerHash)
      console.log(`Torrent removed: ${lowerHash}`)
      resolve({ success: true })
    })
  })
})

// Start server
try {
  await app.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`✓ Torrent service running on port ${PORT}`)
  console.log(`✓ Torrent dir: ${TORRENT_DIR}`)
  console.log(`✓ WebTorrent client ready (DHT: enabled, Trackers: enabled, Port: ${client.torrentPort || TORRENT_PORT})`)
  console.log(`✓ Extra trackers: ${EXTRA_TRACKERS.length} added`)

  // Restore torrents from database after a short delay (let DHT bootstrap)
  setTimeout(() => {
    restoreTorrents()
  }, 5000)
} catch (err) {
  console.error('Failed to start torrent service:', err)
  process.exit(1)
}
