import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { emptyProject } from '@mdt/schema/testing'

import { looksLikeProject, projectPaths } from '../src/layout'
import {
  ProjectStoreError,
  createProject,
  openProject,
  saveProject,
  saveProjectAs,
} from '../src/store'

let tmp: string
let root: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'mdt-store-'))
  root = join(tmp, 'proj')
})

afterEach(() => {
  // make sure a read-only project file never blocks temp cleanup
  try {
    chmodSync(projectPaths(root).projectFile, 0o666)
  } catch {
    /* best effort */
  }
  rmSync(tmp, { recursive: true, force: true })
})

describe('saveProjectAs branches (P05.10)', () => {
  it('saving to the same root short-circuits into a plain save', () => {
    const project = createProject(root, 'Demo')
    project.name = 'Renamed In Place'
    saveProjectAs(root, join(root, '..', 'proj'), project) // resolves to the same dir
    const opened = openProject(root)
    expect(opened.parse.ok).toBe(true)
    expect(looksLikeProject(root)).toBe(true)
    const doc = JSON.parse(readFileSync(projectPaths(root).projectFile, 'utf8')) as {
      name: string
    }
    expect(doc.name).toBe('Renamed In Place')
  })

  it('copies nested asset directories and tolerates a missing design dir', () => {
    const project = createProject(root, 'Demo')
    mkdirSync(join(root, 'assets', 'icons', 'brand'), { recursive: true })
    writeFileSync(join(root, 'assets', 'icons', 'brand', 'logo.png'), 'png-bytes')
    writeFileSync(join(root, 'assets', 'top.bin'), 'top-bytes')
    rmSync(projectPaths(root).designDir, { recursive: true, force: true })
    const other = join(tmp, 'copy-target')
    saveProjectAs(root, other, project)
    // nested asset files survive the copy
    expect(readFileSync(join(other, 'assets', 'icons', 'brand', 'logo.png'), 'utf8')).toBe(
      'png-bytes',
    )
    expect(readFileSync(join(other, 'assets', 'top.bin'), 'utf8')).toBe('top-bytes')
    // the reserved design dir is recreated empty by the save, not copied
    expect(existsSync(join(other, 'design'))).toBe(true)
    expect(openProject(other).parse.ok).toBe(true)
  })
})

describe('ProjectStoreError reasons', () => {
  it('a FILE in place of the project dir is a "disk" error (directories cannot be created)', () => {
    const project = emptyProject()
    const blocked = join(tmp, 'blocked')
    writeFileSync(blocked, 'not a directory')
    try {
      saveProject(blocked, project)
      expect.unreachable('saveProject should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ProjectStoreError)
      const e = err as ProjectStoreError
      expect(e.reason).toBe('disk')
      expect(e.path).toBe(blocked)
      expect(e.message).toContain('cannot create project directories')
    }
  })

  it('an undeletable target (directory in place of the file) is a "readonly" error', () => {
    const project = createProject(root, 'Demo')
    const paths = projectPaths(root)
    if (process.platform === 'win32') {
      // Windows cannot chmod a directory unwritable; instead put a DIRECTORY
      // in place of the target file — the atomic write's remove-then-rename
      // hits EPERM (libuv maps "access denied" to EPERM), reported as readonly
      rmSync(paths.projectFile)
      mkdirSync(paths.projectFile)
      try {
        saveProject(root, project)
        expect.unreachable('saveProject should have thrown')
      } catch (err) {
        const e = err as ProjectStoreError
        expect(e.reason).toBe('readonly')
        expect(e.path).toBe(paths.projectFile)
        expect(e.message).toContain('failed to save project')
      }
      expect(existsSync(paths.projectFile)).toBe(true)
      return
    }
    // POSIX: read-only directory → mkdir of a pruned subdirectory fails →
    // typed "disk" error. createProject() above already made every layout
    // dir, and mkdirSync(recursive) no-ops on existing dirs — drop .mdt so
    // saveProject must genuinely create it inside the read-only root.
    chmodSync(root, 0o500)
    rmSync(paths.mdtDir, { recursive: true, force: true })
    try {
      saveProject(root, project)
      expect.unreachable('saveProject should have thrown')
    } catch (err) {
      expect((err as ProjectStoreError).reason).toBe('disk')
    } finally {
      chmodSync(root, 0o700)
    }
  })
})
