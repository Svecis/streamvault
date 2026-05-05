import { NextRequest, NextResponse } from 'next/server'
import { writeFile, readFile } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'
import { convertToVtt, detectSubtitleFormat } from '@/lib/subtitle'

const UPLOADS_DIR = '/home/z/my-project/uploads'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params

    const formData = await request.formData()
    const subtitleFile = formData.get('subtitle') as File | null

    if (!subtitleFile) {
      return NextResponse.json(
        { error: 'No subtitle file provided' },
        { status: 400 }
      )
    }

    const filename = subtitleFile.name
    const format = detectSubtitleFormat(filename)

    if (!format) {
      return NextResponse.json(
        { error: 'Unsupported subtitle format. Supported: .srt, .vtt, .ass, .ssa' },
        { status: 400 }
      )
    }

    // Read file content
    const arrayBuffer = await subtitleFile.arrayBuffer()
    const content = Buffer.from(arrayBuffer).toString('utf-8')

    // Convert to VTT
    const vttContent = convertToVtt(content, format)

    // Ensure uploads directory exists
    const uploadsPath = UPLOADS_DIR
    try {
      await readFile(uploadsPath)
    } catch {
      // Directory might not exist, but we'll try to write anyway
    }

    // Save VTT file
    const vttPath = path.join(uploadsPath, `${videoId}.vtt`)
    await writeFile(vttPath, vttContent, 'utf-8')

    // Update File record in DB
    try {
      await db.file.update({
        where: { id: videoId },
        data: { hasSubtitle: true },
      })
    } catch {
      // File record may not exist, that's okay
    }

    // Also update Torrent records if videoId matches an infoHash
    try {
      await db.torrent.updateMany({
        where: { infoHash: videoId },
        data: {}, // No explicit flag field, but we could add one
      })
    } catch {
      // Torrent may not exist, that's okay
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Subtitle upload error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process subtitle' },
      { status: 500 }
    )
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params
    const vttPath = path.join(UPLOADS_DIR, `${videoId}.vtt`)

    const fileContent = await readFile(vttPath, 'utf-8')

    return new NextResponse(fileContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/vtt',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Subtitle file not found' },
      { status: 404 }
    )
  }
}
