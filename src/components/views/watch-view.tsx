'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppStore } from '@/store/app-store'
import { apiFetch } from '@/lib/api'
import {
  ArrowLeft, Share2, Upload, Users, ArrowDownToLine, Signal
} from 'lucide-react'

interface TorrentStats {
  progress: number
  downloadSpeed: number
  peers: number
  ratio: number
  active: boolean
}

export function WatchView() {
  const { watchParams, setView } = useAppStore()

  const playerRef = useRef<any>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<HTMLTrackElement>(null)
  const sseRef = useRef<EventSource | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const plyrScriptRef = useRef<HTMLScriptElement | null>(null)
  const plyrLinkRef = useRef<HTMLLinkElement | null>(null)

  const [torrentStats, setTorrentStats] = useState<TorrentStats | null>(null)
  const [hasSubtitle, setHasSubtitle] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [uploadingSubtitle, setUploadingSubtitle] = useState(false)
  const [videoInfo, setVideoInfo] = useState<{
    name: string
    size: string
    addedAt: string
  } | null>(null)

  const videoSrc = watchParams
    ? watchParams.type === 'torrent'
      ? `/api/torrent/stream/${watchParams.id}?XTransformPort=3001`
      : `/api/file/${watchParams.id}`
    : ''

  const subtitleSrc = watchParams ? `/api/subtitle/${watchParams.id}` : ''

  // Helper formatters
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
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  // Fetch video info
  useEffect(() => {
    if (!watchParams) return

    const fetchInfo = async () => {
      try {
        if (watchParams.type === 'torrent') {
          const res = await apiFetch('/api/torrent/list')
          if (res.ok) {
            const data = await res.json()
            const torrent = (data.torrents || []).find(
              (t: any) => t.infoHash === watchParams.id
            )
            if (torrent) {
              setVideoInfo({
                name: torrent.name,
                size: formatSize(torrent.size),
                addedAt: formatDate(torrent.addedAt),
              })
            }
          }
        } else {
          const res = await apiFetch('/api/files')
          if (res.ok) {
            const data = await res.json()
            const file = (data.files || []).find(
              (f: any) => f.id === watchParams.id
            )
            if (file) {
              setVideoInfo({
                name: file.originalName,
                size: formatSize(file.size),
                addedAt: formatDate(file.addedAt),
              })
              if (file.hasSubtitle) {
                setHasSubtitle(true)
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch video info:', err)
      }
    }

    fetchInfo()
  }, [watchParams])

  // Check subtitle existence
  useEffect(() => {
    if (!watchParams) return

    const checkSubtitle = async () => {
      try {
        const res = await apiFetch(`/api/subtitle/${watchParams.id}`)
        if (res.ok) {
          setHasSubtitle(true)
        }
      } catch {
        // Subtitle doesn't exist, that's fine
      }
    }

    checkSubtitle()
  }, [watchParams])

  // Load Plyr and initialize player
  useEffect(() => {
    if (!watchParams) return

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://cdn.plyr.io/3.7.8/plyr.css'
    document.head.appendChild(link)
    plyrLinkRef.current = link

    const script = document.createElement('script')
    script.src = 'https://cdn.plyr.io/3.7.8/plyr.js'
    script.onload = () => {
      // @ts-ignore
      if (window.Plyr) {
        // @ts-ignore
        const player = new window.Plyr('#player', {
          controls: [
            'play',
            'progress',
            'current-time',
            'duration',
            'mute',
            'volume',
            'settings',
            'pip',
            'fullscreen',
          ],
          settings: ['speed'],
          speed: {
            selected: 1,
            options: [0.5, 0.75, 1, 1.25, 1.5, 2],
          },
          i18n: {
            speedLabel: '{speed}x',
          },
        })
        playerRef.current = player
      }
    }
    document.head.appendChild(script)
    plyrScriptRef.current = script

    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy()
        } catch {
          // Ignore destroy errors
        }
        playerRef.current = null
      }
      if (plyrScriptRef.current && plyrScriptRef.current.parentNode) {
        plyrScriptRef.current.parentNode.removeChild(plyrScriptRef.current)
      }
      if (plyrLinkRef.current && plyrLinkRef.current.parentNode) {
        plyrLinkRef.current.parentNode.removeChild(plyrLinkRef.current)
      }
    }
  }, [watchParams])

  // Handle video error
  useEffect(() => {
    const videoEl = videoRef.current
    if (!videoEl) return

    const handleError = () => {
      setError('Failed to load the video stream. The source may be unavailable.')
    }

    videoEl.addEventListener('error', handleError)
    return () => videoEl.removeEventListener('error', handleError)
  }, [videoRef])

  // Torrent stats: SSE + polling fallback
  useEffect(() => {
    if (!watchParams || watchParams.type !== 'torrent') return

    const infoHash = watchParams.id

    // Try SSE first
    const connectSSE = () => {
      try {
        const eventSource = new EventSource(
          `/api/torrent/progress/${infoHash}`
        )
        sseRef.current = eventSource

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            setTorrentStats({
              progress: data.progress ?? 0,
              downloadSpeed: data.downloadSpeed ?? 0,
              peers: data.peers ?? 0,
              ratio: data.ratio ?? 0,
              active: data.active ?? true,
            })
          } catch {
            // Ignore parse errors
          }
        }

        eventSource.onerror = () => {
          eventSource.close()
          sseRef.current = null
          // Fall back to polling
          startPolling()
        }
      } catch {
        startPolling()
      }
    }

    const startPolling = () => {
      if (pollRef.current) return

      const poll = async () => {
        try {
          const res = await apiFetch(`/api/torrent/status/${infoHash}`)
          if (res.ok) {
            const data = await res.json()
            setTorrentStats({
              progress: data.progress ?? 0,
              downloadSpeed: data.downloadSpeed ?? 0,
              peers: data.peers ?? 0,
              ratio: data.ratio ?? 0,
              active: data.active ?? false,
            })
          }
        } catch {
          // Ignore poll errors
        }
      }

      poll()
      pollRef.current = setInterval(poll, 5000)
    }

    connectSSE()

    return () => {
      if (sseRef.current) {
        sseRef.current.close()
        sseRef.current = null
      }
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [watchParams])

  // Subtitle upload handler
  const handleSubtitleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !watchParams) return

      setUploadingSubtitle(true)
      setError(null)

      try {
        const formData = new FormData()
        formData.append('subtitle', file)

        const res = await apiFetch(`/api/subtitle/${watchParams.id}`, {
          method: 'POST',
          body: formData,
        })

        if (res.ok) {
          setHasSubtitle(true)
          // Reload the track
          if (trackRef.current) {
            const track = trackRef.current
            track.src = `/api/subtitle/${watchParams.id}?t=${Date.now()}`
            if (track.track) {
              track.track.mode = 'showing'
            }
          }
          // Also update via the player if available
          if (playerRef.current) {
            try {
              playerRef.current.restart()
            } catch {
              // Ignore
            }
          }
        } else {
          const data = await res.json()
          setError(data.error || 'Failed to upload subtitle')
        }
      } catch (err: any) {
        setError(err.message || 'Failed to upload subtitle')
      } finally {
        setUploadingSubtitle(false)
        // Reset file input
        e.target.value = ''
      }
    },
    [watchParams]
  )

  // Share handler
  const handleShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setToastMessage('Copied!')
      setTimeout(() => setToastMessage(null), 2000)
    } catch {
      setToastMessage('Failed to copy')
      setTimeout(() => setToastMessage(null), 2000)
    }
  }, [])

  if (!watchParams) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#666]">
        <p>No video selected</p>
      </div>
    )
  }

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
      {/* Back link */}
      <button
        onClick={() => setView('library')}
        className="flex items-center gap-2 text-[#999] hover:text-[#e8e8e8] transition-colors duration-200 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm">Back to Library</span>
      </button>

      {/* Video Player */}
      <div className="relative w-full bg-[#000] rounded overflow-hidden mb-6">
        <video
          ref={videoRef}
          id="player"
          playsInline
          crossOrigin="anonymous"
          className="w-full"
          style={{ maxHeight: '70vh' }}
        >
          <source src={videoSrc} />
          {hasSubtitle && (
            <track
              ref={trackRef}
              kind="captions"
              label="English"
              src={subtitleSrc}
              default
            />
          )}
        </video>

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center p-6">
              <p className="text-[#dc2626] text-sm mb-2">Playback Error</p>
              <p className="text-[#999] text-xs">{error}</p>
              <button
                onClick={() => setError(null)}
                className="mt-3 px-3 py-1 text-xs text-[#e8e8e8] border border-[#222] rounded hover:border-[#444] transition-colors duration-200"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left column: Video info */}
        <div className="space-y-3">
          <h1 className="text-[#e8e8e8] text-xl font-semibold leading-tight">
            {watchParams.name || videoInfo?.name || 'Untitled Video'}
          </h1>

          <div className="space-y-1.5">
            {videoInfo?.size && (
              <p className="text-sm text-[#666]">
                Size: {videoInfo.size}
              </p>
            )}
            <p className="text-sm text-[#666]">
              Source:{' '}
              <span className="text-[#999]">
                {watchParams.type === 'torrent' ? 'Torrent' : 'Upload'}
              </span>
            </p>
            {videoInfo?.addedAt && (
              <p className="text-sm text-[#666]">
                Added: {videoInfo.addedAt}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-2">
            {/* Load Subtitle */}
            <label className="flex items-center gap-1.5 px-3 py-2 border border-[#222] text-[#999] text-sm rounded cursor-pointer hover:text-[#e8e8e8] hover:border-[#444] transition-colors duration-200">
              <Upload className="w-4 h-4" />
              {uploadingSubtitle ? 'Uploading...' : 'Load Subtitle'}
              <input
                type="file"
                accept=".srt,.vtt,.ass,.ssa"
                onChange={handleSubtitleUpload}
                className="hidden"
                disabled={uploadingSubtitle}
              />
            </label>

            {/* CC indicator */}
            {hasSubtitle && (
              <span className="flex items-center px-2 py-1 text-xs font-bold bg-[#e8552a] text-white rounded">
                CC
              </span>
            )}

            {/* Share */}
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-2 border border-[#222] text-[#999] text-sm rounded hover:text-[#e8e8e8] hover:border-[#444] transition-colors duration-200"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
          </div>
        </div>

        {/* Right column: Torrent stats */}
        {watchParams.type === 'torrent' && (
          <div className="border border-[#222] rounded p-4 bg-[#141414]">
            <h3 className="text-[#e8e8e8] text-sm font-medium mb-3">
              Torrent Stats
            </h3>

            {torrentStats ? (
              <div className="space-y-3">
                {/* Progress */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[#666]">Progress</span>
                    <span className="text-[#e8e8e8]">
                      {Math.round(torrentStats.progress * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-[#222] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#e8552a] rounded-full transition-all duration-200"
                      style={{
                        width: `${Math.round(torrentStats.progress * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Download speed */}
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-[#666]">
                    <ArrowDownToLine className="w-3.5 h-3.5" />
                    Download
                  </span>
                  <span className="text-[#22c55e]">
                    {formatSpeed(torrentStats.downloadSpeed)}
                  </span>
                </div>

                {/* Peers */}
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-[#666]">
                    <Users className="w-3.5 h-3.5" />
                    Peers
                  </span>
                  <span className="text-[#e8e8e8]">
                    {torrentStats.peers}
                  </span>
                </div>

                {/* Ratio */}
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-[#666]">
                    <Signal className="w-3.5 h-3.5" />
                    Ratio
                  </span>
                  <span className="text-[#e8e8e8]">
                    {torrentStats.ratio.toFixed(2)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-6 text-[#666] text-xs">
                Loading torrent stats...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-[#e8552a] text-white text-sm rounded z-50 transition-opacity duration-200">
          {toastMessage}
        </div>
      )}
    </div>
  )
}
