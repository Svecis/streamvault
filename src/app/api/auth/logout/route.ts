import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request)

    if (user) {
      // Clear session token from the user in DB
      await db.user.update({
        where: { id: user.id },
        data: { sessionToken: null },
      })
    }

    // Create response and clear the cookie
    const response = NextResponse.json({ success: true })

    response.cookies.set('sv_session', '', {
      httpOnly: true,
      path: '/',
      maxAge: 0, // Immediately expire
      sameSite: 'lax',
    })

    return response
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
