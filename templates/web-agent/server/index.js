/**
 * Agent service for the MDT-generated app (ADR-0006 §2): Express + SSE,
 * wrapping Pi Agent Core via ./pi-runtime.js. Plain ESM JavaScript — zero
 * build step. Capabilities run in-process through the generated modules in
 * ./capabilities/, making this service the security boundary.
 *
 * Routes:
 *   GET  /api/health                      → { ok: true }
 *   POST /api/agent/:agentId/run          → SSE stream of RuntimeEvent JSON
 *   POST /api/agent/:agentId/cancel       → abort the active run
 *   POST /api/capability/:instanceId      → direct capability invocation
 *
 * Environment (see .env.example):
 *   MDT_PROVIDER_API_KEY_<PROVIDER>  API key per provider (e.g. …_OPENAI)
 *   MDT_LLM_API_KEY                  fallback key for any provider
 *   MDT_LLM_BASE_URL                 override for every agent's base URL
 *   MDT_LLM_MODEL                    override for every agent's model
 *   MDT_PORT                         service port (default 8790)
 *   MDT_SECRET_<NAME>                capability secret values by slot name
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

import 'dotenv/config'
import express from 'express'

import { createRuntimeAgent } from './pi-runtime.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Load generated agents.config.json + capability modules (source of truth). */
export async function loadDefaultDeps(options = {}) {
  const configPath = join(__dirname, 'agents.config.json')
  const agentsConfig = options.agentsConfig ?? readAgentsConfig(configPath)
  const capabilityHost = options.capabilityHost ?? (await loadCapabilityHost())
  return {
    agentsConfig,
    capabilityHost,
    createRuntimeAgent,
    getApiKey: options.getApiKey ?? defaultGetApiKey,
    log: options.log ?? ((message) => console.log(`[mdt] ${message}`)),
  }
}

function readAgentsConfig(configPath) {
  if (!existsSync(configPath)) {
    return { agents: [] } // no agents generated yet — service still serves /api/health
  }
  return JSON.parse(readFileSync(configPath, 'utf8'))
}

function loadCapabilityHost() {
  const hostPath = join(__dirname, 'capabilities', 'index.js')
  if (!existsSync(hostPath)) return { capabilityExecutors: {}, capabilityInstances: [] }
  // Generated, self-contained modules — no MDT package dependency (P11.21).
  // pathToFileURL: dynamic import needs a file:// URL on Windows absolute paths.
  return import(pathToFileURL(hostPath).href)
}

/**
 * API keys come from THIS app's environment only. Custom provider names get
 * no env fallback inside Pi, so we resolve explicitly (PI_BASELINE §2).
 */
export function defaultGetApiKey(provider) {
  const normalized = provider.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()
  return process.env[`MDT_PROVIDER_API_KEY_${normalized}`] ?? process.env.MDT_LLM_API_KEY
}

function applyEnvOverrides(policy) {
  const overridden = { ...policy }
  if (process.env.MDT_LLM_BASE_URL) overridden.baseUrl = process.env.MDT_LLM_BASE_URL
  if (process.env.MDT_LLM_MODEL) overridden.model = process.env.MDT_LLM_MODEL
  return overridden
}

