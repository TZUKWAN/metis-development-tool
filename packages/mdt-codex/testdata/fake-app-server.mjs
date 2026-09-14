/**
 * Fake `codex app-server` for protocol tests: a Node child that speaks the
 * newline-delimited JSON-RPC flow codex-cli 0.144.1 speaks (verified in
 * docs/upstream/CODEX_BASELINE.md). Scripted per-test via a JSON file path
 * in argv[2].
 */
import fs from 'node:fs'

const scriptPath = process.argv[2]
const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'))

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

function handle(message) {
  if (message.method === 'initialize' && message.id !== undefined) {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: { codexHome: '/tmp/codex', platformOs: process.platform },
    })
    if (script.exitAfterInitialize) process.exit(3)
    return
  }
  if (message.method === 'thread/start' && message.id !== undefined) {
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
    if (script.replyGarbage) {
      process.stdout.write('this is not json\n')
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
          send({
            jsonrpc: '2.0',
            method: 'turn/completed',
            params: {
              threadId: 'thread-test-1',
              turn: { id: 'turn-1', status: 'completed', usage: {} },
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
