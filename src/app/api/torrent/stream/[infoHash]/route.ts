import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { TORRENT_SERVICE_URL, ensureTorrentService } from '@/lib/torrent-client'

export const dynamic = 'force-dynamic'

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

    // Forward all request headers that matter for streaming
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

    // Forward all response headers that matter for video streaming
    const responseHeaders = new Headers()

    // Copy streaming-critical headers from upstream
    for (const key of [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'transfer-encoding',
    ]) {
      const val = res.headers.get(key)
      if (val) responseHeaders.set(key, val)
    }

    // Tell Caddy/NGINX to never buffer this response
    responseHeaders.set('X-Accel-Buffering', 'no')
    responseHeaders.set('Cache-Control', 'no-cache, no-transform')

    const status = responseHeaders.has('Content-Range') ? 206 : 200

    return new Response(res.body, {
      status,
      headers: responseHeaders,
    })
  } catch (err: any) {
    console.error('Stream error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
