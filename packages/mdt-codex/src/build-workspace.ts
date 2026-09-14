/**
 * Build workspace isolation + build lifecycle (tasklist P10.07, P10.11,
 * P10.12, P10.13, P10.16).
 *
 * Every build runs in the generated project's OWN git repository:
 *  - prepare: verify clean-enough tree, remember the last-known-good commit
 *  - build: Codex works on a dedicated branch (`mdt-build/<id>`)
 *  - apply: only after quality gates pass — fast-forward main to the build
 *  - rollback: reset main to the previous known-good commit
 * A failed build can never pollute last-known-good (P10.12).
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkspaceError'
  }
}

function git(root: string, args: string[]): string {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
  } catch (err) {
    const e = err as { stderr?: string; message: string }
    throw new WorkspaceError(
      `git ${args[0]} failed: ${(e.stderr ?? e.message).trim().slice(0, 300)}`,
    )
  }
}

export interface PreparedWorkspace {
  root: string
  branch: string
  /** commit the build started from (last known good) */
  baseCommit: string
  alreadyInitialized: boolean
}

/** Ensure the generated project is a git repo and create the build branch. */
export function prepareWorkspace(root: string, buildId: string): PreparedWorkspace {
  if (!fs.existsSync(root)) throw new WorkspaceError(`workspace ${root} does not exist`)
  const gitDir = path.join(root, '.git')
  const alreadyInitialized = fs.existsSync(gitDir)
  if (!alreadyInitialized) {
    git(root, ['init', '--initial-branch', 'main'])
    git(root, ['config', 'user.email', 'build@metis.local'])
    git(root, ['config', 'user.name', 'MDT Build'])
    git(root, ['add', '-A'])
    const hasHead = git(root, ['rev-list', '-n', '1', '--all']).length > 0
    if (!hasHead) git(root, ['commit', '-m', 'chore: initial MDT scaffold', '--allow-empty'])
  }
  const branch = `mdt-build/${buildId}`
  git(root, ['checkout', '-b', branch])
  return { root, branch, baseCommit: git(root, ['rev-parse', 'HEAD']), alreadyInitialized }
}

/** git diff --stat between the build base and the working tree (P10.11). */
export function diffSummary(workspace: PreparedWorkspace): { changed: string[]; stat: string } {
  const stat = git(workspace.root, ['diff', '--stat', workspace.baseCommit])
  const nameOnly = git(workspace.root, ['diff', '--name-only', workspace.baseCommit])
  return { changed: nameOnly.split('\n').filter(Boolean), stat }
}

/** Commit the build result on its branch; returns the build commit sha.
 * A turn that changed nothing resolves to the base commit — the scaffold
 * itself passed the gates, so the build still applies (with an empty diff). */
export function commitBuild(workspace: PreparedWorkspace, message: string): string {
  git(workspace.root, ['add', '-A'])
  const nothing = git(workspace.root, ['status', '--porcelain'])
  if (nothing.length === 0) return workspace.baseCommit
  git(workspace.root, ['commit', '-m', message])
  return git(workspace.root, ['rev-parse', 'HEAD'])
}

/**
 * Apply a successful build: fast-forward `main` to the build commit and
 * record it as known-good with a tag. Refuses when main has diverged from
 * the build base (someone edited while building) — returns the conflict.
 */
export function applyBuild(
  workspace: PreparedWorkspace,
  buildCommit: string,
  buildId: string,
): { ok: boolean; error?: string; knownGoodTag?: string } {
  git(workspace.root, ['checkout', 'main'])
  const mainHead = git(workspace.root, ['rev-parse', 'HEAD'])
  if (mainHead !== workspace.baseCommit) {
    git(workspace.root, ['checkout', workspace.branch])
    return { ok: false, error: 'main advanced during the build; resolve manually' }
  }
  git(workspace.root, ['merge', '--ff-only', buildCommit])
  const tag = `mdt-known-good/${buildId}`
  git(workspace.root, ['tag', tag, buildCommit])
  git(workspace.root, ['branch', '-d', workspace.branch])
  return { ok: true, knownGoodTag: tag }
}

/**
 * Roll back to the newest known-good commit (P10.13). Uses the tag history
 * (`mdt-known-good/*`) when present, otherwise the previous commit.
 */
export function rollbackBuild(root: string): { ok: boolean; revertedTo?: string; error?: string } {
  try {
    git(root, ['checkout', 'main'])
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  const tags = git(root, ['tag', '--list', 'mdt-known-good/*', '--sort=-creatordate'])
    .split('\n')
    .filter(Boolean)
  let target: string | undefined
  if (tags.length >= 1) {
    // the newest tag may BE the bad build; fall back one when so
    const newest = tags[0]
    const newestSha = git(root, ['rev-list', '-n', '1', newest])
    const head = git(root, ['rev-parse', 'HEAD'])
    target = newestSha === head ? tags[1] : newest
    if (!target) {
      // only one tag exists and head equals it — revert one commit
      target = git(root, ['rev-parse', 'HEAD~1'])
    }
  } else {
    try {
      target = git(root, ['rev-parse', 'HEAD~1'])
    } catch {
      return { ok: false, error: 'nothing to roll back to' }
    }
  }
  const sha = target.startsWith('mdt-known-good/')
    ? git(root, ['rev-list', '-n', '1', target])
    : target
  git(root, ['reset', '--hard', sha])
  return { ok: true, revertedTo: sha }
}

/** Return to main after a discarded/failed build, deleting its branch. */
export function discardBuild(workspace: PreparedWorkspace): void {
  git(workspace.root, ['checkout', 'main'])
  try {
    git(workspace.root, ['branch', '-D', workspace.branch])
  } catch {
    // branch may already be gone
  }
}
