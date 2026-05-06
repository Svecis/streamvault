import Fastify from 'fastify'
import WebTorrent from 'webtorrent'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import ffmpeg from 'fluent-ffmpeg'

// ESM polyfill for require — some dependencies may still use CommonJS require()
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

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

// SSE subscribers: infoHash → Set of reply.raw (writable streams)
const sseClients = new Map<string, Set<any>>()

// Per-torrent progress intervals
const progressIntervals = new Map<string, NodeJS.Timeout>()

// Broadcast progress data to all SSE subscribers for a given infoHash
function broadcastProgress(infoHash: string, data: any) {
  const clients = sseClients.get(infoHash)
  if (!clients || clients.size === 0) return
  const payload = `data: ${JSON.stringify(data)}\n\n`
  for (const raw of clients) {
    try {
      raw.write(payload)
    } catch {
      // Client disconnected, remove from set
      clients.delete(raw)
    }
  }
}

// Start a per-torrent progress interval that broadcasts every 2 seconds
function startProgressBroadcast(infoHash: string, torrent: any) {
  if (progressIntervals.has(infoHash)) return // already running

  const progressInterval = setInterval(() => {
    if (!activeTorrents.has(infoHash)) {
      clearInterval(progressInterval)
      progressIntervals.delete(infoHash)
      return
    }
    const data = {
      infoHash: torrent.infoHash,
      progress: Math.round(torrent.progress * 10000) / 100,
      downloadSpeed: torrent.downloadSpeed,
      uploadSpeed: torrent.uploadSpeed,
      peers: torrent.numPeers,
      ratio: Math.round((torrent.ratio ?? 0) * 100) / 100,
      timeRemaining: torrent.timeRemaining ?? null,
      done: torrent.done ?? false,
    }
    broadcastProgress(infoHash, data)
  }, 2000)

  progressIntervals.set(infoHash, progressInterval)

  torrent.on('destroy', () => {
    clearInterval(progressInterval)
    progressIntervals.delete(infoHash)
    // Close all SSE clients for this torrent
    const clients = sseClients.get(infoHash)
    if (clients) {
      for (const raw of clients) {
        try { raw.end() } catch {}
      }
      clients.clear()
      sseClients.delete(infoHash)
    }
  })
}

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

        startProgressBroadcast(infoHash, torrent)
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

    startProgressBroadcast(infoHash, torrent)
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

    startProgressBroadcast(infoHash, torrent)
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

// ── HLS Job Manager ──────────────────────────────────────
const hlsJobs = new Map<string, { status: string; segmentCount: number }>()

function startHLS(infoHash: string, inputStream: any, outDir: string) {
  if (hlsJobs.get(infoHash)?.status === 'running') return
  fs.mkdirSync(outDir, { recursive: true })
  hlsJobs.set(infoHash, { status: 'running', segmentCount: 0 })

  ffmpeg(inputStream)
    .inputOptions(['-probesize', '50M', '-analyzeduration', '20M'])
    .outputOptions([
      '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
      '-f', 'hls',
      '-hls_time', '4',
      '-hls_list_size', '0',
      '-hls_flags', 'independent_segments+append_list',
      '-hls_segment_type', 'mpegts',
      '-hls_segment_filename', path.join(outDir, 'seg%05d.ts'),
    ])
    .output(path.join(outDir, 'stream.m3u8'))
    .on('progress', (info: any) => {
      const secs = info.timemark?.split(':').reduce((a: number, t: string) => 60 * a + +t, 0) ?? 0
      const job = hlsJobs.get(infoHash)
      if (job) job.segmentCount = Math.floor(secs / 4)
    })
    .on('end', () => hlsJobs.set(infoHash, { status: 'done', segmentCount: 9999 }))
    .on('error', (err: Error) => {
      console.error('[HLS]', err.message)
      hlsJobs.set(infoHash, { status: 'error', segmentCount: 0 })
    })
    .run()
}

function isHLSReady(infoHash: string): boolean {
  const job = hlsJobs.get(infoHash)
  return !!job && (job.status === 'done' || (job.status === 'running' && job.segmentCount >= 2))
}

function hlsCleanup(infoHash: string) {
  const hlsDir = path.join(TORRENT_DIR, infoHash)
  if (fs.existsSync(hlsDir)) {
    fs.rmSync(hlsDir, { recursive: true, force: true })
  }
  hlsJobs.delete(infoHash)
}

// ── Stream video file from torrent ───────────────────────

// Native browser-playable formats (can be streamed raw with Range support)
const NATIVE_FORMATS = ['mp4', 'webm']

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

  const ext = path.extname(file.name).slice(1).toLowerCase()

  // Native formats: stream raw with Range support
  if (NATIVE_FORMATS.includes(ext)) {
    return streamRaw(file, request, reply)
  }

  // Non-native formats (MKV, AVI, MOV, M4V, FLV): FFmpeg remux to fMP4
  return streamTranscoded(file, reply)
})

function streamRaw(file: any, request: any, reply: any) {
  const fileLength = file.length
  const range = request.headers.range

  reply.raw.on('error', () => {
    // Client disconnected, ignore
  })

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-')
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 4 * 1024 * 1024, fileLength - 1)

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
      'Content-Type': 'video/mp4',
    })

    file.createReadStream({ start, end }).pipe(reply.raw)
  } else {
    reply.headers({
      'Content-Length': fileLength,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    })

    file.createReadStream().pipe(reply.raw)
  }
}

