import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const torrents = await db.torrent.findMany({
    orderBy: { addedAt: 'desc' },
    include: { user: { select: { label: true } } },
  })

  return NextResponse.json({ torrents })
}
