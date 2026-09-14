/**
 * Self-contained `ask_user` capability for generated apps (generator-owned
 * runtime source; emitted verbatim into server/capabilities/ask_user.js).
 * Plain JS, zero dependencies. Port of @mdt/capabilities ask-user.ts: lets
 * an agent pause and request input from the UI (text, confirm or select).
 *
 * Ask bridge wiring: `execute(input, ctx)` posts the question through
 * `ctx.askUser`, which the generated server's dependency injection provides
 * (server/index.js builds the capability context). When `ctx.askUser` is
 * absent the module falls back to the documented extension point
 * `globalThis.__mdtAskUser(request)` — a host may assign it before invoking
 * capabilities. If neither bridge exists the call throws instead of hanging
 * the agent loop. Waiting is cancellable through ctx.signal and honours
 * timeoutMs — a cancelled or timed-out question rejects with a typed error.
 */

/** Resolve the ask bridge: injected ctx hook first, globalThis fallback second. */
function resolveAskBridge(ctx) {
  if (typeof ctx.askUser === 'function') return ctx.askUser
  if (typeof globalThis.__mdtAskUser === 'function') return globalThis.__mdtAskUser
  return null
}

function withCancellation(promise, signal, timeoutMs) {
  const disposers = []
  const cleanup = () => disposers.forEach((dispose) => dispose())
  const abortPromise = new Promise((_, reject) => {
    if (signal.aborted) return reject(new Error('ask_user cancelled'))
    const onAbort = () => reject(new Error('ask_user cancelled'))
    signal.addEventListener('abort', onAbort, { once: true })
    disposers.push(() => signal.removeEventListener('abort', onAbort))
  })
  const timeoutPromise =
    timeoutMs === undefined
      ? null
      : new Promise((_, reject) => {
          const t = setTimeout(
            () => reject(new Error(`ask_user timed out after ${timeoutMs}ms`)),
            timeoutMs,
          )
          disposers.push(() => clearTimeout(t))
        })
  return Promise.race(
    timeoutPromise === null ? [promise, abortPromise] : [promise, abortPromise, timeoutPromise],
  ).finally(cleanup)
}

export async function execute(input, ctx) {
  const kind = input.kind === 'confirm' || input.kind === 'select' ? input.kind : 'text'
  const question = String(input.question ?? '')
  if (question.length === 0) throw new Error('question must not be empty')
  if (kind === 'select' && (!Array.isArray(input.options) || input.options.length === 0)) {
    throw new Error('select questions need a non-empty options array')
  }
  const timeoutMs =
    typeof input.timeoutMs === 'number' && input.timeoutMs > 0 ? input.timeoutMs : undefined

  const askBridge = resolveAskBridge(ctx)
  if (askBridge === null) {
    throw new Error('ask_user requires an ask bridge — wire one in server/index.js')
  }

  const answer = await withCancellation(
    askBridge({
      kind,
      question,
      options: Array.isArray(input.options) ? input.options.map(String) : undefined,
      placeholder: typeof input.placeholder === 'string' ? input.placeholder : undefined,
      timeoutMs,
    }),
    ctx.signal,
    timeoutMs,
  )
  return { answered: answer.answered, value: answer.value }
}
