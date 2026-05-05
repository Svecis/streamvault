import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { execSync } from 'child_process'
import { existsSync } from 'fs'

function checkAdminAuth(request: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'
  const providedPassword = request.headers.get('x-admin-password')
  return providedPassword === adminPassword
}

function getDirectorySize(dirPath: string): number {
  if (!existsSync(dirPath)) return 0
  try {
    const output = execSync(`du -sb "${dirPath}" 2>/dev/null`, {
      encoding: 'utf-8',
    }).trim()
    const size = parseInt(output.split(/\s+/)[0], 10)
    return isNaN(size) ? 0 : size
  } catch {
    return 0
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export async function GET(request: NextRequest) {
  try {
    if (!checkAdminAuth(request)) {
      return NextResponse.json(
        { error: 'Unauthorized. Invalid admin password.' },
        { status: 401 }
      )
    }

    // Get counts
    const [totalUsers, activeSessions, totalTorrents, totalFiles] =
      await Promise.all([
        db.user.count(),
        db.user.count({ where: { sessionToken: { not: null } } }),
        db.torrent.count(),
        db.file.count(),
      ])

    // Calculate disk usage
    const uploadsSize = getDirectorySize('/home/z/my-project/uploads')
    const torrentsSize = getDirectorySize('/home/z/my-project/torrents')
    const totalDiskUsage = uploadsSize + torrentsSize

    // Get users list
    const users = await db.user.findMany({
      select: {
        id: true,
        label: true,
        lastSeen: true,
        inviteCode: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    // Get invite codes list
    const inviteCodes = await db.inviteCode.findMany({
      select: {
        id: true,
        code: true,
        used: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      totalUsers,
      activeSessions,
      totalTorrents,
      totalFiles,
      diskUsage: {
        uploads: uploadsSize,
        torrents: torrentsSize,
        total: totalDiskUsage,
        formatted: formatBytes(totalDiskUsage),
      },
      users,
      inviteCodes,
    })
  } catch (error) {
    console.error('Admin stats error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}
