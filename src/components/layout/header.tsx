'use client'

import { useAppStore } from '@/store/app-store'
import { apiFetch, clearSession } from '@/lib/api'
import { LogOut, Upload, Shield, Film } from 'lucide-react'

export function Header() {
  const { user, setView, setUser, setIsAdmin } = useAppStore()

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' })
    clearSession()
    setUser(null)
    setIsAdmin(false)
    setView('login')
  }

  return (
    <header className="border-b border-[#222] bg-[#0d0d0d] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <button
          onClick={() => setView('library')}
          className="flex items-center gap-2 text-[#e8e8e8] hover:text-[#e8552a] transition-colors duration-200"
        >
          <Film className="w-5 h-5" />
          <span className="font-semibold text-lg tracking-tight">StreamVault</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setView('upload')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#999] hover:text-[#e8e8e8] border border-[#222] hover:border-[#444] rounded transition-colors duration-200"
          >
            <Upload className="w-4 h-4" />
            Upload
          </button>

          <button
            onClick={() => setView('admin')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#999] hover:text-[#e8e8e8] border border-[#222] hover:border-[#444] rounded transition-colors duration-200"
          >
            <Shield className="w-4 h-4" />
            Admin
          </button>

          <div className="h-5 w-px bg-[#222] mx-1" />

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#222] flex items-center justify-center text-xs text-[#666]">
              {user?.label?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <button
              onClick={handleLogout}
              className="text-[#666] hover:text-[#e8552a] transition-colors duration-200"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
