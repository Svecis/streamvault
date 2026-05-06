import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { TORRENT_SERVICE_URL, ensureTorrentService } from '@/lib/torrent-client'

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await ensureTorrentService()
    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      // Handle .torrent file upload
      const formData = await request.formData()
      const torrentFile = formData.get('torrent') as File | null
      if (!torrentFile) {
        return NextResponse.json({ error: 'No torrent file provided' }, { status: 400 })
      }

      const buffer = Buffer.from(await torrentFile.arrayBuffer())

      // Forward to torrent service
      const res = await fetch(`${TORRENT_SERVICE_URL}/torrent/add-file`, {
        method: 'POST',
        body: buffer,
        headers: { 'Content-Type': 'application/octet-stream' },
        cache: 'no-store',
      })

      if (!res.ok) {
        const err = await res.text()
        return NextResponse.json({ error: err }, { status: res.status })
      }

      const data = await res.json()

      // Store in database
      await db.torrent.upsert({
        where: { infoHash: data.infoHash },
        update: { name: data.name, magnet: data.magnet || null },
        create: {
          infoHash: data.infoHash,
          name: data.name,
          magnet: data.magnet || null,
          size: data.videoFile?.length || 0,
          addedBy: user.id,
        },
      })

      return NextResponse.json(data)
    } else {
      // Handle magnet link
      const body = await request.json()
      const { magnet } = body

      if (!magnet || !magnet.startsWith('magnet:')) {
        return NextResponse.json({ error: 'Valid magnet URI required' }, { status: 400 })
      }

      // Forward to torrent service
      const res = await fetch(`${TORRENT_SERVICE_URL}/torrent/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet }),
        cache: 'no-store',
      })

      if (!res.ok) {
        const err = await res.text()
        return NextResponse.json({ error: err }, { status: res.status })
      }

      const data = await res.json()

      if (data.status !== 'already_active') {
        // Store in database
        await db.torrent.upsert({
          where: { infoHash: data.infoHash },
          update: { name: data.name, magnet },
          create: {
            infoHash: data.infoHash,
            name: data.name,
            magnet,
            size: data.videoFile?.length || 0,
            addedBy: user.id,
          },
        })
      }

      return NextResponse.json(data)
    }
  } catch (err: any) {
    console.error('Torrent add error:', err)
    const msg = err.cause?.code === 'ECONNREFUSED'
      ? 'Torrent service is not running. Please restart it or contact the admin.'
      : err.message || 'Failed to add torrent'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
