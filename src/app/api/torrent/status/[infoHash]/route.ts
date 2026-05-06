import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { TORRENT_SERVICE_URL } from '@/lib/torrent-client'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ infoHash: string }> }
) {
  const user = await getSessionUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { infoHash } = await params

  try {
    const res = await fetch(`${TORRENT_SERVICE_URL}/torrent/status/${infoHash}`)
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ active: false, error: err.message }, { status: 500 })
  }
}
