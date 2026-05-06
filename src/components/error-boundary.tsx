'use client'

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: string
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message || 'Unknown error' }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0d0d0d]">
          <div className="max-w-md mx-auto text-center p-8" style={{ background: '#141414', border: '1px solid #222', borderRadius: 8 }}>
            <h2 className="text-lg font-semibold text-[#e8e8e8] mb-2" style={{ fontFamily: 'system-ui' }}>
              Something went wrong
            </h2>
            <p className="text-sm text-[#666] mb-4" style={{ fontFamily: 'system-ui' }}>
              {this.state.error}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: '' })
                window.location.reload()
              }}
              className="px-4 py-2 text-sm font-medium rounded"
              style={{ background: '#e8552a', color: '#fff', border: 'none', fontFamily: 'system-ui' }}
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
