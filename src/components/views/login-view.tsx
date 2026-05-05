'use client'

import { useState, type FormEvent } from 'react'
import { useAppStore } from '@/store/app-store'

export function LoginView() {
  const setUser = useAppStore((s) => s.setUser)
  const setView = useAppStore((s) => s.setView)

  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (!code.trim()) {
      setError('Please enter an invite code')
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch('/api/auth/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), label: 'User' }),
      })

      if (!res.ok) {
        setError('Invalid or already used invite code')
        return
      }

      const data = await res.json()

      if (data.success && data.user) {
        setUser(data.user)
        setView('library')
      } else {
        setError('Invalid or already used invite code')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0d0d0d' }}>
      <div
        className="w-full max-w-sm"
        style={{
          backgroundColor: '#141414',
          border: '1px solid #222',
          borderRadius: 8,
          padding: 32,
        }}
      >
        <h1
          className="text-center text-2xl font-semibold mb-2"
          style={{ color: '#e8e8e8', fontFamily: 'system-ui' }}
        >
          StreamVault
        </h1>
        <p
          className="text-center text-sm mb-6"
          style={{ color: '#666', fontFamily: 'system-ui' }}
        >
          Enter your invite code to join
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Invite code"
            className="w-full outline-none mb-4"
            style={{
              backgroundColor: '#0d0d0d',
              border: '1px solid #222',
              color: '#e8e8e8',
              borderRadius: 4,
              padding: 12,
              fontFamily: 'system-ui',
              fontSize: 14,
              transition: 'border-color 200ms',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#e8552a')}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#222')}
            disabled={submitting}
          />

          <button
            type="submit"
            disabled={submitting}
            className="w-full cursor-pointer font-medium"
            style={{
              backgroundColor: '#e8552a',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              padding: 12,
              fontFamily: 'system-ui',
              fontSize: 14,
              transition: 'background-color 200ms',
              opacity: submitting ? 0.7 : 1,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#c94520')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#e8552a')}
          >
            {submitting ? 'Joining...' : 'Join'}
          </button>
        </form>

        {error && (
          <p
            className="mt-3 text-sm text-center"
            style={{ color: '#ef4444', fontFamily: 'system-ui' }}
          >
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
