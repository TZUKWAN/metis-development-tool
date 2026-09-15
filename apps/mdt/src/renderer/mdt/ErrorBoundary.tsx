/**
 * Renderer error boundary (tasklist P15.10): a crash inside the designer,
 the dock or any panel must not white-screen the whole app. Offers a
 diagnostic download (versions + error stack, no user content) and a
 reload action.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** section name used in the diagnostics payload */
  area: string
  children: ReactNode
}

interface State {
  error: Error | undefined
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: undefined }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // best-effort console trace; Electron's main-process diagnostics also
    // capture renderer crashes at the process level
    console.error(`[${this.props.area}] render crash`, error, info.componentStack)
  }

  private downloadDiagnostics = (): void => {
    const payload = {
      area: this.props.area,
      error: this.state.error
        ? {
            name: this.state.error.name,
            message: this.state.error.message,
            stack: this.state.error.stack,
          }
        : null,
      userAgent: navigator.userAgent,
      time: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `mdt-diagnostics-${Date.now()}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div role="alert" style={{ padding: 24, color: 'var(--text, #111)' }}>
          <h2 style={{ fontSize: 16 }}>The {this.props.area} hit an unexpected error</h2>
          <p
            style={{ opacity: 0.8, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}
          >
            {this.state.error.message}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" onClick={() => this.setState({ error: undefined })}>
              Try again
            </button>
            <button type="button" onClick={this.downloadDiagnostics}>
              Download diagnostics
            </button>
            <button type="button" onClick={() => window.location.reload()}>
              Reload app
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
