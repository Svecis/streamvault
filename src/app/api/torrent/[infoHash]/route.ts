import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { TORRENT_SERVICE_URL } from '@/lib/torrent-client'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ infoHash: string }> }
) {
  const user = await getSessionUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { infoHash } = await params

  try {
    // Remove from torrent service
    await fetch(`${TORRENT_SERVICE_URL}/torrent/${infoHash}`, { method: 'DELETE' })

    // Remove from database
    await db.torrent.deleteMany({ where: { infoHash } })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
