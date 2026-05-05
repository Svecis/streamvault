import { create } from 'zustand'

export type ViewType = 'library' | 'watch' | 'upload' | 'login' | 'admin'

export interface UserInfo {
  id: number
  label: string | null
  sessionToken: string | null
}

export interface TorrentInfo {
  id: number
  infoHash: string
  name: string
  magnet: string | null
  size: number
  addedBy: number | null
  addedAt: string
  user?: { label: string | null } | null
  // Live progress from torrent service
  progress?: number
  downloadSpeed?: number
  peers?: number
  ratio?: number
}

export interface FileInfo {
  id: string
  originalName: string
  size: number
  mimeType: string
  hasSubtitle: boolean
  addedAt: string
}

export interface WatchParams {
  type: 'torrent' | 'file'
  id: string
  name?: string
}

interface AppState {
  // Navigation
  view: ViewType
  watchParams: WatchParams | null
  setView: (view: ViewType) => void
  navigateToWatch: (params: WatchParams) => void

  // Auth
  user: UserInfo | null
  setUser: (user: UserInfo | null) => void
  isAdmin: boolean
  setIsAdmin: (isAdmin: boolean) => void

  // Data
  torrents: TorrentInfo[]
  setTorrents: (torrents: TorrentInfo[]) => void
  files: FileInfo[]
  setFiles: (files: FileInfo[]) => void

  // Tab
  activeTab: 'torrents' | 'files'
  setActiveTab: (tab: 'torrents' | 'files') => void

  // Loading
  loading: boolean
  setLoading: (loading: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  view: 'login',
  watchParams: null,
  setView: (view) => set({ view }),
  navigateToWatch: (params) => set({ view: 'watch', watchParams: params }),

  user: null,
  setUser: (user) => set({ user }),
  isAdmin: false,
  setIsAdmin: (isAdmin) => set({ isAdmin }),

  torrents: [],
  setTorrents: (torrents) => set({ torrents }),
  files: [],
  setFiles: (files) => set({ files }),

  activeTab: 'torrents',
  setActiveTab: (activeTab) => set({ activeTab }),

  loading: false,
  setLoading: (loading) => set({ loading }),
}))
