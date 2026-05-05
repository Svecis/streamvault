import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Update lastSeen timestamp
    await db.user.update({
      where: { id: user.id },
      data: { lastSeen: new Date() },
    })

    return NextResponse.json({
      user: {
        id: user.id,
        label: user.label,
        inviteCode: user.inviteCode,
        createdAt: user.createdAt,
        lastSeen: new Date(),
        sessionToken: user.sessionToken,
      },
    })
  } catch (error) {
    console.error('Session error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
