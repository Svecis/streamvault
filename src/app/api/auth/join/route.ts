import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { code, label } = body as { code: string; label?: string }

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Invite code is required' },
        { status: 400 }
      )
    }

    // Look up the invite code
    const inviteCode = await db.inviteCode.findUnique({
      where: { code },
    })

    if (!inviteCode || inviteCode.used) {
      return NextResponse.json(
        { error: 'Invalid or already used invite code' },
        { status: 401 }
      )
    }

    // Generate session token
    const sessionToken = crypto.randomUUID()

    // Mark invite code as used and create user in a transaction
    const user = await db.$transaction(async (tx) => {
      await tx.inviteCode.update({
        where: { id: inviteCode.id },
        data: { used: true },
      })

      return tx.user.create({
        data: {
          label: label || null,
          sessionToken,
          inviteCode: code,
        },
      })
    })

    // Create response with user data
    const response = NextResponse.json({
      success: true,
      user: { id: user.id, label: user.label },
    })

    // Set session cookie
    response.cookies.set('sv_session', sessionToken, {
      httpOnly: true,
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      sameSite: 'lax',
    })

    return response
  } catch (error) {
    console.error('Join error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
