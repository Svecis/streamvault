import { NextRequest, NextResponse } from 'next/server'
import { unlink } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'

function checkAdminAuth(request: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'
  const providedPassword = request.headers.get('x-admin-password')
  return providedPassword === adminPassword
}

const UPLOADS_DIR = '/home/z/my-project/uploads'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!checkAdminAuth(request)) {
      return NextResponse.json(
        { error: 'Unauthorized. Invalid admin password.' },
        { status: 401 }
      )
    }

    const { id } = await params

    // Find the file record
    const fileRecord = await db.file.findUnique({
      where: { id },
    })

    if (!fileRecord) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      )
    }

    // Delete file from disk
    try {
      const filePath = path.join(UPLOADS_DIR, fileRecord.filename)
      await unlink(filePath)
    } catch {
      // File may not exist on disk, continue with DB deletion
    }

    // Also delete subtitle file if exists
    if (fileRecord.hasSubtitle) {
      try {
        const subtitlePath = path.join(UPLOADS_DIR, `${id}.vtt`)
        await unlink(subtitlePath)
      } catch {
        // Subtitle file may not exist, continue
      }
    }

    // Delete from database
    await db.file.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('File deletion error:', error)
    return NextResponse.json(
      { error: 'Failed to delete file' },
      { status: 500 }
    )
  }
}
