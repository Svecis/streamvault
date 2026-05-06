import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import fs from 'fs'
import path from 'path'

const UPLOADS_DIR = '/home/z/my-project/uploads'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Look up file metadata from database
    const fileRecord = await db.file.findUnique({
      where: { id },
    })

    if (!fileRecord) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      )
    }

    const filePath = path.join(UPLOADS_DIR, fileRecord.filename)

    // Check file exists on disk
    let fileStat: fs.Stats
    try {
      fileStat = fs.statSync(filePath)
    } catch {
      return NextResponse.json(
        { error: 'File not found on disk' },
        { status: 404 }
      )
    }

    const fileSize = fileStat.size

    // Parse Range header
    const rangeHeader = request.headers.get('range')

    if (rangeHeader) {
      // Parse range: "bytes=start-end"
      const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/)
      if (!rangeMatch) {
        return NextResponse.json(
          { error: 'Invalid Range header' },
          { status: 400 }
        )
      }

      const start = parseInt(rangeMatch[1], 10)
      const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : fileSize - 1

      // Validate range
      if (start >= fileSize || end >= fileSize || start > end) {
        return new Response(null, {
          status: 416, // Range Not Satisfiable
          headers: {
            'Content-Range': `bytes */${fileSize}`,
          },
        })
      }

      const contentLength = end - start + 1

      // Create readable stream for the requested range
      const stream = fs.createReadStream(filePath, { start, end })
      const readableStream = new ReadableStream({
        start(controller) {
          stream.on('data', (chunk: Buffer) => {
            controller.enqueue(
              new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
            )
          })
          stream.on('end', () => {
            controller.close()
          })
          stream.on('error', (err: Error) => {
            controller.error(err)
          })
        },
      })

      return new Response(readableStream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Content-Length': contentLength.toString(),
          'Content-Type': fileRecord.mimeType,
          'Accept-Ranges': 'bytes',
          'X-Accel-Buffering': 'no',
          'Cache-Control': 'no-cache, no-transform',
        },
      })
    }

    // No Range header - return full file
    const stream = fs.createReadStream(filePath)
    const readableStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: Buffer) => {
          controller.enqueue(
            new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
          )
        })
        stream.on('end', () => {
          controller.close()
        })
        stream.on('error', (err: Error) => {
          controller.error(err)
        })
      },
    })

    return new Response(readableStream, {
      status: 200,
      headers: {
        'Content-Length': fileSize.toString(),
        'Content-Type': fileRecord.mimeType,
        'Accept-Ranges': 'bytes',
        'X-Accel-Buffering': 'no',
        'Cache-Control': 'no-cache, no-transform',
      },
    })
  } catch (error) {
    console.error('File serve error:', error)
    return NextResponse.json(
      { error: 'Failed to serve file' },
      { status: 500 }
    )
  }
}
