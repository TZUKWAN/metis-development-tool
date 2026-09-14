/**
 * Built-in capability registration: the 13 shipped capabilities, all with
 * source 'builtin'. The generated app (and the designer's insert gallery)
 * starts from this set; project/external capabilities layer on top.
 */
import { askUserCapability } from './capabilities/ask-user'
import { browserCapability } from './capabilities/browser'
import { datetimeCapability } from './capabilities/datetime'
import { fileReadCapability, fileListCapability, fileWriteCapability } from './capabilities/file-tools'
import { httpRequestCapability } from './capabilities/http-request'
import { jsonCapability } from './capabilities/json'
import { mcpCapability } from './capabilities/mcp'
import { pythonCapability } from './capabilities/python'
import { shellCapability } from './capabilities/shell'
import type { Capability } from './manifest'
import type { CapabilityRegistry } from './registry'
import { webFetchCapability } from './capabilities/web-fetch'
import { webSearchCapability } from './capabilities/web-search'

/** All built-ins, in stable registration order. */
export const builtinCapabilities: Capability[] = [
  datetimeCapability,
  jsonCapability,
  askUserCapability,
  webFetchCapability,
  webSearchCapability,
  httpRequestCapability,
  browserCapability,
  fileReadCapability,
  fileWriteCapability,
  fileListCapability,
  shellCapability,
  pythonCapability,
  mcpCapability,
]

export function registerBuiltins(registry: CapabilityRegistry): CapabilityRegistry {
  for (const capability of builtinCapabilities) {
    registry.register(capability, { source: 'builtin' })
  }
  return registry
}
