'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAppStore, TorrentInfo, FileInfo } from '@/store/app-store'
import { apiFetch } from '@/lib/api'
import {
  Play, Trash2, Plus, FileVideo, Users, ArrowDownToLine,
  Loader2, X, Magnet
} from 'lucide-react'

export function LibraryView() {
  const {
    torrents, setTorrents,
    files, setFiles,
    activeTab, setActiveTab,
    navigateToWatch, setView, user
  } = useAppStore()

  const [showAddModal, setShowAddModal] = useState(false)
  const [magnetLink, setMagnetLink] = useState('')
  const [addingTorrent, setAddingTorrent] = useState(false)
  const [addError, setAddError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Fetch torrents (with live progress merged by server) and files
  const fetchData = useCallback(async () => {
    try {
      const [torrentsRes, filesRes] = await Promise.all([
        apiFetch('/api/torrent/list'),
        apiFetch('/api/files')
      ])
      if (torrentsRes.ok) {
        const tData = await torrentsRes.json()
        setTorrents(Array.isArray(tData.torrents) ? tData.torrents : [])
      }
      if (filesRes.ok) {
        const fData = await filesRes.json()
        setFiles(Array.isArray(fData.files) ? fData.files : [])
      }
    } catch (err) {
      console.error('Failed to fetch data:', err)
    }
  }, [setTorrents, setFiles])

  useEffect(() => {
    fetchData()
    // Poll every 3 seconds for live torrent progress
    const interval = setInterval(fetchData, 3000)
    return () => clearInterval(interval)
  }, [fetchData])

  const handleAddTorrent = async () => {
    if (!magnetLink.trim()) return

    setAddingTorrent(true)
    setAddError('')

    try {
      const res = await apiFetch('/api/torrent/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet: magnetLink.trim() }),
      })

      if (res.ok) {
        setMagnetLink('')
        setShowAddModal(false)
        fetchData()
      } else {
        const data = await res.json()
        setAddError(data.error || 'Failed to add torrent')
      }
    } catch (err: any) {
      setAddError(err.message)
    } finally {
      setAddingTorrent(false)
    }
  }

  const handleAddTorrentFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setAddingTorrent(true)
    setAddError('')

    try {
      const formData = new FormData()
      formData.append('torrent', file)

      const res = await apiFetch('/api/torrent/add', {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        setShowAddModal(false)
        fetchData()
      } else {
        const data = await res.json()
        setAddError(data.error || 'Failed to add torrent')
      }
    } catch (err: any) {
      setAddError(err.message)
    } finally {
      setAddingTorrent(false)
    }
  }

  const handleDeleteTorrent = async (infoHash: string) => {
    setDeletingId(infoHash)
    try {
      await apiFetch(`/api/torrent/${infoHash}`, { method: 'DELETE' })
      setTorrents(prev => prev.filter(t => t.infoHash !== infoHash))
    } catch (err) {
      console.error('Delete failed:', err)
    } finally {
      setDeletingId(null)
    }
  }

  const handleDeleteFile = async (id: string) => {
    setDeletingId(id)
    try {
      await apiFetch(`/api/admin/files/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': 'admin123' },
      })
      setFiles(prev => prev.filter(f => f.id !== id))
    } catch (err) {
      console.error('Delete failed:', err)
    } finally {
      setDeletingId(null)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const formatSpeed = (bps: number) => {
    if (!bps) return '0 B/s'
    return formatSize(bps) + '/s'
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    })
  }

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
      {/* Tab toggle */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex border border-[#222] rounded overflow-hidden">
          <button
            onClick={() => setActiveTab('torrents')}
            className={`px-5 py-2 text-sm font-medium transition-colors duration-200 ${
              activeTab === 'torrents'
                ? 'bg-[#e8552a] text-white'
                : 'bg-[#141414] text-[#666] hover:text-[#e8e8e8]'
            }`}
          >
            Torrents
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`px-5 py-2 text-sm font-medium transition-colors duration-200 ${
              activeTab === 'files'
                ? 'bg-[#e8552a] text-white'
                : 'bg-[#141414] text-[#666] hover:text-[#e8e8e8]'
            }`}
          >
            Uploaded Files
          </button>
        </div>

        <div className="flex gap-2">
          {activeTab === 'torrents' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#e8552a] text-white text-sm rounded hover:bg-[#c94520] transition-colors duration-200"
            >
              <Plus className="w-4 h-4" />
              Add Torrent
            </button>
          )}
          <button
            onClick={() => setView('upload')}
            className="flex items-center gap-1.5 px-4 py-2 border border-[#222] text-[#999] text-sm rounded hover:text-[#e8e8e8] hover:border-[#444] transition-colors duration-200"
          >
            <FileVideo className="w-4 h-4" />
            Upload File
          </button>
        </div>
      </div>

      {/* Torrents tab */}
      {activeTab === 'torrents' && (
        <div className="space-y-3">
          {torrents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-[#666]">
              <Magnet className="w-12 h-12 mb-4 opacity-30" />
              <p className="text-lg mb-1">No torrents yet</p>
              <p className="text-sm">Add a magnet link or upload a .torrent file</p>
            </div>
          ) : (
            torrents.map(torrent => (
              <div
                key={torrent.infoHash}
                className="border border-[#222] hover:border-[#444] rounded p-4 bg-[#141414] transition-colors duration-200"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[#e8e8e8] font-medium truncate">{torrent.name}</h3>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-[#666]">
                      <span>{formatSize(torrent.size)}</span>
                      <span>{formatDate(torrent.addedAt)}</span>
                      {torrent.peers !== undefined && (
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {torrent.peers}
                        </span>
                      )}
                      {torrent.downloadSpeed !== undefined && torrent.downloadSpeed > 0 && (
                        <span className="flex items-center gap-1 text-[#22c55e]">
                          <ArrowDownToLine className="w-3 h-3" />
                          {formatSpeed(torrent.downloadSpeed)}
                        </span>
                      )}
                    </div>
                    {/* Progress bar */}
                    {torrent.progress !== undefined && torrent.progress < 1 && (
                      <div className="mt-2">
                        <div className="torrent-progress w-48">
                          <div
                            className="torrent-progress-bar"
                            style={{ width: `${Math.round(torrent.progress * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-[#666] mt-0.5">
                          {Math.round(torrent.progress * 100)}%
                          {torrent.ratio !== undefined && ` · Ratio: ${torrent.ratio.toFixed(2)}`}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigateToWatch({
                        type: 'torrent',
                        id: torrent.infoHash,
                        name: torrent.name,
                      })}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#e8552a] border border-[#e8552a]/30 rounded hover:bg-[#e8552a]/10 transition-colors duration-200"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Watch
                    </button>
                    <button
                      onClick={() => handleDeleteTorrent(torrent.infoHash)}
                      disabled={deletingId === torrent.infoHash}
                      className="p-1.5 text-[#666] hover:text-[#dc2626] transition-colors duration-200 disabled:opacity-50"
                    >
                      {deletingId === torrent.infoHash ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Files tab */}
      {activeTab === 'files' && (
        <div className="space-y-3">
          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-[#666]">
              <FileVideo className="w-12 h-12 mb-4 opacity-30" />
              <p className="text-lg mb-1">No uploaded files yet</p>
              <p className="text-sm">Upload a video file to get started</p>
            </div>
          ) : (
            files.map(file => (
              <div
                key={file.id}
                className="border border-[#222] hover:border-[#444] rounded p-4 bg-[#141414] transition-colors duration-200"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[#e8e8e8] font-medium truncate">{file.originalName}</h3>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-[#666]">
                      <span>{formatSize(file.size)}</span>
                      <span>{formatDate(file.addedAt)}</span>
                      <span className="uppercase">{file.mimeType.split('/')[1]}</span>
                      {file.hasSubtitle && (
                        <span className="text-[#4f9cf9]">CC</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigateToWatch({
                        type: 'file',
                        id: file.id,
                        name: file.originalName,
                      })}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#e8552a] border border-[#e8552a]/30 rounded hover:bg-[#e8552a]/10 transition-colors duration-200"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Watch
                    </button>
                    <button
                      onClick={() => handleDeleteFile(file.id)}
                      disabled={deletingId === file.id}
                      className="p-1.5 text-[#666] hover:text-[#dc2626] transition-colors duration-200 disabled:opacity-50"
                    >
                      {deletingId === file.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add Torrent Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#141414] border border-[#222] rounded-lg p-6 w-full max-w-lg mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#e8e8e8]">Add Torrent</h2>
              <button
                onClick={() => { setShowAddModal(false); setAddError('') }}
                className="text-[#666] hover:text-[#e8e8e8] transition-colors duration-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[#999] mb-2">Magnet Link</label>
                <input
                  type="text"
                  value={magnetLink}
                  onChange={(e) => setMagnetLink(e.target.value)}
                  placeholder="magnet:?xt=urn:btih:..."
                  className="w-full bg-[#0d0d0d] border border-[#222] text-[#e8e8e8] rounded p-3 text-sm focus:border-[#e8552a] focus:outline-none transition-colors duration-200"
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-[#222]" />
                <span className="text-xs text-[#666]">OR</span>
                <div className="h-px flex-1 bg-[#222]" />
              </div>

              <div>
                <label className="block text-sm text-[#999] mb-2">Upload .torrent file</label>
                <label className="block w-full border border-dashed border-[#333] hover:border-[#e8552a] rounded p-4 text-center text-[#666] text-sm cursor-pointer transition-colors duration-200">
                  <FileVideo className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  Click to browse .torrent files
                  <input
                    type="file"
                    accept=".torrent"
                    onChange={handleAddTorrentFile}
                    className="hidden"
                  />
                </label>
              </div>

              {addError && (
                <p className="text-sm text-[#dc2626]">{addError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => { setShowAddModal(false); setAddError('') }}
                  className="px-4 py-2 text-sm text-[#999] hover:text-[#e8e8e8] transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddTorrent}
                  disabled={addingTorrent || !magnetLink.trim()}
                  className="px-4 py-2 bg-[#e8552a] text-white text-sm rounded hover:bg-[#c94520] transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addingTorrent ? 'Adding...' : 'Add Torrent'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