function streamTranscoded(file: any, reply: any) {
  const inputStream = file.createReadStream()

  reply.headers({
    'Content-Type': 'video/mp4',
    'Transfer-Encoding': 'chunked',
    'Cache-Control': 'no-cache',
  })

  const ff = ffmpeg(inputStream)
    .inputOptions(['-probesize', '50M', '-analyzeduration', '20M'])
    .outputOptions([
      '-c:v', 'copy',           // copy video — NO re-encode (fast, no CPU cost)
      '-c:a', 'aac',            // transcode audio to AAC (browser-compatible)
      '-b:a', '192k',
      '-ac', '2',               // downmix 5.1/7.1 to stereo
      '-movflags', 'frag_keyframe+empty_moov+faststart+default_base_moof',
      '-f', 'mp4',
    ])
    .on('error', (err: Error) => {
      console.error('[FFmpeg stream]', err.message)
      if (!reply.sent) reply.raw.destroy()
    })

  ff.pipe(reply.raw, { end: true })
  reply.raw.on('close', () => { try { ff.kill('SIGKILL') } catch {} })
}

// ── HLS endpoints ────────────────────────────────────────

// Start HLS transcoding and serve the playlist
app.get('/hls/:infoHash/stream.m3u8', async (request: any, reply: any) => {
  const { infoHash } = request.params as { infoHash: string }
  const entry = activeTorrents.get(infoHash.toLowerCase())

  if (!entry || !entry.videoFile) {
    return reply.code(404).send({ error: 'No video file' })
  }

  if (!hlsJobs.has(infoHash)) {
    startHLS(infoHash, entry.videoFile.createReadStream(), path.join(TORRENT_DIR, infoHash))
  }

  // Wait up to 12 seconds for first 2 segments
  let waited = 0
  while (!isHLSReady(infoHash) && waited < 12000) {
    await new Promise(r => setTimeout(r, 500))
    waited += 500
  }

  const playlistPath = path.join(TORRENT_DIR, infoHash, 'stream.m3u8')
  if (!fs.existsSync(playlistPath)) {
    return reply.code(503).send({ error: 'HLS not ready yet, retry in a few seconds' })
  }

  reply.headers({ 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-cache' })
  reply.send(fs.createReadStream(playlistPath))
})

// Serve individual .ts segments
app.get('/hls/:infoHash/:segment', (request: any, reply: any) => {
  const { infoHash, segment } = request.params as { infoHash: string; segment: string }
  if (!segment.endsWith('.ts')) return reply.code(400).send()

  const segPath = path.join(TORRENT_DIR, infoHash, segment)
  if (!fs.existsSync(segPath)) return reply.code(404).send()

  reply.headers({ 'Content-Type': 'video/mp2t' })
  reply.send(fs.createReadStream(segPath))
})

// HLS status endpoint
app.get('/hls/:infoHash/status', (request: any, reply: any) => {
  const { infoHash } = request.params as { infoHash: string }
  const job = hlsJobs.get(infoHash)
  if (!job) return { active: false }
  return { active: true, status: job.status, segmentCount: job.segmentCount }
})

// SSE progress endpoint — subscribes to the per-torrent broadcast
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
    'X-Accel-Buffering': 'no',
  })
  reply.raw.write('\n') // initial flush to open the connection

  // Register this client as an SSE subscriber
  if (!sseClients.has(infoHash)) sseClients.set(infoHash, new Set())
  sseClients.get(infoHash)!.add(reply.raw)

  // Send immediate snapshot so client doesn't wait 2s for first data
  const t = entry.torrent
  const snapshot = JSON.stringify({
    infoHash: t.infoHash,
    progress: Math.round(t.progress * 10000) / 100,
    downloadSpeed: t.downloadSpeed,
    uploadSpeed: t.uploadSpeed,
    peers: t.numPeers,
    ratio: Math.round((t.ratio ?? 0) * 100) / 100,
    timeRemaining: t.timeRemaining ?? null,
    done: t.done ?? false,
  })
  reply.raw.write(`data: ${snapshot}\n\n`)

  // Unregister on disconnect
  request.raw.on('close', () => {
    const clients = sseClients.get(infoHash)
    if (clients) {
      clients.delete(reply.raw)
      if (clients.size === 0) sseClients.delete(infoHash)
    }
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

  const entry = activeTorrents.get(lowerHash)

  // Destroy the torrent first — this triggers the 'destroy' event
  // which clears the progress interval and closes SSE clients
  if (entry?.torrent && !entry.torrent.destroyed) {
    try { entry.torrent.destroy() } catch {}
  }

  return new Promise((resolve) => {
    client.remove(lowerHash, () => {
      activeTorrents.delete(lowerHash)
      hlsCleanup(lowerHash)
      // Clean up any remaining SSE state
      sseClients.delete(lowerHash)
      const pInterval = progressIntervals.get(lowerHash)
      if (pInterval) {
        clearInterval(pInterval)
        progressIntervals.delete(lowerHash)
      }
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
