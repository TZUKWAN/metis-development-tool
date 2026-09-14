/**
 * MDT welcome screen (tasklist P03.12): exactly New Project, Open Project,
 * Recent Projects and Docs — no GenOffice suite surface.
 */
import { useState } from 'react'
import type React from 'react'

interface WelcomeProps {
  onClose: () => void
  onNew: (name: string) => void
  onOpen: () => void
  recent: { path: string; name: string; lastOpenedAt: string }[]
  onOpenRecent: (path: string) => void
  onRemoveRecent: (path: string) => void
}

export function Welcome({
  onClose,
  onNew,
  onOpen,
  recent,
  onOpenRecent,
  onRemoveRecent,
}: WelcomeProps): React.ReactElement {
  const [name, setName] = useState('My Agent App')
  return (
    <div
      role="dialog"
      aria-label="Welcome to Metis Development Tool"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.45)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 100,
      }}
    >
      <div
        style={{
          width: 520,
          maxHeight: '80vh',
          overflowY: 'auto',
          background: 'var(--surface, #fff)',
          borderRadius: 10,
          padding: 24,
          color: 'var(--text, #111)',
          boxShadow: '0 12px 40px rgba(0,0,0,.3)',
        }}
      >
        <h1 style={{ fontSize: 20, marginTop: 0 }}>Metis Development Tool</h1>
        <p style={{ opacity: 0.8 }}>
          Design agent applications like a presentation: pages, connections, agents, build.
        </p>

        <h2 style={{ fontSize: 14 }}>New Project</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            aria-label="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="button" onClick={() => onNew(name.trim() || 'Untitled')}>
            Create
          </button>
        </div>

        <h2 style={{ fontSize: 14 }}>Open Project</h2>
        <button type="button" onClick={onOpen}>
          Browse…
        </button>

        <h2 style={{ fontSize: 14 }}>Recent Projects</h2>
        {recent.length === 0 ? (
          <p style={{ opacity: 0.6 }}>No recent projects yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {recent.map((entry) => (
              <li
                key={entry.path}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}
              >
                <button type="button" onClick={() => onOpenRecent(entry.path)}>
                  {entry.name}
                </button>
                <span
                  style={{
                    opacity: 0.55,
                    fontSize: 12,
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {entry.path}
                </span>
                <button
                  type="button"
                  title="Remove from list"
                  onClick={() => onRemoveRecent(entry.path)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <h2 style={{ fontSize: 14 }}>Docs</h2>
        <p style={{ opacity: 0.8 }}>
          See the repository README and <code>docs/guide/</code> for the full workflow (design →
          connect → build → run → export).
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" onClick={onClose}>
            Start designing
          </button>
        </div>
      </div>
    </div>
  )
}
