/**
 * Project store: open / create / save / save-as (tasklist P05.01, P05.02,
 * P05.09). Schema validation on every load with machine-readable issues;
 * atomic writes on every save; corrupted projects never overwrite the file
 * on disk.
 */
import fs from 'node:fs'
import path from 'node:path'

import {
  SCHEMA_VERSION,
  createId,
  parseProject,
  type ProjectParseResult,
  type ProjectRoot,
} from '@mdt/schema'

import { atomicWriteFileSync, looksLikeProject, projectPaths, type ProjectPaths } from './layout'

export type SaveErrorReason = 'readonly' | 'disk' | 'unknown'

export class ProjectStoreError extends Error {
  readonly reason: SaveErrorReason
  readonly path?: string
  constructor(reason: SaveErrorReason, message: string, path?: string) {
    super(message)
    this.name = 'ProjectStoreError'
    this.reason = reason
    this.path = path
  }
}

export interface OpenResult {
  paths: ProjectPaths
  parse: ProjectParseResult
  /** migrated from an older schema version (input was backed up before save) */
  migratedFrom?: number
}

/** Read + validate a project directory; never mutates anything on disk. */
export function openProject(root: string): OpenResult {
  const paths = projectPaths(root)
  if (!looksLikeProject(root)) {
    return {
      paths,
      parse: {
        ok: false,
        issues: [
          {
            path: '(file)',
            message: `${paths.projectFile} not found — not an MDT project directory`,
          },
        ],
        error: 'not an MDT project directory',
      },
    }
  }
  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(paths.projectFile, 'utf8'))
  } catch (err) {
    return {
      paths,
      parse: {
        ok: false,
        issues: [
          { path: '(file)', message: `project file is not valid JSON: ${(err as Error).message}` },
        ],
        error: 'unparsable project file',
      },
    }
  }
  const parse = parseProject(raw)
  if (!parse.ok) return { paths, parse }
  return { paths, parse }
}

/** Create a fresh project directory on disk and return the parsed model. */
export function createProject(
  root: string,
  name: string,
  now = new Date().toISOString(),
): ProjectRoot {
  const project: ProjectRoot = {
    schemaVersion: SCHEMA_VERSION,
    id: createId(),
    name,
    createdAt: now,
    updatedAt: now,
    pages: [],
    components: [],
    agents: [],
    capabilities: [],
    interactions: [],
    bindings: [],
    variables: [],
    assets: [],
    settings: {
      theme: { colors: {}, fonts: {} },
      viewportPresets: [
        { name: 'desktop-1440', width: 1440, height: 1024 },
        { name: 'tablet-1024', width: 1024, height: 1366 },
        { name: 'mobile-390', width: 390, height: 844 },
      ],
      locale: 'en',
      generator: { target: 'web-agent', dependencyOverrides: {} },
    },
  }
  saveProject(root, project)
  return project
}

/** Serialize + atomically persist a project; stamps updatedAt. */
export function saveProject(
  root: string,
  project: ProjectRoot,
  now = new Date().toISOString(),
): void {
  const paths = projectPaths(root)
  try {
    fs.mkdirSync(paths.root, { recursive: true })
    fs.mkdirSync(paths.assetsDir, { recursive: true })
    fs.mkdirSync(paths.designDir, { recursive: true })
    fs.mkdirSync(paths.mdtDir, { recursive: true })
  } catch (err) {
    throw new ProjectStoreError(
      'disk',
      `cannot create project directories: ${(err as Error).message}`,
      paths.root,
    )
  }
  const doc = { ...project, schemaVersion: SCHEMA_VERSION, updatedAt: now }
  const json = JSON.stringify(doc, null, 2) + '\n'
  try {
    atomicWriteFileSync(paths.projectFile, json)
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    const reason: SaveErrorReason =
      e.code === 'EACCES' || e.code === 'EPERM'
        ? 'readonly'
        : e.code === 'ENOSPC'
          ? 'disk'
          : 'unknown'
    throw new ProjectStoreError(reason, `failed to save project: ${e.message}`, paths.projectFile)
  }
}

/**
 * Save-as: copy the whole project directory to a new root and persist the
 * model there (P05.10 "save as"). Assets are copied; MDT-private state is
 * not (a new project instance owns its autosave/recovery/lock).
 */
export function saveProjectAs(fromRoot: string, toRoot: string, project: ProjectRoot): void {
  if (path.resolve(fromRoot) === path.resolve(toRoot)) {
    saveProject(toRoot, project)
    return
  }
  const from = projectPaths(fromRoot)
  const to = projectPaths(toRoot)
  fs.mkdirSync(to.assetsDir, { recursive: true })
  fs.mkdirSync(to.designDir, { recursive: true })
  fs.mkdirSync(to.mdtDir, { recursive: true })
  copyDirContents(from.assetsDir, to.assetsDir)
  if (fs.existsSync(from.designDir)) copyDirContents(from.designDir, to.designDir)
  saveProject(toRoot, project)
}

function copyDirContents(from: string, to: string): void {
  if (!fs.existsSync(from)) return
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name)
    const dst = path.join(to, entry.name)
    if (entry.isDirectory()) {
      fs.mkdirSync(dst, { recursive: true })
      copyDirContents(src, dst)
    } else {
      fs.copyFileSync(src, dst)
    }
  }
}
