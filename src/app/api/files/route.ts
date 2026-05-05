import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const files = await db.file.findMany({
      orderBy: {
        addedAt: 'desc',
      },
      select: {
        id: true,
        originalName: true,
        size: true,
        mimeType: true,
        hasSubtitle: true,
        addedAt: true,
      },
    })

    return NextResponse.json({ files })
  } catch (error) {
    console.error('List files error:', error)
    return NextResponse.json(
      { error: 'Failed to list files' },
      { status: 500 }
    )
  }
}
