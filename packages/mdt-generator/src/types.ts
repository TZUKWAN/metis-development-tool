/**
 * Public types of the MDT generator (P11.01–P11.22).
 */
import type { BuildBlueprint } from '@mdt/schema'
import type { CapabilityManifest } from '@mdt/capabilities'

/** One deterministic text file of the generated project. */
export interface GeneratedFile {
  /** posix-style relative path inside the generated project */
  path: string
  content: string
  /** true for files that should carry the executable bit on unix */
  executable?: boolean
}

/** Binary asset copy performed at write time (content never enters `files`). */
export interface CopiedAsset {
  /** absolute source path (inside the MDT project root) */
  from: string
  /** absolute destination path inside the generated app */
  to: string
}

/**
 * Design↔source mapping (P11.18): every MDT id → the generated file (and a
 * symbol / line hint) that implements it.
 */
export interface SourceMapEntry {
  kind:
    | 'page'
    | 'overlay'
    | 'element'
    | 'agent'
    | 'capability'
    | 'capability-instance'
    | 'variable'
    | 'binding'
    | 'interaction'
    | 'asset'
  file: string
  symbol?: string
  /** 1-based line hint, computed deterministically from emitted content */
  line?: number
}

export interface MdtSourceMap {
  blueprintHash: string
  entries: Record<string, SourceMapEntry>
}

/** A generator-owned file that was modified locally and got overwritten (P11.19). */
export interface PatchConflict {
  path: string
  reason: 'generator-owned file was modified locally; regenerated content restored'
  previousDiskHash: string
}

export interface GenerateOptions {
  /** capability manifests by registry id (drives tools + arg linting) */
  capabilityManifests: Map<string, CapabilityManifest>
  /** output directory (created if missing); generation is refused on lint errors */
  outDir: string
  /**
   * MDT project root containing `assets/<hash>` files for binary copies.
   * Omitted asset sources are reported as warnings, never failures.
   */
  projectRoot?: string
  /** base scaffold; defaults to the bundled `templates/web-agent` */
  templateDir?: string
}

export interface GenerationResult {
  /** deterministic text files, sorted by path */
  files: GeneratedFile[]
  /** binary assets read from `options.projectRoot` and copied at write time */
  copiedAssets: CopiedAsset[]
  map: MdtSourceMap
  /** generator-owned files that had local modifications (overwritten) */
  conflicts: PatchConflict[]
  /** non-fatal notes (missing asset sources, unbundled capabilities, …) */
  warnings: string[]
}

/** Thrown by `generateProject` when `lintBlueprint` finds error-severity issues (P11.22). */
export class GeneratorRefusedError extends Error {
  readonly issues: BlueprintIssue[]
  constructor(issues: BlueprintIssue[]) {
    super(
      `generation refused: ${issues.filter((i) => i.severity === 'error').length} lint error(s):\n` +
        issues
          .filter((i) => i.severity === 'error')
          .map((i) => `  - [${i.code}] ${i.path}: ${i.message}`)
          .join('\n'),
    )
    this.name = 'GeneratorRefusedError'
    this.issues = issues
  }
}

export interface BlueprintIssue {
  code: string
  severity: 'error' | 'warning'
  /** JSON-ish path into the blueprint, e.g. `interactions[2].action.agentId` */
  path: string
  message: string
}

export interface LintReport {
  ok: boolean
  issues: BlueprintIssue[]
}

export type { BuildBlueprint, CapabilityManifest }
