export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ infoHash: string }> }
) {
  const { infoHash } = await params

  let upstream: Response
  try {
    upstream = await fetch(`http://localhost:3001/progress/${infoHash}`, {
      headers: { Accept: 'text/event-stream', Connection: 'keep-alive' },
    })
  } catch {
    return new Response('Torrent service unavailable', { status: 503 })
  }

  if (!upstream.ok || !upstream.body) {
    return new Response('Not found', { status: 404 })
  }

  // Forward the SSE stream byte-for-byte to the browser.
  // Do NOT buffer, do NOT parse, do NOT re-emit on a timer.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
