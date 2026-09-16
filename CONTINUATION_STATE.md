# EXECUTION_STATE=INCOMPLETE_CONTINUE_REQUIRED

## OPEN_SET — 1 item remaining (PRECISE)

### CI pptx-engine: schema-safe-patches-wave2.test.ts "the gate sees malformed raw parts and .rels"
Fails on CI (Windows + Ubuntu) because the wasm xmllint fallback reports errors differently from system xmllint.

DEBUG: The test calls validatePptx(bytes) on a pptx with malformed XML and expects problems.length > 0. With the wasm fallback, validatePptx returns an empty problems array. This means the wasm validateXML either:
a) Returns valid=true for XML that system xmllint considers invalid (different libxml2 version/strictness)
b) Returns errors but the stderr format doesn't match the parser regex

FIX APPROACH:
1. Add a debug log in runXmllint's wasm path: console.log('WASM_RESULT', JSON.stringify(result))
2. Run npm run test -w @genoffice/pptx-engine locally with system xmllint hidden (PATH stripped)
3. Compare the wasm error output to system xmllint's output for the same input
4. Adapt the format in wasmErrorText or the parser in validate-pptx.mjs
5. If the wasm libxml2 version has different validation strictness, consider upgrading xmllint-wasm or embedding a newer libxml2

## ALL OTHER GATES GREEN
- Release v1.0.1-rc.11: SUCCESS with 8 assets (win exe, mac dmg, linux AppImage+deb, SBOM, checksums, source archives)
- E2E: 5 specs green
- lint: 0/0
- 310/310 tasks DONE
- Security review: docs/release/SECURITY_REVIEW.md
- Metadata: MDT repo
- Real Pi + real Codex acceptance: PASS
