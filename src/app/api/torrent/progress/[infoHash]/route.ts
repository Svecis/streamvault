import { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { TORRENT_SERVICE_URL, ensureTorrentService } from '@/lib/torrent-client'

export const dynamic = 'force-dynamic'

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

  // Instead of proxying the SSE stream (which Next.js buffers),
  // we poll the torrent service directly and emit our own SSE events.
  const encoder = new TextEncoder()

  // Ensure torrent service is running before starting SSE
  await ensureTorrentService()

  const stream = new ReadableStream({
    async start(controller) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(
            `${TORRENT_SERVICE_URL}/torrent/status/${infoHash}`,
            { cache: 'no-store' }
          )
          if (res.ok) {
            const data = await res.json()
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
            )
          } else {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ active: false })}\n\n`)
            )
          }
        } catch {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ active: false })}\n\n`)
          )
        }
      }, 2000)

      // Cleanup when client disconnects
      request.signal.addEventListener('abort', () => {
        clearInterval(interval)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
