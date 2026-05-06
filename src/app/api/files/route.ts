import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request)
  if (!user) {
    return NextResponse.json({ files: [] })
  }

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
    return NextResponse.json({ files: [] })
  }
}
