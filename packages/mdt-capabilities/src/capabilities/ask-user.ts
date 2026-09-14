/**
 * `ask_user` capability (tasklist P09.20): lets an agent pause and request
 * input from the UI. Waiting is cancellable through ctx.signal — a cancelled
 * or timed-out question resolves as unanswered with a typed error so the
 * runtime can surface it (never hangs the agent loop).
 */
import type { Capability } from '../manifest'

export const askUserCapability: Capability = {
  manifest: {
    id: 'ask_user',
    name: 'Ask the User',
    version: '1.0.0',
    category: 'user-interaction',
    description: 'Ask the user a question in the app UI and wait for the answer (text, confirm or select).',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['text', 'confirm', 'select'], description: 'question style' },
        question: { type: 'string', description: 'what to ask' },
        options: { type: 'array', items: { type: 'string' }, description: 'choices for select' },
        placeholder: { type: 'string', description: 'text input placeholder' },
        timeoutMs: { type: 'number', description: 'give-up time; the agent receives a timeout error' },
      },
      required: ['kind', 'question'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { answered: { type: 'boolean' }, value: {} },
      required: ['answered'],
      additionalProperties: false,
    },
    permissions: [{ scope: 'user-interaction', detail: 'shows questions in the app UI', required: true, defaultGranted: true }],
    secrets: [],
    ui: {
      icon: '❓',
      accent: '#5b8def',
      summary: 'Ask the user for input mid-task',
      keywords: ['ask', 'prompt', 'confirm', 'user'],
      doc: 'ask-user',
    },
    timeoutMs: 30_000,
    maxOutputBytes: 1_000_000,
  },
  async execute(input, ctx) {
    const kind = input.kind === 'confirm' || input.kind === 'select' ? input.kind : 'text'
    const question = String(input.question ?? '')
    if (question.length === 0) throw new Error('question must not be empty')
    if (kind === 'select' && (!Array.isArray(input.options) || input.options.length === 0)) {
      throw new Error('select questions need a non-empty options array')
    }
    const timeoutMs = typeof input.timeoutMs === 'number' && input.timeoutMs > 0 ? input.timeoutMs : undefined
    const answer = await withCancellation(
      ctx.askUser({
        kind,
        question,
        options: Array.isArray(input.options) ? input.options.map(String) : undefined,
        placeholder: typeof input.placeholder === 'string' ? input.placeholder : undefined,
        timeoutMs,
      }),
      ctx.signal,
      timeoutMs,
    )
    return { answered: answer.answered, value: answer.value as Record<string, unknown> | undefined }
  },
}

async function withCancellation(
  promise: Promise<{ answered: boolean; value?: string | boolean }>,
  signal: AbortSignal,
  timeoutMs: number | undefined,
): Promise<{ answered: boolean; value?: string | boolean }> {
  const controllers: ((reason?: unknown) => void)[] = []
  const cleanup = () => controllers.forEach((c) => c())
  const abortPromise = new Promise<never>((_, reject) => {
    if (signal.aborted) return reject(new Error('ask_user cancelled'))
    const onAbort = () => reject(new Error('ask_user cancelled'))
    signal.addEventListener('abort', onAbort, { once: true })
    controllers.push(() => signal.removeEventListener('abort', onAbort))
  })
  const timeoutPromise =
    timeoutMs === undefined
      ? null
      : new Promise<never>((_, reject) => {
          const t = setTimeout(() => reject(new Error(`ask_user timed out after ${timeoutMs}ms`)), timeoutMs)
          controllers.push(() => clearTimeout(t))
        })
  try {
    return await Promise.race([promise, abortPromise, ...(timeoutPromise ? [timeoutPromise] : [])])
  } finally {
    cleanup()
  }
}
