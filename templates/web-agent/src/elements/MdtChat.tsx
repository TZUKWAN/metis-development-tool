import { useEffect, useRef, useState } from 'react'

import type { ChatMessage } from '../shared/protocol'
import { mdtProps, type MdtElementBaseProps } from './layout'

export interface MdtChatProps extends MdtElementBaseProps {
  messages: ChatMessage[]
  label?: string
  placeholder?: string
  running?: boolean
  onSend?: (message: string) => void
  onCancel?: () => void
}

/**
 * Chat element: a scrollable transcript plus a composer row. Sending emits
 * onSend(text); the page binds it to the agent client.
 */
export function MdtChat({
  messages,
  label,
  placeholder = 'Send a message…',
  running,
  onSend,
  onCancel,
  ...base
}: MdtChatProps) {
  const [draft, setDraft] = useState('')
  const transcriptRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight })
  }, [messages])

  return (
    <div
      {...mdtProps({ ...base, className: base.className ?? 'mdt-chat' })}
      role="log"
      aria-label={label}
    >
      <div className="mdt-chat-transcript" ref={transcriptRef}>
        {messages.length === 0 && <p className="mdt-chat-empty">No messages yet.</p>}
        {messages.map((message, index) => (
          <div key={index} className={`mdt-chat-message mdt-chat-${message.role}`}>
            <span className="mdt-chat-role">{message.role === 'user' ? 'You' : 'Agent'}</span>
            <p>
              {message.text}
              {message.pending === true && <span className="mdt-chat-pending"> …</span>}
            </p>
          </div>
        ))}
      </div>
      <div className="mdt-chat-composer">
        <input
          type="text"
          value={draft}
          aria-label={label !== undefined ? `${label} input` : 'Message input'}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && draft.trim() !== '') {
              onSend?.(draft)
              setDraft('')
            }
          }}
          disabled={running === true}
        />
        {running === true ? (
          <button type="button" onClick={() => onCancel?.()}>
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (draft.trim() === '') return
              onSend?.(draft)
              setDraft('')
            }}
          >
            Send
          </button>
        )}
      </div>
      {base.children}
    </div>
  )
}
