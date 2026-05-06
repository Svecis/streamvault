import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { TORRENT_SERVICE_URL, ensureTorrentService } from '@/lib/torrent-client'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const torrents = await db.torrent.findMany({
      orderBy: { addedAt: 'desc' },
      include: { user: { select: { label: true } } },
    })

    // Ensure torrent service is running, then merge live progress
    let liveData: any[] = []
    try {
      await ensureTorrentService()
      const liveRes = await fetch(`${TORRENT_SERVICE_URL}/torrent/active`, {
        signal: AbortSignal.timeout(3000),
        cache: 'no-store',
      })
      if (liveRes.ok) {
        liveData = await liveRes.json()
      }
    } catch {
      // Torrent service unreachable, return DB data without live stats
    }

    // Create a map of live data for quick lookup
    const liveMap = new Map<string, any>()
    for (const lt of liveData) {
      liveMap.set(lt.infoHash.toLowerCase(), lt)
    }

    // Merge DB data with live progress
    const merged = torrents.map(t => {
      const live = liveMap.get(t.infoHash.toLowerCase())
      if (live) {
        return {
          ...t,
          progress: live.progress,
          downloadSpeed: live.downloadSpeed,
          uploadSpeed: live.uploadSpeed,
          peers: live.peers,
          ratio: live.ratio,
        }
      }
      return t
    })

    return NextResponse.json({ torrents: merged })
  } catch (err) {
    console.error('List torrents error:', err)
    return NextResponse.json({ torrents: [] })
  }
}
