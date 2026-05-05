import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { nanoid } from 'nanoid'
import { writeFile } from 'fs/promises'
import path from 'path'
import { stat, mkdir } from 'fs/promises'
import { getSessionUser } from '@/lib/auth'

const UPLOADS_DIR = '/home/z/my-project/uploads'

const ALLOWED_EXTENSIONS = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v']

const MIME_MAP: Record<string, string> = {
  mp4: 'video/mp4',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/x-m4v',
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Extract extension from original filename
    const originalName = file.name
    const ext = originalName.split('.').pop()?.toLowerCase()

    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` },
        { status: 400 }
      )
    }

    // Ensure uploads directory exists
    try {
      await stat(UPLOADS_DIR)
    } catch {
      await mkdir(UPLOADS_DIR, { recursive: true })
    }

    // Generate unique filename
    const filename = `${nanoid()}.${ext}`
    const filePath = path.join(UPLOADS_DIR, filename)

    // Read file and write to disk
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    await writeFile(filePath, buffer)

    // Determine MIME type
    const mimeType = MIME_MAP[ext] || file.type || 'application/octet-stream'

    // Create database record
    const fileRecord = await db.file.create({
      data: {
        id: nanoid(),
        filename,
        originalName,
        size: file.size,
        mimeType,
        addedBy: user.id,
      },
    })

    return NextResponse.json({
      id: fileRecord.id,
      originalName: fileRecord.originalName,
      size: fileRecord.size,
      mimeType: fileRecord.mimeType,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 }
    )
  }
}
