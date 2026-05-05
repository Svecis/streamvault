import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { nanoid } from 'nanoid'

function checkAdminAuth(request: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'
  const providedPassword = request.headers.get('x-admin-password')
  return providedPassword === adminPassword
}

export async function POST(request: NextRequest) {
  try {
    if (!checkAdminAuth(request)) {
      return NextResponse.json(
        { error: 'Unauthorized. Invalid admin password.' },
        { status: 401 }
      )
    }

    // Generate a unique invite code
    const code = nanoid(8)

    // Store in database
    const inviteCode = await db.inviteCode.create({
      data: { code },
    })

    return NextResponse.json({
      code: inviteCode.code,
      link: `/join?code=${inviteCode.code}`,
    })
  } catch (error) {
    console.error('Invite code generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate invite code' },
      { status: 500 }
    )
  }
}
