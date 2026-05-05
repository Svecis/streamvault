import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

function checkAdminAuth(request: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'
  const providedPassword = request.headers.get('x-admin-password')
  return providedPassword === adminPassword
}

const TORRENT_SERVICE_URL = 'http://localhost:3001'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ infoHash: string }> }
) {
  try {
    if (!checkAdminAuth(request)) {
      return NextResponse.json(
        { error: 'Unauthorized. Invalid admin password.' },
        { status: 401 }
      )
    }

    const { infoHash } = await params

    // Find the torrent record
    const torrent = await db.torrent.findUnique({
      where: { infoHash },
    })

    if (!torrent) {
      return NextResponse.json(
        { error: 'Torrent not found' },
        { status: 404 }
      )
    }

    // Call torrent service to remove active torrent
    try {
      await fetch(`${TORRENT_SERVICE_URL}/torrent/${infoHash}`, {
        method: 'DELETE',
      })
    } catch {
      // Torrent service may not be running or torrent not active
      console.warn(`Could not reach torrent service to remove ${infoHash}`)
    }

    // Delete from database
    await db.torrent.delete({
      where: { infoHash },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Torrent deletion error:', error)
    return NextResponse.json(
      { error: 'Failed to delete torrent' },
      { status: 500 }
    )
  }
}
