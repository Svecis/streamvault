import { NextRequest, NextResponse } from 'next/server'
import { TORRENT_SERVICE_URL, ensureTorrentService } from '@/lib/torrent-client'

export const dynamic = 'force-dynamic'

/**
 * Proxy HLS playlist request to torrent service.
 * No auth check — hls.js makes XHR requests without session cookies.
 * The infoHash itself acts as a unique/secret identifier.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ infoHash: string }> }
) {
  const { infoHash } = await params

  try {
    await ensureTorrentService()
    const url = `${TORRENT_SERVICE_URL}/hls/${infoHash}/stream.m3u8`

    const res = await fetch(url, { cache: 'no-store' })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: text || 'HLS not available' },
        { status: res.status }
      )
    }

    // Read the playlist text and rewrite segment URLs to go through our proxy
    let playlist = await res.text()

    // Replace relative segment URLs (seg00001.ts) with proxied URLs
    playlist = playlist.replace(
      /^(seg\d+\.ts)$/gm,
      `/api/torrent/hls-segment/${infoHash}/$1`
    )

    const responseHeaders = new Headers()
    responseHeaders.set('Content-Type', 'application/vnd.apple.mpegurl')
    responseHeaders.set('Cache-Control', 'no-cache')
    responseHeaders.set('X-Accel-Buffering', 'no')

    return new Response(playlist, {
      status: 200,
      headers: responseHeaders,
    })
  } catch (err: any) {
    console.error('HLS playlist error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
