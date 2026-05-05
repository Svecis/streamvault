'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  Copy,
  Plus,
  Trash2,
  Users,
  HardDrive,
  Film,
  FileVideo,
} from 'lucide-react'
import { useAppStore } from '@/store/app-store'

// ── Helpers ──────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function truncateHash(hash: string): string {
  if (!hash) return '—'
  if (hash.length <= 12) return hash
  return hash.slice(0, 8) + '…' + hash.slice(-4)
}

// ── Types ────────────────────────────────────────────────

interface Stats {
  totalUsers: number
  activeSessions: number
  totalTorrents: number
  totalFiles: number
  diskUsage: {
    uploads: number
    torrents: number
    total: number
    formatted: string
  }
}

interface UserRow {
  id: number
  label: string | null
  sessionToken: string | null
  inviteCode: string | null
  createdAt: string
  lastSeen: string | null
}

interface TorrentRow {
  id: number
  infoHash: string
  name: string
  magnet: string | null
  size: number
  addedBy: number | null
  addedAt: string
}

interface FileRow {
  id: string
  originalName: string
  size: number
  mimeType: string
  hasSubtitle: boolean
  addedAt: string
}

// ── Component ────────────────────────────────────────────

export function AdminView() {
  const { setView, isAdmin, setIsAdmin } = useAppStore()

  // Auth
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  // Data
  const [stats, setStats] = useState<Stats | null>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [torrents, setTorrents] = useState<TorrentRow[]>([])
  const [files, setFiles] = useState<FileRow[]>([])

  // Invite
  const [inviteCode, setInviteCode] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  // Loading / errors
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState('')
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null)

  // ── Fetch all data ───────────────────────────────────

  const fetchAllData = useCallback(
    async (pw: string) => {
      setDataLoading(true)
      setDataError('')
      try {
        const headers = { 'x-admin-password': pw }

        const [statsRes, usersRes, torrentsRes, filesRes] = await Promise.all([
          fetch('/api/admin/stats', { headers }),
          fetch('/api/admin/users', { headers }),
          fetch('/api/torrent/list', { headers }),
          fetch('/api/files', { headers }),
        ])

        if (!statsRes.ok || !usersRes.ok) {
          throw new Error('Failed to fetch admin data')
        }

        const statsJson = await statsRes.json()
        const usersJson = await usersRes.json()

        setStats(statsJson)
        setUsers(usersJson.users || [])

        if (torrentsRes.ok) {
          const tJson = await torrentsRes.json()
          setTorrents(tJson.torrents || [])
        }

        if (filesRes.ok) {
          const fJson = await filesRes.json()
          setFiles(fJson.files || [])
        }
      } catch (err) {
        setDataError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setDataLoading(false)
      }
    },
    []
  )

  // ── Auth ─────────────────────────────────────────────

  const handleAuth = async () => {
    setAuthLoading(true)
    setAuthError('')
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { 'x-admin-password': password },
      })
      if (res.ok) {
        setAuthed(true)
        setIsAdmin(true)
        await fetchAllData(password)
      } else {
        setAuthError('Invalid admin password')
        setIsAdmin(false)
      }
    } catch {
      setAuthError('Authentication failed')
      setIsAdmin(false)
    } finally {
      setAuthLoading(false)
    }
  }

  // If already marked as admin in store, auto-authenticate
  useEffect(() => {
    if (isAdmin && !authed) {
      // Try with stored password if available
      const stored = sessionStorage.getItem('sv_admin_pw')
      if (stored) {
        setPassword(stored)
        setAuthed(true)
        fetchAllData(stored)
      }
    }
  }, [])

  // Store password in sessionStorage when authenticated
  useEffect(() => {
    if (authed && password) {
      sessionStorage.setItem('sv_admin_pw', password)
    }
  }, [authed, password])

  // ── Generate invite ──────────────────────────────────

  const handleGenerateInvite = async () => {
    setInviteLoading(true)
    try {
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'x-admin-password': password },
      })
      if (res.ok) {
        const json = await res.json()
        setInviteCode(json.code)
        setInviteLink(window.location.origin + json.link)
        setCopied(false)
      }
    } catch {
      // silent
    } finally {
      setInviteLoading(false)
    }
  }

  // ── Copy link ────────────────────────────────────────

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  // ── Delete torrent ───────────────────────────────────

  const handleDeleteTorrent = async (infoHash: string) => {
    setDeleteLoading(infoHash)
    try {
      await fetch(`/api/admin/torrents/${infoHash}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': password },
      })
      await fetchAllData(password)
    } catch {
      // silent
    } finally {
      setDeleteLoading(null)
    }
  }

  // ── Delete file ──────────────────────────────────────

  const handleDeleteFile = async (id: string) => {
    setDeleteLoading(id)
    try {
      await fetch(`/api/admin/files/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': password },
      })
      await fetchAllData(password)
    } catch {
      // silent
    } finally {
      setDeleteLoading(null)
    }
  }

  // ── Render ───────────────────────────────────────────

  return (
    <div
      className="min-h-screen p-4 md:p-8"
      style={{ background: '#0d0d0d', color: '#e8e8e8', fontFamily: 'system-ui' }}
    >
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <button
          onClick={() => setView('library')}
          className="flex items-center gap-1 text-sm transition-colors duration-200 hover:text-[#e8552a]"
          style={{ color: '#666' }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Library
        </button>
        <h1 className="text-xl font-semibold" style={{ color: '#e8e8e8' }}>
          Admin Panel
        </h1>
      </div>

      {/* ── Auth Gate ─────────────────────────────────── */}
      {!authed ? (
        <div
          className="mx-auto max-w-sm rounded-lg border p-6"
          style={{ background: '#141414', borderColor: '#222' }}
        >
          <h2 className="mb-4 text-lg font-medium">Admin Login</h2>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="Admin password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setAuthError('')
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
              className="flex-1 rounded border px-3 py-2 text-sm outline-none transition-colors duration-200"
              style={{
                background: '#0d0d0d',
                borderColor: '#222',
                color: '#e8e8e8',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#e8552a')}
              onBlur={(e) => (e.target.style.borderColor = '#222')}
            />
            <button
              onClick={handleAuth}
              disabled={authLoading || !password}
              className="rounded px-4 py-2 text-sm font-medium transition-colors duration-200 disabled:opacity-40"
              style={{
                background: '#e8552a',
                color: '#fff',
              }}
            >
              {authLoading ? '…' : 'Login'}
            </button>
          </div>
          {authError && (
            <p className="mt-2 text-sm" style={{ color: '#e8552a' }}>
              {authError}
            </p>
          )}
        </div>
      ) : (
        <>
          {/* ── Stats ──────────────────────────────────── */}
          {dataLoading && !stats && (
            <p className="mb-4 text-sm" style={{ color: '#666' }}>
              Loading…
            </p>
          )}
          {dataError && (
            <p className="mb-4 text-sm" style={{ color: '#e8552a' }}>
              {dataError}
            </p>
          )}

          {stats && (
            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                icon={<HardDrive className="h-4 w-4" />}
                label="Disk Usage"
                value={stats.diskUsage.formatted}
              />
              <StatCard
                icon={<Film className="h-4 w-4" />}
                label="Active Torrents"
                value={String(stats.totalTorrents)}
              />
              <StatCard
                icon={<Users className="h-4 w-4" />}
                label="Total Users"
                value={String(stats.totalUsers)}
              />
              <StatCard
                icon={<FileVideo className="h-4 w-4" />}
                label="Total Files"
                value={String(stats.totalFiles)}
              />
            </div>
          )}

          {/* ── Generate Invite ────────────────────────── */}
          <section className="mb-8">
            <h2
              className="mb-3 text-sm font-semibold uppercase tracking-wider"
              style={{ color: '#666' }}
            >
              Invite Links
            </h2>
            <div
              className="rounded-lg border p-4"
              style={{ background: '#141414', borderColor: '#222' }}
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={handleGenerateInvite}
                  disabled={inviteLoading}
                  className="flex items-center gap-2 rounded px-4 py-2 text-sm font-medium transition-colors duration-200 disabled:opacity-40"
                  style={{ background: '#e8552a', color: '#fff' }}
                >
                  <Plus className="h-4 w-4" />
                  {inviteLoading ? 'Generating…' : 'Generate Invite'}
                </button>
              </div>

              {inviteCode && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: '#666' }}>
                      Code:
                    </span>
                    <code
                      className="rounded px-2 py-1 text-sm font-mono"
                      style={{ background: '#0d0d0d', color: '#e8e8e8' }}
                    >
                      {inviteCode}
                    </code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: '#666' }}>
                      Link:
                    </span>
                    <code
                      className="flex-1 truncate rounded px-2 py-1 text-sm font-mono"
                      style={{ background: '#0d0d0d', color: '#e8e8e8' }}
                    >
                      {inviteLink}
                    </code>
                    <button
                      onClick={() => handleCopy(inviteLink)}
                      className="flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors duration-200"
                      style={{ borderColor: '#222', color: '#666' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#e8552a')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '#666')}
                    >
                      <Copy className="h-3 w-3" />
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ── Users Table ────────────────────────────── */}
          <section className="mb-8">
            <h2
              className="mb-3 text-sm font-semibold uppercase tracking-wider"
              style={{ color: '#666' }}
            >
              Users
            </h2>
            <div
              className="overflow-x-auto rounded-lg border"
              style={{ background: '#141414', borderColor: '#222' }}
            >
              <table className="w-full text-left text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #222' }}>
                    <th className="px-4 py-3 font-medium" style={{ color: '#666' }}>
                      Label
                    </th>
                    <th className="px-4 py-3 font-medium" style={{ color: '#666' }}>
                      Last Seen
                    </th>
                    <th className="px-4 py-3 font-medium" style={{ color: '#666' }}>
                      Invite Code
                    </th>
                    <th className="px-4 py-3 font-medium" style={{ color: '#666' }}>
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-6 text-center"
                        style={{ color: '#666' }}
                      >
                        No users found
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr
                        key={u.id}
                        className="transition-colors duration-200"
                        style={{ borderBottom: '1px solid #222' }}
                      >
                        <td className="px-4 py-3" style={{ color: '#e8e8e8' }}>
                          {u.label || '—'}
                        </td>
                        <td className="px-4 py-3" style={{ color: '#666' }}>
                          {u.lastSeen ? formatDate(u.lastSeen) : '—'}
                        </td>
                        <td className="px-4 py-3" style={{ color: '#666' }}>
                          {u.inviteCode || '—'}
                        </td>
                        <td className="px-4 py-3" style={{ color: '#666' }}>
                          {formatDate(u.createdAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Active Torrents Table ──────────────────── */}
          <section className="mb-8">
            <h2
              className="mb-3 text-sm font-semibold uppercase tracking-wider"
              style={{ color: '#666' }}
            >
              Torrents
            </h2>
            <div
              className="overflow-x-auto rounded-lg border"
              style={{ background: '#141414', borderColor: '#222' }}
            >
              <table className="w-full text-left text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #222' }}>
                    <th className="px-4 py-3 font-medium" style={{ color: '#666' }}>
                      Name
                    </th>
                    <th className="px-4 py-3 font-medium" style={{ color: '#666' }}>
                      Info Hash
                    </th>
                    <th className="px-4 py-3 font-medium" style={{ color: '#666' }}>
                      Added
                    </th>
                    <th className="px-4 py-3 font-medium" style={{ color: '#666' }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {torrents.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-6 text-center"
                        style={{ color: '#666' }}
                      >
                        No torrents found
                      </td>
                    </tr>
                  ) : (
                    torrents.map((t) => (
                      <tr
                        key={t.infoHash}
                        className="transition-colors duration-200"
                        style={{ borderBottom: '1px solid #222' }}
                      >
                        <td
                          className="max-w-[200px] truncate px-4 py-3"
                          style={{ color: '#e8e8e8' }}
                        >
                          {t.name}
                        </td>
                        <td
                          className="px-4 py-3 font-mono text-xs"
                          style={{ color: '#666' }}
                          title={t.infoHash}
                        >
                          {truncateHash(t.infoHash)}
                        </td>
                        <td className="px-4 py-3" style={{ color: '#666' }}>
                          {formatDate(t.addedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleDeleteTorrent(t.infoHash)}
                            disabled={deleteLoading === t.infoHash}
                            className="flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors duration-200 disabled:opacity-40"
                            style={{ borderColor: '#222', color: '#666' }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.color = '#e8552a')
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.color = '#666')
                            }
                          >
                            <Trash2 className="h-3 w-3" />
                            {deleteLoading === t.infoHash ? '…' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Uploaded Files Table ───────────────────── */}
          <section className="mb-8">
            <h2
              className="mb-3 text-sm font-semibold uppercase tracking-wider"
              style={{ color: '#666' }}
            >
              Uploaded Files
            </h2>
            <div
              className="overflow-x-auto rounded-lg border"
              style={{ background: '#141414', borderColor: '#222' }}
            >
              <table className="w-full text-left text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #222' }}>
                    <th className="px-4 py-3 font-medium" style={{ color: '#666' }}>
                      Name
                    </th>
                    <th className="px-4 py-3 font-medium" style={{ color: '#666' }}>
                      Size
                    </th>
                    <th className="px-4 py-3 font-medium" style={{ color: '#666' }}>
                      Type
                    </th>
                    <th className="px-4 py-3 font-medium" style={{ color: '#666' }}>
                      Added
                    </th>
                    <th className="px-4 py-3 font-medium" style={{ color: '#666' }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {files.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-6 text-center"
                        style={{ color: '#666' }}
                      >
                        No files found
                      </td>
                    </tr>
                  ) : (
                    files.map((f) => (
                      <tr
                        key={f.id}
                        className="transition-colors duration-200"
                        style={{ borderBottom: '1px solid #222' }}
                      >
                        <td
                          className="max-w-[200px] truncate px-4 py-3"
                          style={{ color: '#e8e8e8' }}
                        >
                          {f.originalName}
                        </td>
                        <td className="px-4 py-3" style={{ color: '#666' }}>
                          {formatSize(f.size)}
                        </td>
                        <td className="px-4 py-3" style={{ color: '#666' }}>
                          {f.mimeType}
                        </td>
                        <td className="px-4 py-3" style={{ color: '#666' }}>
                          {formatDate(f.addedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleDeleteFile(f.id)}
                            disabled={deleteLoading === f.id}
                            className="flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors duration-200 disabled:opacity-40"
                            style={{ borderColor: '#222', color: '#666' }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.color = '#e8552a')
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.color = '#666')
                            }
                          >
                            <Trash2 className="h-3 w-3" />
                            {deleteLoading === f.id ? '…' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

// ── Stat Card ────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{ background: '#141414', borderColor: '#222' }}
    >
      <div className="mb-1 flex items-center gap-2" style={{ color: '#666' }}>
        {icon}
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-lg font-semibold" style={{ color: '#e8e8e8' }}>
        {value}
      </div>
    </div>
  )
}
