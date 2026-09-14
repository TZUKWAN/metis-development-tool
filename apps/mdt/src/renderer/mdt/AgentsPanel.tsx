/**
 * MDT Agents panel (tasklist P08.03–P08.09): create/rename/delete agents,
 * edit system instructions, configure the model policy, assign capability
 * instances, and mark the default agent. All state lives in the mdt store
 * and persists with the project document.
 */
import { createId } from '@mdt/schema'
import type React from 'react'
import { useMemo, useState } from 'react'

import { useMdtStore } from './store'
import { useCapabilityCatalog } from './capability-catalog'

export function AgentsPanel(): React.ReactElement {
  const project = useMdtStore((s) => s.project)
  const addAgent = useMdtStore((s) => s.addAgent)
  const updateAgent = useMdtStore((s) => s.updateAgent)
  const deleteAgent = useMdtStore((s) => s.deleteAgent)
  const assignCapability = useMdtStore((s) => s.assignCapability)
  const unassignCapability = useMdtStore((s) => s.unassignCapability)
  const setDefaultAgent = useMdtStore((s) => s.setDefaultAgent)
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [blockers, setBlockers] = useState<string[] | undefined>()
  const capabilityCatalog = useCapabilityCatalog()

  const selected = useMemo(
    () => project?.agents.find((a) => a.id === selectedId) ?? project?.agents[0],
    [project, selectedId],
  )
  if (!project) return <div className="mdt-panel-empty">Open a project to design agents.</div>

  return (
    <div className="mdt-agents" style={{ display: 'flex', height: '100%', color: 'var(--text)' }}>
      <aside
        style={{
          width: 220,
          borderRight: '1px solid var(--border)',
          padding: 8,
          overflowY: 'auto',
        }}
      >
        <button
          type="button"
          onClick={() => {
            addAgent({
              name: `Agent ${project.agents.length + 1}`,
              instructions: 'You are a helpful assistant.',
              provider: 'openai',
              model: 'gpt-4.1-mini',
            })
          }}
          style={{ width: '100%', marginBottom: 8 }}
        >
          + New Agent
        </button>
        {project.agents.map((agent) => (
          <div
            key={agent.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedId(agent.id)}
            onKeyDown={(e) => e.key === 'Enter' && setSelectedId(agent.id)}
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              cursor: 'pointer',
              background: selected?.id === agent.id ? 'var(--accent-soft, #eef)' : 'transparent',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>
              {agent.name}
              {agent.isDefault ? ' ★' : ''}
            </span>
            <span title="capabilities">{agent.capabilityRefs.length}</span>
          </div>
        ))}
      </aside>
      {selected ? (
        <section style={{ flex: 1, padding: 12, overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              aria-label="Agent name"
              value={selected.name}
              onChange={(e) => updateAgent(selected.id, { name: e.target.value })}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              disabled={selected.isDefault}
              onClick={() => setDefaultAgent(selected.id)}
            >
              Set default
            </button>
            <button
              type="button"
              onClick={() => {
                const result = deleteAgent(selected.id)
                setBlockers(result.blockedBy)
                if (result.removed) setSelectedId(undefined)
              }}
            >
              Delete
            </button>
          </div>
          {blockers && blockers.length > 0 && (
            <p role="alert" style={{ color: 'crimson' }}>
              Cannot delete: still referenced by {blockers.join(', ')}
            </p>
          )}

          <label style={{ display: 'block', marginBottom: 10 }}>
            <div>System instructions</div>
            <textarea
              value={selected.instructions}
              onChange={(e) => updateAgent(selected.id, { instructions: e.target.value })}
              rows={6}
              style={{ width: '100%' }}
            />
          </label>

          <fieldset style={{ marginBottom: 10 }}>
            <legend>Model policy</legend>
            <label>
              Provider{' '}
              <input
                value={selected.modelPolicy.provider}
                onChange={(e) =>
                  updateAgent(selected.id, {
                    modelPolicy: { ...selected.modelPolicy, provider: e.target.value },
                  })
                }
              />
            </label>{' '}
            <label>
              Model{' '}
              <input
                value={selected.modelPolicy.model}
                onChange={(e) =>
                  updateAgent(selected.id, {
                    modelPolicy: { ...selected.modelPolicy, model: e.target.value },
                  })
                }
              />
            </label>{' '}
            <label>
              Base URL{' '}
              <input
                placeholder="https://…/v1 (OpenAI-compatible)"
                value={selected.modelPolicy.baseUrl ?? ''}
                onChange={(e) =>
                  updateAgent(selected.id, {
                    modelPolicy: {
                      ...selected.modelPolicy,
                      baseUrl: e.target.value === '' ? undefined : e.target.value,
                    },
                  })
                }
              />
            </label>
            <p style={{ fontSize: 12, opacity: 0.7 }}>
              API keys are stored securely on this machine — never inside the project file.
            </p>
          </fieldset>

          <fieldset>
            <legend>Capabilities (tools)</legend>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px' }}>
              {selected.capabilityRefs.map((ref) => {
                const instance = project.capabilities.find((c) => c.id === ref)
                return (
                  <li
                    key={ref}
                    style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2px 0' }}
                  >
                    <span>
                      {capabilityCatalog.get(instance?.capabilityId ?? '')?.ui.icon ?? '🧩'}{' '}
                      {instance?.capabilityId ?? ref}
                    </span>
                    <button type="button" onClick={() => unassignCapability(selected.id, ref)}>
                      remove
                    </button>
                  </li>
                )
              })}
              {selected.capabilityRefs.length === 0 && (
                <li style={{ opacity: 0.6 }}>No tools assigned yet</li>
              )}
            </ul>
            <AddCapability onAdd={(instanceId) => assignCapability(selected.id, instanceId)} />
          </fieldset>
        </section>
      ) : (
        <section style={{ flex: 1, display: 'grid', placeItems: 'center', opacity: 0.6 }}>
          Create an agent to get started
        </section>
      )}
    </div>
  )
}

function AddCapability({ onAdd }: { onAdd: (instanceId: string) => void }): React.ReactElement {
  const project = useMdtStore((s) => s.project)
  const addInstance = useMdtStore((s) => s.addCapabilityInstance)
  const capabilityCatalog = useCapabilityCatalog()
  const [adding, setAdding] = useState(false)
  return (
    <div>
      {!adding ? (
        <button type="button" onClick={() => setAdding(true)}>
          + Add capability
        </button>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {[...capabilityCatalog.entries()].map(([id, manifest]) => (
            <button
              key={id}
              type="button"
              title={manifest.ui.summary}
              onClick={() => {
                if (!project) return
                const instanceId = createId()
                addInstance({
                  id: instanceId,
                  capabilityId: id,
                  version: manifest.version,
                  config: {},
                  secrets: {},
                  permissions: manifest.permissions.map((p) => ({
                    scope: p.scope,
                    granted: p.defaultGranted,
                  })),
                })
                onAdd(instanceId)
                setAdding(false)
              }}
            >
              {manifest.ui.icon} {id}
            </button>
          ))}
          <button type="button" onClick={() => setAdding(false)}>
            cancel
          </button>
        </div>
      )}
    </div>
  )
}
