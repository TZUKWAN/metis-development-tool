/**
 * Fake `codex app-server` for protocol tests: a Node child that speaks the
 * newline-delimited JSON-RPC flow codex-cli 0.144.1 speaks (verified in
 * docs/upstream/CODEX_BASELINE.md). Scripted per-test via a JSON file path
 * in argv[2].
 *
 * Script flags (all optional, composable):
 *   exitAfterInitialize      — process.exit(3) right after the initialize reply
 *   replyGarbage             — emit a non-JSON line after turn/started
 *   respondTurnStart         — false leaves the turn/start request dangling
 *   emitTurnCompleted        — false suppresses the synthetic turn/completed
 *   errorOnInitialize        — reply to initialize with a JSON-RPC error
 *   errorMessage             — the error message for errorOnInitialize
 *   stderrPing               — write a line to stderr at startup
 *   blankLines               — emit empty lines after the initialize reply
 *   unknownIdResponse        — reply with a result for an id nobody sent
 *   jsonScalar               — emit a JSON line that is neither request nor notification
 *   noThread                 — (unused) reply to thread/start WITHOUT a thread id
 *   dangleAllRequests        — never answer thread/start or turn/start
 *   strayEvents              — emit a broad mix of notifications on turn/start
 *   turnFailed               — the synthetic turn completes with status "failed"
 *   holdUntilInterrupt       — never answer turn/start; wait for turn/interrupt
 *   exitAfterTurnStarted     — exit(7) right after turn/started
 *   pingStrayNotify          — mdt/ping first emits a thread/started notification
 */
import fs from 'node:fs'

const scriptPath = process.argv[2]
const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'))

if (script.stderrPing) process.stderr.write(`${script.stderrPing}\n`)

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let index
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index).trim()
    buffer = buffer.slice(index + 1)
    if (line) handle(JSON.parse(line))
  }
})
process.stdin.resume()

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n')
}

function raw(text) {
  process.stdout.write(text)
}

function emitStrayEvents() {
  // numeric payloads exercise the client's string coercion
  send({ jsonrpc: '2.0', method: 'thread/started', params: { thread: { id: 987 } } })
  send({ jsonrpc: '2.0', method: 'command/exec/outputDelta', params: { delta: 42 } })
  send({ jsonrpc: '2.0', method: 'turn/diff/updated', params: {} })
  send({ jsonrpc: '2.0', method: 'error', params: { message: 'mid-turn warning' } })
  send({
    jsonrpc: '2.0',
    method: 'item/started',
    params: { item: { type: 'commandExecution', command: 'npm test' } },
  })
  send({
    jsonrpc: '2.0',
    method: 'item/completed',
    params: { item: { type: 'commandExecution', command: 'npm test', exitCode: 0 } },
  })
  // a fileChange that started is ignored (only item/completed maps)
  send({
    jsonrpc: '2.0',
    method: 'item/started',
    params: { item: { type: 'fileChange', changes: [{ path: 'x.ts' }] } },
  })
  // completed fileChange: paths are extracted, empty/missing ones filtered
  send({
    jsonrpc: '2.0',
    method: 'item/completed',
    params: {
      item: { type: 'fileChange', changes: [{ path: 'src/a.ts' }, { path: '' }, { nope: 1 }] },
    },
  })
  // a fileChange without a changes array maps to an empty file list
  send({ jsonrpc: '2.0', method: 'item/completed', params: { item: { type: 'fileChange' } } })
  // unknown item types and item-less payloads are ignored
  send({ jsonrpc: '2.0', method: 'item/completed', params: { item: { type: 'mystery' } } })
  send({ jsonrpc: '2.0', method: 'item/completed', params: {} })
  // a non-item method falls through the default switch arm
  send({ jsonrpc: '2.0', method: 'mdt/unknown', params: {} })
}

function handle(message) {
  if (message.method === 'initialize' && message.id !== undefined) {
    if (script.errorOnInitialize) {
      send({
        jsonrpc: '2.0',
        id: message.id,
        error: { message: script.errorMessage ?? 'boom' },
      })
      return
    }
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: { codexHome: '/tmp/codex', platformOs: process.platform },
    })
    if (script.blankLines) raw('\n\n')
    if (script.unknownIdResponse) send({ jsonrpc: '2.0', id: 987654, result: { stray: true } })
    if (script.jsonScalar) raw('"just a scalar, not a request"\n')
    if (script.exitAfterInitialize) process.exit(3)
    return
  }
  if (message.method === 'mdt/ping' && message.id !== undefined) {
    if (script.pingStrayNotify) {
      send({ jsonrpc: '2.0', method: 'thread/started', params: { thread: { id: 'again' } } })
    }
    send({ jsonrpc: '2.0', id: message.id, result: { pong: true } })
    return
  }
  if (message.method === 'thread/start' && message.id !== undefined) {
    if (script.dangleAllRequests) {
      // never answer — the client's request-level timeout must fire
      return
    }
    send({ jsonrpc: '2.0', method: 'thread/started', params: { thread: { id: 'thread-test-1' } } })
    send({ jsonrpc: '2.0', id: message.id, result: { thread: { id: 'thread-test-1' } } })
    return
  }
  if (message.method === 'turn/start' && message.id !== undefined) {
    send({
      jsonrpc: '2.0',
      method: 'turn/started',
      params: { threadId: 'thread-test-1', turn: { id: 'turn-1' } },
    })
    if (script.holdUntilInterrupt || script.exitAfterTurnStarted) {
      // synchronization ping: tests wait for this stderr marker (surfaced as
      // a "codex stderr: turn-started" event) before aborting/asserting
      process.stderr.write('turn-started\n')
    }
    if (script.strayEvents) emitStrayEvents()
    if (script.replyGarbage) {
      raw('this is not json\n')
    }
    if (script.holdUntilInterrupt) {
      // leave the request dangling; the turn/interrupt handler answers below
      return
    }
    if (script.exitAfterTurnStarted) {
      setImmediate(() => process.exit(7))
      return
    }
    if (script.respondTurnStart !== false) {
      send({ jsonrpc: '2.0', id: message.id, result: { turn: { id: 'turn-1' } } })
      if (script.emitTurnCompleted !== false) {
        setImmediate(() => {
          send({
            jsonrpc: '2.0',
            method: 'item/agentMessage/delta',
            params: { delta: 'Build done. ' },
          })
          const status = script.turnFailed ? 'failed' : 'completed'
          send({
            jsonrpc: '2.0',
            method: 'turn/completed',
            params: {
              threadId: 'thread-test-1',
              turn: {
                id: 'turn-1',
                status,
                usage: {},
                ...(script.turnFailed ? { error: { message: 'gate failed' } } : {}),
              },
            },
          })
        })
      }
    }
    // if respondTurnStart is false, the request is left dangling → client timeout path
    return
  }
  if (message.method === 'turn/interrupt' && message.id !== undefined) {
    send({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: { threadId: 'thread-test-1', turn: { id: 'turn-1', status: 'interrupted' } },
    })
    send({ jsonrpc: '2.0', id: message.id, result: {} })
    process.exit(0)
  }
}
