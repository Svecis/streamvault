import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { TORRENT_SERVICE_URL, ensureTorrentService } from '@/lib/torrent-client'

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
    await ensureTorrentService()
    const url = `${TORRENT_SERVICE_URL}/stream/${infoHash}`
    const headers: Record<string, string> = {}

    const range = request.headers.get('range')
    if (range) {
      headers['Range'] = range
    }

    const res = await fetch(url, { headers, cache: 'no-store' })

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Stream not available' },
        { status: res.status }
      )
    }

    const responseHeaders = new Headers()
    const contentType = res.headers.get('content-type')
    const contentLength = res.headers.get('content-length')
    const contentRange = res.headers.get('content-range')
    const acceptRanges = res.headers.get('accept-ranges')

    if (contentType) responseHeaders.set('Content-Type', contentType)
    if (contentLength) responseHeaders.set('Content-Length', contentLength)
    if (contentRange) responseHeaders.set('Content-Range', contentRange)
    if (acceptRanges) responseHeaders.set('Accept-Ranges', acceptRanges)

    const status = contentRange ? 206 : 200

    return new Response(res.body, {
      status,
      headers: responseHeaders,
    })
  } catch (err: any) {
    console.error('Stream error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
