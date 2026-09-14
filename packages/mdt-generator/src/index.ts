/**
 * Public surface of @mdt/generator (P11).
 */
export {
  generateProject,
  writeProject,
  generateAndWrite,
  templateDirFor,
  GENERATOR_VERSION,
} from './generator'
export { lintBlueprint, blueprintToProject } from './lint'
export { builderPrompt } from './prompt'
export { planFrontend } from './emit/pages'
export { BUNDLED_CAPABILITY_IDS, emitServer } from './emit/server'
export { GeneratorRefusedError } from './types'
export type {
  BlueprintIssue,
  CopiedAsset,
  GenerateOptions,
  GeneratedFile,
  GenerationResult,
  LintReport,
  MdtSourceMap,
  PatchConflict,
  SourceMapEntry,
} from './types'
