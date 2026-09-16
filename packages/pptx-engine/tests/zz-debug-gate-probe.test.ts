/**
 * TEMPORARY CI diagnostic probe — delete before final commit.
 * Captures what the xmllint runner actually sees on CI (both the system
 * binary and the wasm fallback) for a malformed XML part.
 */
import { describe, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { runXmllint, xmllintRunnerAvailable } from '../../../tools/ooxml-validate/xmllint-runner.mjs'

describe('CI xmllint probe', () => {
  it('reports raw xmllint behavior for malformed xml', async () => {
    const log = (...args: unknown[]) => console.error('[gate-probe]', ...args)
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-probe-'))
    const bad = path.join(tmp, 'raw__ppt__slides__slide1.xml')
    fs.writeFileSync(
      bad,
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<root><child>text</child></a:oops></root>',
    )

    const version = spawnSync('xmllint', ['--version'], { encoding: 'utf8' })
    log('spawn xmllint --version status=%j error=%j stdout=%j stderr=%j', version.status, version.error, version.stdout, version.stderr)
    const where = spawnSync('where', ['xmllint'], { encoding: 'utf8' })
    log('where xmllint status=%j stdout=%j stderr=%j', where.status, where.stdout, where.stderr)
    log('xmllintRunnerAvailable=%j PATH=%j TMP=%j TEMP=%j', xmllintRunnerAvailable(), process.env.PATH, process.env.TMP, process.env.TEMP)

    const direct = spawnSync('xmllint', ['--noout', '--nonet', bad], { encoding: 'utf8' })
    log('direct system run status=%j error=%j stdout=%j stderr=%j', direct.status, direct.error, direct.stdout, direct.stderr)

    const runner = await runXmllint(['--noout', '--nonet', bad])
    log('runXmllint result status=%j stdout=%j stderr=%j', runner.status, runner.stdout, runner.stderr)

    const m = /^(.*?):(\d+): (.*)$/.exec((runner.stderr ?? '').split(/\r?\n/)[0] ?? '')
    log('first-line regex match=%j', m)

    fs.rmSync(tmp, { recursive: true, force: true })
    // Deliberate failure so the diagnostics above are always printed in CI logs.
    throw new Error(
      'GATE-PROBE ' +
        JSON.stringify({
          versionStatus: version.status,
          versionErr: version.error?.['code'] ?? null,
          whereStdout: where.stdout,
          available: xmllintRunnerAvailable(),
          direct: { status: direct.status, error: direct.error?.['code'] ?? null, stderr: direct.stderr },
          runner: { status: runner.status, stderr: runner.stderr },
          regexMatch: m,
        }),
    )
  })
})
