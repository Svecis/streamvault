'use client'

import { useEffect } from 'react'
import { useAppStore } from '@/store/app-store'
import { LoginView } from '@/components/views/login-view'
import { LibraryView } from '@/components/views/library-view'
import { WatchView } from '@/components/views/watch-view'
import { UploadView } from '@/components/views/upload-view'
import { AdminView } from '@/components/views/admin-view'
import { Header } from '@/components/layout/header'
import { ErrorBoundary } from '@/components/error-boundary'
import { apiFetch, storeSession, clearSession } from '@/lib/api'

export default function Home() {
  const { view, user, setUser, setView, setLoading, loading } = useAppStore()

  // Check session on load
  useEffect(() => {
    const checkSession = async () => {
      setLoading(true)
      try {
        const res = await apiFetch('/api/auth/session')
        if (res.ok) {
          const data = await res.json()
          if (data.user?.sessionToken) {
            storeSession(data.user.sessionToken)
          }
          setUser(data.user)
          setView('library')
        } else {
          clearSession()
          setUser(null)
          setView('login')
        }
      } catch {
        setUser(null)
        setView('login')
      } finally {
        setLoading(false)
      }
    }
    checkSession()
  }, [setUser, setView, setLoading])

  // Check URL params for join code
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code) {
      apiFetch('/api/auth/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, label: 'User' }),
      }).then(async (res) => {
        if (res.ok) {
          const data = await res.json()
          if (data.sessionToken) storeSession(data.sessionToken)
          setUser(data.user)
          setView('library')
          window.history.replaceState({}, '', '/')
        }
      })
    }
  }, [setUser, setView])

  if (loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d0d0d]">
        <p className="text-[#666]" style={{ fontFamily: 'system-ui' }}>Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0d0d0d]">
      <ErrorBoundary>
        {user && view !== 'login' && <Header />}
        <main className="flex-1 flex flex-col">
          {view === 'login' && <LoginView />}
          {view === 'library' && <LibraryView />}
          {view === 'watch' && <WatchView />}
          {view === 'upload' && <UploadView />}
          {view === 'admin' && <AdminView />}
        </main>
      </ErrorBoundary>
    </div>
  )
}