export function createApp(deps = loadDefaultDeps()) {
  const app = express()
  app.use(express.json({ limit: '2mb' }))
  /** agentId → runtime agent per session, keyed `${agentId}:${sessionId}` */
  const sessions = new Map()

  const findAgentConfig = (agentId) =>
    deps.agentsConfig.agents.find((agent) => agent.id === agentId) ?? null

  function getOrCreateSession(agentId, sessionId) {
    const key = `${agentId}:${sessionId}`
    let session = sessions.get(key)
    if (session) return session
    const agentConfig = findAgentConfig(agentId)
    if (!agentConfig) return null
    const config = { ...agentConfig, modelPolicy: applyEnvOverrides(agentConfig.modelPolicy) }
    // Tools: one registered tool per capability instance assigned to this
    // agent (deduped by capability id — tool names must be unique).
    const instances = agentConfig.capabilityInstanceIds
      .map((instanceId) => deps.capabilityHost.capabilityInstances.find((i) => i.instanceId === instanceId))
      .filter((instance) => instance !== undefined)
    const seen = new Set()
    const tools = []
    for (const instance of instances) {
      if (seen.has(instance.capabilityId)) continue
      seen.add(instance.capabilityId)
      const executor = deps.capabilityHost.capabilityExecutors[instance.capabilityId]
      if (!executor) continue
      tools.push(makeTool(instance, executor, deps))
    }
    const runtime = deps.createRuntimeAgent({
      config,
      tools,
      getApiKey: deps.getApiKey,
    })
    session = { runtime, config }
    sessions.set(key, session)
    return session
  }

  function makeTool(instance, executor, hostDeps) {
    return {
      name: executor.manifest.id,
      description: executor.manifest.description,
      parameters: executor.manifest.inputSchema,
      execute: async (args, signal, onProgress) => {
        const ctx = buildCapabilityContext(instance, hostDeps, signal, onProgress)
        const output = await executor.execute(args ?? {}, ctx)
        return { content: output }
      },
    }
  }

  function buildCapabilityContext(instance, hostDeps, signal, onProgress) {
    const secrets = {}
    for (const [slot, envName] of Object.entries(instance.secretEnv ?? {})) {
      const value = process.env[envName]
      if (value !== undefined) secrets[slot] = value
    }
    return {
      secrets,
      granted: new Set(instance.grantedScopes ?? []),
      sandboxRoots: [process.cwd()],
      workdir: process.cwd(),
      envAllowlist: ['PATH', 'LANG', 'TZ'],
      signal: signal ?? new AbortController().signal,
      askUser: async () => ({ answered: false }),
      log: (message) => {
        hostDeps.log(`[${instance.capabilityId}] ${message}`)
        onProgress?.(message)
      },
    }
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  // SSE run stream: normalized RuntimeEvent JSON per `data:` line, ending
  // after run_end.
  app.post('/api/agent/:agentId/run', async (req, res) => {
    const { agentId } = req.params
    const message = typeof req.body?.message === 'string' ? req.body.message : ''
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : ''
    if (message === '' || sessionId === '') {
      res.status(400).json({ ok: false, error: 'message and sessionId are required' })
      return
    }
    const session = getOrCreateSession(agentId, sessionId)
    if (session === null) {
      res.status(404).json({ ok: false, error: `unknown agent "${agentId}"` })
      return
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    const writeEvent = (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }
    const unsubscribe = session.runtime.subscribe(writeEvent)
    try {
      await session.runtime.run(message)
    } finally {
      unsubscribe()
      res.end()
    }
  })

  app.post('/api/agent/:agentId/cancel', (req, res) => {
    const { agentId } = req.params
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : ''
    const session = sessions.get(`${agentId}:${sessionId}`)
    if (!session) {
      res.status(404).json({ ok: false, error: 'no active session for this agent' })
      return
    }
    session.runtime.abort()
    res.json({ ok: true })
  })

  // Direct capability invocation for invokeCapability interactions.
  app.post('/api/capability/:instanceId', async (req, res) => {
    const { instanceId } = req.params
    const instance = deps.capabilityHost.capabilityInstances.find((i) => i.instanceId === instanceId)
    if (!instance) {
      res.status(404).json({ ok: false, error: `unknown capability instance "${instanceId}"` })
      return
    }
    const executor = deps.capabilityHost.capabilityExecutors[instance.capabilityId]
    if (!executor) {
      res.status(500).json({
        ok: false,
        error: `capability "${instance.capabilityId}" is not bundled with this generated app`,
      })
      return
    }
    const controller = new AbortController()
    res.on('close', () => controller.abort())
    const ctx = buildCapabilityContext(instance, deps, controller.signal)
    try {
      const content = await executor.execute(req.body?.args ?? {}, ctx)
      res.json({ ok: true, content })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      deps.log(`[${instance.capabilityId}] failed: ${message}`)
      res.status(500).json({ ok: false, error: message })
    }
  })

  return { app, sessions }
}

function isMainModule() {
  const entry = process.argv[1]
  if (!entry) return false
  return fileURLToPath(import.meta.url) === entry
}

if (isMainModule()) {
  const port = Number(process.env.MDT_PORT ?? 8790)
  void loadDefaultDeps().then((deps) => {
    const { app } = createApp(deps)
    app.listen(port, () => {
      console.log(`[mdt] agent service listening on http://127.0.0.1:${port}`)
    })
  })
}
