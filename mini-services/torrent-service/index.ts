import Fastify from 'fastify'
import WebTorrent from 'webtorrent'
import path from 'path'
import fs from 'fs'

const PORT = 3001
const TORRENT_DIR = path.resolve(process.env.TORRENT_DIR || '../../torrents')

// Ensure torrent directory exists
if (!fs.existsSync(TORRENT_DIR)) {
  fs.mkdirSync(TORRENT_DIR, { recursive: true })
}

// Single global WebTorrent client
const client = new WebTorrent({
  maxConns: 55,
  dht: true,
  tracker: true,
})

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

const app = Fastify({ logger: false })

// Health check
app.get('/health', async () => {
  return { status: 'ok', activeTorrents: activeTorrents.size }
})

// Add torrent by magnet URI
app.post('/torrent/add', async (request: any, reply: any) => {
  const { magnet } = request.body as { magnet?: string }

  if (!magnet) {
    return reply.code(400).send({ error: 'Magnet URI is required' })
  }

  // Check if already active
  const infoHashMatch = magnet.match(/btih:([a-fA-F0-9]{40})/)
  if (infoHashMatch) {
    const existingHash = infoHashMatch[1].toLowerCase()
    if (activeTorrents.has(existingHash)) {
      return { infoHash: existingHash, status: 'already_active' }
    }
  }

  try {
    const torrent = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Torrent add timeout'))
      }, 60000)

      client.add(magnet, { path: TORRENT_DIR }, (torrent: any) => {
        clearTimeout(timeout)
        resolve(torrent)
      })

      client.on('error', (err: Error) => {
        clearTimeout(timeout)
        reject(err)
      })
    })

    const videoFile = getVideoFile(torrent)
    const infoHash = torrent.infoHash

    activeTorrents.set(infoHash, {
      torrent,
      videoFile,
      name: torrent.name,
      infoHash,
      magnet,
      addedAt: Date.now(),
    })

    // Store file list
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
    return reply.code(500).send({ error: err.message })
  }
})

// Add torrent by .torrent file buffer
app.post('/torrent/add-file', async (request: any, reply: any) => {
  const body = request.body as Buffer

  if (!body || !Buffer.isBuffer(body)) {
    return reply.code(400).send({ error: 'Torrent file buffer required' })
  }

  try {
    const torrent = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Torrent add timeout'))
      }, 60000)

      client.add(body as any, { path: TORRENT_DIR }, (torrent: any) => {
        clearTimeout(timeout)
        resolve(torrent)
      })

      client.on('error', (err: Error) => {
        clearTimeout(timeout)
        reject(err)
      })
    })

    const videoFile = getVideoFile(torrent)
    const infoHash = torrent.infoHash

    activeTorrents.set(infoHash, {
      torrent,
      videoFile,
      name: torrent.name,
      infoHash,
      magnet: torrent.magnetURI,
      addedAt: Date.now(),
    })

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
      resolve({ success: true })
    })
  })
})

// Start server
try {
  await app.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`Torrent service running on port ${PORT}`)
} catch (err) {
  console.error('Failed to start torrent service:', err)
  process.exit(1)
}
