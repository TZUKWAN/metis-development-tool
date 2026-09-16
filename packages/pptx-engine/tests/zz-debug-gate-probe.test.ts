/**
 * TEMPORARY CI diagnostic probe — delete before final commit.
 * Captures what the gate actually sees on CI: the system xmllint presence,
 * its raw stderr format for a malformed part, and whether validatePptx
 * (wasm-first runner) maps the parse errors back to parts.
 */
import { describe, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import JSZip from 'jszip'
import { validatePptx } from '../../../tools/ooxml-validate/validate-pptx.mjs'

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
    const where = spawnSync('where', ['xmllint'], { encoding: 'utf8' })
    const direct = spawnSync('xmllint', ['--noout', '--nonet', bad], { encoding: 'utf8' })

    const zip = new JSZip()
    zip.file(
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    )
    zip.file(
      'ppt/slides/slide1.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld/></p:sld>'.replace(
        '</p:sld>',
        '</p:cSld></p:sld></p:oops>',
      ),
    )
    zip.file(
      'ppt/slides/_rels/slide1.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="x<y"/></Relationships>',
    )
    const problems = await validatePptx(await zip.generateAsync({ type: 'uint8array' }))
    fs.rmSync(tmp, { recursive: true, force: true })

    log('probe data follows')
    // Deliberate failure so the diagnostics are always printed in CI logs.
    throw new Error(
      'GATE-PROBE ' +
        JSON.stringify({
          versionStatus: version.status,
          versionError: version.error?.message ?? null,
          versionOut: [version.stdout, version.stderr],
          whereStatus: where.status,
          whereOut: where.stdout,
          direct: {
            status: direct.status,
            error: direct.error?.message ?? null,
            stderr: direct.stderr,
          },
          problems,
        }),
    )
  })
})
