import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

const TORRENT_SERVICE = 'http://127.0.0.1:3001'

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
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
      const res = await fetch(`${TORRENT_SERVICE}/torrent/add-file`, {
        method: 'POST',
        body: buffer,
        headers: { 'Content-Type': 'application/octet-stream' },
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
      const res = await fetch(`${TORRENT_SERVICE}/torrent/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet }),
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
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
