import { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { TORRENT_SERVICE_URL } from '@/lib/torrent-client'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ infoHash: string }> }
) {
  const user = await getSessionUser(request)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { infoHash } = await params

  try {
    const url = `${TORRENT_SERVICE_URL}/progress/${infoHash}`

    // Forward SSE stream from torrent service
    const res = await fetch(url)

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'Torrent not active' }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Return as SSE
    return new Response(res.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
