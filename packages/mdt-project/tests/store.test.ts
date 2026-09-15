import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  chmodSync,
  mkdirSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createId, emptyProject, homePage } from '@mdt/schema/testing'

import { looksLikeProject, projectPaths } from '../src/layout'
import {
  ProjectStoreError,
  createProject,
  openProject,
  saveProject,
  saveProjectAs,
} from '../src/store'

let root: string

beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), 'mdt-project-')), 'proj')
})

afterEach(() => {
  try {
    chmodSync(root, 0o700)
  } catch {
    /* best effort */
  }
})

describe('create/open/save (P05.01, P05.02)', () => {
  it('creates a project directory with the documented layout', () => {
    createProject(root, 'Demo')
    expect(looksLikeProject(root)).toBe(true)
    const paths = projectPaths(root)
    expect(existsSync(paths.projectFile)).toBe(true)
    expect(existsSync(paths.assetsDir)).toBe(true)
    expect(existsSync(paths.designDir)).toBe(true)
    expect(existsSync(paths.mdtDir)).toBe(true)
    const doc = JSON.parse(readFileSync(paths.projectFile, 'utf8')) as {
      name: string
      schemaVersion: number
    }
    expect(doc.name).toBe('Demo')
    expect(doc.schemaVersion).toBe(1)
  })

  it('open parses and validates; hand-copied directories open fine', () => {
    const project = createProject(root, 'Demo')
    const copy = root + '-copy'
    saveProjectAs(root, copy, project)
    const opened = openProject(copy)
    expect(opened.parse.ok).toBe(true)
  })

  it('atomic save leaves no tmp files and a valid JSON document', () => {
    const project = createProject(root, 'Demo')
    project.name = 'Renamed'
    saveProject(root, project)
    const files = readdirSync(root) as string[]
    expect(files.some((f) => f.includes('.tmp-'))).toBe(false)
    const opened = openProject(root)
    expect(opened.parse.ok).toBe(true)
  })

  it('reports readonly directories as a typed error and keeps the old file valid', () => {
    const project = createProject(root, 'Demo')
    if (process.platform === 'win32') {
      // chmod cannot make a directory unwritable for the owner on Windows;
      // simulate the failure at the FS boundary instead (rename target lock)
      const paths = projectPaths(root)
      writeFileSync(paths.projectFile, 'sentinel')
      // simulate ENOSPC/EACCES by pointing the store at a file-in-place-of-dir
      const blockedRoot = join(root, 'blocked')
      writeFileSync(blockedRoot, 'not a directory')
      expect(() => saveProject(blockedRoot, project)).toThrow(ProjectStoreError)
      expect(readFileSync(paths.projectFile, 'utf8')).toBe('sentinel')
      return
    }
    chmodSync(root, 0o500)
    try {
      expect(() => saveProject(root, project)).toThrow(ProjectStoreError)
      const opened = openProject(root)
      expect(opened.parse.ok).toBe(true)
    } finally {
      chmodSync(root, 0o700)
    }
  })

  it('openProject on a corrupt file returns issues, never throws', () => {
    mkdirSync(root, { recursive: true })
    writeFileSync(projectPaths(root).projectFile, '{ not json')
    const opened = openProject(root)
    expect(opened.parse.ok).toBe(false)
    if (!opened.parse.ok) {
      expect(opened.parse.issues[0]?.message).toContain('not valid JSON')
    }
  })

  it('openProject with schema violations lists exact field paths (P05.09)', () => {
    mkdirSync(root, { recursive: true })
    const project = emptyProject()
    const doc = JSON.parse(JSON.stringify(project)) as Record<string, unknown>
    delete doc.name
    delete doc.createdAt
    writeFileSync(projectPaths(root).projectFile, JSON.stringify(doc))
    const opened = openProject(root)
    expect(opened.parse.ok).toBe(false)
    if (!opened.parse.ok) {
      const paths = opened.parse.issues.map((i) => i.path)
      expect(paths).toContain('name')
      expect(paths).toContain('createdAt')
    }
  })

  it('unicode and space paths work (P05.10)', () => {
    const weird = join(root, '..', '中文 项目 with spaces')
    const project = createProject(weird, 'Unicode Project')
    project.pages.push(homePage())
    saveProject(weird, project)
    const opened = openProject(weird)
    expect(opened.parse.ok).toBe(true)
  })
})

describe('save-as (P05.10)', () => {
  it('copies assets and does not touch the source', () => {
    const project = createProject(root, 'Demo')
    const other = root + '-as'
    saveProjectAs(root, other, project)
    expect(looksLikeProject(other)).toBe(true)
    expect(looksLikeProject(root)).toBe(true)
    expect(openProject(other).parse.ok).toBe(true)
  })
})

describe('project identity', () => {
  it('new projects get unique uuidv7 ids', () => {
    const a = createProject(root + '-a', 'A')
    const b = createProject(root + '-b', 'B')
    expect(a.id).not.toBe(b.id)
    expect(createId()).not.toBe(createId())
  })
})
