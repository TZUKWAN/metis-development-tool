/**
 * Semantics inspector (tasklist P06.19–P06.27 extension): edit the MDT
 * meaning of a designed element — semantic role, accessible name,
 * placeholder, options, bound agent for chat. Also sets the page type
 * (page/modal/drawer/popover) for the current page.
 */
import { useState } from 'react'
import type React from 'react'

import { useMdtStore } from './store'

export function SemanticsInspector(): React.ReactElement {
  const project = useMdtStore((s) => s.project)
  const currentPageId = useMdtStore((s) => s.ui.currentPageId)
  const updateElementSemantics = useMdtStore((s) => s.updateElementSemantics)
  const setNodeType = useMdtStore((s) => s.setNodeType)
  const [pageId, setPageId] = useState<string | undefined>(currentPageId)
  const [elementId, setElementId] = useState<string | undefined>()

  const page = project?.pages.find((p) => p.id === (pageId ?? currentPageId))
  const element = page?.elements.find((e) => e.id === elementId) ?? page?.elements[0]
  const agents = project?.agents ?? []

  if (!project) return <div style={{ padding: 12, opacity: 0.6 }}>Open a project first.</div>

  return (
    <div
      style={{
        padding: 12,
        color: 'var(--text)',
        fontSize: 13,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <label>
        <div>Page</div>
        <select
          value={page?.id ?? ''}
          onChange={(e) => {
            setPageId(e.target.value)
            setElementId(undefined)
          }}
          style={{ width: '100%' }}
        >
          {project.pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      {page && (
        <label>
          <div>Page type</div>
          <select
            value={page.type}
            onChange={(e) => {
              const next = e.target.value as 'page' | 'modal' | 'drawer' | 'popover'
              setNodeType(page.id, next, next === 'drawer' ? 'right' : undefined)
            }}
            style={{ width: '100%' }}
          >
            <option value="page">Page</option>
            <option value="modal">Modal</option>
            <option value="drawer">Drawer</option>
            <option value="popover">Popover</option>
          </select>
        </label>
      )}

      {page && (
        <label>
          <div>Element</div>
          <select
            value={element?.id ?? ''}
            onChange={(e) => setElementId(e.target.value)}
            style={{ width: '100%' }}
          >
            {page.elements.map((el) => (
              <option key={el.id} value={el.id}>
                {el.name} ({el.role})
              </option>
            ))}
          </select>
        </label>
      )}

      {element && page && (
        <fieldset style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <legend>Semantics</legend>
          <label>
            <div>Accessible name</div>
            <input
              value={element.semantics.label ?? ''}
              onChange={(e) =>
                updateElementSemantics(page.id, element.id, { label: e.target.value })
              }
              style={{ width: '100%' }}
            />
          </label>
          {(element.role === 'input' ||
            element.role === 'textarea' ||
            element.role === 'button' ||
            element.role === 'chat') && (
            <label>
              <div>Placeholder</div>
              <input
                value={element.semantics.placeholder ?? ''}
                onChange={(e) =>
                  updateElementSemantics(page.id, element.id, { placeholder: e.target.value })
                }
                style={{ width: '100%' }}
              />
            </label>
          )}
          {(element.role === 'checkbox' || element.role === 'select' || element.role === 'tabs') && (
            <label>
              <div>Options (one per line)</div>
              <textarea
                value={(element.semantics.options ?? []).join('\n')}
                onChange={(e) =>
                  updateElementSemantics(page.id, element.id, {
                    options: e.target.value.split('\n').filter((line) => line.trim() !== ''),
                  })
                }
                rows={4}
                style={{ width: '100%' }}
              />
            </label>
          )}
          {element.role === 'filepicker' && (
            <>
              <label>
                <div>Accept (file types, e.g. ".txt,.md")</div>
                <input
                  value={element.semantics.accept ?? ''}
                  onChange={(e) =>
                    updateElementSemantics(page.id, element.id, { accept: e.target.value })
                  }
                  style={{ width: '100%' }}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={element.semantics.multiple === true}
                  onChange={(e) =>
                    updateElementSemantics(page.id, element.id, { multiple: e.target.checked })
                  }
                />
                <div>Allow multiple files</div>
              </label>
            </>
          )}
          {element.role === 'browserframe' && (
            <label>
              <div>URL (http/https)</div>
              <input
                value={element.semantics.url ?? ''}
                onChange={(e) =>
                  updateElementSemantics(page.id, element.id, { url: e.target.value })
                }
                style={{ width: '100%' }}
              />
            </label>
          )}
          {element.role === 'chat' && (
            <label>
              <div>Bound agent</div>
              <select
                value={element.semantics.agentRef ?? ''}
                onChange={(e) =>
                  updateElementSemantics(page.id, element.id, {
                    agentRef: e.target.value === '' ? undefined : e.target.value,
                  })
                }
                style={{ width: '100%' }}
              >
                <option value="">— none —</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>
      )}
    </div>
  )
}
