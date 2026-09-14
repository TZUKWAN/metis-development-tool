/**
 * MDT dock (P03.12, P06.01): a compact always-available surface with the
 * MDT-specific views — Agents, Build — plus the project menu (New / Open /
 * Recent / Docs). Sits beside the PowerPoint-style designer without
 * disturbing the inherited editor layout.
 */
import { useEffect, useState } from 'react'
import type React from 'react'

import { AgentsPanel } from './AgentsPanel'
import { BuildPanel } from './BuildPanel'
import { InteractionCanvas } from './InteractionCanvas'
import { SemanticsInspector } from './SemanticsInspector'
import { Welcome } from './Welcome'
import { useMdtStore } from './store'
import { useDeckSync } from './use-deck-sync'

type Tab = 'agents' | 'interactions' | 'semantics' | 'build' | null

export function MdtDock(): React.ReactElement | null {
  const loadProject = useMdtStore((s) => s.loadProject)
  const newProject = useMdtStore((s) => s.newProject)
  const [tab, setTab] = useState<Tab>('agents')
  const [showWelcome, setShowWelcome] = useState(true)
  useDeckSync()
  const [recent, setRecent] = useState<{ path: string; name: string; lastOpenedAt: string }[]>([])

  useEffect(() => {
    void window.mdtApi?.recentList().then((r) => {
      const payload = r as { entries?: { path: string; name: string; lastOpenedAt: string }[] }
      setRecent(payload.entries ?? [])
    })
  }, [showWelcome])

  async function openPath(root: string): Promise<void> {
    const result = (await window.mdtApi?.openPath(root)) as {
      ok?: boolean
      project?: never
      error?: string
    }
    if (result?.ok && result.project) {
      loadProject(result.project as never, { ids: {}, pageTypes: {}, semantics: {} })
      setShowWelcome(false)
    } else if (result?.error) {
      alert(`Cannot open project: ${result.error}`)
    }
  }

  return (
    <>
      {showWelcome && (
        <Welcome
          onClose={() => setShowWelcome(false)}
          onNew={(name) => {
            newProject(name)
            void window.mdtApi?.createProject(name)
            setShowWelcome(false)
          }}
          onOpen={() =>
            void window.mdtApi?.openFileDialog().then((r) => {
              const payload = r as { ok?: boolean; project?: never; root?: string; error?: string }
              if (payload?.ok && payload.project) {
                loadProject(payload.project as never, { ids: {}, pageTypes: {}, semantics: {} })
                setShowWelcome(false)
              } else if (payload?.error && payload.error !== 'canceled') {
                alert(`Cannot open project: ${payload.error}`)
              }
            })
          }
          recent={recent}
          onOpenRecent={(path) => void openPath(path)}
          onRemoveRecent={(path) => {
            void window.mdtApi?.recentRemove(path)
            setRecent((prev) => prev.filter((e) => e.path !== path))
          }}
        />
      )}
      <div
        data-mdt-dock
        style={{
          position: 'fixed',
          right: 0,
          top: 48,
          bottom: 0,
          width: tab === null ? 44 : 460,
          background: 'var(--surface, #fff)',
          borderLeft: '1px solid var(--border, #ddd)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 60,
        }}
      >
        <div
          role="tablist"
          aria-label="MDT tools"
          style={{ display: 'flex', borderBottom: '1px solid var(--border, #ddd)' }}
        >
          <button
            role="tab"
            aria-selected={tab === 'agents'}
            type="button"
            onClick={() => setTab(tab === 'agents' ? null : 'agents')}
            style={{ flex: 1, padding: 8 }}
          >
            Agents
          </button>
          <button
            role="tab"
            aria-selected={tab === 'interactions'}
            type="button"
            onClick={() => setTab(tab === 'interactions' ? null : 'interactions')}
            style={{ flex: 1, padding: 8 }}
          >
            Interactions
          </button>
          <button
            role="tab"
            aria-selected={tab === 'semantics'}
            type="button"
            onClick={() => setTab(tab === 'semantics' ? null : 'semantics')}
            style={{ flex: 1, padding: 8 }}
          >
            Semantics
          </button>
          <button
            role="tab"
            aria-selected={tab === 'build'}
            type="button"
            onClick={() => setTab(tab === 'build' ? null : 'build')}
            style={{ flex: 1, padding: 8 }}
          >
            Build
          </button>
          <button
            type="button"
            title="Project menu"
            onClick={() => setShowWelcome(true)}
            style={{ padding: 8 }}
          >
            ⌂
          </button>
        </div>
        {tab === 'agents' && <AgentsPanel />}
        {tab === 'interactions' && <InteractionCanvas />}
        {tab === 'semantics' && <SemanticsInspector />}
        {tab === 'build' && <BuildPanel />}
      </div>
    </>
  )
}
