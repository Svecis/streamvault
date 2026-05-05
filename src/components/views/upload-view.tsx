'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, ArrowLeft, FileVideo, Subtitles, X } from 'lucide-react'
import { useAppStore } from '@/store/app-store'
import { apiFetch } from '@/lib/api'

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v']
const VIDEO_ACCEPT = VIDEO_EXTENSIONS.join(',')
const SUBTITLE_EXTENSIONS = ['.srt', '.vtt', '.ass', '.ssa']
const SUBTITLE_ACCEPT = SUBTITLE_EXTENSIONS.join(',')

export function UploadView() {
  const { setView, navigateToWatch } = useAppStore()

  // Video file state
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [isDraggingVideo, setIsDraggingVideo] = useState(false)

  // Subtitle file state
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null)
  const [isDraggingSubtitle, setIsDraggingSubtitle] = useState(false)

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Refs
  const videoInputRef = useRef<HTMLInputElement>(null)
  const subtitleInputRef = useRef<HTMLInputElement>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)

  const reset = useCallback(() => {
    setVideoFile(null)
    setSubtitleFile(null)
    setUploading(false)
    setProgress(0)
    setError(null)
    if (xhrRef.current) {
      xhrRef.current.abort()
      xhrRef.current = null
    }
  }, [])

  const isValidVideo = (file: File): boolean => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    return VIDEO_EXTENSIONS.includes(ext)
  }

  const isValidSubtitle = (file: File): boolean => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    return SUBTITLE_EXTENSIONS.includes(ext)
  }

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
  }

  // ── Video drag handlers ──────────────────────────────────────────────

  const handleVideoDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingVideo(true)
  }, [])

  const handleVideoDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingVideo(false)
  }, [])

  const handleVideoDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDraggingVideo(false)

      const file = e.dataTransfer.files[0]
      if (!file) return

      if (!isValidVideo(file)) {
        setError(`Invalid video format. Allowed: ${VIDEO_EXTENSIONS.join(', ')}`)
        return
      }

      setVideoFile(file)
      setError(null)
    },
    []
  )

  const handleVideoSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      if (!isValidVideo(file)) {
        setError(`Invalid video format. Allowed: ${VIDEO_EXTENSIONS.join(', ')}`)
        return
      }

      setVideoFile(file)
      setError(null)
    },
    []
  )

  // ── Subtitle drag handlers ───────────────────────────────────────────

  const handleSubtitleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingSubtitle(true)
  }, [])

  const handleSubtitleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingSubtitle(false)
  }, [])

  const handleSubtitleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDraggingSubtitle(false)

      const file = e.dataTransfer.files[0]
      if (!file) return

      if (!isValidSubtitle(file)) {
        setError(`Invalid subtitle format. Allowed: ${SUBTITLE_EXTENSIONS.join(', ')}`)
        return
      }

      setSubtitleFile(file)
      setError(null)
    },
    []
  )

  const handleSubtitleSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      if (!isValidSubtitle(file)) {
        setError(`Invalid subtitle format. Allowed: ${SUBTITLE_EXTENSIONS.join(', ')}`)
        return
      }

      setSubtitleFile(file)
      setError(null)
    },
    []
  )

  // ── Upload logic ─────────────────────────────────────────────────────

  const handleUpload = useCallback(() => {
    if (!videoFile) return

    setUploading(true)
    setProgress(0)
    setError(null)

    const xhr = new XMLHttpRequest()
    xhrRef.current = xhr

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100)
        setProgress(pct)
      }
    }

    xhr.onload = () => {
      xhrRef.current = null

      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText)

          // If there's a subtitle file, upload it too before navigating
          if (subtitleFile) {
            const subFormData = new FormData()
            subFormData.append('subtitle', subtitleFile)

            apiFetch(`/api/subtitle/${data.id}`, {
              method: 'POST',
              body: subFormData,
            })
              .then(() => {
                navigateToWatch({ type: 'file', id: data.id, name: data.originalName })
              })
              .catch(() => {
                // Subtitle upload failed — still navigate, just without subtitle
                navigateToWatch({ type: 'file', id: data.id, name: data.originalName })
              })
          } else {
            navigateToWatch({ type: 'file', id: data.id, name: data.originalName })
          }
        } catch {
          setError('Failed to parse upload response')
          setUploading(false)
        }
      } else {
        try {
          const errData = JSON.parse(xhr.responseText)
          setError(errData.error || `Upload failed (${xhr.status})`)
        } catch {
          setError(`Upload failed (${xhr.status})`)
        }
        setUploading(false)
      }
    }

    xhr.onerror = () => {
      xhrRef.current = null
      setError('Network error during upload')
      setUploading(false)
    }

    xhr.onabort = () => {
      xhrRef.current = null
      setUploading(false)
    }

    const formData = new FormData()
    formData.append('file', videoFile)
    xhr.open('POST', '/api/upload')
    xhr.withCredentials = true
    xhr.send(formData)
  }, [videoFile, subtitleFile, navigateToWatch])

  const handleCancel = useCallback(() => {
    if (xhrRef.current) {
      xhrRef.current.abort()
      xhrRef.current = null
    }
    setUploading(false)
    setProgress(0)
  }, [])

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-[#e8e8e8]" style={{ fontFamily: 'system-ui' }}>
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-5 border-b border-[#222]">
        <button
          onClick={() => setView('library')}
          className="flex items-center gap-2 text-[#666] hover:text-[#e8e8e8] transition-colors duration-200 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Library
        </button>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Title */}
        <h1 className="text-2xl font-semibold mb-8">Upload Video</h1>

        {/* Video drop zone */}
        <div
          onDragOver={handleVideoDragOver}
          onDragLeave={handleVideoDragLeave}
          onDrop={handleVideoDrop}
          onClick={() => !uploading && videoInputRef.current?.click()}
          className={`
            relative border-2 border-dashed rounded-lg p-12
            flex flex-col items-center justify-center gap-4
            cursor-pointer transition-colors duration-200
            ${uploading ? 'pointer-events-none opacity-60' : ''}
            ${isDraggingVideo ? 'border-[#e8552a] bg-[#e8552a]/5' : 'border-[#333] hover:border-[#444]'}
          `}
        >
          <input
            ref={videoInputRef}
            type="file"
            accept={VIDEO_ACCEPT}
            onChange={handleVideoSelect}
            className="hidden"
          />

          <Upload
            className={`w-10 h-10 transition-colors duration-200 ${
              isDraggingVideo ? 'text-[#e8552a]' : 'text-[#666]'
            }`}
          />

          {videoFile ? (
            <div className="flex items-center gap-3 text-center">
              <FileVideo className="w-5 h-5 text-[#e8552a] shrink-0" />
              <div className="min-w-0">
                <p className="text-[#e8e8e8] truncate text-sm font-medium">{videoFile.name}</p>
                <p className="text-[#666] text-xs mt-0.5">{formatSize(videoFile.size)}</p>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-[#e8e8e8] text-sm">Drop video here or click to browse</p>
              <p className="text-[#666] text-xs mt-1.5">
                Supports: {VIDEO_EXTENSIONS.join(', ')}
              </p>
            </div>
          )}
        </div>

        {/* Subtitle drop zone */}
        <div className="mt-6">
          <div
            onDragOver={handleSubtitleDragOver}
            onDragLeave={handleSubtitleDragLeave}
            onDrop={handleSubtitleDrop}
            onClick={() => !uploading && subtitleInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-lg p-8
              flex flex-col items-center justify-center gap-3
              cursor-pointer transition-colors duration-200
              ${uploading ? 'pointer-events-none opacity-60' : ''}
              ${isDraggingSubtitle ? 'border-[#e8552a] bg-[#e8552a]/5' : 'border-[#333] hover:border-[#444]'}
            `}
          >
            <input
              ref={subtitleInputRef}
              type="file"
              accept={SUBTITLE_ACCEPT}
              onChange={handleSubtitleSelect}
              className="hidden"
            />

            <Subtitles
              className={`w-7 h-7 transition-colors duration-200 ${
                isDraggingSubtitle ? 'text-[#e8552a]' : 'text-[#666]'
              }`}
            />

            {subtitleFile ? (
              <div className="flex items-center gap-3 text-center">
                <FileVideo className="w-4 h-4 text-[#e8552a] shrink-0" />
                <div className="min-w-0">
                  <p className="text-[#e8e8e8] truncate text-sm font-medium">{subtitleFile.name}</p>
                  <p className="text-[#666] text-xs mt-0.5">{formatSize(subtitleFile.size)}</p>
                </div>
                {!uploading && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setSubtitleFile(null)
                    }}
                    className="ml-2 p-1 text-[#666] hover:text-[#e8e8e8] transition-colors duration-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <div className="text-center">
                <p className="text-[#666] text-sm">Add subtitle (optional)</p>
                <p className="text-[#555] text-xs mt-1">
                  Supports: {SUBTITLE_EXTENSIONS.join(', ')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-4 p-3 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Upload progress */}
        {uploading && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-[#e8e8e8] truncate mr-4">
                {videoFile?.name ?? 'Uploading...'}
              </p>
              <span className="text-sm text-[#e8552a] font-medium shrink-0">{progress}%</span>
            </div>
            <div className="h-2 bg-[#222] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#e8552a] rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-8 flex items-center gap-3">
          {!uploading ? (
            <>
              <button
                onClick={handleUpload}
                disabled={!videoFile}
                className={`
                  px-6 py-2.5 rounded text-sm font-medium transition-colors duration-200
                  ${
                    videoFile
                      ? 'bg-[#e8552a] text-white hover:bg-[#d04a22]'
                      : 'bg-[#222] text-[#666] cursor-not-allowed'
                  }
                `}
              >
                Upload
              </button>
              {videoFile && (
                <button
                  onClick={reset}
                  className="px-6 py-2.5 rounded text-sm text-[#666] hover:text-[#e8e8e8] border border-[#333] hover:border-[#444] transition-colors duration-200"
                >
                  Clear
                </button>
              )}
            </>
          ) : (
            <button
              onClick={handleCancel}
              className="px-6 py-2.5 rounded text-sm text-[#e8e8e8] border border-[#333] hover:border-[#e8552a] transition-colors duration-200"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
