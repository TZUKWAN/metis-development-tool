/**
 * MDT Build panel (tasklist P10.10, P10.15): start a build, stream events
 * (batched to keep high-frequency tokens smooth), cancel, and read the
 * availability state of the Codex CLI.
 */
import { useEffect, useRef, useState } from 'react'
import type React from 'react'

import { useMdtStore } from './store'

interface BuildEventLine {
  id: number
  text: string
  tone: 'info' | 'warn' | 'error'
}

interface Availability {
  installed: boolean
  version?: string
  loggedIn?: boolean
  compatWarning?: string
}

let lineId = 0

export function BuildPanel(): React.ReactElement {
  const project = useMdtStore((s) => s.project)
  const [lines, setLines] = useState<BuildEventLine[]>([])
  const [running, setRunning] = useState(false)
  const [availability, setAvailability] = useState<Availability | undefined>()
  const pending = useRef<string[]>([])
  const flushTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    void window.mdtApi?.buildAvailability().then((r) => {
      const payload = r as { availability?: Availability }
      setAvailability(payload.availability)
    })
    const off = window.mdtApi?.onBuildEvent(({ event }) => {
      const e = event as {
        type: string
        delta?: string
        message?: string
        status?: string
        error?: string
        files?: string[]
      }
      switch (e.type) {
        case 'agent_message_delta':
          pending.current.push(e.delta ?? '')
          scheduleFlush()
          break
        case 'command_started':
          push(`$ ${e.message ?? 'command'}`, 'info')
          break
        case 'file_change_completed':
          push(`files changed: ${(e.files ?? []).join(', ')}`, 'info')
          break
        case 'error':
          push(e.message ?? 'error', 'error')
          break
        case 'turn_completed':
          push(
            `build ${e.status}${e.error ? `: ${e.error}` : ''}`,
            e.status === 'completed' ? 'info' : e.status === 'interrupted' ? 'warn' : 'error',
          )
          setRunning(false)
          break
        default:
          break
      }
    })
    return () => {
      off?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function scheduleFlush() {
    if (flushTimer.current !== undefined) return
    flushTimer.current = window.setTimeout(() => {
      flushTimer.current = undefined
      const text = pending.current.join('')
      pending.current = []
      if (text) push(text, 'info')
    }, 120)
  }

  function push(text: string, tone: BuildEventLine['tone']) {
    setLines((prev) => [...prev.slice(-400), { id: ++lineId, text, tone }])
  }

  if (!project) return <div className="mdt-panel-empty">Open a project first.</div>

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: 12,
        color: 'var(--text)',
      }}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <button
          type="button"
          disabled={running}
          onClick={() => {
            setRunning(true)
            setLines([])
            void window.mdtApi?.buildStart('Implement the MDT blueprint for this project.')
          }}
        >
          ▶ Build
        </button>
        <button type="button" disabled={!running} onClick={() => void window.mdtApi?.buildCancel()}>
          ■ Cancel
        </button>
        <button type="button" onClick={() => void window.mdtApi?.buildRollback()}>
          ⟲ Rollback
        </button>
        <button
          type="button"
          onClick={() => {
            void window.mdtApi?.previewStart('generated').then((r) => {
              const payload = r as { ok?: boolean; url?: string; error?: string }
              if (payload?.ok && payload.url) push('preview running at ' + payload.url, 'info')
              else if (payload?.error) push('preview failed: ' + payload.error, 'error')
            })
          }}
        >
          ▶ Run Preview
        </button>
        <button type="button" onClick={() => void window.mdtApi?.previewStop()}>
          ■ Stop Preview
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.75 }}>
          {availability?.installed
            ? `Codex ${availability.version ?? '?'} · ${availability.loggedIn ? 'signed in' : 'NOT signed in'}`
            : 'Codex CLI not found'}
        </span>
      </div>
      {availability?.compatWarning && (
        <p role="status" style={{ color: '#b8860b', fontSize: 12 }}>
          {availability.compatWarning}
        </p>
      )}
      <output
        aria-live="polite"
        style={{
          flex: 1,
          overflowY: 'auto',
          background: 'var(--surface, #111)',
          borderRadius: 6,
          padding: 8,
          fontFamily: 'monospace',
          fontSize: 12,
          whiteSpace: 'pre-wrap',
        }}
      >
        {lines.map((line) => (
          <div
            key={line.id}
            style={{
              color:
                line.tone === 'error' ? 'crimson' : line.tone === 'warn' ? '#b8860b' : undefined,
            }}
          >
            {line.text}
          </div>
        ))}
      </output>
    </div>
  )
}
