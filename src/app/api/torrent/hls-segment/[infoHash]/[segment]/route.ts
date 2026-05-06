import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { TORRENT_SERVICE_URL, ensureTorrentService } from '@/lib/torrent-client'

export const dynamic = 'force-dynamic'

/**
 * Proxy HLS .ts segment requests to torrent service.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ infoHash: string; segment: string }> }
) {
  const user = await getSessionUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { infoHash, segment } = await params

  // Only allow .ts segment files
  if (!segment.endsWith('.ts')) {
    return NextResponse.json({ error: 'Invalid segment' }, { status: 400 })
  }

  try {
    await ensureTorrentService()
    const url = `${TORRENT_SERVICE_URL}/hls/${infoHash}/${segment}`

    const res = await fetch(url, { cache: 'no-store' })

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Segment not available' },
        { status: res.status }
      )
    }

    const responseHeaders = new Headers()
    responseHeaders.set('Content-Type', 'video/mp2t')
    responseHeaders.set('Cache-Control', 'no-cache')

    return new Response(res.body, {
      status: 200,
      headers: responseHeaders,
    })
  } catch (err: any) {
    console.error('HLS segment error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
