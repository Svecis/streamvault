import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

function checkAdminAuth(request: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'
  const providedPassword = request.headers.get('x-admin-password')
  return providedPassword === adminPassword
}

export async function GET(request: NextRequest) {
  try {
    if (!checkAdminAuth(request)) {
      return NextResponse.json(
        { error: 'Unauthorized. Invalid admin password.' },
        { status: 401 }
      )
    }

    const users = await db.user.findMany({
      select: {
        id: true,
        label: true,
        sessionToken: true,
        inviteCode: true,
        createdAt: true,
        lastSeen: true,
        torrents: {
          select: {
            id: true,
            name: true,
            size: true,
            addedAt: true,
          },
          orderBy: { addedAt: 'desc' },
        },
        files: {
          select: {
            id: true,
            originalName: true,
            size: true,
            addedAt: true,
          },
          orderBy: { addedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ users })
  } catch (error) {
    console.error('Admin users error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}
