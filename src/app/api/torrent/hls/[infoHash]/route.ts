import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { TORRENT_SERVICE_URL, ensureTorrentService } from '@/lib/torrent-client'

export const dynamic = 'force-dynamic'

/**
 * Proxy HLS playlist request to torrent service.
 * Rewrites segment URLs in the m3u8 playlist to point through the Next.js proxy
 * so that the browser can access them (torrent service is not directly accessible).
 */
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
    // The torrent service generates URLs like: seg00001.ts
    // We need them to be: /api/torrent/hls-segment/{infoHash}/seg00001.ts
    playlist = playlist.replace(
      /^(seg\d+\.ts)$/gm,
      `/api/torrent/hls-segment/${infoHash}/$1`
    )

    const responseHeaders = new Headers()
    responseHeaders.set('Content-Type', 'application/vnd.apple.mpegurl')
    responseHeaders.set('Cache-Control', 'no-cache')

    return new Response(playlist, {
      status: 200,
      headers: responseHeaders,
    })
  } catch (err: any) {
    console.error('HLS playlist error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
